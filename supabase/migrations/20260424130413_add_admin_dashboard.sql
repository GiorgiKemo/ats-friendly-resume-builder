-- Admin dashboard support: admin allowlist, audit events, and client error reports.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.admin_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  role TEXT NOT NULL DEFAULT 'admin'
    CHECK (role IN ('owner', 'admin', 'support')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_members_user_id
  ON public.admin_members (user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_admin_members_email_active
  ON public.admin_members (lower(email), is_active);

DROP TRIGGER IF EXISTS update_admin_members_updated_at ON public.admin_members;
CREATE TRIGGER update_admin_members_updated_at
  BEFORE UPDATE ON public.admin_members
  FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

ALTER TABLE public.admin_members ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.admin_members FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.admin_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  target_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_events_created_at
  ON public.admin_audit_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_events_target_user_id
  ON public.admin_audit_events (target_user_id)
  WHERE target_user_id IS NOT NULL;

ALTER TABLE public.admin_audit_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.admin_audit_events FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.app_error_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT,
  severity TEXT NOT NULL DEFAULT 'error'
    CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  source TEXT NOT NULL DEFAULT 'client',
  message TEXT NOT NULL,
  stack TEXT,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  url TEXT,
  user_agent TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_error_events_created_at
  ON public.app_error_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_error_events_user_id
  ON public.app_error_events (user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_app_error_events_unresolved
  ON public.app_error_events (created_at DESC)
  WHERE resolved_at IS NULL;

ALTER TABLE public.app_error_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.app_error_events FROM anon, authenticated;

-- Bootstrap the requested owner account. The app also checks admin_members by
-- verified auth email, so this grants access even if the JWT needs a refresh.
INSERT INTO public.admin_members (email, user_id, role, is_active)
SELECT lower(email), id, 'owner', true
FROM auth.users
WHERE lower(email) = lower('contact@giorgi.codes')
ON CONFLICT (email) DO UPDATE
SET
  user_id = EXCLUDED.user_id,
  role = 'owner',
  is_active = true,
  updated_at = now();

UPDATE auth.users
SET raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('role', 'owner', 'is_admin', true)
WHERE lower(email) = lower('contact@giorgi.codes');
