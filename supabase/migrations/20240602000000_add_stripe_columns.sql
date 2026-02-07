-- Add Stripe-related columns to the users table
-- Assumes public.users table already exists from an earlier migration.
-- Columns is_premium and ai_generations_limit (with defaults) are expected to be in the initial users table creation.
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
ADD COLUMN IF NOT EXISTS premium_plan TEXT,
ADD COLUMN IF NOT EXISTS premium_until TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS premium_updated_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS ai_generations_used INTEGER DEFAULT 0;
