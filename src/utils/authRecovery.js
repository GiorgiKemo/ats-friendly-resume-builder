export const extractRecoverySessionFromUrl = (url = typeof window !== 'undefined' ? window.location.href : '') => {
  if (!url || typeof url !== 'string') {
    return null;
  }

  const recoverySegment = url
    .split('#')
    .reverse()
    .find((segment) => segment.includes('access_token=') && segment.includes('type=recovery'));

  if (!recoverySegment) {
    return null;
  }

  const params = new URLSearchParams(recoverySegment);
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const type = params.get('type');

  if (!accessToken || !refreshToken || type !== 'recovery') {
    return null;
  }

  return {
    accessToken,
    refreshToken,
    type,
  };
};

const PASSWORD_RECOVERY_INTENT_KEY = 'resumeats-password-recovery';

export function markPasswordRecoveryIntent() {
  try {
    sessionStorage.setItem(PASSWORD_RECOVERY_INTENT_KEY, '1');
  } catch {
    // Private browsing can block storage. The reset page then stays on the invalid-link state.
  }
}

export function hasPasswordRecoveryIntent() {
  try {
    return sessionStorage.getItem(PASSWORD_RECOVERY_INTENT_KEY) === '1';
  } catch {
    return false;
  }
}

export function clearPasswordRecoveryIntent() {
  try {
    sessionStorage.removeItem(PASSWORD_RECOVERY_INTENT_KEY);
  } catch {
    // Nothing further to clear.
  }
}
