-- Harden exposed tables, fix analytics views, and add real public-site submission storage.

-- =============================================================================
-- Gmail connection hardening
-- =============================================================================

DROP POLICY IF EXISTS "Users can view own gmail connection" ON public.gmail_connections;
DROP POLICY IF EXISTS "Users can insert own gmail connection" ON public.gmail_connections;
DROP POLICY IF EXISTS "Users can update own gmail connection" ON public.gmail_connections;
DROP POLICY IF EXISTS "Users can delete own gmail connection" ON public.gmail_connections;

REVOKE ALL ON TABLE public.gmail_connections FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_gmail_connection_status()
RETURNS TABLE (
  email TEXT,
  is_active BOOLEAN,
  connected_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    gc.email,
    gc.is_active,
    gc.connected_at
  FROM public.gmail_connections gc
  WHERE gc.user_id = auth.uid()
  ORDER BY gc.connected_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_gmail_connection_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_gmail_connection_status() TO authenticated;

-- =============================================================================
-- Analytics views with correct aggregation + security_invoker
-- =============================================================================

DROP VIEW IF EXISTS public.application_analytics;
CREATE VIEW public.application_analytics
WITH (security_invoker = true)
AS
WITH status_counts AS (
  SELECT
    user_id,
    status,
    COUNT(*)::INT AS cnt
  FROM public.job_applications
  GROUP BY user_id, status
),
status_json AS (
  SELECT
    user_id,
    jsonb_object_agg(status, cnt ORDER BY status) AS applications_by_status
  FROM status_counts
  GROUP BY user_id
)
SELECT
  ja.user_id,
  COUNT(*)::INT AS total_applications,
  COALESCE(status_json.applications_by_status, '{}'::jsonb) AS applications_by_status,
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
  ROUND(
    AVG(
      EXTRACT(EPOCH FROM (ja.response_at - ja.applied_at)) / 86400
    ) FILTER (WHERE ja.response_at IS NOT NULL AND ja.applied_at IS NOT NULL)::NUMERIC,
    1
  ) AS average_response_days,
  COUNT(*) FILTER (
    WHERE ja.applied_at >= date_trunc('week', CURRENT_DATE)
  )::INT AS applications_this_week,
  COUNT(*) FILTER (
    WHERE ja.applied_at >= date_trunc('month', CURRENT_DATE)
  )::INT AS applications_this_month,
  (
    SELECT sub.position
    FROM public.job_applications sub
    WHERE sub.user_id = ja.user_id
    GROUP BY sub.position
    ORDER BY COUNT(*) DESC, sub.position
    LIMIT 1
  ) AS most_applied_position
FROM public.job_applications ja
LEFT JOIN status_json
  ON status_json.user_id = ja.user_id
GROUP BY ja.user_id, status_json.applications_by_status;

GRANT SELECT ON public.application_analytics TO authenticated;

DROP VIEW IF EXISTS public.auto_apply_stats;
CREATE VIEW public.auto_apply_stats
WITH (security_invoker = true)
AS
SELECT
  aj.user_id,
  COUNT(*)::INT AS total_discovered,
  COUNT(*) FILTER (WHERE aj.status = 'applied')::INT AS total_applied,
  COUNT(*) FILTER (WHERE aj.status = 'replied')::INT AS total_replies,
  COUNT(*) FILTER (WHERE aj.status = 'interview')::INT AS total_interviews,
  COUNT(*) FILTER (WHERE aj.status = 'rejected')::INT AS total_rejected,
  COUNT(*) FILTER (WHERE aj.status = 'queued')::INT AS total_queued,
  COUNT(*) FILTER (WHERE aj.status = 'failed')::INT AS total_failed,
  COUNT(*) FILTER (
    WHERE aj.status IN ('applied', 'replied', 'interview')
      AND aj.applied_at >= CURRENT_DATE
  )::INT AS applied_today,
  COUNT(*) FILTER (WHERE aj.email_opened_count > 0)::INT AS total_opened,
  ROUND(
    CASE
      WHEN COUNT(*) FILTER (WHERE aj.status = 'applied') = 0 THEN 0
      ELSE (
        COUNT(*) FILTER (WHERE aj.status IN ('replied', 'interview'))::NUMERIC
        / COUNT(*) FILTER (WHERE aj.status = 'applied')::NUMERIC
      ) * 100
    END,
    1
  ) AS response_rate,
  ROUND(
    CASE
      WHEN COUNT(*) FILTER (WHERE aj.email_sent_at IS NOT NULL) = 0 THEN 0
      ELSE (
        COUNT(*) FILTER (WHERE aj.email_opened_count > 0)::NUMERIC
        / COUNT(*) FILTER (WHERE aj.email_sent_at IS NOT NULL)::NUMERIC
      ) * 100
    END,
    1
  ) AS open_rate,
  AVG(aj.match_score) FILTER (WHERE aj.status = 'applied')::INT AS avg_match_score
FROM public.auto_apply_jobs aj
GROUP BY aj.user_id;

GRANT SELECT ON public.auto_apply_stats TO authenticated;

-- =============================================================================
-- Public-site submissions
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.contact_inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'website',
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'read', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_inquiries_created_at
  ON public.contact_inquiries (created_at DESC);

ALTER TABLE public.contact_inquiries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can create contact inquiries" ON public.contact_inquiries;
CREATE POLICY "Public can create contact inquiries"
  ON public.contact_inquiries
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    char_length(name) BETWEEN 1 AND 200
    AND char_length(subject) BETWEEN 1 AND 200
    AND char_length(message) BETWEEN 1 AND 5000
    AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  );

REVOKE ALL ON TABLE public.contact_inquiries FROM anon, authenticated;
GRANT INSERT ON TABLE public.contact_inquiries TO anon, authenticated;

CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL DEFAULT 'footer',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'unsubscribed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS update_newsletter_subscribers_updated_at ON public.newsletter_subscribers;
CREATE TRIGGER update_newsletter_subscribers_updated_at
  BEFORE UPDATE ON public.newsletter_subscribers
  FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_status
  ON public.newsletter_subscribers (status);

ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can subscribe to newsletter" ON public.newsletter_subscribers;
CREATE POLICY "Public can subscribe to newsletter"
  ON public.newsletter_subscribers
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    email = lower(email)
    AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    AND status = 'active'
  );

REVOKE ALL ON TABLE public.newsletter_subscribers FROM anon, authenticated;
GRANT INSERT ON TABLE public.newsletter_subscribers TO anon, authenticated;
