/**
 * Return an external URL only when it is an absolute HTTP(S) URL without
 * embedded credentials. User-entered links can come from legacy rows, so
 * rendering code must validate them again before assigning an href.
 */
export const getSafeExternalUrl = (value) => {
  if (typeof value !== 'string' || !value.trim()) return '';

  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    return url.href;
  } catch {
    return '';
  }
};

export const isSafeExternalUrl = (value) => Boolean(getSafeExternalUrl(value));

