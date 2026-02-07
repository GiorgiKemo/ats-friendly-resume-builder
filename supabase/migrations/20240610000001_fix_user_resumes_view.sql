-- Fix the user_resumes view to properly enforce user isolation

-- Drop the existing view
DROP VIEW IF EXISTS user_resumes;

-- Recreate the view with proper security by adding a WHERE clause
CREATE OR REPLACE VIEW user_resumes AS
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
  r.user_id = auth.uid(); -- Add this WHERE clause to filter by the current user
