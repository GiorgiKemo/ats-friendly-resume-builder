-- Preserve historical contact submissions as source records. The normalized
-- email is only an indexed lookup key; it is never exposed to client roles.
ALTER TABLE public.contact_inquiries
  ADD COLUMN IF NOT EXISTS email_normalized TEXT
  GENERATED ALWAYS AS (lower(btrim(email))) STORED;

CREATE INDEX IF NOT EXISTS idx_contact_inquiries_email_normalized_created_at
  ON public.contact_inquiries (email_normalized, created_at DESC, id);

CREATE TABLE public.support_legacy_inquiry_links (
  contact_inquiry_id UUID PRIMARY KEY
    REFERENCES public.contact_inquiries(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL
    REFERENCES public.support_conversations(id) ON DELETE CASCADE,
  linked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX support_legacy_inquiry_links_conversation_idx
  ON public.support_legacy_inquiry_links (conversation_id, linked_at DESC);

ALTER TABLE public.support_legacy_inquiry_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_legacy_inquiry_links FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.support_legacy_inquiry_links FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.support_legacy_inquiry_links TO service_role;

COMMENT ON TABLE public.support_legacy_inquiry_links IS
  'One-to-one provenance links from historical contact form submissions to support conversations; inquiry content remains in contact_inquiries.';
