-- Correct error handling in handle_new_user trigger function.
-- Ensures that if inserting into public.users fails, the entire transaction fails.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_full_name TEXT;
  v_avatar_url TEXT;
BEGIN
  -- Using NOTICE for debugging, can be removed or reduced in production.
  RAISE NOTICE '[handle_new_user] Triggered for new auth.users.id: %, email: %', NEW.id, NEW.email;
  RAISE NOTICE '[handle_new_user] Raw user meta data: %', NEW.raw_user_meta_data;

  v_full_name := NEW.raw_user_meta_data->>'full_name';
  v_avatar_url := NEW.raw_user_meta_data->>'avatar_url';

  RAISE NOTICE '[handle_new_user] Parsed full_name: "%", avatar_url: "%"', v_full_name, v_avatar_url;

  BEGIN
    INSERT INTO public.users (id, email, full_name, avatar_url, is_premium, ai_generations_limit)
    VALUES (NEW.id, NEW.email, v_full_name, v_avatar_url, false, 0);
    RAISE NOTICE '[handle_new_user] INSERT into public.users successful for ID: %', NEW.id;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING '[handle_new_user] ERROR during INSERT into public.users for ID % (Email: %): % - %', NEW.id, NEW.email, SQLSTATE, SQLERRM;
      -- Re-raise the error to ensure the calling transaction (the user signup) also fails clearly.
      RAISE;
  END;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public; -- Ensure search_path is explicitly set for SECURITY DEFINER

COMMENT ON FUNCTION public.handle_new_user() IS 'Handles new user creation by populating the public.users table. Re-raises exceptions on failure.';
