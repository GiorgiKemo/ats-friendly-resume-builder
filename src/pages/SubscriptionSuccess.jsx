import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import Button from '../components/ui/Button';
import toast from 'react-hot-toast';
import { supabase } from '../services/supabase';
import { verifyCheckoutSession } from '../services/stripeService';

// Debug flag - set to true to enable detailed debugging
const DEBUG_SUBSCRIPTION_SUCCESS = false;

// Debug logger function
const debugLog = (_message, _data) => { // Parameters were unused when DEBUG_SUBSCRIPTION_SUCCESS is false
  if (DEBUG_SUBSCRIPTION_SUCCESS) {
    // Production mode - no debug logs
  }
};

const SubscriptionSuccess = () => {
  const { user } = useAuth();
  const { refreshSubscriptionStatus } = useSubscription(); // Removed unused isPremium
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [subscriptionDetails, setSubscriptionDetails] = useState(null);
  // Create the ref at the component level, not inside useEffect
  const hasRunRef = useRef(false);

  const plan = searchParams.get('plan') || 'premium';
  const method = searchParams.get('method') || 'unknown';
  const sessionId = searchParams.get('session_id');

  // Helper function to fetch user subscription details directly from the database (read-only)
  // Premium status is ONLY set by server-side functions (webhook, verify-checkout-session)
  const fetchUserSubscriptionDetails = useCallback(async (userId, defaultPlan) => {
    if (!userId) {
      debugLog('fetchUserSubscriptionDetails: No userId provided, skipping');
      return;
    }

    debugLog(`fetchUserSubscriptionDetails: Starting for user ${userId} with default plan ${defaultPlan}`);

    try {
      debugLog('fetchUserSubscriptionDetails: Querying users table');
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('is_premium, premium_plan, premium_until, stripe_customer_id')
        .eq('id', userId)
        .single();

      if (userError) {
        console.error('Error fetching user data:', userError);
        debugLog('fetchUserSubscriptionDetails: Error fetching user data', userError);
        toast.error('Failed to fetch subscription details.');
      } else if (userData) {
        debugLog('fetchUserSubscriptionDetails: User data retrieved', userData);

        const subscriptionDetailsObj = {
          status: userData.is_premium ? 'active' : 'pending',
          plan: userData.premium_plan || defaultPlan,
          current_period_end: userData.premium_until,
          customer: userData.stripe_customer_id
        };

        debugLog('fetchUserSubscriptionDetails: Setting subscription details', subscriptionDetailsObj);
        setSubscriptionDetails(subscriptionDetailsObj);

        // Refresh the subscription status in the context to pick up server-side changes
        refreshSubscriptionStatus();
      }
    } catch (error) {
      console.error('Error in fetchUserSubscriptionDetails:', error);
      debugLog('fetchUserSubscriptionDetails: Exception', error);
      toast.error('Failed to fetch subscription details.');
    }
  }, [refreshSubscriptionStatus]);

  useEffect(() => {
    let redirectTimerId;
    const cleanup = () => {
      if (redirectTimerId) {
        clearTimeout(redirectTimerId);
        debugLog('useEffect cleanup: Cleared redirect timer');
      }
      // No cleanup for hasRunRef here, it's intentional to run once
    };

    // Use the 'user' variable from the top-level useAuth() call
    const authUser = user; // Assign to authUser for clarity in existing logs if needed
    // We don't need isPremium or subscriptionStatus directly inside this effect's logic flow based on the current code.
    // If they were needed for conditional logic *within* the effect, they should be obtained from the top-level useSubscription() call.

    // If user is not logged in, redirect to login
    if (!authUser) {
      debugLog('useEffect: No user, redirecting to signin');
      navigate('/signin');
      return cleanup;
    }

    debugLog('useEffect: User authenticated', { userId: user.id });
    debugLog('useEffect: URL parameters', { plan, method, sessionId });

    // Only run this effect once
    if (hasRunRef.current) {
      debugLog('useEffect: Already ran verification, skipping');
      return cleanup;
    }

    const verifySubscription = async () => {
      debugLog('verifySubscription: Starting verification process');
      hasRunRef.current = true;

      try {
        setLoading(true);

        // Refresh subscription status only once
        debugLog('verifySubscription: Refreshing subscription status');
        await refreshSubscriptionStatus();
        debugLog('verifySubscription: Subscription status refreshed');

        // If this is a checkout with a session ID, verify it
        if (sessionId) {
          debugLog(`verifySubscription: Session ID found (${sessionId.substring(0, 8)}...), verifying with Stripe`);
          try {
            // Use the stripeService to verify the checkout session
            debugLog('verifySubscription: Calling verifyCheckoutSession');
            const data = await verifyCheckoutSession(sessionId);
            debugLog('verifySubscription: Checkout session verified successfully', data);
            setSubscriptionDetails(data);
          } catch (error) {
            console.error('Error verifying checkout session:', error);
            debugLog('verifySubscription: Error verifying checkout session', error);
            // Toast is now handled in the stripeService

            // Fallback: Get the user's subscription details directly
            debugLog('verifySubscription: Using fallback to fetch subscription details directly');
            await fetchUserSubscriptionDetails(user.id, plan);
          }
        } else {
          // For direct checkout or when no session ID is provided,
          // just get the user's subscription details
          debugLog('verifySubscription: No session ID, fetching subscription details directly');
          await fetchUserSubscriptionDetails(user.id, plan);
        }
      } catch (error) {
        console.error('Error in subscription verification:', error);
        debugLog('verifySubscription: Exception', error);
        toast.error('An error occurred while processing your subscription.');
      } finally {
        setLoading(false);
        debugLog('verifySubscription: Verification process completed');

        // Set up redirect timer AFTER async verification completes
        debugLog('verifySubscription: Setting up 10-second redirect to dashboard');
        redirectTimerId = setTimeout(() => {
          debugLog('verifySubscription: 10-second timer elapsed, navigating to dashboard');
          navigate('/dashboard');
        }, 10000);
      }
    };

    verifySubscription();

    return cleanup;
  }, [user, navigate, sessionId, plan, method, refreshSubscriptionStatus, fetchUserSubscriptionDetails]);

  // If still loading, show a loading state
  if (loading) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-3xl text-center">
        <div className="bg-white rounded-lg shadow-md p-8 mb-8 animate-pulse">
          <div className="mb-6 flex justify-center">
            <div className="bg-gray-200 rounded-full p-4 h-24 w-24"></div>
          </div>
          <div className="h-8 bg-gray-200 rounded w-3/4 mx-auto mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-5/6 mb-6"></div>
          <div className="bg-gray-100 p-4 rounded-md mb-8">
            <div className="h-6 bg-gray-200 rounded w-1/2 mb-4"></div>
            <div className="space-y-2">
              <div className="h-4 bg-gray-200 rounded w-full"></div>
              <div className="h-4 bg-gray-200 rounded w-full"></div>
              <div className="h-4 bg-gray-200 rounded w-full"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-16 max-w-3xl text-center">
      <div className="bg-white rounded-lg shadow-md p-8 mb-8">
        <div className="mb-6 flex justify-center">
          <div className="bg-green-100 rounded-full p-4">
            <svg
              className="h-16 w-16 text-green-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
        </div>

        <h1 className="text-3xl font-bold mb-4">Subscription Successful!</h1>

        <p className="text-lg text-gray-700 mb-6">
          Thank you for subscribing to our {plan === 'premium' ? 'Premium' : 'Pro'} plan.
          Your account has been upgraded and you now have access to all premium features.
        </p>

        {subscriptionDetails && (
          <div className="bg-gray-50 p-4 rounded-md mb-6 text-left">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Subscription Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
              <div>
                <span className="font-medium text-gray-700">Status:</span>{' '}
                <span className={subscriptionDetails.status === 'active' ? 'text-green-600' : 'text-red-600'}>
                  {subscriptionDetails.status === 'active' ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div>
                <span className="font-medium text-gray-700">Plan:</span>{' '}
                <span className="text-gray-900">{subscriptionDetails.plan || plan}</span>
              </div>
              {subscriptionDetails.current_period_end && (
                <div>
                  <span className="font-medium text-gray-700">Valid until:</span>{' '}
                  <span className="text-gray-900">
                    {new Date(subscriptionDetails.current_period_end).toLocaleDateString()}
                  </span>
                </div>
              )}
              {subscriptionDetails.customer && (
                <div>
                  <span className="font-medium text-gray-700">Customer ID:</span>{' '}
                  <span className="text-gray-900 font-mono text-xs">
                    {subscriptionDetails.customer.substring(0, 8)}...
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="bg-blue-50 p-4 rounded-md mb-8">
          <h2 className="text-xl font-semibold text-blue-800 mb-2">What's Next?</h2>
          <ul className="text-left text-blue-700 space-y-2 pl-6 list-disc">
            <li>Try out the AI Resume Generator to create professional resumes</li>
            <li>Access all premium templates and features</li>
            <li>Create unlimited resumes for different job applications</li>
            <li>Get priority support for any questions</li>
          </ul>
        </div>

        <div className="flex flex-col sm:flex-row justify-center gap-4">
          <Button as="link" to="/dashboard" className="flex-1">
            Go to Dashboard
          </Button>
          <Button as="link" to="/builder" variant="outline" className="flex-1">
            Create a Resume
          </Button>
        </div>
      </div>

      <p className="text-gray-600">
        If you have any questions about your subscription, please{' '}
        <Link to="/contact" className="text-blue-600 hover:underline">
          contact our support team
        </Link>.
      </p>

      <div className="mt-8 text-sm text-gray-500">
        <p>Subscription processed via {method === 'direct' ? 'Direct Checkout' : 'Server Checkout'}</p>
        {sessionId && (
          <p className="font-mono text-xs mt-1">Session ID: {sessionId.substring(0, 8)}...</p>
        )}
      </div>
    </div>
  );
};

export default SubscriptionSuccess;
