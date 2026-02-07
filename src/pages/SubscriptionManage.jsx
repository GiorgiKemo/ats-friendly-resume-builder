import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import Button from '../components/ui/Button';
import toast from 'react-hot-toast';
import { supabase } from '../services/supabase';

/**
 * Fallback subscription management page when Stripe Customer Portal is not available
 */
const SubscriptionManage = () => {
  const { user } = useAuth();
  const { isPremium, subscriptionData, refreshSubscriptionStatus } = useSubscription();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
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

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // Handle cancellation
  const handleCancelSubscription = async () => {
    try {
      setLoading(true);

      if (!import.meta.env.DEV) {
        toast.error('Subscription changes must be managed in the Stripe Customer Portal.');
        setLoading(false);
        return;
      }

      // Confirm cancellation
      if (!window.confirm('Are you sure you want to cancel your subscription? You will lose access to premium features at the end of your billing period.')) {
        setLoading(false);
        return;
      }

      // For development, we'll just update the database directly
      // In production, this would call a secure backend endpoint
      const { error } = await supabase
        .from('users')
        .update({
          is_premium: false,
          premium_plan: null,
          premium_updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (error) {
        throw new Error(error.message);
      }

      // Refresh subscription status
      await refreshSubscriptionStatus();

      toast.success('Your subscription has been canceled. You will have access until the end of your billing period.');

      // Redirect after a short delay
      setTimeout(() => {
        // Redirecting after cancellation

        // If it's an external URL, use window.location.href
        if (returnUrl.startsWith('http')) {
          window.location.href = returnUrl;
        } else {
          // Otherwise use React Router navigation
          // Remove leading slash for hash router compatibility
          const path = returnUrl.startsWith('/') ? returnUrl.substring(1) : returnUrl;
          navigate(path);
        }
      }, 3000);

    } catch (error) {
      console.error('Error canceling subscription:', error);
      toast.error('Failed to cancel subscription. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Handle return to app
  const handleReturn = () => {
    // Returning to previous page

    // If it's an external URL, use window.location.href
    if (returnUrl.startsWith('http')) {
      window.location.href = returnUrl;
    } else {
      // Otherwise use React Router navigation
      // Remove leading slash for hash router compatibility
      const path = returnUrl.startsWith('/') ? returnUrl.substring(1) : returnUrl;
      navigate(path);
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-12 px-4">
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-6 py-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Manage Your Subscription</h1>
          <p className="text-sm text-gray-500 mb-6">
            You're using the local subscription management interface. Some advanced features may only be available in the Stripe Customer Portal.
          </p>

          {isPremium ? (
            <div className="space-y-6">
              <div className="bg-blue-50 p-4 rounded-md">
                <h2 className="text-lg font-medium text-blue-800">Current Plan</h2>
                <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Plan</p>
                    <p className="mt-1 text-lg font-semibold text-gray-900">
                      {subscriptionData?.premiumPlan === 'premium_yearly' ? 'Premium (Yearly)' : 'Premium (Monthly)'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Status</p>
                    <p className="mt-1 text-lg font-semibold text-green-600">Active</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Billing Period Ends</p>
                    <p className="mt-1 text-lg font-semibold text-gray-900">
                      {formatDate(subscriptionData?.premiumUntil)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">AI Generations</p>
                    <p className="mt-1 text-lg font-semibold text-gray-900">
                      {subscriptionData?.aiGenerationsUsed || 0} / {subscriptionData?.aiGenerationsLimit || 0} used
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">Subscription Management</h2>
                <div className="flex flex-col space-y-4 sm:flex-row sm:space-y-0 sm:space-x-4">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={handleCancelSubscription}
                    disabled={loading}
                  >
                    {loading ? 'Processing...' : 'Cancel Subscription'}
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleReturn}
                  >
                    Return to App
                  </Button>
                </div>
                <p className="mt-4 text-sm text-gray-500">
                  If you cancel, you'll still have access to premium features until the end of your current billing period.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-yellow-50 p-4 rounded-md">
                <h2 className="text-lg font-medium text-yellow-800">No Active Subscription</h2>
                <p className="mt-2 text-sm text-yellow-700">
                  You don't currently have an active premium subscription.
                </p>
              </div>

              <div className="border-t border-gray-200 pt-6">
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
