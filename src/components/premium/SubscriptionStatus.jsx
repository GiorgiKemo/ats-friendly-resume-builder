import React from 'react';
import { useSubscription } from '../../context/SubscriptionContext';
import { Link } from 'react-router-dom';
import Button from '../ui/Button';
import SubscriptionManager from './SubscriptionManager';

const SubscriptionStatus = () => {
  const {
    isPremium,
    loading,
    error,
    subscriptionData,
    premiumPlan,
    refreshSubscriptionStatus
  } = useSubscription();

  if (loading) {
    return (
      <div className="p-4 bg-gray-100 rounded-md animate-pulse">
        <div className="h-6 bg-gray-300 rounded w-3/4 mb-2"></div>
        <div className="h-4 bg-gray-300 rounded w-1/2"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-md">
        <h3 className="text-lg font-semibold text-red-800 mb-2">Error</h3>
        <p className="text-red-700 mb-4">{error}</p>
        <Button
          onClick={refreshSubscriptionStatus}
          className="bg-red-600 hover:bg-red-700 text-white"
        >
          Retry
        </Button>
      </div>
    );
  }

  if (!isPremium) {
    return (
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
        <h3 className="text-lg font-semibold text-blue-800 mb-2">Free Plan</h3>
        <p className="text-blue-700 mb-4">
          You are currently on the free plan. Upgrade to premium to access all features.
        </p>
        <Link to="/pricing">
          <Button className="bg-blue-600 hover:bg-blue-700 text-white">
            Upgrade to Premium
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 bg-green-50 border border-green-200 rounded-md">
      <h3 className="text-lg font-semibold text-green-800 mb-2">
        Premium Plan Active
      </h3>

      <div className="space-y-2 mb-4">
        <p className="text-green-700">
          <span className="font-medium">Plan:</span> {premiumPlan || 'Premium'}
        </p>

        {subscriptionData?.premiumUntil && (
          <p className="text-green-700">
            <span className="font-medium">Valid until:</span> {new Date(subscriptionData.premiumUntil).toLocaleDateString()}
          </p>
        )}

        {subscriptionData?.premiumUpdatedAt && (
          <p className="text-green-700">
            <span className="font-medium">Last updated:</span> {new Date(subscriptionData.premiumUpdatedAt).toLocaleDateString()}
          </p>
        )}

        {/* AI Generation Limit Tracker */}
        <div className="mt-3 mb-2">
          <div className="flex justify-between items-center mb-1">
            <span className="text-sm font-medium text-green-800">AI Generations</span>
            <span className="text-sm font-medium text-green-800">
              {subscriptionData?.remainingGenerations || 0} / {subscriptionData?.aiGenerationsLimit || 0} remaining
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div
              className={`h-2.5 rounded-full transition-all duration-300 ease-in-out ${(subscriptionData?.remainingGenerations || 0) === 0 ? 'bg-red-500' :
                (subscriptionData?.remainingGenerations || 0) < 5 ? 'bg-yellow-500' : 'bg-green-500'
                }`}
              style={{
                width: `${subscriptionData?.aiGenerationsLimit ?
                  Math.max(0, Math.min(100, ((subscriptionData?.aiGenerationsUsed || 0) / subscriptionData.aiGenerationsLimit) * 100)) : 0}%`
              }}
            ></div>
          </div>
          <p className="text-xs text-green-700 mt-1">
            {(subscriptionData?.remainingGenerations || 0) === 0 ? (
              <span className="text-red-600 font-medium">You've reached your monthly limit</span>
            ) : (subscriptionData?.remainingGenerations || 0) < 5 ? (
              <span className="text-yellow-600">You're running low on AI generations this month</span>
            ) : (
              <span>Each generation counts toward your monthly limit</span>
            )}
          </p>
        </div>
      </div>

      <div className="flex justify-between">
        <div>
          <Button
            onClick={refreshSubscriptionStatus}
            variant="outline"
            className="text-green-700 border-green-300 hover:bg-green-100"
          >
            Refresh
          </Button>
        </div>

        <div>
          <SubscriptionManager
            buttonVariant="primary"
            className="bg-green-600 hover:bg-green-700 text-white"
            buttonText="Manage Subscription"
          />
        </div>
      </div>
    </div>
  );
};

export default SubscriptionStatus;
