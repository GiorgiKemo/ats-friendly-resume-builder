BEGIN;

-- AAL2 support operators can mark unassigned queue items read before taking
-- ownership. Authentication and the role check still require a live AAL2 session.
CREATE OR REPLACE FUNCTION public.support_mark_read(
  p_conversation_id uuid,
  p_last_read_sequence bigint
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := auth.uid();
  next_sequence bigint;
  operator boolean;
BEGIN
  IF actor_id IS NULL OR NOT private.current_auth_session_is_active() THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_last_read_sequence IS NULL OR p_last_read_sequence < 0 THEN
    RAISE EXCEPTION 'Invalid read cursor';
  END IF;
  operator := public.is_support_operator();

  IF NOT EXISTS (
    SELECT 1
    FROM public.support_conversations c
    WHERE c.id = p_conversation_id
      AND (
        c.customer_user_id = actor_id
        OR operator
        OR EXISTS (
          SELECT 1
          FROM public.support_participants p
          WHERE p.conversation_id = c.id
            AND p.user_id = actor_id
            AND p.revoked_at IS NULL
            AND (p.role = 'customer' OR (p.role = 'agent' AND operator))
        )
      )
  ) THEN
    RAISE EXCEPTION 'Support conversation not found';
  END IF;

  INSERT INTO public.support_read_cursors(conversation_id, user_id, last_read_sequence)
  VALUES (p_conversation_id, actor_id, p_last_read_sequence)
  ON CONFLICT (conversation_id, user_id) DO UPDATE
  SET last_read_sequence = greatest(public.support_read_cursors.last_read_sequence, excluded.last_read_sequence),
      updated_at = clock_timestamp()
  RETURNING last_read_sequence INTO next_sequence;
  RETURN next_sequence;
END;
$$;

COMMIT;
