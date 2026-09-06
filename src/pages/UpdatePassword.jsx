import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import { updateRecoveryPassword } from '../services/passwordRecoveryService';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import { extractRecoverySessionFromUrl } from '../utils/authRecovery';

const UpdatePassword = () => {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id || null;
  const activeUserIdRef = useRef(userId);
  activeUserIdRef.current = userId;
  const requestRef = useRef(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('checking');
  const [errorMessage, setErrorMessage] = useState('');
  const [retryAttempt, setRetryAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    requestRef.current = null;
    setStatus('checking');
    setLoading(false);
    setPassword('');
    setConfirmPassword('');
    setErrorMessage('');

    const bootstrapRecoverySession = async () => {
      // The app-level bridge alone establishes URL recovery sessions, then
      // removes the tokens by navigating here. Do not race a second setSession.
      if (authLoading || extractRecoverySessionFromUrl()) return;
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!active || activeUserIdRef.current !== userId) return;
        if (error) throw error;
        setStatus(userId && data?.session?.user?.id === userId ? 'ready' : 'invalid');
      } catch {
        if (active && activeUserIdRef.current === userId) {
          setErrorMessage('We could not verify your reset session. Check your connection and try again.');
          setStatus('error');
        }
      }
    };

    void bootstrapRecoverySession();

    return () => {
      active = false;
      requestRef.current = null;
    };
  }, [userId, authLoading, retryAttempt]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (requestRef.current || status !== 'ready' || !userId || activeUserIdRef.current !== userId) return;

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters.');
      return;
    }

    const request = { userId };
    requestRef.current = request;
    const isCurrent = () => requestRef.current === request && activeUserIdRef.current === userId;
    const assertCurrentRequest = () => {
      if (!isCurrent()) throw new Error('Your account or page changed. Start the password update again.');
    };
    setErrorMessage('');
    setLoading(true);

    try {
      await updateRecoveryPassword(password, userId, { assertCurrentRequest });
      if (!isCurrent()) return;
      setPassword('');
      setConfirmPassword('');
      setStatus('success');
    } catch (error) {
      if (isCurrent()) setErrorMessage(error.message || 'Could not update your password. Please try again.');
    } finally {
      if (isCurrent()) { requestRef.current = null; setLoading(false); }
    }
  };

  if (status === 'checking') {
    return (
      <div className="max-w-md mx-auto p-6 mt-12 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-md text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Verifying your reset link...</h1>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="max-w-md mx-auto p-6 mt-12 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-md">
        <h1 className="text-2xl font-semibold mb-4 text-slate-900 dark:text-slate-100">Password updated</h1>
        <p role="status" className="text-gray-600 dark:text-slate-300 mb-6">Your new password has been saved. You can return to your dashboard.</p>
        <Button as="link" to="/dashboard">Return to dashboard</Button>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="max-w-md mx-auto p-6 mt-12 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-md">
        <h1 className="text-2xl font-semibold mb-4 text-slate-900 dark:text-slate-100">Unable to verify reset session</h1>
        <p role="alert" className="text-gray-600 dark:text-slate-300 mb-6">{errorMessage}</p>
        <Button onClick={() => setRetryAttempt((attempt) => attempt + 1)}>Try again</Button>
      </div>
    );
  }

  if (status === 'invalid') {
    return (
      <div className="max-w-md mx-auto p-6 mt-12 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-md text-center">
        <h1 className="text-2xl font-semibold mb-4 text-slate-900 dark:text-slate-100">Reset Link Invalid</h1>
        <p className="text-gray-600 dark:text-slate-300 mb-6">
          This password reset link is missing required recovery details or has already expired.
        </p>
        <div className="flex flex-col gap-3">
          <Button as="link" to="/forgot-password">Request a New Reset Link</Button>
          <Button variant="outline" as="link" to="/signin">
            Back to Sign In
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto p-6 mt-12 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-md">
      <h1 className="text-2xl font-semibold mb-4 text-slate-900 dark:text-slate-100">Set New Password</h1>
      <p className="text-gray-600 dark:text-slate-300 mb-6 text-sm">
        Enter your new password below.
      </p>
      <form onSubmit={handleSubmit}>
        {errorMessage && <p role="alert" className="text-sm text-red-600 dark:text-red-400 mb-4">{errorMessage}</p>}
        <Input
          label="New Password"
          type="password"
          autoComplete="new-password"
          minLength={6}
          id="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <div className="mt-4">
          <Input
            label="Confirm Password"
            type="password"
            autoComplete="new-password"
            minLength={6}
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
