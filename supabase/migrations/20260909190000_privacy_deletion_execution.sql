begin;

-- Destructive privacy execution is deliberately separate from the admin API.
-- The worker can only reach this boundary after owner approval, no active hold,
-- provider cancellation review, and provider reconciliation have all passed.
alter table public.privacy_deletion_jobs
  add column if not exists worker_id text,
  add column if not exists worker_locked_until timestamptz,
  add column if not exists destructive_started_at timestamptz,
  add column if not exists auth_deleted_at timestamptz;

create index if not exists privacy_deletion_worker_queue_idx
  on public.privacy_deletion_jobs(status, next_attempt_at, locked_until, id);

create or replace function public.privacy_claim_deletion_execution(
  p_job_id uuid,
  p_worker_id text,
  p_lock_seconds integer default 600
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  claim jsonb;
  job public.privacy_deletion_jobs%rowtype;
begin
  if p_job_id is null
    or p_worker_id is null
    or length(btrim(p_worker_id)) not between 8 and 120
    or p_lock_seconds is null
    or p_lock_seconds not between 60 and 3600 then
    raise exception 'Invalid privacy deletion execution claim';
  end if;

  -- Reuse the existing approval/hold/provider boundary. This function is the
  -- only service-role entry point that assigns a destructive worker lease.
  claim := public.privacy_claim_deletion_job(p_job_id, p_lock_seconds);
  if coalesce((claim->>'claimed')::boolean, false) is not true then
    return claim;
  end if;

  update public.privacy_deletion_jobs
  set worker_id = btrim(p_worker_id),
      worker_locked_until = locked_until,
      destructive_started_at = coalesce(destructive_started_at, clock_timestamp()),
      current_step = case
        when current_step in ('preview', 'provider_review', 'export_review') then 'delete_data'
        else current_step
      end,
      updated_at = clock_timestamp()
  where id = p_job_id
    and status = 'processing'
    and locked_until is not null
    and locked_until > clock_timestamp()
  returning * into job;

  if not found then raise exception 'Privacy deletion worker lease was lost'; end if;

  return claim || jsonb_build_object(
    'workerId', job.worker_id,
    'step', job.current_step,
    'targetUserId', job.target_user_id
  );
end;
$$;

create or replace function public.privacy_get_deletion_artifacts(
  p_job_id uuid,
  p_worker_id text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  job public.privacy_deletion_jobs%rowtype;
  attachment_paths jsonb;
  export_paths jsonb;
begin
  select * into job
  from public.privacy_deletion_jobs
  where id = p_job_id
    and status = 'processing'
    and worker_id = btrim(p_worker_id)
    and worker_locked_until is not null
    and worker_locked_until > clock_timestamp()
  for update;
  if not found then raise exception 'Privacy deletion worker lease is not valid'; end if;
  if job.current_step <> 'delete_data' then
    return jsonb_build_object('jobId', job.id, 'targetUserId', job.target_user_id, 'attachmentPaths', '[]'::jsonb, 'exportPaths', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(a.storage_path order by a.storage_path), '[]'::jsonb)
  into attachment_paths
  from public.support_attachments a
  join public.support_conversations c on c.id = a.conversation_id
  where c.customer_user_id = job.target_user_id;

  select coalesce(jsonb_agg(e.storage_path order by e.storage_path), '[]'::jsonb)
  into export_paths
  from public.privacy_export_jobs e
  where e.target_user_id = job.target_user_id
    and e.storage_path is not null;

  return jsonb_build_object(
    'jobId', job.id,
    'targetUserId', job.target_user_id,
    'attachmentPaths', attachment_paths,
    'exportPaths', export_paths
  );
end;
$$;

create or replace function public.privacy_delete_user_data(
  p_job_id uuid,
  p_worker_id text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  job public.privacy_deletion_jobs%rowtype;
  active_provider boolean;
  pending_provider_review boolean;
  active_hold boolean;
  deleted_user_id uuid;
begin
  select * into job
  from public.privacy_deletion_jobs
  where id = p_job_id
    and status = 'processing'
    and worker_id = btrim(p_worker_id)
    and worker_locked_until is not null
    and worker_locked_until > clock_timestamp()
  for update;
  if not found then raise exception 'Privacy deletion worker lease is not valid'; end if;
  if job.current_step = 'delete_auth' then
    return jsonb_build_object('jobId', job.id, 'targetUserId', job.target_user_id, 'authUserId', job.target_user_id, 'alreadyDeleted', true);
  end if;
  if job.current_step <> 'delete_data' then raise exception 'Privacy deletion job is not at the data step'; end if;
  if job.owner_approved_at is null then raise exception 'Owner approval is required before deletion'; end if;

  select exists (
    select 1 from public.privacy_holds h
    where h.target_user_id = job.target_user_id
      and h.released_at is null
      and (h.expires_at is null or h.expires_at > clock_timestamp())
  ) into active_hold;
  if active_hold then raise exception 'Privacy hold blocks deletion'; end if;

  select exists (
    select 1 from public.billing_entitlements e
    where e.user_id = job.target_user_id and e.provider in ('stripe', 'paypal') and e.active
  ) into active_provider;
  select exists (
    select 1 from public.privacy_provider_cancellation_reviews r
    where r.deletion_job_id = job.id and r.review_status = 'required'
  ) into pending_provider_review;
  if active_provider or pending_provider_review then
    raise exception 'Provider cancellation reconciliation is required';
  end if;

  -- An active admin membership requires a separate owner-controlled revoke.
  -- Never let an automated privacy worker remove an administrator's access.
  if exists (
    select 1 from public.admin_members m
    where m.user_id = job.target_user_id and m.is_active
  ) then
    raise exception 'Active admin membership blocks account deletion';
  end if;

  -- Remove customer-owned application, automation, connection, and support
  -- data explicitly. Financial projections and audit evidence are handled
  -- below as unlink/anonymize operations rather than being erased.
  delete from public.support_conversations where customer_user_id = job.target_user_id;
  delete from public.support_participants where user_id = job.target_user_id;
  delete from public.support_read_cursors where user_id = job.target_user_id;
  delete from public.support_operation_receipts where actor_user_id = job.target_user_id;
  update public.support_conversation_events set actor_user_id = null where actor_user_id = job.target_user_id;
  update public.support_messages set sender_user_id = null where sender_user_id = job.target_user_id;
  update public.support_internal_notes set agent_user_id = null where agent_user_id = job.target_user_id;

  delete from public.auto_apply_jobs where user_id = job.target_user_id;
  delete from public.auto_apply_runs where user_id = job.target_user_id;
  delete from public.gmail_connections where user_id = job.target_user_id;
  delete from public.job_applications where user_id = job.target_user_id;
  delete from public.job_preferences where user_id = job.target_user_id;
  delete from public.ai_generations where user_id = job.target_user_id;

  -- Keep aggregate/error/audit evidence without retaining the account link.
  update public.analytics_events set actor_user_id = null where actor_user_id = job.target_user_id;
  update public.app_error_events set user_id = null, user_email = null where user_id = job.target_user_id;
  update public.admin_audit_events
  set admin_user_id = null where admin_user_id = job.target_user_id;
  update public.admin_audit_events
  set target_user_id = null where target_user_id = job.target_user_id;
  update public.billing_subscriptions set user_id = null where user_id = job.target_user_id;
  update public.billing_transactions set user_id = null where user_id = job.target_user_id;

  -- Exports are private user data; preserve the request record but invalidate
  -- its object and download path before the Auth account is removed.
  update public.privacy_export_jobs
  set status = 'expired', storage_path = null, failure_code = 'account_deletion_completed', updated_at = clock_timestamp()
  where target_user_id = job.target_user_id
    and status in ('pending', 'processing', 'ready');

  -- Inactive invitation/admin rows are retained only as a redacted audit
  -- marker. Active admin rows were rejected above.
  update public.admin_members
  set email = 'deleted-' || id::text || '@invalid.local',
      user_id = null,
      is_active = false,
      invitation_revoked_at = coalesce(invitation_revoked_at, clock_timestamp()),
      updated_at = clock_timestamp()
  where user_id = job.target_user_id;

  delete from public.users where id = job.target_user_id returning id into deleted_user_id;
  if deleted_user_id is null then
    -- Auth may already have removed the public projection after a previous
    -- successful attempt; the remaining Auth step is still idempotent.
    deleted_user_id := job.target_user_id;
  end if;

  update public.privacy_deletion_jobs
  set current_step = 'delete_auth',
      failure_code = null,
      updated_at = clock_timestamp()
  where id = job.id;

  return jsonb_build_object('jobId', job.id, 'targetUserId', job.target_user_id, 'authUserId', deleted_user_id, 'alreadyDeleted', false);
end;
$$;

create or replace function public.privacy_mark_auth_deleted(
  p_job_id uuid,
  p_worker_id text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  job public.privacy_deletion_jobs%rowtype;
begin
  select * into job
  from public.privacy_deletion_jobs
  where id = p_job_id
    and status = 'processing'
    and worker_id = btrim(p_worker_id)
    and worker_locked_until is not null
    and worker_locked_until > clock_timestamp()
  for update;
  if not found then raise exception 'Privacy deletion worker lease is not valid'; end if;
  if job.current_step <> 'delete_auth' then raise exception 'Privacy deletion job is not at the Auth step'; end if;

  update public.privacy_deletion_jobs
  set auth_deleted_at = coalesce(auth_deleted_at, clock_timestamp()),
      current_step = 'reconcile',
      updated_at = clock_timestamp()
  where id = job.id;
  return jsonb_build_object('jobId', job.id, 'targetUserId', job.target_user_id, 'authDeleted', true);
end;
$$;

create or replace function public.privacy_complete_deletion_job(
  p_job_id uuid,
  p_worker_id text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  job public.privacy_deletion_jobs%rowtype;
begin
  select * into job
  from public.privacy_deletion_jobs
  where id = p_job_id
    and status = 'processing'
    and worker_id = btrim(p_worker_id)
    and worker_locked_until is not null
    and worker_locked_until > clock_timestamp()
  for update;
  if not found then raise exception 'Privacy deletion worker lease is not valid'; end if;
  if job.auth_deleted_at is null or job.current_step <> 'reconcile' then
    raise exception 'Auth deletion is not confirmed';
  end if;
  if exists (
    select 1 from public.billing_entitlements e
    where e.user_id = job.target_user_id and e.provider in ('stripe', 'paypal') and e.active
  ) then
    raise exception 'Provider reconciliation is not complete';
  end if;

  update public.privacy_deletion_jobs
  set status = 'completed', current_step = 'complete', worker_id = null,
      worker_locked_until = null, locked_until = null, completed_at = clock_timestamp(), updated_at = clock_timestamp()
  where id = job.id;
  return jsonb_build_object('jobId', job.id, 'targetUserId', job.target_user_id, 'status', 'completed');
end;
$$;

create or replace function public.privacy_release_deletion_job(
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
  job public.privacy_deletion_jobs%rowtype;
  safe_code text := left(regexp_replace(btrim(coalesce(p_failure_code, 'deletion_failed')), '[^a-zA-Z0-9_.:-]', '_', 'g'), 120);
begin
  select * into job
  from public.privacy_deletion_jobs
  where id = p_job_id and status = 'processing' and worker_id = btrim(p_worker_id)
  for update;
  if not found then return jsonb_build_object('released', false, 'reason', 'not_owned'); end if;

  update public.privacy_deletion_jobs
  set status = case when p_retry then 'pending' else 'failed' end,
      worker_id = null,
      worker_locked_until = null,
      locked_until = null,
      failure_code = safe_code,
      next_attempt_at = clock_timestamp() + case when p_retry then interval '15 minutes' else interval '1 year' end,
      updated_at = clock_timestamp()
  where id = job.id;
  return jsonb_build_object('released', true, 'status', case when p_retry then 'pending' else 'failed' end, 'jobId', job.id);
end;
$$;

revoke all on function public.privacy_claim_deletion_execution(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.privacy_get_deletion_artifacts(uuid, text) from public, anon, authenticated;
revoke all on function public.privacy_delete_user_data(uuid, text) from public, anon, authenticated;
revoke all on function public.privacy_mark_auth_deleted(uuid, text) from public, anon, authenticated;
revoke all on function public.privacy_complete_deletion_job(uuid, text) from public, anon, authenticated;
revoke all on function public.privacy_release_deletion_job(uuid, text, boolean, text) from public, anon, authenticated;
grant execute on function public.privacy_claim_deletion_execution(uuid, text, integer) to service_role;
grant execute on function public.privacy_get_deletion_artifacts(uuid, text) to service_role;
grant execute on function public.privacy_delete_user_data(uuid, text) to service_role;
grant execute on function public.privacy_mark_auth_deleted(uuid, text) to service_role;
grant execute on function public.privacy_complete_deletion_job(uuid, text) to service_role;
grant execute on function public.privacy_release_deletion_job(uuid, text, boolean, text) to service_role;

commit;
