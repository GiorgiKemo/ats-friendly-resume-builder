-- Migration: Add auto-apply tables (job_preferences, auto_apply_jobs, auto_apply_runs)
-- Supports the automated job application feature

-- =============================================================================
-- 1. job_preferences — stores user's auto-apply configuration
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.job_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Job search criteria
  job_titles TEXT[] NOT NULL DEFAULT '{}',
  skills TEXT[] NOT NULL DEFAULT '{}',
  locations TEXT[] NOT NULL DEFAULT '{}',
  remote_preference TEXT NOT NULL DEFAULT 'any'
    CHECK (remote_preference IN ('remote', 'hybrid', 'onsite', 'any')),
  experience_level TEXT NOT NULL DEFAULT 'mid'
    CHECK (experience_level IN ('entry', 'mid', 'senior', 'lead', 'executive')),
  salary_min INTEGER,
  salary_max INTEGER,
  industries TEXT[] NOT NULL DEFAULT '{}',
  excluded_companies TEXT[] NOT NULL DEFAULT '{}',

  -- Auto-apply settings
  is_active BOOLEAN NOT NULL DEFAULT false,
  daily_limit INTEGER NOT NULL DEFAULT 10,
  speed TEXT NOT NULL DEFAULT 'moderate'
    CHECK (speed IN ('conservative', 'moderate', 'aggressive')),

  -- Email settings
  sender_name TEXT,
  reply_to_email TEXT,

  -- Resume to use
  default_resume_id UUID REFERENCES public.resumes(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

DROP TRIGGER IF EXISTS update_job_preferences_updated_at ON public.job_preferences;
CREATE TRIGGER update_job_preferences_updated_at
  BEFORE UPDATE ON public.job_preferences
  FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

-- =============================================================================
-- 2. auto_apply_jobs — discovered jobs and their application status
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.auto_apply_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Job details
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  location TEXT,
  salary_range TEXT,
  job_url TEXT,
  contact_email TEXT,
  job_description TEXT,

  -- Match & application info
  match_score INTEGER DEFAULT 0 CHECK (match_score >= 0 AND match_score <= 100),
  status TEXT NOT NULL DEFAULT 'discovered'
    CHECK (status IN ('discovered', 'queued', 'applying', 'applied', 'replied', 'interview', 'rejected', 'skipped', 'failed')),

  -- AI-generated content
  tailored_resume_id UUID REFERENCES public.resumes(id) ON DELETE SET NULL,
  cover_letter TEXT,

  -- Tracking
  applied_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  email_opened_at TIMESTAMPTZ,
  failure_reason TEXT,

  -- Source
  source TEXT DEFAULT 'jsearch',
  external_job_id TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

DROP TRIGGER IF EXISTS update_auto_apply_jobs_updated_at ON public.auto_apply_jobs;
CREATE TRIGGER update_auto_apply_jobs_updated_at
  BEFORE UPDATE ON public.auto_apply_jobs
  FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_auto_apply_jobs_user_id ON public.auto_apply_jobs (user_id);
CREATE INDEX IF NOT EXISTS idx_auto_apply_jobs_status ON public.auto_apply_jobs (status);
CREATE INDEX IF NOT EXISTS idx_auto_apply_jobs_created_at ON public.auto_apply_jobs (created_at);
CREATE INDEX IF NOT EXISTS idx_auto_apply_jobs_external_id ON public.auto_apply_jobs (external_job_id);

-- =============================================================================
-- 3. auto_apply_runs — logs of each auto-apply execution cycle
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.auto_apply_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,

  jobs_discovered INTEGER DEFAULT 0,
  jobs_applied INTEGER DEFAULT 0,
  jobs_skipped INTEGER DEFAULT 0,
  jobs_failed INTEGER DEFAULT 0,

  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  error_message TEXT,

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auto_apply_runs_user_id ON public.auto_apply_runs (user_id);

-- =============================================================================
-- 4. Row Level Security
-- =============================================================================
ALTER TABLE public.job_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auto_apply_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auto_apply_runs ENABLE ROW LEVEL SECURITY;

-- job_preferences policies
CREATE POLICY "Users can view their own preferences" ON public.job_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own preferences" ON public.job_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own preferences" ON public.job_preferences FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own preferences" ON public.job_preferences FOR DELETE USING (auth.uid() = user_id);

-- auto_apply_jobs policies
CREATE POLICY "Users can view their own auto-apply jobs" ON public.auto_apply_jobs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own auto-apply jobs" ON public.auto_apply_jobs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own auto-apply jobs" ON public.auto_apply_jobs FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own auto-apply jobs" ON public.auto_apply_jobs FOR DELETE USING (auth.uid() = user_id);

-- auto_apply_runs policies
CREATE POLICY "Users can view their own runs" ON public.auto_apply_runs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own runs" ON public.auto_apply_runs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own runs" ON public.auto_apply_runs FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =============================================================================
-- 5. Auto-apply dashboard stats view
-- =============================================================================
CREATE OR REPLACE VIEW public.auto_apply_stats AS
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
  ROUND(
    CASE
      WHEN COUNT(*) FILTER (WHERE aj.status = 'applied') = 0 THEN 0
      ELSE (COUNT(*) FILTER (WHERE aj.status IN ('replied', 'interview'))::NUMERIC / COUNT(*) FILTER (WHERE aj.status = 'applied')::NUMERIC) * 100
    END, 1
  ) AS response_rate,
  AVG(aj.match_score) FILTER (WHERE aj.status = 'applied')::INT AS avg_match_score
FROM public.auto_apply_jobs aj
GROUP BY aj.user_id;

GRANT SELECT ON public.auto_apply_stats TO authenticated;
