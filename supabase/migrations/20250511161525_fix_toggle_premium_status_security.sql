-- Secure the toggle_premium_status function
-- This function allows toggling premium status. It should only be callable by an admin
-- or by a user for themselves (though self-toggling premium is unusual).
-- As a security measure, this fix restricts it to self-modification or by a supabase_admin.
-- A proper application admin role check would be a better long-term solution.

DROP FUNCTION IF EXISTS public.toggle_premium_status(UUID);

CREATE OR REPLACE FUNCTION public.toggle_premium_status(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_status BOOLEAN;
  new_status BOOLEAN;
  caller_uid UUID := auth.uid();
  is_superuser BOOLEAN := pg_has_role(caller_uid, 'supabase_admin', 'MEMBER'); -- Check if caller is a supabase superuser
BEGIN
  -- Security Check: Allow if the caller is modifying themselves OR if the caller is a supabase_admin.
  -- For a real application, replace 'supabase_admin' check with a check for a custom application admin role.
  IF p_user_id <> caller_uid AND NOT is_superuser THEN
    RAISE EXCEPTION 'Permission denied: You can only toggle your own premium status or must be an administrator.';
  END IF;

  -- Get the current premium status for the target user
  SELECT is_premium INTO current_status
  FROM public.users
  WHERE id = p_user_id;

  -- Toggle the status
  new_status := NOT COALESCE(current_status, false);

  -- Update the user record
  UPDATE public.users
  SET
    is_premium = new_status,
    premium_plan = CASE WHEN new_status THEN 'premium' ELSE NULL END,
    premium_until = CASE WHEN new_status THEN (NOW() + INTERVAL '30 days') ELSE NULL END,
    premium_updated_at = NOW(),
    ai_generations_limit = CASE WHEN new_status THEN 30 ELSE 0 END
  WHERE id = p_user_id;

  -- Return the new status
  RETURN new_status;
END;
$$;

COMMENT ON FUNCTION public.toggle_premium_status(UUID) IS 'Toggles the premium status for a user. Restricted to self-modification or by a supabase_admin. Consider proper admin role for production.';
