import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../services/supabase';
import toast from 'react-hot-toast';

// Debug flag - set to true to enable detailed debugging
const DEBUG_SUBSCRIPTION = false;

// Debug logger function
const debugLog = (_message, _data) => { // Parameters were unused when DEBUG_SUBSCRIPTION is false
  if (DEBUG_SUBSCRIPTION) {
    // Production mode - no debug logs
    // Optionally show toast for important events
    // toast(`[SUBSCRIPTION] ${message}`);
  }
};

const SubscriptionContext = createContext();

export function SubscriptionProvider({ children }) {
  const { user } = useAuth();
  const [isPremium, setIsPremium] = useState(false);
  const [loading, setLoading] = useState(true);
  const [subscriptionData, setSubscriptionData] = useState(null);
  const [error, setError] = useState(null);

  // Fetch the user's subscription status from Supabase using secure functions
  const fetchSubscriptionStatus = useCallback(async () => {
    if (!user) {
      debugLog('fetchSubscriptionStatus: No user, skipping');
      return;
    }

    debugLog(`fetchSubscriptionStatus: Starting for user ${user.id}`);

    try {
      setLoading(true);
      setError(null);

      // First, try to get the user's premium status directly from the users table
      // This is a fallback in case the RPC function isn't working
      debugLog('fetchSubscriptionStatus: Querying users table');
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('is_premium, premium_until, premium_plan, premium_updated_at, ai_generations_used, ai_generations_limit, stripe_customer_id')
        .eq('id', user.id)
        .single();

      if (userError) {
        console.error('Error fetching user data:', userError);
        debugLog('fetchSubscriptionStatus: Error fetching user data', userError);
        setIsPremium(false);
        setSubscriptionData(null);
        return;
      }

      debugLog('fetchSubscriptionStatus: User data retrieved', userData);

      // Set premium status from the user data
      const isPremiumValue = userData.is_premium || false;
      setIsPremium(isPremiumValue);
      debugLog(`fetchSubscriptionStatus: Premium status set to ${isPremiumValue}`);

      // Try to get remaining AI generations
      let remainingGenerations = 0;

      if (isPremiumValue) {
        // Calculate remaining generations directly
        remainingGenerations = Math.max(0,
          (userData.ai_generations_limit || 0) - (userData.ai_generations_used || 0)
        );
        debugLog(`fetchSubscriptionStatus: Remaining AI generations: ${remainingGenerations}`);
      }

      // Set subscription data
      const subscriptionDataObj = {
        isPremium: isPremiumValue,
        premiumPlan: userData.premium_plan,
        premiumUntil: userData.premium_until,
        premiumUpdatedAt: userData.premium_updated_at,
        aiGenerationsUsed: userData.ai_generations_used || 0,
        aiGenerationsLimit: userData.ai_generations_limit || 0,
        remainingGenerations: remainingGenerations,
        stripeCustomerId: userData.stripe_customer_id
      };

      setSubscriptionData(subscriptionDataObj);
      debugLog('fetchSubscriptionStatus: Subscription data set', subscriptionDataObj);

      // Now try to use the RPC functions for future calls
      // But don't block the UI if they fail
      try {
        // Try to use the secure server-side function to check premium status
        debugLog('fetchSubscriptionStatus: Calling RPC check_premium_status');
        const { data: premiumData, error: premiumError } = await supabase
          .rpc('check_premium_status');

        if (!premiumError) {
          // Update premium status if the RPC call was successful
          debugLog(`fetchSubscriptionStatus: RPC returned premium status: ${premiumData}`);
          setIsPremium(premiumData);

          // Update subscription data with the new premium status
          setSubscriptionData(prevData => {
            const updatedData = {
              ...prevData,
              isPremium: premiumData
            };
            debugLog('fetchSubscriptionStatus: Updated subscription data with RPC result', updatedData);
            return updatedData;
          });
        } else {
          debugLog('fetchSubscriptionStatus: RPC check_premium_status error', premiumError);
        }
      } catch (rpcError) {
        console.error('RPC check_premium_status error (non-blocking):', rpcError);
        debugLog('fetchSubscriptionStatus: RPC check_premium_status exception', rpcError);
      }

    } catch (err) {
      console.error('Error fetching subscription status:', err);
      debugLog('fetchSubscriptionStatus: Exception', err);
      setError('Failed to load subscription status');
      setIsPremium(false);
      setSubscriptionData(null);
    } finally {
      setLoading(false);
      debugLog('fetchSubscriptionStatus: Completed');
    }
  }, [user]);

  // Fetch user's subscription status when user changes
  useEffect(() => {
    if (user) {
      fetchSubscriptionStatus();
    } else {
      setIsPremium(false);
      setSubscriptionData(null);
      setLoading(false);
    }
  }, [user, fetchSubscriptionStatus]);

  // Premium status is managed through Stripe subscriptions in production

  // Track AI generation usage using secure server-side function
  const incrementAIGenerationUsage = useCallback(async () => {
    if (!user) {
      debugLog('incrementAIGenerationUsage: No user, skipping');
      return false;
    }

    debugLog(`incrementAIGenerationUsage: Starting for user ${user.id}`);

    try {
      // First try the RPC function
      try {
        // Use the secure server-side function to track AI generation usage
        debugLog('incrementAIGenerationUsage: Calling RPC track_ai_generation_secure');
        const { data: success, error } = await supabase
          .rpc('track_ai_generation_secure');

        if (!error && success) {
          debugLog('incrementAIGenerationUsage: RPC successful, refreshing subscription data');
          // Refresh subscription data to get updated counts
          await fetchSubscriptionStatus();
          return true;
        } else if (error) {
          debugLog('incrementAIGenerationUsage: RPC error', error);
        } else {
          debugLog('incrementAIGenerationUsage: RPC returned false (limit reached or not premium)');
        }
      } catch (rpcError) {
        console.error('RPC track_ai_generation_secure error:', rpcError);
        debugLog('incrementAIGenerationUsage: RPC exception', rpcError);
      }

      // Fallback: Update the usage directly in the database
      if (isPremium) {
        debugLog('incrementAIGenerationUsage: Using fallback method (direct DB update)');

        // Get current usage
        debugLog('incrementAIGenerationUsage: Fetching current usage data');
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('ai_generations_used, ai_generations_limit')
          .eq('id', user.id)
          .single();

        if (userError) {
          console.error('Error fetching user data for AI generation:', userError);
          debugLog('incrementAIGenerationUsage: Error fetching user data', userError);
          return false;
        }

        const currentUsed = userData.ai_generations_used || 0;
        const currentLimit = userData.ai_generations_limit || 0;
        debugLog(`incrementAIGenerationUsage: Current usage: ${currentUsed}/${currentLimit}`);

        // Check if user has reached their limit
        if (currentUsed >= currentLimit) {
          debugLog('incrementAIGenerationUsage: Usage limit reached, cannot increment');
          toast.error('You have reached your AI generation limit for this month');
          return false;
        }

        // Increment the usage
        debugLog(`incrementAIGenerationUsage: Incrementing usage from ${currentUsed} to ${currentUsed + 1}`);
        const { error: updateError } = await supabase
          .from('users')
          .update({ ai_generations_used: currentUsed + 1 })
          .eq('id', user.id);

        if (updateError) {
          console.error('Error updating AI generation usage:', updateError);
          debugLog('incrementAIGenerationUsage: Error updating usage', updateError);
          return false;
        }

        // Refresh subscription data
        debugLog('incrementAIGenerationUsage: Update successful, refreshing subscription data');
        await fetchSubscriptionStatus();
        return true;
      } else {
        debugLog('incrementAIGenerationUsage: User is not premium, cannot increment');
      }

      return false;
    } catch (err) {
      console.error('Error tracking AI generation usage:', err);
      debugLog('incrementAIGenerationUsage: Exception', err);
      return false;
    }
  }, [user, fetchSubscriptionStatus]); // Removed global isPremium from deps

  // Check if user can use AI generation
  const canUseAIGeneration = useCallback(async () => {
    if (!user) {
      debugLog('canUseAIGeneration: No user, returning false');
      return false;
    }

    if (!isPremium) {
      debugLog('canUseAIGeneration: User is not premium, returning false');
      return false;
    }

    debugLog(`canUseAIGeneration: Checking for user ${user.id}`);

    try {
      // First try the RPC function
      try {
        // Use the secure server-side function to get remaining generations
        debugLog('canUseAIGeneration: Calling RPC get_remaining_ai_generations');
        const { data: remaining, error } = await supabase
          .rpc('get_remaining_ai_generations');

        if (!error) {
          const canUse = remaining > 0;
          debugLog(`canUseAIGeneration: RPC returned remaining: ${remaining}, canUse: ${canUse}`);
          return canUse;
        } else {
          debugLog('canUseAIGeneration: RPC error', error);
        }
      } catch (rpcError) {
        console.error('RPC get_remaining_ai_generations error:', rpcError);
        debugLog('canUseAIGeneration: RPC exception', rpcError);
      }

      // Fallback: Calculate remaining generations directly
      debugLog('canUseAIGeneration: Using fallback method (direct DB query)');
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('ai_generations_used, ai_generations_limit')
        .eq('id', user.id)
        .single();

      if (userError) {
        console.error('Error fetching user data for AI generation check:', userError);
        debugLog('canUseAIGeneration: Error fetching user data', userError);
        return false;
      }

      const currentUsed = userData.ai_generations_used || 0;
      const currentLimit = userData.ai_generations_limit || 0;
      const canUse = currentUsed < currentLimit;

      debugLog(`canUseAIGeneration: Current usage: ${currentUsed}/${currentLimit}, canUse: ${canUse}`);
      return canUse;
    } catch (err) {
      console.error('Error checking AI generation availability:', err);
      debugLog('canUseAIGeneration: Exception', err);
      return false;
    }
  }, [user]); // Removed global isPremium from deps

  // Get remaining AI generations
  const getRemainingAIGenerations = useCallback(() => {
    if (!subscriptionData) {
      debugLog('getRemainingAIGenerations: No subscription data, returning 0');
      return 0;
    }
    const remaining = subscriptionData.remainingGenerations || 0;
    debugLog(`getRemainingAIGenerations: Returning ${remaining} remaining generations`);
    return remaining;
  }, [subscriptionData]);

  const value = {
    isPremium,
    loading,
    error,
    subscriptionData,
    premiumPlan: subscriptionData?.isPremium ? (subscriptionData?.premiumPlan || 'premium') : null,
    incrementAIGenerationUsage,
    canUseAIGeneration,
    getRemainingAIGenerations,
    refreshSubscriptionStatus: fetchSubscriptionStatus
  };

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
}
