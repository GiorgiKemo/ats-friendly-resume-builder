-- Older production schemas still expose the original SECURITY DEFINER saves.
-- Route those signatures through the revision-aware legacy guards installed by
-- the two versioned-save migrations, matching the newer baseline's wrappers.
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION public.save_resume(
  p_user_id uuid, p_title text, p_description text, p_selected_template text, p_selected_font text,
  p_is_public boolean, p_personal_info jsonb, p_work_experience jsonb, p_education jsonb,
  p_skills jsonb, p_certifications jsonb, p_projects jsonb, p_additional_sections jsonb,
  p_resume_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = pg_catalog
AS $$ SELECT private.save_resume(p_user_id, p_title, p_description, p_selected_template,
  p_selected_font, p_is_public, p_personal_info, p_work_experience, p_education,
  p_skills, p_certifications, p_projects, p_additional_sections, p_resume_id); $$;

CREATE OR REPLACE FUNCTION public.save_user_profile(
  p_user_id uuid, p_personal jsonb, p_work_experience jsonb, p_education jsonb,
  p_skills jsonb, p_certifications jsonb, p_projects jsonb, p_languages jsonb,
  p_interests jsonb, p_reference_list jsonb
) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = pg_catalog
AS $$ SELECT private.save_user_profile(p_user_id, p_personal, p_work_experience,
  p_education, p_skills, p_certifications, p_projects, p_languages,
  p_interests, p_reference_list); $$;

REVOKE ALL ON FUNCTION private.save_resume(uuid,text,text,text,text,boolean,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.save_user_profile(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.save_resume(uuid,text,text,text,text,boolean,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.save_user_profile(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)
  TO authenticated;
REVOKE ALL ON FUNCTION public.save_resume(uuid,text,text,text,text,boolean,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.save_user_profile(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_resume(uuid,text,text,text,text,boolean,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_user_profile(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)
  TO authenticated;
