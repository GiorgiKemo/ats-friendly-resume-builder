begin;

-- Provider mutations are deliberately disabled until each provider's sandbox
-- contract, limits, and reconciliation receipt have been reviewed. The rows
-- below make that state explicit instead of allowing the admin UI to pretend
-- that a provider action succeeded.
create table if not exists public.billing_action_capabilities (
  provider text not null check (provider in ('stripe', 'paypal')),
  environment text not null check (environment in ('live', 'test')),
  operation text not null check (operation in ('cancel', 'resume', 'plan_change', 'refund')),
  enabled boolean not null default false,
  supports_preview boolean not null default false,
  requires_owner boolean not null default false,
  max_amount_minor bigint check (max_amount_minor is null or max_amount_minor between 1 and 100000000),
  allowed_currencies text[] not null default array['usd']::text[],
  updated_at timestamptz not null default clock_timestamp(),
  primary key (provider, environment, operation)
);

insert into public.billing_action_capabilities (
  provider, environment, operation, enabled, supports_preview, requires_owner, max_amount_minor, allowed_currencies
)
select provider, environment, operation, false, false, operation = 'refund',
  case when operation = 'refund' then 100000 else null end,
  array['usd']::text[]
from (
  values
    ('stripe', 'test'), ('stripe', 'live'),
    ('paypal', 'test'), ('paypal', 'live')
) as providers(provider, environment)
cross join (
  values ('cancel'), ('resume'), ('plan_change'), ('refund')
) as operations(operation)
on conflict (provider, environment, operation) do nothing;

create table if not exists public.billing_action_intents (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null check (length(btrim(idempotency_key)) between 8 and 200),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  target_user_id uuid not null references public.users(id) on delete restrict,
  provider text not null check (provider in ('stripe', 'paypal')),
  environment text not null check (environment in ('live', 'test')),
  operation text not null check (operation in ('cancel', 'resume', 'plan_change', 'refund')),
  status text not null default 'queued' check (status in ('queued', 'processing', 'succeeded', 'failed', 'pending_reconciliation', 'unsupported', 'rejected', 'awaiting_customer_approval')),
  subscription_id text check (subscription_id is null or length(btrim(subscription_id)) between 1 and 255),
  transaction_id text check (transaction_id is null or length(btrim(transaction_id)) between 1 and 255),
  provider_payment_id text check (provider_payment_id is null or length(btrim(provider_payment_id)) between 1 and 255),
  target_price_id text check (target_price_id is null or length(btrim(target_price_id)) between 1 and 255),
  target_plan text check (target_plan is null or length(btrim(target_plan)) between 1 and 100),
  cancel_at_period_end boolean,
  currency text check (currency is null or currency ~ '^[a-z]{3}$'),
  amount_minor bigint check (amount_minor is null or amount_minor between 1 and 100000000),
  reason text not null check (length(btrim(reason)) between 1 and 1000),
  preview jsonb not null default '{}'::jsonb check (jsonb_typeof(preview) = 'object'),
  expected_observed_at timestamptz,
  worker_id text check (worker_id is null or length(btrim(worker_id)) between 8 and 160),
  locked_until timestamptz,
  provider_request_id text check (provider_request_id is null or length(btrim(provider_request_id)) between 1 and 255),
  provider_operation_id text check (provider_operation_id is null or length(btrim(provider_operation_id)) between 1 and 255),
  reconciliation_receipt jsonb check (reconciliation_receipt is null or jsonb_typeof(reconciliation_receipt) = 'object'),
  error_code text check (error_code is null or length(btrim(error_code)) between 1 and 120),
  error_message text check (error_message is null or length(btrim(error_message)) between 1 and 1000),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  unique (actor_user_id, idempotency_key)
);

create table if not exists public.billing_action_attempts (
  id uuid primary key default gen_random_uuid(),
  intent_id uuid not null references public.billing_action_intents(id) on delete cascade,
  attempt_no integer not null check (attempt_no > 0),
  worker_id text not null check (length(btrim(worker_id)) between 8 and 160),
  status text not null check (status in ('started', 'succeeded', 'failed', 'pending_reconciliation', 'awaiting_customer_approval', 'unsupported')),
  provider_request_id text,
  provider_operation_id text,
  response_summary jsonb not null default '{}'::jsonb check (jsonb_typeof(response_summary) = 'object'),
  error_code text,
  error_message text,
  created_at timestamptz not null default clock_timestamp(),
  unique (intent_id, attempt_no)
);

create index if not exists billing_action_intents_queue_idx
  on public.billing_action_intents(status, created_at, id);
create index if not exists billing_action_intents_target_idx
  on public.billing_action_intents(target_user_id, created_at desc);
create index if not exists billing_action_attempts_intent_idx
  on public.billing_action_attempts(intent_id, attempt_no desc);

alter table public.billing_action_capabilities enable row level security;
alter table public.billing_action_intents enable row level security;
alter table public.billing_action_attempts enable row level security;
revoke all on table public.billing_action_capabilities from public, anon, authenticated;
revoke all on table public.billing_action_intents from public, anon, authenticated;
revoke all on table public.billing_action_attempts from public, anon, authenticated;
grant select, insert, update on table public.billing_action_capabilities to service_role;
grant select, insert, update on table public.billing_action_intents to service_role;
grant select, insert on table public.billing_action_attempts to service_role;

create or replace function public.billing_create_action_intent(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_provider text,
  p_environment text,
  p_operation text,
  p_idempotency_key text,
  p_request_hash text,
  p_subscription_id text default null,
  p_transaction_id text default null,
  p_provider_payment_id text default null,
  p_target_price_id text default null,
  p_target_plan text default null,
  p_cancel_at_period_end boolean default null,
  p_currency text default null,
  p_amount_minor bigint default null,
  p_reason text default null,
  p_preview jsonb default '{}'::jsonb,
  p_expected_observed_at timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  capability public.billing_action_capabilities%rowtype;
  existing public.billing_action_intents%rowtype;
  inserted public.billing_action_intents%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Billing action service access required'; end if;
  if p_actor_user_id is null or p_target_user_id is null
    or p_provider not in ('stripe', 'paypal')
    or p_environment not in ('live', 'test')
    or p_operation not in ('cancel', 'resume', 'plan_change', 'refund')
    or p_idempotency_key is null or length(btrim(p_idempotency_key)) not between 8 and 200
    or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$'
    or p_reason is null or length(btrim(p_reason)) not between 1 and 1000
    or jsonb_typeof(coalesce(p_preview, '{}'::jsonb)) <> 'object' then
    raise exception 'Invalid billing action intent';
  end if;
  if p_operation in ('cancel', 'resume', 'plan_change') and p_subscription_id is null then
    raise exception 'A subscription is required for this billing action';
  end if;
  if p_operation = 'plan_change' and p_target_price_id is null and p_target_plan is null then
    raise exception 'A target plan is required for this billing action';
  end if;
  if p_operation = 'refund' and (p_provider_payment_id is null or p_amount_minor is null or p_amount_minor < 1) then
    raise exception 'A payment reference and positive refund amount are required';
  end if;
  if p_currency is not null and p_currency !~ '^[a-z]{3}$' then
    raise exception 'Invalid billing currency';
  end if;

  select * into capability
  from public.billing_action_capabilities
  where provider = p_provider and environment = p_environment and operation = p_operation;
  if not found or not capability.enabled then raise exception 'Billing action unsupported'; end if;
  if p_operation = 'refund' and (capability.max_amount_minor is null or p_amount_minor > capability.max_amount_minor) then
    raise exception 'Billing action amount exceeds configured limit';
  end if;
  if p_currency is not null and not (lower(p_currency) = any(capability.allowed_currencies)) then
    raise exception 'Billing currency is outside the configured limit';
  end if;

  select * into existing
  from public.billing_action_intents
  where actor_user_id = p_actor_user_id and idempotency_key = btrim(p_idempotency_key);
  if found then
    if existing.request_hash <> lower(p_request_hash) then raise exception 'Billing action idempotency key was reused'; end if;
    return jsonb_build_object('intentId', existing.id, 'status', existing.status, 'existing', true);
  end if;

  insert into public.billing_action_intents (
    idempotency_key, request_hash, actor_user_id, target_user_id, provider, environment, operation,
    subscription_id, transaction_id, provider_payment_id, target_price_id, target_plan,
    cancel_at_period_end, currency, amount_minor, reason, preview, expected_observed_at
  ) values (
    btrim(p_idempotency_key), lower(p_request_hash), p_actor_user_id, p_target_user_id, p_provider, p_environment, p_operation,
    nullif(btrim(p_subscription_id), ''), nullif(btrim(p_transaction_id), ''), nullif(btrim(p_provider_payment_id), ''),
    nullif(btrim(p_target_price_id), ''), nullif(btrim(p_target_plan), ''), p_cancel_at_period_end,
    nullif(lower(btrim(p_currency)), ''), p_amount_minor, btrim(p_reason), coalesce(p_preview, '{}'::jsonb), p_expected_observed_at
  ) returning * into inserted;

  return jsonb_build_object('intentId', inserted.id, 'status', inserted.status, 'existing', false);
end;
$$;

create or replace function public.billing_claim_action_intents(
  p_worker_id text,
  p_limit integer default 10,
  p_lease_seconds integer default 900
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  items jsonb;
begin
  if auth.role() <> 'service_role' then raise exception 'Billing action service access required'; end if;
  if p_worker_id is null or length(btrim(p_worker_id)) not between 8 and 160
    or p_limit is null or p_limit not between 1 and 50
    or p_lease_seconds is null or p_lease_seconds not between 60 and 3600 then
    raise exception 'Invalid billing action lease';
  end if;

  with candidates as (
    select i.id
    from public.billing_action_intents i
    join public.billing_action_capabilities c
      on c.provider = i.provider and c.environment = i.environment and c.operation = i.operation
    where (i.status = 'queued' or (i.status = 'processing' and i.locked_until <= clock_timestamp()))
      and c.enabled
    order by i.created_at, i.id
    for update of i skip locked
    limit p_limit
  ), claimed as (
    update public.billing_action_intents i
    set status = 'processing', worker_id = btrim(p_worker_id), locked_until = clock_timestamp() + make_interval(secs => p_lease_seconds), updated_at = clock_timestamp()
    from candidates c
    where i.id = c.id
    returning i.*
  )
  select coalesce(jsonb_agg(to_jsonb(claimed) order by claimed.created_at, claimed.id), '[]'::jsonb)
  into items
  from claimed;
  return items;
end;
$$;

create or replace function public.billing_record_action_attempt(
  p_intent_id uuid,
  p_worker_id text,
  p_status text,
  p_provider_request_id text default null,
  p_provider_operation_id text default null,
  p_response_summary jsonb default '{}'::jsonb,
  p_error_code text default null,
  p_error_message text default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  intent_row public.billing_action_intents%rowtype;
  attempt_no integer;
  saved_attempt public.billing_action_attempts%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Billing action service access required'; end if;
  if p_intent_id is null or p_worker_id is null or length(btrim(p_worker_id)) not between 8 and 160
    or p_status not in ('succeeded', 'failed', 'pending_reconciliation', 'awaiting_customer_approval', 'unsupported')
    or jsonb_typeof(coalesce(p_response_summary, '{}'::jsonb)) <> 'object' then
    raise exception 'Invalid billing action result';
  end if;

  select * into intent_row from public.billing_action_intents where id = p_intent_id for update;
  if not found or intent_row.status <> 'processing' or intent_row.worker_id <> btrim(p_worker_id)
    or intent_row.locked_until <= clock_timestamp() then
    raise exception 'Billing action lease is no longer valid';
  end if;
  select coalesce(max(a.attempt_no), 0) + 1 into attempt_no from public.billing_action_attempts a where a.intent_id = p_intent_id;
  insert into public.billing_action_attempts (
    intent_id, attempt_no, worker_id, status, provider_request_id, provider_operation_id,
    response_summary, error_code, error_message
  ) values (
    p_intent_id, attempt_no, btrim(p_worker_id), p_status,
    nullif(btrim(p_provider_request_id), ''), nullif(btrim(p_provider_operation_id), ''),
    coalesce(p_response_summary, '{}'::jsonb), nullif(btrim(p_error_code), ''), left(nullif(btrim(p_error_message), ''), 1000)
  ) returning * into saved_attempt;

  update public.billing_action_intents
  set status = p_status,
      locked_until = clock_timestamp(),
      provider_request_id = coalesce(nullif(btrim(p_provider_request_id), ''), provider_request_id),
      provider_operation_id = coalesce(nullif(btrim(p_provider_operation_id), ''), provider_operation_id),
      reconciliation_receipt = coalesce(p_response_summary, '{}'::jsonb),
      error_code = nullif(btrim(p_error_code), ''),
      error_message = left(nullif(btrim(p_error_message), ''), 1000),
      completed_at = case when p_status in ('succeeded', 'failed', 'unsupported') then clock_timestamp() else null end,
      updated_at = clock_timestamp()
  where id = p_intent_id;
  return jsonb_build_object('intentId', p_intent_id, 'attemptNo', saved_attempt.attempt_no, 'status', p_status);
end;
$$;

revoke all on function public.billing_create_action_intent(uuid, uuid, text, text, text, text, text, text, text, text, text, text, boolean, text, bigint, text, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.billing_claim_action_intents(text, integer, integer) from public, anon, authenticated;
revoke all on function public.billing_record_action_attempt(uuid, text, text, text, text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.billing_create_action_intent(uuid, uuid, text, text, text, text, text, text, text, text, text, text, boolean, text, bigint, text, jsonb, timestamptz) to service_role;
grant execute on function public.billing_claim_action_intents(text, integer, integer) to service_role;
grant execute on function public.billing_record_action_attempt(uuid, text, text, text, text, jsonb, text, text) to service_role;

commit;
