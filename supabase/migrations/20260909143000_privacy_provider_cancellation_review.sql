begin;

-- Account deletion must not silently leave an external recurring payment active.
-- This table records reviewed provider evidence only; it does not call Stripe or
-- PayPal and it is never a substitute for provider webhook reconciliation.
alter table public.privacy_deletion_jobs
  drop constraint if exists privacy_deletion_jobs_status_check;

alter table public.privacy_deletion_jobs
  add constraint privacy_deletion_jobs_status_check
  check (status in ('pending', 'processing', 'waiting_hold', 'waiting_provider_cancellation', 'failed', 'completed', 'cancelled'));

drop index if exists public.privacy_active_deletion_target_idx;
create unique index if not exists privacy_active_deletion_target_idx
  on public.privacy_deletion_jobs(target_user_id)
  where status in ('pending', 'processing', 'waiting_hold', 'waiting_provider_cancellation');

create table if not exists public.privacy_provider_cancellation_reviews (
  id uuid primary key default gen_random_uuid(),
  deletion_job_id uuid not null references public.privacy_deletion_jobs(id) on delete cascade,
  -- Keep the workflow evidence after an eventual account deletion; do not make
  -- this review row an FK that prevents the destructive step it documents.
  target_user_id uuid not null,
  provider text not null check (provider in ('stripe', 'paypal', 'none')),
  subscription_id text not null check (length(btrim(subscription_id)) between 1 and 255),
  review_status text not null default 'required' check (review_status in ('required', 'confirmed', 'not_required')),
  evidence_reference text check (evidence_reference is null or length(btrim(evidence_reference)) between 1 and 500),
  reason text check (reason is null or length(btrim(reason)) between 1 and 2000),
  reviewed_by_user_id uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (deletion_job_id, provider, subscription_id),
  check ((provider = 'none') = (subscription_id = 'none')),
  check (
    (review_status = 'confirmed' and evidence_reference is not null and reviewed_by_user_id is not null and reviewed_at is not null)
    or (review_status in ('required', 'not_required'))
  )
);

create index if not exists privacy_provider_reviews_job_idx
  on public.privacy_provider_cancellation_reviews(deletion_job_id, review_status, created_at);

alter table public.privacy_provider_cancellation_reviews enable row level security;
revoke all on table public.privacy_provider_cancellation_reviews from public, anon, authenticated;
grant select, insert, update on table public.privacy_provider_cancellation_reviews to service_role;

create or replace function public.privacy_initialize_provider_cancellation_reviews(
  p_job_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  job public.privacy_deletion_jobs%rowtype;
  provider_count integer := 0;
begin
  if p_job_id is null then raise exception 'Invalid privacy deletion job'; end if;

  select * into job
  from public.privacy_deletion_jobs
  where id = p_job_id
  for update;
  if not found then raise exception 'Privacy deletion job not found'; end if;
  if job.status in ('completed', 'cancelled') then
    raise exception 'Privacy deletion job is no longer reviewable';
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
    'Active external entitlement observed when deletion review was queued'
  from public.billing_entitlements e
  where e.user_id = job.target_user_id
    and e.provider in ('stripe', 'paypal')
    and e.active
  on conflict (deletion_job_id, provider, subscription_id) do nothing;

  select count(*)::integer into provider_count
  from public.privacy_provider_cancellation_reviews
  where deletion_job_id = job.id
    and provider in ('stripe', 'paypal');

  if provider_count = 0 then
    insert into public.privacy_provider_cancellation_reviews (
      deletion_job_id, target_user_id, provider, subscription_id, review_status, reason
    ) values (
      job.id,
      job.target_user_id,
      'none',
      'none',
      'not_required',
      'No active external subscription was observed when deletion review was queued'
    ) on conflict (deletion_job_id, provider, subscription_id) do nothing;
  end if;

  return jsonb_build_object(
    'jobId', job.id,
    'targetUserId', job.target_user_id,
    'providerReviewCount', provider_count,
    'status', job.status
  );
end;
$$;

create or replace function public.privacy_record_provider_cancellation_review(
  p_review_id uuid,
  p_actor_user_id uuid,
  p_evidence_reference text,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  review public.privacy_provider_cancellation_reviews%rowtype;
  job public.privacy_deletion_jobs%rowtype;
  evidence text := nullif(btrim(coalesce(p_evidence_reference, '')), '');
  note text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if p_review_id is null or p_actor_user_id is null then
    raise exception 'Invalid provider cancellation review';
  end if;
  if evidence is null or length(evidence) > 500 then
    raise exception 'A provider cancellation evidence reference is required';
  end if;
  if note is null or length(note) > 2000 then
    raise exception 'A provider cancellation review note is required';
  end if;

  select * into review
  from public.privacy_provider_cancellation_reviews
  where id = p_review_id
  for update;
  if not found then raise exception 'Provider cancellation review not found'; end if;
  if review.provider = 'none' then raise exception 'No provider cancellation is required for this review'; end if;
  if review.review_status = 'confirmed' then raise exception 'Provider cancellation review is already confirmed'; end if;

  select * into job
  from public.privacy_deletion_jobs
  where id = review.deletion_job_id
  for update;
  if not found or job.status in ('completed', 'cancelled') then
    raise exception 'Privacy deletion job is no longer reviewable';
  end if;

  update public.privacy_provider_cancellation_reviews
  set review_status = 'confirmed',
      evidence_reference = evidence,
      reason = note,
      reviewed_by_user_id = p_actor_user_id,
      reviewed_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where id = review.id;

  update public.privacy_deletion_jobs
  set status = case when status = 'waiting_provider_cancellation' then 'pending' else status end,
      current_step = case when status = 'waiting_provider_cancellation' then 'provider_review' else current_step end,
      failure_code = null,
      next_attempt_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where id = job.id;

  return jsonb_build_object(
    'reviewId', review.id,
    'jobId', review.deletion_job_id,
    'targetUserId', review.target_user_id,
    'provider', review.provider,
    'subscriptionId', review.subscription_id,
    'reviewStatus', 'confirmed'
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
      (status = 'pending' and next_attempt_at <= clock_timestamp())
      or (status = 'processing' and locked_until is not null and locked_until <= clock_timestamp())
      or (status in ('waiting_hold', 'waiting_provider_cancellation') and next_attempt_at <= clock_timestamp())
    )
  for update;
  if not found then return jsonb_build_object('claimed', false, 'reason', 'not_available'); end if;

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

  -- Snapshot any provider rows that appeared after the request before checking
  -- the boundary, so the admin can see the new blocker instead of only a
  -- generic worker response.
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

  -- Provider evidence is not provider truth. Even after a human records a
  -- cancellation reference, wait for billing reconciliation to mark the
  -- entitlement inactive before any destructive execution can claim the job.
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

revoke all on function public.privacy_initialize_provider_cancellation_reviews(uuid) from public, anon, authenticated;
revoke all on function public.privacy_record_provider_cancellation_review(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.privacy_claim_deletion_job(uuid, integer) from public, anon, authenticated;
grant execute on function public.privacy_initialize_provider_cancellation_reviews(uuid) to service_role;
grant execute on function public.privacy_record_provider_cancellation_review(uuid, uuid, text, text) to service_role;
grant execute on function public.privacy_claim_deletion_job(uuid, integer) to service_role;

commit;
