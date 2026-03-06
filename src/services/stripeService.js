import { loadStripe } from '@stripe/stripe-js';
import { supabase } from './supabase';
import toast from 'react-hot-toast';

// Debug flag - set to true to enable detailed debugging
const DEBUG_STRIPE_SERVICE = false;

// Debug logger function
const debugLog = (_message, _data) => { // Parameters were unused when DEBUG_STRIPE_SERVICE is false
  if (DEBUG_STRIPE_SERVICE) {
    // Production mode - no debug logs
  }
};

// Initialize Stripe with the publishable key
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

// Log the Stripe key (partially masked for security)
const stripeKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '';
if (stripeKey) {
  const maskedKey = stripeKey.substring(0, 8) + '...' + stripeKey.substring(stripeKey.length - 4);
  debugLog('Stripe initialized with publishable key', maskedKey);
} else {
  debugLog('WARNING: No Stripe publishable key found in environment variables');
}

/**
 * Create a checkout session for subscription
 * @param {string} priceId - The Stripe price ID
 * @param {string} planId - The plan ID in our system (free, premium)
 * @param {string} successUrl - URL to redirect after successful payment
 * @param {string} cancelUrl - URL to redirect if payment is canceled
 * @param {boolean} useClientSideFallback - Whether to use client-side fallback if server fails
 * @returns {Promise<string>} - The checkout URL or null if redirecting directly
 */
export const createCheckoutSession = async (priceId, planId, successUrl, cancelUrl, useClientSideFallback = false) => {
  // Show loading toast
  const toastId = toast.loading("Creating checkout session...");

  try {
    // First try to use the Supabase Edge Function
    try {
      // Call the Supabase function to create a checkout session
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: {
          priceId,
          planId,
          successUrl,
          cancelUrl
        }
      });

      if (error) {
        console.error('Error creating checkout session:', error);

        // Show error toast
        toast.dismiss(toastId); // Dismiss loading toast
        toast("Failed to create checkout session. Trying fallback method...", { // Use generic toast for warning
          icon: '⚠️',
          duration: 3000,
        });

        // Don't throw, fall back to client-side if enabled
        if (!useClientSideFallback) {
          throw new Error(error.message || 'Failed to create checkout session');
        }
      } else {
        // Show success toast
        toast.success("Redirecting to checkout...", {
          id: toastId,
          duration: 2000,
        });

        return data.url;
      }
    } catch (serverError) {
      console.error('Server-side checkout failed:', serverError);

      // Show error toast
      toast.dismiss(toastId); // Dismiss loading toast
      toast("Server checkout failed. Trying fallback method...", { // Use generic toast for warning
        icon: '⚠️',
        duration: 3000,
      });

      // Don't throw, fall back to client-side if enabled
      if (!useClientSideFallback) {
        throw serverError;
      }
    }

    // If we get here and client-side fallback is enabled, use direct checkout
    if (useClientSideFallback) {
      // Using client-side fallback for checkout

      // Show fallback toast
      // For info with loading, it's better to dismiss the old and start a new loading toast
      toast.dismiss(toastId);
      toast.loading("Using direct checkout method...");
      // We'll need to use fallbackToastId for subsequent updates if this path is taken.
      // This part of the code might need further refactoring if toastId is expected to be stable.
      // For now, let's assume toastId is the one to update or dismiss.
      // Reverting to updating the original toastId for simplicity, but with correct API.
      toast("Using direct checkout method...", { // Using generic toast for info
        id: toastId, // This will update the original toast if it wasn't dismissed
        icon: 'ℹ️',
      });


      // Get Stripe instance
      const stripe = await stripePromise;
      if (!stripe) {
        toast.error("Failed to load Stripe. Please try again later.", {
          id: toastId, // Update original toast
          duration: 5000,
        });
        throw new Error('Failed to load Stripe');
      }

      // Create a checkout session directly with Stripe
      const { error } = await stripe.redirectToCheckout({
        lineItems: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        mode: 'subscription',
        successUrl: `${successUrl}?method=direct&plan=${planId}`,
        cancelUrl: cancelUrl,
      });

      if (error) {
        toast.error(`Checkout error: ${error.message}`, {
          id: toastId, // Update original toast
          duration: 5000,
        });
        throw error;
      }

      // If we get here, the user has been redirected to Stripe
      toast.dismiss(toastId); // Dismiss the toast as user is leaving the page
      return null;
    }
  } catch (error) {
    console.error('Error in createCheckoutSession:', error);

    // Show error toast if not already shown
    toast.error(`Checkout failed: ${error.message}`, {
      id: toastId, // Update original toast
      duration: 5000,
    });

    throw error;
  }
  return null; // Ensure all paths return a value
};

/**
 * Create a customer portal session for managing subscription
 * @param {string} returnUrl - URL to redirect after leaving the portal
 * @param {boolean} useFallback - Whether to use fallback if Edge Function fails (default: false in production)
 * @returns {Promise<string>} - The portal URL
 */
// Function renamed internally but keeping the same export name for backward compatibility
export const createCustomerPortalSession = async (returnUrl, useFallback = false) => {
  debugLog('createCustomerPortalSession: Starting', { returnUrl, useFallback });

  // Simple error logger for console
  const logError = (message, error) => {
    const errorDetails = error?.message || JSON.stringify(error) || 'Unknown error';
    const fullMessage = `${message}: ${errorDetails}`;

    // Log to console
    console.error('%c STRIPE SERVICE ERROR ', 'background: #ff0000; color: white; font-size: 16px');
    console.error(fullMessage);
    console.error(error);

    // Also log using our debug logger
    debugLog(`ERROR: ${message}`, error);

    return fullMessage;
  };

  // Show loading toast - using a different approach to avoid the t.update error
  toast.loading("Opening customer portal...");

  try {
    // Call the Supabase function to create a customer portal session
    debugLog('createCustomerPortalSession: Calling Supabase Edge Function');

    let data, error;

    try {
      debugLog('createCustomerPortalSession: About to invoke Edge Function with params', { returnUrl });

      // Check if the function exists by listing available functions
      try {
        const { data: functionsList, error: functionsError } = await supabase.functions.list();

        if (functionsError) {
          debugLog('createCustomerPortalSession: Error listing functions', functionsError);
        } else {
          const functionExists = functionsList.some(f => f.name === 'create-portal-session');
          debugLog('createCustomerPortalSession: Functions list', {
            available: functionsList.map(f => f.name),
            targetExists: functionExists
          });

          if (!functionExists) {
            throw new Error('Edge Function "create-portal-session" is not deployed');
          }
        }
      } catch (listError) {
        debugLog('createCustomerPortalSession: Failed to check if function exists', listError);
        // Continue anyway, as the function might still work
      }

      // Get the current session
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      // Make sure we have an access token
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

      debugLog('createCustomerPortalSession: Edge Function response', {
        data: data ? 'Data received' : 'No data',
        error: error || 'none',
        status: response.status,
        responseType: typeof response
      });

      // Check if we should use the fallback
      if (data && data.fallback) {
        debugLog('createCustomerPortalSession: Server indicated fallback should be used', data);

        // Show a toast with the error message
        toast.dismiss();
        toast.info(data.details || data.error || "Using local subscription management", {
          duration: 3000
        });

        // Set useFallback to true to use the fallback method
        useFallback = true;

        // Create a custom error to trigger the fallback
        error = {
          message: data.error || "Using fallback subscription management",
          details: data.details || "No Stripe customer ID found",
          fromServer: true
        };
      }

      // Also check for error response with fallback flag (from our enhanced error handling)
      if (response.status === 500) {
        debugLog('createCustomerPortalSession: Server returned 500 error', data);

        // Show a toast with the error message
        toast.dismiss();
        toast.warning(`Using local subscription management: ${data?.error || 'Stripe API error'}`, {
          duration: 3000
        });

        // Set useFallback to true to use the fallback method
        useFallback = true;

        // Create a custom error to trigger the fallback
        error = {
          message: data?.error || "Stripe API error",
          type: data?.type || "unknown",
          code: data?.code || "unknown",
          fromServer: true
        };

        // Log the error details
        console.warn('Stripe API error details:', data || 'No data returned');
      }

      // Additional logging for debugging
      if (data && data.url) {
        debugLog('createCustomerPortalSession: Response data details', {
          hasUrl: true,
          urlType: typeof data.url,
          urlPrefix: data.url.substring(0, 20) + '...'
        });
      }
    } catch (invokeError) {
      // Handle case where the function invoke itself fails (e.g., network error, function not deployed)
      const errorMessage = `Failed to invoke Edge Function: ${invokeError.message || 'Unknown error'}`;
      logError('Edge Function invoke failed', invokeError);

      error = {
        message: errorMessage,
        originalError: invokeError
      };
    }

    if (error) {
      // Log the error
      logError('Error creating customer portal session', error);

      // If we're in production or fallback is disabled, throw the error
      if (!useFallback) {
        debugLog('createCustomerPortalSession: Fallback disabled, throwing error');
        toast.dismiss();
        toast.error(`Failed to open customer portal: ${error.message}`, {
          duration: 10000 // Longer timeout
        });
        throw error;
      }

      // Show success toast for fallback instead of warning
      debugLog('createCustomerPortalSession: Using fallback method');
      toast.dismiss();
      toast.success("Opening subscription management...", {
        duration: 2000 // Shorter timeout for better UX
      });

      // Log that we're using the fallback
      console.warn('%c USING FALLBACK SUBSCRIPTION MANAGEMENT ', 'background: #ff9800; color: white; font-size: 14px');
      console.warn('Edge Function error:', error);
      console.warn('Will redirect to local subscription management page');

      // Get the current user
      debugLog('createCustomerPortalSession: Getting current user');
      const { data: authData } = await supabase.auth.getUser();
      if (!authData || !authData.user) {
        debugLog('createCustomerPortalSession: No authenticated user found');
        throw new Error('User not authenticated');
      }

      debugLog('createCustomerPortalSession: User authenticated', { userId: authData.user.id });

      // Get the user's Stripe customer ID
      debugLog('createCustomerPortalSession: Fetching user data');
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('stripe_customer_id, is_premium, premium_plan, premium_until')
        .eq('id', authData.user.id)
        .single();

      if (userError) {
        debugLog('createCustomerPortalSession: Error fetching user data', userError);
        throw new Error('Failed to get user data');
      }

      debugLog('createCustomerPortalSession: User data retrieved', {
        hasStripeCustomerId: !!userData.stripe_customer_id,
        isPremium: userData.is_premium
      });

      // Check if the user has a Stripe customer ID
      if (!userData.stripe_customer_id) {
        debugLog('createCustomerPortalSession: No Stripe customer ID found');

        // If the user is premium but doesn't have a customer ID, they might be using the development toggle
        if (userData.is_premium) {
          debugLog('createCustomerPortalSession: User is premium but has no customer ID (likely using dev toggle)');
        } else {
          debugLog('createCustomerPortalSession: User is not premium and has no customer ID');
        }
      }

      // Toast already shown above, no need to show another one

      // Use a local fallback page instead of direct Stripe link
      // This ensures we have a consistent experience
      const dedicatedReturnUrl = `${window.location.origin}/return-from-stripe`;
      const fallbackUrl = `${window.location.origin}/#/subscription/manage?return_url=${encodeURIComponent(dedicatedReturnUrl)}`;

      debugLog('createCustomerPortalSession: Using local fallback URL', fallbackUrl);
      return fallbackUrl;
    }

    // Show success toast
    debugLog('createCustomerPortalSession: Edge Function successful', { hasUrl: !!data?.url });
    toast.dismiss();
    toast.success("Opening customer portal...", {
      duration: 2000
    });

    return data.url;
  } catch (error) {
    // Log the error
    logError('Error in createCustomerPortalSession', error);

    // Show error toast if not already shown
    toast.dismiss();
    toast.error(`Failed to open subscription management: ${error.message}`, {
      duration: 10000 // Longer timeout
    });

    // Create a more detailed error with stack trace
    const enhancedError = new Error(`Subscription management error: ${error.message}`);
    enhancedError.originalError = error;
    enhancedError.context = {
      useFallback,
      returnUrl,
      timestamp: new Date().toISOString()
    };

    // Log the enhanced error
    console.error('%c ENHANCED ERROR DETAILS ', 'background: #ff0000; color: white; font-size: 14px');
    console.error(enhancedError);

    throw enhancedError;
  }
};

/**
 * Verify a checkout session
 * @param {string} sessionId - The Stripe checkout session ID
 * @returns {Promise<Object>} - The session details
 */
export const verifyCheckoutSession = async (sessionId) => {
  // Show loading toast
  const toastId = toast.loading("Verifying subscription...");

  try {
    // Get current session to ensure auth token is fresh
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData?.session?.access_token) {
      console.error('Error getting session or access token for verifyCheckoutSession:', sessionError);
      toast.error("Authentication error. Please try signing in again.", { id: toastId });
      throw new Error(sessionError?.message || 'User session not found or token missing.');
    }
    const accessToken = sessionData.session.access_token;

    // Call the Supabase function to verify the checkout session
    const { data, error } = await supabase.functions.invoke('verify-checkout-session', {
      body: {
        sessionId
      },
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (error) {
      console.error('Error verifying checkout session:', error);

      // Show error toast
      toast.error("Failed to verify subscription. Please contact support.", {
        id: toastId,
        duration: 5000,
      });

      throw new Error(error.message || 'Failed to verify checkout session');
    }

    // Show success toast
    toast.success("Subscription verified successfully!", {
      id: toastId,
      duration: 3000,
    });

    return data;
  } catch (error) {
    console.error('Error in verifyCheckoutSession:', error);

    // Show error toast if not already shown
    toast.error(`Failed to verify subscription: ${error.message}`, {
      id: toastId,
      duration: 5000,
    });

    throw error;
  }
};

/**
 * Get the Stripe instance
 * @returns {Promise<Stripe>} - The Stripe instance
 */
export const getStripe = () => stripePromise;

export default {
  createCheckoutSession,
  createCustomerPortalSession, // Keep this name for backward compatibility
  verifyCheckoutSession,
  getStripe
};
