-- Fresh installs may not have the historical snapshot-only RPCs yet.
-- Their definitions and final grants are restored by 20260904131924.
-- Existing deployments retain exactly the original grant/revoke operations.
DO $migration$
BEGIN
  IF to_regprocedure('public.check_resume_exists(uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.check_resume_exists(uuid) FROM PUBLIC;
  END IF;
  IF to_regprocedure('public.check_resume_exists(uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.check_resume_exists(uuid) FROM anon;
  END IF;
  IF to_regprocedure('public.check_resume_exists(uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.check_resume_exists(uuid) FROM authenticated;
  END IF;
  IF to_regprocedure('public.check_resume_exists(uuid)') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.check_resume_exists(uuid) TO authenticated;
  END IF;
  IF to_regprocedure('public.delete_resume(uuid, uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.delete_resume(uuid, uuid) FROM PUBLIC;
  END IF;
  IF to_regprocedure('public.delete_resume(uuid, uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.delete_resume(uuid, uuid) FROM anon;
  END IF;
  IF to_regprocedure('public.delete_resume(uuid, uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.delete_resume(uuid, uuid) FROM authenticated;
  END IF;
  IF to_regprocedure('public.delete_resume(uuid, uuid)') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.delete_resume(uuid, uuid) TO authenticated;
  END IF;
  IF to_regprocedure('public.get_gmail_connection_status()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.get_gmail_connection_status() FROM PUBLIC;
  END IF;
  IF to_regprocedure('public.get_gmail_connection_status()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.get_gmail_connection_status() FROM anon;
  END IF;
  IF to_regprocedure('public.get_gmail_connection_status()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.get_gmail_connection_status() FROM authenticated;
  END IF;
  IF to_regprocedure('public.get_gmail_connection_status()') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.get_gmail_connection_status() TO authenticated;
  END IF;
  IF to_regprocedure('public.get_resume_with_content(uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.get_resume_with_content(uuid) FROM PUBLIC;
  END IF;
  IF to_regprocedure('public.get_resume_with_content(uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.get_resume_with_content(uuid) FROM anon;
  END IF;
  IF to_regprocedure('public.get_resume_with_content(uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.get_resume_with_content(uuid) FROM authenticated;
  END IF;
  IF to_regprocedure('public.get_resume_with_content(uuid)') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.get_resume_with_content(uuid) TO authenticated;
  END IF;
  IF to_regprocedure('public.get_user_profile(uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.get_user_profile(uuid) FROM PUBLIC;
  END IF;
  IF to_regprocedure('public.get_user_profile(uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.get_user_profile(uuid) FROM anon;
  END IF;
  IF to_regprocedure('public.get_user_profile(uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.get_user_profile(uuid) FROM authenticated;
  END IF;
  IF to_regprocedure('public.get_user_profile(uuid)') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.get_user_profile(uuid) TO authenticated;
  END IF;
  IF to_regprocedure('public.save_resume( uuid, text, text, text, text, boolean, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, uuid )') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.save_resume( uuid, text, text, text, text, boolean, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, uuid ) FROM PUBLIC;
  END IF;
  IF to_regprocedure('public.save_resume( uuid, text, text, text, text, boolean, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, uuid )') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.save_resume( uuid, text, text, text, text, boolean, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, uuid ) FROM anon;
  END IF;
  IF to_regprocedure('public.save_resume( uuid, text, text, text, text, boolean, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, uuid )') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.save_resume( uuid, text, text, text, text, boolean, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, uuid ) FROM authenticated;
  END IF;
  IF to_regprocedure('public.save_resume( uuid, text, text, text, text, boolean, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, uuid )') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.save_resume( uuid, text, text, text, text, boolean, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, uuid ) TO authenticated;
  END IF;
  IF to_regprocedure('public.save_user_profile( uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb )') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.save_user_profile( uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb ) FROM PUBLIC;
  END IF;
  IF to_regprocedure('public.save_user_profile( uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb )') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.save_user_profile( uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb ) FROM anon;
  END IF;
  IF to_regprocedure('public.save_user_profile( uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb )') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.save_user_profile( uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb ) FROM authenticated;
  END IF;
  IF to_regprocedure('public.save_user_profile( uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb )') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.save_user_profile( uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb ) TO authenticated;
  END IF;
  IF to_regprocedure('public.handle_new_user()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
  END IF;
  IF to_regprocedure('public.handle_new_user()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon;
  END IF;
  IF to_regprocedure('public.handle_new_user()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.handle_new_user() FROM authenticated;
  END IF;
  IF to_regprocedure('public.handle_user_update()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.handle_user_update() FROM PUBLIC;
  END IF;
  IF to_regprocedure('public.handle_user_update()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.handle_user_update() FROM anon;
  END IF;
  IF to_regprocedure('public.handle_user_update()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.handle_user_update() FROM authenticated;
  END IF;
  IF to_regprocedure('public.update_updated_at_column()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC;
  END IF;
  IF to_regprocedure('public.update_updated_at_column()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM anon;
  END IF;
  IF to_regprocedure('public.update_updated_at_column()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM authenticated;
  END IF;
END;
$migration$;
