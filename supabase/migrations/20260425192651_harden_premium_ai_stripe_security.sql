-- Harden premium state, AI quota accounting, and Stripe webhook idempotency.
-- This migration intentionally removes the legacy self-service premium toggle.

DROP FUNCTION IF EXISTS public.toggle_premium_status(uuid);

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  status text NOT NULL DEFAULT 'processing',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.stripe_webhook_events FROM PUBLIC;
REVOKE ALL ON TABLE public.stripe_webhook_events FROM anon;
REVOKE ALL ON TABLE public.stripe_webhook_events FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.stripe_webhook_events TO service_role;

CREATE OR REPLACE FUNCTION public.check_premium_status()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  premium_active boolean := false;
BEGIN
  SELECT
    coalesce(is_premium, false)
    AND (premium_until IS NULL OR premium_until > now())
  INTO premium_active
  FROM public.users
  WHERE id = auth.uid();

  RETURN coalesce(premium_active, false);
END;
$$;

REVOKE ALL ON FUNCTION public.check_premium_status() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_premium_status() FROM anon;
GRANT EXECUTE ON FUNCTION public.check_premium_status() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_remaining_ai_generations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  remaining_count integer := 0;
BEGIN
  SELECT
    CASE
      WHEN coalesce(is_premium, false) = true
       AND (premium_until IS NULL OR premium_until > now())
      THEN greatest(coalesce(ai_generations_limit, 0) - coalesce(ai_generations_used, 0), 0)
      ELSE 0
    END
  INTO remaining_count
  FROM public.users
  WHERE id = auth.uid();

  RETURN coalesce(remaining_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.get_remaining_ai_generations() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_remaining_ai_generations() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_remaining_ai_generations() TO authenticated;

CREATE OR REPLACE FUNCTION public.reserve_ai_generation_for_user(p_user_id uuid)
RETURNS TABLE(allowed boolean, remaining integer, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_remaining integer;
  user_record record;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN QUERY SELECT false, 0, 'unauthorized';
    RETURN;
  END IF;

  UPDATE public.users
  SET
    ai_generations_used = coalesce(ai_generations_used, 0) + 1,
    updated_at = now()
  WHERE id = p_user_id
    AND coalesce(is_premium, false) = true
    AND (premium_until IS NULL OR premium_until > now())
    AND coalesce(ai_generations_used, 0) < coalesce(ai_generations_limit, 0)
  RETURNING greatest(coalesce(ai_generations_limit, 0) - coalesce(ai_generations_used, 0), 0)
  INTO updated_remaining;

  IF updated_remaining IS NOT NULL THEN
    RETURN QUERY SELECT true, updated_remaining, 'allowed';
    RETURN;
  END IF;

  SELECT
    coalesce(is_premium, false) AS is_premium,
    premium_until,
    coalesce(ai_generations_used, 0) AS used_count,
    coalesce(ai_generations_limit, 0) AS limit_count
  INTO user_record
  FROM public.users
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0, 'user_not_found';
  ELSIF user_record.is_premium IS DISTINCT FROM true
    OR (user_record.premium_until IS NOT NULL AND user_record.premium_until <= now()) THEN
    RETURN QUERY SELECT false, 0, 'upgrade_required';
  ELSIF user_record.limit_count <= 0 OR user_record.used_count >= user_record.limit_count THEN
    RETURN QUERY SELECT false, 0, 'limit_reached';
  ELSE
    RETURN QUERY SELECT false, 0, 'unavailable';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_ai_generation_for_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_ai_generation_for_user(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.reserve_ai_generation_for_user(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_generation_for_user(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.track_ai_generation_secure()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reservation record;
BEGIN
  SELECT *
  INTO reservation
  FROM public.reserve_ai_generation_for_user(auth.uid())
  LIMIT 1;

  RETURN coalesce(reservation.allowed, false);
END;
$$;

REVOKE ALL ON FUNCTION public.track_ai_generation_secure() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.track_ai_generation_secure() FROM anon;
GRANT EXECUTE ON FUNCTION public.track_ai_generation_secure() TO authenticated;

REVOKE ALL ON FUNCTION public.fix_premium_users_without_stripe() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fix_premium_users_without_stripe() FROM anon;
REVOKE ALL ON FUNCTION public.fix_premium_users_without_stripe() FROM authenticated;

REVOKE ALL ON FUNCTION public.validate_premium_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_premium_user() FROM anon;
REVOKE ALL ON FUNCTION public.validate_premium_user() FROM authenticated;
