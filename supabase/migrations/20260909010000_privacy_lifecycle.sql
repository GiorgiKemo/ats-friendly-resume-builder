begin;

-- Privacy operations are durable workflows. They are intentionally separate from
-- the immediate Auth delete path so exports, holds, provider state, and retries
-- can be reviewed and resumed without pretending that deletion is complete.
create table if not exists public.privacy_holds (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null,
  hold_type text not null check (hold_type in ('legal', 'accounting', 'security', 'support')),
  reason text not null check (length(btrim(reason)) between 1 and 2000),
  created_by_user_id uuid references auth.users(id) on delete set null,
  released_by_user_id uuid references auth.users(id) on delete set null,
  expires_at timestamptz,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or expires_at > created_at),
  check ((released_at is null) or released_by_user_id is not null)
);

create table if not exists public.privacy_export_jobs (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null,
  requested_by_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'ready', 'failed', 'expired', 'cancelled')),
  storage_path text,
  failure_code text,
  item_count integer check (item_count is null or item_count >= 0),
  requested_at timestamptz not null default now(),
  locked_until timestamptz,
  completed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.privacy_deletion_jobs (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null,
  requested_by_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'waiting_hold', 'failed', 'completed', 'cancelled')),
  current_step text not null default 'preview' check (current_step in ('preview', 'lock_access', 'provider_review', 'export_review', 'delete_data', 'delete_auth', 'reconcile', 'complete')),
  failure_code text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  requested_at timestamptz not null default now(),
  locked_until timestamptz,
  next_attempt_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists privacy_holds_target_idx
  on public.privacy_holds(target_user_id, created_at desc);
create index if not exists privacy_exports_queue_idx
  on public.privacy_export_jobs(status, requested_at, id);
create index if not exists privacy_deletions_queue_idx
  on public.privacy_deletion_jobs(status, next_attempt_at, id);
create unique index if not exists privacy_active_export_target_idx
  on public.privacy_export_jobs(target_user_id)
  where status in ('pending', 'processing', 'ready');
create unique index if not exists privacy_active_deletion_target_idx
  on public.privacy_deletion_jobs(target_user_id)
  where status in ('pending', 'processing', 'waiting_hold');

alter table public.privacy_holds enable row level security;
alter table public.privacy_export_jobs enable row level security;
alter table public.privacy_deletion_jobs enable row level security;

revoke all on table public.privacy_holds from public, anon, authenticated;
revoke all on table public.privacy_export_jobs from public, anon, authenticated;
revoke all on table public.privacy_deletion_jobs from public, anon, authenticated;
grant select, insert, update on table public.privacy_holds to service_role;
grant select, insert, update on table public.privacy_export_jobs to service_role;
grant select, insert, update on table public.privacy_deletion_jobs to service_role;

create or replace function public.privacy_claim_deletion_job(
  p_job_id uuid,
  p_lock_seconds integer default 300
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  job public.privacy_deletion_jobs%rowtype;
  hold_exists boolean;
begin
  if p_job_id is null or p_lock_seconds is null or p_lock_seconds not between 30 and 3600 then
    raise exception 'Invalid privacy deletion claim';
  end if;

  select exists (
    select 1 from public.privacy_holds h
    where h.target_user_id = (select target_user_id from public.privacy_deletion_jobs where id = p_job_id)
      and h.released_at is null
      and (h.expires_at is null or h.expires_at > clock_timestamp())
  ) into hold_exists;

  select * into job
  from public.privacy_deletion_jobs
  where id = p_job_id
    and (
      (status = 'pending' and next_attempt_at <= clock_timestamp())
      or (status = 'processing' and locked_until is not null and locked_until <= clock_timestamp())
      or (status = 'waiting_hold' and next_attempt_at <= clock_timestamp())
    )
  for update;
  if not found then return jsonb_build_object('claimed', false, 'reason', 'not_available'); end if;

  if hold_exists then
    update public.privacy_deletion_jobs
    set status = 'waiting_hold', current_step = 'export_review', locked_until = null,
        next_attempt_at = clock_timestamp() + interval '1 hour', updated_at = clock_timestamp()
    where id = job.id;
    return jsonb_build_object('claimed', false, 'reason', 'active_hold', 'jobId', job.id);
  end if;

  update public.privacy_deletion_jobs
  set status = 'processing', locked_until = clock_timestamp() + make_interval(secs => p_lock_seconds),
      attempt_count = attempt_count + 1, updated_at = clock_timestamp()
  where id = job.id
  returning * into job;
  return jsonb_build_object('claimed', true, 'jobId', job.id, 'targetUserId', job.target_user_id, 'step', job.current_step, 'attempt', job.attempt_count);
end;
$$;

revoke all on function public.privacy_claim_deletion_job(uuid, integer) from public, anon, authenticated;
grant execute on function public.privacy_claim_deletion_job(uuid, integer) to service_role;

commit;
