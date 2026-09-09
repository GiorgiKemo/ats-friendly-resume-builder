begin;

create table if not exists public.admin_invitation_email_outbox (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.admin_members(id) on delete cascade,
  recipient_email text not null,
  role text not null check (role in ('owner', 'admin', 'support')),
  invitation_expires_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'dead_letter')),
  attempts integer not null default 0 check (attempts >= 0 and attempts <= 5),
  available_at timestamptz not null default clock_timestamp(),
  locked_until timestamptz,
  worker_id text,
  provider_message_id text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (member_id, invitation_expires_at)
);

create index if not exists admin_invitation_email_outbox_claim_idx
  on public.admin_invitation_email_outbox(status, available_at, created_at)
  where status in ('pending', 'processing');

alter table public.admin_invitation_email_outbox enable row level security;
revoke all on table public.admin_invitation_email_outbox from public, anon, authenticated;

create or replace function public.admin_enqueue_invitation_email()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.user_id is null
    and new.is_active
    and new.invitation_revoked_at is null
    and new.invitation_sent_at is not null
    and new.invitation_expires_at is not null
    and new.invitation_expires_at > clock_timestamp()
    and (
      tg_op = 'INSERT'
      or new.invitation_sent_at is distinct from old.invitation_sent_at
      or new.invitation_expires_at is distinct from old.invitation_expires_at
      or new.role is distinct from old.role
    ) then
    insert into public.admin_invitation_email_outbox(
      member_id, recipient_email, role, invitation_expires_at
    )
    values (
      new.id, lower(btrim(new.email)), new.role, new.invitation_expires_at
    )
    on conflict (member_id, invitation_expires_at) do update
      set recipient_email = excluded.recipient_email,
          role = excluded.role,
          updated_at = clock_timestamp();
  end if;
  return new;
end;
$$;

drop trigger if exists admin_invitation_email_after_member on public.admin_members;
create trigger admin_invitation_email_after_member
after insert or update of email, role, is_active, user_id, invitation_sent_at, invitation_expires_at, invitation_revoked_at
on public.admin_members
for each row execute function public.admin_enqueue_invitation_email();

insert into public.admin_invitation_email_outbox(member_id, recipient_email, role, invitation_expires_at)
select m.id, lower(btrim(m.email)), m.role, m.invitation_expires_at
from public.admin_members m
where m.user_id is null
  and m.is_active
  and m.invitation_revoked_at is null
  and m.invitation_sent_at is not null
  and m.invitation_expires_at > clock_timestamp()
on conflict (member_id, invitation_expires_at) do nothing;

create or replace function public.admin_claim_invitation_email_outbox(
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
    raise exception 'Invalid invitation worker identity';
  end if;
  if p_limit is null or p_limit not between 1 and 25 then
    raise exception 'Invalid invitation batch size';
  end if;
  if p_lease_seconds is null or p_lease_seconds not between 30 and 900 then
    raise exception 'Invalid invitation lease';
  end if;

  with candidates as (
    select o.id
    from public.admin_invitation_email_outbox o
    join public.admin_members m on m.id = o.member_id
    where m.user_id is null
      and m.is_active
      and m.invitation_revoked_at is null
      and m.invitation_expires_at > clock_timestamp()
      and (
        (o.status = 'pending' and o.available_at <= clock_timestamp())
        or (o.status = 'processing' and o.locked_until is not null and o.locked_until <= clock_timestamp())
      )
      and o.attempts < 5
    order by o.available_at, o.created_at, o.id
    limit p_limit
    for update of o skip locked
  ), updated as (
    update public.admin_invitation_email_outbox o
    set status = 'processing',
        attempts = o.attempts + 1,
        worker_id = btrim(p_worker_id),
        locked_until = clock_timestamp() + make_interval(secs => p_lease_seconds),
        last_error = null,
        updated_at = clock_timestamp()
    from candidates c
    where o.id = c.id
    returning o.id, o.member_id, o.recipient_email, o.role, o.invitation_expires_at, o.attempts, o.locked_until
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'outboxId', o.id,
    'memberId', o.member_id,
    'recipientEmail', o.recipient_email,
    'role', o.role,
    'invitationExpiresAt', o.invitation_expires_at,
    'attempt', o.attempts,
    'leaseUntil', o.locked_until
  ) order by o.id), '[]'::jsonb)
  into claimed
  from updated o;

  return claimed;
end;
$$;

create or replace function public.admin_complete_invitation_email_outbox(
  p_outbox_id uuid,
  p_worker_id text,
  p_provider_message_id text default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  completed public.admin_invitation_email_outbox%rowtype;
begin
  if p_worker_id is null or length(btrim(p_worker_id)) not between 8 and 120 then
    raise exception 'Invalid invitation worker identity';
  end if;
  if p_provider_message_id is not null and length(btrim(p_provider_message_id)) > 200 then
    raise exception 'Invalid provider message id';
  end if;

  update public.admin_invitation_email_outbox
  set status = 'sent',
      worker_id = null,
      locked_until = null,
      provider_message_id = nullif(btrim(p_provider_message_id), ''),
      sent_at = clock_timestamp(),
      last_error = null,
      updated_at = clock_timestamp()
  where id = p_outbox_id
    and status = 'processing'
    and worker_id = btrim(p_worker_id)
    and locked_until > clock_timestamp()
  returning * into completed;
  if not found then raise exception 'Invitation email lease is no longer valid'; end if;
  return jsonb_build_object('outboxId', completed.id, 'status', completed.status, 'providerMessageId', completed.provider_message_id);
end;
$$;

create or replace function public.admin_release_invitation_email_outbox(
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
  released public.admin_invitation_email_outbox%rowtype;
begin
  if p_worker_id is null or length(btrim(p_worker_id)) not between 8 and 120 then
    raise exception 'Invalid invitation worker identity';
  end if;
  if p_error_code is null or length(btrim(p_error_code)) not between 1 and 120 then
    raise exception 'Invalid invitation error';
  end if;

  update public.admin_invitation_email_outbox
  set status = case when p_retry and attempts < 5 then 'pending' else 'dead_letter' end,
      available_at = case when p_retry and attempts < 5 then clock_timestamp() + interval '5 minutes' else available_at end,
      worker_id = null,
      locked_until = null,
      last_error = btrim(p_error_code),
      updated_at = clock_timestamp()
  where id = p_outbox_id
    and status = 'processing'
    and worker_id = btrim(p_worker_id)
  returning * into released;
  if not found then raise exception 'Invitation email lease is no longer valid'; end if;
  return jsonb_build_object('outboxId', released.id, 'status', released.status, 'lastError', released.last_error);
end;
$$;

revoke all on function public.admin_enqueue_invitation_email() from public, anon, authenticated;
revoke all on function public.admin_claim_invitation_email_outbox(text, integer, integer) from public, anon, authenticated;
revoke all on function public.admin_complete_invitation_email_outbox(uuid, text, text) from public, anon, authenticated;
revoke all on function public.admin_release_invitation_email_outbox(uuid, text, boolean, text) from public, anon, authenticated;
grant execute on function public.admin_claim_invitation_email_outbox(text, integer, integer) to service_role;
grant execute on function public.admin_complete_invitation_email_outbox(uuid, text, text) to service_role;
grant execute on function public.admin_release_invitation_email_outbox(uuid, text, boolean, text) to service_role;

commit;
