-- Allow failed Job Inbox scans to clear the cooldown lease so users can retry
-- immediately after a hard failure (instead of waiting 5 minutes under a
-- misleading "budget reached" message).

CREATE OR REPLACE FUNCTION private.abort_gmail_scan(p_user_id uuid, p_scan_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  control private.gmail_scan_control%ROWTYPE;
BEGIN
  SELECT * INTO control
  FROM private.gmail_scan_control
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF control.active_scan_id IS DISTINCT FROM p_scan_id THEN
    RETURN false;
  END IF;

  UPDATE private.gmail_scan_control
  SET active_scan_id = NULL,
      lease_expires_at = NULL,
      -- Undo the claim counters so a hard failure does not burn cooldown/quota.
      scans_started = greatest(scans_started - 1, 0),
      last_started_at = NULL
  WHERE user_id = p_user_id
    AND active_scan_id = p_scan_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION private.abort_gmail_scan(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.abort_gmail_scan(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.abort_gmail_scan(p_user_id uuid, p_scan_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, private
AS $$ SELECT private.abort_gmail_scan(p_user_id, p_scan_id); $$;

REVOKE ALL ON FUNCTION public.abort_gmail_scan(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.abort_gmail_scan(uuid, uuid) TO service_role;
