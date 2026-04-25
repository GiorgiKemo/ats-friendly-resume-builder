import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../services/supabase';

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
      return;
    }


    try {
      setLoading(true);
      setError(null);

      // First, try to get the user's premium status directly from the users table
      // This is a fallback in case the RPC function isn't working
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('is_premium, premium_until, premium_plan, premium_updated_at, ai_generations_used, ai_generations_limit, stripe_customer_id')
        .eq('id', user.id)
        .maybeSingle();

      if (userError?.code === 'PGRST116') {
        setIsPremium(false);
        setSubscriptionData(null);
        return;
      }

      if (userError) {
        console.error('Error fetching user data:', userError);
        setIsPremium(false);
        setSubscriptionData(null);
        return;
      }


      const profile = userData || {};

      // Newly-created auth users can briefly exist before the public users row is available.
      // Treat that as a free account instead of throwing and surfacing a console error.
      const isPremiumValue = profile.is_premium || false;
      setIsPremium(isPremiumValue);

      // Try to get remaining AI generations
      let remainingGenerations = 0;

      if (isPremiumValue) {
        // Calculate remaining generations directly
        remainingGenerations = Math.max(0,
          (profile.ai_generations_limit || 0) - (profile.ai_generations_used || 0)
        );
      }

      // Set subscription data
      const subscriptionDataObj = {
        isPremium: isPremiumValue,
        premiumPlan: profile.premium_plan,
        premiumUntil: profile.premium_until,
        premiumUpdatedAt: profile.premium_updated_at,
        aiGenerationsUsed: profile.ai_generations_used || 0,
        aiGenerationsLimit: profile.ai_generations_limit || 0,
        remainingGenerations: remainingGenerations,
        stripeCustomerId: profile.stripe_customer_id
      };

      setSubscriptionData(subscriptionDataObj);

      // Now try to use the RPC functions for future calls
      // But don't block the UI if they fail
      try {
        // Try to use the secure server-side function to check premium status
        const { data: premiumData, error: premiumError } = await supabase
          .rpc('check_premium_status');

        if (!premiumError) {
          // Update premium status if the RPC call was successful
          setIsPremium(premiumData);

          // Update subscription data with the new premium status
          setSubscriptionData(prevData => {
            const updatedData = {
              ...prevData,
              isPremium: premiumData
            };
            return updatedData;
          });
        }
      } catch {
        // Non-blocking RPC error
      }

    } catch (err) {
      console.error('Error fetching subscription status:', err);
      setError('Failed to load subscription status');
      setIsPremium(false);
      setSubscriptionData(null);
    } finally {
      setLoading(false);
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
      return false;
    }

    try {
      const { data: success, error } = await supabase
        .rpc('track_ai_generation_secure');

      if (error) {
        console.error('Error tracking AI generation usage:', error);
        return false;
      }

      if (success) await fetchSubscriptionStatus();
      return Boolean(success);
    } catch (err) {
      console.error('Error tracking AI generation usage:', err);
      return false;
    }
  }, [user, fetchSubscriptionStatus]);

  const getAIGenerationAccess = useCallback(async () => {
    if (!user) {
      return { allowed: false, reason: 'signin_required' };
    }

    if (loading) {
      return { allowed: false, reason: 'loading' };
    }

    if (!isPremium) {
      return { allowed: false, reason: 'upgrade_required' };
    }

    try {
      try {
        const { data: remaining, error } = await supabase
          .rpc('get_remaining_ai_generations');

        if (!error) {
          return remaining > 0
            ? { allowed: true, reason: 'allowed', remaining }
            : { allowed: false, reason: 'limit_reached', remaining: 0 };
        }
      } catch {
        // Non-blocking RPC error
      }

      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('ai_generations_used, ai_generations_limit')
        .eq('id', user.id)
        .single();

      if (userError) {
        console.error('Error fetching user data for AI generation check:', userError);
        return { allowed: false, reason: 'unavailable' };
      }

      const currentUsed = userData.ai_generations_used || 0;
      const currentLimit = userData.ai_generations_limit || 0;
      const remaining = Math.max(0, currentLimit - currentUsed);

      return remaining > 0
        ? { allowed: true, reason: 'allowed', remaining }
        : { allowed: false, reason: 'limit_reached', remaining: 0 };
    } catch (err) {
      console.error('Error checking AI generation availability:', err);
      return { allowed: false, reason: 'unavailable' };
    }
  }, [user, loading, isPremium]);

  // Check if user can use AI generation
  const canUseAIGeneration = useCallback(async () => {
    const access = await getAIGenerationAccess();
    return access.allowed;
  }, [getAIGenerationAccess]);

  // Get remaining AI generations
  const getRemainingAIGenerations = useCallback(() => {
    if (!subscriptionData) {
      return 0;
    }
    const remaining = subscriptionData.remainingGenerations || 0;
    return remaining;
  }, [subscriptionData]);

  const value = {
    isPremium,
    loading,
    error,
    subscriptionData,
    premiumPlan: subscriptionData?.isPremium ? (subscriptionData?.premiumPlan || 'premium_monthly') : null,
    incrementAIGenerationUsage,
    getAIGenerationAccess,
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
