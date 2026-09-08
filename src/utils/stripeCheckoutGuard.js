const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

export const isLocalCheckoutEnvironment = ({ hostname = '', isDev = false } = {}) =>
  Boolean(isDev) || LOCAL_HOSTNAMES.has(String(hostname).toLowerCase());

export const shouldBlockTestCheckout = ({ hostname = '', isDev = false, billingMode = 'test' } = {}) =>
  !isLocalCheckoutEnvironment({ hostname, isDev }) && billingMode !== 'live';
