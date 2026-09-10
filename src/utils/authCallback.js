const normalizeSignal = (value) => (
  typeof value === 'string' ? value.trim().slice(0, 240).toLowerCase() : ''
);

export const getAuthCallbackOutcome = ({ errorDescription, error } = {}) => {
  const description = normalizeSignal(errorDescription);
  const code = normalizeSignal(error);

  if (description.includes('link is invalid or has expired')) {
    return {
      message: 'Your verification link is invalid or has expired. Please request a new one.',
      showResendForm: true,
    };
  }

  if (description.includes('user not found')) {
    return {
      message: 'This email address is not associated with an account. Please sign up.',
      showResendForm: false,
    };
  }

  if (code === 'access_denied' || description.includes('access denied')) {
    return {
      message: 'The verification request was cancelled. You can try again from the sign-in page.',
      showResendForm: false,
    };
  }

  return {
    message: 'We could not complete email verification. Please request a new verification email or try signing in again.',
    showResendForm: true,
  };
};
