-- Restrict the users UPDATE policy so clients cannot self-upgrade premium status.
-- Only allow updating safe profile columns; sensitive columns (is_premium, premium_plan,
-- premium_until, ai_generations_limit, ai_generations_used, stripe_customer_id) can only
-- be changed by service-role (edge functions / webhooks), which bypass RLS.

DROP POLICY IF EXISTS "Users can update own profile" ON users;

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    -- Prevent clients from modifying sensitive subscription columns.
    -- The WITH CHECK ensures that after the UPDATE, these columns still
    -- hold their original values (i.e., the update didn't change them).
    AND is_premium    IS NOT DISTINCT FROM (SELECT is_premium FROM users WHERE id = auth.uid())
    AND premium_plan  IS NOT DISTINCT FROM (SELECT premium_plan FROM users WHERE id = auth.uid())
    AND premium_until IS NOT DISTINCT FROM (SELECT premium_until FROM users WHERE id = auth.uid())
    AND ai_generations_limit IS NOT DISTINCT FROM (SELECT ai_generations_limit FROM users WHERE id = auth.uid())
    AND ai_generations_used  IS NOT DISTINCT FROM (SELECT ai_generations_used FROM users WHERE id = auth.uid())
    AND stripe_customer_id   IS NOT DISTINCT FROM (SELECT stripe_customer_id FROM users WHERE id = auth.uid())
  );
