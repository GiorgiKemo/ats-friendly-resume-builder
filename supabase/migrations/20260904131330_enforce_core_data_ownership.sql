-- Reproduce core privacy invariants in migrations instead of relying on dashboard state.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume_content ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.users, public.resumes, public.resume_content FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.users, public.resumes, public.resume_content TO authenticated;
GRANT UPDATE (full_name, avatar_url) ON public.users TO authenticated;
GRANT ALL ON public.users, public.resumes, public.resume_content TO service_role;

-- Column grants, not a recursive comparison with the row being updated, protect billing fields.
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = id) WITH CHECK ((SELECT auth.uid()) = id);
CREATE POLICY "Core profile owner read" ON public.users FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = id);
CREATE POLICY "Core profile owner boundary" ON public.users AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = id) WITH CHECK ((SELECT auth.uid()) = id);

-- Browser writes already use owner-checking RPCs. Direct table access is read-only.
CREATE POLICY "Core resume owner read" ON public.resumes FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "Core resume owner boundary" ON public.resumes AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "Core content owner read" ON public.resume_content FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.resumes r WHERE r.id = resume_id AND r.user_id = (SELECT auth.uid())));
CREATE POLICY "Core content owner boundary" ON public.resume_content AS RESTRICTIVE FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.resumes r WHERE r.id = resume_id AND r.user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.resumes r WHERE r.id = resume_id AND r.user_id = (SELECT auth.uid())));

-- Public buckets bypass object SELECT policies. Resume PDFs must use signed URLs.
INSERT INTO storage.buckets (id, name, public) VALUES ('resumes', 'resumes', false)
  ON CONFLICT (id) DO UPDATE SET public = false;
CREATE POLICY "Resume storage owner boundary" ON storage.objects AS RESTRICTIVE FOR ALL TO PUBLIC
  USING (bucket_id <> 'resumes' OR (SELECT auth.uid())::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id <> 'resumes' OR (SELECT auth.uid())::text = (storage.foldername(name))[1]);
