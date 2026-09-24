begin;

alter table private.analytics_identity_exclusion_periods
  add column qa_category text;

update private.analytics_identity_exclusion_periods
set qa_category = 'other_test'
where reason_code = 'qa' and qa_category is null;

alter table private.analytics_identity_exclusion_periods
  add constraint analytics_identity_exclusion_qa_category_check
  check (
    (reason_code = 'qa' and qa_category is not null and qa_category in (
      'internal_test_account', 'automated_qa', 'synthetic_fixture', 'other_test'
    ))
    or (reason_code = 'staff' and qa_category is null)
  );

create or replace function private.review_analytics_cohort_quality(p_actor_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  coverage_start_at timestamptz;
  exclusion_count integer;
  reviewed_at timestamptz;
begin
  if p_actor_user_id is null or not exists (
    select 1 from public.admin_members m
    where m.user_id = p_actor_user_id and m.is_active and m.role = 'owner'
  ) then
    raise exception 'Owner access required';
  end if;

  perform 1 from private.analytics_cohort_quality_reviews
  where metric_key = 'signup_to_paid_30d'
  for update;
  if not found then raise exception 'Analytics quality review record is unavailable'; end if;

  reviewed_at := clock_timestamp();
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

create or replace function private.set_analytics_qa_exclusion(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_operation text,
  p_category text,
  p_scope text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  now_at timestamptz;
  coverage_start_at timestamptz;
  target_confirmed_at timestamptz;
  effective_at timestamptz;
  current_period record;
  changed_period record;
begin
  if p_actor_user_id is null or not exists (
    select 1 from public.admin_members m
    where m.user_id = p_actor_user_id and m.is_active and m.role = 'owner'
  ) then
    raise exception 'Owner access required';
  end if;
  if p_target_user_id is null then raise exception 'Target user is required'; end if;
  if p_operation is null or p_operation not in ('exclude', 'include') then
    raise exception 'Invalid analytics QA exclusion operation';
  end if;

  perform 1 from private.analytics_cohort_quality_reviews
  where metric_key = 'signup_to_paid_30d'
  for update;
  if not found then raise exception 'Analytics quality review record is unavailable'; end if;
  now_at := clock_timestamp();

  select coverage_start into coverage_start_at
  from private.analytics_metric_coverage
  where metric_key = 'signup_to_paid_30d';
  if coverage_start_at is null then raise exception 'Analytics metric coverage is unavailable'; end if;

  select u.confirmed_at into target_confirmed_at
  from auth.users u
  where u.id = p_target_user_id;
  if not found then raise exception 'Target user was not found'; end if;

  select x.id, x.qa_category, x.effective_from
  into current_period
  from private.analytics_identity_exclusion_periods x
  where x.user_id = p_target_user_id
    and x.reason_code = 'qa'
    and x.source = 'owner_review'
    and x.effective_to is null
  order by x.effective_from desc
  limit 1
  for update;

  if p_operation = 'exclude' then
    if p_category is null or p_category not in (
      'internal_test_account', 'automated_qa', 'synthetic_fixture', 'other_test'
    ) then
      raise exception 'Invalid analytics QA category';
    end if;
    if p_scope is null or p_scope not in ('from_confirmation', 'from_now') then
      raise exception 'Invalid analytics QA exclusion scope';
    end if;
    if found then
      return jsonb_build_object(
        'changed', false,
        'operation', 'exclude',
        'category', current_period.qa_category,
        'effectiveFrom', current_period.effective_from
      );
    end if;
    if p_scope = 'from_confirmation' and target_confirmed_at is null then
      raise exception 'The target account has no confirmed timestamp';
    end if;

    effective_at := case p_scope
      when 'from_confirmation' then greatest(target_confirmed_at, coverage_start_at)
      else now_at
    end;
    insert into private.analytics_identity_exclusion_periods(
      user_id, reason_code, source, effective_from, qa_category
    ) values (
      p_target_user_id, 'qa', 'owner_review', effective_at, p_category
    ) returning id, qa_category, effective_from into changed_period;

    insert into public.admin_audit_events(admin_user_id, target_user_id, action, metadata)
    values (
      p_actor_user_id,
      p_target_user_id,
      'analytics.qa_exclusion.created',
      jsonb_build_object(
        'metric', 'signup_to_paid_30d',
        'category', changed_period.qa_category,
        'scope', p_scope,
        'effectiveFrom', changed_period.effective_from
      )
    );

    return jsonb_build_object(
      'changed', true,
      'operation', 'exclude',
      'category', changed_period.qa_category,
      'scope', p_scope,
      'effectiveFrom', changed_period.effective_from
    );
  end if;

  if not found then
    return jsonb_build_object('changed', false, 'operation', 'include');
  end if;

  update private.analytics_identity_exclusion_periods
  set effective_to = greatest(now_at, current_period.effective_from + interval '1 microsecond')
  where id = current_period.id
  returning id, qa_category, effective_from, effective_to into changed_period;

  insert into public.admin_audit_events(admin_user_id, target_user_id, action, metadata)
  values (
    p_actor_user_id,
    p_target_user_id,
    'analytics.qa_exclusion.ended',
    jsonb_build_object(
      'metric', 'signup_to_paid_30d',
      'category', changed_period.qa_category,
      'effectiveFrom', changed_period.effective_from,
      'effectiveTo', changed_period.effective_to
    )
  );

  return jsonb_build_object(
    'changed', true,
    'operation', 'include',
    'category', changed_period.qa_category,
    'effectiveFrom', changed_period.effective_from,
    'effectiveTo', changed_period.effective_to
  );
end;
$$;

create or replace function private.get_analytics_qa_exclusion(p_target_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, private
as $$
  select coalesce((
    select jsonb_build_object(
      'excluded', true,
      'category', x.qa_category,
      'effectiveFrom', x.effective_from
    )
    from private.analytics_identity_exclusion_periods x
    where x.user_id = p_target_user_id
      and x.reason_code = 'qa'
      and x.source = 'owner_review'
      and x.effective_to is null
    order by x.effective_from desc
    limit 1
  ), jsonb_build_object('excluded', false));
$$;

create or replace function public.admin_set_analytics_qa_exclusion(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_operation text,
  p_category text,
  p_scope text
) returns jsonb
language sql
security invoker
set search_path = pg_catalog, private
as $$
  select private.set_analytics_qa_exclusion(
    p_actor_user_id, p_target_user_id, p_operation, p_category, p_scope
  );
$$;

create or replace function public.admin_get_analytics_qa_exclusion(p_target_user_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, private
as $$
  select private.get_analytics_qa_exclusion(p_target_user_id);
$$;

revoke all on function private.review_analytics_cohort_quality(uuid) from public, anon, authenticated, service_role;
revoke all on function private.set_analytics_qa_exclusion(uuid,uuid,text,text,text) from public, anon, authenticated, service_role;
revoke all on function private.get_analytics_qa_exclusion(uuid) from public, anon, authenticated, service_role;
revoke all on function public.admin_set_analytics_qa_exclusion(uuid,uuid,text,text,text) from public, anon, authenticated, service_role;
revoke all on function public.admin_get_analytics_qa_exclusion(uuid) from public, anon, authenticated, service_role;
grant execute on function private.review_analytics_cohort_quality(uuid) to service_role;
grant execute on function private.set_analytics_qa_exclusion(uuid,uuid,text,text,text) to service_role;
grant execute on function private.get_analytics_qa_exclusion(uuid) to service_role;
grant execute on function public.admin_set_analytics_qa_exclusion(uuid,uuid,text,text,text) to service_role;
grant execute on function public.admin_get_analytics_qa_exclusion(uuid) to service_role;

commit;
