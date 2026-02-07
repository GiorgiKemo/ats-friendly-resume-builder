-- Migration to optimize get_resume_with_content RPC
-- Removes the update to last_accessed_at to prevent potential locking issues

-- Drop the existing function if it exists to ensure a clean redefinition
DROP FUNCTION IF EXISTS public.get_resume_with_content(uuid);

-- Recreate the function without the last_accessed_at update
CREATE OR REPLACE FUNCTION public.get_resume_with_content(p_resume_id uuid)
RETURNS TABLE(
  id uuid,
  user_id uuid,
  title text,
  description text,
  selected_template text,
  selected_font text,
  is_public boolean,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  last_accessed_at timestamp with time zone, -- Still selecting it, just not updating here
  personal_info jsonb,
  work_experience jsonb,
  education jsonb,
  skills jsonb,
  certifications jsonb,
  projects jsonb,
  additional_sections jsonb
) AS $$
BEGIN
  -- The UPDATE to last_accessed_at has been removed from this version of the function.

  -- Return resume with content
  RETURN QUERY
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
    r.last_accessed_at, -- Continue to select the existing last_accessed_at value
    rc.personal_info,
    rc.work_experience,
    rc.education,
    rc.skills,
    rc.certifications,
    rc.projects,
    rc.additional_sections
  FROM public.resumes r
  JOIN public.resume_content rc ON r.id = rc.resume_id
  WHERE r.id = p_resume_id
  AND r.user_id = auth.uid(); -- Security check to ensure users can only access their own resumes
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- It's good practice to explicitly set the search_path for SECURITY DEFINER functions
-- although it's often set globally or inherited.
-- This was in the original schema dump, so reaffirming it here.
ALTER FUNCTION public.get_resume_with_content(uuid) SET search_path = public;
