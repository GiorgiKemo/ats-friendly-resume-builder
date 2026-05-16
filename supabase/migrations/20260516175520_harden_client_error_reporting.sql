ALTER TABLE public.public_engagement_attempts
  DROP CONSTRAINT IF EXISTS public_engagement_attempts_scope_check;

ALTER TABLE public.public_engagement_attempts
  ADD CONSTRAINT public_engagement_attempts_scope_check
  CHECK (scope IN ('subscribeNewsletter', 'submitContactInquiry', 'reportClientError'));
