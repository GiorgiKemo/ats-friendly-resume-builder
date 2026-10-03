begin;

create or replace function public.privacy_resume_failed_deletion_job(
  p_job_id uuid,
  p_actor_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  job public.privacy_deletion_jobs%rowtype;
begin
  if p_job_id is null or p_actor_user_id is null then
    raise exception 'Invalid privacy deletion recovery request';
  end if;

  if not exists (
    select 1 from public.admin_members member
    where member.user_id = p_actor_user_id
      and member.role = 'owner'
      and member.is_active
  ) then
    raise exception 'Owner access required for deletion recovery';
  end if;

  select * into job
  from public.privacy_deletion_jobs
  where id = p_job_id
  for update;
  if not found then raise exception 'Privacy deletion job not found'; end if;
  if job.status <> 'failed' then raise exception 'Privacy deletion job is not failed'; end if;
  if job.current_step = 'complete' then raise exception 'Completed deletion steps cannot be resumed'; end if;

  perform private.lock_privacy_deletion_account(job.target_user_id, true);

  if exists (
    select 1 from public.privacy_deletion_jobs other_job
    where other_job.target_user_id = job.target_user_id
      and other_job.id <> job.id
      and other_job.status in ('pending', 'waiting_owner_approval', 'processing', 'waiting_hold', 'waiting_provider_cancellation')
  ) then
    raise exception 'Another active privacy deletion request already exists for this account';
  end if;

  if exists (
    select 1 from public.privacy_deletion_jobs completed_job
    where completed_job.target_user_id = job.target_user_id
      and completed_job.status = 'completed'
  ) then
    raise exception 'A completed privacy deletion request cannot be resumed';
  end if;

  update public.privacy_deletion_jobs
  set status = 'pending',
      failure_code = null,
      worker_id = null,
      worker_locked_until = null,
      locked_until = null,
      next_attempt_at = pg_catalog.clock_timestamp(),
      updated_at = pg_catalog.clock_timestamp()
  where id = job.id;

  return jsonb_build_object(
    'jobId', job.id,
    'targetUserId', job.target_user_id,
    'previousStep', job.current_step,
    'previousFailureCode', job.failure_code,
    'destructiveStartedAt', job.destructive_started_at,
    'attemptCount', job.attempt_count,
    'ownerApprovedAt', job.owner_approved_at
  );
end;
$$;

revoke all on function public.privacy_resume_failed_deletion_job(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.privacy_resume_failed_deletion_job(uuid, uuid)
  to service_role;

commit;
