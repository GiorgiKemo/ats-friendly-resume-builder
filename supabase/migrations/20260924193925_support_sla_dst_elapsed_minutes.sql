CREATE OR REPLACE FUNCTION private.resolve_support_business_boundary(
  p_local timestamp,
  p_timezone text,
  p_choose_earlier boolean
) RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog
AS $$
DECLARE
  default_candidate timestamptz := p_local AT TIME ZONE p_timezone;
  earliest_candidate timestamptz;
  latest_candidate timestamptz;
  resolved_candidate timestamptz;
BEGIN
  SELECT min(boundary_candidates.instant), max(boundary_candidates.instant)
  INTO earliest_candidate, latest_candidate
  FROM generate_series(
    default_candidate - INTERVAL '4 hours',
    default_candidate + INTERVAL '4 hours',
    INTERVAL '1 minute'
  ) AS boundary_candidates(instant)
  WHERE boundary_candidates.instant AT TIME ZONE p_timezone = p_local;

  IF earliest_candidate IS NOT NULL THEN
    RETURN CASE WHEN p_choose_earlier THEN earliest_candidate ELSE latest_candidate END;
  END IF;

  SELECT boundary_candidates.instant
  INTO resolved_candidate
  FROM generate_series(
    date_trunc('minute', default_candidate - INTERVAL '4 hours'),
    date_trunc('minute', default_candidate + INTERVAL '4 hours'),
    INTERVAL '1 minute'
  ) AS boundary_candidates(instant)
  WHERE boundary_candidates.instant AT TIME ZONE p_timezone > p_local
  ORDER BY boundary_candidates.instant
  LIMIT 1;

  IF resolved_candidate IS NULL THEN
    RAISE EXCEPTION 'Unable to resolve support business-time boundary';
  END IF;
  RETURN resolved_candidate;
END;
$$;

REVOKE ALL ON FUNCTION private.resolve_support_business_boundary(timestamp, text, boolean)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.support_add_business_minutes(
  p_started_at timestamptz,
  p_minutes integer
) RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  settings_row public.support_routing_settings%ROWTYPE;
  cursor_at timestamptz := p_started_at;
  local_cursor timestamp;
  local_day integer;
  local_day_start_at timestamptz;
  local_day_end_at timestamptz;
  business_start_local timestamp;
  business_end_local timestamp;
  business_start_at timestamptz;
  business_end_at timestamptz;
  available_time interval;
  remaining_time interval := make_interval(mins => p_minutes);
BEGIN
  IF p_started_at IS NULL OR p_minutes IS NULL OR p_minutes < 0 THEN
    RAISE EXCEPTION 'Invalid business-time input';
  END IF;
  SELECT * INTO settings_row FROM public.support_routing_settings WHERE id = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Support routing settings are unavailable'; END IF;
  IF p_minutes = 0 THEN RETURN p_started_at; END IF;

  FOR step IN 1..10000 LOOP
    local_cursor := cursor_at AT TIME ZONE settings_row.timezone;
    local_day := EXTRACT(ISODOW FROM local_cursor)::integer;
    business_start_local := local_cursor::date + settings_row.business_start;
    business_end_local := local_cursor::date + settings_row.business_end;
    local_day_start_at := local_cursor::date::timestamp AT TIME ZONE settings_row.timezone;
    local_day_end_at := (local_cursor::date + 1)::timestamp AT TIME ZONE settings_row.timezone;

    IF local_day_end_at - local_day_start_at = INTERVAL '24 hours' THEN
      business_start_at := business_start_local AT TIME ZONE settings_row.timezone;
      business_end_at := business_end_local AT TIME ZONE settings_row.timezone;
    ELSE
      business_start_at := private.resolve_support_business_boundary(
        business_start_local, settings_row.timezone, true
      );
      business_end_at := private.resolve_support_business_boundary(
        business_end_local, settings_row.timezone, false
      );
    END IF;

    IF local_day <> ALL(settings_row.business_days)
      OR cursor_at >= business_end_at THEN
      cursor_at := ((local_cursor::date + 1)::timestamp + settings_row.business_start) AT TIME ZONE settings_row.timezone;
      CONTINUE;
    END IF;
    IF cursor_at < business_start_at THEN
      cursor_at := business_start_at;
      CONTINUE;
    END IF;

    available_time := business_end_at - cursor_at;
    IF available_time <= INTERVAL '0 seconds' THEN
      cursor_at := ((local_cursor::date + 1)::timestamp + settings_row.business_start) AT TIME ZONE settings_row.timezone;
      CONTINUE;
    END IF;
    IF remaining_time <= available_time THEN
      RETURN cursor_at + remaining_time;
    END IF;
    remaining_time := remaining_time - available_time;
    cursor_at := ((local_cursor::date + 1)::timestamp + settings_row.business_start) AT TIME ZONE settings_row.timezone;
  END LOOP;
  RAISE EXCEPTION 'Business-time calculation exceeded its safety bound';
END;
$$;
