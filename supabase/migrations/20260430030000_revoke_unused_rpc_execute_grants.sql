-- These RPCs are no longer called by the client. Removing authenticated
-- execution reduces exposed SECURITY DEFINER surface area.

REVOKE ALL ON FUNCTION public.check_premium_status() FROM authenticated;
REVOKE ALL ON FUNCTION public.check_resume_exists(uuid) FROM authenticated;
