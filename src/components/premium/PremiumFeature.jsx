import React from 'react';
import { Link } from 'react-router-dom';
import { useSubscription } from '../../context/SubscriptionContext';

/**
 * A component that conditionally renders content based on premium status
 * 
 * @param {Object} props
 * @param {React.ReactNode} props.children - The premium content to render if user has premium
 * @param {React.ReactNode} props.fallback - Optional content to render if user doesn't have premium
 * @param {boolean} props.showUpgradeMessage - Whether to show a message prompting user to upgrade
 */
const PremiumFeature = ({ 
  children, 
  fallback = null, 
  showUpgradeMessage = true 
}) => {
  const { isPremium, loading } = useSubscription();

  if (loading) {
    return (
      <div className="p-4 bg-gray-100 rounded-md animate-pulse">
        <div className="h-6 bg-gray-300 rounded w-3/4 mb-2"></div>
        <div className="h-4 bg-gray-300 rounded w-1/2"></div>
      </div>
    );
  }

  if (isPremium) {
    return <>{children}</>;
  }

  return (
    <>
      {fallback}
      
      {showUpgradeMessage && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-md my-4">
          <h3 className="text-lg font-semibold text-blue-800 mb-2">Premium Feature</h3>
          <p className="text-blue-700 mb-3">
            This feature is available exclusively to Premium users.
          </p>
          <Link 
            to="/pricing" 
            className="inline-block px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Upgrade to Premium
          </Link>
        </div>
      )}
    </>
  );
};

export default PremiumFeature;
