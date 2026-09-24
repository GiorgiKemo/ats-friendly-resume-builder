-- Keep the AAL2 decision helper private; the exposed RPCs remain the only
-- callable interface for operator capabilities and PII access.
CREATE OR REPLACE FUNCTION private.current_admin_session_is_aal2()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.current_auth_session_is_active()
    AND auth.jwt() ->> 'aal' = 'aal2';
$$;

REVOKE ALL ON FUNCTION private.current_admin_session_is_aal2()
  FROM PUBLIC, anon, authenticated, service_role;

DO $migration$
DECLARE
  target regprocedure;
  definition text;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'public.is_support_operator()'::regprocedure,
    'public.is_knowledge_manager()'::regprocedure,
    'public.admin_list_user_directory(text, timestamptz, uuid, integer)'::regprocedure
  ] LOOP
    definition := pg_catalog.pg_get_functiondef(target);
    IF pg_catalog.strpos(definition, 'public.current_admin_session_is_aal2()') = 0 THEN
      RAISE EXCEPTION 'Expected an AAL2 check in %', target;
    END IF;
    EXECUTE pg_catalog.replace(
      definition,
      'public.current_admin_session_is_aal2()',
      'private.current_admin_session_is_aal2()'
    );
  END LOOP;
END;
$migration$;

DROP FUNCTION public.current_admin_session_is_aal2();
