import { loadStripe } from '@stripe/stripe-js';
import { supabase } from './supabase';
import toast from 'react-hot-toast';

// Initialize Stripe with the publishable key
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);
const isLocalDevelopment = typeof window !== 'undefined' &&
  (import.meta.env.DEV || /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname));
const buildSubscriptionFallbackUrl = (returnUrl) => {
  if (typeof window === 'undefined') return '/#/subscription/manage';
  const normalizedReturnUrl = returnUrl || window.location.href;
  return `${window.location.origin}/#/subscription/manage?return_url=${encodeURIComponent(normalizedReturnUrl)}`;
};

/**
 * Create a checkout session for subscription
 * @param {string} priceId - The Stripe price ID
 * @param {string} planId - The plan ID in our system
 * @param {string} successUrl - URL path to redirect after successful payment
 * @param {string} cancelUrl - URL path to redirect if payment is canceled
 * @returns {Promise<string>} - The checkout URL
 */
export const createCheckoutSession = async (priceId, planId, successUrl, cancelUrl) => {
  const toastId = toast.loading('Creating checkout session...');

  try {
    if (!priceId) {
      throw new Error('Stripe price ID is missing.');
    }

    const { data, error } = await supabase.functions.invoke('create-checkout-session', {
      body: {
        priceId,
        planId,
        successUrl,
        cancelUrl
      }
    });

    if (error) {
      throw new Error(error.message || 'Failed to create checkout session');
    }

    if (!data?.url) {
      throw new Error('Checkout session was created without a redirect URL.');
    }

    toast.success('Redirecting to checkout...', {
      id: toastId,
      duration: 2000,
    });

    return data.url;
  } catch (error) {
    toast.error(`Checkout failed: ${error.message}`, {
      id: toastId,
      duration: 5000,
    });

    throw error;
  }
};

/**
 * Create a customer portal session for managing subscription
 * @param {string} returnUrl - URL to redirect after leaving the portal
 * @param {boolean} useFallback - Whether to use fallback if Edge Function fails
 * @returns {Promise<string>} - The portal URL
 */
export const createCustomerPortalSession = async (returnUrl, useFallback = false) => {
  const logError = (message, error) => {
    const errorDetails = error?.message || JSON.stringify(error) || 'Unknown error';
    return `${message}: ${errorDetails}`;
  };

  toast.loading('Opening customer portal...');

  try {
    if (useFallback || isLocalDevelopment) {
      toast.dismiss();
      toast.success('Opening subscription management...', {
        duration: 2000
      });
      return buildSubscriptionFallbackUrl(returnUrl);
    }

    let data;
    let error;

    try {
      try {
        const { data: functionsList, error: functionsError } = await supabase.functions.list();

        if (!functionsError) {
          const functionExists = functionsList.some((f) => f.name === 'create-portal-session');
          if (!functionExists) {
            throw new Error('Edge Function "create-portal-session" is not deployed');
          }
        }
      } catch {
        // Continue anyway; invoke may still succeed.
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (!accessToken) {
        throw new Error('No access token available. Please log in again.');
      }

      const response = await supabase.functions.invoke('create-portal-session', {
        body: {
          returnUrl
        },
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      data = response.data;
      error = response.error;

      if (data && data.fallback) {
        toast.dismiss();
        toast(data.details || data.error || 'Using local subscription management', {
          icon: 'i',
          duration: 3000
        });

        useFallback = true;
        error = {
          message: data.error || 'Using fallback subscription management',
          details: data.details || 'No Stripe customer ID found',
          fromServer: true
        };
      }

      if (response.status === 500) {
        toast.dismiss();
        toast(`Using local subscription management: ${data?.error || 'Stripe API error'}`, {
          icon: '!',
          duration: 3000
        });

        useFallback = true;
        error = {
          message: data?.error || 'Stripe API error',
          type: data?.type || 'unknown',
          code: data?.code || 'unknown',
          fromServer: true
        };
      }
    } catch (invokeError) {
      const errorMessage = `Failed to invoke Edge Function: ${invokeError.message || 'Unknown error'}`;
      logError('Edge Function invoke failed', invokeError);

      error = {
        message: errorMessage,
        originalError: invokeError
      };
    }

    if (error) {
      logError('Error creating customer portal session', error);

      if (!useFallback) {
        toast.dismiss();
        toast.error(`Failed to open customer portal: ${error.message}`, {
          duration: 10000
        });
        throw error;
      }

      toast.dismiss();
      toast.success('Opening subscription management...', {
        duration: 2000
      });

      const { data: authData } = await supabase.auth.getUser();
      if (!authData || !authData.user) {
        throw new Error('User not authenticated');
      }

      const { error: userError } = await supabase
        .from('users')
        .select('stripe_customer_id, is_premium, premium_plan, premium_until')
        .eq('id', authData.user.id)
        .single();

      if (userError) {
        throw new Error('Failed to get user data');
      }

      return buildSubscriptionFallbackUrl(returnUrl);
    }

    toast.dismiss();
    toast.success('Opening customer portal...', {
      duration: 2000
    });

    return data.url;
  } catch (error) {
    logError('Error in createCustomerPortalSession', error);

    toast.dismiss();
    toast.error(`Failed to open subscription management: ${error.message}`, {
      duration: 10000
    });

    const enhancedError = new Error(`Subscription management error: ${error.message}`);
    enhancedError.originalError = error;
    enhancedError.context = {
      useFallback,
      returnUrl,
      timestamp: new Date().toISOString()
    };

    throw enhancedError;
  }
};

/**
 * Verify a checkout session
 * @param {string} sessionId - The Stripe checkout session ID
 * @returns {Promise<Object>} - The session details
 */
export const verifyCheckoutSession = async (sessionId) => {
  const toastId = toast.loading('Verifying subscription...');

  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData?.session?.access_token) {
      toast.error('Authentication error. Please try signing in again.', { id: toastId });
      throw new Error(sessionError?.message || 'User session not found or token missing.');
    }
    const accessToken = sessionData.session.access_token;

    const { data, error } = await supabase.functions.invoke('verify-checkout-session', {
      body: {
        sessionId
      },
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (error) {
      toast.error('Failed to verify subscription. Please contact support.', {
        id: toastId,
        duration: 5000,
      });

      throw new Error(error.message || 'Failed to verify checkout session');
    }

    toast.success('Subscription verified successfully!', {
      id: toastId,
      duration: 3000,
    });

    return data;
  } catch (error) {
    toast.error(`Failed to verify subscription: ${error.message}`, {
      id: toastId,
      duration: 5000,
    });

    throw error;
  }
};

/**
 * Get the Stripe instance
 * @returns {Promise<Stripe | null>} - The Stripe instance
 */
export const getStripe = () => stripePromise;

export default {
  createCheckoutSession,
  createCustomerPortalSession,
  verifyCheckoutSession,
  getStripe
};
