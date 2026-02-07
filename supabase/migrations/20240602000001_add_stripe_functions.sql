-- Create a function to check premium status
CREATE OR REPLACE FUNCTION check_premium_status()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_premium BOOLEAN;
BEGIN
  -- Get the premium status for the current user
  SELECT u.is_premium INTO is_premium
  FROM users u
  WHERE u.id = auth.uid();
  
  -- Return the premium status (false if no user found)
  RETURN COALESCE(is_premium, false);
END;
$$;

-- Update the toggle_premium_status function to include premium_plan and premium_updated_at
CREATE OR REPLACE FUNCTION toggle_premium_status(user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_status BOOLEAN;
  new_status BOOLEAN;
BEGIN
  -- Get the current premium status
  SELECT is_premium INTO current_status
  FROM users
  WHERE id = user_id;
  
  -- Toggle the status
  new_status := NOT COALESCE(current_status, false);
  
  -- Update the user record
  UPDATE users
  SET 
    is_premium = new_status,
    premium_plan = CASE WHEN new_status THEN 'premium' ELSE NULL END,
    premium_until = CASE WHEN new_status THEN (NOW() + INTERVAL '30 days') ELSE NULL END,
    premium_updated_at = NOW(),
    ai_generations_limit = CASE WHEN new_status THEN 30 ELSE 0 END
  WHERE id = user_id;
  
  -- Return the new status
  RETURN new_status;
END;
$$;

-- Create a function to track AI generation usage
CREATE OR REPLACE FUNCTION track_ai_generation_secure()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_id UUID;
  current_used INTEGER;
  current_limit INTEGER;
  is_premium BOOLEAN;
BEGIN
  -- Get the current user ID
  user_id := auth.uid();
  
  -- Get the current user's premium status and AI generation counts
  SELECT 
    u.is_premium,
    COALESCE(u.ai_generations_used, 0),
    COALESCE(u.ai_generations_limit, 0)
  INTO 
    is_premium,
    current_used,
    current_limit
  FROM users u
  WHERE u.id = user_id;
  
  -- Check if the user can use AI generation
  IF NOT is_premium THEN
    RETURN false;
  END IF;
  
  -- Check if the user has reached their limit
  IF current_used >= current_limit THEN
    RETURN false;
  END IF;
  
  -- Increment the AI generations used count
  UPDATE users
  SET ai_generations_used = current_used + 1
  WHERE id = user_id;
  
  -- Return success
  RETURN true;
END;
$$;

-- Create a function to get remaining AI generations
CREATE OR REPLACE FUNCTION get_remaining_ai_generations()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_id UUID;
  current_used INTEGER;
  current_limit INTEGER;
  is_premium BOOLEAN;
BEGIN
  -- Get the current user ID
  user_id := auth.uid();
  
  -- Get the current user's premium status and AI generation counts
  SELECT 
    u.is_premium,
    COALESCE(u.ai_generations_used, 0),
    COALESCE(u.ai_generations_limit, 0)
  INTO 
    is_premium,
    current_used,
    current_limit
  FROM users u
  WHERE u.id = user_id;
  
  -- If not premium, return 0
  IF NOT is_premium THEN
    RETURN 0;
  END IF;
  
  -- Calculate remaining generations
  RETURN GREATEST(0, current_limit - current_used);
END;
$$;
