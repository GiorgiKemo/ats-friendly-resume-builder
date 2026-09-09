begin;

-- Feedback remains a private operator record. Tags are deliberately bounded and
-- normalized by the service-only RPC below; they are never accepted from a
-- public client or copied into first-party analytics automatically.
alter table public.customer_feedback
  add column if not exists tags text[] not null default '{}'::text[];

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'customer_feedback_tags_count_check'
  ) then
    alter table public.customer_feedback
      add constraint customer_feedback_tags_count_check
      check (cardinality(tags) <= 8);
  end if;
end;
$$;

create index if not exists customer_feedback_tags_idx
  on public.customer_feedback using gin(tags);

create table if not exists public.improvement_items (
  id uuid primary key default gen_random_uuid(),
  source_feedback_id uuid references public.customer_feedback(id) on delete set null,
  category text not null default 'other' check (category in ('support', 'product', 'billing', 'account', 'other')),
  title text not null check (length(btrim(title)) between 1 and 160),
  sanitized_summary text not null check (length(btrim(sanitized_summary)) between 1 and 2000),
  impact text not null default 'unknown' check (impact in ('unknown', 'low', 'medium', 'high')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'backlog' check (status in ('backlog', 'planned', 'in_progress', 'done', 'declined')),
  owner_user_id uuid references auth.users(id) on delete set null,
  outcome text check (outcome is null or length(btrim(outcome)) <= 2000),
  created_by_user_id uuid references auth.users(id) on delete set null,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists improvement_items_status_priority_idx
  on public.improvement_items(status, priority, updated_at desc, id desc);
create index if not exists improvement_items_source_feedback_idx
  on public.improvement_items(source_feedback_id);

alter table public.improvement_items enable row level security;
revoke all on table public.improvement_items from public, anon, authenticated;
grant all on table public.improvement_items to service_role;

create or replace function public.support_update_feedback_tags(
  p_feedback_id uuid,
  p_tags text[],
  p_client_request_id text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := auth.uid();
  feedback public.customer_feedback%rowtype;
  response jsonb;
  normalized_tags text[] := '{}'::text[];
  tag text;
begin
  if actor_id is null or not public.is_support_operator() then raise exception 'Support operator access required'; end if;
  if p_feedback_id is null then raise exception 'Feedback is required'; end if;
  if p_client_request_id is null or length(btrim(p_client_request_id)) not between 8 and 200 then raise exception 'Invalid feedback request id'; end if;
  if p_tags is not null and cardinality(p_tags) > 8 then raise exception 'Too many feedback tags'; end if;

  if p_tags is not null then
    foreach tag in array p_tags loop
      if tag is null then raise exception 'Invalid feedback tag'; end if;
      tag := lower(btrim(tag));
      if tag = '' or length(tag) > 40 or tag !~ '^[a-z0-9][a-z0-9 _-]*$' then raise exception 'Invalid feedback tag'; end if;
      if not tag = any(normalized_tags) then normalized_tags := array_append(normalized_tags, tag); end if;
    end loop;
  end if;

  insert into public.support_operation_receipts(actor_user_id, operation, client_request_id)
  values (actor_id, 'feedback-tags:' || p_feedback_id::text, btrim(p_client_request_id))
  on conflict (actor_user_id, operation, client_request_id) do nothing;
  select response_body into response
  from public.support_operation_receipts
  where actor_user_id = actor_id
    and operation = 'feedback-tags:' || p_feedback_id::text
    and client_request_id = btrim(p_client_request_id);
  if response is not null then return response; end if;

  select * into feedback
  from public.customer_feedback
  where id = p_feedback_id
  for update;
  if not found then raise exception 'Feedback not found'; end if;

  update public.customer_feedback
  set tags = normalized_tags
  where id = p_feedback_id
  returning * into feedback;

  response := jsonb_build_object(
    'feedbackId', feedback.id,
    'tags', feedback.tags,
    'updatedAt', feedback.created_at
  );
  update public.support_operation_receipts
  set response_body = response
  where actor_user_id = actor_id
    and operation = 'feedback-tags:' || p_feedback_id::text
    and client_request_id = btrim(p_client_request_id);
  return response;
end;
$$;

create or replace function public.support_create_improvement_item(
  p_title text,
  p_sanitized_summary text,
  p_category text default 'other',
  p_impact text default 'unknown',
  p_priority text default 'normal',
  p_source_feedback_id uuid default null,
  p_client_request_id text default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := auth.uid();
  item public.improvement_items%rowtype;
  response jsonb;
begin
  if actor_id is null or not public.is_support_operator() then raise exception 'Support operator access required'; end if;
  if p_title is null or length(btrim(p_title)) not between 1 and 160 then raise exception 'Invalid improvement title'; end if;
  if p_sanitized_summary is null or length(btrim(p_sanitized_summary)) not between 1 and 2000 then raise exception 'Invalid improvement summary'; end if;
  if p_category is null or btrim(p_category) not in ('support', 'product', 'billing', 'account', 'other') then raise exception 'Invalid improvement category'; end if;
  if p_impact is null or btrim(p_impact) not in ('unknown', 'low', 'medium', 'high') then raise exception 'Invalid improvement impact'; end if;
  if p_priority is null or btrim(p_priority) not in ('low', 'normal', 'high', 'urgent') then raise exception 'Invalid improvement priority'; end if;
  if p_source_feedback_id is not null and not exists (select 1 from public.customer_feedback where id = p_source_feedback_id) then raise exception 'Source feedback not found'; end if;
  if p_client_request_id is null or length(btrim(p_client_request_id)) not between 8 and 200 then raise exception 'Invalid improvement request id'; end if;

  insert into public.support_operation_receipts(actor_user_id, operation, client_request_id)
  values (actor_id, 'improvement-create', btrim(p_client_request_id))
  on conflict (actor_user_id, operation, client_request_id) do nothing;
  select response_body into response
  from public.support_operation_receipts
  where actor_user_id = actor_id and operation = 'improvement-create' and client_request_id = btrim(p_client_request_id);
  if response is not null then return response; end if;

  insert into public.improvement_items(source_feedback_id, category, title, sanitized_summary, impact, priority, created_by_user_id, updated_by_user_id)
  values (p_source_feedback_id, btrim(p_category), btrim(p_title), btrim(p_sanitized_summary), btrim(p_impact), btrim(p_priority), actor_id, actor_id)
  returning * into item;

  response := jsonb_build_object('improvementId', item.id, 'status', item.status, 'priority', item.priority);
  update public.support_operation_receipts
  set response_body = response
  where actor_user_id = actor_id and operation = 'improvement-create' and client_request_id = btrim(p_client_request_id);
  return response;
end;
$$;

create or replace function public.support_update_improvement_item(
  p_improvement_id uuid,
  p_status text,
  p_priority text,
  p_owner_user_id uuid default null,
  p_outcome text default null,
  p_client_request_id text default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := auth.uid();
  item public.improvement_items%rowtype;
  response jsonb;
begin
  if actor_id is null or not public.is_support_operator() then raise exception 'Support operator access required'; end if;
  if p_improvement_id is null then raise exception 'Improvement item is required'; end if;
  if p_status is null or btrim(p_status) not in ('backlog', 'planned', 'in_progress', 'done', 'declined') then raise exception 'Invalid improvement status'; end if;
  if p_priority is null or btrim(p_priority) not in ('low', 'normal', 'high', 'urgent') then raise exception 'Invalid improvement priority'; end if;
  if p_outcome is not null and length(btrim(p_outcome)) > 2000 then raise exception 'Improvement outcome is too long'; end if;
  if p_owner_user_id is not null and not exists (
    select 1 from public.admin_members
    where user_id = p_owner_user_id and is_active and role in ('owner', 'admin', 'support')
  ) then raise exception 'Improvement owner must be an active operator'; end if;
  if p_client_request_id is null or length(btrim(p_client_request_id)) not between 8 and 200 then raise exception 'Invalid improvement request id'; end if;

  insert into public.support_operation_receipts(actor_user_id, operation, client_request_id)
  values (actor_id, 'improvement-update:' || p_improvement_id::text, btrim(p_client_request_id))
  on conflict (actor_user_id, operation, client_request_id) do nothing;
  select response_body into response
  from public.support_operation_receipts
  where actor_user_id = actor_id
    and operation = 'improvement-update:' || p_improvement_id::text
    and client_request_id = btrim(p_client_request_id);
  if response is not null then return response; end if;

  update public.improvement_items
  set status = btrim(p_status), priority = btrim(p_priority), owner_user_id = p_owner_user_id,
      outcome = nullif(btrim(p_outcome), ''), updated_by_user_id = actor_id, updated_at = clock_timestamp()
  where id = p_improvement_id
  returning * into item;
  if not found then raise exception 'Improvement item not found'; end if;

  response := jsonb_build_object('improvementId', item.id, 'status', item.status, 'priority', item.priority, 'updatedAt', item.updated_at);
  update public.support_operation_receipts
  set response_body = response
  where actor_user_id = actor_id
    and operation = 'improvement-update:' || p_improvement_id::text
    and client_request_id = btrim(p_client_request_id);
  return response;
end;
$$;

create or replace function public.support_list_improvement_items(
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
  if actor_id is null or not public.is_support_operator() then raise exception 'Support operator access required'; end if;
  if p_status is null or p_status not in ('all', 'backlog', 'planned', 'in_progress', 'done', 'declined') then raise exception 'Invalid improvement status'; end if;
  p_limit := greatest(1, least(coalesce(p_limit, 50), 100));

  select coalesce(jsonb_agg(item order by item->>'updatedAt' desc, item->>'id' desc), '[]'::jsonb)
  into items
  from (
    select jsonb_build_object(
      'id', i.id,
      'sourceFeedbackId', i.source_feedback_id,
      'category', i.category,
      'title', i.title,
      'sanitizedSummary', i.sanitized_summary,
      'impact', i.impact,
      'priority', i.priority,
      'status', i.status,
      'ownerUserId', i.owner_user_id,
      'ownerEmail', owner_user.email,
      'outcome', i.outcome,
      'createdAt', i.created_at,
      'updatedAt', i.updated_at
    ) as item
    from public.improvement_items i
    left join public.users owner_user on owner_user.id = i.owner_user_id
    where p_status = 'all' or i.status = p_status
    order by i.updated_at desc, i.id desc
    limit p_limit
  ) improvements;
  return jsonb_build_object('items', items);
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
  category_counts jsonb;
  tag_counts jsonb;
  feedback_count integer;
  average_rating numeric;
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
      'tags', f.tags,
      'comment', f.comment,
      'createdAt', f.created_at
    ) as item
    from public.customer_feedback f
    left join public.users u on u.id = f.customer_user_id
    where p_before is null or f.created_at < p_before
    order by f.created_at desc, f.id desc
    limit p_limit
  ) feedback;

  select count(*)::integer, avg(rating)::numeric
  into feedback_count, average_rating
  from public.customer_feedback;
  select coalesce(jsonb_object_agg(category, total), '{}'::jsonb)
  into category_counts
  from (select category, count(*)::integer as total from public.customer_feedback group by category) categories;
  select coalesce(jsonb_object_agg(tag, total), '{}'::jsonb)
  into tag_counts
  from (
    select tag, count(*)::integer as total
    from public.customer_feedback f
    cross join lateral unnest(f.tags) as tags(tag)
    group by tag
  ) tags;

  return jsonb_build_object(
    'items', items,
    'summary', jsonb_build_object(
      'count', feedback_count,
      'averageRating', average_rating,
      'byCategory', category_counts,
      'byTag', tag_counts
    )
  );
end;
$$;

revoke all on function public.support_update_feedback_tags(uuid, text[], text) from public, anon;
revoke all on function public.support_create_improvement_item(text, text, text, text, text, uuid, text) from public, anon;
revoke all on function public.support_update_improvement_item(uuid, text, text, uuid, text, text) from public, anon;
revoke all on function public.support_list_improvement_items(text, integer) from public, anon;
revoke all on function public.support_list_feedback(integer, timestamptz) from public, anon;
grant execute on function public.support_update_feedback_tags(uuid, text[], text) to authenticated;
grant execute on function public.support_create_improvement_item(text, text, text, text, text, uuid, text) to authenticated;
grant execute on function public.support_update_improvement_item(uuid, text, text, uuid, text, text) to authenticated;
grant execute on function public.support_list_improvement_items(text, integer) to authenticated;
grant execute on function public.support_list_feedback(integer, timestamptz) to authenticated;

commit;
