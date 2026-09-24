begin;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to service_role;

alter table public.analytics_events
  drop constraint if exists analytics_events_event_name_check;
alter table public.analytics_events
  add constraint analytics_events_event_name_check check (event_name in (
    'account_created',
    'account_confirmed',
    'upgrade_click',
    'resume_created',
    'resume_exported',
    'application_created',
    'checkout_started',
    'checkout_created',
    'purchase_confirmed',
    'support_started',
    'support_resolved',
    'ai_generation_started',
    'ai_generation_completed',
    'ai_generation_failed'
  ));

create table private.analytics_metric_coverage (
  metric_key text primary key,
  metric_version integer not null check (metric_version > 0),
  coverage_start timestamptz not null,
  definition jsonb not null check (jsonb_typeof(definition) = 'object'),
  created_at timestamptz not null default clock_timestamp()
);
alter table private.analytics_metric_coverage enable row level security;
revoke all on private.analytics_metric_coverage from public, anon, authenticated, service_role;

insert into private.analytics_metric_coverage(metric_key, metric_version, coverage_start, definition)
values (
  'signup_to_paid_30d',
  1,
  clock_timestamp(),
  '{"cohort":"first account confirmation","numerator":"distinct confirmed accounts whose first nonzero successful live subscription payment occurs in [confirmation, confirmation + 30 days)","denominator":"distinct confirmed accounts in the same mature cohort","excluded":["staff at confirmation or payment","QA-tagged accounts","test/sandbox payments","manual access grants","zero-value payments"],"timezone":"UTC event instants; cohort window uses supplied half-open timestamps"}'::jsonb
);

create table private.analytics_identity_exclusion_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reason_code text not null check (reason_code in ('staff', 'qa')),
  source text not null check (source in ('admin_membership', 'owner_review')),
  effective_from timestamptz not null,
  effective_to timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  check (effective_to is null or effective_to > effective_from)
);
create index analytics_identity_exclusion_lookup_idx
  on private.analytics_identity_exclusion_periods(user_id, effective_from, effective_to);
create unique index analytics_identity_exclusion_open_idx
  on private.analytics_identity_exclusion_periods(user_id, reason_code, source)
  where effective_to is null;
alter table private.analytics_identity_exclusion_periods enable row level security;
revoke all on private.analytics_identity_exclusion_periods from public, anon, authenticated, service_role;

create table private.analytics_cohort_quality_reviews (
  metric_key text primary key references private.analytics_metric_coverage(metric_key) on delete cascade,
  qa_exclusions_reviewed_at timestamptz,
  reviewed_by_user_id uuid references auth.users(id) on delete set null,
  qa_exclusion_period_count integer not null default 0 check (qa_exclusion_period_count >= 0),
  updated_at timestamptz not null default clock_timestamp(),
  check ((qa_exclusions_reviewed_at is null) = (reviewed_by_user_id is null))
);
alter table private.analytics_cohort_quality_reviews enable row level security;
revoke all on private.analytics_cohort_quality_reviews from public, anon, authenticated, service_role;
insert into private.analytics_cohort_quality_reviews(metric_key)
values ('signup_to_paid_30d');

create or replace function private.invalidate_analytics_qa_exclusion_review()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
begin
  if (tg_op <> 'DELETE' and new.reason_code = 'qa')
    or (tg_op <> 'INSERT' and old.reason_code = 'qa') then
    update private.analytics_cohort_quality_reviews
    set qa_exclusions_reviewed_at = null,
        reviewed_by_user_id = null,
        qa_exclusion_period_count = 0,
        updated_at = clock_timestamp()
    where metric_key in ('signup_to_paid_30d');
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function private.review_analytics_cohort_quality(p_actor_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  coverage_start_at timestamptz;
  exclusion_count integer;
  reviewed_at timestamptz := clock_timestamp();
begin
  if p_actor_user_id is null or not exists (
    select 1 from public.admin_members m
    where m.user_id = p_actor_user_id and m.is_active and m.role = 'owner'
  ) then
    raise exception 'Owner access required';
  end if;

  select c.coverage_start into coverage_start_at
  from private.analytics_metric_coverage c
  where c.metric_key = 'signup_to_paid_30d';
  if coverage_start_at is null then
    raise exception 'Analytics metric coverage is unavailable';
  end if;

  select count(*)::integer into exclusion_count
  from private.analytics_identity_exclusion_periods x
  where x.reason_code = 'qa'
    and x.effective_from <= reviewed_at
    and (x.effective_to is null or x.effective_to > coverage_start_at);

  update private.analytics_cohort_quality_reviews
  set qa_exclusions_reviewed_at = reviewed_at,
      reviewed_by_user_id = p_actor_user_id,
      qa_exclusion_period_count = exclusion_count,
      updated_at = reviewed_at
  where metric_key = 'signup_to_paid_30d';
  if not found then raise exception 'Analytics quality review record is unavailable'; end if;

  insert into public.admin_audit_events(admin_user_id, action, metadata)
  values (
    p_actor_user_id,
    'analytics.cohort_quality.reviewed',
    jsonb_build_object(
      'metric', 'signup_to_paid_30d',
      'metricVersion', 1,
      'qaExclusionPeriodCount', exclusion_count,
      'reviewedAt', reviewed_at
    )
  );

  return jsonb_build_object(
    'metric', 'signup_to_paid_30d',
    'metricVersion', 1,
    'qaExclusionPeriodCount', exclusion_count,
    'reviewedAt', reviewed_at
  );
end;
$$;

create trigger analytics_qa_exclusion_invalidates_review
after insert or update or delete on private.analytics_identity_exclusion_periods
for each row execute function private.invalidate_analytics_qa_exclusion_review();

create or replace function private.record_account_confirmed_event(p_user_id uuid, p_confirmed_at timestamptz)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  metric_coverage_start timestamptz;
begin
  if p_user_id is null or p_confirmed_at is null then
    return;
  end if;

  select coverage_start into metric_coverage_start
  from private.analytics_metric_coverage
  where metric_key = 'signup_to_paid_30d';

  if metric_coverage_start is null or p_confirmed_at < metric_coverage_start then
    return;
  end if;

  insert into public.analytics_events(event_key, event_name, actor_user_id, properties, occurred_at)
  values ('account-confirmed:' || p_user_id::text, 'account_confirmed', p_user_id, '{}'::jsonb, p_confirmed_at)
  on conflict (event_key) do nothing;
end;
$$;

create or replace function private.capture_account_confirmation_after_profile_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  confirmation_at timestamptz;
begin
  select confirmed_at into confirmation_at from auth.users where id = new.id;
  perform private.record_account_confirmed_event(new.id, confirmation_at);
  return new;
end;
$$;

drop trigger if exists users_capture_account_confirmed_event on public.users;
create trigger users_capture_account_confirmed_event
after insert on public.users
for each row execute function private.capture_account_confirmation_after_profile_insert();

create or replace function private.capture_account_confirmation_after_auth_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if old.confirmed_at is null and new.confirmed_at is not null then
    perform private.record_account_confirmed_event(new.id, new.confirmed_at);
  end if;
  return new;
end;
$$;

drop trigger if exists auth_users_capture_account_confirmed_event on auth.users;
create trigger auth_users_capture_account_confirmed_event
after update of confirmed_at on auth.users
for each row execute function private.capture_account_confirmation_after_auth_update();

create or replace function private.capture_admin_membership_analytics_exclusion()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private, public
as $$
declare
  now_at timestamptz := clock_timestamp();
begin
  if tg_op = 'INSERT' then
    if new.is_active and new.user_id is not null and not exists (
      select 1 from private.analytics_identity_exclusion_periods e
      where e.user_id = new.user_id and e.reason_code = 'staff'
        and e.source = 'admin_membership' and e.effective_to is null
    ) then
      insert into private.analytics_identity_exclusion_periods(user_id, reason_code, source, effective_from)
      values (new.user_id, 'staff', 'admin_membership', now_at);
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    if old.user_id is not null and old.is_active
      and (old.user_id is distinct from new.user_id or not new.is_active)
      and not exists (
        select 1 from public.admin_members m
        where m.user_id = old.user_id and m.is_active and m.id <> new.id
      ) then
      update private.analytics_identity_exclusion_periods
      set effective_to = greatest(now_at, effective_from + interval '1 microsecond')
      where user_id = old.user_id and reason_code = 'staff'
        and source = 'admin_membership' and effective_to is null;
    end if;

    if new.user_id is not null and new.is_active
      and (old.user_id is distinct from new.user_id or not old.is_active)
      and not exists (
        select 1 from private.analytics_identity_exclusion_periods e
        where e.user_id = new.user_id and e.reason_code = 'staff'
          and e.source = 'admin_membership' and e.effective_to is null
      ) then
      insert into private.analytics_identity_exclusion_periods(user_id, reason_code, source, effective_from)
      values (new.user_id, 'staff', 'admin_membership', now_at);
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.user_id is not null and old.is_active and not exists (
      select 1 from public.admin_members m where m.user_id = old.user_id and m.is_active
    ) then
      update private.analytics_identity_exclusion_periods
      set effective_to = greatest(now_at, effective_from + interval '1 microsecond')
      where user_id = old.user_id and reason_code = 'staff'
        and source = 'admin_membership' and effective_to is null;
    end if;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists admin_members_capture_analytics_exclusion on public.admin_members;
create trigger admin_members_capture_analytics_exclusion
after insert or update or delete on public.admin_members
for each row execute function private.capture_admin_membership_analytics_exclusion();

insert into private.analytics_identity_exclusion_periods(user_id, reason_code, source, effective_from)
select distinct m.user_id, 'staff', 'admin_membership', c.coverage_start
from public.admin_members m
cross join private.analytics_metric_coverage c
where c.metric_key = 'signup_to_paid_30d'
  and m.is_active and m.user_id is not null
  and not exists (
    select 1 from private.analytics_identity_exclusion_periods e
    where e.user_id = m.user_id and e.reason_code = 'staff'
      and e.source = 'admin_membership' and e.effective_to is null
  );

create or replace function private.calculate_signup_to_paid_30d_cohort(
  p_from timestamptz,
  p_to timestamptz,
  p_as_of timestamptz default clock_timestamp()
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  as_of_at timestamptz := coalesce(p_as_of, clock_timestamp());
  coverage_start_at timestamptz;
  review_at timestamptz;
  reviewed_by uuid;
  reviewed_exclusion_count integer := 0;
  current_exclusion_count integer := 0;
  mature_denominator bigint := 0;
  mature_numerator bigint := 0;
  maturing_denominator bigint := 0;
  maturing_observed_numerator bigint := 0;
  excluded_accounts bigint := 0;
  qa_excluded_accounts bigint := 0;
  refunded_or_disputed_accounts bigint := 0;
  stripe_reconciled boolean := false;
  paypal_reconciled boolean := false;
  quality_reasons text[] := array[]::text[];
  measured_rate numeric;
begin
  if p_from is null or p_to is null or p_from >= p_to
    or p_to > as_of_at or p_to - p_from > interval '366 days' then
    raise exception 'Invalid paid-conversion cohort window';
  end if;

  select coverage_start into coverage_start_at
  from private.analytics_metric_coverage
  where metric_key = 'signup_to_paid_30d';
  select qa_exclusions_reviewed_at, reviewed_by_user_id, qa_exclusion_period_count
  into review_at, reviewed_by, reviewed_exclusion_count
  from private.analytics_cohort_quality_reviews
  where metric_key = 'signup_to_paid_30d';

  select count(*)::integer into current_exclusion_count
  from private.analytics_identity_exclusion_periods x
  where x.reason_code = 'qa'
    and x.effective_from <= as_of_at
    and (x.effective_to is null or x.effective_to > coverage_start_at);

  if coverage_start_at is null then
    raise exception 'Paid-conversion coverage metadata is unavailable';
  end if;
  if p_from < coverage_start_at then
    quality_reasons := array_append(quality_reasons, 'cohort_before_instrumentation_coverage');
  end if;
  if review_at is null or reviewed_by is null
    or reviewed_exclusion_count is distinct from current_exclusion_count then
    quality_reasons := array_append(quality_reasons, 'qa_exclusion_review_required');
  end if;
  if exists (
    select 1 from public.privacy_deletion_jobs d
    where d.status = 'completed' and d.completed_at >= coverage_start_at
  ) then
    quality_reasons := array_append(quality_reasons, 'privacy_deletion_history_may_be_incomplete');
  end if;

  select coalesce(bool_and(latest.status = 'completed' and latest.failed_count = 0
      and latest.completed_at >= as_of_at - interval '24 hours'), false)
  into stripe_reconciled
  from (select r.status, r.failed_count, r.completed_at
        from public.billing_reconciliation_runs r
        where r.provider = 'stripe' and r.environment = 'live'
        order by r.started_at desc limit 1) latest;
  select coalesce(bool_and(latest.status = 'completed' and latest.failed_count = 0
      and latest.completed_at >= as_of_at - interval '24 hours'), false)
  into paypal_reconciled
  from (select r.status, r.failed_count, r.completed_at
        from public.billing_reconciliation_runs r
        where r.provider = 'paypal' and r.environment = 'live'
        order by r.started_at desc limit 1) latest;

  if not stripe_reconciled then
    quality_reasons := array_append(quality_reasons, 'stripe_reconciliation_missing_failed_or_stale');
  end if;
  if not paypal_reconciled then
    quality_reasons := array_append(quality_reasons, 'paypal_reconciliation_missing_failed_or_stale');
  end if;

  with candidates as (
    select distinct on (e.actor_user_id)
      e.actor_user_id as user_id,
      e.occurred_at as confirmed_at
    from public.analytics_events e
    where e.event_name = 'account_confirmed'
      and e.actor_user_id is not null
      and e.created_at >= coverage_start_at
      and e.occurred_at >= p_from
      and e.occurred_at < p_to
      and e.occurred_at <= as_of_at
    order by e.actor_user_id, e.occurred_at, e.created_at
  ), eligible as (
    select c.user_id, c.confirmed_at
    from candidates c
    where not exists (
      select 1 from private.analytics_identity_exclusion_periods x
      where x.user_id = c.user_id and x.reason_code in ('staff', 'qa')
        and x.effective_from <= c.confirmed_at
        and (x.effective_to is null or c.confirmed_at < x.effective_to)
    )
  ), outcomes as (
    select c.user_id, c.confirmed_at,
      (
        select min(t.occurred_at)
        from public.billing_transactions t
        where t.user_id = c.user_id
          and t.environment = 'live'
          and t.transaction_type in ('payment', 'invoice')
          and lower(t.status) in ('paid', 'succeeded', 'completed')
          and t.amount_minor > 0
          and t.subscription_id is not null
          and t.occurred_at >= c.confirmed_at
          and t.occurred_at <= as_of_at
          and t.created_at >= coverage_start_at
          and not exists (
            select 1 from private.analytics_identity_exclusion_periods x
            where x.user_id = c.user_id and x.reason_code in ('staff', 'qa')
              and x.effective_from <= t.occurred_at
              and (x.effective_to is null or t.occurred_at < x.effective_to)
          )
      ) as first_eligible_payment_at
    from eligible c
  )
  select
    count(*) filter (where o.confirmed_at + interval '30 days' <= as_of_at),
    count(*) filter (where o.confirmed_at + interval '30 days' <= as_of_at
      and o.first_eligible_payment_at >= o.confirmed_at
      and o.first_eligible_payment_at < o.confirmed_at + interval '30 days'),
    count(*) filter (where o.confirmed_at + interval '30 days' > as_of_at),
    count(*) filter (where o.confirmed_at + interval '30 days' > as_of_at
      and o.first_eligible_payment_at >= o.confirmed_at
      and o.first_eligible_payment_at < least(o.confirmed_at + interval '30 days', as_of_at)),
    count(*) filter (where o.first_eligible_payment_at is not null and exists (
      select 1 from public.billing_transactions t
      where t.user_id = o.user_id
        and t.environment = 'live'
        and t.transaction_type in ('refund', 'dispute', 'chargeback')
        and t.occurred_at >= o.first_eligible_payment_at
        and t.occurred_at <= least(o.confirmed_at + interval '30 days', as_of_at)
        and t.created_at >= coverage_start_at
    ))
  into mature_denominator, mature_numerator, maturing_denominator,
    maturing_observed_numerator, refunded_or_disputed_accounts
  from outcomes o;

  with candidates as (
    select distinct on (e.actor_user_id)
      e.actor_user_id as user_id,
      e.occurred_at as confirmed_at
    from public.analytics_events e
    where e.event_name = 'account_confirmed'
      and e.actor_user_id is not null
      and e.created_at >= coverage_start_at
      and e.occurred_at >= p_from
      and e.occurred_at < p_to
      and e.occurred_at <= as_of_at
    order by e.actor_user_id, e.occurred_at, e.created_at
  )
  select count(*) into excluded_accounts
  from candidates c
  where exists (
    select 1 from private.analytics_identity_exclusion_periods x
    where x.user_id = c.user_id and x.reason_code in ('staff', 'qa')
      and x.effective_from <= c.confirmed_at
      and (x.effective_to is null or c.confirmed_at < x.effective_to)
  );

  with candidates as (
    select distinct on (e.actor_user_id)
      e.actor_user_id as user_id,
      e.occurred_at as confirmed_at
    from public.analytics_events e
    where e.event_name = 'account_confirmed'
      and e.actor_user_id is not null
      and e.created_at >= coverage_start_at
      and e.occurred_at >= p_from
      and e.occurred_at < p_to
      and e.occurred_at <= as_of_at
    order by e.actor_user_id, e.occurred_at, e.created_at
  )
  select count(*) into qa_excluded_accounts
  from candidates c
  where exists (
    select 1 from private.analytics_identity_exclusion_periods x
    where x.user_id = c.user_id and x.reason_code = 'qa'
      and x.effective_from <= c.confirmed_at
      and (x.effective_to is null or c.confirmed_at < x.effective_to)
  );

  if mature_denominator > 0 and cardinality(quality_reasons) = 0 then
    measured_rate := round(mature_numerator::numeric * 100 / mature_denominator, 2);
  end if;

  return jsonb_build_object(
    'metric', 'signup_to_paid_30d',
    'metricVersion', 1,
    'source', 'account_confirmation_events_and_live_billing_transactions',
    'coverageStart', coverage_start_at,
    'asOf', as_of_at,
    'window', jsonb_build_object('from', p_from, 'to', p_to, 'timezone', 'UTC'),
    'matureThrough', as_of_at - interval '30 days',
    'numerator', mature_numerator,
    'denominator', mature_denominator,
    'rate', measured_rate,
    'maturing', jsonb_build_object('confirmed', maturing_denominator, 'firstPaidToDate', maturing_observed_numerator),
    'excludedAtConfirmation', excluded_accounts,
    'qaExcludedAtConfirmation', qa_excluded_accounts,
    'qaExclusionPeriodCount', current_exclusion_count,
    'qaExclusionPeriodCountReviewed', case when review_at is null or reviewed_by is null then null else reviewed_exclusion_count end,
    'refundedOrDisputedAccounts', refunded_or_disputed_accounts,
    'isComplete', cardinality(quality_reasons) = 0,
    'qualityReasons', to_jsonb(quality_reasons)
  );
end;
$$;

revoke all on function private.record_account_confirmed_event(uuid, timestamptz) from public, anon, authenticated, service_role;
revoke all on function private.capture_account_confirmation_after_profile_insert() from public, anon, authenticated, service_role;
revoke all on function private.capture_account_confirmation_after_auth_update() from public, anon, authenticated, service_role;
revoke all on function private.capture_admin_membership_analytics_exclusion() from public, anon, authenticated, service_role;
revoke all on function private.invalidate_analytics_qa_exclusion_review() from public, anon, authenticated, service_role;
revoke all on function private.review_analytics_cohort_quality(uuid) from public, anon, authenticated;
grant execute on function private.review_analytics_cohort_quality(uuid) to service_role;
revoke all on function private.calculate_signup_to_paid_30d_cohort(timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function private.calculate_signup_to_paid_30d_cohort(timestamptz, timestamptz, timestamptz) to service_role;

create or replace function public.admin_paid_conversion_cohort(
  p_from timestamptz,
  p_to timestamptz,
  p_as_of timestamptz default clock_timestamp()
) returns jsonb
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select private.calculate_signup_to_paid_30d_cohort(p_from, p_to, p_as_of);
$$;
revoke all on function public.admin_paid_conversion_cohort(timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.admin_paid_conversion_cohort(timestamptz, timestamptz, timestamptz) to service_role;

create or replace function public.admin_review_analytics_cohort_quality(p_actor_user_id uuid)
returns jsonb
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select private.review_analytics_cohort_quality(p_actor_user_id);
$$;
revoke all on function public.admin_review_analytics_cohort_quality(uuid) from public, anon, authenticated;
grant execute on function public.admin_review_analytics_cohort_quality(uuid) to service_role;

commit;
