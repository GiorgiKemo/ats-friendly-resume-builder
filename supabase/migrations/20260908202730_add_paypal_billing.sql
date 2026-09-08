begin;
-- Keep each provider's entitlement independent; only service-role billing handlers write.
create table public.billing_entitlements (
  user_id uuid not null references public.users(id) on delete cascade,
  provider text not null check (provider in ('stripe', 'paypal', 'manual')),
  subscription_id text not null,
  active boolean not null default false,
  paid_until timestamptz,
  plan text,
  observed_at timestamptz not null default now(),
  primary key (user_id, provider, subscription_id)
);
alter table public.billing_entitlements enable row level security;
revoke all on public.billing_entitlements from anon, authenticated;
grant select on public.billing_entitlements to authenticated;
grant all on public.billing_entitlements to service_role;
create policy billing_entitlements_read_own on public.billing_entitlements
for select to authenticated using ((select auth.uid()) = user_id);

insert into public.billing_entitlements(user_id, provider, subscription_id, active, paid_until, plan)
select id, case when stripe_customer_id is not null then 'stripe' else 'manual' end,
  'primary', coalesce(is_premium, false), premium_until, premium_plan from public.users;

create table public.paypal_checkouts (
  request_id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  plan text not null check (plan in ('premium_monthly', 'premium_yearly')),
  subscription_id text unique,
  created_at timestamptz not null default now()
);
create index paypal_checkouts_user_idx on public.paypal_checkouts(user_id);
alter table public.paypal_checkouts enable row level security;
revoke all on public.paypal_checkouts from anon, authenticated;
grant all on public.paypal_checkouts to service_role;

create or replace function public.apply_billing_entitlement(
 p_user_id uuid, p_provider text, p_subscription_id text, p_updates jsonb,
 p_observed_at timestamptz default clock_timestamp()
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare chosen record;
begin
 if p_provider not in ('stripe','paypal') or p_subscription_id = '' then
   raise exception 'Invalid billing provider';
 end if;
 perform 1 from public.users where id=p_user_id for update;
 if not found then raise exception 'Billing user missing'; end if;
 insert into public.billing_entitlements(user_id,provider,subscription_id,active,paid_until,plan,observed_at)
 values(p_user_id,p_provider,p_subscription_id,(p_updates->>'is_premium')::boolean,
   (p_updates->>'premium_until')::timestamptz,p_updates->>'premium_plan',p_observed_at)
 on conflict(user_id,provider,subscription_id) do update set
   active=excluded.active,
   paid_until=case when p_updates ? 'premium_until' then excluded.paid_until else billing_entitlements.paid_until end,
   plan=coalesce(excluded.plan,billing_entitlements.plan),observed_at=excluded.observed_at
 where billing_entitlements.observed_at <= excluded.observed_at;
 select * into chosen from public.billing_entitlements
 where user_id=p_user_id and active and (paid_until > now() or (provider='manual' and paid_until is null))
 order by paid_until desc nulls first limit 1;
 if found then
   update public.users set is_premium=true,premium_until=chosen.paid_until,
     premium_plan=chosen.plan,premium_updated_at=now(),ai_generations_limit=30 where id=p_user_id;
 else
   update public.users set is_premium=false,premium_updated_at=now() where id=p_user_id;
 end if;
 return p_user_id;
end $$;
revoke all on function public.apply_billing_entitlement(uuid,text,text,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.apply_billing_entitlement(uuid,text,text,jsonb,timestamptz) to service_role;
commit;
