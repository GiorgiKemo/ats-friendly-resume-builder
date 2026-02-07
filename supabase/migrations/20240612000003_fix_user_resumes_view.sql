-- Use DO block to handle errors gracefully
DO $$
DECLARE
  view_exists boolean;
BEGIN
  -- Check if the view exists
  SELECT EXISTS(
    SELECT 1
    FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'user_resumes'
  ) INTO view_exists;

  IF view_exists THEN
    -- Drop the existing view
    EXECUTE 'DROP VIEW IF EXISTS public.user_resumes';

    -- Recreate the view with SECURITY INVOKER
    EXECUTE '
    CREATE OR REPLACE VIEW public.user_resumes
    WITH (security_invoker = on) AS
    SELECT
      r.id,
      r.user_id,
      r.title,
      r.description,
      r.selected_template,
      r.selected_font,
      r.is_public,
      r.created_at,
      r.updated_at,
      r.last_accessed_at,
      u.email,
      u.full_name,
      rc.personal_info,
      rc.work_experience,
      rc.education,
      rc.skills,
      rc.certifications,
      rc.projects,
      rc.additional_sections
    FROM
      resumes r
    JOIN
      users u ON r.user_id = u.id
    LEFT JOIN
      resume_content rc ON r.id = rc.resume_id
    WHERE
      r.user_id = auth.uid()
    ';
  END IF;
END
$$;
