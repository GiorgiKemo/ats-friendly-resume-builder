-- Complete profile snapshots require the revision actually loaded by the editor.
-- Coordinate rollout with the version-aware frontend; old updates fail closed.
ALTER TABLE public.user_profiles ADD COLUMN revision integer NOT NULL DEFAULT 1
  CONSTRAINT user_profiles_revision_positive CHECK (revision > 0);

REVOKE INSERT, UPDATE ON public.user_profiles FROM PUBLIC, anon, authenticated;
DO $column_grants$
DECLARE columns_sql text;
BEGIN
  SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum) INTO columns_sql
    FROM pg_attribute a WHERE a.attrelid = 'public.user_profiles'::regclass
      AND a.attnum > 0 AND NOT a.attisdropped;
  EXECUTE format('REVOKE INSERT (%s), UPDATE (%s) ON TABLE public.user_profiles FROM PUBLIC, anon, authenticated',
    columns_sql, columns_sql);
END;
$column_grants$;

CREATE FUNCTION private.save_user_profile_versioned(
  p_user_id uuid, p_personal jsonb, p_work_experience jsonb, p_education jsonb,
  p_skills jsonb, p_certifications jsonb, p_projects jsonb, p_languages jsonb,
  p_interests jsonb, p_reference_list jsonb,
  p_expected_profile_id uuid DEFAULT NULL, p_expected_revision integer DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE saved public.user_profiles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'You can only save your own profile' USING ERRCODE = '42501';
  END IF;
  IF (p_expected_profile_id IS NULL AND p_expected_revision IS NOT NULL)
    OR (p_expected_profile_id IS NOT NULL AND (p_expected_revision IS NULL OR p_expected_revision < 1)) THEN
    RAISE EXCEPTION 'PROFILE_VERSION_REQUIRED' USING ERRCODE = '22023',
      HINT = 'Load the profile identity and revision before saving an existing profile.';
  END IF;

  -- The parent lock also serializes callers that both loaded an absent profile.
  -- Keep the historical canonical row order; never delete legacy duplicates.
  PERFORM 1 FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'User profile is not ready' USING ERRCODE = '42501'; END IF;
  SELECT up.* INTO saved FROM public.user_profiles up WHERE up.user_id = p_user_id
    ORDER BY up.created_at, up.id LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    IF p_expected_profile_id IS DISTINCT FROM saved.id OR p_expected_revision IS DISTINCT FROM saved.revision THEN
      RAISE EXCEPTION 'PROFILE_CONFLICT' USING ERRCODE = 'PT409',
        HINT = 'This profile changed. Review the saved version without discarding your current edits.';
    END IF;
    UPDATE public.user_profiles up SET personal = p_personal, work_experience = p_work_experience,
      education = p_education, skills = p_skills, certifications = p_certifications,
      projects = p_projects, languages = p_languages, interests = p_interests,
      reference_list = p_reference_list, revision = up.revision + 1, updated_at = now()
      WHERE up.id = saved.id AND up.user_id = p_user_id AND up.revision = p_expected_revision
      RETURNING up.* INTO saved;
    IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_CONFLICT' USING ERRCODE = 'PT409'; END IF;
  ELSE
    IF p_expected_profile_id IS NOT NULL THEN
      RAISE EXCEPTION 'PROFILE_CONFLICT' USING ERRCODE = 'PT409',
        HINT = 'The loaded profile no longer exists. Reload before creating a new profile.';
    END IF;
    INSERT INTO public.user_profiles(user_id, personal, work_experience, education, skills,
      certifications, projects, languages, interests, reference_list)
      VALUES (p_user_id, p_personal, p_work_experience, p_education, p_skills,
        p_certifications, p_projects, p_languages, p_interests, p_reference_list)
      RETURNING * INTO saved;
  END IF;
  RETURN jsonb_build_object('profile_id', saved.id, 'revision', saved.revision, 'updated_at', saved.updated_at);
END;
$$;

CREATE FUNCTION public.save_user_profile_versioned(
  p_user_id uuid, p_personal jsonb, p_work_experience jsonb, p_education jsonb,
  p_skills jsonb, p_certifications jsonb, p_projects jsonb, p_languages jsonb,
  p_interests jsonb, p_reference_list jsonb,
  p_expected_profile_id uuid DEFAULT NULL, p_expected_revision integer DEFAULT NULL
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = pg_catalog
AS $$ SELECT private.save_user_profile_versioned(p_user_id, p_personal, p_work_experience,
  p_education, p_skills, p_certifications, p_projects, p_languages, p_interests,
  p_reference_list, p_expected_profile_id, p_expected_revision); $$;

-- Old clients may create only while no profile exists. Both public and private
-- legacy update paths reject instead of reading a revision on the caller's behalf.
CREATE OR REPLACE FUNCTION private.save_user_profile(
  p_user_id uuid, p_personal jsonb, p_work_experience jsonb, p_education jsonb,
  p_skills jsonb, p_certifications jsonb, p_projects jsonb, p_languages jsonb,
  p_interests jsonb, p_reference_list jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'You can only save your own profile' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'User profile is not ready' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.user_profiles WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'PROFILE_VERSION_REQUIRED' USING ERRCODE = '22023',
      HINT = 'Update this client and reload the profile before saving.';
  END IF;
  RETURN (private.save_user_profile_versioned(p_user_id, p_personal, p_work_experience,
    p_education, p_skills, p_certifications, p_projects, p_languages, p_interests,
    p_reference_list, NULL, NULL)->>'profile_id')::uuid;
END;
$$;

CREATE FUNCTION public.get_user_profile_versioned(p_user_id uuid)
RETURNS TABLE(id uuid, user_id uuid, personal jsonb, work_experience jsonb, education jsonb,
  skills jsonb, certifications jsonb, projects jsonb, languages jsonb, interests jsonb,
  reference_list jsonb, created_at timestamptz, updated_at timestamptz, revision integer)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = pg_catalog
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'You can only access your own profile' USING ERRCODE = '42501';
  END IF;
  -- One read-only snapshot contains all content and its matching revision.
  RETURN QUERY SELECT up.id, up.user_id, up.personal, up.work_experience, up.education,
    up.skills, up.certifications, up.projects, up.languages, up.interests,
    up.reference_list, up.created_at, up.updated_at, up.revision
    FROM public.user_profiles up WHERE up.user_id = p_user_id ORDER BY up.created_at, up.id LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.save_user_profile_versioned(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,uuid,integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.save_user_profile_versioned(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,uuid,integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_user_profile_versioned(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,uuid,integer)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.save_user_profile_versioned(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,uuid,integer)
  TO authenticated;
REVOKE ALL ON FUNCTION public.get_user_profile_versioned(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_profile_versioned(uuid) TO authenticated;
