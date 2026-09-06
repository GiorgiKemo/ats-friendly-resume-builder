-- Optimistic concurrency for complete resume snapshots. Deploy this migration
-- with the version-aware frontend; old existing-resume updates fail closed.
ALTER TABLE public.resumes ADD COLUMN revision integer NOT NULL DEFAULT 1
  CONSTRAINT resumes_revision_positive CHECK (revision > 0);

-- Do not let historical table OR column grants bypass the versioned RPC.
-- Reads, the existing owner-checked delete RPC, and trusted backend writes stay.
REVOKE INSERT, UPDATE ON public.resumes, public.resume_content FROM PUBLIC, anon, authenticated;
DO $column_grants$
DECLARE relation_name text; columns_sql text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['resumes', 'resume_content'] LOOP
    SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum) INTO columns_sql
      FROM pg_attribute a
      WHERE a.attrelid = ('public.' || relation_name)::regclass AND a.attnum > 0 AND NOT a.attisdropped;
    EXECUTE format('REVOKE INSERT (%s), UPDATE (%s) ON TABLE public.%I FROM PUBLIC, anon, authenticated',
      columns_sql, columns_sql, relation_name);
  END LOOP;
END;
$column_grants$;

CREATE FUNCTION private.save_resume_versioned(
  p_user_id uuid, p_title text, p_description text, p_selected_template text, p_selected_font text,
  p_is_public boolean, p_personal_info jsonb, p_work_experience jsonb, p_education jsonb,
  p_skills jsonb, p_certifications jsonb, p_projects jsonb, p_additional_sections jsonb,
  p_resume_id uuid DEFAULT NULL, p_expected_revision integer DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE saved public.resumes%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'You can only save your own resumes' USING ERRCODE = '42501';
  END IF;

  IF p_resume_id IS NULL THEN
    IF p_expected_revision IS NOT NULL THEN
      RAISE EXCEPTION 'RESUME_VERSION_REQUIRED' USING ERRCODE = '22023',
        HINT = 'A new resume must not supply an expected revision.';
    END IF;
    INSERT INTO public.resumes(user_id, title, description, selected_template, selected_font, is_public)
      VALUES (p_user_id, p_title, p_description, p_selected_template, p_selected_font, p_is_public)
      RETURNING * INTO saved;
  ELSE
    IF p_expected_revision IS NULL OR p_expected_revision < 1 THEN
      RAISE EXCEPTION 'RESUME_VERSION_REQUIRED' USING ERRCODE = '22023',
        HINT = 'Load the resume revision before saving an existing resume.';
    END IF;

    -- Parent first, then content: same lock order as the owner-checked delete.
    -- A waiter observes the winner's new revision before it can change anything.
    SELECT r.* INTO saved FROM public.resumes r
      WHERE r.id = p_resume_id AND r.user_id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Resume not found or you do not have permission to update it' USING ERRCODE = '42501';
    END IF;
    IF saved.revision <> p_expected_revision THEN
      RAISE EXCEPTION 'RESUME_CONFLICT' USING ERRCODE = 'PT409',
        HINT = 'A newer version exists. Reload it or save your work as a separate resume.';
    END IF;

    UPDATE public.resumes r SET title = p_title, description = p_description,
      selected_template = p_selected_template, selected_font = p_selected_font,
      is_public = p_is_public, updated_at = now(), last_accessed_at = now(), revision = r.revision + 1
      WHERE r.id = p_resume_id AND r.user_id = p_user_id AND r.revision = p_expected_revision
      RETURNING r.* INTO saved;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'RESUME_CONFLICT' USING ERRCODE = 'PT409';
    END IF;
  END IF;

  -- Keep any historical duplicate content rows consistent without deleting data.
  -- Missing content is repaired atomically with the successful parent save.
  UPDATE public.resume_content SET personal_info = p_personal_info, work_experience = p_work_experience,
    education = p_education, skills = p_skills, certifications = p_certifications,
    projects = p_projects, additional_sections = p_additional_sections, updated_at = now()
    WHERE resume_id = saved.id;
  IF NOT FOUND THEN
    INSERT INTO public.resume_content(resume_id, personal_info, work_experience, education, skills,
      certifications, projects, additional_sections)
      VALUES (saved.id, p_personal_info, p_work_experience, p_education, p_skills,
        p_certifications, p_projects, p_additional_sections);
  END IF;

  RETURN jsonb_build_object('resume_id', saved.id, 'revision', saved.revision, 'updated_at', saved.updated_at);
END;
$$;

CREATE FUNCTION public.save_resume_versioned(
  p_user_id uuid, p_title text, p_description text, p_selected_template text, p_selected_font text,
  p_is_public boolean, p_personal_info jsonb, p_work_experience jsonb, p_education jsonb,
  p_skills jsonb, p_certifications jsonb, p_projects jsonb, p_additional_sections jsonb,
  p_resume_id uuid DEFAULT NULL, p_expected_revision integer DEFAULT NULL
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = pg_catalog
AS $$ SELECT private.save_resume_versioned(p_user_id, p_title, p_description, p_selected_template,
  p_selected_font, p_is_public, p_personal_info, p_work_experience, p_education, p_skills,
  p_certifications, p_projects, p_additional_sections, p_resume_id, p_expected_revision); $$;

-- Preserve the legacy create UUID result, but never infer the latest revision
-- for an unversioned update. Calling the private legacy function cannot bypass it.
CREATE OR REPLACE FUNCTION private.save_resume(
  p_user_id uuid, p_title text, p_description text, p_selected_template text, p_selected_font text,
  p_is_public boolean, p_personal_info jsonb, p_work_experience jsonb, p_education jsonb,
  p_skills jsonb, p_certifications jsonb, p_projects jsonb, p_additional_sections jsonb, p_resume_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'You can only save your own resumes' USING ERRCODE = '42501';
  END IF;
  IF p_resume_id IS NOT NULL THEN
    RAISE EXCEPTION 'RESUME_VERSION_REQUIRED' USING ERRCODE = '22023',
      HINT = 'Update this client and reload the resume before saving.';
  END IF;
  RETURN (private.save_resume_versioned(p_user_id, p_title, p_description, p_selected_template,
    p_selected_font, p_is_public, p_personal_info, p_work_experience, p_education, p_skills,
    p_certifications, p_projects, p_additional_sections, NULL, NULL)->>'resume_id')::uuid;
END;
$$;

-- A single SQL snapshot returns content and its parent revision together.
-- No last-accessed write, and no new overload of the historical read RPC.
CREATE FUNCTION public.get_resume_versioned(p_resume_id uuid)
RETURNS TABLE (
  id uuid, user_id uuid, title text, description text, selected_template text, selected_font text,
  is_public boolean, created_at timestamptz, updated_at timestamptz, last_accessed_at timestamptz,
  personal_info jsonb, work_experience jsonb, education jsonb, skills jsonb, certifications jsonb,
  projects jsonb, additional_sections jsonb, revision integer
) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog
AS $$
  SELECT r.id, r.user_id, r.title, r.description, r.selected_template, r.selected_font,
    r.is_public, r.created_at, r.updated_at, r.last_accessed_at,
    rc.personal_info, rc.work_experience, rc.education, rc.skills, rc.certifications,
    rc.projects, rc.additional_sections, r.revision
  FROM public.resumes r
  LEFT JOIN LATERAL (
    SELECT c.personal_info, c.work_experience, c.education, c.skills, c.certifications,
      c.projects, c.additional_sections
    FROM public.resume_content c WHERE c.resume_id = r.id
    ORDER BY c.updated_at DESC NULLS LAST, c.id LIMIT 1
  ) rc ON true
  WHERE r.id = p_resume_id AND r.user_id = (SELECT auth.uid());
$$;

CREATE OR REPLACE VIEW public.user_resumes WITH (security_invoker = on) AS
SELECT r.id, r.user_id, r.title, r.description, r.selected_template, r.selected_font,
  r.is_public, r.created_at, r.updated_at, r.last_accessed_at, u.email, u.full_name,
  rc.personal_info, rc.work_experience, rc.education, rc.skills, rc.certifications,
  rc.projects, rc.additional_sections, r.revision
FROM public.resumes r
JOIN public.users u ON r.user_id = u.id
LEFT JOIN public.resume_content rc ON r.id = rc.resume_id
WHERE r.user_id = (SELECT auth.uid());

REVOKE ALL ON FUNCTION public.save_resume_versioned(uuid,text,text,text,text,boolean,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,uuid,integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.save_resume_versioned(uuid,text,text,text,text,boolean,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,uuid,integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_resume_versioned(uuid,text,text,text,text,boolean,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,uuid,integer)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.save_resume_versioned(uuid,text,text,text,text,boolean,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,uuid,integer)
  TO authenticated;
REVOKE ALL ON FUNCTION public.get_resume_versioned(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_resume_versioned(uuid) TO authenticated;
REVOKE ALL ON public.user_resumes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.user_resumes TO authenticated;
