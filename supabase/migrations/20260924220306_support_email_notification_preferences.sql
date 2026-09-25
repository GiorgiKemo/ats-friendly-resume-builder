begin;

create table public.support_email_notification_preferences (
  user_id uuid primary key references public.users(id) on delete cascade,
  email_replies_enabled boolean not null default true,
  preference_source text not null default 'user'
    check (preference_source in ('user', 'provider_unsubscribe')),
  updated_at timestamptz not null default clock_timestamp()
);

alter table public.support_email_notification_preferences enable row level security;
alter table public.support_email_notification_preferences force row level security;
revoke all on table public.support_email_notification_preferences from public, anon, authenticated;
grant select, insert, update on table public.support_email_notification_preferences to service_role;

alter table public.support_delivery_outbox
  drop constraint if exists support_delivery_outbox_status_check;
alter table public.support_delivery_outbox
  add constraint support_delivery_outbox_status_check
  check (status in ('pending', 'processing', 'sent', 'failed', 'dead_letter', 'suppressed'));

create or replace function public.support_get_email_notification_preference(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  enabled boolean;
begin
  if p_user_id is null then raise exception 'User is required'; end if;
  select preference.email_replies_enabled
  into enabled
  from public.support_email_notification_preferences as preference
  where preference.user_id = p_user_id;
  return jsonb_build_object('emailRepliesEnabled', coalesce(enabled, true));
end;
$$;

create or replace function public.support_set_email_notification_preference(
  p_user_id uuid,
  p_enabled boolean
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_user_id is null or p_enabled is null then raise exception 'Invalid email preference'; end if;

  insert into public.support_email_notification_preferences(user_id, email_replies_enabled, preference_source)
  values (p_user_id, p_enabled, 'user')
  on conflict (user_id) do update
    set email_replies_enabled = excluded.email_replies_enabled,
        preference_source = 'user',
        updated_at = clock_timestamp();

  if not p_enabled then
    update public.support_delivery_outbox as outbox
    set status = 'suppressed', worker_id = null, locked_until = null
    from public.support_conversations as conversation
    where outbox.conversation_id = conversation.id
      and conversation.customer_user_id = p_user_id
      and outbox.channel = 'email'
      and outbox.status = 'pending';
  end if;

  return jsonb_build_object('emailRepliesEnabled', p_enabled);
end;
$$;

create or replace function public.support_claim_email_outbox(
  p_worker_id text,
  p_limit integer default 10,
  p_lease_seconds integer default 300
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  claimed jsonb;
begin
  if p_worker_id is null or length(btrim(p_worker_id)) not between 8 and 120 then
    raise exception 'Invalid notification worker identity';
  end if;
  if p_limit is null or p_limit not between 1 and 25 then
    raise exception 'Invalid notification batch size';
  end if;
  if p_lease_seconds is null or p_lease_seconds not between 30 and 900 then
    raise exception 'Invalid notification lease';
  end if;

  with candidates as (
    select outbox.id
    from public.support_delivery_outbox as outbox
    join public.support_conversations as conversation on conversation.id = outbox.conversation_id
    join public.users as account on account.id = conversation.customer_user_id
    where outbox.channel = 'email'
      and account.email is not null
      and not exists (
        select 1
        from public.support_email_notification_preferences as preference
        where preference.user_id = conversation.customer_user_id
          and preference.email_replies_enabled = false
      )
      and (
        (outbox.status = 'pending' and outbox.available_at <= clock_timestamp())
        or (outbox.status = 'processing' and outbox.locked_until is not null and outbox.locked_until <= clock_timestamp())
      )
      and outbox.attempts < 5
    order by outbox.available_at, outbox.created_at, outbox.id
    limit p_limit
    for update of outbox skip locked
  ), updated as (
    update public.support_delivery_outbox as outbox
    set status = 'processing',
        attempts = outbox.attempts + 1,
        worker_id = btrim(p_worker_id),
        locked_until = clock_timestamp() + make_interval(secs => p_lease_seconds),
        last_error = null
    from candidates
    where outbox.id = candidates.id
    returning outbox.id, outbox.conversation_id, outbox.message_id, outbox.attempts, outbox.locked_until
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'outboxId', updated.id,
    'conversationId', updated.conversation_id,
    'messageId', updated.message_id,
    'attempt', updated.attempts,
    'leaseUntil', updated.locked_until,
    'recipientEmail', account.email,
    'subject', conversation.subject,
    'body', message.body,
    'createdAt', message.created_at
  ) order by updated.id), '[]'::jsonb)
  into claimed
  from updated
  join public.support_conversations as conversation on conversation.id = updated.conversation_id
  join public.users as account on account.id = conversation.customer_user_id
  join public.support_messages as message on message.id = updated.message_id;

  return claimed;
end;
$$;

create or replace function public.support_authorize_email_outbox(
  p_outbox_id uuid,
  p_worker_id text,
  p_expected_recipient text
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_status text;
  current_worker text;
  lease_expiry timestamptz;
  current_recipient text;
  email_enabled boolean;
begin
  if p_outbox_id is null
     or p_worker_id is null
     or length(btrim(p_worker_id)) not between 8 and 120
     or p_expected_recipient is null
     or length(btrim(p_expected_recipient)) > 320 then
    raise exception 'Invalid notification preflight';
  end if;

  select outbox.status, outbox.worker_id, outbox.locked_until, account.email,
         coalesce(preference.email_replies_enabled, true)
  into current_status, current_worker, lease_expiry, current_recipient, email_enabled
  from public.support_delivery_outbox as outbox
  join public.support_conversations as conversation on conversation.id = outbox.conversation_id
  left join public.users as account on account.id = conversation.customer_user_id
  left join public.support_email_notification_preferences as preference on preference.user_id = conversation.customer_user_id
  where outbox.id = p_outbox_id and outbox.channel = 'email'
  for update of outbox;

  if not found or current_status <> 'processing' or current_worker <> btrim(p_worker_id)
     or lease_expiry is null or lease_expiry <= clock_timestamp() then
    raise exception 'Notification lease is no longer valid';
  end if;

  if not email_enabled or current_recipient is null or current_recipient <> p_expected_recipient then
    update public.support_delivery_outbox
    set status = 'suppressed', worker_id = null, locked_until = null
    where id = p_outbox_id;
    return false;
  end if;

  return true;
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
  unsubscribed_user_id uuid;
  safe_provider_message_id text := nullif(btrim(p_provider_message_id), '');
begin
  if safe_provider_message_id is null
     or length(safe_provider_message_id) > 200
     or safe_provider_message_id ~ '[[:cntrl:]]'
     or p_event_type not in ('delivered', 'hard_bounce', 'soft_bounce', 'blocked', 'invalid', 'deferred', 'spam', 'unsubscribed')
     or p_occurred_at is null
     or p_occurred_at > clock_timestamp() + interval '5 minutes' then
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

  if inserted_event_id is not null and p_event_type = 'unsubscribed' then
    insert into public.support_email_notification_preferences as current_preference(user_id, email_replies_enabled, preference_source, updated_at)
    select conversation.customer_user_id, false, 'provider_unsubscribe', p_occurred_at
    from public.support_delivery_outbox as outbox
    join public.support_conversations as conversation on conversation.id = outbox.conversation_id
    where outbox.id = linked_outbox_id and conversation.customer_user_id is not null
    on conflict (user_id) do update
      set email_replies_enabled = false,
          preference_source = 'provider_unsubscribe',
          updated_at = excluded.updated_at
      where current_preference.updated_at <= excluded.updated_at
    returning user_id into unsubscribed_user_id;

    if unsubscribed_user_id is not null then
      update public.support_delivery_outbox as outbox
      set status = 'suppressed', worker_id = null, locked_until = null
      from public.support_conversations as conversation
      where outbox.conversation_id = conversation.id
        and conversation.customer_user_id = unsubscribed_user_id
        and outbox.channel = 'email'
        and outbox.status = 'pending';
    end if;
  end if;

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
      count(*) filter (where outbox.status = 'processing' and (outbox.locked_until is null or outbox.locked_until <= bounds.window_end)) as stale_processing,
      count(*) filter (where outbox.status = 'failed') as failed,
      count(*) filter (where outbox.status = 'dead_letter') as dead_letter,
      count(*) filter (where outbox.status = 'suppressed' and outbox.created_at >= bounds.window_start) as suppressed,
      count(*) filter (where outbox.status = 'sent' and outbox.delivered_at >= bounds.window_start and outbox.delivered_at < bounds.window_end) as provider_accepted_last_30_days,
      count(*) filter (where outbox.status = 'sent' and outbox.delivered_at is null) as sent_without_acceptance_time,
      min(outbox.created_at) filter (where outbox.status = 'pending') as oldest_pending_at,
      max(outbox.delivered_at) filter (where outbox.status = 'sent' and outbox.delivered_at >= bounds.window_start and outbox.delivered_at < bounds.window_end) as most_recent_acceptance_in_window
    from public.support_delivery_outbox as outbox
    cross join bounds
    where outbox.channel = 'email'
      and (outbox.status <> 'sent' or outbox.delivered_at is null or outbox.delivered_at >= bounds.window_start)
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
    where event.occurred_at >= bounds.window_start and event.occurred_at < bounds.window_end
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
    'suppressed', delivery_summary.suppressed,
    'deliveryEventsAvailable', true,
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
  from bounds cross join delivery_summary cross join provider_event_summary;
$$;

revoke all on function public.support_get_email_notification_preference(uuid) from public, anon, authenticated;
revoke all on function public.support_set_email_notification_preference(uuid, boolean) from public, anon, authenticated;
revoke all on function public.support_claim_email_outbox(text, integer, integer) from public, anon, authenticated;
revoke all on function public.support_authorize_email_outbox(uuid, text, text) from public, anon, authenticated;
revoke all on function public.support_record_email_delivery_event(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.admin_read_support_email_delivery_health() from public, anon, authenticated;
grant execute on function public.support_get_email_notification_preference(uuid) to service_role;
grant execute on function public.support_set_email_notification_preference(uuid, boolean) to service_role;
grant execute on function public.support_claim_email_outbox(text, integer, integer) to service_role;
grant execute on function public.support_authorize_email_outbox(uuid, text, text) to service_role;
grant execute on function public.support_record_email_delivery_event(uuid, text, text, timestamptz) to service_role;
grant execute on function public.admin_read_support_email_delivery_health() to service_role;

commit;
