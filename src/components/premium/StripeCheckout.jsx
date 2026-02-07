import React, { useState } from 'react';
// import { useNavigate } from 'react-router-dom'; // Removed unused useNavigate
import toast from 'react-hot-toast';
import Button from '../ui/Button';
import { createCheckoutSession, getStripe } from '../../services/stripeService';

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
 */
const StripeCheckout = ({
  priceId,
  planId,
  buttonText = 'Subscribe',
  buttonVariant = 'primary',
  className = ''
}) => {
  // const navigate = useNavigate(); // Removed unused navigate
  const [loading, setLoading] = useState(false);

  const handleCheckout = async () => {
    debugLog('handleCheckout: Starting checkout process', { priceId, planId });

    try {
      setLoading(true);
      toast("Preparing checkout...");

      // Define success and cancel URLs. These are the *final* client-side paths
      // after StripeReturnPage has processed the Stripe redirect.
      // Redirect to the dedicated subscription success page after verification
      const finalSuccessClientPath = `/subscription/success`;
      const finalCancelClientPath = `pricing`; // Assuming /pricing is the cancel page

      debugLog('handleCheckout: Final client paths configured', { finalSuccessClientPath, finalCancelClientPath });

      // First try to use the server-side checkout if available
      try {
        debugLog('handleCheckout: Attempting server-side checkout via createCheckoutSession');
        const checkoutUrl = await createCheckoutSession(priceId, planId, finalSuccessClientPath, finalCancelClientPath);

        if (checkoutUrl) {
          debugLog('handleCheckout: Server-side checkout successful, redirecting to', checkoutUrl);
          window.location.href = checkoutUrl;
          return; // Exit early as we're redirecting
        } else {
          debugLog('handleCheckout: Server-side checkout returned no URL, falling back to client-side');
        }
      } catch (serverError) {
        debugLog('handleCheckout: Server-side checkout failed, falling back to client-side', serverError);
        console.warn('Server-side checkout failed, using client-side fallback:', serverError);
        // Continue with client-side checkout
      }

      // Use client-side checkout as fallback
      debugLog('handleCheckout: Using direct client-side checkout');

      // Get Stripe instance
      const stripe = await getStripe();
      if (!stripe) {
        debugLog('handleCheckout: Failed to load Stripe');
        throw new Error('Failed to load Stripe');
      }

      debugLog('handleCheckout: Stripe instance loaded successfully');
      toast("Redirecting to Stripe checkout...");

      // Create a checkout session directly with Stripe
      debugLog('handleCheckout: Creating checkout session with params', {
        priceId,
        mode: 'subscription',
        successUrl: finalSuccessClientPath, // Use correct variable
        cancelUrl: finalCancelClientPath   // Use correct variable
      });

      const { error } = await stripe.redirectToCheckout({
        lineItems: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        mode: 'subscription',
        // For client-side redirectToCheckout that creates the session, 
        // {CHECKOUT_SESSION_ID} might not be supported in successUrl.
        // Stripe will append session_id itself if successUrl is basic.
        // Let's simplify this and rely on Stripe appending it, or handle missing session_id in StripeReturnPage.
        // The primary path is server-side session creation which DOES correctly add session_id.
        // This fallback successUrl will now NOT include session_id placeholder.
        // StripeReturnPage will then report "missing information" if this path is taken and Stripe doesn't add it.
        successUrl: `${window.location.origin}/#/return-from-stripe?redirect=${encodeURIComponent(finalSuccessClientPath)}`, // Fallback success URL (session_id removed)
        cancelUrl: `${window.location.origin}/#/return-from-stripe?redirect=${encodeURIComponent(finalCancelClientPath)}`, // Fallback cancel URL
      });

      if (error) {
        debugLog('handleCheckout: Stripe redirectToCheckout error', error);
        throw error;
      }

      debugLog('handleCheckout: User redirected to Stripe checkout');
      // If we get here, the user has been redirected to Stripe
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
      disabled={loading}
    >
      {loading ? 'Processing...' : buttonText}
    </Button>
  );
};

export default StripeCheckout;
