import React, { useEffect, useState, useRef } from 'react'; // Added useRef
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { useSubscription } from '../context/SubscriptionContext';
import toast from 'react-hot-toast';

const DEBUG_STRIPE_RETURN = import.meta.env.DEV && import.meta.env.VITE_DEBUG_STRIPE === 'true';
const debugLog = (...args) => {
    if (DEBUG_STRIPE_RETURN) console.log(...args);
};

const StripeReturnPage = () => {
    const { sessionId: sessionIdParam } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { refreshSubscriptionStatus } = useSubscription();

    const [status, setStatus] = useState('loading'); // 'loading', 'success', 'error'
    const [error, setError] = useState(null);
    const hasProcessedSession = useRef(false); // Initialize ref
    const getSafeRedirectPath = (path) => {
        if (!path || typeof path !== 'string') return null;
        const trimmed = path.trim();
        if (!trimmed.startsWith('/')) return null;
        if (trimmed.startsWith('//')) return null;
        if (trimmed.startsWith('/\\') || trimmed.includes('://')) return null;
        return trimmed;
    };

    const queryParams = new URLSearchParams(location.search);
    const sessionIdQuery = queryParams.get('session_id') || queryParams.get('sessionId');
    const sessionId = sessionIdParam || sessionIdQuery;

    useEffect(() => {
        const verifySession = async () => {
            // Early exit if no sessionId or if already processed
            if (!sessionId || hasProcessedSession.current) {
                if (hasProcessedSession.current && !sessionId) {
                    // If already processed but somehow sessionId became null (unlikely), set error
                    setStatus('error');
                    setError('Session ID became invalid after processing.');
                } else if (!sessionId) {
                    setStatus('error');
                    setError('No session ID found in URL.');
                    console.error('[StripeReturnPage] No sessionId found in URL params.');
                }
                return;
            }

            debugLog(`[StripeReturnPage] Verifying session ID: ${sessionId}`);
            setStatus('loading');

            // Mark as processing *before* the async operations
            // This prevents re-entry if the component re-renders while verifySession is running
            hasProcessedSession.current = true;

            try {
                const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

                if (sessionError || !sessionData?.session?.access_token) {
                    setStatus('error');
                    setError('Could not retrieve user session. Please try logging in again.');
                    console.error('[StripeReturnPage] Error getting user session:', sessionError);
                    toast.error('Authentication error. Please log in and try again.');
                    navigate('/signin'); // Redirect to sign-in if no session
                    return;
                }

                const token = sessionData.session.access_token;

                debugLog('[StripeReturnPage] Invoking verify-checkout-session function...');
                const { data: verificationData, error: verificationError } = await supabase.functions.invoke(
                    'verify-checkout-session',
                    {
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                        body: { sessionId },
                    }
                );

                if (verificationError) {
                    setStatus('error');
                    setError(`Payment verification failed: ${verificationError.message}`);
                    console.error('[StripeReturnPage] Error verifying checkout session:', verificationError);
                    toast.error(`Verification failed: ${verificationError.message}`);
                    // Optionally navigate to a payment failed page or back to pricing
                    // navigate('/pricing'); 
                    return;
                }

                debugLog('[StripeReturnPage] Verification successful:', verificationData);
                setStatus('success');
                // THE SINGLE TOAST CALL - now it's guaranteed to run once per successful processing
                toast.success('Your subscription has been updated!');

                // Refresh client-side subscription status
                await refreshSubscriptionStatus();

                // Handle redirect
                const redirectPath = queryParams.get('redirect');
                const safeRedirectPath = getSafeRedirectPath(redirectPath);

                if (safeRedirectPath) {
                    debugLog(`[StripeReturnPage] Redirecting to: ${safeRedirectPath}`);
                    navigate(safeRedirectPath, { replace: true });
                } else {
                    // Fallback redirect if no redirect query param is present
                    debugLog('[StripeReturnPage] No redirect path found or path invalid, navigating to /dashboard.');
                    navigate('/dashboard', { replace: true });
                }

            } catch (e) {
                setStatus('error');
                setError(`An unexpected error occurred: ${e.message}`);
                console.error('[StripeReturnPage] Unexpected error in verifySession:', e);
                toast.error('An unexpected error occurred.');
            }
        };

        verifySession();
        // The ref `hasProcessedSession` is not needed in the dependency array
        // because changing a ref does not trigger a re-render or re-run of the effect.
    }, [sessionId, navigate, location.search, refreshSubscriptionStatus]);

    if (status === 'loading') {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
                <div className="w-16 h-16 border-t-4 border-b-4 border-indigo-600 rounded-full animate-spin mb-4"></div>
                <p className="text-lg font-semibold text-gray-700">Verifying your payment, please wait...</p>
            </div>
        );
    }

    if (status === 'error') {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4 text-center">
                <h1 className="text-2xl font-bold text-red-600 mb-4">Payment Verification Failed</h1>
                <p className="text-gray-700 mb-2">There was an issue verifying your payment.</p>
                {error && <p className="text-red-500 text-sm mb-4">Details: {error}</p>}
                <button
                    onClick={() => navigate('/pricing')}
                    className="px-6 py-2 bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-700 transition-colors"
                >
                    Return to Pricing
                </button>
            </div>
        );
    }

    // Success state is typically short-lived due to navigation, but can be shown if needed.
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
            <h1 className="text-2xl font-bold text-green-600 mb-4">Payment Verified!</h1>
            <p className="text-gray-700">Your subscription has been updated. Redirecting...</p>
        </div>
    );
};

export default StripeReturnPage;
