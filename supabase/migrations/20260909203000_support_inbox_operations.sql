begin;

alter table public.support_conversations
  add column if not exists tags text[] not null default '{}'::text[];

alter table public.support_conversation_events
  drop constraint if exists support_conversation_events_event_type_check;
alter table public.support_conversation_events
  add constraint support_conversation_events_event_type_check
  check (event_type in ('created', 'message.created', 'handoff.requested', 'assigned', 'resolved', 'reopened', 'triaged'));

drop function if exists public.support_list_queue(text, integer, timestamptz);

create or replace function public.support_list_queue(
  p_status text default 'open',
  p_limit integer default 50,
  p_before timestamptz default null,
  p_search text default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := auth.uid();
  conversations jsonb;
  search_value text := nullif(left(btrim(coalesce(p_search, '')), 120), '');
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
      'firstResponseDueAt', c.first_response_due_at,
      'firstRespondedAt', c.first_responded_at,
      'firstResponseSlaStatus', case
        when c.first_responded_at is not null then 'met'
        when c.first_response_due_at is null or c.first_response_due_at >= clock_timestamp() then 'pending'
        else 'breached'
      end
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
      and (
        search_value is null
        or c.subject ilike '%' || search_value || '%'
        or coalesce(u.email, '') ilike '%' || search_value || '%'
        or coalesce(latest.body, '') ilike '%' || search_value || '%'
        or exists (select 1 from unnest(c.tags) tag where tag ilike '%' || search_value || '%')
      )
    order by c.updated_at desc, c.id desc
    limit p_limit
  ) queued;

  return jsonb_build_object('items', conversations);
end;
$$;

create or replace function public.support_triage_conversation(
  p_conversation_id uuid,
  p_expected_revision bigint,
  p_priority text,
  p_tags text[] default '{}'
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := auth.uid();
  conversation public.support_conversations%rowtype;
  normalized_tags text[];
begin
  if actor_id is null or not public.is_support_operator() then
    raise exception 'Support operator access required';
  end if;
  if p_conversation_id is null or p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'Invalid support conversation revision';
  end if;
  if p_priority not in ('low', 'normal', 'high', 'urgent') then
    raise exception 'Invalid support priority';
  end if;
  if p_tags is null or cardinality(p_tags) > 20 or exists (
    select 1 from unnest(p_tags) tag
    where tag is null or length(btrim(tag)) not between 1 and 40 or tag ~ '[\r\n]'
  ) then
    raise exception 'Invalid support tags';
  end if;
  select coalesce(array_agg(distinct btrim(tag) order by btrim(tag)), '{}'::text[])
  into normalized_tags
  from unnest(p_tags) tag;

  select * into conversation
  from public.support_conversations
  where id = p_conversation_id
  for update;
  if not found then raise exception 'Support conversation not found'; end if;
  if conversation.revision <> p_expected_revision then
    raise exception 'Support conversation changed';
  end if;

  update public.support_conversations
  set priority = p_priority,
      tags = normalized_tags,
      revision = revision + 1,
      updated_at = clock_timestamp()
  where id = conversation.id;

  insert into public.support_conversation_events(
    conversation_id, actor_user_id, event_type, from_status, to_status, from_mode, to_mode, reason
  ) values (
    conversation.id, actor_id, 'triaged', conversation.status, conversation.status,
    conversation.mode, conversation.mode, 'priority_and_tags_updated'
  );

  return jsonb_build_object(
    'conversationId', conversation.id,
    'revision', conversation.revision + 1,
    'priority', p_priority,
    'tags', normalized_tags
  );
end;
$$;

create or replace function public.support_reopen_conversation(
  p_conversation_id uuid,
  p_client_request_id text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := auth.uid();
  conversation public.support_conversations%rowtype;
  response jsonb;
begin
  if actor_id is null or not public.is_support_operator() then
    raise exception 'Support operator access required';
  end if;
  if p_conversation_id is null or p_client_request_id is null or length(btrim(p_client_request_id)) not between 8 and 200 then
    raise exception 'Invalid support request id';
  end if;

  insert into public.support_operation_receipts(actor_user_id, operation, client_request_id)
  values (actor_id, 'reopen:' || p_conversation_id::text, btrim(p_client_request_id))
  on conflict (actor_user_id, operation, client_request_id) do nothing;
  select response_body into response
  from public.support_operation_receipts
  where actor_user_id = actor_id
    and operation = 'reopen:' || p_conversation_id::text
    and client_request_id = btrim(p_client_request_id);
  if response is not null then return response; end if;

  select * into conversation
  from public.support_conversations
  where id = p_conversation_id
  for update;
  if not found then raise exception 'Support conversation not found'; end if;

  update public.support_conversations
  set status = 'open',
      mode = case when assigned_agent_user_id is null then 'queued' else 'human' end,
      ai_epoch = ai_epoch + 1,
      revision = revision + 1,
      updated_at = clock_timestamp()
  where id = conversation.id;

  insert into public.support_conversation_events(
    conversation_id, actor_user_id, event_type, from_status, to_status, from_mode, to_mode
  ) values (
    conversation.id, actor_id, 'reopened', conversation.status, 'open', conversation.mode,
    case when conversation.assigned_agent_user_id is null then 'queued' else 'human' end
  );

  response := jsonb_build_object(
    'conversationId', conversation.id,
    'revision', conversation.revision + 1,
    'status', 'open',
    'mode', case when conversation.assigned_agent_user_id is null then 'queued' else 'human' end
  );
  update public.support_operation_receipts
  set response_body = response
  where actor_user_id = actor_id
    and operation = 'reopen:' || p_conversation_id::text
    and client_request_id = btrim(p_client_request_id);
  return response;
end;
$$;

revoke all on function public.support_list_queue(text, integer, timestamptz, text) from public, anon;
revoke all on function public.support_triage_conversation(uuid, bigint, text, text[]) from public, anon;
revoke all on function public.support_reopen_conversation(uuid, text) from public, anon;
grant execute on function public.support_list_queue(text, integer, timestamptz, text) to authenticated;
grant execute on function public.support_triage_conversation(uuid, bigint, text, text[]) to authenticated;
grant execute on function public.support_reopen_conversation(uuid, text) to authenticated;

commit;
