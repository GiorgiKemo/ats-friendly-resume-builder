import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import toast from 'react-hot-toast';
import { extractRecoverySessionFromUrl } from '../utils/authRecovery';

const UpdatePassword = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('checking');
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) {
        return;
      }

      if ((event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN' || event === 'USER_UPDATED') && session) {
        setStatus('ready');
      }
    });

    const bootstrapRecoverySession = async () => {
      const recoverySession = extractRecoverySessionFromUrl();

      if (recoverySession) {
        const { error } = await supabase.auth.setSession({
          access_token: recoverySession.accessToken,
          refresh_token: recoverySession.refreshToken,
        });

        if (error) {
          console.error('Failed to restore recovery session:', error);
          if (active) {
            setStatus('invalid');
          }
          return;
        }
      }

      const { data: { session } } = await supabase.auth.getSession();

      if (!active) {
        return;
      }

      if (session) {
        setStatus('ready');
      } else {
        setStatus('invalid');
      }
    };

    bootstrapRecoverySession();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }

    if (password.length < 6) {
      toast.error('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        toast.error(error.message);
      } else {
        toast.success('Password updated successfully!');
        await supabase.auth.signOut();
        navigate('/signin', { replace: true });
      }
    } catch {
      toast.error('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (status === 'checking') {
    return (
      <div className="max-w-md mx-auto p-6 mt-12 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-md text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p className="text-gray-600 dark:text-slate-300">Verifying your reset link...</p>
      </div>
    );
  }

  if (status === 'invalid') {
    return (
      <div className="max-w-md mx-auto p-6 mt-12 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-md text-center">
        <h2 className="text-2xl font-semibold mb-4 text-slate-900 dark:text-slate-100">Reset Link Invalid</h2>
        <p className="text-gray-600 dark:text-slate-300 mb-6">
          This password reset link is missing required recovery details or has already expired.
        </p>
        <div className="flex flex-col gap-3">
          <Button onClick={() => navigate('/forgot-password')}>Request a New Reset Link</Button>
          <Button variant="outline" onClick={() => navigate('/signin')}>
            Back to Sign In
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto p-6 mt-12 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-md">
      <h2 className="text-2xl font-semibold mb-4 text-slate-900 dark:text-slate-100">Set New Password</h2>
      <p className="text-gray-600 dark:text-slate-300 mb-6 text-sm">
        Enter your new password below.
      </p>
      <form onSubmit={handleSubmit}>
        <Input
          label="New Password"
          type="password"
          id="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <div className="mt-4">
          <Input
            label="Confirm Password"
            type="password"
            id="confirmPassword"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </div>
        <Button type="submit" disabled={loading} className="w-full mt-6">
          {loading ? 'Updating...' : 'Update Password'}
        </Button>
      </form>
    </div>
  );
};

export default UpdatePassword;
