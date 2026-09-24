-- Keep the Auth-session predicate out of PostgREST's exposed schema and preserve
-- the auth.sessions primary-key lookup by comparing UUID to UUID.
CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.current_auth_session_is_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH request_identity AS (
    SELECT
      auth.uid() AS user_id,
      CASE
        WHEN auth.jwt() ->> 'session_id' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
          THEN (auth.jwt() ->> 'session_id')::uuid
        ELSE NULL::uuid
      END AS session_id
  )
  SELECT EXISTS (
    SELECT 1
    FROM request_identity AS request
    JOIN auth.sessions AS session
      ON session.user_id = request.user_id
     AND session.id = request.session_id
    WHERE request.user_id IS NOT NULL
      AND request.session_id IS NOT NULL
      AND (session.not_after IS NULL OR session.not_after > pg_catalog.statement_timestamp())
  );
$$;

REVOKE ALL ON FUNCTION private.current_auth_session_is_active()
  FROM PUBLIC, anon, authenticated, service_role;

-- Update the existing RPC definitions in place so their ACLs, ownership,
-- search_path pins, and business logic remain unchanged.
DO $migration$
DECLARE
  target regprocedure;
  definition text;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'public.is_support_operator()'::regprocedure,
    'public.is_knowledge_manager()'::regprocedure,
    'public.support_prepare_attachment(uuid, uuid, text, text, text, bigint, timestamptz)'::regprocedure,
    'public.admin_list_user_directory(text, timestamptz, uuid, integer)'::regprocedure
  ] LOOP
    definition := pg_catalog.pg_get_functiondef(target);
    IF pg_catalog.strpos(definition, 'public.current_auth_session_is_active()') = 0 THEN
      RAISE EXCEPTION 'Expected an active-session call in %', target;
    END IF;
    EXECUTE pg_catalog.replace(
      definition,
      'public.current_auth_session_is_active()',
      'private.current_auth_session_is_active()'
    );
  END LOOP;
END;
$migration$;

DROP FUNCTION public.current_auth_session_is_active();
