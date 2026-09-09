-- Support operators can open any inbox conversation before taking ownership.
-- Marking that conversation read must follow the same access boundary as the
-- operator read RPC; otherwise the inbox emits a misleading 404 on selection.
create or replace function public.support_mark_read(
  p_conversation_id uuid,
  p_last_read_sequence bigint
) returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := auth.uid();
  next_sequence bigint;
begin
  if actor_id is null or p_last_read_sequence is null or p_last_read_sequence < 0 then raise exception 'Invalid read cursor'; end if;
  if not exists (
    select 1 from public.support_conversations c
    where c.id = p_conversation_id and (
      public.is_support_operator() or
      c.customer_user_id = actor_id or c.assigned_agent_user_id = actor_id or exists (
        select 1 from public.support_participants p where p.conversation_id = c.id and p.user_id = actor_id and p.revoked_at is null
      )
    )
  ) then raise exception 'Support conversation not found'; end if;

  insert into public.support_read_cursors(conversation_id, user_id, last_read_sequence)
  values (p_conversation_id, actor_id, p_last_read_sequence)
  on conflict (conversation_id, user_id) do update
  set last_read_sequence = greatest(public.support_read_cursors.last_read_sequence, excluded.last_read_sequence), updated_at = clock_timestamp()
  returning last_read_sequence into next_sequence;
  return next_sequence;
end;
$$;

revoke all on function public.support_mark_read(uuid, bigint) from public, anon;
grant execute on function public.support_mark_read(uuid, bigint) to authenticated;
