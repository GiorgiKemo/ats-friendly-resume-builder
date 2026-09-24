begin;

alter table public.support_delivery_outbox
  add column provider_message_id text;

create unique index support_delivery_outbox_provider_message_id_uidx
  on public.support_delivery_outbox(provider_message_id)
  where provider_message_id is not null;

create table public.support_delivery_events (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid not null references public.support_delivery_outbox(id) on delete cascade,
  event_type text not null check (event_type in (
    'delivered', 'hard_bounce', 'soft_bounce', 'blocked', 'invalid',
    'deferred', 'spam', 'unsubscribed'
  )),
  occurred_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (outbox_id, event_type, occurred_at)
);

alter table public.support_delivery_events enable row level security;
revoke all on table public.support_delivery_events from public, anon, authenticated;
grant all on table public.support_delivery_events to service_role;

create index support_delivery_events_reporting_idx
  on public.support_delivery_events(occurred_at, event_type, outbox_id);

create or replace function public.support_complete_email_outbox(
  p_outbox_id uuid,
  p_worker_id text,
  p_provider_message_id text default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  completed public.support_delivery_outbox%rowtype;
  safe_provider_message_id text := nullif(btrim(p_provider_message_id), '');
begin
  if p_worker_id is null or length(btrim(p_worker_id)) not between 8 and 120 then
    raise exception 'Invalid notification worker identity';
  end if;
  if safe_provider_message_id is not null
     and (length(safe_provider_message_id) > 200 or safe_provider_message_id ~ '[[:cntrl:]]') then
    raise exception 'Invalid provider message id';
  end if;

  update public.support_delivery_outbox
  set status = 'sent', worker_id = null, locked_until = null, delivered_at = clock_timestamp(),
      provider_message_id = coalesce(provider_message_id, safe_provider_message_id), last_error = null
  where id = p_outbox_id and channel = 'email' and status = 'processing'
    and worker_id = btrim(p_worker_id)
    and locked_until > clock_timestamp()
    and (provider_message_id is null or safe_provider_message_id is null or provider_message_id = safe_provider_message_id)
  returning * into completed;
  if not found then raise exception 'Notification lease is no longer valid or provider message ID conflicts'; end if;
  return jsonb_build_object(
    'outboxId', completed.id,
    'status', completed.status,
    'providerMessageId', completed.provider_message_id
  );
end;
$$;

create or replace function public.support_record_email_delivery_event(
  p_outbox_id uuid,
  p_provider_message_id text,
  p_event_type text,
  p_occurred_at timestamptz
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  linked_outbox_id uuid;
  inserted_event_id uuid;
  safe_provider_message_id text := nullif(btrim(p_provider_message_id), '');
begin
  if safe_provider_message_id is null
     or length(safe_provider_message_id) > 200
     or safe_provider_message_id ~ '[[:cntrl:]]'
     or p_event_type not in ('delivered', 'hard_bounce', 'soft_bounce', 'blocked', 'invalid', 'deferred', 'spam', 'unsubscribed')
     or p_occurred_at is null then
    raise exception 'Invalid support delivery event';
  end if;

  begin
    update public.support_delivery_outbox
    set provider_message_id = coalesce(provider_message_id, safe_provider_message_id)
    where id = p_outbox_id
      and channel = 'email'
      and (provider_message_id is null or provider_message_id = safe_provider_message_id)
    returning id into linked_outbox_id;
  exception when unique_violation then
    return jsonb_build_object('matched', false, 'recorded', false);
  end;

  if not found then return jsonb_build_object('matched', false, 'recorded', false); end if;

  insert into public.support_delivery_events(outbox_id, event_type, occurred_at)
  values (linked_outbox_id, p_event_type, p_occurred_at)
  on conflict (outbox_id, event_type, occurred_at) do nothing
  returning id into inserted_event_id;

  return jsonb_build_object('matched', true, 'recorded', inserted_event_id is not null);
end;
$$;

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
  ), provider_event_summary as (
    select
      count(*) as events_last_30_days,
      count(distinct event.outbox_id) filter (where event.event_type = 'delivered') as recipient_delivered_last_30_days,
      count(distinct event.outbox_id) filter (where event.event_type = 'hard_bounce') as hard_bounced_last_30_days,
      count(distinct event.outbox_id) filter (where event.event_type = 'soft_bounce') as soft_bounced_last_30_days,
      count(distinct event.outbox_id) filter (where event.event_type = 'blocked') as blocked_last_30_days,
      count(distinct event.outbox_id) filter (where event.event_type = 'invalid') as invalid_last_30_days,
      count(distinct event.outbox_id) filter (where event.event_type = 'deferred') as deferred_last_30_days,
      count(distinct event.outbox_id) filter (where event.event_type = 'spam') as spam_reported_last_30_days,
      count(distinct event.outbox_id) filter (where event.event_type = 'unsubscribed') as unsubscribed_last_30_days,
      max(event.occurred_at) filter (where event.event_type = 'delivered') as most_recent_recipient_delivery_at
    from public.support_delivery_events as event
    cross join bounds
    where event.occurred_at >= bounds.window_start
      and event.occurred_at < bounds.window_end
  )
  select jsonb_build_object(
    'available', true,
    'deliveryEventsAvailable', true,
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
    'mostRecentAcceptanceInWindow', delivery_summary.most_recent_acceptance_in_window,
    'providerEventsLast30Days', provider_event_summary.events_last_30_days,
    'recipientDeliveredLast30Days', provider_event_summary.recipient_delivered_last_30_days,
    'hardBouncedLast30Days', provider_event_summary.hard_bounced_last_30_days,
    'softBouncedLast30Days', provider_event_summary.soft_bounced_last_30_days,
    'blockedLast30Days', provider_event_summary.blocked_last_30_days,
    'invalidLast30Days', provider_event_summary.invalid_last_30_days,
    'deferredEventsLast30Days', provider_event_summary.deferred_last_30_days,
    'spamReportedLast30Days', provider_event_summary.spam_reported_last_30_days,
    'unsubscribedLast30Days', provider_event_summary.unsubscribed_last_30_days,
    'mostRecentRecipientDeliveryAt', provider_event_summary.most_recent_recipient_delivery_at
  )
  from bounds
  cross join delivery_summary
  cross join provider_event_summary;
$$;

revoke all on function public.support_complete_email_outbox(uuid, text, text) from public, anon, authenticated;
grant execute on function public.support_complete_email_outbox(uuid, text, text) to service_role;
revoke all on function public.support_record_email_delivery_event(uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.support_record_email_delivery_event(uuid, text, text, timestamptz) to service_role;
revoke all on function public.admin_read_support_email_delivery_health() from public, anon, authenticated;
grant execute on function public.admin_read_support_email_delivery_health() to service_role;

commit;
