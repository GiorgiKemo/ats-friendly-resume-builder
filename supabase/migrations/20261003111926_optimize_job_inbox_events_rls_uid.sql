-- Keep inbox-event ownership policies equivalent while evaluating the request
-- identity once per statement instead of once for every candidate row.
ALTER POLICY "Users can view their own inbox events"
  ON public.job_inbox_events
  USING ((SELECT auth.uid()) = user_id);

ALTER POLICY "Users can update their own inbox events"
  ON public.job_inbox_events
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

ALTER POLICY "Users can delete their own inbox events"
  ON public.job_inbox_events
  USING ((SELECT auth.uid()) = user_id);
