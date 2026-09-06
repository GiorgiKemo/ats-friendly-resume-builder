import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

// showModal places the preview in the browser top layer and makes the rest of
// the document inert, including app chrome outside the resume's sticky parent.
const FullscreenResumeDialog = ({ children, className = '', labelledBy, desktop, onClose, initialFocusRef, returnFocusRef }) => {
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const dialog = dialogRef.current;
    const breakpoint = window.matchMedia('(min-width: 768px)');
    if (breakpoint.matches !== desktop || typeof dialog?.showModal !== 'function') {
      closeRef.current();
      return undefined;
    }

    const opener = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    try {
      dialog.showModal();
    } catch {
      closeRef.current();
      return undefined;
    }
    document.body.style.overflow = 'hidden';
    initialFocusRef.current?.focus();

    const onBreakpointChange = (event) => {
      if (event.matches !== desktop) closeRef.current();
    };
    const restoreFocus = () => {
      if (document.querySelector('dialog[open]')) return;
      const target = returnFocusRef.current || opener;
      if (target?.isConnected && target.getClientRects().length) target.focus();
    };
    breakpoint.addEventListener('change', onBreakpointChange);
    return () => {
      breakpoint.removeEventListener('change', onBreakpointChange);
      if (dialog.open) dialog.close();
      document.body.style.overflow = previousOverflow;
      // The inline trigger is remounted when the portal disappears. Wait for
      // its ref, but never move focus out of a newer modal or to a hidden tab.
      queueMicrotask(restoreFocus);
    };
  }, [desktop, initialFocusRef, returnFocusRef]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <dialog
      ref={dialogRef}
      aria-modal="true"
      aria-labelledby={labelledBy}
      className={className}
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100dvh', maxWidth: 'none', maxHeight: 'none', margin: 0, padding: 0, border: 0 }}
      onCancel={(event) => { event.preventDefault(); closeRef.current(); }}
    >
      {children}
    </dialog>,
    document.body,
  );
};

export default FullscreenResumeDialog;
