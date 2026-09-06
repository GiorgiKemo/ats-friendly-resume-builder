-- Serialize anonymous public-engagement admission per action so concurrent
-- requests cannot all pass a read-before-write limiter at the same time.
-- Reservations count immediately; the Edge Function finalizes the row after
-- the newsletter/contact write succeeds or fails.

CREATE OR REPLACE FUNCTION private.claim_public_engagement_attempt(
  p_scope text,
  p_key_hash text,
  p_email_hash text,
  p_ip_hash text,
  p_window_start timestamptz,
  p_max_attempts integer DEFAULT NULL,
  p_max_email_attempts integer DEFAULT NULL,
  p_max_ip_attempts integer DEFAULT NULL,
  p_max_global_attempts integer DEFAULT NULL
)
RETURNS TABLE(allowed boolean, attempt_id uuid, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  key_count integer;
  email_count integer;
  ip_count integer;
  global_count integer;
  denial_reason text;
  claimed_id uuid;
BEGIN
  IF p_scope IS NULL OR p_scope NOT IN ('subscribeNewsletter', 'submitContactInquiry', 'reportClientError') THEN
    RAISE EXCEPTION 'Unsupported public engagement scope';
  END IF;
  IF p_key_hash IS NULL OR p_email_hash IS NULL OR p_ip_hash IS NULL OR p_window_start IS NULL THEN
    RAISE EXCEPTION 'Invalid public engagement limiter input';
  END IF;
  IF p_window_start > now() THEN
    RAISE EXCEPTION 'Public engagement limiter window cannot start in the future';
  END IF;

  -- All callers of this function for one action share one transaction-level
  -- lock. The counters and reservation insert therefore form one atomic claim.
  PERFORM pg_advisory_xact_lock(hashtextextended('public-engagement:' || p_scope, 0));

  SELECT
    count(*) FILTER (WHERE key_hash = p_key_hash),
    count(*) FILTER (WHERE email_hash = p_email_hash),
    count(*) FILTER (WHERE ip_hash = p_ip_hash),
    count(*)
  INTO key_count, email_count, ip_count, global_count
  FROM public.public_engagement_attempts
  WHERE scope = p_scope
    AND created_at >= p_window_start;

  denial_reason := CASE
    WHEN p_max_attempts IS NOT NULL AND key_count >= p_max_attempts THEN 'rate_limited_key'
    WHEN p_max_email_attempts IS NOT NULL AND email_count >= p_max_email_attempts THEN 'rate_limited_email'
    WHEN p_max_ip_attempts IS NOT NULL AND ip_count >= p_max_ip_attempts THEN 'rate_limited_ip'
    WHEN p_max_global_attempts IS NOT NULL AND global_count >= p_max_global_attempts THEN 'rate_limited_global'
    ELSE NULL
  END;

  INSERT INTO public.public_engagement_attempts(scope, key_hash, email_hash, ip_hash, accepted, reason)
    VALUES (p_scope, p_key_hash, p_email_hash, p_ip_hash, false, coalesce(denial_reason, 'reserved'))
    RETURNING id INTO claimed_id;

  RETURN QUERY SELECT denial_reason IS NULL, claimed_id, coalesce(denial_reason, 'allowed');
END;
$$;

REVOKE ALL ON FUNCTION private.claim_public_engagement_attempt(text, text, text, text, timestamptz, integer, integer, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.claim_public_engagement_attempt(text, text, text, text, timestamptz, integer, integer, integer, integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.claim_public_engagement_attempt(
  p_scope text,
  p_key_hash text,
  p_email_hash text,
  p_ip_hash text,
  p_window_start timestamptz,
  p_max_attempts integer DEFAULT NULL,
  p_max_email_attempts integer DEFAULT NULL,
  p_max_ip_attempts integer DEFAULT NULL,
  p_max_global_attempts integer DEFAULT NULL
)
RETURNS TABLE(allowed boolean, attempt_id uuid, reason text)
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, private
AS $$
  SELECT * FROM private.claim_public_engagement_attempt(
    p_scope, p_key_hash, p_email_hash, p_ip_hash, p_window_start,
    p_max_attempts, p_max_email_attempts, p_max_ip_attempts, p_max_global_attempts
  );
$$;

REVOKE ALL ON FUNCTION public.claim_public_engagement_attempt(text, text, text, text, timestamptz, integer, integer, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_public_engagement_attempt(text, text, text, text, timestamptz, integer, integer, integer, integer)
  TO service_role;

CREATE OR REPLACE FUNCTION private.finalize_public_engagement_attempt(
  p_attempt_id uuid,
  p_accepted boolean,
  p_reason text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  finalized_id uuid;
BEGIN
  IF p_attempt_id IS NULL THEN RETURN false; END IF;
  UPDATE public.public_engagement_attempts
  SET accepted = coalesce(p_accepted, false),
      reason = p_reason
  WHERE id = p_attempt_id AND reason = 'reserved'
  RETURNING id INTO finalized_id;
  RETURN finalized_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.finalize_public_engagement_attempt(uuid, boolean, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.finalize_public_engagement_attempt(uuid, boolean, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.finalize_public_engagement_attempt(
  p_attempt_id uuid,
  p_accepted boolean,
  p_reason text DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, private
AS $$ SELECT private.finalize_public_engagement_attempt(p_attempt_id, p_accepted, p_reason); $$;

REVOKE ALL ON FUNCTION public.finalize_public_engagement_attempt(uuid, boolean, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_public_engagement_attempt(uuid, boolean, text)
  TO service_role;

-- The Edge Functions now use the protected RPCs; direct table writes would
-- bypass the serialized claim and are no longer needed by service_role.
REVOKE ALL ON TABLE public.public_engagement_attempts FROM service_role;
