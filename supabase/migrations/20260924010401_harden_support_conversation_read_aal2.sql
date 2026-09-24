BEGIN;

-- Conversation reads are sensitive authenticated operations. Bind direct RPC
-- calls to the current Auth session, and treat agent assignment as operator
  -- access rather than an independent way around the AAL2 membership check.
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
        OR (operator AND c.assigned_agent_user_id = actor_id)
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

CREATE OR REPLACE FUNCTION public.support_read_conversation(
  p_conversation_id uuid,
  p_after_sequence bigint DEFAULT 0,
  p_limit integer DEFAULT 100
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := auth.uid();
  conversation public.support_conversations%rowtype;
  operator boolean;
  messages jsonb;
  notes jsonb;
BEGIN
  IF actor_id IS NULL OR NOT private.current_auth_session_is_active() THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_after_sequence IS NULL OR p_after_sequence < 0 THEN
    RAISE EXCEPTION 'Invalid sequence cursor';
  END IF;
  p_limit := greatest(1, least(coalesce(p_limit, 100), 100));
  operator := public.is_support_operator();

  SELECT * INTO conversation
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
    );
  IF NOT FOUND THEN RAISE EXCEPTION 'Support conversation not found'; END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id,
    'sequence', m.sequence_no,
    'senderType', m.sender_type,
    'senderUserId', CASE WHEN operator THEN m.sender_user_id ELSE NULL END,
    'body', m.body,
    'replyToMessageId', m.reply_to_message_id,
    'createdAt', m.created_at
  ) ORDER BY m.sequence_no), '[]'::jsonb)
  INTO messages
  FROM (
    SELECT *
    FROM public.support_messages
    WHERE conversation_id = p_conversation_id
      AND sequence_no > p_after_sequence
    ORDER BY sequence_no
    LIMIT p_limit
  ) m;

  IF operator THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', n.id,
      'agentUserId', n.agent_user_id,
      'body', n.body,
      'createdAt', n.created_at,
      'updatedAt', n.updated_at
    ) ORDER BY n.created_at), '[]'::jsonb)
    INTO notes
    FROM public.support_internal_notes n
    WHERE n.conversation_id = p_conversation_id;
  ELSE
    notes := '[]'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'conversation', jsonb_build_object(
      'id', conversation.id,
      'subject', conversation.subject,
      'status', conversation.status,
      'mode', conversation.mode,
      'priority', conversation.priority,
      'revision', conversation.revision,
      'lastSequence', conversation.last_sequence,
      'lastMessageAt', conversation.last_message_at,
      'assignedAgentUserId', CASE WHEN operator THEN conversation.assigned_agent_user_id ELSE NULL END
    ),
    'messages', messages,
    'internalNotes', notes
  );
END;
$$;

-- Authenticated support writes must stop working when their Auth session is
-- revoked. Agent replies also require the same active AAL2 operator boundary
-- as the inbox and notes tools; an old assignment is not an independent grant.
DO $migration$
DECLARE
  target regprocedure;
  definition text;
  before_guard text := $before$if actor_id is null then raise exception 'Authentication required'; end if;$before$;
  after_guard text := $after$if actor_id is null or not private.current_auth_session_is_active() then raise exception 'Authentication required'; end if;$after$;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'public.support_start_conversation(text,text,text)'::regprocedure,
    'public.support_send_message(uuid,text,text,uuid)'::regprocedure,
    'public.support_request_handoff(uuid,text,text)'::regprocedure,
    'public.support_submit_feedback(uuid,integer,text,text,text)'::regprocedure
  ] LOOP
    definition := pg_catalog.pg_get_functiondef(target);
    IF pg_catalog.strpos(definition, before_guard) = 0 THEN
      RAISE EXCEPTION 'Expected an authenticated support-session guard in %', target;
    END IF;
    EXECUTE pg_catalog.replace(definition, before_guard, after_guard);
  END LOOP;

  target := 'public.support_send_message(uuid,text,text,uuid)'::regprocedure;
  definition := pg_catalog.pg_get_functiondef(target);
  IF pg_catalog.strpos(definition, $assigned$or assigned_agent_user_id = actor_id$assigned$) = 0 THEN
    RAISE EXCEPTION 'Expected the assigned-agent message access path in %', target;
  END IF;
  definition := pg_catalog.replace(
    definition,
    $assigned$or assigned_agent_user_id = actor_id$assigned$,
    $checked$or (public.is_support_operator() and assigned_agent_user_id = actor_id)$checked$
  );
  IF pg_catalog.strpos(definition, $participant$or exists (select 1 from public.support_participants p where p.conversation_id = id and p.user_id = actor_id and p.revoked_at is null and p.role = 'agent')$participant$) = 0 THEN
    RAISE EXCEPTION 'Expected the agent-participant message access path in %', target;
  END IF;
  definition := pg_catalog.replace(
    definition,
    $participant$or exists (select 1 from public.support_participants p where p.conversation_id = id and p.user_id = actor_id and p.revoked_at is null and p.role = 'agent')$participant$,
    $checked$or (public.is_support_operator() and exists (select 1 from public.support_participants p where p.conversation_id = id and p.user_id = actor_id and p.revoked_at is null and p.role = 'agent'))$checked$
  );
  EXECUTE definition;
END;
$migration$;

COMMIT;
