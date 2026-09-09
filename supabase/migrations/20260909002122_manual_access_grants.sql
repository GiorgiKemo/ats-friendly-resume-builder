begin;

create table if not exists public.manual_access_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,
  plan text not null default 'premium_manual',
  ai_limit integer not null default 30 check (ai_limit between 0 and 100000),
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  reason text check (reason is null or length(reason) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or expires_at > starts_at)
);

create index if not exists manual_access_grants_user_active_idx
  on public.manual_access_grants(user_id, starts_at, expires_at)
  where revoked_at is null;

alter table public.manual_access_grants enable row level security;
revoke all on table public.manual_access_grants from public, anon, authenticated;
grant all on table public.manual_access_grants to service_role;

insert into public.manual_access_grants(user_id, plan, ai_limit, starts_at, expires_at, reason)
select user_id,
  coalesce(plan, 'premium_manual'),
  greatest(0, least(100000, coalesce(ai_limit, 30))),
  coalesce(observed_at, now()),
  paid_until,
  'Migrated legacy manual access'
from public.billing_entitlements
where provider = 'manual' and active
on conflict do nothing;

-- The legacy compatibility row must no longer keep access alive after a grant
-- is revoked. Effective access below reads manual grants instead.
update public.billing_entitlements
set active = false
where provider = 'manual';

create or replace function public.reconcile_effective_access(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  has_paid boolean := false;
  has_manual boolean := false;
  paid_ai_limit integer := 0;
  manual_ai_limit integer := 0;
  paid_until timestamptz;
  manual_until timestamptz;
  paid_plan text;
  manual_plan text;
  effective_limit integer := 0;
  effective_until timestamptz;
  effective_plan text;
begin
  perform 1 from public.users where id = p_user_id for update;
  if not found then raise exception 'Billing user missing'; end if;

  select e.plan, e.ai_limit, e.paid_until
  into paid_plan, paid_ai_limit, paid_until
  from public.billing_entitlements as e
  where e.user_id = p_user_id
    and e.provider in ('stripe', 'paypal')
    and e.active
    and e.paid_until > clock_timestamp()
  order by e.ai_limit desc, e.paid_until desc, e.observed_at desc
  limit 1;
  has_paid := found;

  select plan, ai_limit, expires_at
  into manual_plan, manual_ai_limit, manual_until
  from public.manual_access_grants
  where user_id = p_user_id
    and revoked_at is null
    and starts_at <= clock_timestamp()
    and (expires_at is null or expires_at > clock_timestamp())
  order by ai_limit desc, expires_at desc nulls first, created_at desc
  limit 1;
  has_manual := found;

  if not has_paid and not has_manual then
    update public.users
    set is_premium = false,
        premium_until = null,
        premium_plan = null,
        premium_updated_at = clock_timestamp(),
        ai_generations_limit = 0,
        updated_at = clock_timestamp()
    where id = p_user_id;
    return;
  end if;

  effective_limit := greatest(coalesce(paid_ai_limit, 0), coalesce(manual_ai_limit, 0));
  effective_until := case
    when has_manual and manual_until is null then null
    when not has_paid then manual_until
    when not has_manual then paid_until
    else greatest(paid_until, manual_until)
  end;
  effective_plan := coalesce(manual_plan, paid_plan, 'premium');

  update public.users
  set is_premium = true,
      premium_until = effective_until,
      premium_plan = effective_plan,
      premium_updated_at = clock_timestamp(),
      ai_generations_limit = effective_limit,
      updated_at = clock_timestamp()
  where id = p_user_id;
end;
$$;

create or replace function public.apply_billing_entitlement(
  p_user_id uuid,
  p_provider text,
  p_subscription_id text,
  p_updates jsonb,
  p_observed_at timestamptz default clock_timestamp()
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  requested_ai_limit integer := 30;
begin
  if p_provider not in ('stripe', 'paypal')
    or nullif(btrim(p_subscription_id), '') is null
    or p_updates is null
    or not (p_updates ? 'is_premium') then
    raise exception 'Invalid billing entitlement';
  end if;
  if p_updates ? 'ai_limit' then
    requested_ai_limit := greatest(0, least(100000, (p_updates->>'ai_limit')::integer));
  end if;

  perform 1 from public.users where id = p_user_id for update;
  if not found then raise exception 'Billing user missing'; end if;

  insert into public.billing_entitlements(user_id, provider, subscription_id, active, paid_until, plan, ai_limit, observed_at)
  values (
    p_user_id,
    p_provider,
    btrim(p_subscription_id),
    coalesce((p_updates->>'is_premium')::boolean, false),
    (p_updates->>'premium_until')::timestamptz,
    p_updates->>'premium_plan',
    requested_ai_limit,
    p_observed_at
  )
  on conflict (user_id, provider, subscription_id) do update set
    active = excluded.active,
    paid_until = case when p_updates ? 'premium_until' then excluded.paid_until else public.billing_entitlements.paid_until end,
    plan = coalesce(excluded.plan, public.billing_entitlements.plan),
    ai_limit = case when p_updates ? 'ai_limit' then excluded.ai_limit else public.billing_entitlements.ai_limit end,
    observed_at = excluded.observed_at
  where public.billing_entitlements.observed_at <= excluded.observed_at;

  perform public.reconcile_effective_access(p_user_id);
  return p_user_id;
end;
$$;

create or replace function public.grant_manual_access(
  p_user_id uuid,
  p_grant_id uuid default gen_random_uuid(),
  p_granted_by uuid default null,
  p_plan text default 'premium_manual',
  p_ai_limit integer default 30,
  p_starts_at timestamptz default clock_timestamp(),
  p_expires_at timestamptz default null,
  p_reason text default null
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_grant_id is null or p_user_id is null or p_ai_limit < 0 or p_ai_limit > 100000 then
    raise exception 'Invalid manual access grant';
  end if;
  if p_expires_at is not null and p_expires_at <= p_starts_at then
    raise exception 'Manual access expiry must be after its start';
  end if;
  if p_reason is not null and length(p_reason) > 500 then raise exception 'Manual access reason is too long'; end if;

  insert into public.manual_access_grants(id, user_id, granted_by, plan, ai_limit, starts_at, expires_at, reason)
  values (p_grant_id, p_user_id, p_granted_by, coalesce(nullif(btrim(p_plan), ''), 'premium_manual'), p_ai_limit, coalesce(p_starts_at, clock_timestamp()), p_expires_at, nullif(btrim(p_reason), ''))
  on conflict (id) do nothing;
  perform public.reconcile_effective_access(p_user_id);
  return p_grant_id;
end;
$$;

create or replace function public.revoke_manual_access(p_user_id uuid, p_grant_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare changed integer;
begin
  update public.manual_access_grants
  set revoked_at = coalesce(revoked_at, clock_timestamp()), updated_at = clock_timestamp()
  where user_id = p_user_id and id = p_grant_id and revoked_at is null;
  get diagnostics changed = row_count;
  perform public.reconcile_effective_access(p_user_id);
  return changed;
end;
$$;

create or replace function public.revoke_all_manual_access(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare changed integer;
begin
  update public.manual_access_grants
  set revoked_at = coalesce(revoked_at, clock_timestamp()), updated_at = clock_timestamp()
  where user_id = p_user_id and revoked_at is null;
  get diagnostics changed = row_count;
  perform public.reconcile_effective_access(p_user_id);
  return changed;
end;
$$;

revoke all on function public.reconcile_effective_access(uuid) from public, anon, authenticated;
revoke all on function public.apply_billing_entitlement(uuid, text, text, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.grant_manual_access(uuid, uuid, uuid, text, integer, timestamptz, timestamptz, text) from public, anon, authenticated;
revoke all on function public.revoke_manual_access(uuid, uuid) from public, anon, authenticated;
revoke all on function public.revoke_all_manual_access(uuid) from public, anon, authenticated;
grant execute on function public.reconcile_effective_access(uuid) to service_role;
grant execute on function public.apply_billing_entitlement(uuid, text, text, jsonb, timestamptz) to service_role;
grant execute on function public.grant_manual_access(uuid, uuid, uuid, text, integer, timestamptz, timestamptz, text) to service_role;
grant execute on function public.revoke_manual_access(uuid, uuid) to service_role;
grant execute on function public.revoke_all_manual_access(uuid) to service_role;

commit;
