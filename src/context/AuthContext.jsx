import { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { supabase } from '../services/supabase';
import {
  trackSuccessfulLogin,
  trackFailedLogin,
  logEvent,
  EVENT_TYPES,
  SEVERITY
} from '../services/monitoringService';

const AuthContext = createContext();

// Telemetry and an optional extension must never delay an authentication result.
const runInBackground = (task) => {
  void Promise.resolve().then(task).catch(() => {});
};

const clearExtensionSession = () => runInBackground(async () => {
  const { syncBrowserAgentProfile, clearBrowserAgentQueue } = await import('../services/browserAgentService');
  await Promise.allSettled([syncBrowserAgentProfile(null), clearBrowserAgentQueue()]);
});

const isAdminUser = (candidate) => {
  const metadata = candidate?.app_metadata || {};
  return metadata.is_admin === true || metadata.role === 'admin' || metadata.role === 'owner';
};

const normalizeAuthEmail = (value) => typeof value === 'string' ? value.trim() : '';

const isExpectedSignInError = (error) => {
  const message = error?.message || '';
  return message.includes('Invalid login credentials') || message.includes('Email not confirmed');
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const newUser = session?.user ?? null;

        if (_event === 'SIGNED_OUT') {
          setUser(null);
          clearExtensionSession();
        } else {
          // For ALL auth events (INITIAL_SESSION, TOKEN_REFRESHED, SIGNED_IN, USER_UPDATED)
          // only update the user reference if the user actually changed.
          // This prevents cascading re-renders and data re-fetches when
          // returning to the tab triggers token refresh or session restore.
          setUser((prev) => {
            if (!prev && !newUser) return prev;       // both null — no change
            if (!prev || !newUser) return newUser;     // signed in or out
            const prevAdminKey = JSON.stringify(prev.app_metadata || {});
            const nextAdminKey = JSON.stringify(newUser.app_metadata || {});
            if (prev.id === newUser.id && prev.email === newUser.email && prevAdminKey === nextAdminKey) return prev; // same user
            return newUser;                            // different user
          });
        }

        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []); // Removed navigate from dependency array as it's not used directly for navigation here

  // Sign up with email and password
  const signUp = async (email, password, fullName = '') => {
    const normalizedEmail = normalizeAuthEmail(email);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });

      if (error) {
        // Log signup failure
        runInBackground(() => logEvent(
          EVENT_TYPES.AUTH_SIGN_UP_FAILURE,
          `Failed signup attempt for ${normalizedEmail}: ${error.message}`,
          {
            email: normalizedEmail,
            errorCode: error.code || 'unknown',
            errorMessage: error.message
          },
          SEVERITY.WARNING
        ));
        throw error;
      }

      // Log successful signup
      runInBackground(() => logEvent(
        EVENT_TYPES.AUTH_SIGN_UP_SUCCESS,
        `New user signed up: ${normalizedEmail}`,
        {
          email: normalizedEmail,
          userId: data?.user?.id,
          fullName
        },
        SEVERITY.INFO
      ));

      return data;
    } catch (error) {
      console.error('Error signing up:', error.message);
      throw error;
    }
  };

  // Sign in with email and password
  const signIn = async (email, password) => {
    const normalizedEmail = normalizeAuthEmail(email);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) {
        // Track failed login attempt
        runInBackground(() => trackFailedLogin(normalizedEmail, error.message, {
          errorCode: error.code || 'unknown'
        }));
        throw error;
      }

      // Track successful login
      if (data?.user) {
        runInBackground(() => trackSuccessfulLogin(data.user.id, normalizedEmail));
      }

      return data;
    } catch (error) {
      if (!isExpectedSignInError(error)) {
        console.error('Error signing in:', error.message);
      }
      throw error;
    }
  };

  // Resend verification email
  const resendVerificationEmail = async (email) => {
    const normalizedEmail = normalizeAuthEmail(email);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: normalizedEmail,
      });
      if (error) {
        // Log resend failure
        runInBackground(() => logEvent(
          EVENT_TYPES.AUTH_RESEND_VERIFICATION_FAILURE,
          `Failed to resend verification for ${normalizedEmail}: ${error.message}`,
          {
            email: normalizedEmail,
            errorCode: error.code || 'unknown',
            errorMessage: error.message
          },
          SEVERITY.WARNING
        ));
        throw error;
      }
      // Log successful resend
      runInBackground(() => logEvent(
        EVENT_TYPES.AUTH_RESEND_VERIFICATION_SUCCESS,
        `Resent verification email to: ${normalizedEmail}`,
        { email: normalizedEmail },
        SEVERITY.INFO
      ));
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
        runInBackground(() => logEvent(
          EVENT_TYPES.AUTH_SIGN_OUT,
          `User signed out: ${user.email}`,
          { userId: user.id, email: user.email },
          SEVERITY.INFO
        ));
      }

      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error) {
      console.error('Error signing out:', error.message);
      throw error;
    }
  };

  const isAdmin = useMemo(() => isAdminUser(user), [user]);

  const value = {
    user,
    loading,
    isAdmin,
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
