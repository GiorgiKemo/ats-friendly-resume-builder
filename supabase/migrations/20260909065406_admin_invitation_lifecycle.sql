-- Bound unlinked admin memberships to an explicit invitation lifecycle.
-- The existing admin_members row remains the access authority; these fields
-- only make pending access expiring and auditable.

ALTER TABLE public.admin_members
  ADD COLUMN IF NOT EXISTS invitation_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invitation_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invitation_revoked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_admin_members_pending_invitation
  ON public.admin_members (invitation_expires_at, created_at DESC)
  WHERE user_id IS NULL AND is_active = true;
