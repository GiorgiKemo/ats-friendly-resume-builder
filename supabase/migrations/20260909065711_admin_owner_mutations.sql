-- Serialize owner-count-changing team mutations and write their audit row in
-- the same transaction. Edge Functions still perform Auth metadata sync after
-- this source-of-truth mutation; a metadata failure must not hide the durable
-- membership/audit result.

CREATE OR REPLACE FUNCTION public.admin_revoke_member(
  p_actor_user_id UUID,
  p_member_id UUID
) RETURNS public.admin_members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_member public.admin_members%ROWTYPE;
  target_member public.admin_members%ROWTYPE;
  updated_member public.admin_members%ROWTYPE;
  owner_count INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('resumeats:admin-owner-membership', 0));

  SELECT * INTO actor_member
  FROM public.admin_members
  WHERE user_id = p_actor_user_id AND is_active
  FOR UPDATE;
  IF NOT FOUND OR actor_member.role <> 'owner' THEN
    RAISE EXCEPTION 'Owner access required';
  END IF;
  IF actor_member.id = p_member_id THEN
    RAISE EXCEPTION 'You cannot revoke your own owner access';
  END IF;

  SELECT * INTO target_member
  FROM public.admin_members
  WHERE id = p_member_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Admin member not found'; END IF;

  IF target_member.role = 'owner' AND target_member.is_active THEN
    SELECT count(*) INTO owner_count
    FROM public.admin_members
    WHERE role = 'owner' AND is_active;
    IF owner_count <= 1 THEN
      RAISE EXCEPTION 'The last active owner must remain available';
    END IF;
  END IF;

  UPDATE public.admin_members
  SET is_active = false,
      invitation_revoked_at = CASE WHEN target_member.user_id IS NULL THEN clock_timestamp() ELSE NULL END,
      updated_at = clock_timestamp()
  WHERE id = p_member_id
  RETURNING * INTO updated_member;

  INSERT INTO public.admin_audit_events(admin_user_id, target_user_id, action, metadata)
  VALUES (
    p_actor_user_id,
    target_member.user_id,
    'admin.revoke',
    jsonb_build_object('email', target_member.email, 'role', target_member.role, 'wasActive', target_member.is_active)
  );

  RETURN updated_member;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_member_role(
  p_actor_user_id UUID,
  p_member_id UUID,
  p_role TEXT
) RETURNS public.admin_members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_member public.admin_members%ROWTYPE;
  target_member public.admin_members%ROWTYPE;
  updated_member public.admin_members%ROWTYPE;
  owner_count INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('resumeats:admin-owner-membership', 0));

  IF p_role NOT IN ('owner', 'admin', 'support') THEN
    RAISE EXCEPTION 'Invalid admin role';
  END IF;

  SELECT * INTO actor_member
  FROM public.admin_members
  WHERE user_id = p_actor_user_id AND is_active
  FOR UPDATE;
  IF NOT FOUND OR actor_member.role <> 'owner' THEN
    RAISE EXCEPTION 'Owner access required';
  END IF;
  IF actor_member.id = p_member_id THEN
    RAISE EXCEPTION 'You cannot change your own owner role';
  END IF;

  SELECT * INTO target_member
  FROM public.admin_members
  WHERE id = p_member_id
  FOR UPDATE;
  IF NOT FOUND OR NOT target_member.is_active THEN
    RAISE EXCEPTION 'Active admin member not found';
  END IF;
  IF target_member.role = p_role THEN RETURN target_member; END IF;

  IF target_member.role = 'owner' AND p_role <> 'owner' THEN
    SELECT count(*) INTO owner_count
    FROM public.admin_members
    WHERE role = 'owner' AND is_active;
    IF owner_count <= 1 THEN
      RAISE EXCEPTION 'The last active owner must remain available';
    END IF;
  END IF;

  UPDATE public.admin_members
  SET role = p_role,
      updated_at = clock_timestamp()
  WHERE id = p_member_id
  RETURNING * INTO updated_member;

  INSERT INTO public.admin_audit_events(admin_user_id, target_user_id, action, metadata)
  VALUES (
    p_actor_user_id,
    target_member.user_id,
    'admin.role.updated',
    jsonb_build_object('email', target_member.email, 'previousRole', target_member.role, 'role', p_role)
  );

  RETURN updated_member;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_revoke_member(UUID, UUID) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_update_member_role(UUID, UUID, TEXT) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_member(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_member_role(UUID, UUID, TEXT) TO service_role;
