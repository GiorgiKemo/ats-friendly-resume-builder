-- Durable per-user Gmail scan admission and work budgets.
-- The Edge Function still applies tighter per-request bounds; these counters
-- prevent repeated/scheduled scans from multiplying provider or AI cost.

CREATE TABLE private.gmail_scan_control (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  budget_day date NOT NULL,
  scans_started integer NOT NULL DEFAULT 0 CHECK (scans_started >= 0),
  messages_fetched integer NOT NULL DEFAULT 0 CHECK (messages_fetched >= 0),
  ai_classifications integer NOT NULL DEFAULT 0 CHECK (ai_classifications >= 0),
  last_started_at timestamptz,
  active_scan_id uuid,
  lease_expires_at timestamptz
);

ALTER TABLE private.gmail_scan_control ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.gmail_scan_control FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.claim_gmail_scan(p_user_id uuid)
RETURNS TABLE(allowed boolean, scan_id uuid, reason text, remaining_messages integer, remaining_ai integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  control private.gmail_scan_control%ROWTYPE;
  today date := (now() AT TIME ZONE 'UTC')::date;
  claimed_id uuid;
  daily_scan_limit integer := 24;
  daily_message_limit integer := 500;
  daily_ai_limit integer := 100;
BEGIN
  PERFORM 1 FROM public.users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::uuid, 'user_not_found', 0, 0;
    RETURN;
  END IF;

  INSERT INTO private.gmail_scan_control(user_id, budget_day)
    VALUES (p_user_id, today)
    ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO control FROM private.gmail_scan_control WHERE user_id = p_user_id FOR UPDATE;

  IF control.budget_day <> today THEN
    UPDATE private.gmail_scan_control
    SET budget_day = today, scans_started = 0, messages_fetched = 0,
        ai_classifications = 0, last_started_at = NULL
    WHERE user_id = p_user_id
    RETURNING * INTO control;
  END IF;

  IF control.active_scan_id IS NOT NULL AND control.lease_expires_at > now() THEN
    RETURN QUERY SELECT false, NULL::uuid, 'already_running',
      greatest(daily_message_limit - control.messages_fetched, 0),
      greatest(daily_ai_limit - control.ai_classifications, 0);
    RETURN;
  END IF;

  IF control.active_scan_id IS NOT NULL THEN
    UPDATE private.gmail_scan_control
    SET active_scan_id = NULL, lease_expires_at = NULL
    WHERE user_id = p_user_id;
  END IF;

  IF control.scans_started >= daily_scan_limit THEN
    RETURN QUERY SELECT false, NULL::uuid, 'daily_scan_limit',
      greatest(daily_message_limit - control.messages_fetched, 0),
      greatest(daily_ai_limit - control.ai_classifications, 0);
    RETURN;
  END IF;
  IF control.last_started_at > now() - interval '5 minutes' THEN
    RETURN QUERY SELECT false, NULL::uuid, 'cooldown',
      greatest(daily_message_limit - control.messages_fetched, 0),
      greatest(daily_ai_limit - control.ai_classifications, 0);
    RETURN;
  END IF;
  IF control.messages_fetched >= daily_message_limit THEN
    RETURN QUERY SELECT false, NULL::uuid, 'daily_message_limit', 0,
      greatest(daily_ai_limit - control.ai_classifications, 0);
    RETURN;
  END IF;
  IF control.ai_classifications >= daily_ai_limit THEN
    RETURN QUERY SELECT false, NULL::uuid, 'daily_ai_limit',
      greatest(daily_message_limit - control.messages_fetched, 0), 0;
    RETURN;
  END IF;

  claimed_id := gen_random_uuid();
  UPDATE private.gmail_scan_control
  SET scans_started = control.scans_started + 1,
      active_scan_id = claimed_id,
      last_started_at = now(),
      lease_expires_at = now() + interval '15 minutes'
  WHERE user_id = p_user_id;
  RETURN QUERY SELECT true, claimed_id, 'allowed',
    greatest(daily_message_limit - control.messages_fetched, 0),
    greatest(daily_ai_limit - control.ai_classifications, 0);
END;
$$;

REVOKE ALL ON FUNCTION private.claim_gmail_scan(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.claim_gmail_scan(uuid) TO service_role;

CREATE FUNCTION public.claim_gmail_scan(p_user_id uuid)
RETURNS TABLE(allowed boolean, scan_id uuid, reason text, remaining_messages integer, remaining_ai integer)
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, private
AS $$ SELECT * FROM private.claim_gmail_scan(p_user_id); $$;

REVOKE ALL ON FUNCTION public.claim_gmail_scan(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_gmail_scan(uuid) TO service_role;

CREATE FUNCTION private.reserve_gmail_scan_work(
  p_user_id uuid,
  p_scan_id uuid,
  p_messages integer DEFAULT 0,
  p_ai_calls integer DEFAULT 0
)
RETURNS TABLE(allowed boolean, reason text, remaining_messages integer, remaining_ai integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  messages integer;
  ai_calls integer;
  daily_message_limit integer := 500;
  daily_ai_limit integer := 100;
BEGIN
  IF p_messages < 0 OR p_ai_calls < 0 OR (p_messages = 0 AND p_ai_calls = 0) THEN
    RAISE EXCEPTION 'Invalid Gmail scan work reservation';
  END IF;

  UPDATE private.gmail_scan_control
  SET messages_fetched = messages_fetched + p_messages,
      ai_classifications = ai_classifications + p_ai_calls
  WHERE user_id = p_user_id
    AND active_scan_id = p_scan_id
    AND lease_expires_at > now()
    AND budget_day = (now() AT TIME ZONE 'UTC')::date
    AND messages_fetched + p_messages <= daily_message_limit
    AND ai_classifications + p_ai_calls <= daily_ai_limit
  RETURNING messages_fetched, ai_classifications INTO messages, ai_calls;

  IF messages IS NULL THEN
    RETURN QUERY SELECT false, 'budget_exhausted', 0, 0;
    RETURN;
  END IF;
  RETURN QUERY SELECT true, 'allowed',
    greatest(daily_message_limit - messages, 0),
    greatest(daily_ai_limit - ai_calls, 0);
END;
$$;

REVOKE ALL ON FUNCTION private.reserve_gmail_scan_work(uuid, uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.reserve_gmail_scan_work(uuid, uuid, integer, integer) TO service_role;

CREATE FUNCTION public.reserve_gmail_scan_work(
  p_user_id uuid,
  p_scan_id uuid,
  p_messages integer DEFAULT 0,
  p_ai_calls integer DEFAULT 0
)
RETURNS TABLE(allowed boolean, reason text, remaining_messages integer, remaining_ai integer)
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, private
AS $$ SELECT * FROM private.reserve_gmail_scan_work(p_user_id, p_scan_id, p_messages, p_ai_calls); $$;

REVOKE ALL ON FUNCTION public.reserve_gmail_scan_work(uuid, uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_gmail_scan_work(uuid, uuid, integer, integer) TO service_role;

CREATE FUNCTION private.release_gmail_scan(p_user_id uuid, p_scan_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE released_id uuid;
BEGIN
  UPDATE private.gmail_scan_control
  SET active_scan_id = NULL, lease_expires_at = NULL
  WHERE user_id = p_user_id AND active_scan_id = p_scan_id
  RETURNING user_id INTO released_id;
  RETURN released_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.release_gmail_scan(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.release_gmail_scan(uuid, uuid) TO service_role;

CREATE FUNCTION public.release_gmail_scan(p_user_id uuid, p_scan_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, private
AS $$ SELECT private.release_gmail_scan(p_user_id, p_scan_id); $$;

REVOKE ALL ON FUNCTION public.release_gmail_scan(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_gmail_scan(uuid, uuid) TO service_role;
