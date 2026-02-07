-- Optimized Schema for ATS-Friendly Resume Builder
-- Production-ready version with only necessary components

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- TABLES
-- =============================================

-- Create users table (profiles for authenticated users)
CREATE TABLE IF NOT EXISTS users (
  id UUID REFERENCES auth.users NOT NULL PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  is_premium BOOLEAN DEFAULT false,
  premium_until TIMESTAMP WITH TIME ZONE,
  premium_plan TEXT,
  premium_updated_at TIMESTAMP WITH TIME ZONE,
  stripe_customer_id TEXT,
  ai_generations_used INTEGER DEFAULT 0,
  ai_generations_limit INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create resumes table
CREATE TABLE IF NOT EXISTS resumes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  title TEXT DEFAULT 'Untitled Resume',
  description TEXT DEFAULT '',
  selected_template TEXT DEFAULT 'basic',
  selected_font TEXT DEFAULT 'Arial',
  is_public BOOLEAN DEFAULT false,
  last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create resume_content table
CREATE TABLE IF NOT EXISTS resume_content (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  resume_id UUID REFERENCES resumes(id) ON DELETE CASCADE NOT NULL,
  personal_info JSONB DEFAULT '{}'::JSONB,
  work_experience JSONB DEFAULT '[]'::JSONB,
  education JSONB DEFAULT '[]'::JSONB,
  skills JSONB DEFAULT '[]'::JSONB,
  certifications JSONB DEFAULT '[]'::JSONB,
  projects JSONB DEFAULT '[]'::JSONB,
  additional_sections JSONB DEFAULT '[]'::JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create templates table
CREATE TABLE IF NOT EXISTS templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  preview_image_url TEXT,
  is_premium BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create subscription_plans table
CREATE TABLE IF NOT EXISTS subscription_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price_monthly INTEGER NOT NULL,
  price_yearly INTEGER,
  features JSONB DEFAULT '[]'::JSONB,
  ai_generations_limit INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create user_profiles table to store user profile information
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  personal JSONB DEFAULT '{}'::JSONB,
  work_experience JSONB DEFAULT '[]'::JSONB,
  education JSONB DEFAULT '[]'::JSONB,
  skills JSONB DEFAULT '[]'::JSONB,
  certifications JSONB DEFAULT '[]'::JSONB,
  projects JSONB DEFAULT '[]'::JSONB,
  languages JSONB DEFAULT '[]'::JSONB,
  interests JSONB DEFAULT '[]'::JSONB,
  reference_list JSONB DEFAULT '[]'::JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create ai_generations table to track AI-generated content (for future use)
CREATE TABLE IF NOT EXISTS ai_generations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  resume_id UUID REFERENCES resumes(id) ON DELETE CASCADE,
  prompt TEXT,
  result JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- =============================================
-- VIEWS
-- =============================================

-- Create user_resumes view
CREATE OR REPLACE VIEW user_resumes AS
SELECT
  r.id,
  r.user_id,
  r.title,
  r.description,
  r.selected_template,
  r.selected_font,
  r.is_public,
  r.created_at,
  r.updated_at,
  r.last_accessed_at,
  u.email,
  u.full_name,
  rc.personal_info,
  rc.work_experience,
  rc.education,
  rc.skills,
  rc.certifications,
  rc.projects,
  rc.additional_sections
FROM
  resumes r
JOIN
  users u ON r.user_id = u.id
LEFT JOIN
  resume_content rc ON r.id = rc.resume_id;

-- =============================================
-- FUNCTIONS
-- =============================================

-- Function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_full_name TEXT;
  v_avatar_url TEXT;
BEGIN
  RAISE NOTICE '[handle_new_user] Triggered for new auth.users.id: %, email: %', NEW.id, NEW.email;
  RAISE NOTICE '[handle_new_user] Raw user meta data: %', NEW.raw_user_meta_data;

  v_full_name := NEW.raw_user_meta_data->>'full_name';
  v_avatar_url := NEW.raw_user_meta_data->>'avatar_url';

  RAISE NOTICE '[handle_new_user] Parsed full_name: "%", avatar_url: "%"', v_full_name, v_avatar_url;

  BEGIN
    INSERT INTO public.users (id, email, full_name, avatar_url, is_premium, ai_generations_limit)
    VALUES (NEW.id, NEW.email, v_full_name, v_avatar_url, false, 0);
    RAISE NOTICE '[handle_new_user] INSERT into public.users successful for ID: %', NEW.id;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING '[handle_new_user] ERROR during INSERT into public.users for ID % (Email: %): % - %', NEW.id, NEW.email, SQLSTATE, SQLERRM;
      -- Depending on desired behavior, you might want to re-raise the error
      -- to ensure the calling transaction (the user signup) also fails clearly.
      -- For debugging, just logging the warning might be enough initially.
      -- RAISE;
  END;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public; -- Explicitly set search_path for security

-- Function to get a resume with its content
CREATE OR REPLACE FUNCTION get_resume_with_content(p_resume_id uuid)
RETURNS TABLE(
  id uuid,
  user_id uuid,
  title text,
  description text,
  selected_template text,
  selected_font text,
  is_public boolean,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  last_accessed_at timestamp with time zone,
  personal_info jsonb,
  work_experience jsonb,
  education jsonb,
  skills jsonb,
  certifications jsonb,
  projects jsonb,
  additional_sections jsonb
) AS $$
BEGIN
  -- Update last_accessed_at timestamp
  UPDATE resumes
  SET last_accessed_at = NOW()
  WHERE resumes.id = p_resume_id;

  -- Return resume with content
  RETURN QUERY
  SELECT
    r.id,
    r.user_id,
    r.title,
    r.description,
    r.selected_template,
    r.selected_font,
    r.is_public,
    r.created_at,
    r.updated_at,
    r.last_accessed_at,
    rc.personal_info,
    rc.work_experience,
    rc.education,
    rc.skills,
    rc.certifications,
    rc.projects,
    rc.additional_sections
  FROM resumes r
  JOIN resume_content rc ON r.id = rc.resume_id
  WHERE r.id = p_resume_id
  AND r.user_id = auth.uid(); -- Add security check to ensure users can only access their own resumes
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to save a resume (create or update)
-- Drop the existing function first to avoid parameter default issues
DROP FUNCTION IF EXISTS save_resume(uuid,text,text,text,text,boolean,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,uuid);

CREATE OR REPLACE FUNCTION save_resume(
  p_user_id UUID,
  p_title TEXT,
  p_description TEXT,
  p_selected_template TEXT,
  p_selected_font TEXT,
  p_is_public BOOLEAN,
  p_personal_info JSONB,
  p_work_experience JSONB,
  p_education JSONB,
  p_skills JSONB,
  p_certifications JSONB,
  p_projects JSONB,
  p_additional_sections JSONB,
  p_resume_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_resume_id UUID;
BEGIN
  -- Security check: ensure the user can only save their own resumes
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'You can only save your own resumes';
  END IF;

  -- If resume_id is provided, update the existing resume
  IF p_resume_id IS NOT NULL THEN
    -- Update the resume metadata
    UPDATE resumes
    SET
      title = p_title,
      description = p_description,
      selected_template = p_selected_template,
      selected_font = p_selected_font,
      is_public = p_is_public,
      updated_at = now(),
      last_accessed_at = now()
    WHERE
      id = p_resume_id
      AND user_id = p_user_id;

    -- Check if the resume was found and updated
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Resume not found or you do not have permission to update it';
    END IF;

    -- Update the resume content
    UPDATE resume_content
    SET
      personal_info = p_personal_info,
      work_experience = p_work_experience,
      education = p_education,
      skills = p_skills,
      certifications = p_certifications,
      projects = p_projects,
      additional_sections = p_additional_sections,
      updated_at = now()
    WHERE
      resume_id = p_resume_id;

    v_resume_id := p_resume_id;
  ELSE
    -- Create a new resume
    INSERT INTO resumes (
      user_id,
      title,
      description,
      selected_template,
      selected_font,
      is_public
    ) VALUES (
      p_user_id,
      p_title,
      p_description,
      p_selected_template,
      p_selected_font,
      p_is_public
    )
    RETURNING id INTO v_resume_id;

    -- Create the resume content
    INSERT INTO resume_content (
      resume_id,
      personal_info,
      work_experience,
      education,
      skills,
      certifications,
      projects,
      additional_sections
    ) VALUES (
      v_resume_id,
      p_personal_info,
      p_work_experience,
      p_education,
      p_skills,
      p_certifications,
      p_projects,
      p_additional_sections
    );
  END IF;

  RETURN v_resume_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to delete a resume
CREATE OR REPLACE FUNCTION delete_resume(
  p_resume_id UUID,
  p_user_id UUID
) RETURNS BOOLEAN AS $$
BEGIN
  -- Security check: ensure the user can only delete their own resumes
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'You can only delete your own resumes';
  END IF;

  -- First, check if the resume exists and belongs to the user
  IF NOT EXISTS (SELECT 1 FROM resumes WHERE id = p_resume_id AND user_id = p_user_id) THEN
    RAISE EXCEPTION 'Resume not found or you do not have permission to delete it';
  END IF;

  -- Delete the resume content first (due to foreign key constraint)
  DELETE FROM resume_content
  WHERE resume_id = p_resume_id;

  -- Then delete the resume
  DELETE FROM resumes
  WHERE id = p_resume_id AND user_id = p_user_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to save user profile
CREATE OR REPLACE FUNCTION save_user_profile(
  p_user_id UUID,
  p_personal JSONB,
  p_work_experience JSONB,
  p_education JSONB,
  p_skills JSONB,
  p_certifications JSONB,
  p_projects JSONB,
  p_languages JSONB,
  p_interests JSONB,
  p_reference_list JSONB
) RETURNS UUID AS $$
DECLARE
  v_profile_id UUID;
BEGIN
  -- Security check: ensure the user can only save their own profile
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'You can only save your own profile';
  END IF;

  -- Check if the user already has a profile
  SELECT id INTO v_profile_id FROM user_profiles WHERE user_id = p_user_id;

  -- If the user has a profile, update it
  IF v_profile_id IS NOT NULL THEN
    UPDATE user_profiles
    SET
      personal = p_personal,
      work_experience = p_work_experience,
      education = p_education,
      skills = p_skills,
      certifications = p_certifications,
      projects = p_projects,
      languages = p_languages,
      interests = p_interests,
      reference_list = p_reference_list,
      updated_at = now()
    WHERE
      id = v_profile_id;
  ELSE
    -- Create a new profile
    INSERT INTO user_profiles (
      user_id,
      personal,
      work_experience,
      education,
      skills,
      certifications,
      projects,
      languages,
      interests,
      reference_list
    ) VALUES (
      p_user_id,
      p_personal,
      p_work_experience,
      p_education,
      p_skills,
      p_certifications,
      p_projects,
      p_languages,
      p_interests,
      p_reference_list
    )
    RETURNING id INTO v_profile_id;
  END IF;

  RETURN v_profile_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user profile
CREATE OR REPLACE FUNCTION get_user_profile(
  p_user_id UUID
) RETURNS TABLE (
  id UUID,
  user_id UUID,
  personal JSONB,
  work_experience JSONB,
  education JSONB,
  skills JSONB,
  certifications JSONB,
  projects JSONB,
  languages JSONB,
  interests JSONB,
  reference_list JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  -- Security check: ensure the user can only get their own profile
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'You can only access your own profile';
  END IF;

  RETURN QUERY
  SELECT
    up.id,
    up.user_id,
    up.personal,
    up.work_experience,
    up.education,
    up.skills,
    up.certifications,
    up.projects,
    up.languages,
    up.interests,
    up.reference_list,
    up.created_at,
    up.updated_at
  FROM
    user_profiles up
  WHERE
    up.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check premium status
CREATE OR REPLACE FUNCTION check_premium_status()
RETURNS BOOLEAN AS $$
DECLARE
  is_premium_user BOOLEAN;
  premium_expiry TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Get the current user's premium status and expiry date
  SELECT
    is_premium,
    premium_until
  INTO
    is_premium_user,
    premium_expiry
  FROM users
  WHERE id = auth.uid();

  -- Check if user has premium and it hasn't expired
  IF is_premium_user AND (premium_expiry IS NULL OR premium_expiry > NOW()) THEN
    RETURN true;
  ELSE
    -- If premium has expired, update the status
    IF is_premium_user AND premium_expiry <= NOW() THEN
      UPDATE users SET
        is_premium = false
      WHERE id = auth.uid();
    END IF;

    RETURN false;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to track AI generation usage
CREATE OR REPLACE FUNCTION track_ai_generation_secure()
RETURNS BOOLEAN AS $$
DECLARE
  generations_used INTEGER;
  generations_limit INTEGER;
  is_premium_active BOOLEAN;
BEGIN
  -- First check if user has premium
  is_premium_active := check_premium_status();

  IF NOT is_premium_active THEN
    RETURN false;
  END IF;

  -- Get current usage and limit
  SELECT
    ai_generations_used,
    ai_generations_limit
  INTO
    generations_used,
    generations_limit
  FROM users
  WHERE id = auth.uid();

  -- Check if user has reached their limit
  IF generations_used >= generations_limit THEN
    RETURN false;
  END IF;

  -- Increment usage
  UPDATE users
  SET ai_generations_used = ai_generations_used + 1
  WHERE id = auth.uid();

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get remaining AI generations
CREATE OR REPLACE FUNCTION get_remaining_ai_generations()
RETURNS INTEGER AS $$
DECLARE
  generations_used INTEGER;
  generations_limit INTEGER;
  is_premium_active BOOLEAN;
BEGIN
  -- First check if user has premium
  is_premium_active := check_premium_status();

  IF NOT is_premium_active THEN
    RETURN 0;
  END IF;

  -- Get current usage and limit
  SELECT
    ai_generations_used,
    ai_generations_limit
  INTO
    generations_used,
    generations_limit
  FROM users
  WHERE id = auth.uid();

  -- Return remaining generations
  RETURN GREATEST(0, generations_limit - generations_used);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if a resume exists
CREATE OR REPLACE FUNCTION check_resume_exists(p_resume_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  resume_exists BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM resumes WHERE id = p_resume_id
  ) INTO resume_exists;

  RETURN resume_exists;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to handle user updates
CREATE OR REPLACE FUNCTION handle_user_update()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.users
  SET
    email = NEW.email,
    updated_at = now()
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update the updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- TRIGGERS
-- =============================================

-- Create trigger for new user creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Create trigger for user updates
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_user_update();

-- Create triggers for updated_at columns
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_resumes_updated_at ON resumes;
CREATE TRIGGER update_resumes_updated_at
  BEFORE UPDATE ON resumes
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_resume_content_updated_at ON resume_content;
CREATE TRIGGER update_resume_content_updated_at
  BEFORE UPDATE ON resume_content
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_templates_updated_at ON templates;
CREATE TRIGGER update_templates_updated_at
  BEFORE UPDATE ON templates
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE resumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE resume_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_generations ENABLE ROW LEVEL SECURITY;

-- Users can only read their own profile
DROP POLICY IF EXISTS "Users can view own profile" ON users;
CREATE POLICY "Users can view own profile"
  ON users FOR SELECT
  USING (auth.uid() = id);

-- Users can only update their own profile
DROP POLICY IF EXISTS "Users can update own profile" ON users;
CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  USING (auth.uid() = id);

-- Users can only read their own resumes
DROP POLICY IF EXISTS "Users can view own resumes" ON resumes;
CREATE POLICY "Users can view own resumes"
  ON resumes FOR SELECT
  USING (auth.uid() = user_id);

-- Users can only create resumes for themselves
DROP POLICY IF EXISTS "Users can create own resumes" ON resumes;
CREATE POLICY "Users can create own resumes"
  ON resumes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can only update their own resumes
DROP POLICY IF EXISTS "Users can update own resumes" ON resumes;
CREATE POLICY "Users can update own resumes"
  ON resumes FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can only delete their own resumes
DROP POLICY IF EXISTS "Users can delete own resumes" ON resumes;
CREATE POLICY "Users can delete own resumes"
  ON resumes FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only read their own resume content
DROP POLICY IF EXISTS "Users can view own resume content" ON resume_content;
CREATE POLICY "Users can view own resume content"
  ON resume_content FOR SELECT
  USING (
    auth.uid() = (SELECT user_id FROM resumes WHERE id = resume_id)
  );

-- Users can only create resume content for their own resumes
DROP POLICY IF EXISTS "Users can create own resume content" ON resume_content;
CREATE POLICY "Users can create own resume content"
  ON resume_content FOR INSERT
  WITH CHECK (
    auth.uid() = (SELECT user_id FROM resumes WHERE id = resume_id)
  );

-- Users can only update their own resume content
DROP POLICY IF EXISTS "Users can update own resume content" ON resume_content;
CREATE POLICY "Users can update own resume content"
  ON resume_content FOR UPDATE
  USING (
    auth.uid() = (SELECT user_id FROM resumes WHERE id = resume_id)
  );

-- Users can only delete their own resume content
DROP POLICY IF EXISTS "Users can delete own resume content" ON resume_content;
CREATE POLICY "Users can delete own resume content"
  ON resume_content FOR DELETE
  USING (
    auth.uid() = (SELECT user_id FROM resumes WHERE id = resume_id)
  );

-- Everyone can read subscription plans
DROP POLICY IF EXISTS "Everyone can view subscription plans" ON subscription_plans;
CREATE POLICY "Everyone can view subscription plans"
  ON subscription_plans FOR SELECT
  TO authenticated
  USING (true);

-- Users can only read their own user profile
DROP POLICY IF EXISTS "Users can view own user profile" ON user_profiles;
CREATE POLICY "Users can view own user profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = user_id);

-- Users can only update their own user profile
DROP POLICY IF EXISTS "Users can update own user profile" ON user_profiles;
CREATE POLICY "Users can update own user profile"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can only insert their own user profile
DROP POLICY IF EXISTS "Users can create own user profile" ON user_profiles;
CREATE POLICY "Users can create own user profile"
  ON user_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can only delete their own user profile
DROP POLICY IF EXISTS "Users can delete own user profile" ON user_profiles;
CREATE POLICY "Users can delete own user profile"
  ON user_profiles FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only view their own AI generations
DROP POLICY IF EXISTS "Users can view own AI generations" ON ai_generations;
CREATE POLICY "Users can view own AI generations"
  ON ai_generations FOR SELECT
  USING (auth.uid() = user_id);

-- Users can only create their own AI generations
DROP POLICY IF EXISTS "Users can create own AI generations" ON ai_generations;
CREATE POLICY "Users can create own AI generations"
  ON ai_generations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Everyone can view templates
DROP POLICY IF EXISTS "Everyone can view templates" ON templates;
CREATE POLICY "Everyone can view templates"
  ON templates FOR SELECT
  TO authenticated
  USING (true);

-- =============================================
-- DEFAULT DATA
-- =============================================

-- Insert or update the subscription plans
INSERT INTO subscription_plans (id, name, description, price_monthly, price_yearly, features, ai_generations_limit, is_active)
VALUES
  (
    'free',
    'Free Plan',
    'Perfect for getting started',
    0,
    0,
    '[
      "Create ATS-friendly resumes with clean, single-column layouts",
      "Access to 4 professional templates optimized for ATS systems",
      "Export to PDF and Word formats with proper formatting",
      "Basic resume formatting and styling options",
      "Store up to 3 resumes in your account",
      "Access to ATS best practices guides and resources"
    ]'::JSONB,
    0,
    true
  ),
  (
    'premium',
    'Premium Plan',
    'For serious job seekers',
    999,
    9999,
    '[
      "Everything in Free plan, plus:",
      "AI Resume Generator that creates tailored content based on job descriptions",
      "30 AI resume generations per month with customization options",
      "Advanced formatting options with more templates and fonts",
      "Industry-specific suggestions tailored to your target job sector",
      "Location-aware resume generation that adapts to job and user locations",
      "Unlimited resume storage with easy management",
      "Priority support with faster response times"
    ]'::JSONB,
    30,
    true
  )
ON CONFLICT (id)
DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_monthly = EXCLUDED.price_monthly,
  price_yearly = EXCLUDED.price_yearly,
  features = EXCLUDED.features,
  ai_generations_limit = EXCLUDED.ai_generations_limit,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- Insert default templates
INSERT INTO templates (name, description, preview_image_url, is_premium, is_active)
VALUES
  ('Basic', 'A clean, simple template suitable for most industries', '/templates/basic.png', false, true),
  ('Professional', 'A polished template with a modern look', '/templates/professional.png', false, true),
  ('Executive', 'An elegant template for senior positions', '/templates/executive.png', false, true),
  ('Modern', 'A contemporary design with a creative touch', '/templates/modern.png', false, true),
  ('Premium', 'A premium template with advanced formatting', '/templates/premium.png', true, true)
ON CONFLICT (id)
DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  preview_image_url = EXCLUDED.preview_image_url,
  is_premium = EXCLUDED.is_premium,
  is_active = EXCLUDED.is_active,
  updated_at = now();
