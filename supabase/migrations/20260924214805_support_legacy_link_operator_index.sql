CREATE INDEX IF NOT EXISTS support_legacy_inquiry_links_linked_by_idx
  ON public.support_legacy_inquiry_links (linked_by)
  WHERE linked_by IS NOT NULL;
