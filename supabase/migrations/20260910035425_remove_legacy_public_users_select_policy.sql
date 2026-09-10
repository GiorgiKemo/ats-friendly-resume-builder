-- Remove the legacy owner-read policy that was created without an explicit
-- role.  The current profile contract is authenticated-only; keeping a
-- PUBLIC policy around makes future grants or policy changes easy to widen by
-- accident even though the current table grants are already restrictive.
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;

REVOKE SELECT ON public.users FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.users TO authenticated;

DROP POLICY IF EXISTS "Core profile owner read" ON public.users;
CREATE POLICY "Core profile owner read"
  ON public.users
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = id);
