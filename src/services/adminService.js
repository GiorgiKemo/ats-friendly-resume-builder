import { supabase } from './supabase';

const invokeAdmin = async (action, payload = {}) => {
  const { data, error } = await supabase.functions.invoke('admin-api', {
    body: { action, payload },
  });

  if (error) {
    throw new Error(data?.error || error.message || 'Admin request failed');
  }

  if (data?.ok === false || data?.error) {
    throw new Error(data.error || 'Admin request failed');
  }

  return data;
};

export const fetchAdminOverview = () => invokeAdmin('overview');

export const setUserPremium = ({ userId, premium, plan, aiLimit, premiumUntil }) =>
  invokeAdmin('setPremium', { userId, premium, plan, aiLimit, premiumUntil });

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
