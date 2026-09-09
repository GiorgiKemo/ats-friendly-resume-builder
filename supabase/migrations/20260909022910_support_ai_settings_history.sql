begin;

-- Settings changes are durable and reviewable without exposing provider
-- credentials. The revision is advanced by the database trigger, not by the
-- browser, so a replayed request cannot manufacture a history version.
alter table public.support_ai_settings
  add column if not exists revision bigint not null default 1
  check (revision > 0);

create table if not exists public.support_ai_settings_history (
  id bigint generated always as identity primary key,
  settings_revision bigint not null unique check (settings_revision > 0),
  enabled boolean not null,
  provider_name text,
  model_name text,
  per_turn_token_limit integer not null,
  conversation_turn_limit integer not null,
  daily_cost_micros bigint not null,
  monthly_cost_micros bigint not null,
  circuit_open_until timestamptz,
  changed_by_user_id uuid references auth.users(id) on delete set null,
  change_source text not null check (change_source in ('admin', 'worker')),
  reason text check (reason is null or length(reason) <= 240),
  changed_at timestamptz not null default now()
);

create index if not exists support_ai_settings_history_changed_idx
  on public.support_ai_settings_history(changed_at desc, id desc);

alter table public.support_ai_settings_history enable row level security;
revoke all on table public.support_ai_settings_history from public, anon, authenticated;
grant all on table public.support_ai_settings_history to service_role;

insert into public.support_ai_settings_history(
  settings_revision, enabled, provider_name, model_name,
  per_turn_token_limit, conversation_turn_limit,
  daily_cost_micros, monthly_cost_micros, circuit_open_until,
  changed_by_user_id, change_source, reason, changed_at
)
select
  s.revision, s.enabled, s.provider_name, s.model_name,
  s.per_turn_token_limit, s.conversation_turn_limit,
  s.daily_cost_micros, s.monthly_cost_micros, s.circuit_open_until,
  s.updated_by_user_id,
  case when s.updated_by_user_id is null then 'worker' else 'admin' end,
  'initial_settings_snapshot', s.updated_at
from public.support_ai_settings s
where s.id = true
on conflict (settings_revision) do nothing;

create or replace function public.support_ai_settings_history_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.revision <= old.revision then
    new.revision := old.revision + 1;
  end if;

  insert into public.support_ai_settings_history(
    settings_revision, enabled, provider_name, model_name,
    per_turn_token_limit, conversation_turn_limit,
    daily_cost_micros, monthly_cost_micros, circuit_open_until,
    changed_by_user_id, change_source, changed_at
  ) values (
    new.revision, new.enabled, new.provider_name, new.model_name,
    new.per_turn_token_limit, new.conversation_turn_limit,
    new.daily_cost_micros, new.monthly_cost_micros, new.circuit_open_until,
    new.updated_by_user_id,
    case when new.updated_by_user_id is null then 'worker' else 'admin' end,
    clock_timestamp()
  );
  return new;
end;
$$;

drop trigger if exists support_ai_settings_history_on_update on public.support_ai_settings;
create trigger support_ai_settings_history_on_update
before update on public.support_ai_settings
for each row execute function public.support_ai_settings_history_trigger();

create or replace function public.support_ai_set_circuit(
  p_open_until timestamptz default null,
  p_reason text default null,
  p_actor_user_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  updated_row public.support_ai_settings%rowtype;
  normalized_until timestamptz;
  normalized_reason text;
  action_name text;
begin
  if p_actor_user_id is not null and not exists (
    select 1 from public.admin_members
    where user_id = p_actor_user_id and is_active and role in ('owner', 'admin')
  ) then
    raise exception 'Admin settings access required';
  end if;

  if p_open_until > clock_timestamp() + interval '1 hour' then
    raise exception 'AI circuit duration is too long';
  end if;
  normalized_until := case
    when p_open_until is null or p_open_until <= clock_timestamp() then null
    else p_open_until
  end;
  normalized_reason := left(nullif(btrim(coalesce(p_reason, '')), ''), 240);

  update public.support_ai_settings
  set circuit_open_until = normalized_until,
      updated_by_user_id = p_actor_user_id,
      updated_at = clock_timestamp()
  where id = true
  returning * into updated_row;
  if not found then raise exception 'Support AI settings are unavailable'; end if;

  action_name := case when normalized_until is null then 'support-ai.circuit.closed' else 'support-ai.circuit.opened' end;
  insert into public.admin_audit_events(admin_user_id, action, metadata)
  values (
    p_actor_user_id,
    action_name,
    jsonb_build_object(
      'source', case when p_actor_user_id is null then 'worker' else 'admin' end,
      'circuitOpenUntil', updated_row.circuit_open_until,
      'reason', normalized_reason
    )
  );

  return jsonb_build_object(
    'revision', updated_row.revision,
    'circuitOpenUntil', updated_row.circuit_open_until,
    'updatedAt', updated_row.updated_at
  );
end;
$$;

create or replace function public.admin_rollback_support_ai_settings(
  p_actor_user_id uuid,
  p_target_revision bigint
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_row public.support_ai_settings%rowtype;
  target_row public.support_ai_settings_history%rowtype;
begin
  if p_actor_user_id is null or not exists (
    select 1 from public.admin_members
    where user_id = p_actor_user_id and is_active and role in ('owner', 'admin')
  ) then
    raise exception 'Admin settings access required';
  end if;
  if p_target_revision is null or p_target_revision < 1 then
    raise exception 'A valid settings revision is required';
  end if;

  select * into current_row
  from public.support_ai_settings
  where id = true
  for update;
  if not found then raise exception 'Support AI settings are unavailable'; end if;

  select * into target_row
  from public.support_ai_settings_history
  where settings_revision = p_target_revision;
  if not found then raise exception 'Support AI settings revision was not found'; end if;
  if target_row.settings_revision >= current_row.revision then
    raise exception 'Only an older settings revision can be restored';
  end if;

  update public.support_ai_settings
  set enabled = target_row.enabled,
      provider_name = target_row.provider_name,
      model_name = target_row.model_name,
      per_turn_token_limit = target_row.per_turn_token_limit,
      conversation_turn_limit = target_row.conversation_turn_limit,
      daily_cost_micros = target_row.daily_cost_micros,
      monthly_cost_micros = target_row.monthly_cost_micros,
      circuit_open_until = null,
      updated_by_user_id = p_actor_user_id,
      updated_at = clock_timestamp()
  where id = true
  returning * into current_row;

  update public.support_ai_settings_history
  set reason = 'rollback_to_revision_' || p_target_revision::text
  where settings_revision = current_row.revision;

  insert into public.admin_audit_events(admin_user_id, action, metadata)
  values (
    p_actor_user_id,
    'support-ai.settings.rollback',
    jsonb_build_object(
      'targetRevision', p_target_revision,
      'resultRevision', current_row.revision,
      'enabled', current_row.enabled,
      'providerName', current_row.provider_name,
      'modelName', current_row.model_name,
      'circuitCleared', true
    )
  );

  return jsonb_build_object(
    'revision', current_row.revision,
    'enabled', current_row.enabled,
    'providerName', current_row.provider_name,
    'modelName', current_row.model_name,
    'updatedAt', current_row.updated_at
  );
end;
$$;

revoke all on function public.support_ai_settings_history_trigger() from public, anon, authenticated;
revoke all on function public.support_ai_set_circuit(timestamptz, text, uuid) from public, anon, authenticated;
revoke all on function public.admin_rollback_support_ai_settings(uuid, bigint) from public, anon, authenticated;
grant execute on function public.support_ai_set_circuit(timestamptz, text, uuid) to service_role;
grant execute on function public.admin_rollback_support_ai_settings(uuid, bigint) to service_role;

commit;
