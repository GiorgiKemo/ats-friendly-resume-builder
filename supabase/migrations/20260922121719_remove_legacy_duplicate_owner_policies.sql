-- Remove legacy public-role owner policies left behind by the original core
-- schema. The authenticated-only baseline policies provide the same ownership
-- boundary, use cached auth.uid() init plans, and are enforced by restrictive
-- policies on the workspace tables. Keeping both policy generations makes
-- Postgres evaluate redundant permissive branches and triggers advisor noise.

drop policy if exists "Users can create own AI generations" on public.ai_generations;
drop policy if exists "Users can view own AI generations" on public.ai_generations;

drop policy if exists "Users can create own resume content" on public.resume_content;
drop policy if exists "Users can delete own resume content" on public.resume_content;
drop policy if exists "Users can update own resume content" on public.resume_content;
drop policy if exists "Users can view own resume content" on public.resume_content;

drop policy if exists "Users can create own resumes" on public.resumes;
drop policy if exists "Users can delete own resumes" on public.resumes;
drop policy if exists "Users can update own resumes" on public.resumes;
drop policy if exists "Users can view own resumes" on public.resumes;

drop policy if exists "Users can create own user profile" on public.user_profiles;
drop policy if exists "Users can delete own user profile" on public.user_profiles;
drop policy if exists "Users can update own user profile" on public.user_profiles;
drop policy if exists "Users can view own user profile" on public.user_profiles;

-- These duplicate read policies are exact `USING (true)` copies of the
-- authenticated baseline read policies.
drop policy if exists "Everyone can view subscription plans" on public.subscription_plans;
drop policy if exists "Everyone can view templates" on public.templates;
