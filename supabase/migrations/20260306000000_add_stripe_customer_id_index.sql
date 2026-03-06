-- Add index on stripe_customer_id for faster lookups in webhook handlers
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer_id ON public.users(stripe_customer_id)
WHERE stripe_customer_id IS NOT NULL;
