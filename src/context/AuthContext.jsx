import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import {
  trackSuccessfulLogin,
  trackFailedLogin,
  logEvent,
  EVENT_TYPES,
  SEVERITY
} from '../services/monitoringService';

const AuthContext = createContext();
const DEBUG_AUTH = import.meta.env.DEV && import.meta.env.VITE_DEBUG_AUTH === 'true';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const previousUserRef = useRef(null);

  // Effect to keep previousUserRef.current up-to-date with the user state
  useEffect(() => {
    previousUserRef.current = user;
  }, [user]);

  useEffect(() => {
    setLoading(true); // Explicitly set loading to true at the start of the effect

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const PUser = previousUserRef.current; // Get previous user state
        setUser(session?.user ?? null); // Use ?? for a clearer nullish coalescing
        setLoading(false); // Set loading to false after the first auth event (initial or change)

        // Navigate to dashboard on initial sign-in or after email confirmation
        // Ensure this navigation doesn't interfere with StripeReturnPage's own navigation logic.
        // It might be better to handle post-signin navigation more contextually elsewhere,
        // or add more checks here (e.g., not navigating if on certain paths like /return-from-stripe).
        // This is a small change to trigger a Vercel redeployment.
        if (_event === 'SIGNED_IN' && session?.user && !PUser && !window.location.pathname.includes('/return-from-stripe')) {
          // navigate('/dashboard'); // Temporarily disabled for debugging Stripe redirect
          if (DEBUG_AUTH) {
            console.log('[AuthContext] SIGNED_IN event, user present, no previous user, not on Stripe return. Would navigate to /dashboard. Temporarily disabled.');
          }
        } else if (_event === 'SIGNED_IN' && session?.user && !PUser) {
          if (DEBUG_AUTH) {
            console.log('[AuthContext] SIGNED_IN event, user present, no previous user (possibly on Stripe return or other specific path). Navigation to dashboard deferred/handled elsewhere.');
          }
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

      if (DEBUG_AUTH) {
        console.log('[AuthContext] supabase.auth.signUp response:', { data, error });
      }

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
