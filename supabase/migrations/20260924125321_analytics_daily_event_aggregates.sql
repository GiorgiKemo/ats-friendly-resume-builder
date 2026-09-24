begin;

create table private.analytics_daily_event_aggregates (
  event_date date not null,
  time_zone text not null check (time_zone in ('Asia/Tbilisi', 'UTC')),
  event_name text not null check (event_name in (
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
  )),
  metric_version integer not null check (metric_version > 0),
  source_version bigint not null check (source_version >= 0),
  event_count bigint not null check (event_count >= 0),
  distinct_actors bigint not null check (distinct_actors >= 0 and distinct_actors <= event_count),
  source_max_occurred_at timestamptz,
  computed_at timestamptz not null,
  primary key (event_date, time_zone, event_name, metric_version)
);

alter table private.analytics_daily_event_aggregates enable row level security;
revoke all on private.analytics_daily_event_aggregates from public, anon, authenticated;
grant select, insert, delete on private.analytics_daily_event_aggregates to service_role;

create table private.analytics_daily_aggregate_versions (
  event_date date not null,
  time_zone text not null check (time_zone in ('Asia/Tbilisi', 'UTC')),
  change_version bigint not null default 0 check (change_version >= 0),
  changed_at timestamptz not null default clock_timestamp(),
  primary key (event_date, time_zone)
);
alter table private.analytics_daily_aggregate_versions enable row level security;
revoke all on private.analytics_daily_aggregate_versions from public, anon, authenticated;
grant select, insert, update on private.analytics_daily_aggregate_versions to service_role;

insert into private.analytics_metric_coverage(metric_key, metric_version, coverage_start, definition)
values (
  'daily_first_party_event_counts',
  1,
  clock_timestamp(),
  '{"grain":"reporting-local-calendar-day, timezone, event name","dimensions":["event_date","time_zone","event_name"],"components":["event_count","distinct_actors","source_max_occurred_at"],"event_names":["account_created","account_confirmed","upgrade_click","resume_created","resume_exported","application_created","checkout_started","checkout_created","purchase_confirmed","support_started","support_resolved","ai_generation_started","ai_generation_completed","ai_generation_failed"],"privacy":"Counts only; no actor IDs or event properties are stored","quality":"Aggregates describe recorded first-party events, not complete product activity or GA4 visitors"}'::jsonb
)
on conflict (metric_key) do update
set metric_version = excluded.metric_version,
    definition = excluded.definition;

create or replace function private.invalidate_analytics_daily_event_aggregates()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_old_at timestamptz;
  v_new_at timestamptz;
  v_affected record;
begin
  if tg_op <> 'INSERT' then v_old_at := old.occurred_at; end if;
  if tg_op <> 'DELETE' then v_new_at := new.occurred_at; end if;

  for v_affected in
    select distinct affected.time_zone, affected.event_date
    from (
      select 'Asia/Tbilisi'::text as time_zone, (v_old_at at time zone 'Asia/Tbilisi')::date as event_date where v_old_at is not null
      union all
      select 'UTC'::text, (v_old_at at time zone 'UTC')::date where v_old_at is not null
      union all
      select 'Asia/Tbilisi'::text, (v_new_at at time zone 'Asia/Tbilisi')::date where v_new_at is not null
      union all
      select 'UTC'::text, (v_new_at at time zone 'UTC')::date where v_new_at is not null
    ) affected
    order by affected.time_zone, affected.event_date
  loop
    insert into private.analytics_daily_aggregate_versions(event_date, time_zone, change_version, changed_at)
    values (v_affected.event_date, v_affected.time_zone, 1, clock_timestamp())
    on conflict (event_date, time_zone) do update
      set change_version = private.analytics_daily_aggregate_versions.change_version + 1,
          changed_at = excluded.changed_at;
  end loop;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists analytics_events_invalidate_daily_aggregates on public.analytics_events;
create trigger analytics_events_invalidate_daily_aggregates
after insert or update or delete on public.analytics_events
for each row execute function private.invalidate_analytics_daily_event_aggregates();
revoke all on function private.invalidate_analytics_daily_event_aggregates() from public, anon, authenticated, service_role;

create or replace function public.admin_rebuild_analytics_daily_event_aggregates(
  p_from timestamptz,
  p_to timestamptz,
  p_timezone text
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, private, public
as $$
declare
  v_from_date date;
  v_to_date date;
  v_event_names text[] := array[
    'account_created', 'account_confirmed', 'upgrade_click', 'resume_created', 'resume_exported',
    'application_created', 'checkout_started', 'checkout_created', 'purchase_confirmed',
    'support_started', 'support_resolved', 'ai_generation_started', 'ai_generation_completed',
    'ai_generation_failed'
  ];
  v_day date;
  v_computed_at timestamptz := clock_timestamp();
  v_row_count integer;
begin
  if p_timezone is null or p_timezone not in ('Asia/Tbilisi', 'UTC') or p_from is null or p_to is null or p_from >= p_to then
    raise exception 'Invalid analytics aggregate window';
  end if;
  v_from_date := (p_from at time zone p_timezone)::date;
  v_to_date := (p_to at time zone p_timezone)::date;
  if p_from <> (v_from_date::timestamp at time zone p_timezone)
    or p_to <> (v_to_date::timestamp at time zone p_timezone)
    or v_to_date - v_from_date not between 1 and 366 then
    raise exception 'Analytics aggregate window must contain 1 to 366 complete local calendar days';
  end if;

  for v_day in
    select generated_day::date
    from generate_series(v_from_date::timestamp, (v_to_date - 1)::timestamp, interval '1 day') as series(generated_day)
    order by generated_day
  loop
    insert into private.analytics_daily_aggregate_versions(event_date, time_zone)
    values (v_day, p_timezone)
    on conflict (event_date, time_zone) do nothing;
  end loop;
  perform 1
  from private.analytics_daily_aggregate_versions v
  where v.time_zone = p_timezone and v.event_date >= v_from_date and v.event_date < v_to_date
  order by v.event_date
  for update;

  delete from private.analytics_daily_event_aggregates
  where event_date >= v_from_date and event_date < v_to_date and time_zone = p_timezone;

  insert into private.analytics_daily_event_aggregates(
    event_date, time_zone, event_name, metric_version, source_version, event_count, distinct_actors,
    source_max_occurred_at, computed_at
  )
  with days as (
    select generated_day::date as event_date
    from generate_series(v_from_date::timestamp, (v_to_date - 1)::timestamp, interval '1 day') as series(generated_day)
  ), event_names as (
    select unnest(v_event_names) as event_name
  ), daily as (
    select (e.occurred_at at time zone p_timezone)::date as event_date,
      e.event_name,
      count(*)::bigint as event_count,
      count(distinct e.actor_user_id)::bigint as distinct_actors,
      max(e.occurred_at) as source_max_occurred_at
    from public.analytics_events e
    where e.occurred_at >= p_from and e.occurred_at < p_to
      and e.event_name = any(v_event_names)
    group by 1, 2
  )
  select d.event_date, p_timezone, n.event_name, 1, v.change_version,
    coalesce(a.event_count, 0), coalesce(a.distinct_actors, 0),
    a.source_max_occurred_at, v_computed_at
  from days d
  cross join event_names n
  join private.analytics_daily_aggregate_versions v
    on v.event_date = d.event_date and v.time_zone = p_timezone
  left join daily a on a.event_date = d.event_date and a.event_name = n.event_name;

  get diagnostics v_row_count = row_count;
  return jsonb_build_object(
    'available', true,
    'metric', 'daily_first_party_event_counts',
    'metricVersion', 1,
    'timezone', p_timezone,
    'fromDate', v_from_date,
    'toDateExclusive', v_to_date,
    'days', v_to_date - v_from_date,
    'rows', v_row_count,
    'computedAt', v_computed_at
  );
end;
$$;

create or replace function public.admin_read_analytics_daily_event_aggregates(
  p_from timestamptz,
  p_to timestamptz,
  p_timezone text
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, private
as $$
declare
  v_from_date date;
  v_to_date date;
  v_expected_rows integer;
  v_rows jsonb;
  v_actual_rows integer;
  v_stale_rows integer;
  v_computed_at timestamptz;
begin
  if p_timezone is null or p_timezone not in ('Asia/Tbilisi', 'UTC') or p_from is null or p_to is null or p_from >= p_to then
    raise exception 'Invalid analytics aggregate window';
  end if;
  v_from_date := (p_from at time zone p_timezone)::date;
  v_to_date := (p_to at time zone p_timezone)::date;
  if p_from <> (v_from_date::timestamp at time zone p_timezone)
    or p_to <> (v_to_date::timestamp at time zone p_timezone)
    or v_to_date - v_from_date not between 1 and 366 then
    raise exception 'Analytics aggregate window must contain 1 to 366 complete local calendar days';
  end if;

  v_expected_rows := (v_to_date - v_from_date) * 14;
  select count(*)::integer,
    count(*) filter (where versions.change_version is distinct from a.source_version)::integer,
    max(a.computed_at),
    coalesce(jsonb_agg(jsonb_build_object(
      'date', a.event_date,
      'eventName', a.event_name,
      'eventCount', a.event_count,
      'distinctActors', a.distinct_actors,
      'sourceMaxOccurredAt', a.source_max_occurred_at,
      'computedAt', a.computed_at
    ) order by a.event_date, a.event_name), '[]'::jsonb)
  into v_actual_rows, v_stale_rows, v_computed_at, v_rows
  from private.analytics_daily_event_aggregates a
  left join private.analytics_daily_aggregate_versions versions
    on versions.event_date = a.event_date and versions.time_zone = a.time_zone
  where a.event_date >= v_from_date and a.event_date < v_to_date and a.time_zone = p_timezone and a.metric_version = 1;

  return jsonb_build_object(
    'available', v_actual_rows = v_expected_rows and v_stale_rows = 0,
    'metric', 'daily_first_party_event_counts',
    'metricVersion', 1,
    'timezone', p_timezone,
    'fromDate', v_from_date,
    'toDateExclusive', v_to_date,
    'expectedRows', v_expected_rows,
    'actualRows', v_actual_rows,
    'staleRows', v_stale_rows,
    'computedAt', v_computed_at,
    'rows', v_rows
  );
end;
$$;

revoke all on function public.admin_rebuild_analytics_daily_event_aggregates(timestamptz, timestamptz, text) from public, anon, authenticated;
revoke all on function public.admin_read_analytics_daily_event_aggregates(timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function public.admin_rebuild_analytics_daily_event_aggregates(timestamptz, timestamptz, text) to service_role;
grant execute on function public.admin_read_analytics_daily_event_aggregates(timestamptz, timestamptz, text) to service_role;

commit;
