begin;

-- Support attachments are private, short-lived objects. Metadata is created by
-- an authorized support RPC; the Edge API issues the signed upload token and a
-- service-only finalize step puts the object into quarantine before scanning.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'support-attachments',
  'support-attachments',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'application/pdf']::text[]
)
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.support_attachments (
  id uuid primary key,
  conversation_id uuid not null references public.support_conversations(id) on delete cascade,
  message_id uuid references public.support_messages(id) on delete set null,
  uploader_user_id uuid references auth.users(id) on delete set null,
  guest_session_id uuid references public.support_guest_sessions(id) on delete cascade,
  storage_path text not null unique,
  original_name text not null check (length(btrim(original_name)) between 1 and 255),
  declared_mime text not null check (declared_mime in ('image/jpeg', 'image/png', 'application/pdf')),
  byte_size bigint not null check (byte_size between 1 and 10485760),
  status text not null default 'pending' check (status in ('pending', 'quarantined', 'clean', 'blocked', 'failed', 'expired')),
  scan_code text check (scan_code is null or length(btrim(scan_code)) between 1 and 120),
  upload_expires_at timestamptz not null,
  uploaded_at timestamptz,
  scanned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((uploader_user_id is not null) <> (guest_session_id is not null)),
  check (storage_path = conversation_id::text || '/' || id::text),
  check (upload_expires_at > created_at)
);

create index if not exists support_attachments_conversation_idx
  on public.support_attachments(conversation_id, created_at, id);
create index if not exists support_attachments_scan_queue_idx
  on public.support_attachments(status, upload_expires_at, created_at, id);

alter table public.support_attachments enable row level security;
revoke all on table public.support_attachments from public, anon, authenticated;
grant select, insert, update on table public.support_attachments to service_role;

create or replace function public.support_prepare_attachment(
  p_conversation_id uuid,
  p_attachment_id uuid,
  p_storage_path text,
  p_original_name text,
  p_declared_mime text,
  p_byte_size bigint,
  p_upload_expires_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := auth.uid();
  existing public.support_attachments%rowtype;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if p_conversation_id is null or p_attachment_id is null then raise exception 'Invalid attachment identity'; end if;
  if p_storage_path <> p_conversation_id::text || '/' || p_attachment_id::text then raise exception 'Invalid attachment path'; end if;
  if p_original_name is null or length(btrim(p_original_name)) not between 1 and 255 then raise exception 'Invalid attachment name'; end if;
  if p_declared_mime not in ('image/jpeg', 'image/png', 'application/pdf') then raise exception 'Unsupported attachment type'; end if;
  if p_byte_size is null or p_byte_size not between 1 and 10485760 then raise exception 'Attachment is too large'; end if;
  if p_upload_expires_at is null or p_upload_expires_at <= clock_timestamp() or p_upload_expires_at > clock_timestamp() + interval '2 hours' then raise exception 'Invalid attachment expiry'; end if;
  if not exists (
    select 1 from public.support_conversations c
    where c.id = p_conversation_id
      and (c.customer_user_id = actor_id or public.is_support_operator())
  ) then raise exception 'Support conversation access required'; end if;

  insert into public.support_attachments(
    id, conversation_id, uploader_user_id, storage_path, original_name,
    declared_mime, byte_size, upload_expires_at
  ) values (
    p_attachment_id, p_conversation_id, actor_id, p_storage_path, btrim(p_original_name),
    p_declared_mime, p_byte_size, p_upload_expires_at
  ) on conflict (id) do nothing;

  select * into existing
  from public.support_attachments
  where id = p_attachment_id
    and conversation_id = p_conversation_id
    and uploader_user_id = actor_id;
  if not found then raise exception 'Attachment could not be prepared'; end if;
  if existing.status <> 'pending' or existing.upload_expires_at <= clock_timestamp() then raise exception 'Attachment upload is no longer available'; end if;
  return jsonb_build_object('attachmentId', existing.id, 'storagePath', existing.storage_path, 'status', existing.status, 'expiresAt', existing.upload_expires_at);
end;
$$;

create or replace function public.support_prepare_guest_attachment(
  p_conversation_id uuid,
  p_attachment_id uuid,
  p_storage_path text,
  p_original_name text,
  p_declared_mime text,
  p_byte_size bigint,
  p_upload_expires_at timestamptz,
  p_token_hash text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  guest_id uuid;
  existing public.support_attachments%rowtype;
begin
  if p_token_hash is null or length(btrim(p_token_hash)) <> 64 then raise exception 'Support session required'; end if;
  select s.id into guest_id
  from public.support_guest_sessions s
  join public.support_conversations c on c.guest_session_id = s.id
  where c.id = p_conversation_id and s.token_hash = btrim(p_token_hash)
    and s.revoked_at is null and s.expires_at > clock_timestamp();
  if guest_id is null then raise exception 'Support session required'; end if;
  if p_attachment_id is null or p_storage_path <> p_conversation_id::text || '/' || p_attachment_id::text then raise exception 'Invalid attachment identity'; end if;
  if p_original_name is null or length(btrim(p_original_name)) not between 1 and 255 then raise exception 'Invalid attachment name'; end if;
  if p_declared_mime not in ('image/jpeg', 'image/png', 'application/pdf') then raise exception 'Unsupported attachment type'; end if;
  if p_byte_size is null or p_byte_size not between 1 and 10485760 then raise exception 'Attachment is too large'; end if;
  if p_upload_expires_at is null or p_upload_expires_at <= clock_timestamp() or p_upload_expires_at > clock_timestamp() + interval '2 hours' then raise exception 'Invalid attachment expiry'; end if;

  insert into public.support_attachments(
    id, conversation_id, guest_session_id, storage_path, original_name,
    declared_mime, byte_size, upload_expires_at
  ) values (
    p_attachment_id, p_conversation_id, guest_id, p_storage_path, btrim(p_original_name),
    p_declared_mime, p_byte_size, p_upload_expires_at
  ) on conflict (id) do nothing;

  select * into existing
  from public.support_attachments
  where id = p_attachment_id and conversation_id = p_conversation_id and guest_session_id = guest_id;
  if not found then raise exception 'Attachment could not be prepared'; end if;
  if existing.status <> 'pending' or existing.upload_expires_at <= clock_timestamp() then raise exception 'Attachment upload is no longer available'; end if;
  return jsonb_build_object('attachmentId', existing.id, 'storagePath', existing.storage_path, 'status', existing.status, 'expiresAt', existing.upload_expires_at);
end;
$$;

create or replace function public.support_finalize_attachment(
  p_attachment_id uuid,
  p_actual_size bigint,
  p_actual_mime text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  attachment public.support_attachments%rowtype;
begin
  select * into attachment from public.support_attachments where id = p_attachment_id for update;
  if not found then raise exception 'Attachment not found'; end if;
  if attachment.status <> 'pending' then
    return jsonb_build_object('attachmentId', attachment.id, 'status', attachment.status, 'scanCode', attachment.scan_code);
  end if;
  if attachment.upload_expires_at <= clock_timestamp() then
    update public.support_attachments set status = 'expired', scan_code = 'upload_expired', updated_at = clock_timestamp() where id = attachment.id;
    return jsonb_build_object('attachmentId', attachment.id, 'status', 'expired', 'scanCode', 'upload_expired');
  end if;
  if p_actual_size is null or p_actual_size <> attachment.byte_size or p_actual_mime is null or p_actual_mime <> attachment.declared_mime then
    update public.support_attachments set status = 'blocked', scan_code = 'metadata_mismatch', updated_at = clock_timestamp() where id = attachment.id;
    return jsonb_build_object('attachmentId', attachment.id, 'status', 'blocked', 'scanCode', 'metadata_mismatch');
  end if;
  update public.support_attachments
  set status = 'quarantined', scan_code = 'awaiting_scan', uploaded_at = clock_timestamp(), updated_at = clock_timestamp()
  where id = attachment.id;
  return jsonb_build_object('attachmentId', attachment.id, 'status', 'quarantined', 'scanCode', 'awaiting_scan');
end;
$$;

create or replace function public.support_mark_attachment_scan(
  p_attachment_id uuid,
  p_status text,
  p_scan_code text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_status not in ('clean', 'blocked', 'failed') then raise exception 'Invalid attachment scan status'; end if;
  update public.support_attachments
  set status = p_status, scan_code = nullif(btrim(p_scan_code), ''), scanned_at = clock_timestamp(), updated_at = clock_timestamp()
  where id = p_attachment_id and status = 'quarantined';
  if not found then raise exception 'Attachment is not awaiting scan'; end if;
  return (select jsonb_build_object('attachmentId', id, 'status', status, 'scanCode', scan_code) from public.support_attachments where id = p_attachment_id);
end;
$$;

revoke all on function public.support_prepare_attachment(uuid, uuid, text, text, text, bigint, timestamptz) from public, anon;
revoke all on function public.support_prepare_guest_attachment(uuid, uuid, text, text, text, bigint, timestamptz, text) from public, anon, authenticated;
revoke all on function public.support_finalize_attachment(uuid, bigint, text) from public, anon, authenticated;
create or replace function public.support_attach_attachments(
  p_conversation_id uuid,
  p_message_id uuid,
  p_attachment_ids uuid[]
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := auth.uid();
  requested_count integer := coalesce(cardinality(p_attachment_ids), 0);
  attached_count integer;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.support_messages m
    where m.id = p_message_id and m.conversation_id = p_conversation_id
      and (m.sender_user_id = actor_id or public.is_support_operator())
  ) then raise exception 'Support message access required'; end if;
  if requested_count = 0 then return jsonb_build_object('attached', 0); end if;

  update public.support_attachments
  set message_id = p_message_id, updated_at = clock_timestamp()
  where id = any(p_attachment_ids)
    and conversation_id = p_conversation_id
    and message_id is null
    and uploader_user_id = actor_id
    and status in ('quarantined', 'clean');

  select count(*) into attached_count
  from public.support_attachments
  where id = any(p_attachment_ids)
    and conversation_id = p_conversation_id
    and message_id = p_message_id;
  if attached_count <> requested_count then raise exception 'Attachment ownership or scan state changed'; end if;
  return jsonb_build_object('attached', attached_count);
end;
$$;

create or replace function public.support_attach_guest_attachments(
  p_conversation_id uuid,
  p_message_id uuid,
  p_attachment_ids uuid[],
  p_token_hash text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  guest_id uuid;
  requested_count integer := coalesce(cardinality(p_attachment_ids), 0);
  attached_count integer;
begin
  select s.id into guest_id
  from public.support_guest_sessions s
  join public.support_conversations c on c.guest_session_id = s.id
  where c.id = p_conversation_id and s.token_hash = btrim(p_token_hash)
    and s.revoked_at is null and s.expires_at > clock_timestamp();
  if guest_id is null then raise exception 'Support session required'; end if;
  if not exists (
    select 1 from public.support_messages m
    where m.id = p_message_id and m.conversation_id = p_conversation_id and m.sender_type = 'guest' and m.sender_user_id is null
  ) then raise exception 'Support message access required'; end if;
  if requested_count = 0 then return jsonb_build_object('attached', 0); end if;

  update public.support_attachments
  set message_id = p_message_id, updated_at = clock_timestamp()
  where id = any(p_attachment_ids)
    and conversation_id = p_conversation_id
    and message_id is null
    and guest_session_id = guest_id
    and status in ('quarantined', 'clean');

  select count(*) into attached_count
  from public.support_attachments
  where id = any(p_attachment_ids)
    and conversation_id = p_conversation_id
    and message_id = p_message_id;
  if attached_count <> requested_count then raise exception 'Attachment ownership or scan state changed'; end if;
  return jsonb_build_object('attached', attached_count);
end;
$$;

create or replace function public.support_send_message_with_attachments(
  p_conversation_id uuid,
  p_body text,
  p_client_message_id text,
  p_reply_to_message_id uuid,
  p_attachment_ids uuid[]
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  response jsonb;
begin
  response := public.support_send_message(p_conversation_id, p_body, p_client_message_id, p_reply_to_message_id);
  perform public.support_attach_attachments(p_conversation_id, (response->>'messageId')::uuid, p_attachment_ids);
  return response;
end;
$$;

create or replace function public.support_guest_send_message_with_attachments(
  p_conversation_id uuid,
  p_body text,
  p_client_message_id text,
  p_token_hash text,
  p_reply_to_message_id uuid,
  p_attachment_ids uuid[]
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  response jsonb;
begin
  response := public.support_guest_send_message(p_conversation_id, p_body, p_client_message_id, p_token_hash, p_reply_to_message_id);
  perform public.support_attach_guest_attachments(p_conversation_id, (response->>'messageId')::uuid, p_attachment_ids, p_token_hash);
  return response;
end;
$$;

revoke all on function public.support_mark_attachment_scan(uuid, text, text) from public, anon, authenticated;
revoke all on function public.support_attach_attachments(uuid, uuid, uuid[]) from public, anon;
revoke all on function public.support_attach_guest_attachments(uuid, uuid, uuid[], text) from public, anon, authenticated;
revoke all on function public.support_send_message_with_attachments(uuid, text, text, uuid, uuid[]) from public, anon;
revoke all on function public.support_guest_send_message_with_attachments(uuid, text, text, text, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.support_prepare_attachment(uuid, uuid, text, text, text, bigint, timestamptz) to authenticated;
grant execute on function public.support_prepare_guest_attachment(uuid, uuid, text, text, text, bigint, timestamptz, text) to service_role;
grant execute on function public.support_finalize_attachment(uuid, bigint, text) to service_role;
grant execute on function public.support_mark_attachment_scan(uuid, text, text) to service_role;
grant execute on function public.support_attach_attachments(uuid, uuid, uuid[]) to authenticated;
grant execute on function public.support_attach_guest_attachments(uuid, uuid, uuid[], text) to service_role;
grant execute on function public.support_send_message_with_attachments(uuid, text, text, uuid, uuid[]) to authenticated;
grant execute on function public.support_guest_send_message_with_attachments(uuid, text, text, text, uuid, uuid[]) to service_role;

commit;
