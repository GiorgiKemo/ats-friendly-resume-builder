CREATE INDEX IF NOT EXISTS idx_public_engagement_attempts_scope_email_created
  ON public.public_engagement_attempts (scope, email_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_public_engagement_attempts_scope_ip_created
  ON public.public_engagement_attempts (scope, ip_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_public_engagement_attempts_scope_created
  ON public.public_engagement_attempts (scope, created_at DESC);
