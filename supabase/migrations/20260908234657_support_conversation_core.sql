begin;

-- Durable support core. Tables are service-only; the narrowly scoped RPCs below
-- are the only customer-facing write/read boundary until the Edge API exists.
create table if not exists public.support_conversations (
  id uuid primary key default gen_random_uuid(),
  customer_user_id uuid references public.users(id) on delete set null,
  guest_session_id uuid,
  subject text not null check (length(btrim(subject)) between 1 and 200),
  status text not null default 'open' check (status in ('open', 'waiting_customer', 'resolved')),
  mode text not null default 'queued' check (mode in ('ai', 'queued', 'human')),
  assigned_agent_user_id uuid references auth.users(id) on delete set null,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  revision bigint not null default 0 check (revision >= 0),
  ai_epoch bigint not null default 0 check (ai_epoch >= 0),
  last_sequence bigint not null default 0 check (last_sequence >= 0),
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((customer_user_id is null) <> (guest_session_id is null))
);

create table if not exists public.support_guest_sessions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid unique references public.support_conversations(id) on delete cascade,
  token_hash text not null unique check (length(btrim(token_hash)) between 32 and 256),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.support_conversations
  add constraint support_conversations_guest_session_fk
  foreign key (guest_session_id) references public.support_guest_sessions(id) on delete set null;

create table if not exists public.support_participants (
  conversation_id uuid not null references public.support_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('customer', 'agent')),
  joined_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (conversation_id, user_id)
);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.support_conversations(id) on delete cascade,
  sequence_no bigint not null check (sequence_no > 0),
  sender_user_id uuid references auth.users(id) on delete set null,
  sender_type text not null check (sender_type in ('customer', 'agent', 'guest', 'ai', 'system')),
  client_message_id text not null check (length(btrim(client_message_id)) between 8 and 200),
  body text not null check (length(btrim(body)) between 1 and 8000),
  reply_to_message_id uuid references public.support_messages(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (conversation_id, sequence_no),
  unique (conversation_id, client_message_id)
);

create table if not exists public.support_internal_notes (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.support_conversations(id) on delete cascade,
  agent_user_id uuid not null references auth.users(id) on delete restrict,
  client_note_id text not null check (length(btrim(client_note_id)) between 8 and 200),
  body text not null check (length(btrim(body)) between 1 and 8000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (conversation_id, client_note_id)
);

create table if not exists public.support_conversation_events (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.support_conversations(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('created', 'message.created', 'handoff.requested', 'assigned', 'resolved', 'reopened')),
  from_status text,
  to_status text,
  from_mode text,
  to_mode text,
  reason text check (reason is null or length(reason) <= 500),
  created_at timestamptz not null default now()
);

create table if not exists public.support_read_cursors (
  conversation_id uuid not null references public.support_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_sequence bigint not null default 0 check (last_read_sequence >= 0),
  updated_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists public.support_operation_receipts (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  operation text not null check (length(btrim(operation)) between 1 and 80),
  client_request_id text not null check (length(btrim(client_request_id)) between 8 and 200),
  response_body jsonb,
  created_at timestamptz not null default now(),
  unique (actor_user_id, operation, client_request_id)
);

create table if not exists public.support_guest_operation_receipts (
  id uuid primary key default gen_random_uuid(),
  guest_session_id uuid not null references public.support_guest_sessions(id) on delete cascade,
  operation text not null check (length(btrim(operation)) between 1 and 100),
  client_request_id text not null check (length(btrim(client_request_id)) between 8 and 200),
  response_body jsonb,
  created_at timestamptz not null default now(),
  unique (guest_session_id, operation, client_request_id)
);

create table if not exists public.support_delivery_outbox (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.support_conversations(id) on delete cascade,
  message_id uuid references public.support_messages(id) on delete cascade,
  channel text not null check (channel in ('realtime', 'email')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed', 'dead_letter')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  locked_until timestamptz,
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (message_id, channel)
);

create index if not exists support_conversations_queue_idx
  on public.support_conversations(status, mode, priority, last_message_at desc, id desc);
create index if not exists support_conversations_customer_idx
  on public.support_conversations(customer_user_id, updated_at desc, id desc);
create index if not exists support_participants_user_idx
  on public.support_participants(user_id, revoked_at, conversation_id);
create index if not exists support_messages_conversation_idx
  on public.support_messages(conversation_id, sequence_no);
create index if not exists support_events_conversation_idx
  on public.support_conversation_events(conversation_id, created_at, id);
create index if not exists support_delivery_outbox_dispatch_idx
  on public.support_delivery_outbox(status, available_at, created_at);

do $$
declare
  table_name text;
begin
  for table_name in
    select unnest(array[
      'support_conversations', 'support_guest_sessions', 'support_participants',
      'support_messages', 'support_internal_notes', 'support_conversation_events',
      'support_read_cursors', 'support_operation_receipts', 'support_guest_operation_receipts', 'support_delivery_outbox'
    ])
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
    execute format('grant all on table public.%I to service_role', table_name);
  end loop;
end;
$$;

create or replace function public.is_support_operator()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.admin_members
    where user_id = auth.uid()
      and is_active
      and role in ('owner', 'admin', 'support')
  );
$$;
revoke all on function public.is_support_operator() from public, anon;
grant execute on function public.is_support_operator() to authenticated;

create or replace function public.support_start_conversation(
  p_subject text,
  p_body text,
  p_client_request_id text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := auth.uid();
  conversation_id uuid;
  message_id uuid;
  response jsonb;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if p_subject is null or length(btrim(p_subject)) not between 1 and 200 then raise exception 'Invalid support subject'; end if;
  if p_body is null or length(btrim(p_body)) not between 1 and 8000 then raise exception 'Invalid support message'; end if;
  if p_client_request_id is null or length(btrim(p_client_request_id)) not between 8 and 200 then raise exception 'Invalid support request id'; end if;

  insert into public.support_operation_receipts(actor_user_id, operation, client_request_id)
  values (actor_id, 'start_conversation', btrim(p_client_request_id))
  on conflict (actor_user_id, operation, client_request_id) do nothing;

  select response_body into response
  from public.support_operation_receipts
  where actor_user_id = actor_id and operation = 'start_conversation' and client_request_id = btrim(p_client_request_id);
  if response is not null then return response; end if;

  insert into public.support_conversations(customer_user_id, subject, status, mode, revision, last_sequence, last_message_at)
  values (actor_id, btrim(p_subject), 'open', 'queued', 1, 1, clock_timestamp())
  returning id into conversation_id;

  insert into public.support_participants(conversation_id, user_id, role)
  values (conversation_id, actor_id, 'customer');

  insert into public.support_messages(conversation_id, sequence_no, sender_user_id, sender_type, client_message_id, body)
  values (conversation_id, 1, actor_id, 'customer', btrim(p_client_request_id), btrim(p_body))
  returning id into message_id;

  insert into public.support_conversation_events(conversation_id, actor_user_id, event_type, to_status, to_mode)
  values (conversation_id, actor_id, 'created', 'open', 'queued');
  insert into public.support_delivery_outbox(conversation_id, message_id, channel)
  values (conversation_id, message_id, 'realtime');

  response := jsonb_build_object('conversationId', conversation_id, 'messageId', message_id, 'sequence', 1, 'revision', 1);
  update public.support_operation_receipts
  set response_body = response
  where actor_user_id = actor_id and operation = 'start_conversation' and client_request_id = btrim(p_client_request_id);
  return response;
end;
$$;

create or replace function public.support_send_message(
  p_conversation_id uuid,
  p_body text,
  p_client_message_id text,
  p_reply_to_message_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := auth.uid();
  conversation public.support_conversations%rowtype;
  next_sequence bigint;
  message_id uuid;
  response jsonb;
  actor_type text := 'customer';
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if p_body is null or length(btrim(p_body)) not between 1 and 8000 then raise exception 'Invalid support message'; end if;
  if p_client_message_id is null or length(btrim(p_client_message_id)) not between 8 and 200 then raise exception 'Invalid support message id'; end if;

  insert into public.support_operation_receipts(actor_user_id, operation, client_request_id)
  values (actor_id, 'send_message:' || p_conversation_id::text, btrim(p_client_message_id))
  on conflict (actor_user_id, operation, client_request_id) do nothing;
  select response_body into response
  from public.support_operation_receipts
  where actor_user_id = actor_id and operation = 'send_message:' || p_conversation_id::text and client_request_id = btrim(p_client_message_id);
  if response is not null then return response; end if;

  select * into conversation
  from public.support_conversations
  where id = p_conversation_id
    and (
      customer_user_id = actor_id
      or assigned_agent_user_id = actor_id
      or exists (select 1 from public.support_participants p where p.conversation_id = id and p.user_id = actor_id and p.revoked_at is null and p.role = 'agent')
    )
  for update;
  if not found then raise exception 'Support conversation not found'; end if;

  actor_type := case when conversation.customer_user_id = actor_id then 'customer' else 'agent' end;
  next_sequence := conversation.last_sequence + 1;
  insert into public.support_messages(conversation_id, sequence_no, sender_user_id, sender_type, client_message_id, body, reply_to_message_id)
  values (conversation.id, next_sequence, actor_id, actor_type, btrim(p_client_message_id), btrim(p_body), p_reply_to_message_id)
  returning id into message_id;

  update public.support_conversations
  set status = case
        when actor_type = 'agent' then 'waiting_customer'
        when status = 'resolved' then 'open'
        else status
      end,
      revision = revision + 1,
      last_sequence = next_sequence,
      last_message_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where id = conversation.id;

  insert into public.support_conversation_events(conversation_id, actor_user_id, event_type, from_status, to_status)
  values (
    conversation.id,
    actor_id,
    case when conversation.status = 'resolved' then 'reopened' else 'message.created' end,
    conversation.status,
    case
      when actor_type = 'agent' then 'waiting_customer'
      when conversation.status = 'resolved' then 'open'
      else conversation.status
    end
  );
  insert into public.support_delivery_outbox(conversation_id, message_id, channel)
  values (conversation.id, message_id, 'realtime');

  response := jsonb_build_object('conversationId', conversation.id, 'messageId', message_id, 'sequence', next_sequence, 'revision', conversation.revision + 1);
  update public.support_operation_receipts
  set response_body = response
  where actor_user_id = actor_id and operation = 'send_message:' || p_conversation_id::text and client_request_id = btrim(p_client_message_id);
  return response;
end;
$$;

create or replace function public.support_request_handoff(
  p_conversation_id uuid,
  p_client_request_id text,
  p_reason text default null
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
  if actor_id is null then raise exception 'Authentication required'; end if;
  if p_client_request_id is null or length(btrim(p_client_request_id)) not between 8 and 200 then raise exception 'Invalid support request id'; end if;
  if p_reason is not null and length(p_reason) > 500 then raise exception 'Invalid handoff reason'; end if;

  insert into public.support_operation_receipts(actor_user_id, operation, client_request_id)
  values (actor_id, 'handoff:' || p_conversation_id::text, btrim(p_client_request_id))
  on conflict (actor_user_id, operation, client_request_id) do nothing;
  select response_body into response from public.support_operation_receipts
  where actor_user_id = actor_id and operation = 'handoff:' || p_conversation_id::text and client_request_id = btrim(p_client_request_id);
  if response is not null then return response; end if;

  select * into conversation
  from public.support_conversations
  where id = p_conversation_id and customer_user_id = actor_id
  for update;
  if not found then raise exception 'Support conversation not found'; end if;

  update public.support_conversations
  set mode = 'queued', status = 'open', ai_epoch = ai_epoch + 1, revision = revision + 1, updated_at = clock_timestamp()
  where id = conversation.id;
  insert into public.support_conversation_events(conversation_id, actor_user_id, event_type, from_status, to_status, from_mode, to_mode, reason)
  values (conversation.id, actor_id, 'handoff.requested', conversation.status, 'open', conversation.mode, 'queued', nullif(btrim(p_reason), ''));
  response := jsonb_build_object('conversationId', conversation.id, 'revision', conversation.revision + 1, 'mode', 'queued', 'status', 'open');
  update public.support_operation_receipts set response_body = response
  where actor_user_id = actor_id and operation = 'handoff:' || p_conversation_id::text and client_request_id = btrim(p_client_request_id);
  return response;
end;
$$;

create or replace function public.support_take_conversation(
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
  if actor_id is null or not public.is_support_operator() then raise exception 'Support operator access required'; end if;
  if p_client_request_id is null or length(btrim(p_client_request_id)) not between 8 and 200 then raise exception 'Invalid support request id'; end if;

  insert into public.support_operation_receipts(actor_user_id, operation, client_request_id)
  values (actor_id, 'take:' || p_conversation_id::text, btrim(p_client_request_id))
  on conflict (actor_user_id, operation, client_request_id) do nothing;
  select response_body into response from public.support_operation_receipts
  where actor_user_id = actor_id and operation = 'take:' || p_conversation_id::text and client_request_id = btrim(p_client_request_id);
  if response is not null then return response; end if;

  select * into conversation from public.support_conversations where id = p_conversation_id for update;
  if not found then raise exception 'Support conversation not found'; end if;
  if conversation.assigned_agent_user_id is not null and conversation.assigned_agent_user_id <> actor_id then
    raise exception 'Conversation is assigned to another agent';
  end if;

  update public.support_conversations
  set assigned_agent_user_id = actor_id, mode = 'human', status = 'open', ai_epoch = ai_epoch + 1, revision = revision + 1, updated_at = clock_timestamp()
  where id = conversation.id;
  insert into public.support_participants(conversation_id, user_id, role)
  values (conversation.id, actor_id, 'agent')
  on conflict (conversation_id, user_id) do update set role = 'agent', revoked_at = null;
  insert into public.support_conversation_events(conversation_id, actor_user_id, event_type, from_status, to_status, from_mode, to_mode)
  values (conversation.id, actor_id, 'assigned', conversation.status, 'open', conversation.mode, 'human');
  response := jsonb_build_object('conversationId', conversation.id, 'revision', conversation.revision + 1, 'mode', 'human', 'status', 'open', 'assignedAgentUserId', actor_id);
  update public.support_operation_receipts set response_body = response
  where actor_user_id = actor_id and operation = 'take:' || p_conversation_id::text and client_request_id = btrim(p_client_request_id);
  return response;
end;
$$;

create or replace function public.support_resolve_conversation(
  p_conversation_id uuid,
  p_client_request_id text,
  p_reason text default null
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
  if actor_id is null or not public.is_support_operator() then raise exception 'Support operator access required'; end if;
  if p_client_request_id is null or length(btrim(p_client_request_id)) not between 8 and 200 then raise exception 'Invalid support request id'; end if;
  if p_reason is not null and length(p_reason) > 500 then raise exception 'Invalid resolution reason'; end if;

  insert into public.support_operation_receipts(actor_user_id, operation, client_request_id)
  values (actor_id, 'resolve:' || p_conversation_id::text, btrim(p_client_request_id))
  on conflict (actor_user_id, operation, client_request_id) do nothing;
  select response_body into response from public.support_operation_receipts
  where actor_user_id = actor_id and operation = 'resolve:' || p_conversation_id::text and client_request_id = btrim(p_client_request_id);
  if response is not null then return response; end if;

  select * into conversation from public.support_conversations where id = p_conversation_id for update;
  if not found then raise exception 'Support conversation not found'; end if;

  update public.support_conversations
  set status = 'resolved', revision = revision + 1, updated_at = clock_timestamp()
  where id = conversation.id;
  insert into public.support_conversation_events(conversation_id, actor_user_id, event_type, from_status, to_status, reason)
  values (conversation.id, actor_id, 'resolved', conversation.status, 'resolved', nullif(btrim(p_reason), ''));
  response := jsonb_build_object('conversationId', conversation.id, 'revision', conversation.revision + 1, 'status', 'resolved');
  update public.support_operation_receipts set response_body = response
  where actor_user_id = actor_id and operation = 'resolve:' || p_conversation_id::text and client_request_id = btrim(p_client_request_id);
  return response;
end;
$$;

create or replace function public.support_mark_read(
  p_conversation_id uuid,
  p_last_read_sequence bigint
) returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := auth.uid();
  next_sequence bigint;
begin
  if actor_id is null or p_last_read_sequence is null or p_last_read_sequence < 0 then raise exception 'Invalid read cursor'; end if;
  if not exists (
    select 1 from public.support_conversations c
    where c.id = p_conversation_id and (
      c.customer_user_id = actor_id or c.assigned_agent_user_id = actor_id or exists (
        select 1 from public.support_participants p where p.conversation_id = c.id and p.user_id = actor_id and p.revoked_at is null
      )
    )
  ) then raise exception 'Support conversation not found'; end if;

  insert into public.support_read_cursors(conversation_id, user_id, last_read_sequence)
  values (p_conversation_id, actor_id, p_last_read_sequence)
  on conflict (conversation_id, user_id) do update
  set last_read_sequence = greatest(public.support_read_cursors.last_read_sequence, excluded.last_read_sequence), updated_at = clock_timestamp()
  returning last_read_sequence into next_sequence;
  return next_sequence;
end;
$$;

create or replace function public.support_read_conversation(
  p_conversation_id uuid,
  p_after_sequence bigint default 0,
  p_limit integer default 100
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := auth.uid();
  conversation public.support_conversations%rowtype;
  operator boolean;
  messages jsonb;
  notes jsonb;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if p_after_sequence is null or p_after_sequence < 0 then raise exception 'Invalid sequence cursor'; end if;
  p_limit := greatest(1, least(coalesce(p_limit, 100), 100));
  operator := public.is_support_operator();

  select * into conversation from public.support_conversations c
  where c.id = p_conversation_id and (
    c.customer_user_id = actor_id or c.assigned_agent_user_id = actor_id or operator or exists (
      select 1 from public.support_participants p where p.conversation_id = c.id and p.user_id = actor_id and p.revoked_at is null
    )
  );
  if not found then raise exception 'Support conversation not found'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id, 'sequence', m.sequence_no, 'senderType', m.sender_type,
    'senderUserId', case when operator then m.sender_user_id else null end,
    'body', m.body, 'replyToMessageId', m.reply_to_message_id, 'createdAt', m.created_at
  ) order by m.sequence_no), '[]'::jsonb)
  into messages
  from (
    select * from public.support_messages
    where conversation_id = p_conversation_id and sequence_no > p_after_sequence
    order by sequence_no
    limit p_limit
  ) m;

  if operator then
    select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'agentUserId', n.agent_user_id, 'body', n.body, 'createdAt', n.created_at, 'updatedAt', n.updated_at) order by n.created_at), '[]'::jsonb)
    into notes from public.support_internal_notes n where n.conversation_id = p_conversation_id;
  else
    notes := '[]'::jsonb;
  end if;

  return jsonb_build_object(
    'conversation', jsonb_build_object('id', conversation.id, 'subject', conversation.subject, 'status', conversation.status, 'mode', conversation.mode, 'priority', conversation.priority, 'revision', conversation.revision, 'lastSequence', conversation.last_sequence, 'lastMessageAt', conversation.last_message_at, 'assignedAgentUserId', case when operator then conversation.assigned_agent_user_id else null end),
    'messages', messages,
    'internalNotes', notes
  );
end;
$$;

-- Guest operations are service-role-only. The Edge API hashes the short-lived
-- bearer kept in memory by the widget before calling these functions.
create or replace function public.support_start_guest_conversation(
  p_subject text,
  p_body text,
  p_client_request_id text,
  p_token_hash text,
  p_expires_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  guest public.support_guest_sessions%rowtype;
  new_conversation_id uuid;
  message_id uuid;
  response jsonb;
begin
  if p_token_hash is null or length(btrim(p_token_hash)) <> 64 then raise exception 'Invalid guest session'; end if;
  if p_expires_at is null or p_expires_at <= clock_timestamp() or p_expires_at > clock_timestamp() + interval '24 hours' then raise exception 'Invalid guest expiry'; end if;
  if p_subject is null or length(btrim(p_subject)) not between 1 and 200 then raise exception 'Invalid support subject'; end if;
  if p_body is null or length(btrim(p_body)) not between 1 and 8000 then raise exception 'Invalid support message'; end if;
  if p_client_request_id is null or length(btrim(p_client_request_id)) not between 8 and 200 then raise exception 'Invalid support request id'; end if;

  select * into guest from public.support_guest_sessions where token_hash = btrim(p_token_hash) for update;
  if found then
    if guest.revoked_at is not null or guest.expires_at <= clock_timestamp() then raise exception 'Guest session expired'; end if;
    select response_body into response from public.support_guest_operation_receipts
    where guest_session_id = guest.id and operation = 'start_conversation' and client_request_id = btrim(p_client_request_id);
    if response is not null then return response; end if;
    if guest.conversation_id is not null then
      return jsonb_build_object('conversationId', guest.conversation_id, 'existing', true);
    end if;
  else
    insert into public.support_guest_sessions(token_hash, expires_at)
    values (btrim(p_token_hash), p_expires_at)
    returning * into guest;
  end if;

  insert into public.support_guest_operation_receipts(guest_session_id, operation, client_request_id)
  values (guest.id, 'start_conversation', btrim(p_client_request_id))
  on conflict (guest_session_id, operation, client_request_id) do nothing;

  insert into public.support_conversations(guest_session_id, subject, status, mode, revision, last_sequence, last_message_at)
  values (guest.id, btrim(p_subject), 'open', 'queued', 1, 1, clock_timestamp())
  returning id into new_conversation_id;
  update public.support_guest_sessions set conversation_id = new_conversation_id where id = guest.id;
  insert into public.support_messages(conversation_id, sequence_no, sender_type, client_message_id, body)
  values (new_conversation_id, 1, 'guest', btrim(p_client_request_id), btrim(p_body))
  returning id into message_id;
  insert into public.support_conversation_events(conversation_id, event_type, to_status, to_mode)
  values (new_conversation_id, 'created', 'open', 'queued');
  insert into public.support_delivery_outbox(conversation_id, message_id, channel)
  values (new_conversation_id, message_id, 'realtime');

  response := jsonb_build_object('conversationId', new_conversation_id, 'messageId', message_id, 'sequence', 1, 'revision', 1);
  update public.support_guest_operation_receipts set response_body = response
  where guest_session_id = guest.id and operation = 'start_conversation' and client_request_id = btrim(p_client_request_id);
  return response;
end;
$$;

create or replace function public.support_guest_send_message(
  p_conversation_id uuid,
  p_body text,
  p_client_message_id text,
  p_token_hash text,
  p_reply_to_message_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  guest public.support_guest_sessions%rowtype;
  conversation public.support_conversations%rowtype;
  next_sequence bigint;
  message_id uuid;
  response jsonb;
begin
  if p_token_hash is null or length(btrim(p_token_hash)) <> 64 then raise exception 'Invalid guest session'; end if;
  select * into guest from public.support_guest_sessions where token_hash = btrim(p_token_hash) and revoked_at is null and expires_at > clock_timestamp();
  if not found or guest.conversation_id <> p_conversation_id then raise exception 'Support conversation not found'; end if;
  if p_body is null or length(btrim(p_body)) not between 1 and 8000 then raise exception 'Invalid support message'; end if;
  if p_client_message_id is null or length(btrim(p_client_message_id)) not between 8 and 200 then raise exception 'Invalid support message id'; end if;

  insert into public.support_guest_operation_receipts(guest_session_id, operation, client_request_id)
  values (guest.id, 'send_message:' || p_conversation_id::text, btrim(p_client_message_id))
  on conflict (guest_session_id, operation, client_request_id) do nothing;
  select response_body into response from public.support_guest_operation_receipts
  where guest_session_id = guest.id and operation = 'send_message:' || p_conversation_id::text and client_request_id = btrim(p_client_message_id);
  if response is not null then return response; end if;

  select * into conversation from public.support_conversations where id = p_conversation_id and guest_session_id = guest.id for update;
  if not found then raise exception 'Support conversation not found'; end if;
  next_sequence := conversation.last_sequence + 1;
  insert into public.support_messages(conversation_id, sequence_no, sender_type, client_message_id, body, reply_to_message_id)
  values (conversation.id, next_sequence, 'guest', btrim(p_client_message_id), btrim(p_body), p_reply_to_message_id)
  returning id into message_id;
  update public.support_conversations
  set status = case when status = 'resolved' then 'open' else status end,
      revision = revision + 1, last_sequence = next_sequence, last_message_at = clock_timestamp(), updated_at = clock_timestamp()
  where id = conversation.id;
  insert into public.support_conversation_events(conversation_id, event_type, from_status, to_status)
  values (conversation.id, case when conversation.status = 'resolved' then 'reopened' else 'message.created' end, conversation.status, case when conversation.status = 'resolved' then 'open' else conversation.status end);
  insert into public.support_delivery_outbox(conversation_id, message_id, channel)
  values (conversation.id, message_id, 'realtime');
  response := jsonb_build_object('conversationId', conversation.id, 'messageId', message_id, 'sequence', next_sequence, 'revision', conversation.revision + 1);
  update public.support_guest_operation_receipts set response_body = response
  where guest_session_id = guest.id and operation = 'send_message:' || p_conversation_id::text and client_request_id = btrim(p_client_message_id);
  return response;
end;
$$;

create or replace function public.support_guest_request_handoff(
  p_conversation_id uuid,
  p_client_request_id text,
  p_token_hash text,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  guest public.support_guest_sessions%rowtype;
  conversation public.support_conversations%rowtype;
  response jsonb;
begin
  if p_token_hash is null or length(btrim(p_token_hash)) <> 64 then raise exception 'Invalid guest session'; end if;
  select * into guest from public.support_guest_sessions where token_hash = btrim(p_token_hash) and revoked_at is null and expires_at > clock_timestamp();
  if not found or guest.conversation_id <> p_conversation_id then raise exception 'Support conversation not found'; end if;
  if p_client_request_id is null or length(btrim(p_client_request_id)) not between 8 and 200 then raise exception 'Invalid support request id'; end if;
  if p_reason is not null and length(p_reason) > 500 then raise exception 'Invalid handoff reason'; end if;

  insert into public.support_guest_operation_receipts(guest_session_id, operation, client_request_id)
  values (guest.id, 'handoff:' || p_conversation_id::text, btrim(p_client_request_id))
  on conflict (guest_session_id, operation, client_request_id) do nothing;
  select response_body into response from public.support_guest_operation_receipts
  where guest_session_id = guest.id and operation = 'handoff:' || p_conversation_id::text and client_request_id = btrim(p_client_request_id);
  if response is not null then return response; end if;

  select * into conversation from public.support_conversations where id = p_conversation_id and guest_session_id = guest.id for update;
  if not found then raise exception 'Support conversation not found'; end if;
  update public.support_conversations
  set mode = 'queued', status = 'open', ai_epoch = ai_epoch + 1, revision = revision + 1, updated_at = clock_timestamp()
  where id = conversation.id;
  insert into public.support_conversation_events(conversation_id, event_type, from_status, to_status, from_mode, to_mode, reason)
  values (conversation.id, 'handoff.requested', conversation.status, 'open', conversation.mode, 'queued', nullif(btrim(p_reason), ''));
  response := jsonb_build_object('conversationId', conversation.id, 'revision', conversation.revision + 1, 'mode', 'queued', 'status', 'open');
  update public.support_guest_operation_receipts set response_body = response
  where guest_session_id = guest.id and operation = 'handoff:' || p_conversation_id::text and client_request_id = btrim(p_client_request_id);
  return response;
end;
$$;

create or replace function public.support_guest_read_conversation(
  p_conversation_id uuid,
  p_after_sequence bigint,
  p_limit integer,
  p_token_hash text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  guest public.support_guest_sessions%rowtype;
  conversation public.support_conversations%rowtype;
  messages jsonb;
begin
  if p_token_hash is null or length(btrim(p_token_hash)) <> 64 then raise exception 'Invalid guest session'; end if;
  select * into guest from public.support_guest_sessions where token_hash = btrim(p_token_hash) and revoked_at is null and expires_at > clock_timestamp();
  if not found or guest.conversation_id <> p_conversation_id then raise exception 'Support conversation not found'; end if;
  p_after_sequence := greatest(coalesce(p_after_sequence, 0), 0);
  p_limit := greatest(1, least(coalesce(p_limit, 100), 100));
  select * into conversation from public.support_conversations where id = p_conversation_id and guest_session_id = guest.id;
  if not found then raise exception 'Support conversation not found'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'sequence', m.sequence_no, 'senderType', m.sender_type, 'body', m.body, 'replyToMessageId', m.reply_to_message_id, 'createdAt', m.created_at) order by m.sequence_no), '[]'::jsonb)
  into messages from (select * from public.support_messages where conversation_id = p_conversation_id and sequence_no > p_after_sequence order by sequence_no limit p_limit) m;
  return jsonb_build_object(
    'conversation', jsonb_build_object('id', conversation.id, 'subject', conversation.subject, 'status', conversation.status, 'mode', conversation.mode, 'priority', conversation.priority, 'revision', conversation.revision, 'lastSequence', conversation.last_sequence, 'lastMessageAt', conversation.last_message_at),
    'messages', messages,
    'internalNotes', '[]'::jsonb
  );
end;
$$;

revoke all on function public.support_start_conversation(text, text, text) from public, anon;
revoke all on function public.support_send_message(uuid, text, text, uuid) from public, anon;
revoke all on function public.support_request_handoff(uuid, text, text) from public, anon;
revoke all on function public.support_take_conversation(uuid, text) from public, anon;
revoke all on function public.support_resolve_conversation(uuid, text, text) from public, anon;
revoke all on function public.support_mark_read(uuid, bigint) from public, anon;
revoke all on function public.support_read_conversation(uuid, bigint, integer) from public, anon;
revoke all on function public.support_start_guest_conversation(text, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.support_guest_send_message(uuid, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.support_guest_request_handoff(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.support_guest_read_conversation(uuid, bigint, integer, text) from public, anon, authenticated;
grant execute on function public.support_start_conversation(text, text, text) to authenticated;
grant execute on function public.support_send_message(uuid, text, text, uuid) to authenticated;
grant execute on function public.support_request_handoff(uuid, text, text) to authenticated;
grant execute on function public.support_take_conversation(uuid, text) to authenticated;
grant execute on function public.support_resolve_conversation(uuid, text, text) to authenticated;
grant execute on function public.support_mark_read(uuid, bigint) to authenticated;
grant execute on function public.support_read_conversation(uuid, bigint, integer) to authenticated;
grant execute on function public.support_start_guest_conversation(text, text, text, text, timestamptz) to service_role;
grant execute on function public.support_guest_send_message(uuid, text, text, text, uuid) to service_role;
grant execute on function public.support_guest_request_handoff(uuid, text, text, text) to service_role;
grant execute on function public.support_guest_read_conversation(uuid, bigint, integer, text) to service_role;

commit;
