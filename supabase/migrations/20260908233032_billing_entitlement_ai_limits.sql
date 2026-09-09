begin;

-- Keep the effective AI allowance with the entitlement source that owns access.
-- This lets manual admin grants coexist with Stripe and PayPal subscriptions.
alter table public.billing_entitlements
  add column if not exists ai_limit integer not null default 30;

alter table public.billing_entitlements
  add constraint billing_entitlements_ai_limit_check
  check (ai_limit between 0 and 100000);

update public.billing_entitlements ent
set ai_limit = greatest(0, least(100000, coalesce(users.ai_generations_limit, 30)))
from public.users
where users.id = ent.user_id;

create or replace function public.apply_billing_entitlement(
  p_user_id uuid,
  p_provider text,
  p_subscription_id text,
  p_updates jsonb,
  p_observed_at timestamptz default clock_timestamp()
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  chosen record;
  requested_ai_limit integer := 30;
begin
  if p_provider not in ('stripe', 'paypal', 'manual')
    or nullif(btrim(p_subscription_id), '') is null
    or p_updates is null
    or not (p_updates ? 'is_premium') then
    raise exception 'Invalid billing entitlement';
  end if;

  if p_updates ? 'ai_limit' then
    requested_ai_limit := greatest(0, least(100000, (p_updates->>'ai_limit')::integer));
  end if;

  perform 1 from public.users where id = p_user_id for update;
  if not found then
    raise exception 'Billing user missing';
  end if;

  insert into public.billing_entitlements(
    user_id, provider, subscription_id, active, paid_until, plan, ai_limit, observed_at
  )
  values(
    p_user_id,
    p_provider,
    p_subscription_id,
    coalesce((p_updates->>'is_premium')::boolean, false),
    (p_updates->>'premium_until')::timestamptz,
    p_updates->>'premium_plan',
    requested_ai_limit,
    p_observed_at
  )
  on conflict(user_id, provider, subscription_id) do update set
    active = excluded.active,
    paid_until = case
      when p_updates ? 'premium_until' then excluded.paid_until
      else public.billing_entitlements.paid_until
    end,
    plan = coalesce(excluded.plan, public.billing_entitlements.plan),
    ai_limit = case
      when p_updates ? 'ai_limit' then excluded.ai_limit
      else public.billing_entitlements.ai_limit
    end,
    observed_at = excluded.observed_at
  where public.billing_entitlements.observed_at <= excluded.observed_at;

  select * into chosen
  from public.billing_entitlements
  where user_id = p_user_id
    and active
    and (
      paid_until > now()
      or (provider = 'manual' and paid_until is null)
    )
  order by paid_until desc nulls first
  limit 1;

  if found then
    update public.users
    set is_premium = true,
        premium_until = chosen.paid_until,
        premium_plan = chosen.plan,
        premium_updated_at = now(),
        ai_generations_limit = chosen.ai_limit,
        updated_at = now()
    where id = p_user_id;
  else
    update public.users
    set is_premium = false,
        premium_until = null,
        premium_plan = null,
        premium_updated_at = now(),
        ai_generations_limit = 0,
        updated_at = now()
    where id = p_user_id;
  end if;

  return p_user_id;
end;
$$;

revoke all on function public.apply_billing_entitlement(uuid, text, text, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.apply_billing_entitlement(uuid, text, text, jsonb, timestamptz)
  to service_role;

commit;
