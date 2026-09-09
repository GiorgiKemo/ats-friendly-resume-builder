begin;

alter table public.privacy_deletion_jobs
  add column if not exists owner_approved_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists owner_approved_at timestamptz;

alter table public.privacy_deletion_jobs
  drop constraint if exists privacy_deletion_jobs_status_check;

alter table public.privacy_deletion_jobs
  add constraint privacy_deletion_jobs_status_check
  check (status in ('pending', 'waiting_owner_approval', 'processing', 'waiting_hold', 'waiting_provider_cancellation', 'failed', 'completed', 'cancelled'));

drop index if exists public.privacy_active_deletion_target_idx;
create unique index if not exists privacy_active_deletion_target_idx
  on public.privacy_deletion_jobs(target_user_id)
  where status in ('pending', 'waiting_owner_approval', 'processing', 'waiting_hold', 'waiting_provider_cancellation');

create or replace function public.privacy_approve_deletion_job(
  p_job_id uuid,
  p_actor_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  job public.privacy_deletion_jobs%rowtype;
begin
  if p_job_id is null or p_actor_user_id is null then raise exception 'Invalid privacy deletion approval'; end if;

  if not exists (
    select 1 from public.admin_members m
    where m.user_id = p_actor_user_id
      and m.role = 'owner'
      and m.is_active
  ) then
    raise exception 'Owner access required for deletion approval';
  end if;

  select * into job
  from public.privacy_deletion_jobs
  where id = p_job_id
  for update;
  if not found then raise exception 'Privacy deletion job not found'; end if;
  if job.status in ('processing', 'completed', 'cancelled') then
    raise exception 'Privacy deletion job is not awaiting owner approval';
  end if;
  if job.owner_approved_at is not null then
    return jsonb_build_object('jobId', job.id, 'targetUserId', job.target_user_id, 'alreadyApproved', true);
  end if;

  update public.privacy_deletion_jobs
  set owner_approved_by_user_id = p_actor_user_id,
      owner_approved_at = clock_timestamp(),
      status = 'pending',
      current_step = 'preview',
      failure_code = null,
      next_attempt_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where id = job.id;

  return jsonb_build_object(
    'jobId', job.id,
    'targetUserId', job.target_user_id,
    'alreadyApproved', false,
    'ownerApprovedAt', clock_timestamp()
  );
end;
$$;

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
  provider_review_pending boolean;
begin
  if p_job_id is null or p_lock_seconds is null or p_lock_seconds not between 30 and 3600 then
    raise exception 'Invalid privacy deletion claim';
  end if;

  select * into job
  from public.privacy_deletion_jobs
  where id = p_job_id
    and (
      (status in ('pending', 'waiting_owner_approval') and next_attempt_at <= clock_timestamp())
      or (status = 'processing' and locked_until is not null and locked_until <= clock_timestamp())
      or (status in ('waiting_hold', 'waiting_provider_cancellation') and next_attempt_at <= clock_timestamp())
    )
  for update;
  if not found then return jsonb_build_object('claimed', false, 'reason', 'not_available'); end if;

  if job.owner_approved_at is null then
    update public.privacy_deletion_jobs
    set status = 'waiting_owner_approval', current_step = 'preview', locked_until = null,
        next_attempt_at = clock_timestamp() + interval '1 hour', updated_at = clock_timestamp()
    where id = job.id;
    return jsonb_build_object('claimed', false, 'reason', 'owner_approval_required', 'jobId', job.id);
  end if;

  select exists (
    select 1 from public.privacy_holds h
    where h.target_user_id = job.target_user_id
      and h.released_at is null
      and (h.expires_at is null or h.expires_at > clock_timestamp())
  ) into hold_exists;

  if hold_exists then
    update public.privacy_deletion_jobs
    set status = 'waiting_hold', current_step = 'export_review', locked_until = null,
        next_attempt_at = clock_timestamp() + interval '1 hour', updated_at = clock_timestamp()
    where id = job.id;
    return jsonb_build_object('claimed', false, 'reason', 'active_hold', 'jobId', job.id);
  end if;

  insert into public.privacy_provider_cancellation_reviews (
    deletion_job_id, target_user_id, provider, subscription_id, review_status, reason
  )
  select
    job.id,
    e.user_id,
    e.provider,
    e.subscription_id,
    'required',
    'Active external entitlement observed during deletion claim'
  from public.billing_entitlements e
  where e.user_id = job.target_user_id
    and e.provider in ('stripe', 'paypal')
    and e.active
  on conflict (deletion_job_id, provider, subscription_id) do nothing;

  select exists (
    select 1
    from public.billing_entitlements e
    where e.user_id = job.target_user_id
      and e.provider in ('stripe', 'paypal')
      and e.active
  ) or exists (
    select 1
    from public.privacy_provider_cancellation_reviews r
    where r.deletion_job_id = job.id
      and r.review_status = 'required'
  ) into provider_review_pending;

  if provider_review_pending then
    update public.privacy_deletion_jobs
    set status = 'waiting_provider_cancellation', current_step = 'provider_review', locked_until = null,
        next_attempt_at = clock_timestamp() + interval '1 hour', updated_at = clock_timestamp()
    where id = job.id;
    return jsonb_build_object('claimed', false, 'reason', 'provider_cancellation_review_required', 'jobId', job.id);
  end if;

  update public.privacy_deletion_jobs
  set status = 'processing', locked_until = clock_timestamp() + make_interval(secs => p_lock_seconds),
      attempt_count = attempt_count + 1, updated_at = clock_timestamp()
  where id = job.id
  returning * into job;
  return jsonb_build_object('claimed', true, 'jobId', job.id, 'targetUserId', job.target_user_id, 'step', job.current_step, 'attempt', job.attempt_count);
end;
$$;

revoke all on function public.privacy_approve_deletion_job(uuid, uuid) from public, anon, authenticated;
revoke all on function public.privacy_claim_deletion_job(uuid, integer) from public, anon, authenticated;
grant execute on function public.privacy_approve_deletion_job(uuid, uuid) to service_role;
grant execute on function public.privacy_claim_deletion_job(uuid, integer) to service_role;

commit;
