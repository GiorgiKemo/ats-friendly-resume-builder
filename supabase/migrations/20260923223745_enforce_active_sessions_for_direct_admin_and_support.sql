-- Bind authenticated direct RPCs to the live Auth session instead of trusting
-- the still-valid JWT alone after that session has been revoked.
CREATE OR REPLACE FUNCTION public.current_auth_session_is_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH request_identity AS (
    SELECT auth.uid() AS user_id, auth.jwt() ->> 'session_id' AS session_id
  )
  SELECT EXISTS (
    SELECT 1
    FROM request_identity AS request
    JOIN auth.sessions AS session
      ON session.user_id = request.user_id
     AND session.id::text = request.session_id
    WHERE request.user_id IS NOT NULL
      AND (session.not_after IS NULL OR session.not_after > pg_catalog.statement_timestamp())
  );
$$;

REVOKE ALL ON FUNCTION public.current_auth_session_is_active() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_auth_session_is_active() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_support_operator()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.current_auth_session_is_active()
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
  SELECT public.current_auth_session_is_active()
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

CREATE OR REPLACE FUNCTION public.support_prepare_attachment(
  p_conversation_id uuid,
  p_attachment_id uuid,
  p_storage_path text,
  p_original_name text,
  p_declared_mime text,
  p_byte_size bigint,
  p_upload_expires_at timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := auth.uid();
  existing public.support_attachments%rowtype;
BEGIN
  IF actor_id IS NULL OR NOT public.current_auth_session_is_active() THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_conversation_id IS NULL OR p_attachment_id IS NULL THEN RAISE EXCEPTION 'Invalid attachment identity'; END IF;
  IF p_storage_path <> p_conversation_id::text || '/' || p_attachment_id::text THEN RAISE EXCEPTION 'Invalid attachment path'; END IF;
  IF p_original_name IS NULL OR length(btrim(p_original_name)) NOT BETWEEN 1 AND 255 THEN RAISE EXCEPTION 'Invalid attachment name'; END IF;
  IF p_declared_mime NOT IN ('image/jpeg', 'image/png', 'application/pdf') THEN RAISE EXCEPTION 'Unsupported attachment type'; END IF;
  IF p_byte_size IS NULL OR p_byte_size NOT BETWEEN 1 AND 10485760 THEN RAISE EXCEPTION 'Attachment is too large'; END IF;
  IF p_upload_expires_at IS NULL OR p_upload_expires_at <= clock_timestamp() OR p_upload_expires_at > clock_timestamp() + interval '2 hours' THEN RAISE EXCEPTION 'Invalid attachment expiry'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.support_conversations c
    WHERE c.id = p_conversation_id
      AND (c.customer_user_id = actor_id OR public.is_support_operator())
  ) THEN RAISE EXCEPTION 'Support conversation access required'; END IF;

  INSERT INTO public.support_attachments(
    id, conversation_id, uploader_user_id, storage_path, original_name,
    declared_mime, byte_size, upload_expires_at
  ) VALUES (
    p_attachment_id, p_conversation_id, actor_id, p_storage_path, btrim(p_original_name),
    p_declared_mime, p_byte_size, p_upload_expires_at
  ) ON CONFLICT (id) DO NOTHING;

  SELECT * INTO existing
  FROM public.support_attachments
  WHERE id = p_attachment_id
    AND conversation_id = p_conversation_id
    AND uploader_user_id = actor_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attachment could not be prepared'; END IF;
  IF existing.status <> 'pending' OR existing.upload_expires_at <= clock_timestamp() THEN RAISE EXCEPTION 'Attachment upload is no longer available'; END IF;
  RETURN jsonb_build_object('attachmentId', existing.id, 'storagePath', existing.storage_path, 'status', existing.status, 'expiresAt', existing.upload_expires_at);
END;
$$;

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
      OR NOT public.current_auth_session_is_active()
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
