-- Migration: Add email tracking columns to auto_apply_jobs
-- Supports Brevo webhook tracking for opens, clicks, and reply detection

-- Add Brevo message ID for webhook correlation
ALTER TABLE public.auto_apply_jobs
  ADD COLUMN IF NOT EXISTS brevo_message_id TEXT;

-- Add email event tracking
ALTER TABLE public.auto_apply_jobs
  ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;

ALTER TABLE public.auto_apply_jobs
  ADD COLUMN IF NOT EXISTS email_delivered_at TIMESTAMPTZ;

ALTER TABLE public.auto_apply_jobs
  ADD COLUMN IF NOT EXISTS email_opened_count INTEGER DEFAULT 0;

ALTER TABLE public.auto_apply_jobs
  ADD COLUMN IF NOT EXISTS email_clicked_at TIMESTAMPTZ;

-- Index for webhook lookups by brevo_message_id
CREATE INDEX IF NOT EXISTS idx_auto_apply_jobs_brevo_message_id
  ON public.auto_apply_jobs (brevo_message_id)
  WHERE brevo_message_id IS NOT NULL;

-- Drop and recreate the stats view (column order changed, can't use CREATE OR REPLACE)
DROP VIEW IF EXISTS public.auto_apply_stats;
CREATE VIEW public.auto_apply_stats AS
SELECT
  aj.user_id,
  COUNT(*)::INT AS total_discovered,
  COUNT(*) FILTER (WHERE aj.status = 'applied')::INT AS total_applied,
  COUNT(*) FILTER (WHERE aj.status = 'replied')::INT AS total_replies,
  COUNT(*) FILTER (WHERE aj.status = 'interview')::INT AS total_interviews,
  COUNT(*) FILTER (WHERE aj.status = 'rejected')::INT AS total_rejected,
  COUNT(*) FILTER (WHERE aj.status = 'queued')::INT AS total_queued,
  COUNT(*) FILTER (WHERE aj.status = 'failed')::INT AS total_failed,
  COUNT(*) FILTER (WHERE aj.status IN ('applied', 'replied', 'interview') AND aj.applied_at >= CURRENT_DATE)::INT AS applied_today,
  COUNT(*) FILTER (WHERE aj.email_opened_count > 0)::INT AS total_opened,
  ROUND(
    CASE
      WHEN COUNT(*) FILTER (WHERE aj.status = 'applied') = 0 THEN 0
      ELSE (COUNT(*) FILTER (WHERE aj.status IN ('replied', 'interview'))::NUMERIC / COUNT(*) FILTER (WHERE aj.status = 'applied')::NUMERIC) * 100
    END, 1
  ) AS response_rate,
  ROUND(
    CASE
      WHEN COUNT(*) FILTER (WHERE aj.email_sent_at IS NOT NULL) = 0 THEN 0
      ELSE (COUNT(*) FILTER (WHERE aj.email_opened_count > 0)::NUMERIC / COUNT(*) FILTER (WHERE aj.email_sent_at IS NOT NULL)::NUMERIC) * 100
    END, 1
  ) AS open_rate,
  AVG(aj.match_score) FILTER (WHERE aj.status = 'applied')::INT AS avg_match_score
FROM public.auto_apply_jobs aj
GROUP BY aj.user_id;

GRANT SELECT ON public.auto_apply_stats TO authenticated;
