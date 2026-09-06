-- Recover schema omitted when supabase/schema.sql was removed from migrations.
-- Provenance: 7c2bc0cad0f6123b53d7ced4f1da16dc56787402:supabase/schema.sql.
-- Preserve caller signatures/data shapes, but do not restore public definer RPCs,
-- NULL-unsafe auth checks, broad grants, debug PII, or read-before-write races.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated, service_role, supabase_auth_admin;

CREATE TABLE IF NOT EXISTS public.templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, description text,
  preview_image_url text, is_premium boolean DEFAULT false, is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id text PRIMARY KEY, name text NOT NULL, description text, price_monthly integer NOT NULL,
  price_yearly integer, features jsonb DEFAULT '[]'::jsonb, ai_generations_limit integer DEFAULT 0,
  is_active boolean DEFAULT true, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  personal jsonb DEFAULT '{}'::jsonb, work_experience jsonb DEFAULT '[]'::jsonb,
  education jsonb DEFAULT '[]'::jsonb, skills jsonb DEFAULT '[]'::jsonb,
  certifications jsonb DEFAULT '[]'::jsonb, projects jsonb DEFAULT '[]'::jsonb,
  languages jsonb DEFAULT '[]'::jsonb, interests jsonb DEFAULT '[]'::jsonb,
  reference_list jsonb DEFAULT '[]'::jsonb, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.ai_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  resume_id uuid REFERENCES public.resumes(id) ON DELETE CASCADE, prompt text, result jsonb,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_generations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.templates, public.subscription_plans, public.user_profiles, public.ai_generations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.templates, public.subscription_plans, public.user_profiles, public.ai_generations TO authenticated;
GRANT ALL ON public.templates, public.subscription_plans, public.user_profiles, public.ai_generations TO service_role;
CREATE POLICY "Baseline templates read" ON public.templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Baseline plans read" ON public.subscription_plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "Baseline profile read" ON public.user_profiles FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "Baseline profile boundary" ON public.user_profiles AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "Baseline generations read" ON public.ai_generations FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "Baseline generations boundary" ON public.ai_generations AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_owner ON public.user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_resume_content_resume ON public.resume_content(resume_id);
CREATE INDEX IF NOT EXISTS idx_resumes_owner ON public.resumes(user_id);

CREATE OR REPLACE FUNCTION private.save_resume(
  p_user_id uuid, p_title text, p_description text, p_selected_template text, p_selected_font text,
  p_is_public boolean, p_personal_info jsonb, p_work_experience jsonb, p_education jsonb,
  p_skills jsonb, p_certifications jsonb, p_projects jsonb, p_additional_sections jsonb, p_resume_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE saved_id uuid;
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'You can only save your own resumes' USING ERRCODE = '42501'; END IF;
  IF p_resume_id IS NOT NULL THEN
    UPDATE public.resumes SET title=p_title, description=p_description, selected_template=p_selected_template,
      selected_font=p_selected_font, is_public=p_is_public, updated_at=now(), last_accessed_at=now()
      WHERE id=p_resume_id AND user_id=p_user_id RETURNING id INTO saved_id;
    IF saved_id IS NULL THEN RAISE EXCEPTION 'Resume not found or you do not have permission to update it' USING ERRCODE='42501'; END IF;
    UPDATE public.resume_content SET personal_info=p_personal_info, work_experience=p_work_experience,
      education=p_education, skills=p_skills, certifications=p_certifications, projects=p_projects,
      additional_sections=p_additional_sections, updated_at=now() WHERE resume_id=saved_id;
    IF FOUND THEN RETURN saved_id; END IF;
  ELSE
    INSERT INTO public.resumes(user_id,title,description,selected_template,selected_font,is_public)
      VALUES(p_user_id,p_title,p_description,p_selected_template,p_selected_font,p_is_public) RETURNING id INTO saved_id;
  END IF;
  INSERT INTO public.resume_content(resume_id,personal_info,work_experience,education,skills,certifications,projects,additional_sections)
    VALUES(saved_id,p_personal_info,p_work_experience,p_education,p_skills,p_certifications,p_projects,p_additional_sections);
  RETURN saved_id;
END;
$$;
CREATE OR REPLACE FUNCTION public.save_resume(
  p_user_id uuid, p_title text, p_description text, p_selected_template text, p_selected_font text,
  p_is_public boolean, p_personal_info jsonb, p_work_experience jsonb, p_education jsonb,
  p_skills jsonb, p_certifications jsonb, p_projects jsonb, p_additional_sections jsonb, p_resume_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = pg_catalog, private
AS $$ SELECT private.save_resume(p_user_id,p_title,p_description,p_selected_template,p_selected_font,p_is_public,
  p_personal_info,p_work_experience,p_education,p_skills,p_certifications,p_projects,p_additional_sections,p_resume_id); $$;

CREATE OR REPLACE FUNCTION private.delete_resume(p_resume_id uuid, p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'You can only delete your own resumes' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.resumes WHERE id=p_resume_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Resume not found or you do not have permission to delete it' USING ERRCODE='42501'; END IF;
  DELETE FROM public.resume_content WHERE resume_id=p_resume_id;
  DELETE FROM public.resumes WHERE id=p_resume_id AND user_id=p_user_id;
  RETURN true;
END;
$$;
CREATE OR REPLACE FUNCTION public.delete_resume(p_resume_id uuid,p_user_id uuid)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog,private
AS $$ SELECT private.delete_resume(p_resume_id,p_user_id); $$;

CREATE OR REPLACE FUNCTION private.save_user_profile(
  p_user_id uuid,p_personal jsonb,p_work_experience jsonb,p_education jsonb,p_skills jsonb,p_certifications jsonb,
  p_projects jsonb,p_languages jsonb,p_interests jsonb,p_reference_list jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
DECLARE profile_id uuid;
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'You can only save your own profile' USING ERRCODE='42501'; END IF;
  -- A stable parent-row lock also serializes first-profile creation without deleting legacy duplicates.
  PERFORM 1 FROM public.users WHERE id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'User profile is not ready'; END IF;
  SELECT id INTO profile_id FROM public.user_profiles WHERE user_id=p_user_id ORDER BY created_at,id LIMIT 1;
  IF profile_id IS NOT NULL THEN
    UPDATE public.user_profiles SET personal=p_personal,work_experience=p_work_experience,education=p_education,
      skills=p_skills,certifications=p_certifications,projects=p_projects,languages=p_languages,
      interests=p_interests,reference_list=p_reference_list,updated_at=now() WHERE id=profile_id;
  ELSE
    INSERT INTO public.user_profiles(user_id,personal,work_experience,education,skills,certifications,projects,languages,interests,reference_list)
      VALUES(p_user_id,p_personal,p_work_experience,p_education,p_skills,p_certifications,p_projects,p_languages,p_interests,p_reference_list)
      RETURNING id INTO profile_id;
  END IF;
  RETURN profile_id;
END;
$$;
CREATE OR REPLACE FUNCTION public.save_user_profile(
  p_user_id uuid,p_personal jsonb,p_work_experience jsonb,p_education jsonb,p_skills jsonb,p_certifications jsonb,
  p_projects jsonb,p_languages jsonb,p_interests jsonb,p_reference_list jsonb
) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog,private
AS $$ SELECT private.save_user_profile(p_user_id,p_personal,p_work_experience,p_education,p_skills,p_certifications,p_projects,p_languages,p_interests,p_reference_list); $$;

CREATE OR REPLACE FUNCTION public.get_user_profile(p_user_id uuid)
RETURNS TABLE(id uuid,user_id uuid,personal jsonb,work_experience jsonb,education jsonb,skills jsonb,
  certifications jsonb,projects jsonb,languages jsonb,interests jsonb,reference_list jsonb,created_at timestamptz,updated_at timestamptz)
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'You can only access your own profile' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT up.id,up.user_id,up.personal,up.work_experience,up.education,up.skills,up.certifications,
    up.projects,up.languages,up.interests,up.reference_list,up.created_at,up.updated_at
    FROM public.user_profiles up WHERE up.user_id=p_user_id ORDER BY up.created_at,up.id LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_resume_exists(p_resume_id uuid)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog,public
AS $$ SELECT EXISTS(SELECT 1 FROM public.resumes WHERE id=p_resume_id AND user_id=auth.uid()); $$;
REVOKE ALL ON FUNCTION public.check_resume_exists(uuid) FROM PUBLIC,anon,authenticated;

-- Auth-trigger side effects keep their privileged body private and never log metadata.
CREATE OR REPLACE FUNCTION private.create_auth_profile(p_id uuid,p_email text,p_metadata jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public
AS $$ INSERT INTO public.users(id,email,full_name,avatar_url,is_premium,ai_generations_limit)
  VALUES(p_id,p_email,p_metadata->>'full_name',p_metadata->>'avatar_url',false,0); $$;
CREATE OR REPLACE FUNCTION private.update_auth_profile_email(p_id uuid,p_email text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public
AS $$ UPDATE public.users SET email=p_email,updated_at=now() WHERE id=p_id; $$;
REVOKE ALL ON FUNCTION private.create_auth_profile(uuid,text,jsonb),private.update_auth_profile_email(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.create_auth_profile(uuid,text,jsonb),private.update_auth_profile_email(uuid,text) TO service_role,supabase_auth_admin;
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,private
AS $$ BEGIN PERFORM private.create_auth_profile(NEW.id,NEW.email,NEW.raw_user_meta_data); RETURN NEW; END; $$;
CREATE OR REPLACE FUNCTION public.handle_user_update()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,private
AS $$ BEGIN PERFORM private.update_auth_profile_email(NEW.id,NEW.email); RETURN NEW; END; $$;
REVOKE ALL ON FUNCTION public.handle_new_user(),public.handle_user_update() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated AFTER UPDATE ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_user_update();

DO $grants$
DECLARE signature text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'save_resume(uuid,text,text,text,text,boolean,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,uuid)',
    'delete_resume(uuid,uuid)',
    'save_user_profile(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)'
  ] LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION public.'||signature||' FROM PUBLIC,anon,authenticated';
    EXECUTE 'REVOKE ALL ON FUNCTION private.'||signature||' FROM PUBLIC,anon,authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.'||signature||' TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION private.'||signature||' TO authenticated';
  END LOOP;
END;
$grants$;
REVOKE ALL ON FUNCTION public.get_user_profile(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_profile(uuid) TO authenticated;
