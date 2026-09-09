import { useRef, useState } from 'react';
import Button from '../ui/Button';
import { supabase } from '../../services/supabase';
import { trackGoogleAnalyticsEvent, trackUpgradeClick } from '../../services/analyticsService';

export default function PayPalCheckout({ planId }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const attempt = useRef({});
  const openCheckout = async () => {
    if (busy) return;
    trackUpgradeClick({ planId, provider: 'paypal' });
    setBusy(true);
    setError('');
    try {
      attempt.current[planId] ||= crypto.randomUUID();
      const { data, error: requestError } = await supabase.functions.invoke('paypal-billing', {
        body: { action: 'create', plan: planId, requestId: attempt.current[planId] },
      });
      if (requestError || !data?.url) throw new Error('PayPal checkout could not be opened. Please retry or contact support.');
      trackGoogleAnalyticsEvent('begin_checkout', {
        plan_id: String(planId || 'unknown'),
        provider: 'paypal',
      });
      const destination = new URL(data.url);
      if (destination.origin !== 'https://www.paypal.com') throw new Error('Invalid PayPal checkout destination.');
      window.location.assign(destination.href);
    } catch (err) { setError(err.message); setBusy(false); }
  };
  return <div className="mt-3">
    <Button className="w-full bg-[#ffc439] text-[#003087] hover:bg-[#f2ba36]" onClick={openCheckout} disabled={busy} aria-busy={busy}>
      {busy ? 'Opening PayPal...' : 'Subscribe with PayPal'}
    </Button>
    {error && <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">{error}</p>}
  </div>;
}
