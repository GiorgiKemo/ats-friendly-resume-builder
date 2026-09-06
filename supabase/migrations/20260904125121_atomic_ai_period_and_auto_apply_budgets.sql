-- Server-owned monthly AI periods and durable auto-apply admission control.
-- Public wrappers are invokers; privileged implementations live outside the API.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO service_role, authenticated;

CREATE TABLE private.ai_quota_periods (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  anchor_at timestamptz NOT NULL,
  period_start timestamptz NOT NULL,
  billing_anchor boolean NOT NULL DEFAULT false
);
ALTER TABLE private.ai_quota_periods ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.ai_quota_periods FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON private.ai_quota_periods TO service_role;

CREATE FUNCTION private.ai_month_start(p_anchor timestamptz, p_at timestamptz)
RETURNS timestamptz LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog
AS $$
DECLARE
  anchor_utc timestamp := p_anchor AT TIME ZONE 'UTC';
  at_utc timestamp := p_at AT TIME ZONE 'UTC';
  month_count integer;
  candidate timestamp;
BEGIN
  IF p_anchor IS NULL OR p_at IS NULL OR p_at < p_anchor THEN RETURN p_anchor; END IF;
  month_count := (extract(year FROM at_utc)::integer - extract(year FROM anchor_utc)::integer) * 12
    + extract(month FROM at_utc)::integer - extract(month FROM anchor_utc)::integer;
  candidate := anchor_utc + make_interval(months => month_count);
  IF candidate > at_utc THEN candidate := anchor_utc + make_interval(months => month_count - 1); END IF;
  RETURN candidate AT TIME ZONE 'UTC';
END;
$$;
REVOKE ALL ON FUNCTION private.ai_month_start(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION private.refresh_ai_quota_period(p_user_id uuid, p_anchor timestamptz DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  profile public.users%ROWTYPE;
  quota private.ai_quota_periods%ROWTYPE;
  selected_anchor timestamptz;
  current_period timestamptz;
BEGIN
  SELECT * INTO profile FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND OR NOT coalesce(profile.is_premium, false)
    OR (profile.premium_until IS NOT NULL AND profile.premium_until <= now()) THEN RETURN false; END IF;
  IF p_anchor IS NOT NULL AND (NOT isfinite(p_anchor) OR p_anchor > now()) THEN
    RAISE EXCEPTION 'Invalid quota anchor';
  END IF;
  SELECT * INTO quota FROM private.ai_quota_periods WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    -- Preserve current usage when installing a missing marker. An older known
    -- premium activation can immediately roll over once, never once per request.
    selected_anchor := coalesce(p_anchor, profile.premium_updated_at, profile.created_at, now());
    selected_anchor := least(selected_anchor, now());
    INSERT INTO private.ai_quota_periods(user_id, anchor_at, period_start, billing_anchor)
      VALUES (p_user_id, selected_anchor, selected_anchor, p_anchor IS NOT NULL)
      RETURNING * INTO quota;
  END IF;
  selected_anchor := CASE WHEN p_anchor IS NOT NULL AND NOT quota.billing_anchor THEN p_anchor
    ELSE greatest(quota.anchor_at, coalesce(p_anchor, quota.anchor_at)) END;
  current_period := private.ai_month_start(selected_anchor, now());
  IF current_period > quota.period_start THEN
    UPDATE public.users SET ai_generations_used = 0, updated_at = now() WHERE id = p_user_id;
    UPDATE private.ai_quota_periods SET anchor_at = selected_anchor, period_start = current_period,
      billing_anchor = quota.billing_anchor OR p_anchor IS NOT NULL
      WHERE user_id = p_user_id;
    RETURN true;
  END IF;
  IF p_anchor IS NOT NULL AND NOT quota.billing_anchor THEN
    UPDATE private.ai_quota_periods SET anchor_at = selected_anchor, billing_anchor = true WHERE user_id = p_user_id;
  END IF;
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION private.refresh_ai_quota_period(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.refresh_ai_quota_period(uuid, timestamptz) TO service_role;

CREATE FUNCTION public.sync_ai_quota_period_for_user(p_user_id uuid, p_period_start timestamptz)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path = pg_catalog, private
AS $$ SELECT private.refresh_ai_quota_period(p_user_id, p_period_start); $$;
REVOKE ALL ON FUNCTION public.sync_ai_quota_period_for_user(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_ai_quota_period_for_user(uuid, timestamptz) TO service_role;

CREATE FUNCTION private.reserve_ai_generation(p_user_id uuid)
RETURNS TABLE(allowed boolean, remaining integer, reason text, period_start timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE profile public.users%ROWTYPE;
BEGIN
  PERFORM private.refresh_ai_quota_period(p_user_id);
  SELECT * INTO profile FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT false, 0, 'user_not_found', NULL::timestamptz; RETURN; END IF;
  IF NOT coalesce(profile.is_premium, false) OR (profile.premium_until IS NOT NULL AND profile.premium_until <= now()) THEN
    RETURN QUERY SELECT false, 0, 'upgrade_required', NULL::timestamptz; RETURN;
  END IF;
  IF coalesce(profile.ai_generations_used, 0) >= coalesce(profile.ai_generations_limit, 0) THEN
    RETURN QUERY SELECT false, 0, 'limit_reached', NULL::timestamptz; RETURN;
  END IF;
  UPDATE public.users SET ai_generations_used = coalesce(ai_generations_used, 0) + 1, updated_at = now()
    WHERE id = p_user_id RETURNING * INTO profile;
  RETURN QUERY SELECT true, greatest(profile.ai_generations_limit - profile.ai_generations_used, 0), 'allowed', q.period_start
    FROM private.ai_quota_periods q WHERE q.user_id = p_user_id;
END;
$$;
REVOKE ALL ON FUNCTION private.reserve_ai_generation(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.reserve_ai_generation(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.reserve_ai_generation_for_user(p_user_id uuid)
RETURNS TABLE(allowed boolean, remaining integer, reason text)
LANGUAGE sql SECURITY INVOKER SET search_path = pg_catalog, private
AS $$ SELECT allowed, remaining, reason FROM private.reserve_ai_generation(p_user_id); $$;
REVOKE ALL ON FUNCTION public.reserve_ai_generation_for_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_generation_for_user(uuid) TO service_role;

-- Keep the old three-column RPC compatible during a staged Edge rollout.
CREATE FUNCTION public.reserve_ai_generation_with_period(p_user_id uuid)
RETURNS TABLE(allowed boolean, remaining integer, reason text, period_start timestamptz)
LANGUAGE sql SECURITY INVOKER SET search_path = pg_catalog, private
AS $$ SELECT * FROM private.reserve_ai_generation(p_user_id); $$;
REVOKE ALL ON FUNCTION public.reserve_ai_generation_with_period(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_generation_with_period(uuid) TO service_role;

CREATE FUNCTION private.remaining_ai_generations()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE result integer;
BEGIN
  PERFORM private.refresh_ai_quota_period(auth.uid());
  SELECT CASE WHEN coalesce(is_premium, false) AND (premium_until IS NULL OR premium_until > now())
    THEN greatest(coalesce(ai_generations_limit, 0) - coalesce(ai_generations_used, 0), 0) ELSE 0 END
    INTO result FROM public.users WHERE id = auth.uid();
  RETURN coalesce(result, 0);
END;
$$;
REVOKE ALL ON FUNCTION private.remaining_ai_generations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.remaining_ai_generations() TO authenticated;
CREATE OR REPLACE FUNCTION public.get_remaining_ai_generations()
RETURNS integer LANGUAGE sql SECURITY INVOKER SET search_path = pg_catalog, private
AS $$ SELECT private.remaining_ai_generations(); $$;
REVOKE ALL ON FUNCTION public.get_remaining_ai_generations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_remaining_ai_generations() TO authenticated;

-- An old request refund must not decrement usage in a new monthly period.
CREATE FUNCTION private.refund_ai_generation_in_period(p_user_id uuid, p_period_start timestamptz)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE updated_used integer;
BEGIN
  PERFORM 1 FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF p_period_start IS NULL THEN RETURN false; END IF;
  UPDATE public.users SET ai_generations_used = greatest(coalesce(ai_generations_used, 0) - 1, 0), updated_at = now()
    WHERE id = p_user_id AND ai_generations_used > 0 AND EXISTS (
      SELECT 1 FROM private.ai_quota_periods WHERE user_id = p_user_id AND period_start = p_period_start
    ) RETURNING ai_generations_used INTO updated_used;
  RETURN updated_used IS NOT NULL;
END;
$$;
REVOKE ALL ON FUNCTION private.refund_ai_generation_in_period(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.refund_ai_generation_in_period(uuid, timestamptz) TO service_role;
CREATE FUNCTION public.refund_ai_generation_for_user(p_user_id uuid, p_period_start timestamptz)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path = pg_catalog, private
AS $$ SELECT private.refund_ai_generation_in_period(p_user_id, p_period_start); $$;
REVOKE ALL ON FUNCTION public.refund_ai_generation_for_user(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_ai_generation_for_user(uuid, timestamptz) TO service_role;

CREATE TABLE private.auto_apply_control (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  budget_day date NOT NULL,
  runs_started integer NOT NULL DEFAULT 0 CHECK (runs_started >= 0),
  jobs_processed integer NOT NULL DEFAULT 0 CHECK (jobs_processed >= 0),
  last_started_at timestamptz,
  active_run_id uuid,
  lease_expires_at timestamptz
);
ALTER TABLE private.auto_apply_control ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.auto_apply_control FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON private.auto_apply_control TO service_role;

CREATE FUNCTION private.claim_auto_apply_run(p_user_id uuid, p_discover_only boolean)
RETURNS TABLE(allowed boolean, run_id uuid, remaining integer, reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  control private.auto_apply_control%ROWTYPE;
  prefs public.job_preferences%ROWTYPE;
  today date := (now() AT TIME ZONE 'UTC')::date;
  daily_cap integer;
  claimed_id uuid;
BEGIN
  PERFORM 1 FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT false, NULL::uuid, 0, 'user_not_found'; RETURN; END IF;
  SELECT * INTO prefs FROM public.job_preferences WHERE user_id = p_user_id;
  IF NOT FOUND THEN RETURN QUERY SELECT false, NULL::uuid, 0, 'preferences_missing'; RETURN; END IF;
  IF NOT p_discover_only AND NOT prefs.is_active THEN RETURN QUERY SELECT false, NULL::uuid, 0, 'paused'; RETURN; END IF;
  daily_cap := least(100, greatest(1, coalesce(prefs.daily_limit, 10)));
  INSERT INTO private.auto_apply_control(user_id, budget_day) VALUES (p_user_id, today) ON CONFLICT DO NOTHING;
  SELECT * INTO control FROM private.auto_apply_control WHERE user_id = p_user_id FOR UPDATE;
  IF control.active_run_id IS NOT NULL AND control.lease_expires_at > now() THEN
    RETURN QUERY SELECT false, NULL::uuid, 0, 'already_running'; RETURN;
  END IF;
  IF control.active_run_id IS NOT NULL THEN
    UPDATE public.auto_apply_runs SET status = 'failed', completed_at = now(), error_message = 'Run lease expired; start a new run.'
      WHERE id = control.active_run_id AND user_id = p_user_id AND status = 'running';
  END IF;
  IF control.budget_day <> today THEN
    control.runs_started := 0; control.jobs_processed := 0;
  END IF;
  IF control.runs_started >= 10 THEN RETURN QUERY SELECT false, NULL::uuid, 0, 'daily_run_limit'; RETURN; END IF;
  IF control.last_started_at > now() - interval '1 minute' THEN
    RETURN QUERY SELECT false, NULL::uuid, 0, 'cooldown'; RETURN;
  END IF;
  IF control.jobs_processed >= daily_cap THEN RETURN QUERY SELECT false, NULL::uuid, 0, 'daily_job_limit'; RETURN; END IF;
  INSERT INTO public.auto_apply_runs(user_id, status) VALUES (p_user_id, 'running') RETURNING id INTO claimed_id;
  UPDATE private.auto_apply_control SET budget_day = today, runs_started = control.runs_started + 1,
    jobs_processed = control.jobs_processed, active_run_id = claimed_id,
    last_started_at = now(), lease_expires_at = now() + interval '15 minutes' WHERE user_id = p_user_id;
  RETURN QUERY SELECT true, claimed_id, daily_cap - control.jobs_processed, 'allowed';
END;
$$;
REVOKE ALL ON FUNCTION private.claim_auto_apply_run(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.claim_auto_apply_run(uuid, boolean) TO service_role;
CREATE FUNCTION public.claim_auto_apply_run(p_user_id uuid, p_discover_only boolean)
RETURNS TABLE(allowed boolean, run_id uuid, remaining integer, reason text)
LANGUAGE sql SECURITY INVOKER SET search_path = pg_catalog, private
AS $$ SELECT * FROM private.claim_auto_apply_run(p_user_id, p_discover_only); $$;
REVOKE ALL ON FUNCTION public.claim_auto_apply_run(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_auto_apply_run(uuid, boolean) TO service_role;

CREATE FUNCTION private.reserve_auto_apply_job_slot(p_user_id uuid, p_run_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE updated_id uuid;
BEGIN
  UPDATE private.auto_apply_control SET jobs_processed = jobs_processed + 1
    WHERE user_id = p_user_id AND active_run_id = p_run_id AND lease_expires_at > now()
      AND budget_day = (now() AT TIME ZONE 'UTC')::date
      AND jobs_processed < (SELECT least(100, greatest(1, coalesce(daily_limit, 10))) FROM public.job_preferences WHERE user_id = p_user_id)
    RETURNING user_id INTO updated_id;
  RETURN updated_id IS NOT NULL;
END;
$$;
REVOKE ALL ON FUNCTION private.reserve_auto_apply_job_slot(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.reserve_auto_apply_job_slot(uuid, uuid) TO service_role;
CREATE FUNCTION public.reserve_auto_apply_job_slot(p_user_id uuid, p_run_id uuid)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path = pg_catalog, private
AS $$ SELECT private.reserve_auto_apply_job_slot(p_user_id, p_run_id); $$;
REVOKE ALL ON FUNCTION public.reserve_auto_apply_job_slot(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_auto_apply_job_slot(uuid, uuid) TO service_role;

CREATE FUNCTION private.release_auto_apply_run(p_user_id uuid, p_run_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE updated_id uuid;
BEGIN
  UPDATE private.auto_apply_control SET active_run_id = NULL, lease_expires_at = NULL
    WHERE user_id = p_user_id AND active_run_id = p_run_id RETURNING user_id INTO updated_id;
  RETURN updated_id IS NOT NULL;
END;
$$;
REVOKE ALL ON FUNCTION private.release_auto_apply_run(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.release_auto_apply_run(uuid, uuid) TO service_role;
CREATE FUNCTION public.release_auto_apply_run(p_user_id uuid, p_run_id uuid)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path = pg_catalog, private
AS $$ SELECT private.release_auto_apply_run(p_user_id, p_run_id); $$;
REVOKE ALL ON FUNCTION public.release_auto_apply_run(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_auto_apply_run(uuid, uuid) TO service_role;
