begin;

alter table public.support_conversations
  add column if not exists first_response_target_minutes integer,
  add column if not exists first_response_due_at timestamptz,
  add column if not exists first_responded_at timestamptz;

alter table public.support_conversations
  drop constraint if exists support_conversations_first_response_target_check;
alter table public.support_conversations
  add constraint support_conversations_first_response_target_check
  check (first_response_target_minutes is null or first_response_target_minutes between 5 and 10080);

create table if not exists public.support_agent_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null check (status in ('offline', 'available', 'away')),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.support_agent_presence enable row level security;
revoke all on table public.support_agent_presence from public, anon, authenticated;
grant all on table public.support_agent_presence to service_role;

create index if not exists support_agent_presence_active_idx
  on public.support_agent_presence(status, expires_at desc);

create or replace function public.support_add_business_minutes(
  p_started_at timestamptz,
  p_minutes integer
) returns timestamptz
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  settings_row public.support_routing_settings%rowtype;
  local_cursor timestamp;
  local_day integer;
  local_start timestamp;
  local_end timestamp;
  available_minutes integer;
  remaining_minutes integer := p_minutes;
begin
  if p_started_at is null or p_minutes is null or p_minutes < 0 then
    raise exception 'Invalid business-time input';
  end if;
  select * into settings_row from public.support_routing_settings where id = true;
  if not found then raise exception 'Support routing settings are unavailable'; end if;
  if p_minutes = 0 then return p_started_at; end if;

  local_cursor := p_started_at at time zone settings_row.timezone;
  for step in 1..10000 loop
    local_day := extract(isodow from local_cursor)::integer;
    local_start := local_cursor::date + settings_row.business_start;
    local_end := local_cursor::date + settings_row.business_end;

    if local_day <> all(settings_row.business_days)
      or local_cursor >= local_end then
      local_cursor := (local_cursor::date + 1)::timestamp + settings_row.business_start;
      continue;
    end if;
    if local_cursor < local_start then
      local_cursor := local_start;
      continue;
    end if;

    available_minutes := floor(extract(epoch from (local_end - local_cursor)) / 60)::integer;
    if available_minutes <= 0 then
      local_cursor := (local_cursor::date + 1)::timestamp + settings_row.business_start;
      continue;
    end if;
    if remaining_minutes <= available_minutes then
      return (local_cursor + make_interval(mins => remaining_minutes)) at time zone settings_row.timezone;
    end if;
    remaining_minutes := remaining_minutes - available_minutes;
    local_cursor := (local_cursor::date + 1)::timestamp + settings_row.business_start;
  end loop;
  raise exception 'Business-time calculation exceeded its safety bound';
end;
$$;

create or replace function public.support_conversation_deadline_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_minutes integer;
begin
  if new.first_response_target_minutes is null then
    select first_response_target_minutes into target_minutes
    from public.support_routing_settings where id = true;
    new.first_response_target_minutes := target_minutes;
  end if;
  if new.first_response_due_at is null and new.first_response_target_minutes is not null then
    new.first_response_due_at := public.support_add_business_minutes(
      coalesce(new.created_at, clock_timestamp()),
      new.first_response_target_minutes
    );
  end if;
  return new;
end;
$$;

drop trigger if exists support_conversation_deadline_before_insert on public.support_conversations;
create trigger support_conversation_deadline_before_insert
before insert on public.support_conversations
for each row execute function public.support_conversation_deadline_trigger();

update public.support_conversations c
set first_response_target_minutes = settings.first_response_target_minutes,
    first_response_due_at = public.support_add_business_minutes(c.created_at, settings.first_response_target_minutes)
from public.support_routing_settings settings
where settings.id = true
  and c.first_response_target_minutes is null;

create or replace function public.support_first_response_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.sender_type = 'agent' then
    update public.support_conversations
    set first_responded_at = coalesce(first_responded_at, new.created_at),
        updated_at = greatest(updated_at, new.created_at)
    where id = new.conversation_id;
  end if;
  return new;
end;
$$;

drop trigger if exists support_first_response_after_message on public.support_messages;
create trigger support_first_response_after_message
after insert on public.support_messages
for each row execute function public.support_first_response_trigger();

create or replace function public.support_set_presence(
  p_status text,
  p_ttl_seconds integer default 90
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := auth.uid();
  row_data public.support_agent_presence%rowtype;
begin
  if actor_id is null or not public.is_support_operator() then
    raise exception 'Support operator access required';
  end if;
  if p_status not in ('offline', 'available', 'away') then
    raise exception 'Invalid support presence';
  end if;
  if p_ttl_seconds is null or p_ttl_seconds not between 30 and 600 then
    raise exception 'Invalid support presence TTL';
  end if;

  insert into public.support_agent_presence(user_id, status, last_seen_at, expires_at, updated_at)
  values (
    actor_id,
    p_status,
    clock_timestamp(),
    case when p_status = 'offline' then clock_timestamp() else clock_timestamp() + make_interval(secs => p_ttl_seconds) end,
    clock_timestamp()
  )
  on conflict (user_id) do update set
    status = excluded.status,
    last_seen_at = excluded.last_seen_at,
    expires_at = excluded.expires_at,
    updated_at = excluded.updated_at
  returning * into row_data;

  return jsonb_build_object(
    'userId', row_data.user_id,
    'status', row_data.status,
    'lastSeenAt', row_data.last_seen_at,
    'expiresAt', row_data.expires_at
  );
end;
$$;

create or replace function public.support_list_presence()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := auth.uid();
  items jsonb;
begin
  if actor_id is null or not public.is_support_operator() then
    raise exception 'Support operator access required';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'userId', m.user_id,
    'email', u.email,
    'status', case when p.status in ('available', 'away') and p.expires_at > clock_timestamp() then p.status else 'offline' end,
    'lastSeenAt', p.last_seen_at,
    'expiresAt', p.expires_at
  ) order by u.email), '[]'::jsonb)
  into items
  from public.admin_members m
  join auth.users u on u.id = m.user_id
  left join public.support_agent_presence p on p.user_id = m.user_id
  where m.is_active and m.role in ('owner', 'admin', 'support');

  return jsonb_build_object('items', items);
end;
$$;

create or replace function public.support_get_routing_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  settings_row public.support_routing_settings%rowtype;
  local_now timestamp;
  local_day integer;
  local_time time;
  queue_count integer;
  online_agent_count integer;
  available_agent_count integer;
begin
  select * into settings_row from public.support_routing_settings where id = true;
  if not found then return null; end if;
  local_now := (now() at time zone settings_row.timezone);
  local_day := extract(isodow from local_now)::integer;
  local_time := local_now::time;
  select count(*) into queue_count
  from public.support_conversations
  where status in ('open', 'waiting_customer') and mode = 'queued';
  select count(*) filter (where p.status in ('available', 'away') and p.expires_at > clock_timestamp()),
         count(*) filter (where p.status = 'available' and p.expires_at > clock_timestamp())
    into online_agent_count, available_agent_count
  from public.support_agent_presence p
  join public.admin_members m on m.user_id = p.user_id
  where m.is_active and m.role in ('owner', 'admin', 'support');

  return jsonb_build_object(
    'timezone', settings_row.timezone,
    'businessStart', settings_row.business_start,
    'businessEnd', settings_row.business_end,
    'withinBusinessHours', local_day = any(settings_row.business_days) and local_time >= settings_row.business_start and local_time < settings_row.business_end,
    'queueCount', queue_count,
    'queueAtCapacity', queue_count >= settings_row.max_queue_size,
    'onlineAgentCount', coalesce(online_agent_count, 0),
    'availableAgentCount', coalesce(available_agent_count, 0),
    'autoRouteEnabled', settings_row.auto_route_enabled,
    'firstResponseTargetMinutes', settings_row.first_response_target_minutes
  );
end;
$$;

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
    order by c.updated_at desc, c.id desc
    limit p_limit
  ) queued;

  return jsonb_build_object('items', conversations);
end;
$$;

revoke all on function public.support_add_business_minutes(timestamptz, integer) from public, anon, authenticated;
revoke all on function public.support_conversation_deadline_trigger() from public, anon, authenticated;
revoke all on function public.support_first_response_trigger() from public, anon, authenticated;
revoke all on function public.support_set_presence(text, integer) from public, anon;
revoke all on function public.support_list_presence() from public, anon;
revoke all on function public.support_get_routing_context() from public, anon, authenticated;
revoke all on function public.support_list_queue(text, integer, timestamptz) from public, anon;
grant execute on function public.support_set_presence(text, integer) to authenticated;
grant execute on function public.support_list_presence() to authenticated;
grant execute on function public.support_get_routing_context() to service_role;
grant execute on function public.support_list_queue(text, integer, timestamptz) to authenticated;

commit;
