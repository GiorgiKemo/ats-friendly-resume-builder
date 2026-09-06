-- Minimal synthetic Supabase-compatible fixture for the budget migration.
-- This intentionally does not stand in for the full application schema replay.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
GRANT USAGE ON SCHEMA auth TO authenticated, service_role;
CREATE TABLE public.users (
  id uuid PRIMARY KEY, email text UNIQUE, is_premium boolean DEFAULT false,
  premium_until timestamptz, premium_updated_at timestamptz, premium_plan text,
  stripe_customer_id text, ai_generations_limit integer DEFAULT 30,
  ai_generations_used integer DEFAULT 0, created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.job_preferences (
  id uuid DEFAULT gen_random_uuid(), user_id uuid UNIQUE REFERENCES public.users(id),
  is_active boolean DEFAULT true, daily_limit integer DEFAULT 10
);
CREATE TABLE public.auto_apply_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES public.users(id),
  status text DEFAULT 'running', created_at timestamptz DEFAULT now(), completed_at timestamptz,
  error_message text
);
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY self_read ON public.users FOR SELECT TO authenticated USING (id = auth.uid());
GRANT SELECT ON public.users TO authenticated;
