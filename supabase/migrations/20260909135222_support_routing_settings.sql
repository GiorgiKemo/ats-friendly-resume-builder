-- Versioned, non-secret support-hours and queue-routing settings.

CREATE TABLE IF NOT EXISTS public.support_routing_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id = true),
  timezone TEXT NOT NULL DEFAULT 'Asia/Tbilisi',
  business_days SMALLINT[] NOT NULL DEFAULT ARRAY[1, 2, 3, 4, 5]::smallint[],
  business_start TIME NOT NULL DEFAULT '09:00',
  business_end TIME NOT NULL DEFAULT '18:00',
  first_response_target_minutes INTEGER NOT NULL DEFAULT 1440 CHECK (first_response_target_minutes BETWEEN 5 AND 10080),
  max_queue_size INTEGER NOT NULL DEFAULT 100 CHECK (max_queue_size BETWEEN 1 AND 10000),
  auto_route_enabled BOOLEAN NOT NULL DEFAULT true,
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (cardinality(business_days) BETWEEN 1 AND 7),
  CHECK (business_start < business_end)
);

CREATE TABLE IF NOT EXISTS public.support_routing_settings_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settings_revision BIGINT NOT NULL,
  timezone TEXT NOT NULL,
  business_days SMALLINT[] NOT NULL,
  business_start TIME NOT NULL,
  business_end TIME NOT NULL,
  first_response_target_minutes INTEGER NOT NULL,
  max_queue_size INTEGER NOT NULL,
  auto_route_enabled BOOLEAN NOT NULL,
  change_source TEXT NOT NULL DEFAULT 'admin',
  reason TEXT,
  changed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (settings_revision)
);

ALTER TABLE public.support_routing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_routing_settings_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.support_routing_settings, public.support_routing_settings_history FROM public, anon, authenticated;
GRANT ALL ON TABLE public.support_routing_settings, public.support_routing_settings_history TO service_role;

INSERT INTO public.support_routing_settings(id)
VALUES (true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.support_routing_settings_history(
  settings_revision,
  timezone,
  business_days,
  business_start,
  business_end,
  first_response_target_minutes,
  max_queue_size,
  auto_route_enabled,
  change_source,
  reason,
  changed_by_user_id,
  changed_at
)
SELECT
  revision,
  timezone,
  business_days,
  business_start,
  business_end,
  first_response_target_minutes,
  max_queue_size,
  auto_route_enabled,
  'initial',
  'initial_default',
  updated_by_user_id,
  updated_at
FROM public.support_routing_settings s
WHERE NOT EXISTS (
  SELECT 1 FROM public.support_routing_settings_history h WHERE h.settings_revision = s.revision
);

CREATE OR REPLACE FUNCTION public.support_routing_settings_history_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  next_revision BIGINT;
  reason_value TEXT;
BEGIN
  next_revision := OLD.revision + 1;
  NEW.revision := next_revision;
  reason_value := NULLIF(left(current_setting('app.support_routing_reason', true), 240), '');
  INSERT INTO public.support_routing_settings_history(
    settings_revision,
    timezone,
    business_days,
    business_start,
    business_end,
    first_response_target_minutes,
    max_queue_size,
    auto_route_enabled,
    change_source,
    reason,
    changed_by_user_id,
    changed_at
  ) VALUES (
    NEW.revision,
    NEW.timezone,
    NEW.business_days,
    NEW.business_start,
    NEW.business_end,
    NEW.first_response_target_minutes,
    NEW.max_queue_size,
    NEW.auto_route_enabled,
    'admin',
    reason_value,
    NEW.updated_by_user_id,
    NEW.updated_at
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS support_routing_settings_history_on_update ON public.support_routing_settings;
CREATE TRIGGER support_routing_settings_history_on_update
BEFORE UPDATE ON public.support_routing_settings
FOR EACH ROW EXECUTE FUNCTION public.support_routing_settings_history_trigger();

CREATE OR REPLACE FUNCTION public.admin_update_support_routing_settings(
  p_actor_user_id UUID,
  p_timezone TEXT,
  p_business_days SMALLINT[],
  p_business_start TIME,
  p_business_end TIME,
  p_first_response_target_minutes INTEGER,
  p_max_queue_size INTEGER,
  p_auto_route_enabled BOOLEAN,
  p_reason TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  updated_row public.support_routing_settings%ROWTYPE;
  normalized_timezone TEXT;
  normalized_reason TEXT;
  distinct_days INTEGER;
BEGIN
  IF p_actor_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.admin_members
    WHERE user_id = p_actor_user_id AND is_active AND role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'Support settings access required';
  END IF;

  normalized_timezone := NULLIF(btrim(p_timezone), '');
  IF normalized_timezone IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_timezone_names WHERE name = normalized_timezone
  ) THEN
    RAISE EXCEPTION 'Invalid support timezone';
  END IF;
  IF p_business_days IS NULL OR cardinality(p_business_days) < 1 OR cardinality(p_business_days) > 7
    OR EXISTS (SELECT 1 FROM unnest(p_business_days) AS day_number WHERE day_number < 1 OR day_number > 7) THEN
    RAISE EXCEPTION 'Invalid support business days';
  END IF;
  SELECT count(DISTINCT day_number) INTO distinct_days FROM unnest(p_business_days) AS day_number;
  IF distinct_days <> cardinality(p_business_days) THEN
    RAISE EXCEPTION 'Support business days must be unique';
  END IF;
  IF p_business_start IS NULL OR p_business_end IS NULL OR p_business_start >= p_business_end THEN
    RAISE EXCEPTION 'Invalid support business hours';
  END IF;
  IF p_first_response_target_minutes IS NULL OR p_first_response_target_minutes NOT BETWEEN 5 AND 10080 THEN
    RAISE EXCEPTION 'Invalid first-response target';
  END IF;
  IF p_max_queue_size IS NULL OR p_max_queue_size NOT BETWEEN 1 AND 10000 THEN
    RAISE EXCEPTION 'Invalid support queue size';
  END IF;

  normalized_reason := NULLIF(left(btrim(coalesce(p_reason, '')), 240), '');
  PERFORM set_config('app.support_routing_reason', coalesce(normalized_reason, ''), true);

  UPDATE public.support_routing_settings
  SET timezone = normalized_timezone,
      business_days = p_business_days,
      business_start = p_business_start,
      business_end = p_business_end,
      first_response_target_minutes = p_first_response_target_minutes,
      max_queue_size = p_max_queue_size,
      auto_route_enabled = coalesce(p_auto_route_enabled, true),
      updated_by_user_id = p_actor_user_id,
      updated_at = clock_timestamp()
  WHERE id = true
  RETURNING * INTO updated_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'Support settings are unavailable'; END IF;

  INSERT INTO public.admin_audit_events(admin_user_id, action, metadata)
  VALUES (
    p_actor_user_id,
    'support.routing.updated',
    jsonb_build_object(
      'revision', updated_row.revision,
      'timezone', updated_row.timezone,
      'businessDays', updated_row.business_days,
      'businessStart', updated_row.business_start,
      'businessEnd', updated_row.business_end,
      'firstResponseTargetMinutes', updated_row.first_response_target_minutes,
      'maxQueueSize', updated_row.max_queue_size,
      'autoRouteEnabled', updated_row.auto_route_enabled,
      'reason', normalized_reason
    )
  );

  RETURN jsonb_build_object(
    'revision', updated_row.revision,
    'timezone', updated_row.timezone,
    'businessDays', updated_row.business_days,
    'businessStart', updated_row.business_start,
    'businessEnd', updated_row.business_end,
    'firstResponseTargetMinutes', updated_row.first_response_target_minutes,
    'maxQueueSize', updated_row.max_queue_size,
    'autoRouteEnabled', updated_row.auto_route_enabled,
    'updatedAt', updated_row.updated_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.support_get_routing_context()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  settings_row public.support_routing_settings%ROWTYPE;
  local_now TIMESTAMP;
  local_day INTEGER;
  local_time TIME;
  queue_count INTEGER;
BEGIN
  SELECT * INTO settings_row
  FROM public.support_routing_settings
  WHERE id = true;
  IF NOT FOUND THEN RETURN NULL; END IF;

  local_now := (now() AT TIME ZONE settings_row.timezone);
  local_day := extract(isodow FROM local_now)::integer;
  local_time := local_now::time;
  SELECT count(*) INTO queue_count
  FROM public.support_conversations
  WHERE status IN ('open', 'waiting_customer')
    AND mode = 'queued';

  RETURN jsonb_build_object(
    'timezone', settings_row.timezone,
    'businessStart', settings_row.business_start,
    'businessEnd', settings_row.business_end,
    'withinBusinessHours', local_day = ANY(settings_row.business_days) AND local_time >= settings_row.business_start AND local_time < settings_row.business_end,
    'queueAtCapacity', queue_count >= settings_row.max_queue_size,
    'autoRouteEnabled', settings_row.auto_route_enabled,
    'firstResponseTargetMinutes', settings_row.first_response_target_minutes
  );
END;
$$;

REVOKE ALL ON FUNCTION public.support_routing_settings_history_trigger() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_update_support_routing_settings(UUID, TEXT, SMALLINT[], TIME, TIME, INTEGER, INTEGER, BOOLEAN, TEXT) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.support_get_routing_context() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_support_routing_settings(UUID, TEXT, SMALLINT[], TIME, TIME, INTEGER, INTEGER, BOOLEAN, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.support_get_routing_context() TO service_role;
