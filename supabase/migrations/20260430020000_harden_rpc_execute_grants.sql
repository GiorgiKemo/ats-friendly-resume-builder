-- Tighten older RPC function grants surfaced by Supabase advisors.
-- Client-used RPCs remain callable by authenticated users; trigger/internal
-- helpers are not directly executable by public API roles.

ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;

REVOKE ALL ON FUNCTION public.check_resume_exists(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_resume_exists(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.check_resume_exists(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.check_resume_exists(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_resume(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_resume(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.delete_resume(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.delete_resume(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_gmail_connection_status() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_gmail_connection_status() FROM anon;
REVOKE ALL ON FUNCTION public.get_gmail_connection_status() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_gmail_connection_status() TO authenticated;

REVOKE ALL ON FUNCTION public.get_resume_with_content(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_resume_with_content(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_resume_with_content(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_resume_with_content(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_user_profile(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_profile(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_user_profile(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_profile(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.save_resume(
  uuid,
  text,
  text,
  text,
  text,
  boolean,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_resume(
  uuid,
  text,
  text,
  text,
  text,
  boolean,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  uuid
) FROM anon;
REVOKE ALL ON FUNCTION public.save_resume(
  uuid,
  text,
  text,
  text,
  text,
  boolean,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  uuid
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.save_resume(
  uuid,
  text,
  text,
  text,
  text,
  boolean,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  uuid
) TO authenticated;

REVOKE ALL ON FUNCTION public.save_user_profile(
  uuid,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_user_profile(
  uuid,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb
) FROM anon;
REVOKE ALL ON FUNCTION public.save_user_profile(
  uuid,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.save_user_profile(
  uuid,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb
) TO authenticated;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM authenticated;

REVOKE ALL ON FUNCTION public.handle_user_update() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_user_update() FROM anon;
REVOKE ALL ON FUNCTION public.handle_user_update() FROM authenticated;

REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM anon;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM authenticated;
