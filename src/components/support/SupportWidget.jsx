import { useCallback, useEffect, useId, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import {
  getActiveSupportConversationId,
  clearSupportSession,
  downloadSupportAttachment,
  getSupportRoutingContext,
  prepareSupportAttachment,
  readSupportConversation,
  requestSupportHandoff,
  sendSupportMessage,
  startSupportConversation,
  submitSupportFeedback,
} from '../../services/supportService';
import { getSafeExternalUrl } from '../../utils/urlSafety.js';

const createEmptyConversation = () => ({
  conversation: null,
  messages: [],
});

const formatMessageTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

const statusCopy = {
  open: 'Open',
  waiting_customer: 'Waiting for your reply',
  resolved: 'Resolved',
};

const statusClass = {
  open: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300',
  waiting_customer: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  resolved: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
};

const formatBusinessTime = (value) => {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return String(value || '');
  return `${match[1].padStart(2, '0')}:${match[2]}`;
};

const formatBusinessHours = (routing) => {
  if (!routing?.businessStart || !routing?.businessEnd || !routing?.timezone) return '';
  return `${formatBusinessTime(routing.businessStart)}–${formatBusinessTime(routing.businessEnd)} (${routing.timezone})`;
};

const getAvailabilityCopy = (routing, routingUnavailable = false) => {
  if (routingUnavailable) {
    return { label: 'Availability unavailable · messages can still be sent', className: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200' };
  }
  if (!routing) return { label: 'Checking availability…', className: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300' };
  if (!routing.withinBusinessHours) {
    return { label: `Offline · support hours ${formatBusinessHours(routing)}`, className: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300' };
  }
  if (routing.queueAtCapacity) {
    return { label: 'High demand · messages may be delayed', className: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200' };
  }
  if (Number(routing.availableAgentCount) > 0) {
    return { label: 'Support team available now', className: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200' };
  }
  if (Number(routing.onlineAgentCount) > 0) {
    return { label: 'Support is open · replies may be delayed', className: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200' };
  }
  return { label: 'Support is open · your message will be queued', className: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200' };
};

const useSupportDialogAccessibility = (open, onClose) => {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;

    const previouslyFocused = document.activeElement;
    const focusableSelector = [
      'button:not([disabled])',
      'a[href]',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');

    const focusFirstElement = () => {
      const focusable = dialogRef.current?.querySelector(focusableSelector);
      if (focusable) focusable.focus();
      else dialogRef.current?.focus();
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusable = Array.from(dialogRef.current.querySelectorAll(focusableSelector));
      if (!focusable.length) {
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

    const focusTimer = window.setTimeout(focusFirstElement, 0);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') previouslyFocused.focus();
    };
  }, [open]);

  return dialogRef;
};

const SupportWidget = () => {
  const { user } = useAuth();
  const sessionOwnerKey = user?.id || 'anonymous';
  const titleId = useId();
  const descriptionId = `${titleId}-description`;
  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState(() => getActiveSupportConversationId(sessionOwnerKey));
  const [conversation, setConversation] = useState(createEmptyConversation);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [attachmentLoading, setAttachmentLoading] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState('');
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [routing, setRouting] = useState(null);
  const [routingUnavailable, setRoutingUnavailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useSupportDialogAccessibility(open, () => setOpen(false));

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setRoutingUnavailable(false);
    getSupportRoutingContext()
      .then((response) => {
        if (!cancelled) {
          setRouting(response || null);
          setRoutingUnavailable(!response);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRouting(null);
          setRoutingUnavailable(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const refreshConversation = useCallback(async (id) => {
    if (!id) return;
    const response = await readSupportConversation(id, 0);
    setConversation({
      conversation: response?.conversation || null,
      messages: Array.isArray(response?.messages) ? response.messages : [],
    });
    setFeedbackSubmitted(Boolean(response?.feedback));
    setFeedbackRating(Number(response?.feedback?.rating) || 0);
  }, []);

  useEffect(() => {
    if (!open || !conversationId) return undefined;
    let cancelled = false;
    setLoading(true);
    refreshConversation(conversationId)
      .catch((requestError) => {
        if (!cancelled) {
          if (/guest session|conversation not found|support session required/i.test(requestError.message || '')) {
            clearSupportSession();
            setConversationId('');
            setConversation(createEmptyConversation());
            setError('This support session expired. Start a new conversation to continue.');
          } else {
            setError(requestError.message || 'Conversation could not be loaded.');
          }
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, conversationId, refreshConversation]);

  const handleStart = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await startSupportConversation({ subject, body: message, sessionOwnerKey });
      setRouting(response?.routing || routing);
      const id = response?.conversationId;
      setConversationId(id || '');
      setSubject('');
      setMessage('');
      if (id) await refreshConversation(id);
    } catch (requestError) {
      setError(requestError.message || 'Your message could not be sent.');
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    if (!file) {
      setSelectedFile(null);
      return;
    }
    if (!['image/jpeg', 'image/png', 'application/pdf'].includes(file.type) || file.size < 1 || file.size > 10 * 1024 * 1024) {
      setSelectedFile(null);
      event.target.value = '';
      setError('Attach one JPEG, PNG, or PDF up to 10 MB.');
      return;
    }
    setError('');
    setSelectedFile(file);
  };

  const handleDownload = async (attachmentId) => {
    setDownloadLoading(attachmentId);
    setError('');
    try {
      const result = await downloadSupportAttachment(attachmentId);
      if (result?.signedUrl) {
        const safeSignedUrl = getSafeExternalUrl(result.signedUrl);
        if (!safeSignedUrl) throw new Error('This attachment is not available yet.');
        window.open(safeSignedUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (requestError) {
      setError(requestError.message || 'This attachment is not available yet.');
    } finally {
      setDownloadLoading('');
    }
  };

  const handleSend = async (event) => {
    event.preventDefault();
    if (!conversationId || !message.trim()) return;
    setLoading(true);
    setAttachmentLoading(Boolean(selectedFile));
    setError('');
    try {
      const attachmentId = selectedFile ? await prepareSupportAttachment(selectedFile, conversationId) : null;
      await sendSupportMessage(message, conversationId, attachmentId ? [attachmentId] : []);
      setMessage('');
      setSelectedFile(null);
      await refreshConversation(conversationId);
    } catch (requestError) {
      setError(requestError.message || 'Your message could not be sent.');
    } finally {
      setAttachmentLoading(false);
      setLoading(false);
    }
  };

  const handleHandoff = async () => {
    if (!conversationId) return;
    setLoading(true);
    setError('');
    try {
      await requestSupportHandoff(conversationId, 'Customer requested a human support agent.');
      await refreshConversation(conversationId);
      toast.success('A human support request has been added.');
    } catch (requestError) {
      setError(requestError.message || 'The handoff request could not be completed.');
    } finally {
      setLoading(false);
    }
  };

  const handleFeedbackSubmit = async (event) => {
    event.preventDefault();
    if (!conversationId || currentStatus !== 'resolved' || !feedbackRating) return;
    setFeedbackLoading(true);
    setError('');
    try {
      const response = await submitSupportFeedback(conversationId, feedbackRating, 'support', feedbackComment);
      setFeedbackSubmitted(Boolean(response?.feedbackId));
      setFeedbackComment('');
    } catch (requestError) {
      setError(requestError.message || 'Your feedback could not be submitted.');
    } finally {
      setFeedbackLoading(false);
    }
  };

  const currentStatus = conversation.conversation?.status || 'open';

  return (
    <div className="support-widget-root fixed bottom-4 right-4 z-50 max-w-[calc(100vw-2rem)] sm:bottom-6 sm:right-6">
      {open && (
        <section
          ref={dialogRef}
          id={`${titleId}-dialog`}
          className="mb-3 flex w-[min(26rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/15 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/40"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          tabIndex="-1"
        >
          <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
            <div>
              <h2 id={titleId} className="font-semibold text-slate-950 dark:text-white">ResumeATS support</h2>
              <p id={descriptionId} className="mt-1 text-xs text-slate-500 dark:text-slate-400">We’ll keep your message with this support session.</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:hover:bg-slate-700 dark:hover:text-white" aria-label="Close support">
              <span aria-hidden="true" className="text-lg leading-none">×</span>
            </button>
          </header>

          <div className={`border-b px-4 py-2 text-xs ${getAvailabilityCopy(routing, routingUnavailable).className}`} role="status" aria-live="polite">
            {getAvailabilityCopy(routing, routingUnavailable).label}
          </div>

          <div className="max-h-[min(28rem,60vh)] overflow-y-auto px-4 py-4">
            {!conversationId ? (
              <form className="space-y-3" onSubmit={handleStart}>
                <p className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs leading-5 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  Please do not include passwords, payment-card details, or other secrets. Your message is saved to this support session so our team can follow up.
                </p>
                <div>
                  <label htmlFor={`${titleId}-subject`} className="text-sm font-medium text-slate-700 dark:text-slate-200">What do you need help with?</label>
                  <input id={`${titleId}-subject`} value={subject} onChange={(event) => setSubject(event.target.value)} required maxLength={200} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-950 dark:text-white" placeholder="For example: export issue" />
                </div>
                <div>
                  <label htmlFor={`${titleId}-message`} className="text-sm font-medium text-slate-700 dark:text-slate-200">Message</label>
                  <textarea id={`${titleId}-message`} value={message} onChange={(event) => setMessage(event.target.value)} required maxLength={8000} rows={5} className="mt-1.5 w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-950 dark:text-white" placeholder="Tell us what happened and what you expected." />
                </div>
                <button type="submit" disabled={loading} className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-blue-500 dark:hover:bg-blue-400">
                  {loading ? 'Sending…' : 'Start support conversation'}
                </button>
              </form>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass[currentStatus] || statusClass.open}`}>{statusCopy[currentStatus] || 'Open'}</span>
                  {conversation.conversation?.mode !== 'human' && currentStatus !== 'resolved' && (
                    <button type="button" onClick={handleHandoff} disabled={loading} className="text-xs font-semibold text-blue-700 underline-offset-2 hover:underline disabled:opacity-60 dark:text-blue-300">Request a human</button>
                  )}
                </div>
                {conversation.conversation?.mode === 'ai' && currentStatus !== 'resolved' && (
                  <p className="mt-2 rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-2 text-xs text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200">
                    You’re chatting with the ResumeATS assistant using reviewed help content. Ask for a human whenever you need one.
                  </p>
                )}
                {currentStatus === 'resolved' && (
                  <section className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800" aria-labelledby={`${titleId}-feedback-title`}>
                    <h3 id={`${titleId}-feedback-title`} className="text-sm font-semibold text-slate-900 dark:text-white">How did we do?</h3>
                    {feedbackSubmitted ? (
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Thanks — your feedback was saved with this conversation.</p>
                    ) : (
                      <form className="mt-2 space-y-2" onSubmit={handleFeedbackSubmit}>
                        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Support rating">
                          {[1, 2, 3, 4, 5].map((rating) => (
                            <button
                              key={rating}
                              type="button"
                              role="radio"
                              aria-checked={feedbackRating === rating}
                              aria-label={`${rating} out of 5`}
                              onClick={() => setFeedbackRating(rating)}
                              className={`h-8 w-8 rounded-lg border text-sm font-semibold ${feedbackRating === rating ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-blue-400 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200'}`}
                            >
                              {rating}
                            </button>
                          ))}
                        </div>
                        <label htmlFor={`${titleId}-feedback-comment`} className="sr-only">Optional feedback</label>
                        <textarea id={`${titleId}-feedback-comment`} value={feedbackComment} onChange={(event) => setFeedbackComment(event.target.value)} maxLength={2000} rows={2} className="w-full resize-y rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-900 dark:text-white" placeholder="Optional: what could we improve?" />
                        <button type="submit" disabled={feedbackLoading || !feedbackRating} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-900">
                          {feedbackLoading ? 'Saving…' : 'Submit feedback'}
                        </button>
                      </form>
                    )}
                  </section>
                )}
                <div className="mt-3 space-y-3" aria-live="polite">
                  {conversation.messages.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">Loading conversation…</p>}
                  {conversation.messages.map((item) => {
                    const isCustomer = item.senderType === 'customer' || item.senderType === 'guest';
                    const senderLabel = item.senderType === 'ai'
                      ? 'ResumeATS assistant'
                      : item.senderType === 'agent' ? 'Support agent' : isCustomer ? 'You' : 'ResumeATS support';
                    return (
                      <div key={item.id || `${item.sequence}-${item.body}`} className={`flex ${isCustomer ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm ${isCustomer ? 'bg-blue-600 text-white dark:bg-blue-500' : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100'}`}>
                          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide opacity-75">{senderLabel}</p>
                          <p className="whitespace-pre-wrap break-words">{item.body}</p>
                          {Array.isArray(item.attachments) && item.attachments.length > 0 && (
                            <div className="mt-2 space-y-1.5 border-t border-white/20 pt-2">
                              {item.attachments.map((attachment) => (
                                <div key={attachment.id} className="flex items-center justify-between gap-2 text-xs">
                                  <span className="min-w-0 truncate" title={attachment.originalName}>{attachment.originalName}</span>
                                  {attachment.status === 'clean' ? (
                                    <button type="button" className="shrink-0 font-semibold underline" onClick={() => handleDownload(attachment.id)} disabled={downloadLoading === attachment.id}>
                                      {downloadLoading === attachment.id ? 'Opening…' : 'Open'}
                                    </button>
                                  ) : (
                                    <span className="shrink-0 opacity-80">Safety review</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          <time className={`mt-1 block text-[10px] ${isCustomer ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'}`} dateTime={item.createdAt}>{formatMessageTime(item.createdAt)}</time>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <form className="mt-4 space-y-2" onSubmit={handleSend}>
                  <label htmlFor={`${titleId}-reply`} className="sr-only">Reply to support</label>
                  <textarea id={`${titleId}-reply`} value={message} onChange={(event) => setMessage(event.target.value)} maxLength={8000} rows={3} className="w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-950 dark:text-white" placeholder={currentStatus === 'resolved' ? 'Reply to reopen this conversation…' : 'Write a reply…'} />
                  <div className="flex items-center justify-between gap-3">
                    <label htmlFor={`${titleId}-attachment`} className="cursor-pointer text-xs font-semibold text-blue-700 underline-offset-2 hover:underline dark:text-blue-300">
                      Attach file
                      <input id={`${titleId}-attachment`} type="file" accept="image/jpeg,image/png,application/pdf" className="sr-only" onChange={handleFileChange} disabled={loading} />
                    </label>
                    <span className="min-w-0 truncate text-xs text-slate-500 dark:text-slate-400">{selectedFile ? `${selectedFile.name} · ${Math.ceil(selectedFile.size / 1024)} KB` : 'JPEG, PNG, or PDF · max 10 MB'}</span>
                  </div>
                  <button type="submit" disabled={loading || !message.trim()} className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-blue-500 dark:hover:bg-blue-400">{attachmentLoading ? 'Uploading…' : loading ? 'Sending…' : currentStatus === 'resolved' ? 'Reply and reopen' : 'Send reply'}</button>
                </form>
              </>
            )}
            {error && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300" role="alert">{error}</p>}
          </div>
        </section>
      )}

      <button type="button" onClick={() => setOpen((value) => !value)} aria-label={open ? 'Close support dialog' : 'Open support dialog'} title={open ? 'Close support dialog' : 'Open support dialog'} aria-expanded={open} aria-controls={`${titleId}-dialog`} className="support-widget-trigger ml-auto flex items-center gap-2 rounded-full bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-900/20 transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:bg-blue-500 dark:hover:bg-blue-400">
        <span aria-hidden="true" className="text-base">?</span>
        <span className="support-widget-trigger-label">Support</span>
      </button>
    </div>
  );
};

export default SupportWidget;
