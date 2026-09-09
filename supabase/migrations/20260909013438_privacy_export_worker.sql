begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'privacy-exports',
  'privacy-exports',
  false,
  52428800,
  array['application/json']::text[]
)
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table public.privacy_export_jobs
  add column if not exists attempt_count integer not null default 0,
  add column if not exists worker_id text,
  add column if not exists next_attempt_at timestamptz not null default now();

alter table public.privacy_export_jobs
  drop constraint if exists privacy_export_jobs_attempt_count_check;

alter table public.privacy_export_jobs
  add constraint privacy_export_jobs_attempt_count_check
  check (attempt_count between 0 and 5);

create index if not exists privacy_exports_worker_queue_idx
  on public.privacy_export_jobs(status, next_attempt_at, locked_until, requested_at, id);

create or replace function public.privacy_claim_export_jobs(
  p_worker_id text,
  p_limit integer default 3,
  p_lease_seconds integer default 600
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  claimed jsonb;
begin
  if p_worker_id is null or length(btrim(p_worker_id)) not between 8 and 120 then
    raise exception 'Invalid privacy worker identity';
  end if;
  if p_limit is null or p_limit not between 1 and 10 then
    raise exception 'Invalid privacy export batch size';
  end if;
  if p_lease_seconds is null or p_lease_seconds not between 60 and 3600 then
    raise exception 'Invalid privacy export lease';
  end if;

  with candidates as (
    select id
    from public.privacy_export_jobs
    where (
      (status = 'pending' and next_attempt_at <= clock_timestamp())
      or (status = 'processing' and locked_until is not null and locked_until <= clock_timestamp())
    )
    order by requested_at, id
    limit p_limit
    for update skip locked
  ), updated as (
    update public.privacy_export_jobs j
    set status = 'processing',
        locked_until = clock_timestamp() + make_interval(secs => p_lease_seconds),
        worker_id = btrim(p_worker_id),
        attempt_count = j.attempt_count + 1,
        failure_code = null,
        updated_at = clock_timestamp()
    from candidates c
    where j.id = c.id
    returning j.id, j.target_user_id, j.attempt_count, j.locked_until
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'jobId', id,
    'targetUserId', target_user_id,
    'attempt', attempt_count,
    'leaseUntil', locked_until
  ) order by id), '[]'::jsonb)
  into claimed
  from updated;

  return claimed;
end;
$$;

create or replace function public.privacy_complete_export_job(
  p_job_id uuid,
  p_worker_id text,
  p_storage_path text,
  p_item_count integer,
  p_expires_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  job public.privacy_export_jobs%rowtype;
begin
  if p_worker_id is null or length(btrim(p_worker_id)) not between 8 and 120 then
    raise exception 'Invalid privacy worker identity';
  end if;
  if p_storage_path is null or p_item_count is null or p_item_count < 0 then
    raise exception 'Invalid privacy export result';
  end if;
  if p_expires_at is null or p_expires_at <= clock_timestamp()
    or p_expires_at > clock_timestamp() + interval '7 days' then
    raise exception 'Invalid privacy export expiry';
  end if;

  select * into job from public.privacy_export_jobs where id = p_job_id;
  if not found or p_storage_path <> job.target_user_id::text || '/' || job.id::text || '.json' then
    raise exception 'Invalid privacy export path';
  end if;

  update public.privacy_export_jobs
  set status = 'ready',
      storage_path = p_storage_path,
      item_count = p_item_count,
      expires_at = p_expires_at,
      locked_until = null,
      worker_id = null,
      completed_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where id = p_job_id
    and status = 'processing'
    and worker_id = btrim(p_worker_id)
    and locked_until > clock_timestamp()
  returning * into job;

  if not found then raise exception 'Privacy export lease is no longer valid'; end if;
  return jsonb_build_object('jobId', job.id, 'status', job.status, 'storagePath', job.storage_path, 'expiresAt', job.expires_at);
end;
$$;

create or replace function public.privacy_release_export_job(
  p_job_id uuid,
  p_worker_id text,
  p_retry boolean,
  p_failure_code text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  job public.privacy_export_jobs%rowtype;
begin
  if p_worker_id is null or length(btrim(p_worker_id)) not between 8 and 120 then
    raise exception 'Invalid privacy worker identity';
  end if;
  if p_failure_code is null or length(btrim(p_failure_code)) not between 1 and 120 then
    raise exception 'Invalid privacy export failure';
  end if;

  update public.privacy_export_jobs
  set status = case when p_retry and attempt_count < 5 then 'pending' else 'failed' end,
      failure_code = btrim(p_failure_code),
      locked_until = null,
      worker_id = null,
      next_attempt_at = case when p_retry and attempt_count < 5 then clock_timestamp() + interval '5 minutes' else next_attempt_at end,
      updated_at = clock_timestamp()
  where id = p_job_id
    and status = 'processing'
    and worker_id = btrim(p_worker_id)
  returning * into job;

  if not found then raise exception 'Privacy export lease is no longer valid'; end if;
  return jsonb_build_object('jobId', job.id, 'status', job.status, 'failureCode', job.failure_code);
end;
$$;

create or replace function public.privacy_expire_exports(
  p_limit integer default 100
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  expired jsonb;
begin
  if p_limit is null or p_limit not between 1 and 500 then raise exception 'Invalid privacy expiry batch size'; end if;

  with candidates as (
    select id from public.privacy_export_jobs
    where status = 'ready' and expires_at is not null and expires_at <= clock_timestamp()
    order by expires_at, id
    limit p_limit
    for update skip locked
  ), updated as (
    update public.privacy_export_jobs j
    set status = 'expired', updated_at = clock_timestamp()
    from candidates c
    where j.id = c.id
    returning j.id, j.storage_path
  )
  select coalesce(jsonb_agg(jsonb_build_object('jobId', id, 'storagePath', storage_path) order by id), '[]'::jsonb)
  into expired
  from updated;

  return expired;
end;
$$;

revoke all on function public.privacy_claim_export_jobs(text, integer, integer) from public, anon, authenticated;
revoke all on function public.privacy_complete_export_job(uuid, text, text, integer, timestamptz) from public, anon, authenticated;
revoke all on function public.privacy_release_export_job(uuid, text, boolean, text) from public, anon, authenticated;
revoke all on function public.privacy_expire_exports(integer) from public, anon, authenticated;
grant execute on function public.privacy_claim_export_jobs(text, integer, integer) to service_role;
grant execute on function public.privacy_complete_export_job(uuid, text, text, integer, timestamptz) to service_role;
grant execute on function public.privacy_release_export_job(uuid, text, boolean, text) to service_role;
grant execute on function public.privacy_expire_exports(integer) to service_role;

commit;
