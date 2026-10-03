BEGIN;

-- Preserve admin-action audit rows while allowing the actor identity to be
-- removed with the Auth account.
ALTER TABLE public.auto_apply_job_admin_actions
  ALTER COLUMN actor_user_id DROP NOT NULL;
ALTER TABLE public.auto_apply_job_admin_actions
  DROP CONSTRAINT IF EXISTS auto_apply_job_admin_actions_actor_user_id_fkey;
ALTER TABLE public.auto_apply_job_admin_actions
  ADD CONSTRAINT auto_apply_job_admin_actions_actor_user_id_fkey
  FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- This service-only table is an idempotency cache, not the immutable audit
-- ledger. Account deletion may redact the actor and cached response payload.
ALTER TABLE private.admin_operation_requests
  ALTER COLUMN actor_user_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION private.guard_privacy_admin_operation_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  old_actor_id uuid;
  new_actor_id uuid;
  old_status text;
  new_status text;
  user_id_to_lock uuid;
  deletion_started boolean;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    old_actor_id := OLD.actor_user_id;
    old_status := OLD.status;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    new_actor_id := NEW.actor_user_id;
    new_status := NEW.status;
  END IF;

  FOR user_id_to_lock IN
    SELECT ids.user_id
    FROM pg_catalog.unnest(ARRAY[old_actor_id, new_actor_id]) AS ids(user_id)
    WHERE ids.user_id IS NOT NULL
    GROUP BY ids.user_id
    ORDER BY ids.user_id
  LOOP
    IF NOT private.lock_privacy_deletion_account(user_id_to_lock, false) THEN
      RAISE EXCEPTION USING
        ERRCODE = '55P03',
        MESSAGE = 'Privacy deletion is checking account eligibility; retry this change';
    END IF;
  END LOOP;

  IF new_actor_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.privacy_deletion_jobs job
      WHERE job.target_user_id = new_actor_id
        AND job.destructive_started_at IS NOT NULL
        AND job.status NOT IN ('completed', 'cancelled')
        AND NOT EXISTS (
          SELECT 1
          FROM public.privacy_deletion_jobs completed_job
          WHERE completed_job.target_user_id = new_actor_id
            AND completed_job.status = 'completed'
        )
    ) INTO deletion_started;

    IF deletion_started AND NOT (
      TG_OP = 'UPDATE'
      AND old_actor_id = new_actor_id
      AND old_status IN ('in_progress', 'pending_reconciliation', 'requested')
      AND new_status IN ('succeeded', 'failed', 'completed')
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'Privacy deletion has started; linked admin operations may only be resolved';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_privacy_admin_operation_mutation()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.redact_privacy_admin_actor(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
BEGIN
  UPDATE public.auto_apply_job_admin_actions
  SET actor_user_id = NULL
  WHERE actor_user_id = p_user_id;

  UPDATE private.admin_operation_requests
  SET actor_user_id = NULL,
      actor_email = NULL,
      idempotency_key = 'redacted:' || id::text,
      request_hash = repeat('0', 32),
      response_body = NULL,
      error_message = NULL
  WHERE actor_user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION private.redact_privacy_admin_actor(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS privacy_deletion_admin_operation_guard
  ON private.admin_operation_requests;
CREATE TRIGGER privacy_deletion_admin_operation_guard
BEFORE INSERT OR UPDATE OR DELETE ON private.admin_operation_requests
FOR EACH ROW EXECUTE FUNCTION private.guard_privacy_admin_operation_mutation();

DROP TRIGGER IF EXISTS privacy_deletion_auto_apply_admin_action_guard
  ON public.auto_apply_job_admin_actions;
CREATE TRIGGER privacy_deletion_auto_apply_admin_action_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.auto_apply_job_admin_actions
FOR EACH ROW EXECUTE FUNCTION private.guard_privacy_admin_operation_mutation();

CREATE OR REPLACE FUNCTION public.privacy_claim_deletion_execution(
  p_job_id uuid,
  p_worker_id text,
  p_lock_seconds integer DEFAULT 600
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  claim jsonb;
  job public.privacy_deletion_jobs%rowtype;
  active_admin boolean := false;
  active_manual_access boolean := false;
  pending_admin_operation boolean;
  blocker_code text;
BEGIN
  IF p_job_id IS NULL
    OR p_worker_id IS NULL
    OR length(btrim(p_worker_id)) NOT BETWEEN 8 AND 120
    OR p_lock_seconds IS NULL
    OR p_lock_seconds NOT BETWEEN 60 AND 3600 THEN
    RAISE EXCEPTION 'Invalid privacy deletion execution claim';
  END IF;

  SELECT * INTO job
  FROM public.privacy_deletion_jobs
  WHERE id = p_job_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('claimed', false, 'reason', 'not_available'); END IF;

  PERFORM private.lock_privacy_deletion_account(job.target_user_id, true);
  claim := public.privacy_claim_deletion_job(p_job_id, p_lock_seconds);
  IF coalesce((claim->>'claimed')::boolean, false) IS NOT TRUE THEN
    RETURN claim;
  END IF;

  IF job.current_step <> 'complete' THEN
    IF job.current_step NOT IN ('delete_auth', 'reconcile') THEN
      SELECT EXISTS (
        SELECT 1 FROM public.admin_members member
        WHERE member.user_id = job.target_user_id AND member.is_active
      ) INTO active_admin;
      SELECT EXISTS (
        SELECT 1 FROM public.billing_entitlements entitlement
        WHERE entitlement.user_id = job.target_user_id
          AND entitlement.provider = 'manual'
          AND entitlement.active
      ) OR EXISTS (
        SELECT 1 FROM public.manual_access_grants grant_row
        WHERE grant_row.user_id = job.target_user_id
          AND grant_row.revoked_at IS NULL
          AND grant_row.starts_at <= pg_catalog.clock_timestamp()
          AND (grant_row.expires_at IS NULL OR grant_row.expires_at > pg_catalog.clock_timestamp())
      ) INTO active_manual_access;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM private.admin_operation_requests operation
      WHERE operation.actor_user_id = job.target_user_id
        AND operation.status IN ('in_progress', 'pending_reconciliation')
    ) OR EXISTS (
      SELECT 1 FROM public.auto_apply_job_admin_actions action
      WHERE action.actor_user_id = job.target_user_id
        AND action.status IN ('requested', 'pending_reconciliation')
    ) INTO pending_admin_operation;

    blocker_code := CASE
      WHEN active_admin THEN 'active_admin_membership'
      WHEN active_manual_access THEN 'active_manual_access'
      WHEN pending_admin_operation THEN 'pending_admin_operation'
      ELSE NULL
    END;
    IF blocker_code IS NOT NULL THEN
      UPDATE public.privacy_deletion_jobs
      SET status = 'failed',
          current_step = CASE WHEN destructive_started_at IS NULL THEN 'preview' ELSE current_step END,
          failure_code = blocker_code,
          worker_id = NULL,
          worker_locked_until = NULL,
          locked_until = NULL,
          next_attempt_at = pg_catalog.clock_timestamp() + interval '1 year',
          updated_at = pg_catalog.clock_timestamp()
      WHERE id = job.id;
      RETURN claim || pg_catalog.jsonb_build_object('claimed', false, 'reason', blocker_code);
    END IF;
  END IF;

  IF job.current_step IN ('delete_auth', 'reconcile') THEN
    PERFORM private.redact_privacy_admin_actor(job.target_user_id);
  END IF;

  UPDATE public.privacy_deletion_jobs
  SET worker_id = btrim(p_worker_id),
      worker_locked_until = locked_until,
      destructive_started_at = coalesce(destructive_started_at, pg_catalog.clock_timestamp()),
      current_step = CASE
        WHEN current_step IN ('preview', 'provider_review', 'export_review') THEN 'delete_data'
        ELSE current_step
      END,
      updated_at = pg_catalog.clock_timestamp()
  WHERE id = p_job_id
    AND status = 'processing'
    AND locked_until IS NOT NULL
    AND locked_until > pg_catalog.clock_timestamp()
  RETURNING * INTO job;
  IF NOT FOUND THEN RAISE EXCEPTION 'Privacy deletion worker lease was lost'; END IF;

  RETURN claim || pg_catalog.jsonb_build_object(
    'workerId', job.worker_id,
    'step', job.current_step,
    'targetUserId', job.target_user_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.privacy_claim_deletion_execution(uuid, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.privacy_claim_deletion_execution(uuid, text, integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.privacy_delete_user_data(
  p_job_id uuid,
  p_worker_id text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  job public.privacy_deletion_jobs%rowtype;
  active_provider boolean;
  pending_provider_review boolean;
  active_hold boolean;
  deleted_user_id uuid;
BEGIN
  SELECT * INTO job
  FROM public.privacy_deletion_jobs
  WHERE id = p_job_id
    AND status = 'processing'
    AND worker_id = btrim(p_worker_id)
    AND worker_locked_until IS NOT NULL
    AND worker_locked_until > clock_timestamp()
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Privacy deletion worker lease is not valid'; END IF;
  IF job.current_step = 'delete_auth' THEN
    RETURN jsonb_build_object('jobId', job.id, 'targetUserId', job.target_user_id, 'authUserId', job.target_user_id, 'alreadyDeleted', true);
  END IF;
  IF job.current_step <> 'delete_data' THEN RAISE EXCEPTION 'Privacy deletion job is not at the data step'; END IF;
  IF job.owner_approved_at IS NULL THEN RAISE EXCEPTION 'Owner approval is required before deletion'; END IF;

  PERFORM private.lock_privacy_deletion_account(job.target_user_id, true);

  SELECT EXISTS (
    SELECT 1 FROM public.privacy_holds hold_row
    WHERE hold_row.target_user_id = job.target_user_id
      AND hold_row.released_at IS NULL
      AND (hold_row.expires_at IS NULL OR hold_row.expires_at > clock_timestamp())
  ) INTO active_hold;
  IF active_hold THEN RAISE EXCEPTION 'Privacy hold blocks deletion'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.billing_entitlements entitlement
    WHERE entitlement.user_id = job.target_user_id
      AND entitlement.provider IN ('stripe', 'paypal')
      AND entitlement.active
  ) INTO active_provider;
  SELECT EXISTS (
    SELECT 1 FROM public.privacy_provider_cancellation_reviews review
    WHERE review.deletion_job_id = job.id AND review.review_status = 'required'
  ) INTO pending_provider_review;
  IF active_provider OR pending_provider_review THEN
    RAISE EXCEPTION 'Provider cancellation reconciliation is required';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.admin_members member
    WHERE member.user_id = job.target_user_id AND member.is_active
  ) THEN
    RAISE EXCEPTION 'Active admin membership blocks account deletion';
  END IF;
  IF EXISTS (
    SELECT 1 FROM private.admin_operation_requests operation
    WHERE operation.actor_user_id = job.target_user_id
      AND operation.status IN ('in_progress', 'pending_reconciliation')
  ) OR EXISTS (
    SELECT 1 FROM public.auto_apply_job_admin_actions action
    WHERE action.actor_user_id = job.target_user_id
      AND action.status IN ('requested', 'pending_reconciliation')
  ) THEN
    RAISE EXCEPTION 'Pending admin operation blocks account deletion';
  END IF;

  -- Retain the action ledger, but unlink the deleted admin and clear the
  -- service-only idempotency cache's actor and potentially identifying payload.
  PERFORM private.redact_privacy_admin_actor(job.target_user_id);

  DELETE FROM public.support_conversations WHERE customer_user_id = job.target_user_id;
  DELETE FROM public.support_participants WHERE user_id = job.target_user_id;
  DELETE FROM public.support_read_cursors WHERE user_id = job.target_user_id;
  DELETE FROM public.support_operation_receipts WHERE actor_user_id = job.target_user_id;
  UPDATE public.support_conversation_events SET actor_user_id = NULL WHERE actor_user_id = job.target_user_id;
  UPDATE public.support_messages SET sender_user_id = NULL WHERE sender_user_id = job.target_user_id;
  UPDATE public.support_internal_notes SET agent_user_id = NULL WHERE agent_user_id = job.target_user_id;

  DELETE FROM public.auto_apply_jobs WHERE user_id = job.target_user_id;
  DELETE FROM public.auto_apply_runs WHERE user_id = job.target_user_id;
  DELETE FROM public.gmail_connections WHERE user_id = job.target_user_id;
  DELETE FROM public.job_applications WHERE user_id = job.target_user_id;
  DELETE FROM public.job_preferences WHERE user_id = job.target_user_id;
  DELETE FROM public.ai_generations WHERE user_id = job.target_user_id;

  UPDATE public.analytics_events SET actor_user_id = NULL WHERE actor_user_id = job.target_user_id;
  UPDATE public.app_error_events SET user_id = NULL, user_email = NULL WHERE user_id = job.target_user_id;
  UPDATE public.admin_audit_events SET admin_user_id = NULL WHERE admin_user_id = job.target_user_id;
  UPDATE public.admin_audit_events SET target_user_id = NULL WHERE target_user_id = job.target_user_id;
  UPDATE public.billing_subscriptions SET user_id = NULL WHERE user_id = job.target_user_id;
  UPDATE public.billing_transactions SET user_id = NULL WHERE user_id = job.target_user_id;

  UPDATE public.privacy_export_jobs
  SET status = 'expired',
      storage_path = NULL,
      failure_code = 'account_deletion_completed',
      updated_at = clock_timestamp()
  WHERE target_user_id = job.target_user_id
    AND status IN ('pending', 'processing', 'ready');

  UPDATE public.admin_members
  SET email = 'deleted-' || id::text || '@invalid.local',
      user_id = NULL,
      is_active = false,
      invitation_revoked_at = coalesce(invitation_revoked_at, clock_timestamp()),
      updated_at = clock_timestamp()
  WHERE user_id = job.target_user_id;

  DELETE FROM public.users WHERE id = job.target_user_id RETURNING id INTO deleted_user_id;
  IF deleted_user_id IS NULL THEN deleted_user_id := job.target_user_id; END IF;

  UPDATE public.privacy_deletion_jobs
  SET current_step = 'delete_auth', failure_code = NULL, updated_at = clock_timestamp()
  WHERE id = job.id;

  RETURN jsonb_build_object('jobId', job.id, 'targetUserId', job.target_user_id, 'authUserId', deleted_user_id, 'alreadyDeleted', false);
END;
$$;

REVOKE ALL ON FUNCTION public.privacy_delete_user_data(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.privacy_delete_user_data(uuid, text)
  TO service_role;

COMMIT;
