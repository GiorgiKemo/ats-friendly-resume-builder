begin;

insert into private.analytics_metric_coverage(metric_key, metric_version, coverage_start, definition)
values (
  'resume_activation_7d',
  1,
  clock_timestamp(),
  '{"cohort":"first account confirmation","numerator":"distinct confirmed accounts with a successful resume_exported event in [confirmation, confirmation + 7 days)","denominator":"distinct confirmed accounts in the same mature cohort","excluded":["staff at confirmation or export","QA-tagged accounts","events recorded before instrumentation coverage"],"quality":"export events require optional analytics consent, so opt-in coverage is unknown and the cohort rate must not be presented as complete","timezone":"UTC event instants; cohort window uses supplied half-open timestamps"}'::jsonb
);

create or replace function private.calculate_resume_activation_7d_cohort(
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
  quality_reasons text[] := array[]::text[];
  measured_rate numeric;
  observed_rate numeric;
begin
  if p_from is null or p_to is null or p_from >= p_to
    or p_to > as_of_at or p_to - p_from > interval '366 days' then
    raise exception 'Invalid resume-activation cohort window';
  end if;

  select coverage_start into coverage_start_at
  from private.analytics_metric_coverage
  where metric_key = 'resume_activation_7d';
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
    raise exception 'Resume-activation coverage metadata is unavailable';
  end if;
  if p_from < coverage_start_at then
    quality_reasons := array_append(quality_reasons, 'cohort_before_instrumentation_coverage');
  end if;
  quality_reasons := array_append(quality_reasons, 'consent_limited_export_event_coverage');
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
  ), outcomes as (
    select c.user_id, c.confirmed_at, (
      select min(e.occurred_at)
      from public.analytics_events e
      where e.event_name = 'resume_exported'
        and e.actor_user_id = c.user_id
        and e.created_at >= coverage_start_at
        and e.occurred_at >= c.confirmed_at
        and e.occurred_at < c.confirmed_at + interval '7 days'
        and e.occurred_at <= as_of_at
        and not exists (
          select 1 from private.analytics_identity_exclusion_periods x
          where x.user_id = c.user_id and x.reason_code in ('staff', 'qa')
            and x.effective_from <= e.occurred_at
            and (x.effective_to is null or e.occurred_at < x.effective_to)
        )
    ) as first_export_at
    from eligible c
  )
  select
    count(*) filter (where o.confirmed_at + interval '7 days' <= as_of_at),
    count(*) filter (where o.confirmed_at + interval '7 days' <= as_of_at
      and o.first_export_at >= o.confirmed_at
      and o.first_export_at < o.confirmed_at + interval '7 days'),
    count(*) filter (where o.confirmed_at + interval '7 days' > as_of_at),
    count(*) filter (where o.confirmed_at + interval '7 days' > as_of_at
      and o.first_export_at >= o.confirmed_at
      and o.first_export_at < least(o.confirmed_at + interval '7 days', as_of_at))
  into mature_denominator, mature_numerator, maturing_denominator, maturing_observed_numerator
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
  if mature_denominator > 0 then
    observed_rate := round(mature_numerator::numeric * 100 / mature_denominator, 2);
  end if;

  return jsonb_build_object(
    'metric', 'resume_activation_7d',
    'metricVersion', 1,
    'source', 'account_confirmation_and_successful_resume_export_events',
    'coverageStart', coverage_start_at,
    'asOf', as_of_at,
    'window', jsonb_build_object('from', p_from, 'to', p_to, 'timezone', 'UTC'),
    'matureThrough', as_of_at - interval '7 days',
    'numerator', mature_numerator,
    'denominator', mature_denominator,
    'rate', measured_rate,
    'observedRate', observed_rate,
    'maturing', jsonb_build_object('confirmed', maturing_denominator, 'resumeExportToDate', maturing_observed_numerator),
    'excludedAtConfirmation', excluded_accounts,
    'qaExcludedAtConfirmation', qa_excluded_accounts,
    'qaExclusionPeriodCount', current_exclusion_count,
    'qaExclusionPeriodCountReviewed', case when review_at is null or reviewed_by is null then null else reviewed_exclusion_count end,
    'isComplete', cardinality(quality_reasons) = 0,
    'qualityReasons', to_jsonb(quality_reasons)
  );
end;
$$;

revoke all on function private.calculate_resume_activation_7d_cohort(timestamptz, timestamptz, timestamptz) from public, anon, authenticated, service_role;
grant execute on function private.calculate_resume_activation_7d_cohort(timestamptz, timestamptz, timestamptz) to service_role;

create or replace function public.admin_resume_activation_7d_cohort(
  p_from timestamptz,
  p_to timestamptz,
  p_as_of timestamptz default clock_timestamp()
) returns jsonb
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select private.calculate_resume_activation_7d_cohort(p_from, p_to, p_as_of);
$$;
revoke all on function public.admin_resume_activation_7d_cohort(timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.admin_resume_activation_7d_cohort(timestamptz, timestamptz, timestamptz) to service_role;

create or replace function public.record_analytics_event(
  p_event_key text,
  p_event_name text,
  p_properties jsonb default '{}'::jsonb,
  p_occurred_at timestamptz default clock_timestamp()
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  received_at timestamptz := clock_timestamp();
  inserted_id uuid;
begin
  if caller_id is null then
    raise exception 'Authentication required';
  end if;
  if p_event_key is null or length(btrim(p_event_key)) not between 8 and 240 then
    raise exception 'Invalid analytics event key';
  end if;
  if p_event_name not in (
    'account_created', 'resume_created', 'resume_exported', 'application_created',
    'upgrade_click', 'checkout_started', 'checkout_created', 'purchase_confirmed',
    'support_started', 'support_resolved'
  ) then
    raise exception 'Analytics event is not allowlisted';
  end if;
  if p_event_name in ('account_created', 'checkout_created', 'purchase_confirmed') then
    raise exception 'This analytics event is server-only';
  end if;
  if p_properties is null or jsonb_typeof(p_properties) <> 'object'
    or (select count(*) from jsonb_object_keys(p_properties)) > 12
    or length(p_properties::text) > 2000 then
    raise exception 'Analytics properties are too large';
  end if;
  if exists (
    select 1
    from jsonb_each(p_properties) as property(key, value)
    where jsonb_typeof(property.value) in ('object', 'array')
  ) then
    raise exception 'Analytics properties must be flat';
  end if;
  if p_properties ?| array[
    'email', 'user_email', 'full_name', 'resume_content', 'job_description',
    'access_token', 'refresh_token', 'secret', 'token'
  ] then
    raise exception 'Analytics properties contain a restricted field';
  end if;
  if p_occurred_at is not null and abs(extract(epoch from (received_at - p_occurred_at))) > 300 then
    raise exception 'Invalid analytics event timestamp';
  end if;

  insert into public.analytics_events(event_key, event_name, actor_user_id, properties, occurred_at)
  values (btrim(p_event_key), p_event_name, caller_id, p_properties, received_at)
  on conflict (event_key) do nothing
  returning id into inserted_id;

  if inserted_id is null then
    select id into inserted_id
    from public.analytics_events
    where event_key = btrim(p_event_key);
  end if;

  return inserted_id;
end;
$$;

revoke all on function public.record_analytics_event(text, text, jsonb, timestamptz)
  from public, anon;
grant execute on function public.record_analytics_event(text, text, jsonb, timestamptz)
  to authenticated;

commit;
