-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create users table (profiles for authenticated users)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  avatar_url TEXT,
  is_premium BOOLEAN DEFAULT false,
  ai_generations_limit INTEGER DEFAULT 0, -- Base limit for non-premium, can be updated
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_full_name TEXT;
  v_avatar_url TEXT;
BEGIN
  -- Extract full_name and avatar_url from raw_user_meta_data if available
  -- Ensure raw_user_meta_data is not null before trying to access its fields
  IF NEW.raw_user_meta_data IS NOT NULL THEN
    v_full_name := NEW.raw_user_meta_data->>'full_name';
    v_avatar_url := NEW.raw_user_meta_data->>'avatar_url';
  ELSE
    v_full_name := NULL;
    v_avatar_url := NULL;
  END IF;

  INSERT INTO public.users (id, email, full_name, avatar_url, is_premium, ai_generations_limit)
  VALUES (NEW.id, NEW.email, v_full_name, v_avatar_url, false, 0); -- Default values for new users
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- SET search_path = public; -- Not needed here as tables are schema-qualified or default to public

-- Create trigger for new user creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Function to update the updated_at column (generic)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for users table updated_at
DROP TRIGGER IF EXISTS update_users_updated_at ON public.users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

-- Create resumes table
CREATE TABLE IF NOT EXISTS public.resumes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT DEFAULT 'Untitled Resume',
  description TEXT DEFAULT '',
  selected_template TEXT DEFAULT 'basic',
  selected_font TEXT DEFAULT 'Arial',
  is_public BOOLEAN DEFAULT false,
  last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Trigger for resumes table updated_at
DROP TRIGGER IF EXISTS update_resumes_updated_at ON public.resumes;
CREATE TRIGGER update_resumes_updated_at
  BEFORE UPDATE ON public.resumes
  FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

-- Create resume_content table
CREATE TABLE IF NOT EXISTS public.resume_content (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  resume_id UUID REFERENCES public.resumes(id) ON DELETE CASCADE NOT NULL,
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

-- Trigger for resume_content table updated_at
DROP TRIGGER IF EXISTS update_resume_content_updated_at ON public.resume_content;
CREATE TRIGGER update_resume_content_updated_at
  BEFORE UPDATE ON public.resume_content
  FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();
