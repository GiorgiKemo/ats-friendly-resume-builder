-- Durable, audited admin controls for auto-apply jobs.
-- This ledger records operator intent separately from the user-owned job row.
-- It never authorizes an employer submission or represents reconciliation as
-- successful before a future worker has verified the external state.

CREATE TABLE IF NOT EXISTS public.auto_apply_job_admin_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id UUID NOT NULL UNIQUE REFERENCES private.admin_operation_requests(id) ON DELETE RESTRICT,
  job_id UUID NOT NULL REFERENCES public.auto_apply_jobs(id) ON DELETE CASCADE,
  actor_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN ('retry', 'cancel', 'reconcile')),
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'completed', 'failed', 'pending_reconciliation')),
  reason TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 500),
  result JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.auto_apply_job_admin_actions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.auto_apply_job_admin_actions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.auto_apply_job_admin_actions TO service_role;

CREATE INDEX IF NOT EXISTS auto_apply_job_admin_actions_job_idx
  ON public.auto_apply_job_admin_actions (job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS auto_apply_job_admin_actions_pending_idx
  ON public.auto_apply_job_admin_actions (status, created_at)
  WHERE status IN ('requested', 'pending_reconciliation');

DROP TRIGGER IF EXISTS update_auto_apply_job_admin_actions_updated_at ON public.auto_apply_job_admin_actions;
CREATE TRIGGER update_auto_apply_job_admin_actions_updated_at
  BEFORE UPDATE ON public.auto_apply_job_admin_actions
  FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

COMMENT ON TABLE public.auto_apply_job_admin_actions IS
  'Service-only audited admin intent for safe retry/cancel/reconcile boundaries; no row implies an external submission.';
