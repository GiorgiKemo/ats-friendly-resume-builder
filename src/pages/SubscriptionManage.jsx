import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import Button from '../components/ui/Button';
import { createCustomerPortalSession } from '../services/stripeService';
import { SUPPORT_EMAIL } from '../config/supportInfo';

/**
 * Subscription overview and secure entry point to Stripe billing management.
 */
const SubscriptionManage = () => {
  const { user } = useAuth();
  const { isPremium, subscriptionData, loading: subscriptionLoading } = useSubscription();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [portalError, setPortalError] = useState('');
  const portalRequest = useRef({ generation: 0, pending: false });
  // Get return URL from query params, defaulting to pricing page if not provided
  // Make sure it's a full URL or a valid relative path
  const rawReturnUrl = searchParams.get('return_url');
  const normalizeReturnUrl = (rawUrl) => {
    if (!rawUrl || typeof rawUrl !== 'string') return '/pricing';

    let candidate = rawUrl.trim();

    if (candidate.startsWith('http')) {
      try {
        const parsed = new URL(candidate);
        if (parsed.origin !== window.location.origin) return '/pricing';
        candidate = `${parsed.pathname}${parsed.search}${parsed.hash}`;
      } catch {
        return '/pricing';
      }
    }

    if (candidate.startsWith('/#/')) {
      candidate = candidate.substring(2); // "/#/path" -> "/path"
    } else if (candidate.startsWith('#/')) {
      candidate = candidate.substring(1); // "#/path" -> "/path"
    }

    if (!candidate.startsWith('/')) {
      candidate = `/${candidate}`;
    }

    if (candidate.startsWith('//')) {
      return '/pricing';
    }

    return candidate;
  };

  const returnUrl = normalizeReturnUrl(rawReturnUrl);

  // Redirect if not logged in
  useEffect(() => {
    if (!user) {
      navigate('/signin');
    }
  }, [user, navigate]);

  useEffect(() => {
    const requestState = portalRequest.current;
    requestState.generation += 1;
    requestState.pending = false;
    setLoading(false);
    setPortalError('');
    return () => { requestState.generation += 1; };
  }, [user?.id]);

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // Stripe is authoritative for changes; opening the portal does not cancel a plan.
  const handleManageBilling = async () => {
    if (!user || portalRequest.current.pending) return;
    portalRequest.current.pending = true;
    const generation = portalRequest.current.generation;
    setLoading(true);
    setPortalError('');
    try {
      const portalUrl = await createCustomerPortalSession(window.location.href, false);
      if (generation !== portalRequest.current.generation) return;
      const destination = new URL(portalUrl);
      // A local fallback is this same screen, not a working cancellation flow.
      if (destination.protocol !== 'https:' || destination.origin === window.location.origin) {
        throw new Error('No secure billing portal is available');
      }
      window.location.assign(destination.href);
    } catch {
      if (generation !== portalRequest.current.generation) return;
      setPortalError('We could not open Stripe billing. Your subscription has not been changed. Please try again or contact support.');
    } finally {
      if (generation === portalRequest.current.generation) {
        portalRequest.current.pending = false;
        setLoading(false);
      }
    }
  };

  // Handle return to app
  const handleReturn = () => {
    navigate(returnUrl);
  };

  return (
    <div className="max-w-3xl mx-auto py-12 px-4">
      <div className="bg-white dark:bg-slate-800 shadow rounded-lg overflow-hidden">
        <div className="px-6 py-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100 mb-2">Manage Your Subscription</h1>
          <p className="text-sm text-gray-500 dark:text-slate-500 mb-6">
            Review your plan here. Manage payments, invoices, or cancellation securely in Stripe.
          </p>

          {subscriptionLoading ? (
            <p role="status" className="text-gray-600 dark:text-slate-300">Loading your subscription...</p>
          ) : isPremium || subscriptionData?.stripeCustomerId ? (
            <div className="space-y-6">
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-md">
                <h2 className="text-lg font-medium text-blue-800 dark:text-blue-300">Current Plan</h2>
                <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-sm font-medium text-gray-500 dark:text-slate-500">Plan</p>
                    <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-slate-100">
                      {subscriptionData?.premiumPlan === 'premium_yearly' ? 'Premium (Yearly)' : subscriptionData?.premiumPlan === 'premium_monthly' ? 'Premium (Monthly)' : 'Premium'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500 dark:text-slate-500">Status</p>
                    <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-slate-100">{isPremium ? 'Active' : 'Inactive — check billing in Stripe'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500 dark:text-slate-500">Billing Period Ends</p>
                    <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-slate-100">
                      {formatDate(subscriptionData?.premiumUntil)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500 dark:text-slate-500">AI Generations</p>
                    <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-slate-100">
                      {subscriptionData?.aiGenerationsUsed || 0} / {subscriptionData?.aiGenerationsLimit || 0} used
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-200 dark:border-slate-600 pt-6">
                <h2 className="text-lg font-medium text-gray-900 dark:text-slate-100 mb-4">Subscription Management</h2>
                <div className="flex flex-col space-y-4 sm:flex-row sm:space-y-0 sm:space-x-4">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={handleManageBilling}
                    disabled={loading}
                    aria-busy={loading}
                    aria-describedby={portalError ? 'billing-portal-error' : undefined}
                  >
                    {loading ? 'Opening Stripe...' : portalError ? 'Try billing again' : 'Manage or cancel in Stripe'}
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleReturn}
                  >
                    Return to App
                  </Button>
                </div>
                {portalError && (
                  <p id="billing-portal-error" role="alert" className="mt-4 text-sm text-red-700 dark:text-red-300">
                    {portalError}{' '}
                    <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium underline">Contact support</a>
                  </p>
                )}
                <p className="mt-4 text-sm text-gray-500 dark:text-slate-500">
                  You can review and confirm cancellation in Stripe. Opening the portal does not change your subscription.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-md">
                <h2 className="text-lg font-medium text-yellow-800 dark:text-yellow-300">No Active Subscription</h2>
                <p className="mt-2 text-sm text-yellow-700 dark:text-yellow-300">
                  You don't currently have an active premium subscription.
                </p>
              </div>

              <div className="border-t border-gray-200 dark:border-slate-600 pt-6">
                <div className="flex flex-col space-y-4 sm:flex-row sm:space-y-0 sm:space-x-4">
                  <Button
                    variant="outline"
                    className="flex-1"
                    as="link"
                    to="/pricing"
                  >
                    View Plans
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleReturn}
                  >
                    Return to App
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SubscriptionManage;
