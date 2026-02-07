import React, { useState } from 'react';
import toast from 'react-hot-toast';
import Button from '../ui/Button';
import { createCustomerPortalSession } from '../../services/stripeService';
import { useSubscription } from '../../context/SubscriptionContext';
// import { supabase } from '../../services/supabase'; // Removed unused supabase import

// Debug flag - set to true to enable detailed debugging
const DEBUG_SUBSCRIPTION_MANAGER = false;

// Debug logger function
const debugLog = (_message, _data) => { // Parameters were unused when DEBUG_SUBSCRIPTION_MANAGER is false
  if (DEBUG_SUBSCRIPTION_MANAGER) {
    // console.log(_message, _data); // Example usage if enabled
  }
};

/**
 * Component for managing subscription through Stripe Customer Portal
 *
 * @param {Object} props
 * @param {string} props.buttonText - Text to display on the button
 * @param {string} props.buttonVariant - Button variant (default, outline, etc.)
 * @param {string} props.className - Additional CSS classes
 */
const SubscriptionManager = ({
  buttonText = 'Manage Subscription',
  buttonVariant = 'primary',
  className = ''
}) => {
  const { isPremium } = useSubscription();
  const [loading, setLoading] = useState(false);

  const handleManageSubscription = async () => {
    debugLog('handleManageSubscription: Starting');

    // Simple error logger for console
    const logError = (message, error) => {
      const errorDetails = error?.message || JSON.stringify(error) || 'Unknown error';
      const fullMessage = `${message}: ${errorDetails}`;

      // Log to console
      console.error(fullMessage);

      // Show a toast notification
      toast.error(fullMessage, {
        position: "top-center",
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      });

      // Also log using our debug logger
      debugLog(message, error);
    };

    try {
      setLoading(true);

      // Define return URL - use a dedicated return path that's configured in vercel.json
      // This ensures proper handling of the redirect from Stripe
      const returnUrl = `${window.location.origin}/return-from-stripe`;
      debugLog('handleManageSubscription: Return URL configured', { returnUrl });

      // Create customer portal session
      debugLog('handleManageSubscription: Creating customer portal session');

      // Use the Edge Function to create a proper Stripe Customer Portal session
      try {
        const portalUrl = await createCustomerPortalSession(returnUrl);
        debugLog('handleManageSubscription: Portal URL received', { portalUrl: portalUrl || 'none' });

        // Redirect to customer portal or fallback page
        if (portalUrl) {
          debugLog('handleManageSubscription: Redirecting to portal URL', portalUrl);
          window.location.href = portalUrl;
        } else {
          // If no URL is returned, show an error
          debugLog('handleManageSubscription: No portal URL returned');
          throw new Error('No portal URL returned');
        }
      } catch (portalError) {
        logError('Error creating customer portal session', portalError);

        // If the service didn't handle the fallback, try to navigate to the fallback page directly
        if (portalError.message.includes('fallback') === false) {
          const fallbackUrl = `${window.location.origin}/#/subscription/manage?return_url=${encodeURIComponent(`${window.location.origin}/return-from-stripe`)}`;
          console.warn('Using direct fallback URL:', fallbackUrl);
          window.location.href = fallbackUrl;
          return; // Don't throw the error
        }

        // Re-throw the error to be caught by the outer catch
        throw portalError;
      }
    } catch (error) {
      logError('Error opening customer portal', error);
      setLoading(false);
    }
  };

  // Only show the button if the user has a premium subscription
  if (!isPremium) {
    return null;
  }

  return (
    <Button
      variant={buttonVariant}
      className={className}
      onClick={handleManageSubscription}
      disabled={loading}
    >
      {loading ? 'Loading...' : buttonText}
    </Button>
  );
};

export default SubscriptionManager;
