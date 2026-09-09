begin;

-- Provider-specific read models keep raw webhook payloads out of the admin UI
-- while preserving the normalized state needed for reconciliation and billing
-- operations. The provider remains authoritative; these rows are observed facts.
create table if not exists public.billing_subscriptions (
  user_id uuid references public.users(id) on delete set null,
  provider text not null check (provider in ('stripe', 'paypal')),
  environment text not null default 'live' check (environment in ('live', 'test')),
  subscription_id text not null check (length(btrim(subscription_id)) between 1 and 255),
  customer_id text,
  status text not null check (length(btrim(status)) between 1 and 80),
  plan text,
  price_id text,
  currency text,
  amount_minor bigint check (amount_minor is null or amount_minor >= 0),
  billing_interval text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  cancel_at timestamptz,
  canceled_at timestamptz,
  source_event_id text,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (provider, environment, subscription_id)
);

create table if not exists public.billing_transactions (
  user_id uuid references public.users(id) on delete set null,
  provider text not null check (provider in ('stripe', 'paypal')),
  environment text not null default 'live' check (environment in ('live', 'test')),
  transaction_id text not null check (length(btrim(transaction_id)) between 1 and 255),
  transaction_type text not null check (transaction_type in ('payment', 'invoice', 'refund', 'dispute', 'chargeback', 'adjustment')),
  subscription_id text,
  status text not null check (length(btrim(status)) between 1 and 80),
  currency text,
  amount_minor bigint check (amount_minor is null or amount_minor >= 0),
  occurred_at timestamptz,
  source_event_id text,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (provider, environment, transaction_id, transaction_type)
);

create index if not exists billing_subscriptions_user_idx
  on public.billing_subscriptions(user_id, observed_at desc);
create index if not exists billing_subscriptions_status_idx
  on public.billing_subscriptions(provider, environment, status, current_period_end);
create index if not exists billing_transactions_user_idx
  on public.billing_transactions(user_id, occurred_at desc, created_at desc);
create index if not exists billing_transactions_subscription_idx
  on public.billing_transactions(provider, environment, subscription_id, occurred_at desc);

alter table public.billing_subscriptions enable row level security;
alter table public.billing_transactions enable row level security;
revoke all on table public.billing_subscriptions from public, anon, authenticated;
revoke all on table public.billing_transactions from public, anon, authenticated;
grant select, insert, update on table public.billing_subscriptions to service_role;
grant select, insert, update on table public.billing_transactions to service_role;

create or replace function public.upsert_billing_subscription_projection(
  p_user_id uuid,
  p_provider text,
  p_subscription_id text,
  p_snapshot jsonb,
  p_observed_at timestamptz default clock_timestamp()
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  environment_name text := case when coalesce((p_snapshot->>'livemode')::boolean, true) then 'live' else 'test' end;
  updated_row public.billing_subscriptions%rowtype;
begin
  if p_user_id is null or p_provider not in ('stripe', 'paypal')
    or p_subscription_id is null or length(btrim(p_subscription_id)) not between 1 and 255 then
    raise exception 'Invalid billing subscription projection';
  end if;
  if jsonb_typeof(coalesce(p_snapshot, '{}'::jsonb)) <> 'object' then
    raise exception 'Invalid billing subscription snapshot';
  end if;

  insert into public.billing_subscriptions (
    user_id, provider, environment, subscription_id, customer_id, status, plan, price_id,
    currency, amount_minor, billing_interval, current_period_start, current_period_end,
    cancel_at_period_end, cancel_at, canceled_at, source_event_id, observed_at, updated_at
  ) values (
    p_user_id,
    p_provider,
    environment_name,
    btrim(p_subscription_id),
    nullif(btrim(p_snapshot->>'customerId'), ''),
    btrim(coalesce(p_snapshot->>'status', 'unknown')),
    nullif(btrim(p_snapshot->>'plan'), ''),
    nullif(btrim(p_snapshot->>'priceId'), ''),
    nullif(lower(btrim(p_snapshot->>'currency')), ''),
    case when p_snapshot ? 'amountMinor' then (p_snapshot->>'amountMinor')::bigint else null end,
    nullif(btrim(p_snapshot->>'billingInterval'), ''),
    case when nullif(p_snapshot->>'currentPeriodStart', '') is null then null else (p_snapshot->>'currentPeriodStart')::timestamptz end,
    case when nullif(p_snapshot->>'currentPeriodEnd', '') is null then null else (p_snapshot->>'currentPeriodEnd')::timestamptz end,
    coalesce((p_snapshot->>'cancelAtPeriodEnd')::boolean, false),
    case when nullif(p_snapshot->>'cancelAt', '') is null then null else (p_snapshot->>'cancelAt')::timestamptz end,
    case when nullif(p_snapshot->>'canceledAt', '') is null then null else (p_snapshot->>'canceledAt')::timestamptz end,
    nullif(btrim(p_snapshot->>'sourceEventId'), ''),
    coalesce(p_observed_at, clock_timestamp()),
    clock_timestamp()
  )
  on conflict (provider, environment, subscription_id) do update set
    user_id = excluded.user_id,
    customer_id = coalesce(excluded.customer_id, billing_subscriptions.customer_id),
    status = excluded.status,
    plan = coalesce(excluded.plan, billing_subscriptions.plan),
    price_id = coalesce(excluded.price_id, billing_subscriptions.price_id),
    currency = coalesce(excluded.currency, billing_subscriptions.currency),
    amount_minor = coalesce(excluded.amount_minor, billing_subscriptions.amount_minor),
    billing_interval = coalesce(excluded.billing_interval, billing_subscriptions.billing_interval),
    current_period_start = coalesce(excluded.current_period_start, billing_subscriptions.current_period_start),
    current_period_end = coalesce(excluded.current_period_end, billing_subscriptions.current_period_end),
    cancel_at_period_end = excluded.cancel_at_period_end,
    cancel_at = excluded.cancel_at,
    canceled_at = excluded.canceled_at,
    source_event_id = coalesce(excluded.source_event_id, billing_subscriptions.source_event_id),
    observed_at = excluded.observed_at,
    updated_at = clock_timestamp()
  where billing_subscriptions.observed_at <= excluded.observed_at
  returning * into updated_row;

  if not found then
    select * into updated_row
    from public.billing_subscriptions
    where provider = p_provider and environment = environment_name and subscription_id = btrim(p_subscription_id);
  end if;

  return jsonb_build_object(
    'provider', updated_row.provider,
    'environment', updated_row.environment,
    'subscriptionId', updated_row.subscription_id,
    'status', updated_row.status,
    'observedAt', updated_row.observed_at
  );
end;
$$;

create or replace function public.record_billing_transaction_projection(
  p_user_id uuid,
  p_provider text,
  p_transaction_id text,
  p_transaction_type text,
  p_snapshot jsonb,
  p_observed_at timestamptz default clock_timestamp()
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  environment_name text := case when coalesce((p_snapshot->>'livemode')::boolean, true) then 'live' else 'test' end;
  saved_row public.billing_transactions%rowtype;
begin
  if p_user_id is null or p_provider not in ('stripe', 'paypal')
    or p_transaction_id is null or length(btrim(p_transaction_id)) not between 1 and 255
    or p_transaction_type not in ('payment', 'invoice', 'refund', 'dispute', 'chargeback', 'adjustment') then
    raise exception 'Invalid billing transaction projection';
  end if;
  if jsonb_typeof(coalesce(p_snapshot, '{}'::jsonb)) <> 'object' then
    raise exception 'Invalid billing transaction snapshot';
  end if;

  insert into public.billing_transactions (
    user_id, provider, environment, transaction_id, transaction_type, subscription_id,
    status, currency, amount_minor, occurred_at, source_event_id, observed_at, updated_at
  ) values (
    p_user_id,
    p_provider,
    environment_name,
    btrim(p_transaction_id),
    p_transaction_type,
    nullif(btrim(p_snapshot->>'subscriptionId'), ''),
    btrim(coalesce(p_snapshot->>'status', 'unknown')),
    nullif(lower(btrim(p_snapshot->>'currency')), ''),
    case when p_snapshot ? 'amountMinor' then (p_snapshot->>'amountMinor')::bigint else null end,
    case when nullif(p_snapshot->>'occurredAt', '') is null then null else (p_snapshot->>'occurredAt')::timestamptz end,
    nullif(btrim(p_snapshot->>'sourceEventId'), ''),
    coalesce(p_observed_at, clock_timestamp()),
    clock_timestamp()
  )
  on conflict (provider, environment, transaction_id, transaction_type) do update set
    user_id = excluded.user_id,
    subscription_id = coalesce(excluded.subscription_id, billing_transactions.subscription_id),
    status = excluded.status,
    currency = coalesce(excluded.currency, billing_transactions.currency),
    amount_minor = coalesce(excluded.amount_minor, billing_transactions.amount_minor),
    occurred_at = coalesce(excluded.occurred_at, billing_transactions.occurred_at),
    source_event_id = coalesce(excluded.source_event_id, billing_transactions.source_event_id),
    observed_at = excluded.observed_at,
    updated_at = clock_timestamp()
  where billing_transactions.observed_at <= excluded.observed_at
  returning * into saved_row;

  if not found then
    select * into saved_row
    from public.billing_transactions
    where provider = p_provider and environment = environment_name
      and transaction_id = btrim(p_transaction_id) and transaction_type = p_transaction_type;
  end if;

  return jsonb_build_object(
    'provider', saved_row.provider,
    'environment', saved_row.environment,
    'transactionId', saved_row.transaction_id,
    'transactionType', saved_row.transaction_type,
    'status', saved_row.status,
    'observedAt', saved_row.observed_at
  );
end;
$$;

revoke all on function public.upsert_billing_subscription_projection(uuid, text, text, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.record_billing_transaction_projection(uuid, text, text, text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.upsert_billing_subscription_projection(uuid, text, text, jsonb, timestamptz) to service_role;
grant execute on function public.record_billing_transaction_projection(uuid, text, text, text, jsonb, timestamptz) to service_role;

commit;
