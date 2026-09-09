begin;

alter table public.support_attachments
  add column if not exists scan_attempts integer not null default 0,
  add column if not exists scan_lease_until timestamptz,
  add column if not exists scan_worker_id text,
  add column if not exists scan_last_error text;

alter table public.support_attachments
  drop constraint if exists support_attachments_scan_attempts_check;

alter table public.support_attachments
  add constraint support_attachments_scan_attempts_check
  check (scan_attempts between 0 and 5);

create index if not exists support_attachments_scan_claim_idx
  on public.support_attachments(status, scan_lease_until, scan_attempts, created_at, id)
  where status = 'quarantined';

create or replace function public.support_claim_attachment_scan(
  p_worker_id text,
  p_limit integer default 10,
  p_lease_seconds integer default 300
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  claimed jsonb;
begin
  if p_worker_id is null or length(btrim(p_worker_id)) not between 8 and 120 then
    raise exception 'Invalid scanner worker identity';
  end if;
  if p_limit is null or p_limit not between 1 and 25 then
    raise exception 'Invalid scanner batch size';
  end if;
  if p_lease_seconds is null or p_lease_seconds not between 30 and 900 then
    raise exception 'Invalid scanner lease';
  end if;

  with candidates as (
    select id
    from public.support_attachments
    where status = 'quarantined'
      and uploaded_at is not null
      and scan_attempts < 5
      and (scan_lease_until is null or scan_lease_until <= clock_timestamp())
    order by created_at, id
    limit p_limit
    for update skip locked
  ), updated as (
    update public.support_attachments a
    set scan_attempts = a.scan_attempts + 1,
        scan_lease_until = clock_timestamp() + make_interval(secs => p_lease_seconds),
        scan_worker_id = btrim(p_worker_id),
        scan_last_error = null,
        updated_at = clock_timestamp()
    from candidates c
    where a.id = c.id
    returning a.id, a.conversation_id, a.storage_path, a.original_name,
      a.declared_mime, a.byte_size, a.scan_attempts, a.scan_lease_until
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'attachmentId', id,
    'conversationId', conversation_id,
    'storagePath', storage_path,
    'originalName', original_name,
    'declaredMime', declared_mime,
    'byteSize', byte_size,
    'scanAttempts', scan_attempts,
    'leaseUntil', scan_lease_until
  ) order by storage_path), '[]'::jsonb)
  into claimed
  from updated;

  return claimed;
end;
$$;

create or replace function public.support_complete_attachment_scan(
  p_attachment_id uuid,
  p_worker_id text,
  p_status text,
  p_scan_code text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  completed public.support_attachments%rowtype;
begin
  if p_worker_id is null or length(btrim(p_worker_id)) not between 8 and 120 then
    raise exception 'Invalid scanner worker identity';
  end if;
  if p_status not in ('clean', 'blocked', 'failed') then
    raise exception 'Invalid attachment scan status';
  end if;
  if p_scan_code is null or length(btrim(p_scan_code)) not between 1 and 120 then
    raise exception 'Invalid attachment scan code';
  end if;

  update public.support_attachments
  set status = p_status,
      scan_code = btrim(p_scan_code),
      scanned_at = clock_timestamp(),
      scan_lease_until = null,
      scan_worker_id = null,
      scan_last_error = case when p_status = 'failed' then btrim(p_scan_code) else null end,
      updated_at = clock_timestamp()
  where id = p_attachment_id
    and status = 'quarantined'
    and scan_worker_id = btrim(p_worker_id)
    and scan_lease_until > clock_timestamp()
  returning * into completed;

  if not found then raise exception 'Attachment scan lease is no longer valid'; end if;
  return jsonb_build_object('attachmentId', completed.id, 'status', completed.status, 'scanCode', completed.scan_code);
end;
$$;

create or replace function public.support_release_attachment_scan(
  p_attachment_id uuid,
  p_worker_id text,
  p_retry boolean,
  p_scan_code text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  released public.support_attachments%rowtype;
begin
  if p_worker_id is null or length(btrim(p_worker_id)) not between 8 and 120 then
    raise exception 'Invalid scanner worker identity';
  end if;
  if p_scan_code is null or length(btrim(p_scan_code)) not between 1 and 120 then
    raise exception 'Invalid attachment scan code';
  end if;

  update public.support_attachments
  set status = case when p_retry and scan_attempts < 5 then 'quarantined' else 'failed' end,
      scan_code = btrim(p_scan_code),
      scan_last_error = btrim(p_scan_code),
      scan_lease_until = null,
      scan_worker_id = null,
      scanned_at = case when p_retry and scan_attempts < 5 then null else clock_timestamp() end,
      updated_at = clock_timestamp()
  where id = p_attachment_id
    and status = 'quarantined'
    and scan_worker_id = btrim(p_worker_id)
  returning * into released;

  if not found then raise exception 'Attachment scan lease is no longer valid'; end if;
  return jsonb_build_object('attachmentId', released.id, 'status', released.status, 'scanCode', released.scan_code);
end;
$$;

revoke all on function public.support_claim_attachment_scan(text, integer, integer) from public, anon, authenticated;
revoke all on function public.support_complete_attachment_scan(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.support_release_attachment_scan(uuid, text, boolean, text) from public, anon, authenticated;
grant execute on function public.support_claim_attachment_scan(text, integer, integer) to service_role;
grant execute on function public.support_complete_attachment_scan(uuid, text, text, text) to service_role;
grant execute on function public.support_release_attachment_scan(uuid, text, boolean, text) to service_role;

commit;
