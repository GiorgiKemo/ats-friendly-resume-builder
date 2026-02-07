import React from 'react';
import { Navigate, useLocation } from 'react-router-dom'; // Import useLocation
import { useAuth } from '../../context/AuthContext';
import { useSubscription } from '../../context/SubscriptionContext'; // Import useSubscription

const DEBUG_AUTH = import.meta.env.DEV && import.meta.env.VITE_DEBUG_AUTH === 'true';

const ProtectedRoute = ({ children }) => {
  const { user, loading, session } = useAuth(); // Add session for more context
  const { isPremium, subscriptionStatus } = useSubscription(); // Get subscription context
  const location = useLocation(); // Get current location
  const childType = children?.type?.name || 'UnknownComponent'; // Get component name if possible

  // Enhanced logging at the start
  if (DEBUG_AUTH) {
    console.log(
      `[ProtectedRoute] Path: ${location.pathname}${location.hash}` +
      ` | Rendering for <${childType}>` +
      ` | Auth Loading: ${loading}` +
      ` | User: ${!!user}` +
      ` | Session: ${!!session}` +
      ` | isPremium: ${isPremium}` +
      ` | Sub Status: ${subscriptionStatus}`
    );
  }

  // Show loading state while checking authentication
  if (loading) {
    if (DEBUG_AUTH) {
      console.log(`[ProtectedRoute] Path: ${location.pathname}${location.hash} | Auth loading for <${childType}>. Showing loading indicator.`);
    }
    return <div className="flex justify-center items-center h-screen">Loading...</div>;
  }

  // Redirect to sign in if not authenticated
  if (!user) {
    if (DEBUG_AUTH) {
      console.warn(
        `[ProtectedRoute] Path: ${location.pathname}${location.hash}` +
        ` | User NOT authenticated for <${childType}> (User: ${!!user}, Session: ${!!session}, isPremium: ${isPremium}). Redirecting to /signin.`
      );
    }
    return <Navigate to="/signin" replace />;
  }

  // Check if user object seems valid (optional, but good for debugging)
  if (!user.id || !user.email) {
    if (DEBUG_AUTH) {
      console.warn(`[ProtectedRoute] Path: ${location.pathname}${location.hash} | User object seems incomplete for <${childType}>`, user);
    }
  }

  // Log before rendering children
  if (DEBUG_AUTH) {
    console.log(
      `[ProtectedRoute] Path: ${location.pathname}${location.hash}` +
      ` | User authenticated for <${childType}>.` +
      ` | User ID: ${user?.id}` +
      ` | isPremium: ${isPremium}` +
      ` | Rendering children.`
    );
  }
  return children;
};

export default ProtectedRoute;
