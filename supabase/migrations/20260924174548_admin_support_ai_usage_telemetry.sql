begin;

create index if not exists support_ai_runs_created_idx
  on public.support_ai_runs(created_at desc);

create or replace function public.admin_read_support_ai_usage_summary()
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  with bounds as (
    select now() - interval '30 days' as window_start, now() as window_end
  ),
  run_summary as (
    select
      count(*) as total,
      count(*) filter (where run.status = 'queued') as queued,
      count(*) filter (where run.status = 'processing') as processing,
      count(*) filter (where run.status = 'completed') as completed,
      count(*) filter (where run.status = 'failed') as failed,
      count(*) filter (where run.status = 'canceled') as canceled
    from public.support_ai_runs as run
    cross join bounds
    where run.created_at >= bounds.window_start
      and run.created_at < bounds.window_end
  ),
  usage_summary as (
    select
      count(*) as total,
      count(*) filter (where u.outcome = 'answered') as answered,
      count(*) filter (where u.outcome = 'escalated') as escalated,
      count(*) filter (where u.outcome = 'refused') as refused,
      count(*) filter (where u.outcome = 'failed') as failed,
      count(*) filter (where u.outcome = 'stale') as stale,
      count(*) filter (where u.latency_ms is not null) as latency_reported,
      count(*) filter (where u.latency_ms is null) as latency_missing,
      percentile_disc(0.5) within group (order by u.latency_ms)
        filter (where u.latency_ms is not null) as median_latency_ms,
      percentile_disc(0.95) within group (order by u.latency_ms)
        filter (where u.latency_ms is not null) as p95_latency_ms,
      count(*) filter (where u.estimated_cost_micros is not null) as cost_reported,
      count(*) filter (where u.estimated_cost_micros is null) as cost_missing
    from public.support_ai_usage_records as u
    cross join bounds
    where u.created_at >= bounds.window_start
      and u.created_at < bounds.window_end
  )
  select jsonb_build_object(
    'available', true,
    'windowDays', 30,
    'windowStart', bounds.window_start,
    'windowEnd', bounds.window_end,
    'runs', jsonb_build_object(
      'total', run_summary.total,
      'queued', run_summary.queued,
      'processing', run_summary.processing,
      'completed', run_summary.completed,
      'failed', run_summary.failed,
      'canceled', run_summary.canceled
    ),
    'usage', jsonb_build_object(
      'total', usage_summary.total,
      'answered', usage_summary.answered,
      'escalated', usage_summary.escalated,
      'refused', usage_summary.refused,
      'failed', usage_summary.failed,
      'stale', usage_summary.stale,
      'latencyReported', usage_summary.latency_reported,
      'latencyMissing', usage_summary.latency_missing,
      'medianLatencyMs', usage_summary.median_latency_ms,
      'p95LatencyMs', usage_summary.p95_latency_ms,
      'costReported', usage_summary.cost_reported,
      'costMissing', usage_summary.cost_missing
    )
  )
  from bounds
  cross join run_summary
  cross join usage_summary;
$$;

comment on function public.admin_read_support_ai_usage_summary() is
  'Returns aggregate-only 30-day Support AI run and usage telemetry. Provider cost currency and units are intentionally not inferred.';

revoke all on function public.admin_read_support_ai_usage_summary() from public, anon, authenticated;
grant execute on function public.admin_read_support_ai_usage_summary() to service_role;

commit;
