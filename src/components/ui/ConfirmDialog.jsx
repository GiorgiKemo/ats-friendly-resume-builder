import React, { useEffect, useId, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const ConfirmDialog = ({
  request,
  onConfirm,
  onCancel,
}) => {
  const dialogRef = useRef(null);
  const onCancelRef = useRef(onCancel);
  const titleId = useId();
  const messageId = useId();
  onCancelRef.current = onCancel;

  useEffect(() => {
    if (!request) return undefined;

    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusInitialControl = () => {
      const selector = request.danger ? '[data-confirm-cancel]' : '[data-confirm-primary]';
      const preferred = dialogRef.current?.querySelector(selector);
      const fallback = dialogRef.current?.querySelector(FOCUSABLE_SELECTOR);
      (preferred || fallback || dialogRef.current)?.focus();
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancelRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusable = Array.from(dialogRef.current.querySelectorAll(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const focusTimer = window.setTimeout(focusInitialControl, 0);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') previouslyFocused.focus();
    };
  }, [request]);

  if (!request) return null;

  const {
    title = 'Confirm action',
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    danger = false,
  } = request;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl outline-none dark:border-slate-700 dark:bg-slate-900"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={message ? messageId : undefined}
        tabIndex={-1}
      >
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${danger ? 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'}`} aria-hidden="true">
            <span className="text-lg font-bold">{danger ? '!' : '?'}</span>
          </div>
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold text-slate-950 dark:text-white">{title}</h2>
            {message && <p id={messageId} className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{message}</p>}
          </div>
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-md border border-slate-300 bg-white px-5 py-3 text-base font-medium text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            onClick={onCancel}
            data-confirm-cancel
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`inline-flex min-h-12 min-w-12 items-center justify-center rounded-md px-5 py-3 text-base font-medium text-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${danger ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500' : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'}`}
            onClick={onConfirm}
            data-confirm-primary
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
