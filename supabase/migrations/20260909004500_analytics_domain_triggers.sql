begin;

create or replace function public.capture_resume_created_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.analytics_events(event_key, event_name, actor_user_id, properties, occurred_at)
  values (
    'resume:' || new.id::text,
    'resume_created',
    new.user_id,
    '{}'::jsonb,
    coalesce(new.created_at, clock_timestamp())
  )
  on conflict (event_key) do nothing;
  return new;
end;
$$;

drop trigger if exists resumes_capture_created_event on public.resumes;
create trigger resumes_capture_created_event
after insert on public.resumes
for each row execute function public.capture_resume_created_event();

create or replace function public.capture_application_created_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.analytics_events(event_key, event_name, actor_user_id, properties, occurred_at)
  values (
    'application:' || new.id::text,
    'application_created',
    new.user_id,
    '{}'::jsonb,
    coalesce(new.created_at, clock_timestamp())
  )
  on conflict (event_key) do nothing;
  return new;
end;
$$;

drop trigger if exists applications_capture_created_event on public.job_applications;
create trigger applications_capture_created_event
after insert on public.job_applications
for each row execute function public.capture_application_created_event();

revoke all on function public.capture_resume_created_event() from public, anon, authenticated;
revoke all on function public.capture_application_created_event() from public, anon, authenticated;

commit;
