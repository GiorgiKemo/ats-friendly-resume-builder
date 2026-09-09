-- Cache the immutable JWT user id once per statement instead of evaluating
-- auth.uid() for every row touched by these high-traffic workspace tables.

alter policy "Users can view their own applications"
  on public.job_applications
  using ((select auth.uid()) = user_id);
alter policy "Users can insert their own applications"
  on public.job_applications
  with check ((select auth.uid()) = user_id);
alter policy "Users can update their own applications"
  on public.job_applications
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy "Users can delete their own applications"
  on public.job_applications
  using ((select auth.uid()) = user_id);

alter policy "Users can view their own preferences"
  on public.job_preferences
  using ((select auth.uid()) = user_id);
alter policy "Users can insert their own preferences"
  on public.job_preferences
  with check ((select auth.uid()) = user_id);
alter policy "Users can update their own preferences"
  on public.job_preferences
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy "Users can delete their own preferences"
  on public.job_preferences
  using ((select auth.uid()) = user_id);

alter policy "Users can view their own auto-apply jobs"
  on public.auto_apply_jobs
  using ((select auth.uid()) = user_id);
alter policy "Users can insert their own auto-apply jobs"
  on public.auto_apply_jobs
  with check ((select auth.uid()) = user_id);
alter policy "Users can update their own auto-apply jobs"
  on public.auto_apply_jobs
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy "Users can delete their own auto-apply jobs"
  on public.auto_apply_jobs
  using ((select auth.uid()) = user_id);

alter policy "Users can view their own runs"
  on public.auto_apply_runs
  using ((select auth.uid()) = user_id);
alter policy "Users can insert their own runs"
  on public.auto_apply_runs
  with check ((select auth.uid()) = user_id);
alter policy "Users can update their own runs"
  on public.auto_apply_runs
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
