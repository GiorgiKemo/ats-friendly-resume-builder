-- Manual admin premium grants are performed by trusted service-role Edge
-- Functions. The legacy validation trigger blocked those grants unless a
-- Stripe customer ID existed, which made non-Stripe/manual premium impossible.
DROP TRIGGER IF EXISTS validate_premium_user_trigger ON public.users;
DROP FUNCTION IF EXISTS public.validate_premium_user();
