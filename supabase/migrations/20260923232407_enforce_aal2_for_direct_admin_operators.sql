-- Keep read-only admin API access available at AAL1 while requiring AAL2 for
-- direct access to PII and operator/knowledge capabilities.
CREATE OR REPLACE FUNCTION public.current_admin_session_is_aal2()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.current_auth_session_is_active()
    AND auth.jwt() ->> 'aal' = 'aal2';
$$;

REVOKE ALL ON FUNCTION public.current_admin_session_is_aal2() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_admin_session_is_aal2() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_support_operator()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.current_admin_session_is_aal2()
    AND EXISTS (
      SELECT 1
      FROM public.admin_members
      WHERE user_id = auth.uid()
        AND is_active
        AND role IN ('owner', 'admin', 'support')
    );
$$;

REVOKE ALL ON FUNCTION public.is_support_operator() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_support_operator() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_knowledge_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.current_admin_session_is_aal2()
    AND EXISTS (
      SELECT 1
      FROM public.admin_members
      WHERE user_id = auth.uid()
        AND is_active
        AND role IN ('owner', 'admin')
    );
$$;

REVOKE ALL ON FUNCTION public.is_knowledge_manager() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_knowledge_manager() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_user_directory(
  p_search text DEFAULT '',
  p_cursor_created_at timestamptz DEFAULT NULL,
  p_cursor_user_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := auth.uid();
  normalized_search text := btrim(coalesce(p_search, ''));
  escaped_search text;
  items jsonb;
  next_cursor jsonb;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role'
    AND (
      actor_id IS NULL
      OR NOT public.current_admin_session_is_aal2()
      OR NOT EXISTS (
        SELECT 1
        FROM public.admin_members
        WHERE user_id = actor_id
          AND is_active
          AND role IN ('owner', 'admin', 'support')
      )
    ) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  p_limit := greatest(1, least(coalesce(p_limit, 50), 100));
  normalized_search := left(normalized_search, 80);
  escaped_search := replace(replace(replace(normalized_search, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_');

  WITH page AS (
    SELECT d.user_id, d.email, d.full_name, d.created_at, d.email_confirmed_at,
      d.last_sign_in_at, d.is_banned, d.ban_reason, d.source_updated_at, d.updated_at
    FROM public.admin_user_directory d
    WHERE (
      normalized_search = ''
      OR lower(d.email) LIKE '%' || lower(escaped_search) || '%' ESCAPE E'\\'
      OR lower(coalesce(d.full_name, '')) LIKE '%' || lower(escaped_search) || '%' ESCAPE E'\\'
      OR d.user_id::text = normalized_search
    )
      AND (
        p_cursor_created_at IS NULL
        OR p_cursor_user_id IS NULL
        OR (d.created_at, d.user_id) < (p_cursor_created_at, p_cursor_user_id)
      )
    ORDER BY d.created_at DESC, d.user_id DESC
    LIMIT p_limit
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', user_id,
    'email', email,
    'fullName', full_name,
    'createdAt', created_at,
    'emailConfirmedAt', email_confirmed_at,
    'lastSignInAt', last_sign_in_at,
    'isBanned', is_banned,
    'bannedReason', ban_reason,
    'sourceUpdatedAt', source_updated_at,
    'updatedAt', updated_at
  ) ORDER BY created_at DESC, user_id DESC), '[]'::jsonb)
  INTO items
  FROM page;

  IF jsonb_array_length(items) = p_limit THEN
    next_cursor := jsonb_build_object(
      'createdAt', items -> (jsonb_array_length(items) - 1) ->> 'createdAt',
      'id', items -> (jsonb_array_length(items) - 1) ->> 'id'
    );
  ELSE
    next_cursor := NULL;
  END IF;

  RETURN jsonb_build_object('items', items, 'nextCursor', next_cursor);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_user_directory(text, timestamptz, uuid, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_user_directory(text, timestamptz, uuid, integer)
  TO authenticated;
