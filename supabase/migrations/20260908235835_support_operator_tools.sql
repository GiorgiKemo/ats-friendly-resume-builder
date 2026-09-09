begin;

create or replace function public.support_list_queue(
  p_status text default 'open',
  p_limit integer default 50,
  p_before timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := auth.uid();
  conversations jsonb;
begin
  if actor_id is null or not public.is_support_operator() then
    raise exception 'Support operator access required';
  end if;

  p_limit := greatest(1, least(coalesce(p_limit, 50), 100));
  if p_status is null or p_status not in ('open', 'waiting_customer', 'resolved', 'all') then
    raise exception 'Invalid support queue status';
  end if;

  select coalesce(jsonb_agg(item order by item->>'updatedAt' desc, item->>'id' desc), '[]'::jsonb)
  into conversations
  from (
    select jsonb_build_object(
      'id', c.id,
      'subject', c.subject,
      'status', c.status,
      'mode', c.mode,
      'priority', c.priority,
      'revision', c.revision,
      'lastSequence', c.last_sequence,
      'lastMessageAt', c.last_message_at,
      'updatedAt', c.updated_at,
      'createdAt', c.created_at,
      'customerUserId', c.customer_user_id,
      'customerEmail', u.email,
      'assignedAgentUserId', c.assigned_agent_user_id,
      'preview', latest.body,
      'previewSenderType', latest.sender_type
    ) as item
    from public.support_conversations c
    left join auth.users u on u.id = c.customer_user_id
    left join lateral (
      select m.body, m.sender_type
      from public.support_messages m
      where m.conversation_id = c.id
      order by m.sequence_no desc
      limit 1
    ) latest on true
    where (p_status = 'all' or c.status = p_status)
      and (p_before is null or c.updated_at < p_before)
    order by c.updated_at desc, c.id desc
    limit p_limit
  ) queued;

  return jsonb_build_object('items', conversations);
end;
$$;

create or replace function public.support_add_internal_note(
  p_conversation_id uuid,
  p_body text,
  p_client_note_id text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := auth.uid();
  note_id uuid;
  response jsonb;
begin
  if actor_id is null or not public.is_support_operator() then
    raise exception 'Support operator access required';
  end if;
  if p_body is null or length(btrim(p_body)) not between 1 and 8000 then
    raise exception 'Invalid internal note';
  end if;
  if p_client_note_id is null or length(btrim(p_client_note_id)) not between 8 and 200 then
    raise exception 'Invalid internal note id';
  end if;

  insert into public.support_operation_receipts(actor_user_id, operation, client_request_id)
  values (actor_id, 'internal_note:' || p_conversation_id::text, btrim(p_client_note_id))
  on conflict (actor_user_id, operation, client_request_id) do nothing;

  select response_body into response
  from public.support_operation_receipts
  where actor_user_id = actor_id
    and operation = 'internal_note:' || p_conversation_id::text
    and client_request_id = btrim(p_client_note_id);
  if response is not null then return response; end if;

  if not exists (select 1 from public.support_conversations where id = p_conversation_id) then
    raise exception 'Support conversation not found';
  end if;

  insert into public.support_internal_notes(conversation_id, agent_user_id, client_note_id, body)
  values (p_conversation_id, actor_id, btrim(p_client_note_id), btrim(p_body))
  returning id into note_id;

  response := jsonb_build_object(
    'id', note_id,
    'conversationId', p_conversation_id,
    'agentUserId', actor_id,
    'body', btrim(p_body)
  );
  update public.support_operation_receipts
  set response_body = response
  where actor_user_id = actor_id
    and operation = 'internal_note:' || p_conversation_id::text
    and client_request_id = btrim(p_client_note_id);
  return response;
end;
$$;

revoke all on function public.support_list_queue(text, integer, timestamptz) from public, anon;
revoke all on function public.support_add_internal_note(uuid, text, text) from public, anon;
grant execute on function public.support_list_queue(text, integer, timestamptz) to authenticated;
grant execute on function public.support_add_internal_note(uuid, text, text) to authenticated;

commit;
