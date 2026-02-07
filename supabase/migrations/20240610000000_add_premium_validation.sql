-- Add validation to ensure premium users always have a Stripe customer ID

-- Create a function to validate premium users
CREATE OR REPLACE FUNCTION validate_premium_user()
RETURNS TRIGGER AS $$
BEGIN
  -- If setting user to premium, ensure they have a Stripe customer ID
  IF NEW.is_premium = true AND (NEW.stripe_customer_id IS NULL OR NEW.stripe_customer_id = '') THEN
    -- Log the issue for monitoring (optional, as EXCEPTION will halt)
    -- RAISE WARNING 'Attempted to set user % to premium without a Stripe customer ID', NEW.id;
    
    -- Two options:
    -- 1. Prevent the update (strict validation)
    RAISE EXCEPTION 'Cannot set user to premium without a Stripe customer ID';
    
    -- 2. Allow the update but log it (soft validation) - system_logs reference removed
    -- This is useful during development or for manual admin operations
    -- INSERT INTO system_logs (...) - Reference removed
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to validate premium users
DROP TRIGGER IF EXISTS validate_premium_user_trigger ON users;
CREATE TRIGGER validate_premium_user_trigger
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION validate_premium_user();

-- Create a function to fix premium users without Stripe customer IDs
CREATE OR REPLACE FUNCTION fix_premium_users_without_stripe()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  fixed BOOLEAN,
  message TEXT
) AS $$
DECLARE
  rec RECORD;
BEGIN
  -- Find all premium users without a Stripe customer ID
  FOR rec IN
    SELECT id, email
    FROM users
    WHERE is_premium = true
    AND (stripe_customer_id IS NULL OR stripe_customer_id = '')
  LOOP
    -- Return the user information
    user_id := rec.id;
    email := rec.email;
    fixed := false;
    message := 'Premium user without Stripe customer ID';
    RETURN NEXT;
  END LOOP;
  
  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
