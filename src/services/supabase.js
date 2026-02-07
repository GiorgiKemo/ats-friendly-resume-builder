import { createClient } from '@supabase/supabase-js';

// Initialize the Supabase client
const isDev = import.meta.env.DEV;
const supabaseUrl = isDev
  ? (import.meta.env.VITE_SUPABASE_URL_DEV || import.meta.env.VITE_SUPABASE_URL)
  : import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = isDev
  ? (import.meta.env.VITE_SUPABASE_ANON_KEY_DEV || import.meta.env.VITE_SUPABASE_ANON_KEY)
  : import.meta.env.VITE_SUPABASE_ANON_KEY;

// Validate environment variables
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables. Check your .env file.');

  // In development, provide fallback values to prevent crashes
  if (isDev) {
    // console.warn('Using fallback values for development only.'); // Removed misleading warning
  } else {
    // In production, throw an error to prevent deployment with missing variables
    throw new Error('Supabase environment variables are required for production.');
  }
}

// Create and export the Supabase client with options
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false
  }
});

// No error tracking - errors will only be logged to console
