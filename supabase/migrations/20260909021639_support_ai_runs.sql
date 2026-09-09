begin;

-- Durable support-AI jobs. The feature flag is deliberately off on creation;
-- enabling it requires an explicit settings change and a separately configured
-- worker/provider. No prompt, hidden reasoning, credential or raw private
-- document is stored in these tables.
create table if not exists public.support_ai_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  provider_name text,
  model_name text,
  per_turn_token_limit integer not null default 2000 check (per_turn_token_limit between 256 and 12000),
  conversation_turn_limit integer not null default 6 check (conversation_turn_limit between 1 and 50),
  daily_cost_micros bigint not null default 0 check (daily_cost_micros >= 0),
  monthly_cost_micros bigint not null default 0 check (monthly_cost_micros >= 0),
  circuit_open_until timestamptz,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.support_ai_settings(id, enabled)
values (true, false)
on conflict (id) do nothing;

create or replace function public.admin_update_support_ai_settings(
  p_actor_user_id uuid,
  p_enabled boolean,
  p_provider_name text,
  p_model_name text,
  p_per_turn_token_limit integer,
  p_conversation_turn_limit integer,
  p_daily_cost_micros bigint,
  p_monthly_cost_micros bigint
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  updated_row public.support_ai_settings%rowtype;
begin
  if p_actor_user_id is null or not exists (
    select 1 from public.admin_members
    where user_id = p_actor_user_id and is_active and role in ('owner', 'admin')
  ) then
    raise exception 'Admin settings access required';
  end if;
  if p_per_turn_token_limit is null or p_per_turn_token_limit not between 256 and 12000 then raise exception 'Invalid AI token limit'; end if;
  if p_conversation_turn_limit is null or p_conversation_turn_limit not between 1 and 50 then raise exception 'Invalid AI conversation limit'; end if;
  if p_daily_cost_micros is null or p_daily_cost_micros < 0 then raise exception 'Invalid daily AI budget'; end if;
  if p_monthly_cost_micros is null or p_monthly_cost_micros < 0 then raise exception 'Invalid monthly AI budget'; end if;
  if p_provider_name is not null and length(btrim(p_provider_name)) > 120 then raise exception 'Invalid AI provider name'; end if;
  if p_model_name is not null and length(btrim(p_model_name)) > 120 then raise exception 'Invalid AI model name'; end if;

  update public.support_ai_settings
  set enabled = coalesce(p_enabled, false),
      provider_name = nullif(left(btrim(coalesce(p_provider_name, '')), 120), ''),
      model_name = nullif(left(btrim(coalesce(p_model_name, '')), 120), ''),
      per_turn_token_limit = p_per_turn_token_limit,
      conversation_turn_limit = p_conversation_turn_limit,
      daily_cost_micros = p_daily_cost_micros,
      monthly_cost_micros = p_monthly_cost_micros,
      updated_by_user_id = p_actor_user_id,
      updated_at = clock_timestamp()
  where id = true
  returning * into updated_row;
  if not found then raise exception 'Support AI settings are unavailable'; end if;

  insert into public.admin_audit_events(admin_user_id, action, metadata)
  values (
    p_actor_user_id,
    'support-ai.settings.updated',
    jsonb_build_object(
      'enabled', updated_row.enabled,
      'providerName', updated_row.provider_name,
      'modelName', updated_row.model_name,
      'perTurnTokenLimit', updated_row.per_turn_token_limit,
      'conversationTurnLimit', updated_row.conversation_turn_limit,
      'dailyCostMicros', updated_row.daily_cost_micros,
      'monthlyCostMicros', updated_row.monthly_cost_micros
    )
  );

  return jsonb_build_object(
    'enabled', updated_row.enabled,
    'providerName', updated_row.provider_name,
    'modelName', updated_row.model_name,
    'perTurnTokenLimit', updated_row.per_turn_token_limit,
    'conversationTurnLimit', updated_row.conversation_turn_limit,
    'dailyCostMicros', updated_row.daily_cost_micros,
    'monthlyCostMicros', updated_row.monthly_cost_micros,
    'updatedAt', updated_row.updated_at
  );
end;
$$;

create table if not exists public.support_ai_runs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.support_conversations(id) on delete cascade,
  trigger_message_id uuid not null references public.support_messages(id) on delete cascade,
  expected_ai_epoch bigint not null check (expected_ai_epoch >= 0),
  expected_revision bigint not null check (expected_revision >= 0),
  trigger_sequence bigint not null check (trigger_sequence > 0),
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'failed', 'canceled')),
  attempt integer not null default 0 check (attempt >= 0),
  available_at timestamptz not null default now(),
  locked_until timestamptz,
  worker_id text,
  provider_name text,
  model_name text,
  answer text check (answer is null or length(answer) <= 8000),
  citations jsonb not null default '[]'::jsonb check (jsonb_typeof(citations) = 'array'),
  escalation_requested boolean not null default false,
  escalation_reason text check (escalation_reason is null or length(escalation_reason) <= 500),
  refusal_code text check (refusal_code is null or length(refusal_code) <= 120),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  estimated_cost_micros bigint check (estimated_cost_micros is null or estimated_cost_micros >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  last_error text check (last_error is null or length(last_error) <= 120),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (conversation_id, trigger_message_id)
);

create table if not exists public.support_ai_usage_records (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null unique references public.support_ai_runs(id) on delete cascade,
  conversation_id uuid not null references public.support_conversations(id) on delete cascade,
  provider_name text,
  model_name text,
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  estimated_cost_micros bigint check (estimated_cost_micros is null or estimated_cost_micros >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  outcome text not null check (outcome in ('answered', 'escalated', 'refused', 'failed', 'stale')),
  created_at timestamptz not null default now()
);

create index if not exists support_ai_runs_claim_idx
  on public.support_ai_runs(status, available_at, created_at, id);
create index if not exists support_ai_runs_conversation_idx
  on public.support_ai_runs(conversation_id, created_at desc, id desc);
create index if not exists support_ai_usage_records_created_idx
  on public.support_ai_usage_records(created_at desc, outcome);

alter table public.support_ai_settings enable row level security;
alter table public.support_ai_runs enable row level security;
alter table public.support_ai_usage_records enable row level security;
revoke all on table public.support_ai_settings, public.support_ai_runs, public.support_ai_usage_records from public, anon, authenticated;
grant all on table public.support_ai_settings, public.support_ai_runs, public.support_ai_usage_records to service_role;

create or replace function public.support_ai_enqueue_run(
  p_conversation_id uuid,
  p_trigger_message_id uuid,
  p_expected_ai_epoch bigint,
  p_expected_revision bigint,
  p_trigger_sequence bigint
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  conversation public.support_conversations%rowtype;
  message public.support_messages%rowtype;
  run public.support_ai_runs%rowtype;
begin
  if p_conversation_id is null or p_trigger_message_id is null then
    raise exception 'AI run identity is required';
  end if;
  select * into conversation from public.support_conversations where id = p_conversation_id for update;
  if not found then raise exception 'Support conversation not found'; end if;
  select * into message from public.support_messages where id = p_trigger_message_id and conversation_id = p_conversation_id;
  if not found then raise exception 'Support trigger message not found'; end if;
  if message.sender_type not in ('customer', 'guest') then raise exception 'AI runs require a customer message'; end if;
  if conversation.mode <> 'ai' or conversation.status = 'resolved' then
    return jsonb_build_object('queued', false, 'reason', 'conversation_not_ai');
  end if;
  if conversation.ai_epoch <> p_expected_ai_epoch
    or conversation.revision <> p_expected_revision
    or conversation.last_sequence <> p_trigger_sequence then
    return jsonb_build_object('queued', false, 'reason', 'stale_trigger');
  end if;

  insert into public.support_ai_runs(
    conversation_id, trigger_message_id, expected_ai_epoch,
    expected_revision, trigger_sequence, status, available_at
  ) values (
    p_conversation_id, p_trigger_message_id, p_expected_ai_epoch,
    p_expected_revision, p_trigger_sequence, 'queued', clock_timestamp()
  ) on conflict (conversation_id, trigger_message_id) do nothing
  returning * into run;

  if run.id is null then
    select * into run from public.support_ai_runs
    where conversation_id = p_conversation_id and trigger_message_id = p_trigger_message_id;
  end if;
  return jsonb_build_object('queued', true, 'runId', run.id, 'status', run.status);
end;
$$;

create or replace function public.support_ai_claim_runs(
  p_worker_id text,
  p_limit integer default 3,
  p_lease_seconds integer default 120
) returns table(
  run_id uuid,
  conversation_id uuid,
  trigger_message_id uuid,
  expected_ai_epoch bigint,
  expected_revision bigint,
  trigger_sequence bigint,
  attempt integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_worker_id is null or length(btrim(p_worker_id)) not between 8 and 200 then
    raise exception 'Invalid AI worker id';
  end if;
  p_limit := greatest(1, least(coalesce(p_limit, 3), 10));
  p_lease_seconds := greatest(30, least(coalesce(p_lease_seconds, 120), 600));

  return query
  with enabled as (
    select s.enabled
    from public.support_ai_settings s
    where s.id = true
      and (s.circuit_open_until is null or s.circuit_open_until <= clock_timestamp())
  ), candidates as (
    select r.id
    from public.support_ai_runs r
    cross join enabled
    where enabled.enabled
      and r.status = 'queued'
      and r.available_at <= clock_timestamp()
      and (r.locked_until is null or r.locked_until <= clock_timestamp())
    order by r.created_at, r.id
    for update skip locked
    limit p_limit
  )
  update public.support_ai_runs r
  set status = 'processing',
      attempt = r.attempt + 1,
      worker_id = btrim(p_worker_id),
      locked_until = clock_timestamp() + make_interval(secs => p_lease_seconds),
      started_at = coalesce(r.started_at, clock_timestamp()),
      updated_at = clock_timestamp()
  from candidates
  where r.id = candidates.id
  returning r.id, r.conversation_id, r.trigger_message_id,
    r.expected_ai_epoch, r.expected_revision, r.trigger_sequence, r.attempt;
end;
$$;

create or replace function public.support_ai_release_run(
  p_run_id uuid,
  p_worker_id text,
  p_retry boolean,
  p_error_code text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  run public.support_ai_runs%rowtype;
begin
  select * into run from public.support_ai_runs
  where id = p_run_id and status = 'processing' and worker_id = btrim(p_worker_id)
  for update;
  if not found then return jsonb_build_object('updated', false, 'reason', 'lease_not_owned'); end if;

  update public.support_ai_runs
  set status = case when p_retry then 'queued' else 'failed' end,
      available_at = case when p_retry then clock_timestamp() + make_interval(secs => least(600, greatest(15, attempt * 30))) else available_at end,
      locked_until = null,
      worker_id = null,
      last_error = left(coalesce(nullif(btrim(p_error_code), ''), 'ai_run_failed'), 120),
      refusal_code = case when p_retry then refusal_code else 'provider_unavailable' end,
      updated_at = clock_timestamp(),
      completed_at = case when p_retry then null else clock_timestamp() end
  where id = run.id;

  if not p_retry then
    update public.support_conversations
    set mode = case when status <> 'resolved' then 'queued' else mode end,
        status = case when status <> 'resolved' then 'open' else status end,
        ai_epoch = ai_epoch + case when mode = 'ai' then 1 else 0 end,
        revision = revision + case when mode = 'ai' then 1 else 0 end,
        updated_at = clock_timestamp()
    where id = run.conversation_id;
  end if;
  return jsonb_build_object('updated', true, 'status', case when p_retry then 'queued' else 'failed' end);
end;
$$;

create or replace function public.support_ai_complete_run(
  p_run_id uuid,
  p_worker_id text,
  p_answer text,
  p_citations jsonb default '[]'::jsonb,
  p_escalation_requested boolean default false,
  p_escalation_reason text default null,
  p_provider_name text default null,
  p_model_name text default null,
  p_input_tokens integer default null,
  p_output_tokens integer default null,
  p_estimated_cost_micros bigint default null,
  p_latency_ms integer default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  run public.support_ai_runs%rowtype;
  conversation public.support_conversations%rowtype;
  v_message_id uuid;
  next_sequence bigint;
  outcome text;
begin
  if p_run_id is null or p_worker_id is null then raise exception 'AI run identity is required'; end if;
  if p_citations is null or jsonb_typeof(p_citations) <> 'array' then raise exception 'Invalid AI citations'; end if;
  if p_answer is null or length(btrim(p_answer)) > 8000 then raise exception 'Invalid AI answer'; end if;

  select * into run from public.support_ai_runs
  where id = p_run_id and status = 'processing' and worker_id = btrim(p_worker_id)
  for update;
  if not found then return jsonb_build_object('committed', false, 'reason', 'lease_not_owned'); end if;

  select * into conversation from public.support_conversations where id = run.conversation_id for update;
  if not found then
    update public.support_ai_runs set status = 'canceled', refusal_code = 'conversation_missing', locked_until = null, worker_id = null, completed_at = clock_timestamp(), updated_at = clock_timestamp() where id = run.id;
    return jsonb_build_object('committed', false, 'reason', 'conversation_missing');
  end if;

  if conversation.ai_epoch <> run.expected_ai_epoch
    or conversation.revision <> run.expected_revision
    or conversation.last_sequence <> run.trigger_sequence
    or conversation.mode <> 'ai'
    or conversation.status = 'resolved' then
    update public.support_ai_runs
    set status = 'canceled', refusal_code = 'stale_trigger', locked_until = null, worker_id = null, completed_at = clock_timestamp(), updated_at = clock_timestamp()
    where id = run.id;
    insert into public.support_ai_usage_records(run_id, conversation_id, provider_name, model_name, input_tokens, output_tokens, estimated_cost_micros, latency_ms, outcome)
    values (run.id, run.conversation_id, p_provider_name, p_model_name, p_input_tokens, p_output_tokens, p_estimated_cost_micros, p_latency_ms, 'stale')
    on conflict (run_id) do nothing;
    return jsonb_build_object('committed', false, 'reason', 'stale_trigger');
  end if;

  if p_escalation_requested then
    update public.support_ai_runs
    set status = 'completed', escalation_requested = true, escalation_reason = left(nullif(btrim(p_escalation_reason), ''), 500), citations = p_citations,
        provider_name = left(nullif(btrim(p_provider_name), ''), 120), model_name = left(nullif(btrim(p_model_name), ''), 120),
        input_tokens = p_input_tokens, output_tokens = p_output_tokens, estimated_cost_micros = p_estimated_cost_micros, latency_ms = p_latency_ms,
        locked_until = null, worker_id = null, completed_at = clock_timestamp(), updated_at = clock_timestamp()
    where id = run.id;
    update public.support_conversations
    set mode = 'queued', status = 'open', ai_epoch = ai_epoch + 1, revision = revision + 1, updated_at = clock_timestamp()
    where id = conversation.id;
    insert into public.support_ai_usage_records(run_id, conversation_id, provider_name, model_name, input_tokens, output_tokens, estimated_cost_micros, latency_ms, outcome)
    values (run.id, run.conversation_id, p_provider_name, p_model_name, p_input_tokens, p_output_tokens, p_estimated_cost_micros, p_latency_ms, 'escalated')
    on conflict (run_id) do nothing;
    return jsonb_build_object('committed', false, 'escalated', true, 'reason', coalesce(nullif(btrim(p_escalation_reason), ''), 'human_requested'));
  end if;

  if length(btrim(p_answer)) = 0 then raise exception 'AI answer is required'; end if;
  next_sequence := conversation.last_sequence + 1;
  insert into public.support_messages(conversation_id, sequence_no, sender_type, client_message_id, body)
  values (conversation.id, next_sequence, 'ai', 'ai-' || run.id::text, btrim(p_answer))
  returning id into v_message_id;

  update public.support_conversations
  set status = 'waiting_customer', revision = revision + 1, last_sequence = next_sequence, last_message_at = clock_timestamp(), updated_at = clock_timestamp()
  where id = conversation.id;
  insert into public.support_delivery_outbox(conversation_id, message_id, channel)
  values (conversation.id, v_message_id, 'realtime')
  on conflict (message_id, channel) do nothing;
  update public.support_ai_runs
  set status = 'completed', answer = btrim(p_answer), citations = p_citations,
      provider_name = left(nullif(btrim(p_provider_name), ''), 120), model_name = left(nullif(btrim(p_model_name), ''), 120),
      input_tokens = p_input_tokens, output_tokens = p_output_tokens, estimated_cost_micros = p_estimated_cost_micros, latency_ms = p_latency_ms,
      locked_until = null, worker_id = null, completed_at = clock_timestamp(), updated_at = clock_timestamp()
  where id = run.id;
  outcome := 'answered';
  insert into public.support_ai_usage_records(run_id, conversation_id, provider_name, model_name, input_tokens, output_tokens, estimated_cost_micros, latency_ms, outcome)
  values (run.id, run.conversation_id, p_provider_name, p_model_name, p_input_tokens, p_output_tokens, p_estimated_cost_micros, p_latency_ms, outcome)
  on conflict (run_id) do nothing;
  return jsonb_build_object('committed', true, 'messageId', v_message_id, 'conversationId', conversation.id, 'sequence', next_sequence);
end;
$$;

create or replace function public.support_ai_after_message()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  conversation public.support_conversations%rowtype;
  enabled boolean;
begin
  if new.sender_type not in ('customer', 'guest') then return new; end if;
  select s.enabled into enabled from public.support_ai_settings s where s.id = true;
  if not coalesce(enabled, false) then return new; end if;
  select * into conversation from public.support_conversations where id = new.conversation_id for update;
  if not found or conversation.status = 'resolved' then return new; end if;
  if conversation.mode = 'queued' then
    update public.support_conversations set mode = 'ai', updated_at = clock_timestamp() where id = conversation.id;
    conversation.mode := 'ai';
  end if;
  if conversation.mode = 'ai' then
    perform public.support_ai_enqueue_run(conversation.id, new.id, conversation.ai_epoch, conversation.revision, new.sequence_no);
  end if;
  return new;
end;
$$;

drop trigger if exists support_ai_enqueue_after_message on public.support_messages;
create trigger support_ai_enqueue_after_message
after insert on public.support_messages
for each row execute function public.support_ai_after_message();

revoke all on function public.support_ai_enqueue_run(uuid, uuid, bigint, bigint, bigint) from public, anon, authenticated;
revoke all on function public.support_ai_claim_runs(text, integer, integer) from public, anon, authenticated;
revoke all on function public.support_ai_release_run(uuid, text, boolean, text) from public, anon, authenticated;
revoke all on function public.support_ai_complete_run(uuid, text, text, jsonb, boolean, text, text, text, integer, integer, bigint, integer) from public, anon, authenticated;
revoke all on function public.support_ai_after_message() from public, anon, authenticated;
revoke all on function public.admin_update_support_ai_settings(uuid, boolean, text, text, integer, integer, bigint, bigint) from public, anon, authenticated;
grant execute on function public.support_ai_enqueue_run(uuid, uuid, bigint, bigint, bigint) to service_role;
grant execute on function public.support_ai_claim_runs(text, integer, integer) to service_role;
grant execute on function public.support_ai_release_run(uuid, text, boolean, text) to service_role;
grant execute on function public.support_ai_complete_run(uuid, text, text, jsonb, boolean, text, text, text, integer, integer, bigint, integer) to service_role;
grant execute on function public.admin_update_support_ai_settings(uuid, boolean, text, text, integer, integer, bigint, bigint) to service_role;

commit;
