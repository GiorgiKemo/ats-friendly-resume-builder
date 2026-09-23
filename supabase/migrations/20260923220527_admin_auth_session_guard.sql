-- Supabase access tokens remain cryptographically valid until exp after sign-out.
-- Privileged admin APIs therefore verify the token's session row as well as its
-- signature and current admin membership.
CREATE OR REPLACE FUNCTION public.admin_auth_session_is_active(
  p_user_id uuid,
  p_session_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.sessions AS s
    WHERE s.id = p_session_id
      AND s.user_id = p_user_id
      AND (s.not_after IS NULL OR s.not_after > pg_catalog.statement_timestamp())
  );
$$;

REVOKE ALL ON FUNCTION public.admin_auth_session_is_active(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_auth_session_is_active(uuid, uuid)
  TO service_role;
