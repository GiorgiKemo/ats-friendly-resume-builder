begin;

create table if not exists public.billing_provider_events (
  provider text not null check (provider in ('paypal')),
  event_id text not null,
  event_type text not null,
  status text not null default 'processing' check (status in ('processing', 'processed', 'skipped', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  primary key (provider, event_id)
);

alter table public.billing_provider_events enable row level security;
revoke all on table public.billing_provider_events from public, anon, authenticated;
grant select, insert, update on table public.billing_provider_events to service_role;

create index if not exists billing_provider_events_status_idx
  on public.billing_provider_events(provider, status, created_at);

commit;
