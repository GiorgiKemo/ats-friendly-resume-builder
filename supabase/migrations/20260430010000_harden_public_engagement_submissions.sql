-- Public engagement submissions now flow through the public-engagement
-- Edge Function so anonymous writes can be rate-limited before insertion.

CREATE TABLE IF NOT EXISTS public.public_engagement_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL CHECK (scope IN ('subscribeNewsletter', 'submitContactInquiry')),
  key_hash TEXT NOT NULL,
  email_hash TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  accepted BOOLEAN NOT NULL DEFAULT false,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_public_engagement_attempts_scope_key_created
  ON public.public_engagement_attempts (scope, key_hash, created_at DESC);

ALTER TABLE public.public_engagement_attempts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.public_engagement_attempts FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.public_engagement_attempts TO service_role;

DROP POLICY IF EXISTS "Public can create contact inquiries" ON public.contact_inquiries;
DROP POLICY IF EXISTS "Public can subscribe to newsletter" ON public.newsletter_subscribers;

REVOKE INSERT ON TABLE public.contact_inquiries FROM anon, authenticated;
REVOKE INSERT ON TABLE public.newsletter_subscribers FROM anon, authenticated;

GRANT INSERT, SELECT ON TABLE public.contact_inquiries TO service_role;
GRANT INSERT, SELECT ON TABLE public.newsletter_subscribers TO service_role;
