-- Keep the new feedback/improvement foreign-key lookups index-backed.
create index if not exists improvement_items_owner_user_idx
  on public.improvement_items(owner_user_id);

create index if not exists improvement_items_created_by_user_idx
  on public.improvement_items(created_by_user_id);

create index if not exists improvement_items_updated_by_user_idx
  on public.improvement_items(updated_by_user_id);
