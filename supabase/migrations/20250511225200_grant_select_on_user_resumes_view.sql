-- Grant SELECT permission on the user_resumes view to the authenticated role.
-- This ensures that authenticated users can query the view,
-- subject to the RLS policies on the underlying tables (due to security_invoker=on)
-- and the WHERE clause within the view definition.

GRANT SELECT ON TABLE public.user_resumes TO authenticated;
