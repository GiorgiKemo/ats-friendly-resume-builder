begin;

-- Serialize the final deletion gate with changes that could make an account
-- ineligible for deletion. A try-lock in the row triggers makes a concurrent
-- eligibility write fail/retry instead of committing behind a stale snapshot.
create or replace function private.lock_privacy_deletion_account(
  p_user_id uuid,
  p_wait boolean default false
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  lock_key bigint;
begin
  if p_user_id is null then raise exception 'Privacy deletion account is required'; end if;
  lock_key := pg_catalog.hashtextextended('resumeats:privacy-deletion:' || p_user_id::text, 0);
  if p_wait then
    perform pg_catalog.pg_advisory_xact_lock(lock_key);
    return true;
  end if;
  return pg_catalog.pg_try_advisory_xact_lock(lock_key);
end;
$$;

create or replace function private.guard_privacy_deletion_eligibility_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  identity_column text;
  old_user_id uuid;
  new_user_id uuid;
  user_id_to_lock uuid;
  new_row jsonb;
  deletion_started boolean;
  adds_blocker boolean := false;
begin
  identity_column := case
    when tg_table_name in ('admin_members', 'billing_entitlements', 'manual_access_grants') then 'user_id'
    else 'target_user_id'
  end;
  if tg_op <> 'INSERT' then
    old_user_id := nullif(pg_catalog.to_jsonb(old) ->> identity_column, '')::uuid;
  end if;
  if tg_op <> 'DELETE' then
    new_row := pg_catalog.to_jsonb(new);
    new_user_id := nullif(new_row ->> identity_column, '')::uuid;
  end if;

  -- Lock both sides of a possible owner change in deterministic order.
  for user_id_to_lock in
    select ids.user_id
    from pg_catalog.unnest(array[old_user_id, new_user_id]) as ids(user_id)
    where ids.user_id is not null
    group by ids.user_id
    order by ids.user_id
  loop
    if not private.lock_privacy_deletion_account(user_id_to_lock, false) then
      raise exception using
        errcode = '55P03',
        message = 'Privacy deletion is checking account eligibility; retry this change';
    end if;
  end loop;

  if new_user_id is not null then
    select exists (
      select 1
      from public.privacy_deletion_jobs job
      where job.target_user_id = new_user_id
        and job.destructive_started_at is not null
        and job.status not in ('completed', 'cancelled')
        and not exists (
          select 1
          from public.privacy_deletion_jobs completed_job
          where completed_job.target_user_id = new_user_id
            and completed_job.status = 'completed'
        )
    ) into deletion_started;

    if deletion_started then
      case tg_table_name
        when 'admin_members' then
          adds_blocker := coalesce((new_row ->> 'is_active')::boolean, false);
        when 'privacy_holds' then
          adds_blocker := (new_row ->> 'released_at') is null
            and ((new_row ->> 'expires_at') is null
              or (new_row ->> 'expires_at')::timestamptz > pg_catalog.clock_timestamp());
        when 'billing_entitlements' then
          adds_blocker := new_row ->> 'provider' in ('stripe', 'paypal')
            and coalesce((new_row ->> 'active')::boolean, false);
        when 'manual_access_grants' then
          adds_blocker := (new_row ->> 'revoked_at') is null
            and (new_row ->> 'starts_at')::timestamptz <= pg_catalog.clock_timestamp()
            and ((new_row ->> 'expires_at') is null
              or (new_row ->> 'expires_at')::timestamptz > pg_catalog.clock_timestamp());
        when 'privacy_provider_cancellation_reviews' then
          adds_blocker := new_row ->> 'review_status' = 'required';
        else
          raise exception 'Unexpected privacy eligibility trigger table';
      end case;

      if adds_blocker then
        raise exception using
          errcode = '55000',
          message = 'Privacy deletion has started; new eligibility blockers are not allowed';
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.lock_privacy_deletion_account(uuid, boolean)
  from public, anon, authenticated, service_role;
revoke all on function private.guard_privacy_deletion_eligibility_mutation()
  from public, anon, authenticated, service_role;

drop trigger if exists privacy_deletion_eligibility_guard on public.admin_members;
create trigger privacy_deletion_eligibility_guard
before insert or update or delete on public.admin_members
for each row execute function private.guard_privacy_deletion_eligibility_mutation();

drop trigger if exists privacy_deletion_eligibility_guard on public.privacy_holds;
create trigger privacy_deletion_eligibility_guard
before insert or update or delete on public.privacy_holds
for each row execute function private.guard_privacy_deletion_eligibility_mutation();

drop trigger if exists privacy_deletion_eligibility_guard on public.billing_entitlements;
create trigger privacy_deletion_eligibility_guard
before insert or update or delete on public.billing_entitlements
for each row execute function private.guard_privacy_deletion_eligibility_mutation();

drop trigger if exists privacy_deletion_eligibility_guard on public.manual_access_grants;
create trigger privacy_deletion_eligibility_guard
before insert or update or delete on public.manual_access_grants
for each row execute function private.guard_privacy_deletion_eligibility_mutation();

drop trigger if exists privacy_deletion_eligibility_guard on public.privacy_provider_cancellation_reviews;
create trigger privacy_deletion_eligibility_guard
before insert or update or delete on public.privacy_provider_cancellation_reviews
for each row execute function private.guard_privacy_deletion_eligibility_mutation();

create or replace function public.privacy_claim_deletion_execution(
  p_job_id uuid,
  p_worker_id text,
  p_lock_seconds integer default 600
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  claim jsonb;
  job public.privacy_deletion_jobs%rowtype;
  active_admin boolean;
  active_manual_access boolean;
  blocker_code text;
begin
  if p_job_id is null
    or p_worker_id is null
    or length(btrim(p_worker_id)) not between 8 and 120
    or p_lock_seconds is null
    or p_lock_seconds not between 60 and 3600 then
    raise exception 'Invalid privacy deletion execution claim';
  end if;

  select * into job
  from public.privacy_deletion_jobs
  where id = p_job_id
  for update;
  if not found then return jsonb_build_object('claimed', false, 'reason', 'not_available'); end if;

  -- Keep the account lock from the final eligibility check until the worker
  -- lease and irreversible-phase marker commit. All corresponding row triggers
  -- use the same key, so no new blocker can slip in during that transition.
  perform private.lock_privacy_deletion_account(job.target_user_id, true);
  claim := public.privacy_claim_deletion_job(p_job_id, p_lock_seconds);
  if coalesce((claim->>'claimed')::boolean, false) is not true then
    return claim;
  end if;

  if job.current_step not in ('delete_auth', 'reconcile', 'complete') then
    select exists (
      select 1 from public.admin_members member
      where member.user_id = job.target_user_id and member.is_active
    ) into active_admin;
    select exists (
      select 1 from public.billing_entitlements entitlement
      where entitlement.user_id = job.target_user_id
        and entitlement.provider = 'manual'
        and entitlement.active
    ) or exists (
      select 1 from public.manual_access_grants grant_row
      where grant_row.user_id = job.target_user_id
        and grant_row.revoked_at is null
        and grant_row.starts_at <= pg_catalog.clock_timestamp()
        and (grant_row.expires_at is null or grant_row.expires_at > pg_catalog.clock_timestamp())
    ) into active_manual_access;

    blocker_code := case
      when active_admin then 'active_admin_membership'
      when active_manual_access then 'active_manual_access'
      else null
    end;
    if blocker_code is not null then
      update public.privacy_deletion_jobs
      set status = 'failed',
          current_step = 'preview',
          failure_code = blocker_code,
          worker_id = null,
          worker_locked_until = null,
          locked_until = null,
          next_attempt_at = pg_catalog.clock_timestamp() + interval '1 year',
          updated_at = pg_catalog.clock_timestamp()
      where id = job.id;
      return claim || pg_catalog.jsonb_build_object(
        'claimed', false,
        'reason', blocker_code
      );
    end if;
  end if;

  update public.privacy_deletion_jobs
  set worker_id = btrim(p_worker_id),
      worker_locked_until = locked_until,
      destructive_started_at = coalesce(destructive_started_at, pg_catalog.clock_timestamp()),
      current_step = case
        when current_step in ('preview', 'provider_review', 'export_review') then 'delete_data'
        else current_step
      end,
      updated_at = pg_catalog.clock_timestamp()
  where id = p_job_id
    and status = 'processing'
    and locked_until is not null
    and locked_until > pg_catalog.clock_timestamp()
  returning * into job;

  if not found then raise exception 'Privacy deletion worker lease was lost'; end if;

  return claim || pg_catalog.jsonb_build_object(
    'workerId', job.worker_id,
    'step', job.current_step,
    'targetUserId', job.target_user_id
  );
end;
$$;

revoke all on function public.privacy_claim_deletion_execution(uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.privacy_claim_deletion_execution(uuid, text, integer)
  to service_role;

commit;
