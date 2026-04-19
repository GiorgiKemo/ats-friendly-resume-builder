-- Migration: Add job_applications table and application_analytics view
-- Tracks job applications linked to user accounts and optionally to resumes

-- =============================================================================
-- 1. Create job_applications table
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.job_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resume_id UUID REFERENCES public.resumes(id) ON DELETE SET NULL,
  company TEXT NOT NULL,
  position TEXT NOT NULL,
  job_url TEXT,
  status TEXT NOT NULL DEFAULT 'applied'
    CHECK (status IN ('saved', 'applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn')),
  applied_at TIMESTAMPTZ DEFAULT now(),
  response_at TIMESTAMPTZ,
  notes TEXT,
  job_description TEXT,
  salary_range TEXT,
  location TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Auto-update updated_at on row modification
DROP TRIGGER IF EXISTS update_job_applications_updated_at ON public.job_applications;
CREATE TRIGGER update_job_applications_updated_at
  BEFORE UPDATE ON public.job_applications
  FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

-- =============================================================================
-- 2. Indexes
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_job_applications_user_id
  ON public.job_applications (user_id);

CREATE INDEX IF NOT EXISTS idx_job_applications_status
  ON public.job_applications (status);

CREATE INDEX IF NOT EXISTS idx_job_applications_applied_at
  ON public.job_applications (applied_at);

-- =============================================================================
-- 3. Row Level Security
-- =============================================================================
ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own applications"
  ON public.job_applications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own applications"
  ON public.job_applications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own applications"
  ON public.job_applications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own applications"
  ON public.job_applications FOR DELETE
  USING (auth.uid() = user_id);

-- =============================================================================
-- 4. application_analytics view — aggregate stats per user
-- =============================================================================
CREATE OR REPLACE VIEW public.application_analytics AS
SELECT
  ja.user_id,

  -- Total applications
  COUNT(*)::INT AS total_applications,

  -- Breakdown by status as JSONB
  jsonb_object_agg(
    COALESCE(status_counts.status, 'none'),
    status_counts.cnt
  ) AS applications_by_status,

  -- Response rate: percentage of non-saved applications that received a response
  ROUND(
    CASE
      WHEN COUNT(*) FILTER (WHERE ja.status <> 'saved') = 0 THEN 0
      ELSE (
        COUNT(*) FILTER (WHERE ja.status <> 'saved' AND ja.response_at IS NOT NULL)::NUMERIC
        / COUNT(*) FILTER (WHERE ja.status <> 'saved')::NUMERIC
      ) * 100
    END,
    2
  ) AS response_rate,

  -- Average days between applied_at and response_at (only where both exist)
  ROUND(
    AVG(
      EXTRACT(EPOCH FROM (ja.response_at - ja.applied_at)) / 86400
    ) FILTER (WHERE ja.response_at IS NOT NULL AND ja.applied_at IS NOT NULL),
    1
  ) AS average_response_days,

  -- Applications created in the current week (ISO week, Mon–Sun)
  COUNT(*) FILTER (
    WHERE ja.applied_at >= date_trunc('week', CURRENT_DATE)
  )::INT AS applications_this_week,

  -- Applications created in the current calendar month
  COUNT(*) FILTER (
    WHERE ja.applied_at >= date_trunc('month', CURRENT_DATE)
  )::INT AS applications_this_month,

  -- Most frequently applied-for position
  (
    SELECT sub.position
    FROM public.job_applications sub
    WHERE sub.user_id = ja.user_id
    GROUP BY sub.position
    ORDER BY COUNT(*) DESC
    LIMIT 1
  ) AS most_applied_position

FROM public.job_applications ja
LEFT JOIN LATERAL (
  SELECT s.status, COUNT(*)::INT AS cnt
  FROM public.job_applications s
  WHERE s.user_id = ja.user_id
  GROUP BY s.status
) status_counts ON true
GROUP BY ja.user_id;

-- =============================================================================
-- 5. Grant SELECT on the view to authenticated users
-- =============================================================================
GRANT SELECT ON public.application_analytics TO authenticated;
