import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import {
  trackSuccessfulLogin,
  trackFailedLogin,
  logEvent,
  EVENT_TYPES,
  SEVERITY
} from '../services/monitoringService';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true); // Explicitly set loading to true at the start of the effect

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
        setLoading(false);

        if (_event === 'SIGNED_OUT') {
          setUser(null);
        } else if (_event === 'TOKEN_REFRESHED') {
          setUser(session?.user ?? null);
        }
      }
    );

    // Cleanup subscription on unmount
    return () => subscription.unsubscribe();
  }, []); // Removed navigate from dependency array as it's not used directly for navigation here

  // Sign up with email and password
  const signUp = async (email, password, fullName = '') => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });

      if (error) {
        // Log signup failure
        await logEvent(
          EVENT_TYPES.AUTH_SIGN_UP_FAILURE,
          `Failed signup attempt for ${email}: ${error.message}`,
          {
            email,
            errorCode: error.code || 'unknown',
            errorMessage: error.message
          },
          SEVERITY.WARNING
        );
        throw error;
      }

      // Log successful signup
      await logEvent(
        EVENT_TYPES.AUTH_SIGN_UP_SUCCESS,
        `New user signed up: ${email}`,
        {
          email,
          userId: data?.user?.id,
          fullName
        },
        SEVERITY.INFO
      );

      // Add contact to Brevo for welcome email automation (fire-and-forget)
      try {
        await supabase.functions.invoke('add-brevo-contact', {
          body: { email, firstName: fullName?.split(' ')[0] || '' },
        });
      } catch {
        // Never block signup due to Brevo issues
      }

      return data;
    } catch (error) {
      console.error('Error signing up:', error.message);
      throw error;
    }
  };

  // Sign in with email and password
  const signIn = async (email, password) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        // Track failed login attempt
        await trackFailedLogin(email, error.message, {
          errorCode: error.code || 'unknown'
        });
        throw error;
      }

      // Track successful login
      if (data?.user) {
        await trackSuccessfulLogin(data.user.id, email);
      }

      return data;
    } catch (error) {
      console.error('Error signing in:', error.message);
      throw error;
    }
  };

  // Resend verification email
  const resendVerificationEmail = async (email) => {
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
      });
      if (error) {
        // Log resend failure
        await logEvent(
          EVENT_TYPES.AUTH_RESEND_VERIFICATION_FAILURE,
          `Failed to resend verification for ${email}: ${error.message}`,
          {
            email,
            errorCode: error.code || 'unknown',
            errorMessage: error.message
          },
          SEVERITY.WARNING
        );
        throw error;
      }
      // Log successful resend
      await logEvent(
        EVENT_TYPES.AUTH_RESEND_VERIFICATION_SUCCESS,
        `Resent verification email to: ${email}`,
        { email },
        SEVERITY.INFO
      );
      return { error: null }; // Indicate success
    } catch (error) {
      console.error('Error resending verification email:', error.message);
      throw error;
    }
  };

  // Sign out
  const signOut = async () => {
    try {
      // Log the sign out event before actually signing out
      // This way we still have the user information
      if (user) {
        await logEvent(
          EVENT_TYPES.AUTH_SIGN_OUT,
          `User signed out: ${user.email}`,
          { userId: user.id, email: user.email },
          SEVERITY.INFO
        );
      }

      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error) {
      console.error('Error signing out:', error.message);
      throw error;
    }
  };

  const value = {
    user,
    loading,
    signUp,
    signIn,
    signOut,
    resendVerificationEmail,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
