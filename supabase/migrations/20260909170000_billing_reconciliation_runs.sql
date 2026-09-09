begin;

-- A provider reconciliation run is a durable, single-provider lease. The
-- provider remains authoritative; this table records worker health and
-- bounded repair attempts without making a timeout look like cancellation.
create table if not exists public.billing_reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('stripe', 'paypal')),
  environment text not null check (environment in ('live', 'test')),
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  worker_id text not null check (length(btrim(worker_id)) between 8 and 160),
  locked_until timestamptz not null,
  started_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  processed_count integer not null default 0 check (processed_count between 0 and 100000),
  failed_count integer not null default 0 check (failed_count between 0 and 100000),
  error text,
  created_at timestamptz not null default clock_timestamp()
);

create unique index if not exists billing_reconciliation_active_provider_idx
  on public.billing_reconciliation_runs(provider, environment)
  where status = 'running';
create index if not exists billing_reconciliation_recent_idx
  on public.billing_reconciliation_runs(provider, environment, created_at desc);

alter table public.billing_reconciliation_runs enable row level security;
revoke all on table public.billing_reconciliation_runs from public, anon, authenticated;
grant select, insert, update on table public.billing_reconciliation_runs to service_role;

create or replace function public.billing_claim_reconciliation_run(
  p_provider text,
  p_environment text,
  p_worker_id text,
  p_lease_seconds integer default 900
) returns public.billing_reconciliation_runs
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  claimed public.billing_reconciliation_runs;
begin
  if p_provider not in ('stripe', 'paypal')
    or p_environment not in ('live', 'test')
    or p_worker_id is null or length(btrim(p_worker_id)) not between 8 and 160
    or p_lease_seconds is null or p_lease_seconds not between 60 and 3600 then
    raise exception 'Invalid billing reconciliation lease';
  end if;

  perform pg_advisory_xact_lock(hashtext('billing-reconciliation:' || p_provider || ':' || p_environment));

  update public.billing_reconciliation_runs
  set status = 'failed', completed_at = clock_timestamp(), error = 'lease_expired'
  where provider = p_provider
    and environment = p_environment
    and status = 'running'
    and locked_until <= clock_timestamp();

  if exists (
    select 1 from public.billing_reconciliation_runs
    where provider = p_provider and environment = p_environment
      and status = 'running' and locked_until > clock_timestamp()
  ) then
    return null;
  end if;

  insert into public.billing_reconciliation_runs(
    provider, environment, status, worker_id, locked_until
  ) values (
    p_provider, p_environment, 'running', btrim(p_worker_id),
    clock_timestamp() + make_interval(secs => p_lease_seconds)
  ) returning * into claimed;

  return claimed;
end;
$$;

create or replace function public.billing_finish_reconciliation_run(
  p_run_id uuid,
  p_worker_id text,
  p_processed_count integer,
  p_failed_count integer
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_run_id is null or p_worker_id is null or length(btrim(p_worker_id)) not between 8 and 160
    or p_processed_count is null or p_processed_count not between 0 and 100000
    or p_failed_count is null or p_failed_count not between 0 and 100000 then
    raise exception 'Invalid billing reconciliation result';
  end if;

  update public.billing_reconciliation_runs
  set status = 'completed', completed_at = clock_timestamp(), locked_until = clock_timestamp(),
      processed_count = p_processed_count, failed_count = p_failed_count, error = null
  where id = p_run_id and status = 'running' and worker_id = btrim(p_worker_id)
    and locked_until > clock_timestamp();
  if not found then raise exception 'Billing reconciliation lease is no longer valid'; end if;
  return true;
end;
$$;

create or replace function public.billing_fail_reconciliation_run(
  p_run_id uuid,
  p_worker_id text,
  p_error text,
  p_processed_count integer,
  p_failed_count integer
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_run_id is null or p_worker_id is null or length(btrim(p_worker_id)) not between 8 and 160
    or p_processed_count is null or p_processed_count not between 0 and 100000
    or p_failed_count is null or p_failed_count not between 0 and 100000 then
    raise exception 'Invalid billing reconciliation failure';
  end if;

  update public.billing_reconciliation_runs
  set status = 'failed', completed_at = clock_timestamp(), locked_until = clock_timestamp(),
      processed_count = p_processed_count, failed_count = p_failed_count,
      error = left(coalesce(nullif(btrim(p_error), ''), 'billing_reconciliation_failed'), 2000)
  where id = p_run_id and status = 'running' and worker_id = btrim(p_worker_id);
  if not found then raise exception 'Billing reconciliation lease is no longer valid'; end if;
  return true;
end;
$$;

revoke all on function public.billing_claim_reconciliation_run(text, text, text, integer) from public, anon, authenticated;
revoke all on function public.billing_finish_reconciliation_run(uuid, text, integer, integer) from public, anon, authenticated;
revoke all on function public.billing_fail_reconciliation_run(uuid, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.billing_claim_reconciliation_run(text, text, text, integer) to service_role;
grant execute on function public.billing_finish_reconciliation_run(uuid, text, integer, integer) to service_role;
grant execute on function public.billing_fail_reconciliation_run(uuid, text, text, integer, integer) to service_role;

commit;
