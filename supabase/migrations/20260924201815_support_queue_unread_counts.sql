BEGIN;

CREATE OR REPLACE FUNCTION public.support_list_queue(
  p_status text DEFAULT 'open',
  p_limit integer DEFAULT 50,
  p_before timestamptz DEFAULT NULL,
  p_search text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := auth.uid();
  conversations jsonb;
  search_value text := nullif(left(btrim(coalesce(p_search, '')), 120), '');
BEGIN
  IF actor_id IS NULL OR NOT public.is_support_operator() THEN
    RAISE EXCEPTION 'Support operator access required';
  END IF;
  p_limit := greatest(1, least(coalesce(p_limit, 50), 100));
  IF p_status IS NULL OR p_status NOT IN ('open', 'waiting_customer', 'resolved', 'all') THEN
    RAISE EXCEPTION 'Invalid support queue status';
  END IF;

  SELECT coalesce(jsonb_agg(item ORDER BY item->>'updatedAt' DESC, item->>'id' DESC), '[]'::jsonb)
  INTO conversations
  FROM (
    SELECT jsonb_build_object(
      'id', c.id,
      'subject', c.subject,
      'status', c.status,
      'mode', c.mode,
      'priority', c.priority,
      'tags', c.tags,
      'revision', c.revision,
      'lastSequence', c.last_sequence,
      'lastMessageAt', c.last_message_at,
      'updatedAt', c.updated_at,
      'createdAt', c.created_at,
      'customerUserId', c.customer_user_id,
      'customerEmail', u.email,
      'assignedAgentUserId', c.assigned_agent_user_id,
      'preview', latest.body,
      'previewSenderType', latest.sender_type,
      'unreadCount', (
        SELECT count(*)::integer
        FROM public.support_messages unread
        LEFT JOIN public.support_read_cursors read_cursor
          ON read_cursor.conversation_id = unread.conversation_id
          AND read_cursor.user_id = actor_id
        WHERE unread.conversation_id = c.id
          AND unread.sender_type IN ('customer', 'guest')
          AND unread.sequence_no > coalesce(read_cursor.last_read_sequence, 0)
      ),
      'firstResponseDueAt', c.first_response_due_at,
      'firstRespondedAt', c.first_responded_at,
      'firstResponseSlaStatus', CASE
        WHEN c.first_responded_at IS NOT NULL THEN 'met'
        WHEN c.first_response_due_at IS NULL OR c.first_response_due_at >= clock_timestamp() THEN 'pending'
        ELSE 'breached'
      END
    ) AS item
    FROM public.support_conversations c
    LEFT JOIN auth.users u ON u.id = c.customer_user_id
    LEFT JOIN LATERAL (
      SELECT m.body, m.sender_type
      FROM public.support_messages m
      WHERE m.conversation_id = c.id
      ORDER BY m.sequence_no DESC
      LIMIT 1
    ) latest ON true
    WHERE (p_status = 'all' OR c.status = p_status)
      AND (p_before IS NULL OR c.updated_at < p_before)
      AND (
        search_value IS NULL
        OR c.subject ILIKE '%' || search_value || '%'
        OR coalesce(u.email, '') ILIKE '%' || search_value || '%'
        OR coalesce(latest.body, '') ILIKE '%' || search_value || '%'
        OR EXISTS (SELECT 1 FROM unnest(c.tags) tag WHERE tag ILIKE '%' || search_value || '%')
      )
    ORDER BY c.updated_at DESC, c.id DESC
    LIMIT p_limit
  ) queued;

  RETURN jsonb_build_object('items', conversations);
END;
$$;

COMMIT;
