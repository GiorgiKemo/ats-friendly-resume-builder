import React, { useState } from 'react';
// import { useNavigate } from 'react-router-dom'; // Removed unused useNavigate
import toast from 'react-hot-toast';
import Button from '../ui/Button';
import { createCheckoutSession } from '../../services/stripeService';

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

  const handleCheckout = async () => {
    debugLog('handleCheckout: Starting checkout process', { priceId, planId });

    try {
      if (!priceId) {
        throw new Error('This Stripe plan is not configured yet.');
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

      debugLog('handleCheckout: Server-side checkout successful, redirecting to', checkoutUrl);
      window.location.href = checkoutUrl;
    } catch (error) {
      console.error('Error initiating checkout:', error);
      debugLog('handleCheckout: Exception', error);
      toast.error(`Checkout failed: ${error.message}`);
      setLoading(false);
    }
  };

  return (
    <Button
      variant={buttonVariant}
      className={className}
      onClick={handleCheckout}
      disabled={loading || disabled}
    >
      {loading ? 'Processing...' : buttonText}
    </Button>
  );
};

export default StripeCheckout;
