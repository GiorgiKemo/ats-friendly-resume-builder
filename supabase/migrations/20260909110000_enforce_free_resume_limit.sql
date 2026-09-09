-- Keep the Basic plan's advertised three-resume cap authoritative at the
-- database boundary. The client check is only a fast UX guard and cannot be
-- trusted for concurrent tabs or direct RPC callers.
CREATE OR REPLACE FUNCTION private.enforce_free_resume_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  account public.users%ROWTYPE;
  resume_count integer;
BEGIN
  SELECT u.* INTO account
  FROM public.users u
  WHERE u.id = NEW.user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Resume owner was not found' USING ERRCODE = '42501';
  END IF;

  IF coalesce(account.is_premium, false)
    AND (account.premium_until IS NULL OR account.premium_until > now()) THEN
    RETURN NEW;
  END IF;

  SELECT count(*)::integer INTO resume_count
  FROM public.resumes
  WHERE user_id = NEW.user_id;

  IF resume_count >= 3 THEN
    RAISE EXCEPTION 'FREE_RESUME_LIMIT'
      USING ERRCODE = 'P0001',
        HINT = 'Free plans can store up to 3 resumes. Upgrade to Premium or delete an existing resume.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_free_resume_limit_before_insert ON public.resumes;
CREATE TRIGGER enforce_free_resume_limit_before_insert
  BEFORE INSERT ON public.resumes
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_free_resume_limit();

REVOKE ALL ON FUNCTION private.enforce_free_resume_limit() FROM PUBLIC, anon, authenticated, service_role;
