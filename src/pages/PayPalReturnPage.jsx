import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { useSubscription } from '../context/SubscriptionContext';
import { trackPurchase } from '../services/analyticsService';

export default function PayPalReturnPage() {
  const [params] = useSearchParams();
  const subscriptionId = params.get('subscription_id');
  const { refreshSubscriptionStatus } = useSubscription();
  const [status, setStatus] = useState('loading');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStatus('loading');
      if (!/^I-[A-Z0-9]+$/.test(subscriptionId || '')) { setStatus('error'); return; }
      try {
        const { data, error } = await supabase.functions.invoke('paypal-billing', { body: { action: 'verify', subscriptionId } });
        if (cancelled) return;
        if (error || !data?.paid) { setStatus('error'); return; }
        trackPurchase({ planId: data.plan, provider: 'paypal', transactionId: subscriptionId });
        await refreshSubscriptionStatus();
        if (!cancelled) setStatus('success');
      } catch { if (!cancelled) setStatus('error'); }
    })();
    return () => { cancelled = true; };
  }, [subscriptionId, retry, refreshSubscriptionStatus]);
  return <main className="app-page max-w-2xl py-16 text-center">
    <h1 className="text-3xl font-bold">{status === 'loading' ? 'Checking your PayPal payment...' : status === 'success' ? 'Your Premium access is active' : 'Payment not confirmed yet'}</h1>
    <p className="my-6" role="status">{status === 'success' ? 'Your payment has been verified securely with PayPal.' : status === 'error' ? 'Approval alone is not payment confirmation. If you paid, allow a moment and check again. Do not make another payment; contact support if this persists.' : 'Please wait while we verify payment.'}</p>
    {status === 'error' && <button className="mr-6 underline" onClick={() => setRetry(retry + 1)}>Check payment again</button>}
    <Link className="underline" to="/subscription/manage">Manage subscription</Link>
  </main>;
}
