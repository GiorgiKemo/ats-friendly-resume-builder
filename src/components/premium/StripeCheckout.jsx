import React, { useState } from 'react';
// import { useNavigate } from 'react-router-dom'; // Removed unused useNavigate
import toast from 'react-hot-toast';
import Button from '../ui/Button';
import { createCheckoutSession } from '../../services/stripeService';
import { trackGoogleAnalyticsEvent, trackUpgradeClick } from '../../services/analyticsService';
import { STRIPE_BILLING_MODE } from '../../config/stripePlans';
import { shouldBlockTestCheckout } from '../../utils/stripeCheckoutGuard';
import { getSafeExternalUrl } from '../../utils/urlSafety.js';

// Debug flag - set to true to enable detailed debugging
const DEBUG_CHECKOUT = false;

// Debug logger function
const debugLog = (_message, _data) => { // Parameters were unused when DEBUG_CHECKOUT is false
  if (DEBUG_CHECKOUT) {
    // console.log(_message, _data); // Example usage if enabled
  }
};

/**
 * Component for initiating a Stripe checkout session
 *
 * @param {Object} props
 * @param {string} props.priceId - The Stripe price ID
 * @param {string} props.planId - The plan ID in our system (free, premium)
 * @param {string} props.buttonText - Text to display on the button
 * @param {string} props.buttonVariant - Button variant (primary, secondary, outline, danger, ghost)
 * @param {string} props.className - Additional CSS classes
 * @param {boolean} props.disabled - Whether checkout is disabled
 */
const StripeCheckout = ({
  priceId,
  planId,
  buttonText = 'Subscribe',
  buttonVariant = 'primary',
  className = '',
  disabled = false
}) => {
  // const navigate = useNavigate(); // Removed unused navigate
  const [loading, setLoading] = useState(false);
  const billingConfigurationBlocked = shouldBlockTestCheckout({
    hostname: typeof window === 'undefined' ? '' : window.location.hostname,
    isDev: import.meta.env.DEV,
    billingMode: STRIPE_BILLING_MODE,
  });

  const handleCheckout = async () => {
    trackUpgradeClick({ planId, provider: 'stripe' });
    debugLog('handleCheckout: Starting checkout process', { priceId, planId });

    try {
      if (!priceId) {
        throw new Error('This Stripe plan is not configured yet.');
      }
      if (billingConfigurationBlocked) {
        throw new Error('Live billing is not configured for this environment.');
      }

      setLoading(true);
      toast("Preparing checkout...");

      // Define success and cancel URLs. These are the *final* client-side paths
      // after StripeReturnPage has processed the Stripe redirect.
      // Redirect to the dedicated subscription success page after verification
      const finalSuccessClientPath = `/subscription/success`;
      const finalCancelClientPath = `/pricing`;

      debugLog('handleCheckout: Final client paths configured', { finalSuccessClientPath, finalCancelClientPath });

      debugLog('handleCheckout: Attempting server-side checkout via createCheckoutSession');
      const checkoutUrl = await createCheckoutSession(priceId, planId, finalSuccessClientPath, finalCancelClientPath);

      if (!checkoutUrl) {
        throw new Error('Stripe checkout session did not return a redirect URL.');
      }
      const safeCheckoutUrl = getSafeExternalUrl(checkoutUrl);
      if (!safeCheckoutUrl || new URL(safeCheckoutUrl).origin !== 'https://checkout.stripe.com') {
        throw new Error('Stripe checkout is unavailable.');
      }

      trackGoogleAnalyticsEvent('begin_checkout', {
        plan_id: String(planId || 'unknown'),
        provider: 'stripe',
      });

      debugLog('handleCheckout: Server-side checkout successful, redirecting to', checkoutUrl);
      window.location.assign(safeCheckoutUrl);
    } catch (error) {
      console.error('Error initiating checkout:', error);
      debugLog('handleCheckout: Exception', error);
      toast.error(`Checkout failed: ${error.message}`);
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <Button
        variant={buttonVariant}
        className={className}
        onClick={handleCheckout}
        disabled={loading || disabled || billingConfigurationBlocked}
      >
        {loading ? 'Processing...' : billingConfigurationBlocked ? 'Billing unavailable' : buttonText}
      </Button>
      {billingConfigurationBlocked && (
        <p className="text-sm text-amber-600 dark:text-amber-400" role="status">
          Premium checkout is temporarily unavailable while live billing is configured.
        </p>
      )}
    </div>
  );
};

export default StripeCheckout;
