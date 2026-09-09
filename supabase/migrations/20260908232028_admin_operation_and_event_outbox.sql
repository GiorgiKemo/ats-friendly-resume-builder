-- Durable primitives for privileged admin operations and first-party events.
-- These tables are service-only. They do not grant an admin capability by
-- themselves; Edge Functions must still authenticate the current membership
-- and authorize the requested action.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO service_role;

CREATE TABLE IF NOT EXISTS private.admin_operation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL,
  actor_email text,
  action text NOT NULL CHECK (length(btrim(action)) BETWEEN 1 AND 120),
  idempotency_key text NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 200),
  request_hash text NOT NULL CHECK (length(btrim(request_hash)) BETWEEN 16 AND 128),
  status text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'succeeded', 'failed', 'pending_reconciliation')),
  response_body jsonb,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  UNIQUE (actor_user_id, idempotency_key)
);

ALTER TABLE private.admin_operation_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.admin_operation_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON private.admin_operation_requests TO service_role;
CREATE INDEX IF NOT EXISTS admin_operation_requests_expiry_idx
  ON private.admin_operation_requests (expires_at);

CREATE TABLE IF NOT EXISTS private.domain_event_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE CHECK (length(btrim(event_key)) BETWEEN 8 AND 240),
  event_name text NOT NULL CHECK (length(btrim(event_name)) BETWEEN 1 AND 120),
  event_version integer NOT NULL DEFAULT 1 CHECK (event_version > 0),
  actor_user_id uuid,
  entity_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'dispatched', 'failed', 'dead_letter')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  dispatched_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE private.domain_event_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.domain_event_outbox FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON private.domain_event_outbox TO service_role;
CREATE INDEX IF NOT EXISTS domain_event_outbox_dispatch_idx
  ON private.domain_event_outbox (status, available_at, created_at);

COMMENT ON TABLE private.admin_operation_requests IS
  'Service-only idempotency receipts for privileged admin mutations; never a capability grant.';
COMMENT ON TABLE private.domain_event_outbox IS
  'Service-only durable first-party event delivery queue; payloads must be allowlisted and minimized.';

CREATE FUNCTION private.reserve_admin_operation(
  p_actor_user_id uuid,
  p_actor_email text,
  p_action text,
  p_idempotency_key text,
  p_request_hash text
)
RETURNS TABLE(
  operation_id uuid,
  is_new boolean,
  status text,
  response_body jsonb,
  error_code text,
  error_message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private
AS $$
DECLARE
  operation private.admin_operation_requests%ROWTYPE;
  inserted boolean := false;
BEGIN
  IF p_actor_user_id IS NULL OR p_action IS NULL OR p_idempotency_key IS NULL OR p_request_hash IS NULL THEN
    RAISE EXCEPTION 'Invalid admin operation identity';
  END IF;

  INSERT INTO private.admin_operation_requests(
    actor_user_id, actor_email, action, idempotency_key, request_hash
  )
  VALUES (
    p_actor_user_id, left(p_actor_email, 320), p_action, p_idempotency_key, p_request_hash
  )
  ON CONFLICT (actor_user_id, idempotency_key) DO NOTHING
  RETURNING * INTO operation;

  IF FOUND THEN
    inserted := true;
  ELSE
    SELECT * INTO operation
      FROM private.admin_operation_requests
      WHERE actor_user_id = p_actor_user_id
        AND idempotency_key = p_idempotency_key
      FOR UPDATE;
  END IF;

  IF operation.request_hash <> p_request_hash OR operation.action <> p_action THEN
    RAISE EXCEPTION 'Idempotency key was already used with a different request';
  END IF;

  RETURN QUERY SELECT operation.id, inserted, operation.status, operation.response_body,
    operation.error_code, operation.error_message;
END;
$$;
REVOKE ALL ON FUNCTION private.reserve_admin_operation(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.reserve_admin_operation(uuid, text, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_admin_operation(
  p_actor_user_id uuid,
  p_actor_email text,
  p_action text,
  p_idempotency_key text,
  p_request_hash text
)
RETURNS TABLE(
  operation_id uuid,
  is_new boolean,
  status text,
  response_body jsonb,
  error_code text,
  error_message text
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, private
AS $$
  SELECT * FROM private.reserve_admin_operation(
    p_actor_user_id, p_actor_email, p_action, p_idempotency_key, p_request_hash
  );
$$;
REVOKE ALL ON FUNCTION public.reserve_admin_operation(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_admin_operation(uuid, text, text, text, text) TO service_role;

CREATE FUNCTION private.finish_admin_operation(
  p_actor_user_id uuid,
  p_idempotency_key text,
  p_request_hash text,
  p_status text,
  p_response_body jsonb DEFAULT NULL,
  p_error_code text DEFAULT NULL,
  p_error_message text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private
AS $$
DECLARE
  changed integer;
BEGIN
  UPDATE private.admin_operation_requests
  SET status = p_status,
      response_body = p_response_body,
      error_code = left(p_error_code, 120),
      error_message = left(p_error_message, 500),
      updated_at = now()
  WHERE actor_user_id = p_actor_user_id
    AND idempotency_key = p_idempotency_key
    AND request_hash = p_request_hash
    AND status = 'in_progress';
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed = 1;
END;
$$;
REVOKE ALL ON FUNCTION private.finish_admin_operation(uuid, text, text, text, jsonb, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.finish_admin_operation(uuid, text, text, text, jsonb, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.finish_admin_operation(
  p_actor_user_id uuid,
  p_idempotency_key text,
  p_request_hash text,
  p_status text,
  p_response_body jsonb DEFAULT NULL,
  p_error_code text DEFAULT NULL,
  p_error_message text DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, private
AS $$
  SELECT private.finish_admin_operation(
    p_actor_user_id, p_idempotency_key, p_request_hash, p_status,
    p_response_body, p_error_code, p_error_message
  );
$$;
REVOKE ALL ON FUNCTION public.finish_admin_operation(uuid, text, text, text, jsonb, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_admin_operation(uuid, text, text, text, jsonb, text, text) TO service_role;
