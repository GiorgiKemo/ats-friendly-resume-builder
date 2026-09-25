-- Job Inbox: durable email events, application dedupe keys, hunt stats RPC.
-- Stats count applications (company+role), never raw emails.

-- =============================================================================
-- 1. Extend job_applications for inbox linkage + dedupe
-- =============================================================================
ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS dedupe_key text,
  ADD COLUMN IF NOT EXISTS gmail_thread_id text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS last_email_at timestamptz,
  ADD COLUMN IF NOT EXISTS previous_status text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'job_applications_source_check'
  ) THEN
    ALTER TABLE public.job_applications
      ADD CONSTRAINT job_applications_source_check
      CHECK (source IN ('manual', 'inbox', 'auto_apply'));
  END IF;
END $$;

-- Backfill dedupe keys for existing rows (normalized lowercase company|position).
UPDATE public.job_applications
SET dedupe_key = lower(trim(regexp_replace(company, '\s+', ' ', 'g')))
  || '|' ||
  lower(trim(regexp_replace(position, '\s+', ' ', 'g')))
WHERE dedupe_key IS NULL
  AND company IS NOT NULL
  AND position IS NOT NULL
  AND length(trim(company)) > 0
  AND length(trim(position)) > 0;

-- Clear duplicate keys so the unique index can be created (keep oldest row's key).
WITH ranked AS (
  SELECT id,
    row_number() OVER (
      PARTITION BY user_id, dedupe_key
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM public.job_applications
  WHERE dedupe_key IS NOT NULL
)
UPDATE public.job_applications ja
SET dedupe_key = NULL
FROM ranked
WHERE ja.id = ranked.id
  AND ranked.rn > 1;

-- One application per user per company+role when dedupe_key is set.
CREATE UNIQUE INDEX IF NOT EXISTS idx_job_applications_user_dedupe_key
  ON public.job_applications (user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_job_applications_gmail_thread
  ON public.job_applications (user_id, gmail_thread_id)
  WHERE gmail_thread_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_job_applications_last_email_at
  ON public.job_applications (user_id, last_email_at DESC NULLS LAST);

-- =============================================================================
-- 2. job_inbox_events — one row per Gmail message (never counted as apps)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.job_inbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gmail_message_id text NOT NULL,
  gmail_thread_id text,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_email text,
  to_email text,
  subject text,
  snippet text,
  internal_date timestamptz,
  category text NOT NULL DEFAULT 'unknown'
    CHECK (category IN (
      'application_sent',
      'application_receipt',
      'reply',
      'interview',
      'rejection',
      'offer',
      'recruiter_outreach',
      'noise',
      'unknown'
    )),
  confidence numeric(4,3) NOT NULL DEFAULT 0
    CHECK (confidence >= 0 AND confidence <= 1),
  application_id uuid REFERENCES public.job_applications(id) ON DELETE SET NULL,
  dedupe_key text,
  company_guess text,
  position_guess text,
  classifier_reason text,
  raw_classifier jsonb NOT NULL DEFAULT '{}'::jsonb,
  status_applied boolean NOT NULL DEFAULT false,
  previous_application_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_inbox_events_user_message_unique UNIQUE (user_id, gmail_message_id)
);

CREATE INDEX IF NOT EXISTS idx_job_inbox_events_user_created
  ON public.job_inbox_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_inbox_events_user_category
  ON public.job_inbox_events (user_id, category);

CREATE INDEX IF NOT EXISTS idx_job_inbox_events_application
  ON public.job_inbox_events (application_id)
  WHERE application_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_job_inbox_events_thread
  ON public.job_inbox_events (user_id, gmail_thread_id)
  WHERE gmail_thread_id IS NOT NULL;

ALTER TABLE public.job_inbox_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own inbox events"
  ON public.job_inbox_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own inbox events"
  ON public.job_inbox_events FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own inbox events"
  ON public.job_inbox_events FOR DELETE
  USING (auth.uid() = user_id);

-- Inserts are performed by the Edge Function with the service role.
REVOKE INSERT ON public.job_inbox_events FROM anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.job_inbox_events TO authenticated;
GRANT ALL ON public.job_inbox_events TO service_role;

-- =============================================================================
-- 3. Hunt stats RPC — application-level, not email-level
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_job_inbox_stats(p_user_id uuid DEFAULT NULL)
RETURNS TABLE (
  total_applied integer,
  got_reply integer,
  interviews integer,
  waiting integer,
  rejections integer,
  offers integer,
  withdrawn integer,
  saved integer,
  reply_rate integer,
  interview_rate integer
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  uid uuid := COALESCE(p_user_id, auth.uid());
  v_total integer := 0;
  v_reply integer := 0;
  v_interviews integer := 0;
  v_waiting integer := 0;
  v_rejections integer := 0;
  v_offers integer := 0;
  v_withdrawn integer := 0;
  v_saved integer := 0;
BEGIN
  IF uid IS NULL THEN
    RETURN QUERY SELECT 0, 0, 0, 0, 0, 0, 0, 0, 0, 0;
    RETURN;
  END IF;

  -- Callers may only request their own stats (service_role may pass any uid).
  IF auth.uid() IS NOT NULL AND auth.uid() <> uid AND current_user <> 'service_role' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE status <> 'saved')::integer,
    COUNT(*) FILTER (
      WHERE status <> 'saved'
        AND (
          response_at IS NOT NULL
          OR status IN ('screening', 'interview', 'offer', 'rejected')
        )
    )::integer,
    COUNT(*) FILTER (WHERE status IN ('interview', 'offer'))::integer,
    COUNT(*) FILTER (WHERE status = 'applied')::integer,
    COUNT(*) FILTER (WHERE status = 'rejected')::integer,
    COUNT(*) FILTER (WHERE status = 'offer')::integer,
    COUNT(*) FILTER (WHERE status = 'withdrawn')::integer,
    COUNT(*) FILTER (WHERE status = 'saved')::integer
  INTO
    v_total, v_reply, v_interviews, v_waiting, v_rejections, v_offers, v_withdrawn, v_saved
  FROM public.job_applications
  WHERE user_id = uid;

  RETURN QUERY SELECT
    v_total,
    v_reply,
    v_interviews,
    v_waiting,
    v_rejections,
    v_offers,
    v_withdrawn,
    v_saved,
    CASE WHEN v_total = 0 THEN 0 ELSE round((v_reply::numeric / v_total::numeric) * 100)::integer END,
    CASE WHEN v_total = 0 THEN 0 ELSE round((v_interviews::numeric / v_total::numeric) * 100)::integer END;
END;
$$;

REVOKE ALL ON FUNCTION public.get_job_inbox_stats(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_job_inbox_stats(uuid) TO authenticated, service_role;

COMMENT ON TABLE public.job_inbox_events IS
  'Durable Gmail message classifications for Job Inbox. One row per message; stats count job_applications, not these events.';
COMMENT ON COLUMN public.job_applications.dedupe_key IS
  'Normalized company|position key preventing double-counting send+reply for the same role.';
