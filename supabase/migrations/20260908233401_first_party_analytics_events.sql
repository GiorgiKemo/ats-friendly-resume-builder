begin;

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique check (length(btrim(event_key)) between 8 and 240),
  event_name text not null check (event_name in (
    'account_created',
    'upgrade_click',
    'resume_created',
    'resume_exported',
    'application_created',
    'checkout_started',
    'checkout_created',
    'purchase_confirmed',
    'support_started',
    'support_resolved'
  )),
  event_version integer not null default 1 check (event_version > 0),
  actor_user_id uuid references public.users(id) on delete set null,
  provider text check (provider is null or provider in ('stripe', 'paypal', 'manual')),
  properties jsonb not null default '{}'::jsonb check (jsonb_typeof(properties) = 'object'),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.analytics_events enable row level security;
revoke all on public.analytics_events from public, anon, authenticated;
grant select, insert on public.analytics_events to service_role;
create index if not exists analytics_events_name_time_idx
  on public.analytics_events (event_name, occurred_at);
create index if not exists analytics_events_actor_time_idx
  on public.analytics_events (actor_user_id, occurred_at);

comment on table public.analytics_events is
  'Minimal first-party product events; no resume content, email, names, tokens, or provider secrets.';

create or replace function public.capture_account_created_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.analytics_events(event_key, event_name, actor_user_id, properties, occurred_at)
  values ('account:' || new.id::text, 'account_created', new.id, '{}'::jsonb, coalesce(new.created_at, clock_timestamp()))
  on conflict (event_key) do nothing;
  return new;
end;
$$;

drop trigger if exists users_capture_account_created_event on public.users;
create trigger users_capture_account_created_event
after insert on public.users
for each row execute function public.capture_account_created_event();

revoke all on function public.capture_account_created_event() from public, anon, authenticated;

create or replace function public.record_analytics_event(
  p_event_key text,
  p_event_name text,
  p_properties jsonb default '{}'::jsonb,
  p_occurred_at timestamptz default clock_timestamp()
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  inserted_id uuid;
begin
  if caller_id is null then
    raise exception 'Authentication required';
  end if;
  if p_event_key is null or length(btrim(p_event_key)) not between 8 and 240 then
    raise exception 'Invalid analytics event key';
  end if;
  if p_event_name not in (
    'account_created', 'resume_created', 'resume_exported', 'application_created',
    'upgrade_click', 'checkout_started', 'checkout_created', 'purchase_confirmed', 'support_started', 'support_resolved'
  ) then
    raise exception 'Analytics event is not allowlisted';
  end if;
  if p_event_name in ('account_created', 'checkout_created', 'purchase_confirmed') then
    raise exception 'This analytics event is server-only';
  end if;
  if p_properties is null or jsonb_typeof(p_properties) <> 'object'
    or (select count(*) from jsonb_object_keys(p_properties)) > 12
    or length(p_properties::text) > 2000 then
    raise exception 'Analytics properties are too large';
  end if;
  -- Keep event metadata flat so restricted fields cannot be hidden inside a
  -- nested object or array and later copied into analytics exports.
  if exists (
    select 1
    from jsonb_each(p_properties) as property(key, value)
    where jsonb_typeof(property.value) in ('object', 'array')
  ) then
    raise exception 'Analytics properties must be flat';
  end if;
  if p_properties ?| array[
    'email', 'user_email', 'full_name', 'resume_content', 'job_description',
    'access_token', 'refresh_token', 'secret', 'token'
  ] then
    raise exception 'Analytics properties contain a restricted field';
  end if;

  insert into public.analytics_events(event_key, event_name, actor_user_id, properties, occurred_at)
  values (btrim(p_event_key), p_event_name, caller_id, p_properties, coalesce(p_occurred_at, clock_timestamp()))
  on conflict (event_key) do nothing
  returning id into inserted_id;

  if inserted_id is null then
    select id into inserted_id
    from public.analytics_events
    where event_key = btrim(p_event_key);
  end if;

  return inserted_id;
end;
$$;

revoke all on function public.record_analytics_event(text, text, jsonb, timestamptz)
  from public, anon;
grant execute on function public.record_analytics_event(text, text, jsonb, timestamptz)
  to authenticated;

commit;
