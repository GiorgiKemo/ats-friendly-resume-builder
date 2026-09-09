import { supabase } from './supabase';

const MUTATING_ADMIN_ACTIONS = new Set([
  'setPremium',
  'setAiLimit',
  'banUser',
  'deleteUser',
  'approvePrivacyDeletion',
  'requestExport',
  'placePrivacyHold',
  'releasePrivacyHold',
  'cancelPrivacyDeletion',
  'recordProviderCancellationReview',
  'resolveError',
  'grantAdmin',
  'revokeAdmin',
  'updateAdminRole',
  'updateSupportAiSettings',
  'updateSupportRoutingSettings',
  'resetSupportAiCircuit',
  'rollbackSupportAiSettings',
  'createBillingActionIntent',
  'autoApplyJobAction',
]);

export const createAdminIdempotencyKey = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `admin-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
};

const invokeAdmin = async (action, payload = {}, options = {}) => {
  const headers = MUTATING_ADMIN_ACTIONS.has(action)
    ? { 'x-admin-idempotency-key': options.idempotencyKey || createAdminIdempotencyKey() }
    : undefined;

  const { data, error } = await supabase.functions.invoke('admin-api', {
    body: { action, payload },
    headers,
  });

  if (error) {
    if (error.context?.status === 403) throw new Error('This page is available to administrators only.');
    if (error.context?.status === 401) throw new Error('Your session has expired. Sign in again to continue.');
    const requestError = new Error(data?.error || 'The admin request could not be completed. Please try again.');
    requestError.code = data?.code || null;
    requestError.requestId = data?.requestId || null;
    throw requestError;
  }

  if (data?.ok === false || data?.error) {
    const requestError = new Error(data.error || 'Admin request failed');
    requestError.code = data?.code || null;
    requestError.requestId = data?.requestId || null;
    throw requestError;
  }

  return data;
};

export const fetchAdminOverview = () => invokeAdmin('overview');

export const fetchAdminDirectory = ({ search = '', cursor = null, limit = 50 } = {}) =>
  invokeAdmin('directory', { search, cursor, limit });

export const fetchAdminAnalytics = ({ from = null, to = null } = {}) =>
  invokeAdmin('analytics', { from, to });

export const fetchAdminAnalyticsCsv = ({ from = null, to = null } = {}) =>
  invokeAdmin('analyticsCsv', { from, to });

export const fetchAdminCustomer = (userId) => invokeAdmin('customer', { userId });

export const fetchAdminPrivacy = (userId) => invokeAdmin('privacy', { userId });

export const fetchAdminSettings = () => invokeAdmin('settings');

export const fetchAdminBillingActionPreview = (payload) => invokeAdmin('billingActionPreview', payload);

export const fetchAdminJobOperations = ({ status = '', limit = 25 } = {}) =>
  invokeAdmin('jobOperations', { status, limit });

export const createAdminBillingActionIntent = (payload, idempotencyKey) =>
  invokeAdmin('createBillingActionIntent', payload, { idempotencyKey });

export const requestAdminAutoApplyJobAction = ({ jobId, operation, reason, idempotencyKey }) =>
  invokeAdmin('autoApplyJobAction', { jobId, operation, reason }, { idempotencyKey });

export const updateAdminSupportAiSettings = ({
  enabled,
  providerName,
  modelName,
  perTurnTokenLimit,
  conversationTurnLimit,
  dailyCostMicros,
  monthlyCostMicros,
  idempotencyKey,
}) => invokeAdmin('updateSupportAiSettings', {
  enabled,
  providerName,
  modelName,
  perTurnTokenLimit,
  conversationTurnLimit,
  dailyCostMicros,
  monthlyCostMicros,
}, { idempotencyKey });

export const updateAdminSupportRoutingSettings = ({
  timezone,
  businessDays,
  businessStart,
  businessEnd,
  firstResponseTargetMinutes,
  maxQueueSize,
  autoRouteEnabled,
  reason,
  idempotencyKey,
}) => invokeAdmin('updateSupportRoutingSettings', {
  timezone,
  businessDays,
  businessStart,
  businessEnd,
  firstResponseTargetMinutes,
  maxQueueSize,
  autoRouteEnabled,
  reason,
}, { idempotencyKey });

export const resetAdminSupportAiCircuit = ({ reason = 'admin_manual_clear', idempotencyKey }) =>
  invokeAdmin('resetSupportAiCircuit', { reason }, { idempotencyKey });

export const rollbackAdminSupportAiSettings = ({ targetRevision, idempotencyKey }) =>
  invokeAdmin('rollbackSupportAiSettings', { targetRevision }, { idempotencyKey });

export const setUserPremium = ({ userId, premium, plan, aiLimit, premiumUntil, idempotencyKey }) =>
  invokeAdmin('setPremium', { userId, premium, plan, aiLimit, premiumUntil }, { idempotencyKey });

export const setUserAiLimit = ({ userId, aiLimit, resetUsage, idempotencyKey }) =>
  invokeAdmin('setAiLimit', { userId, aiLimit, resetUsage }, { idempotencyKey });

export const setUserBan = ({ userId, banned, reason, idempotencyKey }) =>
  invokeAdmin('banUser', { userId, banned, reason }, { idempotencyKey });

export const deleteAdminUser = (userId, idempotencyKey) =>
  invokeAdmin('deleteUser', { userId }, { idempotencyKey });

export const approveAdminPrivacyDeletion = (jobId, idempotencyKey) =>
  invokeAdmin('approvePrivacyDeletion', { jobId }, { idempotencyKey });

export const requestAdminExport = (userId, idempotencyKey) =>
  invokeAdmin('requestExport', { userId }, { idempotencyKey });

export const placeAdminPrivacyHold = ({ userId, holdType, reason, expiresAt, idempotencyKey }) =>
  invokeAdmin('placePrivacyHold', { userId, holdType, reason, expiresAt }, { idempotencyKey });

export const releaseAdminPrivacyHold = (holdId, idempotencyKey) =>
  invokeAdmin('releasePrivacyHold', { holdId }, { idempotencyKey });

export const cancelAdminPrivacyDeletion = ({ jobId, userId, idempotencyKey }) =>
  invokeAdmin('cancelPrivacyDeletion', { jobId, userId }, { idempotencyKey });

export const recordAdminProviderCancellationReview = ({ reviewId, evidenceReference, reason, idempotencyKey }) =>
  invokeAdmin('recordProviderCancellationReview', { reviewId, evidenceReference, reason }, { idempotencyKey });

export const resolveClientError = (errorId, idempotencyKey) =>
  invokeAdmin('resolveError', { errorId }, { idempotencyKey });

export const grantAdminAccess = ({ email, role, idempotencyKey }) =>
  invokeAdmin('grantAdmin', { email, role }, { idempotencyKey });

export const revokeAdminAccess = (memberId, idempotencyKey) =>
  invokeAdmin('revokeAdmin', { memberId }, { idempotencyKey });

export const updateAdminRole = ({ memberId, role, idempotencyKey }) =>
  invokeAdmin('updateAdminRole', { memberId, role }, { idempotencyKey });
