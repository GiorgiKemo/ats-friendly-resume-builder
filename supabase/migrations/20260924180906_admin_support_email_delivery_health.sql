begin;

create index if not exists support_delivery_email_health_idx
  on public.support_delivery_outbox(status, available_at, created_at)
  where channel = 'email';

create or replace function public.admin_read_support_email_delivery_health()
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  with bounds as (
    select now() - interval '30 days' as window_start, now() as window_end
  ), delivery_summary as (
    select
      count(*) filter (where outbox.status = 'pending' and outbox.available_at <= bounds.window_end) as due_pending,
      count(*) filter (where outbox.status = 'pending' and outbox.available_at > bounds.window_end) as deferred_pending,
      count(*) filter (where outbox.status = 'processing') as processing,
      count(*) filter (
        where outbox.status = 'processing'
          and (outbox.locked_until is null or outbox.locked_until <= bounds.window_end)
      ) as stale_processing,
      count(*) filter (where outbox.status = 'failed') as failed,
      count(*) filter (where outbox.status = 'dead_letter') as dead_letter,
      count(*) filter (
        where outbox.status = 'sent'
          and outbox.delivered_at >= bounds.window_start
          and outbox.delivered_at < bounds.window_end
      ) as provider_accepted_last_30_days,
      count(*) filter (where outbox.status = 'sent' and outbox.delivered_at is null) as sent_without_acceptance_time,
      min(outbox.created_at) filter (where outbox.status = 'pending') as oldest_pending_at,
      max(outbox.delivered_at) filter (
        where outbox.status = 'sent'
          and outbox.delivered_at >= bounds.window_start
          and outbox.delivered_at < bounds.window_end
      ) as most_recent_acceptance_in_window
    from public.support_delivery_outbox as outbox
    cross join bounds
    where outbox.channel = 'email'
      and (
        outbox.status <> 'sent'
        or outbox.delivered_at is null
        or outbox.delivered_at >= bounds.window_start
      )
  )
  select jsonb_build_object(
    'available', true,
    'windowDays', 30,
    'windowStart', bounds.window_start,
    'windowEnd', bounds.window_end,
    'duePending', delivery_summary.due_pending,
    'deferredPending', delivery_summary.deferred_pending,
    'processing', delivery_summary.processing,
    'staleProcessing', delivery_summary.stale_processing,
    'failed', delivery_summary.failed,
    'deadLetter', delivery_summary.dead_letter,
    'providerAcceptedLast30Days', delivery_summary.provider_accepted_last_30_days,
    'sentWithoutAcceptanceTime', delivery_summary.sent_without_acceptance_time,
    'oldestPendingAt', delivery_summary.oldest_pending_at,
    'mostRecentAcceptanceInWindow', delivery_summary.most_recent_acceptance_in_window
  )
  from bounds
  cross join delivery_summary;
$$;

comment on function public.admin_read_support_email_delivery_health() is
  'Returns aggregate-only support email outbox health. Sent means provider API acceptance, not recipient delivery.';

revoke all on function public.admin_read_support_email_delivery_health() from public, anon, authenticated;
grant execute on function public.admin_read_support_email_delivery_health() to service_role;

commit;
