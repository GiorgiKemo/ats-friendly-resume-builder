create table if not exists public.admin_ga_report_cache (
  cache_key text primary key check (cache_key ~ '^[0-9a-f]{64}$'),
  property_id text not null check (property_id ~ '^[0-9]{1,20}$'),
  report_kind text not null check (report_kind = 'acquisition_by_channel_v1'),
  start_date date not null,
  end_date date not null,
  report_payload jsonb not null check (pg_column_size(report_payload) <= 262144),
  fetched_at timestamptz not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint admin_ga_report_cache_date_order check (start_date <= end_date),
  constraint admin_ga_report_cache_expiry_order check (expires_at > fetched_at)
);

create index if not exists admin_ga_report_cache_expiry_idx
  on public.admin_ga_report_cache(expires_at);

alter table public.admin_ga_report_cache enable row level security;
revoke all on table public.admin_ga_report_cache from public, anon, authenticated;
grant select, insert, update, delete on table public.admin_ga_report_cache to service_role;
