begin;

-- Customer feedback is a separate, bounded record. It is not copied into the
-- public analytics stream or treated as an implicit support resolution.
create table if not exists public.customer_feedback (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.support_conversations(id) on delete cascade,
  customer_user_id uuid references auth.users(id) on delete set null,
  guest_session_id uuid references public.support_guest_sessions(id) on delete set null,
  rating smallint not null check (rating between 1 and 5),
  category text not null default 'support' check (category in ('support', 'product', 'billing', 'account', 'other')),
  comment text check (comment is null or length(btrim(comment)) <= 2000),
  client_request_id text not null check (length(btrim(client_request_id)) between 8 and 200),
  created_at timestamptz not null default now(),
  check ((customer_user_id is null) <> (guest_session_id is null))
);

create unique index if not exists customer_feedback_conversation_idx
  on public.customer_feedback(conversation_id);
create index if not exists customer_feedback_created_idx
  on public.customer_feedback(created_at desc, id desc);

alter table public.customer_feedback enable row level security;
revoke all on table public.customer_feedback from public, anon, authenticated;
grant all on table public.customer_feedback to service_role;

create or replace function public.support_submit_feedback(
  p_conversation_id uuid,
  p_rating integer,
  p_category text default 'support',
  p_comment text default null,
  p_client_request_id text default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := auth.uid();
  conversation public.support_conversations%rowtype;
  existing public.customer_feedback%rowtype;
  response jsonb;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if p_rating is null or p_rating not between 1 and 5 then raise exception 'Invalid feedback rating'; end if;
  if p_category is null or btrim(p_category) not in ('support', 'product', 'billing', 'account', 'other') then raise exception 'Invalid feedback category'; end if;
  if p_comment is not null and length(btrim(p_comment)) > 2000 then raise exception 'Feedback is too long'; end if;
  if p_client_request_id is null or length(btrim(p_client_request_id)) not between 8 and 200 then raise exception 'Invalid feedback request id'; end if;

  select * into conversation
  from public.support_conversations
  where id = p_conversation_id and customer_user_id = actor_id and status = 'resolved'
  for update;
  if not found then raise exception 'Resolved support conversation required'; end if;

  insert into public.support_operation_receipts(actor_user_id, operation, client_request_id)
  values (actor_id, 'feedback:' || p_conversation_id::text, btrim(p_client_request_id))
  on conflict (actor_user_id, operation, client_request_id) do nothing;
  select response_body into response
  from public.support_operation_receipts
  where actor_user_id = actor_id
    and operation = 'feedback:' || p_conversation_id::text
    and client_request_id = btrim(p_client_request_id);
  if response is not null then return response; end if;

  insert into public.customer_feedback(conversation_id, customer_user_id, rating, category, comment, client_request_id)
  values (conversation.id, actor_id, p_rating, btrim(p_category), nullif(btrim(p_comment), ''), btrim(p_client_request_id))
  on conflict (conversation_id) do nothing
  returning * into existing;

  if existing.id is null then
    select * into existing from public.customer_feedback where conversation_id = conversation.id;
  end if;
  response := jsonb_build_object('feedbackId', existing.id, 'conversationId', existing.conversation_id, 'rating', existing.rating, 'category', existing.category, 'submitted', existing.client_request_id = btrim(p_client_request_id));
  update public.support_operation_receipts
  set response_body = response
  where actor_user_id = actor_id
    and operation = 'feedback:' || p_conversation_id::text
    and client_request_id = btrim(p_client_request_id);
  return response;
end;
$$;

create or replace function public.support_submit_guest_feedback(
  p_conversation_id uuid,
  p_rating integer,
  p_category text,
  p_comment text,
  p_client_request_id text,
  p_token_hash text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  guest public.support_guest_sessions%rowtype;
  conversation public.support_conversations%rowtype;
  existing public.customer_feedback%rowtype;
  response jsonb;
begin
  if p_token_hash is null or length(btrim(p_token_hash)) <> 64 then raise exception 'Invalid guest session'; end if;
  if p_rating is null or p_rating not between 1 and 5 then raise exception 'Invalid feedback rating'; end if;
  if p_category is null or btrim(p_category) not in ('support', 'product', 'billing', 'account', 'other') then raise exception 'Invalid feedback category'; end if;
  if p_comment is not null and length(btrim(p_comment)) > 2000 then raise exception 'Feedback is too long'; end if;
  if p_client_request_id is null or length(btrim(p_client_request_id)) not between 8 and 200 then raise exception 'Invalid feedback request id'; end if;

  select * into guest
  from public.support_guest_sessions
  where token_hash = btrim(p_token_hash) and revoked_at is null and expires_at > clock_timestamp()
  for update;
  if not found then raise exception 'Guest session expired'; end if;

  select * into conversation
  from public.support_conversations
  where id = p_conversation_id and guest_session_id = guest.id and status = 'resolved'
  for update;
  if not found then raise exception 'Resolved support conversation required'; end if;

  insert into public.support_guest_operation_receipts(guest_session_id, operation, client_request_id)
  values (guest.id, 'feedback:' || p_conversation_id::text, btrim(p_client_request_id))
  on conflict (guest_session_id, operation, client_request_id) do nothing;
  select response_body into response
  from public.support_guest_operation_receipts
  where guest_session_id = guest.id
    and operation = 'feedback:' || p_conversation_id::text
    and client_request_id = btrim(p_client_request_id);
  if response is not null then return response; end if;

  insert into public.customer_feedback(conversation_id, guest_session_id, rating, category, comment, client_request_id)
  values (conversation.id, guest.id, p_rating, btrim(p_category), nullif(btrim(p_comment), ''), btrim(p_client_request_id))
  on conflict (conversation_id) do nothing
  returning * into existing;

  if existing.id is null then
    select * into existing from public.customer_feedback where conversation_id = conversation.id;
  end if;
  response := jsonb_build_object('feedbackId', existing.id, 'conversationId', existing.conversation_id, 'rating', existing.rating, 'category', existing.category, 'submitted', existing.client_request_id = btrim(p_client_request_id));
  update public.support_guest_operation_receipts
  set response_body = response
  where guest_session_id = guest.id
    and operation = 'feedback:' || p_conversation_id::text
    and client_request_id = btrim(p_client_request_id);
  return response;
end;
$$;

create or replace function public.support_list_feedback(
  p_limit integer default 50,
  p_before timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := auth.uid();
  items jsonb;
begin
  if actor_id is null or not public.is_support_operator() then raise exception 'Support operator access required'; end if;
  p_limit := greatest(1, least(coalesce(p_limit, 50), 100));

  select coalesce(jsonb_agg(item order by item->>'createdAt' desc, item->>'id' desc), '[]'::jsonb)
  into items
  from (
    select jsonb_build_object(
      'id', f.id,
      'conversationId', f.conversation_id,
      'customerUserId', f.customer_user_id,
      'customerEmail', u.email,
      'rating', f.rating,
      'category', f.category,
      'comment', f.comment,
      'createdAt', f.created_at
    ) as item
    from public.customer_feedback f
    left join public.users u on u.id = f.customer_user_id
    where p_before is null or f.created_at < p_before
    order by f.created_at desc, f.id desc
    limit p_limit
  ) feedback;
  return jsonb_build_object('items', items);
end;
$$;

revoke all on function public.support_submit_feedback(uuid, integer, text, text, text) from public, anon;
revoke all on function public.support_submit_guest_feedback(uuid, integer, text, text, text, text) from public, anon, authenticated;
revoke all on function public.support_list_feedback(integer, timestamptz) from public, anon;
grant execute on function public.support_submit_feedback(uuid, integer, text, text, text) to authenticated;
grant execute on function public.support_submit_guest_feedback(uuid, integer, text, text, text, text) to service_role;
grant execute on function public.support_list_feedback(integer, timestamptz) to authenticated;

-- Knowledge is versioned separately from conversations. Only reviewed,
-- published versions are exposed to an eventual support-AI worker.
create table if not exists public.support_knowledge_articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and length(slug) between 1 and 120),
  locale text not null default 'en' check (locale ~ '^[a-z]{2}(?:-[A-Z]{2})?$' and length(locale) between 2 and 10),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  current_version_id uuid,
  created_by_user_id uuid references auth.users(id) on delete set null,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (slug, locale)
);

create table if not exists public.support_knowledge_versions (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.support_knowledge_articles(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  title text not null check (length(btrim(title)) between 1 and 200),
  body text not null check (length(btrim(body)) between 1 and 20000),
  source_ref text not null check (length(btrim(source_ref)) between 1 and 500),
  created_by_user_id uuid references auth.users(id) on delete set null,
  reviewed_by_user_id uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (article_id, version_number),
  check ((reviewed_at is null) = (reviewed_by_user_id is null)),
  check (published_at is null or reviewed_at is not null)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'support_knowledge_articles_current_version_fk'
  ) then
    alter table public.support_knowledge_articles
      add constraint support_knowledge_articles_current_version_fk
      foreign key (current_version_id) references public.support_knowledge_versions(id) on delete set null;
  end if;
end;
$$;

create index if not exists support_knowledge_articles_status_idx
  on public.support_knowledge_articles(status, locale, slug);
create index if not exists support_knowledge_versions_article_idx
  on public.support_knowledge_versions(article_id, version_number desc);

alter table public.support_knowledge_articles enable row level security;
alter table public.support_knowledge_versions enable row level security;
revoke all on table public.support_knowledge_articles from public, anon, authenticated;
revoke all on table public.support_knowledge_versions from public, anon, authenticated;
grant all on table public.support_knowledge_articles to service_role;
grant all on table public.support_knowledge_versions to service_role;

create or replace function public.is_knowledge_manager()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.admin_members
    where user_id = auth.uid() and is_active and role in ('owner', 'admin')
  );
$$;
revoke all on function public.is_knowledge_manager() from public, anon;
grant execute on function public.is_knowledge_manager() to authenticated;

create or replace function public.support_create_knowledge_draft(
  p_slug text,
  p_locale text,
  p_title text,
  p_body text,
  p_source_ref text,
  p_client_request_id text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := auth.uid();
  article public.support_knowledge_articles%rowtype;
  version_id uuid;
  next_version integer;
  response jsonb;
  operation_name text;
begin
  if actor_id is null or not public.is_knowledge_manager() then raise exception 'Knowledge manager access required'; end if;
  if p_slug is null or btrim(p_slug) !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or length(btrim(p_slug)) > 120 then raise exception 'Invalid knowledge slug'; end if;
  if p_locale is null or btrim(p_locale) !~ '^[a-z]{2}(?:-[A-Z]{2})?$' or length(btrim(p_locale)) > 10 then raise exception 'Invalid knowledge locale'; end if;
  if p_title is null or length(btrim(p_title)) not between 1 and 200 then raise exception 'Invalid knowledge title'; end if;
  if p_body is null or length(btrim(p_body)) not between 1 and 20000 then raise exception 'Invalid knowledge body'; end if;
  if p_source_ref is null or length(btrim(p_source_ref)) not between 1 and 500 then raise exception 'Invalid knowledge source'; end if;
  if p_client_request_id is null or length(btrim(p_client_request_id)) not between 8 and 200 then raise exception 'Invalid knowledge request id'; end if;

  operation_name := 'knowledge_draft';
  insert into public.support_operation_receipts(actor_user_id, operation, client_request_id)
  values (actor_id, operation_name, btrim(p_client_request_id))
  on conflict (actor_user_id, operation, client_request_id) do nothing;
  select response_body into response from public.support_operation_receipts
  where actor_user_id = actor_id and operation = operation_name and client_request_id = btrim(p_client_request_id);
  if response is not null then return response; end if;

  select * into article
  from public.support_knowledge_articles
  where slug = btrim(p_slug) and locale = btrim(p_locale)
  for update;
  if not found then
    insert into public.support_knowledge_articles(slug, locale, status, created_by_user_id, updated_by_user_id)
    values (btrim(p_slug), btrim(p_locale), 'draft', actor_id, actor_id)
    returning * into article;
  else
    update public.support_knowledge_articles
    set status = 'draft', updated_by_user_id = actor_id, updated_at = clock_timestamp()
    where id = article.id
    returning * into article;
  end if;

  select coalesce(max(version_number), 0) + 1 into next_version
  from public.support_knowledge_versions where article_id = article.id;
  insert into public.support_knowledge_versions(article_id, version_number, title, body, source_ref, created_by_user_id)
  values (article.id, next_version, btrim(p_title), btrim(p_body), btrim(p_source_ref), actor_id)
  returning id into version_id;

  response := jsonb_build_object('articleId', article.id, 'versionId', version_id, 'versionNumber', next_version, 'status', 'draft');
  update public.support_operation_receipts set response_body = response
  where actor_user_id = actor_id and operation = operation_name and client_request_id = btrim(p_client_request_id);
  return response;
end;
$$;

create or replace function public.support_publish_knowledge(
  p_article_id uuid,
  p_version_id uuid,
  p_client_request_id text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := auth.uid();
  response jsonb;
  operation_name text := 'knowledge_publish';
begin
  if actor_id is null or not public.is_knowledge_manager() then raise exception 'Knowledge manager access required'; end if;
  if p_article_id is null or p_version_id is null then raise exception 'Knowledge version is required'; end if;
  if p_client_request_id is null or length(btrim(p_client_request_id)) not between 8 and 200 then raise exception 'Invalid knowledge request id'; end if;
  if not exists (select 1 from public.support_knowledge_versions where id = p_version_id and article_id = p_article_id) then raise exception 'Knowledge version not found'; end if;

  insert into public.support_operation_receipts(actor_user_id, operation, client_request_id)
  values (actor_id, operation_name, btrim(p_client_request_id))
  on conflict (actor_user_id, operation, client_request_id) do nothing;
  select response_body into response from public.support_operation_receipts
  where actor_user_id = actor_id and operation = operation_name and client_request_id = btrim(p_client_request_id);
  if response is not null then return response; end if;

  update public.support_knowledge_versions
  set reviewed_by_user_id = actor_id, reviewed_at = clock_timestamp(), published_at = clock_timestamp()
  where id = p_version_id and article_id = p_article_id;
  update public.support_knowledge_articles
  set status = 'published', current_version_id = p_version_id, updated_by_user_id = actor_id, updated_at = clock_timestamp()
  where id = p_article_id;
  response := jsonb_build_object('articleId', p_article_id, 'versionId', p_version_id, 'status', 'published');
  update public.support_operation_receipts set response_body = response
  where actor_user_id = actor_id and operation = operation_name and client_request_id = btrim(p_client_request_id);
  return response;
end;
$$;

create or replace function public.support_rollback_knowledge(
  p_article_id uuid,
  p_version_id uuid,
  p_client_request_id text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := auth.uid();
  response jsonb;
  operation_name text := 'knowledge_rollback';
begin
  if actor_id is null or not public.is_knowledge_manager() then raise exception 'Knowledge manager access required'; end if;
  if p_article_id is null or p_version_id is null then raise exception 'Knowledge version is required'; end if;
  if p_client_request_id is null or length(btrim(p_client_request_id)) not between 8 and 200 then raise exception 'Invalid knowledge request id'; end if;
  if not exists (select 1 from public.support_knowledge_versions where id = p_version_id and article_id = p_article_id and published_at is not null) then raise exception 'Published knowledge version required'; end if;

  insert into public.support_operation_receipts(actor_user_id, operation, client_request_id)
  values (actor_id, operation_name, btrim(p_client_request_id))
  on conflict (actor_user_id, operation, client_request_id) do nothing;
  select response_body into response from public.support_operation_receipts
  where actor_user_id = actor_id and operation = operation_name and client_request_id = btrim(p_client_request_id);
  if response is not null then return response; end if;

  update public.support_knowledge_articles
  set status = 'published', current_version_id = p_version_id, updated_by_user_id = actor_id, updated_at = clock_timestamp()
  where id = p_article_id;
  response := jsonb_build_object('articleId', p_article_id, 'versionId', p_version_id, 'status', 'published');
  update public.support_operation_receipts set response_body = response
  where actor_user_id = actor_id and operation = operation_name and client_request_id = btrim(p_client_request_id);
  return response;
end;
$$;

create or replace function public.support_list_knowledge(
  p_locale text default null,
  p_status text default 'all',
  p_limit integer default 50
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := auth.uid();
  items jsonb;
begin
  if actor_id is null or not public.is_knowledge_manager() then raise exception 'Knowledge manager access required'; end if;
  if p_status is null or p_status not in ('all', 'draft', 'published', 'archived') then raise exception 'Invalid knowledge status'; end if;
  p_limit := greatest(1, least(coalesce(p_limit, 50), 100));

  select coalesce(jsonb_agg(item order by item->>'updatedAt' desc, item->>'slug'), '[]'::jsonb)
  into items
  from (
    select jsonb_build_object(
      'articleId', a.id,
      'slug', a.slug,
      'locale', a.locale,
      'status', a.status,
      'currentVersionId', a.current_version_id,
      'updatedAt', a.updated_at,
      'currentVersion', case when current_version.id is null then null else jsonb_build_object('id', current_version.id, 'versionNumber', current_version.version_number, 'title', current_version.title, 'body', current_version.body, 'sourceRef', current_version.source_ref, 'publishedAt', current_version.published_at) end,
      'latestVersion', case when latest_version.id is null then null else jsonb_build_object('id', latest_version.id, 'versionNumber', latest_version.version_number, 'title', latest_version.title, 'body', latest_version.body, 'sourceRef', latest_version.source_ref, 'publishedAt', latest_version.published_at) end,
      'versions', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'versionNumber', v.version_number, 'title', v.title, 'sourceRef', v.source_ref, 'publishedAt', v.published_at) order by v.version_number desc) from (select v.* from public.support_knowledge_versions v where v.article_id = a.id order by v.version_number desc limit 20) v), '[]'::jsonb)
    ) as item
    from public.support_knowledge_articles a
    left join public.support_knowledge_versions current_version on current_version.id = a.current_version_id
    left join lateral (
      select v.* from public.support_knowledge_versions v
      where v.article_id = a.id
      order by v.version_number desc
      limit 1
    ) latest_version on true
    where (p_status = 'all' or a.status = p_status)
      and (p_locale is null or a.locale = btrim(p_locale))
    order by a.updated_at desc, a.slug
    limit p_limit
  ) articles;
  return jsonb_build_object('items', items);
end;
$$;

create or replace function public.support_list_published_knowledge(
  p_locale text default 'en'
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  items jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'articleId', a.id,
    'slug', a.slug,
    'locale', a.locale,
    'versionId', v.id,
    'versionNumber', v.version_number,
    'title', v.title,
    'body', v.body,
    'sourceRef', v.source_ref,
    'publishedAt', v.published_at
  ) order by a.slug), '[]'::jsonb)
  into items
  from public.support_knowledge_articles a
  join public.support_knowledge_versions v on v.id = a.current_version_id
  where a.status = 'published' and a.locale = coalesce(nullif(btrim(p_locale), ''), 'en') and v.published_at is not null;
  return items;
end;
$$;

revoke all on function public.is_knowledge_manager() from public, anon;
revoke all on function public.support_create_knowledge_draft(text, text, text, text, text, text) from public, anon;
revoke all on function public.support_publish_knowledge(uuid, uuid, text) from public, anon;
revoke all on function public.support_rollback_knowledge(uuid, uuid, text) from public, anon;
revoke all on function public.support_list_knowledge(text, text, integer) from public, anon;
revoke all on function public.support_list_published_knowledge(text) from public, anon, authenticated;
grant execute on function public.is_knowledge_manager() to authenticated;
grant execute on function public.support_create_knowledge_draft(text, text, text, text, text, text) to authenticated;
grant execute on function public.support_publish_knowledge(uuid, uuid, text) to authenticated;
grant execute on function public.support_rollback_knowledge(uuid, uuid, text) to authenticated;
grant execute on function public.support_list_knowledge(text, text, integer) to authenticated;
grant execute on function public.support_list_published_knowledge(text) to service_role;

commit;
