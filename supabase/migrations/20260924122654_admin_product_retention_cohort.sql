begin;

insert into private.analytics_metric_coverage(metric_key, metric_version, coverage_start, definition)
values (
  'product_retention_exact_day',
  1,
  clock_timestamp(),
  '{"cohort":"first account confirmation","d7":"distinct eligible accounts with a recorded meaningful product event during local calendar day 7 after confirmation","d30":"distinct eligible accounts with a recorded meaningful product event during local calendar day 30 after confirmation","event_names":["resume_created","resume_exported","application_created","ai_generation_completed"],"quality":"event coverage is incomplete: edits to existing resumes, other application changes, and activity without optional analytics consent are not fully represented; rates must remain observed-only","timezone":"UTC event instants grouped by the selected reporting timezone"}'::jsonb
);

create or replace function private.calculate_product_retention_cohort(
  p_from timestamptz,
  p_to timestamptz,
  p_timezone text,
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
  excluded_accounts bigint := 0;
  qa_excluded_accounts bigint := 0;
  d7_denominator bigint := 0;
  d7_numerator bigint := 0;
  d7_maturing bigint := 0;
  d7_maturing_observed bigint := 0;
  d30_denominator bigint := 0;
  d30_numerator bigint := 0;
  d30_maturing bigint := 0;
  d30_maturing_observed bigint := 0;
  d7_observed_rate numeric;
  d30_observed_rate numeric;
  quality_reasons text[] := array['product_action_event_coverage_incomplete'];
begin
  if p_from is null or p_to is null or p_from >= p_to
    or p_to > as_of_at or p_to - p_from > interval '366 days'
    or p_timezone is null or p_timezone not in ('Asia/Tbilisi', 'UTC') then
    raise exception 'Invalid product-retention cohort window';
  end if;

  select coverage_start into coverage_start_at
  from private.analytics_metric_coverage
  where metric_key = 'product_retention_exact_day';
  select qa_exclusions_reviewed_at, reviewed_by_user_id, qa_exclusion_period_count
  into review_at, reviewed_by, reviewed_exclusion_count
  from private.analytics_cohort_quality_reviews
  where metric_key = 'signup_to_paid_30d';

  select count(*)::integer into current_exclusion_count
  from private.analytics_identity_exclusion_periods x
  where x.reason_code = 'qa'
    and x.effective_from <= as_of_at
    and (x.effective_to is null or x.effective_to > (
      select coverage_start from private.analytics_metric_coverage
      where metric_key = 'signup_to_paid_30d'
    ));

  if coverage_start_at is null then
    raise exception 'Product-retention coverage metadata is unavailable';
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
  ), cohort_days as (
    select e.user_id, e.confirmed_at,
      (e.confirmed_at at time zone p_timezone)::date as signup_date
    from eligible e
  ), cohort_windows as (
    select c.user_id,
      timezone(p_timezone, (c.signup_date + 7)::timestamp) as d7_from,
      timezone(p_timezone, (c.signup_date + 8)::timestamp) as d7_to,
      timezone(p_timezone, (c.signup_date + 30)::timestamp) as d30_from,
      timezone(p_timezone, (c.signup_date + 31)::timestamp) as d30_to
    from cohort_days c
  ), retention_activity as (
    select w.*,
      exists (
        select 1 from public.analytics_events e
        where e.actor_user_id = w.user_id
          and e.event_name in ('resume_created', 'resume_exported', 'application_created', 'ai_generation_completed')
          and e.created_at >= coverage_start_at
          and e.occurred_at >= w.d7_from and e.occurred_at < w.d7_to
          and e.occurred_at <= as_of_at
          and not exists (
            select 1 from private.analytics_identity_exclusion_periods x
            where x.user_id = w.user_id and x.reason_code in ('staff', 'qa')
              and x.effective_from <= e.occurred_at
              and (x.effective_to is null or e.occurred_at < x.effective_to)
          )
      ) as d7_active,
      exists (
        select 1 from public.analytics_events e
        where e.actor_user_id = w.user_id
          and e.event_name in ('resume_created', 'resume_exported', 'application_created', 'ai_generation_completed')
          and e.created_at >= coverage_start_at
          and e.occurred_at >= w.d30_from and e.occurred_at < w.d30_to
          and e.occurred_at <= as_of_at
          and not exists (
            select 1 from private.analytics_identity_exclusion_periods x
            where x.user_id = w.user_id and x.reason_code in ('staff', 'qa')
              and x.effective_from <= e.occurred_at
              and (x.effective_to is null or e.occurred_at < x.effective_to)
          )
      ) as d30_active
    from cohort_windows w
  )
  select
    count(*) filter (where d7_to <= as_of_at),
    count(*) filter (where d7_to <= as_of_at and d7_active),
    count(*) filter (where d7_to > as_of_at),
    count(*) filter (where d7_to > as_of_at and d7_active),
    count(*) filter (where d30_to <= as_of_at),
    count(*) filter (where d30_to <= as_of_at and d30_active),
    count(*) filter (where d30_to > as_of_at),
    count(*) filter (where d30_to > as_of_at and d30_active)
  into d7_denominator, d7_numerator, d7_maturing, d7_maturing_observed,
       d30_denominator, d30_numerator, d30_maturing, d30_maturing_observed
  from retention_activity;

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
  select count(*) filter (where exists (
      select 1 from private.analytics_identity_exclusion_periods x
      where x.user_id = c.user_id and x.reason_code in ('staff', 'qa')
        and x.effective_from <= c.confirmed_at
        and (x.effective_to is null or c.confirmed_at < x.effective_to)
    )),
    count(*) filter (where exists (
      select 1 from private.analytics_identity_exclusion_periods x
      where x.user_id = c.user_id and x.reason_code = 'qa'
        and x.effective_from <= c.confirmed_at
        and (x.effective_to is null or c.confirmed_at < x.effective_to)
    ))
  into excluded_accounts, qa_excluded_accounts
  from candidates c;

  if d7_denominator > 0 then
    d7_observed_rate := round(d7_numerator::numeric * 100 / d7_denominator, 2);
  end if;
  if d30_denominator > 0 then
    d30_observed_rate := round(d30_numerator::numeric * 100 / d30_denominator, 2);
  end if;

  return jsonb_build_object(
    'metric', 'product_retention_exact_day',
    'metricVersion', 1,
    'source', 'account_confirmation_and_recorded_product_events',
    'coverageStart', coverage_start_at,
    'asOf', as_of_at,
    'window', jsonb_build_object('from', p_from, 'to', p_to, 'timezone', p_timezone),
    'eventNames', jsonb_build_array('resume_created', 'resume_exported', 'application_created', 'ai_generation_completed'),
    'd7', jsonb_build_object(
      'numerator', d7_numerator, 'denominator', d7_denominator, 'rate', null, 'observedRate', d7_observed_rate,
      'maturing', jsonb_build_object('accounts', d7_maturing, 'observedActive', d7_maturing_observed)
    ),
    'd30', jsonb_build_object(
      'numerator', d30_numerator, 'denominator', d30_denominator, 'rate', null, 'observedRate', d30_observed_rate,
      'maturing', jsonb_build_object('accounts', d30_maturing, 'observedActive', d30_maturing_observed)
    ),
    'excludedAtConfirmation', excluded_accounts,
    'qaExcludedAtConfirmation', qa_excluded_accounts,
    'qaExclusionPeriodCount', current_exclusion_count,
    'qaExclusionPeriodCountReviewed', case when review_at is null or reviewed_by is null then null else reviewed_exclusion_count end,
    'isComplete', false,
    'qualityReasons', to_jsonb(quality_reasons)
  );
end;
$$;

revoke all on function private.calculate_product_retention_cohort(timestamptz, timestamptz, text, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function private.calculate_product_retention_cohort(timestamptz, timestamptz, text, timestamptz)
  to service_role;

create or replace function public.admin_product_retention_cohort(
  p_from timestamptz,
  p_to timestamptz,
  p_timezone text,
  p_as_of timestamptz default clock_timestamp()
) returns jsonb
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select private.calculate_product_retention_cohort(p_from, p_to, p_timezone, p_as_of);
$$;
revoke all on function public.admin_product_retention_cohort(timestamptz, timestamptz, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.admin_product_retention_cohort(timestamptz, timestamptz, text, timestamptz)
  to service_role;

commit;
