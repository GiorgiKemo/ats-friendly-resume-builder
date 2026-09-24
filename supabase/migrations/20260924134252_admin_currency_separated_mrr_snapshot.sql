-- Return currency-separated run-rate details from the bounded billing
-- projection. This is explicitly a base-price preview, not validated MRR:
-- provider coverage, recurring discounts and additional Stripe items are not
-- fully represented by the existing projection contract.
create or replace function public.admin_read_live_subscription_run_rate()
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  with active_live as (
    select
      lower(btrim(currency)) as currency,
      amount_minor,
      lower(btrim(billing_interval)) as billing_interval,
      current_period_end,
      observed_at
    from public.billing_subscriptions
    where environment = 'live'
      and lower(btrim(status)) = 'active'
  ), classified as (
    select
      *,
      case
        when current_period_end > transaction_timestamp()
          and amount_minor > 0
          and currency ~ '^[a-z]{3}$'
          and billing_interval = 'month'
          then amount_minor::numeric
        when current_period_end > transaction_timestamp()
          and amount_minor > 0
          and currency ~ '^[a-z]{3}$'
          and billing_interval = 'year'
          then round(amount_minor::numeric / 12, 2)
        else null::numeric
      end as monthly_base_price_minor
    from active_live
  ), currency_totals as (
    select
      currency,
      round(sum(monthly_base_price_minor), 2) as monthly_base_price_minor,
      count(*)::integer as subscription_count,
      max(observed_at) as latest_observed_at
    from classified
    where monthly_base_price_minor is not null
    group by currency
  )
  select jsonb_build_object(
    'available', true,
    'metric', 'observed_subscription_price_run_rate',
    'source', 'billing_subscriptions',
    'isComplete', false,
    'qualityReasons', jsonb_build_array(
      'provider_subscription_coverage_unverified',
      'recurring_discounts_not_projected',
      'additional_subscription_items_not_projected'
    ),
    'generatedAt', transaction_timestamp(),
    'activeLiveProjectionCount', (select count(*)::integer from active_live),
    'includedProjectionCount', (select count(*)::integer from classified where monthly_base_price_minor is not null),
    'unsupportedProjectionCount', (select count(*)::integer from classified where monthly_base_price_minor is null),
    'oldestObservedAt', (select min(observed_at) from active_live),
    'newestObservedAt', (select max(observed_at) from active_live),
    'currencies', coalesce((
      select jsonb_agg(jsonb_build_object(
        'currency', currency,
        'monthlyBasePriceMinor', monthly_base_price_minor,
        'subscriptionCount', subscription_count,
        'latestObservedAt', latest_observed_at
      ) order by currency)
      from currency_totals
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.admin_read_live_subscription_run_rate() from public, anon, authenticated;
grant execute on function public.admin_read_live_subscription_run_rate() to service_role;
