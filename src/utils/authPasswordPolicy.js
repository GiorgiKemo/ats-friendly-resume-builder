export const PASSWORD_POLICY_WARNING_KEY = 'resumeats:password-policy-warning';
export const PASSWORD_POLICY_WARNING_MESSAGE = 'Your password no longer meets our current security requirements. You can keep using your account, but please reset it to choose a stronger password.';

export const hasWeakPasswordSignInWarning = (result) => Boolean(result?.weakPassword);
