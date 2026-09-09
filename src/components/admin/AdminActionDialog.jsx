import { useEffect, useRef, useState } from 'react';

const dialogShell = 'fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4';
const dialogCard = 'w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900';
const inputClass = 'mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100';
const buttonClass = 'inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60';

const getTargetLabel = (target) => target?.email || target?.fullName || target?.id || 'this account';

export default function AdminActionDialog({ dialog, pending = false, onClose, onConfirm }) {
  const [values, setValues] = useState({ days: '30', aiLimit: '30', reason: 'Policy violation', confirmation: '', resetUsage: false });
  const firstFieldRef = useRef(null);

  useEffect(() => {
    if (!dialog) return undefined;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setValues({
      days: '30',
      aiLimit: String(dialog.target?.aiGenerationsLimit || 30),
      reason: ['providerCancellation', 'autoApplyJobAction'].includes(dialog.type) ? '' : 'Policy violation',
      holdType: 'legal',
      expiresAt: '',
      evidenceReference: '',
      confirmation: '',
      resetUsage: false,
    });
    const frame = window.requestAnimationFrame(() => firstFieldRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      if (opener?.isConnected) opener.focus();
    };
  }, [dialog]);

  useEffect(() => {
    if (!dialog) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !pending) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [dialog, onClose, pending]);

  if (!dialog) return null;

  const targetLabel = getTargetLabel(dialog.target);
  const isFormDialog = ['grantPremium', 'aiLimit', 'ban', 'delete', 'privacyHold', 'providerCancellation', 'autoApplyJobAction'].includes(dialog.type);
  const title = dialog.title || 'Confirm admin action';

  return (
    <div className={dialogShell} role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !pending) onClose();
    }}>
      <div className={dialogCard} role="dialog" aria-modal="true" aria-labelledby="admin-action-dialog-title">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="admin-action-dialog-title" className="text-lg font-bold text-slate-950 dark:text-white">{title}</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{targetLabel}</p>
          </div>
          <button type="button" className={`${buttonClass} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100`} onClick={onClose} disabled={pending} aria-label="Close dialog">
            ×
          </button>
        </div>

        <form className="mt-6 space-y-4" onSubmit={(event) => { event.preventDefault(); onConfirm(values); }}>
          {dialog.type === 'grantPremium' && (
            <>
              <label className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                Duration in days
                <input ref={firstFieldRef} className={inputClass} type="number" min="1" step="1" value={values.days} onChange={(event) => setValues((current) => ({ ...current, days: event.target.value }))} required />
              </label>
              <label className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                Monthly AI generation limit
                <input className={inputClass} type="number" min="1" step="1" value={values.aiLimit} onChange={(event) => setValues((current) => ({ ...current, aiLimit: event.target.value }))} required />
              </label>
            </>
          )}

          {dialog.type === 'aiLimit' && (
            <>
              <label className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                Monthly AI generation limit
                <input ref={firstFieldRef} className={inputClass} type="number" min="0" step="1" value={values.aiLimit} onChange={(event) => setValues((current) => ({ ...current, aiLimit: event.target.value }))} required />
              </label>
              <label className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-200">
                <input type="checkbox" checked={values.resetUsage} onChange={(event) => setValues((current) => ({ ...current, resetUsage: event.target.checked }))} />
                Reset current usage to zero
              </label>
            </>
          )}

          {dialog.type === 'ban' && (
            <label className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
              Reason
              <textarea ref={firstFieldRef} className={`${inputClass} min-h-24 resize-y`} value={values.reason} onChange={(event) => setValues((current) => ({ ...current, reason: event.target.value }))} maxLength={500} required />
            </label>
          )}

          {dialog.type === 'delete' && (
            <label className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
              Type DELETE to continue
              <input ref={firstFieldRef} className={inputClass} value={values.confirmation} onChange={(event) => setValues((current) => ({ ...current, confirmation: event.target.value }))} autoComplete="off" required />
            </label>
          )}

          {dialog.type === 'privacyHold' && (
            <>
              <label className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                Hold type
                <select ref={firstFieldRef} className={inputClass} value={values.holdType} onChange={(event) => setValues((current) => ({ ...current, holdType: event.target.value }))}>
                  <option value="legal">Legal</option>
                  <option value="accounting">Accounting</option>
                  <option value="security">Security</option>
                  <option value="support">Support</option>
                </select>
              </label>
              <label className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                Reason
                <textarea className={`${inputClass} min-h-24 resize-y`} value={values.reason} onChange={(event) => setValues((current) => ({ ...current, reason: event.target.value }))} maxLength={2000} required />
              </label>
              <label className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                Expiry (optional)
                <input className={inputClass} type="datetime-local" value={values.expiresAt} onChange={(event) => setValues((current) => ({ ...current, expiresAt: event.target.value }))} />
              </label>
            </>
          )}

          {dialog.type === 'providerCancellation' && (
            <>
              <p className="text-sm leading-6 text-amber-700 dark:text-amber-300">
                This records evidence of a cancellation completed in the provider dashboard. It does not call Stripe or PayPal and must not be used before the external cancellation is confirmed.
              </p>
              <label className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                Provider cancellation reference
                <input ref={firstFieldRef} className={inputClass} value={values.evidenceReference} onChange={(event) => setValues((current) => ({ ...current, evidenceReference: event.target.value }))} maxLength={500} autoComplete="off" required />
              </label>
              <label className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                Review note
                <textarea className={`${inputClass} min-h-24 resize-y`} value={values.reason} onChange={(event) => setValues((current) => ({ ...current, reason: event.target.value }))} maxLength={2000} required />
              </label>
            </>
          )}

          {dialog.type === 'autoApplyJobAction' && (
            <>
              <p className="text-sm leading-6 text-amber-700 dark:text-amber-300">
                Retry is allowed only for a failed job with no outbound message. Cancel is allowed only before external work starts. Reconcile records a review request and never claims that an application succeeded.
              </p>
              <label className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                Reason
                <textarea ref={firstFieldRef} className={`${inputClass} min-h-24 resize-y`} value={values.reason} onChange={(event) => setValues((current) => ({ ...current, reason: event.target.value }))} maxLength={500} required />
              </label>
            </>
          )}

          {!isFormDialog && (
            <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{dialog.message}</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className={`${buttonClass} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100`} onClick={onClose} disabled={pending}>
              Cancel
            </button>
            <button type="submit" className={`${buttonClass} ${dialog.danger ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-blue-600 text-white hover:bg-blue-700'}`} disabled={pending || (dialog.type === 'delete' && values.confirmation !== 'DELETE')}>
              {pending ? 'Working…' : dialog.confirmLabel || 'Continue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
