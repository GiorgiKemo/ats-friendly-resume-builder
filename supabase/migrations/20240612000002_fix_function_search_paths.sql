-- Fix function search paths to prevent search path injection attacks

-- Use DO block to handle errors gracefully
DO $$
DECLARE
  func_exists boolean;
BEGIN
  -- Update handle_new_user function
  SELECT EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'handle_new_user') INTO func_exists;
  IF func_exists THEN
    EXECUTE 'ALTER FUNCTION public.handle_new_user() SET search_path = public';
  END IF;

  -- Update get_resume_with_content function
  SELECT EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'get_resume_with_content') INTO func_exists;
  IF func_exists THEN
    EXECUTE 'ALTER FUNCTION public.get_resume_with_content(uuid) SET search_path = public';
  END IF;

  -- Update save_resume function
  SELECT EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'save_resume') INTO func_exists;
  IF func_exists THEN
    EXECUTE 'ALTER FUNCTION public.save_resume(uuid,text,text,text,text,boolean,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,uuid) SET search_path = public';
  END IF;

  -- Update delete_resume function
  SELECT EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'delete_resume') INTO func_exists;
  IF func_exists THEN
    EXECUTE 'ALTER FUNCTION public.delete_resume(uuid,uuid) SET search_path = public';
  END IF;

  -- Update save_user_profile function
  SELECT EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'save_user_profile') INTO func_exists;
  IF func_exists THEN
    EXECUTE 'ALTER FUNCTION public.save_user_profile(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) SET search_path = public';
  END IF;

  -- Update get_user_profile function
  SELECT EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'get_user_profile') INTO func_exists;
  IF func_exists THEN
    EXECUTE 'ALTER FUNCTION public.get_user_profile(uuid) SET search_path = public';
  END IF;

  -- Update check_premium_status function
  SELECT EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'check_premium_status') INTO func_exists;
  IF func_exists THEN
    EXECUTE 'ALTER FUNCTION public.check_premium_status() SET search_path = public';
  END IF;

  -- Update track_ai_generation_secure function
  SELECT EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'track_ai_generation_secure') INTO func_exists;
  IF func_exists THEN
    EXECUTE 'ALTER FUNCTION public.track_ai_generation_secure() SET search_path = public';
  END IF;

  -- Update get_remaining_ai_generations function
  SELECT EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'get_remaining_ai_generations') INTO func_exists;
  IF func_exists THEN
    EXECUTE 'ALTER FUNCTION public.get_remaining_ai_generations() SET search_path = public';
  END IF;

  -- Update check_resume_exists function
  SELECT EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'check_resume_exists') INTO func_exists;
  IF func_exists THEN
    EXECUTE 'ALTER FUNCTION public.check_resume_exists(uuid) SET search_path = public';
  END IF;

  -- Update handle_user_update function
  SELECT EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'handle_user_update') INTO func_exists;
  IF func_exists THEN
    EXECUTE 'ALTER FUNCTION public.handle_user_update() SET search_path = public';
  END IF;

  -- Update update_updated_at_column function
  SELECT EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') INTO func_exists;
  IF func_exists THEN
    EXECUTE 'ALTER FUNCTION public.update_updated_at_column() SET search_path = public';
  END IF;

  -- Update validate_premium_user function
  SELECT EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'validate_premium_user') INTO func_exists;
  IF func_exists THEN
    EXECUTE 'ALTER FUNCTION public.validate_premium_user() SET search_path = public';
  END IF;

  -- Update fix_premium_users_without_stripe function
  SELECT EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'fix_premium_users_without_stripe') INTO func_exists;
  IF func_exists THEN
    EXECUTE 'ALTER FUNCTION public.fix_premium_users_without_stripe() SET search_path = public';
  END IF;
END
$$;
