begin;

create table if not exists public.admin_user_directory (
  user_id uuid primary key references public.users(id) on delete cascade,
  email text not null,
  full_name text,
  created_at timestamptz not null default now(),
  email_confirmed_at timestamptz,
  last_sign_in_at timestamptz,
  is_banned boolean not null default false,
  ban_reason text,
  source_updated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_user_directory_created_idx
  on public.admin_user_directory(created_at desc, user_id desc);
create index if not exists admin_user_directory_email_idx
  on public.admin_user_directory(lower(email), user_id);
create index if not exists admin_user_directory_name_idx
  on public.admin_user_directory(lower(full_name), user_id);

insert into public.admin_user_directory(user_id, email, full_name, created_at, source_updated_at, updated_at)
select id, email, full_name, coalesce(created_at, now()), coalesce(updated_at, now()), now()
from public.users
on conflict (user_id) do update
set email = excluded.email,
    full_name = excluded.full_name,
    created_at = excluded.created_at,
    source_updated_at = excluded.source_updated_at,
    updated_at = now();

create or replace function public.sync_admin_user_directory_profile()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.admin_user_directory(user_id, email, full_name, created_at, source_updated_at, updated_at)
  values (new.id, new.email, new.full_name, coalesce(new.created_at, clock_timestamp()), clock_timestamp(), clock_timestamp())
  on conflict (user_id) do update
  set email = excluded.email,
      full_name = excluded.full_name,
      source_updated_at = excluded.source_updated_at,
      updated_at = clock_timestamp();
  return new;
end;
$$;

drop trigger if exists sync_admin_user_directory_profile on public.users;
create trigger sync_admin_user_directory_profile
after insert or update of email, full_name on public.users
for each row execute function public.sync_admin_user_directory_profile();

alter table public.admin_user_directory enable row level security;
revoke all on table public.admin_user_directory from public, anon, authenticated;
grant all on table public.admin_user_directory to service_role;

create or replace function public.admin_list_user_directory(
  p_search text default '',
  p_cursor_created_at timestamptz default null,
  p_cursor_user_id uuid default null,
  p_limit integer default 50
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := auth.uid();
  normalized_search text := btrim(coalesce(p_search, ''));
  escaped_search text;
  items jsonb;
  next_cursor jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and (actor_id is null or not exists (
    select 1
    from public.admin_members
    where user_id = actor_id
      and is_active
      and role in ('owner', 'admin', 'support')
    )) then
    raise exception 'Admin access required';
  end if;

  p_limit := greatest(1, least(coalesce(p_limit, 50), 100));
  normalized_search := left(normalized_search, 80);
  escaped_search := replace(replace(replace(normalized_search, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_');

  with page as (
    select d.user_id, d.email, d.full_name, d.created_at, d.email_confirmed_at,
      d.last_sign_in_at, d.is_banned, d.ban_reason, d.source_updated_at, d.updated_at
    from public.admin_user_directory d
    where (
      normalized_search = ''
      or lower(d.email) like '%' || lower(escaped_search) || '%' escape E'\\'
      or lower(coalesce(d.full_name, '')) like '%' || lower(escaped_search) || '%' escape E'\\'
      or d.user_id::text = normalized_search
    )
      and (
        p_cursor_created_at is null
        or p_cursor_user_id is null
        or (d.created_at, d.user_id) < (p_cursor_created_at, p_cursor_user_id)
      )
    order by d.created_at desc, d.user_id desc
    limit p_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', user_id,
    'email', email,
    'fullName', full_name,
    'createdAt', created_at,
    'emailConfirmedAt', email_confirmed_at,
    'lastSignInAt', last_sign_in_at,
    'isBanned', is_banned,
    'bannedReason', ban_reason,
    'sourceUpdatedAt', source_updated_at,
    'updatedAt', updated_at
  ) order by created_at desc, user_id desc), '[]'::jsonb)
  into items
  from page;

  if jsonb_array_length(items) = p_limit then
    next_cursor := jsonb_build_object(
      'createdAt', items -> (jsonb_array_length(items) - 1) ->> 'createdAt',
      'id', items -> (jsonb_array_length(items) - 1) ->> 'id'
    );
  else
    next_cursor := null;
  end if;

  return jsonb_build_object('items', items, 'nextCursor', next_cursor);
end;
$$;

revoke all on function public.sync_admin_user_directory_profile() from public, anon, authenticated;
revoke all on function public.admin_list_user_directory(text, timestamptz, uuid, integer) from public, anon;
grant execute on function public.admin_list_user_directory(text, timestamptz, uuid, integer) to authenticated;

commit;
