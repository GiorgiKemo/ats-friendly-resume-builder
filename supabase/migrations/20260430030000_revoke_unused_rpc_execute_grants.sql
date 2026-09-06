-- Fresh installs may not have the historical snapshot-only RPCs yet.
-- Their definitions and final grants are restored by 20260904131924.
-- Existing deployments retain exactly the original grant/revoke operations.
DO $migration$
BEGIN
  IF to_regprocedure('public.check_premium_status()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.check_premium_status() FROM authenticated;
  END IF;
  IF to_regprocedure('public.check_resume_exists(uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.check_resume_exists(uuid) FROM authenticated;
  END IF;
END;
$migration$;
