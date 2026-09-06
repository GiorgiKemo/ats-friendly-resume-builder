import { supabase } from './supabase';

const invokeAdmin = async (action, payload = {}) => {
  const { data, error } = await supabase.functions.invoke('admin-api', {
    body: { action, payload },
  });

  if (error) {
    if (error.context?.status === 403) throw new Error('This page is available to administrators only.');
    if (error.context?.status === 401) throw new Error('Your session has expired. Sign in again to continue.');
    throw new Error(data?.error || 'The admin request could not be completed. Please try again.');
  }

  if (data?.ok === false || data?.error) {
    throw new Error(data.error || 'Admin request failed');
  }

  return data;
};

export const fetchAdminOverview = () => invokeAdmin('overview');

export const setUserPremium = ({ userId, premium, plan, aiLimit, premiumUntil }) =>
  invokeAdmin('setPremium', { userId, premium, plan, aiLimit, premiumUntil });

export const setUserAiLimit = ({ userId, aiLimit, resetUsage }) =>
  invokeAdmin('setAiLimit', { userId, aiLimit, resetUsage });

export const setUserBan = ({ userId, banned, reason }) =>
  invokeAdmin('banUser', { userId, banned, reason });

export const deleteAdminUser = (userId) =>
  invokeAdmin('deleteUser', { userId });

export const resolveClientError = (errorId) =>
  invokeAdmin('resolveError', { errorId });

export const grantAdminAccess = ({ email, role }) =>
  invokeAdmin('grantAdmin', { email, role });

export const revokeAdminAccess = (memberId) =>
  invokeAdmin('revokeAdmin', { memberId });
