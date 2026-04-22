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
