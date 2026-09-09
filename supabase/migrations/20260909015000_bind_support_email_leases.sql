begin;

alter table public.support_delivery_outbox
  add column if not exists worker_id text;

create index if not exists support_delivery_outbox_worker_idx
  on public.support_delivery_outbox(worker_id, status, locked_until);

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
    select o.id
    from public.support_delivery_outbox o
    join public.support_conversations c on c.id = o.conversation_id
    join public.users u on u.id = c.customer_user_id
    where o.channel = 'email'
      and u.email is not null
      and (
        (o.status = 'pending' and o.available_at <= clock_timestamp())
        or (o.status = 'processing' and o.locked_until is not null and o.locked_until <= clock_timestamp())
      )
      and o.attempts < 5
    order by o.available_at, o.created_at, o.id
    limit p_limit
    for update of o skip locked
  ), updated as (
    update public.support_delivery_outbox o
    set status = 'processing',
        attempts = o.attempts + 1,
        worker_id = btrim(p_worker_id),
        locked_until = clock_timestamp() + make_interval(secs => p_lease_seconds),
        last_error = null
    from candidates c
    where o.id = c.id
    returning o.id, o.conversation_id, o.message_id, o.attempts, o.locked_until
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'outboxId', o.id,
    'conversationId', o.conversation_id,
    'messageId', o.message_id,
    'attempt', o.attempts,
    'leaseUntil', o.locked_until,
    'recipientEmail', u.email,
    'subject', c.subject,
    'body', m.body,
    'createdAt', m.created_at
  ) order by o.id), '[]'::jsonb)
  into claimed
  from updated o
  join public.support_conversations c on c.id = o.conversation_id
  join public.users u on u.id = c.customer_user_id
  join public.support_messages m on m.id = o.message_id;

  return claimed;
end;
$$;

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
begin
  if p_worker_id is null or length(btrim(p_worker_id)) not between 8 and 120 then
    raise exception 'Invalid notification worker identity';
  end if;
  if p_provider_message_id is not null and length(btrim(p_provider_message_id)) > 200 then
    raise exception 'Invalid provider message id';
  end if;

  update public.support_delivery_outbox
  set status = 'sent', worker_id = null, locked_until = null, delivered_at = clock_timestamp(),
      last_error = null
  where id = p_outbox_id and channel = 'email' and status = 'processing'
    and worker_id = btrim(p_worker_id) and locked_until > clock_timestamp()
  returning * into completed;
  if not found then raise exception 'Notification lease is no longer valid'; end if;
  return jsonb_build_object('outboxId', completed.id, 'status', completed.status, 'providerMessageId', nullif(btrim(p_provider_message_id), ''));
end;
$$;

create or replace function public.support_release_email_outbox(
  p_outbox_id uuid,
  p_worker_id text,
  p_retry boolean,
  p_error_code text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  released public.support_delivery_outbox%rowtype;
begin
  if p_worker_id is null or length(btrim(p_worker_id)) not between 8 and 120 then
    raise exception 'Invalid notification worker identity';
  end if;
  if p_error_code is null or length(btrim(p_error_code)) not between 1 and 120 then
    raise exception 'Invalid notification error';
  end if;

  update public.support_delivery_outbox
  set status = case when p_retry and attempts < 5 then 'pending' else 'dead_letter' end,
      available_at = case when p_retry and attempts < 5 then clock_timestamp() + interval '5 minutes' else available_at end,
      worker_id = null, locked_until = null, last_error = btrim(p_error_code)
  where id = p_outbox_id and channel = 'email' and status = 'processing'
    and worker_id = btrim(p_worker_id)
  returning * into released;
  if not found then raise exception 'Notification lease is no longer valid'; end if;
  return jsonb_build_object('outboxId', released.id, 'status', released.status, 'lastError', released.last_error);
end;
$$;

revoke all on function public.support_claim_email_outbox(text, integer, integer) from public, anon, authenticated;
revoke all on function public.support_complete_email_outbox(uuid, text, text) from public, anon, authenticated;
revoke all on function public.support_release_email_outbox(uuid, text, boolean, text) from public, anon, authenticated;
grant execute on function public.support_claim_email_outbox(text, integer, integer) to service_role;
grant execute on function public.support_complete_email_outbox(uuid, text, text) to service_role;
grant execute on function public.support_release_email_outbox(uuid, text, boolean, text) to service_role;

commit;
