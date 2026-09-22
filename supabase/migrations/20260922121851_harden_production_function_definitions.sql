-- Keep the revoked maintenance helper lint-clean even though it is not
-- callable by client roles. Qualifying the source table removes the conflict
-- between the output column named `email` and the users.email column.
create or replace function public.fix_premium_users_without_stripe()
returns table (
  user_id uuid,
  email text,
  fixed boolean,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
begin
  for rec in
    select u.id, u.email
    from public.users as u
    where u.is_premium = true
      and (u.stripe_customer_id is null or u.stripe_customer_id = '')
  loop
    user_id := rec.id;
    email := rec.email;
    fixed := false;
    message := 'Premium user without Stripe customer ID';
    return next;
  end loop;
  return;
end;
$$;

-- Replace the stale deployed analytics body. The previous production
-- definition called jsonb_object_length(), which is not available on this
-- Postgres version, so every client analytics call failed before insertion.
-- Keep the allowlist, size cap, flat-property restriction, and restricted-key
-- guard in the deployed definition as well as in the source migration.
create or replace function public.record_analytics_event(
  p_event_key text,
  p_event_name text,
  p_properties jsonb default '{}'::jsonb,
  p_occurred_at timestamptz default clock_timestamp()
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  inserted_id uuid;
begin
  if caller_id is null then
    raise exception 'Authentication required';
  end if;
  if p_event_key is null or length(btrim(p_event_key)) not between 8 and 240 then
    raise exception 'Invalid analytics event key';
  end if;
  if p_event_name not in (
    'account_created', 'resume_created', 'resume_exported', 'application_created',
    'upgrade_click', 'checkout_started', 'checkout_created', 'purchase_confirmed',
    'support_started', 'support_resolved'
  ) then
    raise exception 'Analytics event is not allowlisted';
  end if;
  if p_event_name in ('account_created', 'checkout_created', 'purchase_confirmed') then
    raise exception 'This analytics event is server-only';
  end if;
  if p_properties is null or jsonb_typeof(p_properties) <> 'object'
    or (select count(*) from jsonb_object_keys(p_properties)) > 12
    or length(p_properties::text) > 2000 then
    raise exception 'Analytics properties are too large';
  end if;
  if exists (
    select 1
    from jsonb_each(p_properties) as property(key, value)
    where jsonb_typeof(property.value) in ('object', 'array')
  ) then
    raise exception 'Analytics properties must be flat';
  end if;
  if p_properties ?| array[
    'email', 'user_email', 'full_name', 'resume_content', 'job_description',
    'access_token', 'refresh_token', 'secret', 'token'
  ] then
    raise exception 'Analytics properties contain a restricted field';
  end if;

  insert into public.analytics_events(event_key, event_name, actor_user_id, properties, occurred_at)
  values (btrim(p_event_key), p_event_name, caller_id, p_properties, coalesce(p_occurred_at, clock_timestamp()))
  on conflict (event_key) do nothing
  returning id into inserted_id;

  if inserted_id is null then
    select id into inserted_id
    from public.analytics_events
    where event_key = btrim(p_event_key);
  end if;

  return inserted_id;
end;
$$;

revoke all on function public.record_analytics_event(text, text, jsonb, timestamptz)
  from public, anon;
grant execute on function public.record_analytics_event(text, text, jsonb, timestamptz)
  to authenticated;
