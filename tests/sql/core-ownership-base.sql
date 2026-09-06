-- Synthetic fixture for policy/grant proof, not a replacement Supabase schema.
ALTER TABLE public.users ADD COLUMN full_name text, ADD COLUMN avatar_url text;
CREATE TABLE public.resumes (id uuid PRIMARY KEY, user_id uuid REFERENCES public.users, is_public boolean DEFAULT false);
CREATE TABLE public.resume_content (id uuid PRIMARY KEY, resume_id uuid REFERENCES public.resumes, personal_info jsonb);
GRANT ALL ON public.users, public.resumes, public.resume_content TO anon, authenticated, service_role;
-- Simulate a permissive historical policy: restrictive owner boundaries must still win.
CREATE POLICY "Legacy broad users" ON public.users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Legacy broad resumes" ON public.resumes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Legacy broad content" ON public.resume_content FOR ALL USING (true) WITH CHECK (true);
CREATE SCHEMA storage;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
CREATE TABLE storage.buckets (id text PRIMARY KEY, name text NOT NULL, public boolean NOT NULL DEFAULT false);
CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text REFERENCES storage.buckets, name text NOT NULL);
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT string_to_array(name, '/') $$;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT ALL ON storage.objects TO anon, authenticated, service_role;
INSERT INTO storage.buckets VALUES ('resumes','resumes',true);
