import { supabase, supabaseUrl, supabasePublishableKey } from './supabase';

// auth.updateUser selects its session after waiting for the shared SDK lock.
// Pin this sensitive mutation to a verified token instead of a mutable session.
export const updateRecoveryPassword = async (password, expectedUserId, { assertCurrentRequest } = {}) => {
  if (!expectedUserId) throw new Error('Sign in again or request a new password reset link.');
  assertCurrentRequest?.();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) throw new Error('Your reset session has expired. Request a new password reset link.');

  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error) throw error;
  if (data?.user?.id !== expectedUserId) throw new Error('Your account changed. Start the password update again.');
  assertCurrentRequest?.();

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: 'PUT',
    headers: {
      apikey: supabasePublishableKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.msg || result?.message || result?.error_description || 'Could not update your password. Please try again.');
  return result?.user || result;
};
