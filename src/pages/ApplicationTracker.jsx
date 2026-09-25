import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useResume } from '../context/ResumeContext';
import { APPLICATION_STATUSES } from '../utils/applicationMetrics.js';
import { computeHuntStats } from '../utils/jobInboxDedupe.js';
import { getSafeExternalUrl } from '../utils/urlSafety.js';
import {
  getApplications,
  updateApplication,
  deleteApplication,
  createApplication,
} from '../services/applicationService';
import {
  connectJobInboxGmail,
  disconnectJobInboxGmail,
  getHuntStats,
  getJobInboxGmailConnection,
  listInboxEvents,
  syncJobInbox,
  undoApplicationStatusChange,
} from '../services/jobInboxService';
import Button from '../components/ui/Button';
import { Pagination } from '../components/ui';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUSES = ['all', ...APPLICATION_STATUSES];

const STATUS_COLORS = {
  saved: 'bg-gray-50 text-gray-700 border-gray-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600',
  applied: 'bg-blue-50 text-blue-800 border-blue-300 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-700',
  screening: 'bg-yellow-50 text-yellow-800 border-yellow-300 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-700',
  interview: 'bg-purple-50 text-purple-800 border-purple-300 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-700',
  offer: 'bg-green-50 text-green-800 border-green-300 dark:bg-green-950 dark:text-green-300 dark:border-green-700',
  rejected: 'bg-red-50 text-red-800 border-red-300 dark:bg-red-950 dark:text-red-300 dark:border-red-700',
  withdrawn: 'bg-gray-50 text-gray-600 border-gray-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-600',
};

const GUIDANCE_STYLES = {
  slate:
    'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200',
  blue:
    'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/60 dark:text-blue-200',
  amber:
    'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-200',
  purple:
    'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-700 dark:bg-purple-950/60 dark:text-purple-200',
  green:
    'border-green-200 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-950/60 dark:text-green-200',
  red:
    'border-red-200 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950/60 dark:text-red-200',
};

const SORT_OPTIONS = [
  { label: 'Newest First', value: 'newest' },
  { label: 'Oldest First', value: 'oldest' },
];

const APPLICATIONS_PER_PAGE = 12;

const FOCUS_FILTERS = [
  { key: 'all', label: 'All', description: 'Every application in your pipeline.' },
  { key: 'follow-up', label: 'Needs Follow-up', description: 'Waiting long enough to merit a nudge.' },
  { key: 'active', label: 'In Motion', description: 'Applications actively moving forward.' },
  { key: 'saved', label: 'Saved to Decide', description: 'Saved roles that still need a yes or no.' },
  { key: 'offers', label: 'Offers', description: 'Offers and decision-stage opportunities.' },
  { key: 'interviews', label: 'Interviews', description: 'Interview-stage applications.' },
  { key: 'waiting', label: 'Still waiting', description: 'Applied with no reply yet.' },
  { key: 'rejections', label: 'Rejections', description: 'Closed loops.' },
];

const INBOX_EVENT_BUCKETS = [
  { key: 'all', label: 'All mail' },
  { key: 'reply', label: 'Needs reply' },
  { key: 'interview', label: 'Interview mail' },
  { key: 'rejection', label: 'Rejection mail' },
  { key: 'offer', label: 'Offer mail' },
  { key: 'recruiter_outreach', label: 'Recruiter outreach' },
  { key: 'noise', label: 'Noise' },
];

const EMPTY_FORM = {
  company: '',
  position: '',
  job_url: '',
  status: 'saved',
  location: '',
  salary_range: '',
  notes: '',
  job_description: '',
  resume_id: '',
};

const inputClass =
  'w-full border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-colors';

// ---------------------------------------------------------------------------
// Animation variants
// ---------------------------------------------------------------------------

const listItem = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: 'easeOut' } },
  exit: { opacity: 0, x: -24, transition: { duration: 0.2 } },
};

const modalOverlay = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

const modalContent = {
  hidden: { opacity: 0, y: 32, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.25, ease: 'easeOut' } },
  exit: { opacity: 0, y: 16, scale: 0.97, transition: { duration: 0.15 } },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateString) {
  if (!dateString) return '\u2014';
  try {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '\u2014';
  }
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

const useModalAccessibility = (onClose) => {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

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
      if (focusable) {
        focusable.focus();
      } else {
        dialogRef.current?.focus();
      }
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
      document.body.style.overflow = previousOverflow || '';
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };
  }, []);

  return dialogRef;
};

function getValidDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getDaysSince(value) {
  const date = getValidDate(value);
  if (!date) return null;
  const diff = Date.now() - date.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

function formatAge(days) {
  if (days === null || days === undefined) return 'recently';
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

function getTimelineMeta(app) {
  if (app.response_at) {
    return { label: 'Response', date: app.response_at, days: getDaysSince(app.response_at) };
  }
  if (app.applied_at) {
    return { label: 'Applied', date: app.applied_at, days: getDaysSince(app.applied_at) };
  }
  if (app.updated_at) {
    return { label: 'Updated', date: app.updated_at, days: getDaysSince(app.updated_at) };
  }
  return { label: 'Created', date: app.created_at, days: getDaysSince(app.created_at) };
}

function getApplicationGuidance(app) {
  const status = app.status || 'saved';
  const notes = app.notes?.trim() || '';
  const hasNotes = notes.length > 0;
  const touchpoint =
    status === 'saved'
      ? app.created_at || app.updated_at
      : app.response_at || app.applied_at || app.updated_at || app.created_at;
  const ageDays = getDaysSince(touchpoint);

  switch (status) {
    case 'saved':
      if ((ageDays ?? 0) >= 5) {
        return {
          title: 'Decide whether to apply',
          detail: `Saved ${formatAge(ageDays)}. Either tailor a resume or close this out.`,
          tone: 'amber',
          filterKey: 'saved',
          priority: 2,
        };
      }
      return {
        title: 'Tailor before you apply',
        detail: 'Link a resume, confirm fit, and move this into applied when ready.',
        tone: 'blue',
        filterKey: 'saved',
        priority: 1,
      };
    case 'applied':
      if ((ageDays ?? 0) >= 6) {
        return {
          title: 'Send a follow-up',
          detail: `No reply for ${ageDays} days. This is ready for a nudge.`,
          tone: 'amber',
          filterKey: 'follow-up',
          priority: 4,
        };
      }
      return {
        title: 'Wait for the first response',
        detail: `Applied ${formatAge(ageDays)}. Keep this warm but do not over-touch it yet.`,
        tone: 'blue',
        filterKey: 'active',
        priority: 2,
      };
    case 'screening':
      if (!hasNotes) {
        return {
          title: 'Capture recruiter notes',
          detail: 'Store names, timing, and signals before this gets harder to recall.',
          tone: 'amber',
          filterKey: 'active',
          priority: 4,
        };
      }
      return {
        title: 'Prepare the next screening touchpoint',
        detail: 'Keep your talking points and follow-up plan attached here.',
        tone: 'purple',
        filterKey: 'active',
        priority: 3,
      };
    case 'interview':
      if ((ageDays ?? 0) >= 4) {
        return {
          title: 'Check next-step timing',
          detail: `Interview activity cooled ${formatAge(ageDays)}. Follow up or prep for the next round.`,
          tone: 'amber',
          filterKey: 'follow-up',
          priority: 5,
        };
      }
      return {
        title: hasNotes ? 'Stay ready for the next round' : 'Write down interview prep',
        detail: hasNotes
          ? 'Keep debrief notes, likely questions, and thank-you reminders in one place.'
          : 'Add prep notes now so this does not live only in your head.',
        tone: 'purple',
        filterKey: 'active',
        priority: hasNotes ? 3 : 4,
      };
    case 'offer':
      return {
        title: 'Review offer details and deadline',
        detail: 'Capture compensation, response date, tradeoffs, and any negotiation points.',
        tone: 'green',
        filterKey: 'offers',
        priority: 6,
      };
    case 'rejected':
      return {
        title: 'Archive the learning',
        detail: 'Keep any notes that can improve the next application.',
        tone: 'red',
        filterKey: 'all',
        priority: 0,
      };
    case 'withdrawn':
      return {
        title: 'Closed out cleanly',
        detail: 'Keep the context if this company becomes relevant again later.',
        tone: 'slate',
        filterKey: 'all',
        priority: 0,
      };
    default:
      return {
        title: 'Keep this moving',
        detail: 'Review the latest context and set the next step.',
        tone: 'slate',
        filterKey: 'all',
        priority: 1,
      };
  }
}

function matchesFocusFilter(app, filter) {
  if (filter === 'all') return true;

  const guidance = getApplicationGuidance(app);
  if (filter === 'follow-up') return guidance.filterKey === 'follow-up';
  if (filter === 'offers') return app.status === 'offer';
  if (filter === 'saved') return app.status === 'saved';
  if (filter === 'interviews') return app.status === 'interview' || app.status === 'offer';
  if (filter === 'waiting') return app.status === 'applied';
  if (filter === 'rejections') return app.status === 'rejected';
  if (filter === 'active') {
    return ['applied', 'screening', 'interview', 'offer'].includes(app.status);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function GmailInboxPanel({
  connection,
  syncing,
  onConnect,
  onDisconnect,
  onSync,
  lastSyncSummary,
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-blue-100 bg-blue-50/80 px-4 py-4 shadow-sm dark:border-blue-900/40 dark:bg-blue-950/30 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
          {connection ? `Gmail · ${connection.email}` : 'Gmail not connected'}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-gray-600 dark:text-slate-400">
          {lastSyncSummary || (connection
            ? 'Scan pulls receipts, replies, and interview mail into this list.'
            : 'Connect Gmail to file application mail into this list.')}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {connection ? (
          <>
            <Button variant="primary" size="sm" onClick={onSync} disabled={syncing}>
              {syncing ? 'Syncing…' : 'Sync inbox'}
            </Button>
            <Button variant="outline" size="sm" onClick={onDisconnect} disabled={syncing}>
              Disconnect
            </Button>
          </>
        ) : (
          <Button variant="primary" size="sm" onClick={onConnect} disabled={syncing}>
            Connect Gmail
          </Button>
        )}
      </div>
    </div>
  );
}

/** Status badge with click-to-change dropdown */
function StatusBadge({ status, onChange }) {
  return (
    <select
      value={status || 'saved'}
      onChange={(event) => onChange(event.target.value)}
      aria-label="Application status"
      className={`min-h-[44px] rounded-md border px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-blue-500 ${STATUS_COLORS[status] || STATUS_COLORS.saved}`}
    >
      {STATUSES.filter((item) => item !== 'all').map((item) => (
        <option key={item} value={item}>{capitalize(item)}</option>
      ))}
    </select>
  );
}

/** Inline-editable text field */
function InlineEdit({ value, onSave, placeholder = 'Click to edit', multiline = false, prominent = false }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');

  useEffect(() => {
    setDraft(value || '');
  }, [value]);

  const commit = () => {
    setEditing(false);
    if (draft !== (value || '')) {
      onSave(draft);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !multiline) {
      e.preventDefault();
      commit();
    }
    if (e.key === 'Escape') {
      setDraft(value || '');
      setEditing(false);
    }
  };

  if (editing) {
    const Tag = multiline ? 'textarea' : 'input';
    return (
      <Tag
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        className={`w-full border border-blue-300 bg-white dark:bg-slate-800 dark:text-slate-100 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${multiline ? 'resize-y min-h-[80px]' : ''}`}
        aria-label="Editing field"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={`text-left w-full min-w-0 text-sm leading-relaxed text-gray-700 dark:text-slate-300 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded px-1 py-1 transition-colors cursor-pointer whitespace-pre-wrap [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 ${prominent ? 'font-semibold text-gray-900 dark:text-slate-100' : ''}`}
      title={value || placeholder}
      aria-label={`Edit: ${value || placeholder}`}
    >
      {value || <span className="text-gray-400 dark:text-slate-500 italic">{placeholder}</span>}
    </button>
  );
}

/** Skeleton loader rows */
function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-600 p-4 animate-pulse"
        >
          <div className="flex items-center gap-4">
            <div className="h-5 w-32 bg-gray-200 dark:bg-slate-700 rounded" />
            <div className="h-5 w-48 bg-gray-200 dark:bg-slate-700 rounded" />
            <div className="h-5 w-20 bg-gray-200 dark:bg-slate-700 rounded-full" />
            <div className="h-5 w-24 bg-gray-200 dark:bg-slate-700 rounded ml-auto" />
          </div>
        </div>
      ))}
    </div>
  );
}

function FocusOverview({ applications, focusFilter, onFocusChange, onEdit }) {
  const focusCounts = {
    all: applications.length,
    'follow-up': applications.filter((app) => matchesFocusFilter(app, 'follow-up')).length,
    active: applications.filter((app) => matchesFocusFilter(app, 'active')).length,
    saved: applications.filter((app) => matchesFocusFilter(app, 'saved')).length,
    offers: applications.filter((app) => matchesFocusFilter(app, 'offers')).length,
  };

  const focusToday = [...applications]
    .map((app) => ({ app, guidance: getApplicationGuidance(app) }))
    .filter(({ guidance }) => guidance.priority > 0)
    .sort((left, right) => right.guidance.priority - left.guidance.priority)
    .slice(0, 3);

  const selectedCopy =
    FOCUS_FILTERS.find((item) => item.key === focusFilter)?.description || FOCUS_FILTERS[0].description;

  return (
    <div className="mb-3 space-y-2">
      <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100">
              Focus today
            </h2>
          </div>
          <p className="text-sm text-gray-500 dark:text-slate-400">{focusCounts['follow-up']} need follow-up</p>
        </div>

        <select className={`${inputClass} mt-3 min-h-[44px] sm:hidden`} aria-label="Application focus" value={focusFilter} onChange={(event) => onFocusChange(event.target.value)}>
          {FOCUS_FILTERS.map((item) => <option key={item.key} value={item.key}>{item.label} ({focusCounts[item.key]})</option>)}
        </select>
        <div className="mt-3 hidden sm:flex flex-wrap gap-2" role="group" aria-label="Application focus">
          {FOCUS_FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => onFocusChange(item.key)}
              aria-pressed={focusFilter === item.key}
              title={item.description}
              className={`min-h-[44px] rounded-md border px-3 py-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${
                focusFilter === item.key
                  ? 'border-blue-500 bg-blue-600 text-white shadow-sm'
                  : 'border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-900 text-gray-700 dark:text-slate-200 hover:border-blue-300 hover:bg-blue-50 dark:hover:bg-slate-700'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium whitespace-nowrap">{item.label}</span>
                <span className={`text-sm font-semibold tabular-nums ${focusFilter === item.key ? 'text-white' : 'text-gray-900 dark:text-slate-100'}`}>
                  {focusCounts[item.key]}
                </span>
              </div>
            </button>
          ))}
        </div>
        <p className="mt-3 hidden sm:block text-xs leading-relaxed text-gray-500 dark:text-slate-400">{selectedCopy}</p>
      </div>

      <details className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
        <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500">
          Suggested next steps <span className="ml-1 text-gray-500 dark:text-slate-400">({focusToday.length})</span>
        </summary>

        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {focusToday.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 dark:border-slate-600 px-4 py-5 text-sm text-gray-500 dark:text-slate-400">
              Nothing urgent right now. Keep the pipeline moving and capture notes as interviews progress.
            </div>
          ) : (
            focusToday.map(({ app, guidance }) => (
              <div
                key={app.id}
                className="rounded-xl border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-900 px-4 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold text-gray-900 dark:text-slate-100">
                      {app.position || 'Untitled role'}
                    </p>
                    <p className="break-words text-xs text-gray-500 dark:text-slate-400">
                      {app.company || 'Unknown company'}
                    </p>
                  </div>
                  <span className={`inline-flex shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${GUIDANCE_STYLES[guidance.tone]}`}>
                    {capitalize(app.status)}
                  </span>
                </div>
                <p className="mt-2 text-sm font-medium text-gray-800 dark:text-slate-200">{guidance.title}</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">{guidance.detail}</p>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onEdit(app)}
                    className="inline-flex items-center rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-gray-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
                  >
                    Review details
                  </button>
                  {getSafeExternalUrl(app.job_url) && (
                    <a
                      href={getSafeExternalUrl(app.job_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-2 text-xs font-medium text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700"
                    >
                      Open posting
                    </a>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </details>
    </div>
  );
}

/** Empty state when no applications exist */
function EmptyState({ onAdd, onGoToBuilder }) {
  return (
    <motion.div
      className="text-center py-16 px-4"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="mx-auto w-16 h-16 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center mb-4">
        <svg aria-hidden="true" className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          />
        </svg>
      </div>
      <h3 className="text-xl font-semibold text-gray-800 dark:text-slate-100 mb-2">No applications yet</h3>
      <p className="text-gray-500 dark:text-slate-500 mb-6 max-w-md mx-auto">
        Start tracking your job applications to stay organized and never miss a follow-up.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Button onClick={onAdd} variant="primary">
          Add Your First Application
        </Button>
        <Button onClick={onGoToBuilder} variant="outline">
          Create a Resume First
        </Button>
      </div>
    </motion.div>
  );
}

/** Delete confirmation modal */
function ConfirmDeleteModal({ application, onConfirm, onCancel }) {
  const dialogRef = useModalAccessibility(onCancel);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
        variants={modalOverlay}
        initial="hidden"
        animate="visible"
        exit="exit"
        onClick={onCancel}
      >
        <motion.div
          ref={dialogRef}
          className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-sm w-full p-6"
          variants={modalContent}
          initial="hidden"
          animate="visible"
          exit="exit"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-application-title"
          tabIndex={-1}
        >
          <h3 id="delete-application-title" className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-2">Delete Application</h3>
          <p className="text-gray-600 dark:text-slate-400 text-sm mb-6">
            Are you sure you want to delete the application for{' '}
            <span className="font-medium">{application?.position}</span> at{' '}
            <span className="font-medium">{application?.company}</span>? This cannot be undone.
          </p>
          <div className="flex gap-3 justify-end">
            <Button variant="outline" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={onConfirm}>
              Delete
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/** Add / Edit application modal form */
function ApplicationFormModal({ onClose, onSave, initialData, resumes = [] }) {
  const dialogRef = useModalAccessibility(onClose);
  const [form, setForm] = useState(() => {
    const values = { ...EMPTY_FORM, ...initialData };
    for (const field of Object.keys(EMPTY_FORM)) values[field] ??= EMPTY_FORM[field];
    return values;
  });
  const [saving, setSaving] = useState(false);

  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.company.trim() || !form.position.trim()) {
      toast.error('Company and Position are required.');
      return;
    }
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } catch {
      // Error toast handled by caller
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-12 sm:pt-20 bg-black/40 overflow-y-auto"
      variants={modalOverlay}
      initial="hidden"
      animate="visible"
      exit="exit"
      onClick={onClose}
    >
      <motion.div
        ref={dialogRef}
        className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-lg w-full p-6 my-4"
        variants={modalContent}
        initial="hidden"
        animate="visible"
        exit="exit"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="application-form-title"
        tabIndex={-1}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 id="application-form-title" className="text-lg font-semibold text-gray-900 dark:text-slate-100">
            {initialData ? 'Edit Application' : 'Add Application'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:text-slate-400 p-1"
            aria-label="Close modal"
          >
            <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Row: Company + Position */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="app-company" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                Company <span className="text-red-500">*</span>
              </label>
              <input
                id="app-company"
                type="text"
                value={form.company}
                onChange={set('company')}
                className={inputClass}
                placeholder="e.g. Acme Inc."
                required
              />
            </div>
            <div>
              <label htmlFor="app-position" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                Position <span className="text-red-500">*</span>
              </label>
              <input
                id="app-position"
                type="text"
                value={form.position}
                onChange={set('position')}
                className={inputClass}
                placeholder="e.g. Software Engineer"
                required
              />
            </div>
          </div>

          {/* Row: Status + Location */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="app-status" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                Status
              </label>
              <select
                id="app-status"
                value={form.status}
                onChange={set('status')}
                className={`${inputClass} pr-10`}
              >
                {STATUSES.filter((s) => s !== 'all').map((s) => (
                  <option key={s} value={s}>
                    {capitalize(s)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="app-location" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                Location
              </label>
              <input
                id="app-location"
                type="text"
                value={form.location}
                onChange={set('location')}
                className={inputClass}
                placeholder="e.g. Remote, New York, NY"
              />
            </div>
          </div>

          {/* Row: Job URL + Salary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="app-url" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                Job URL
              </label>
              <input
                id="app-url"
                type="url"
                value={form.job_url}
                onChange={set('job_url')}
                className={inputClass}
                placeholder="https://..."
              />
            </div>
            <div>
              <label htmlFor="app-salary" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                Salary Range
              </label>
              <input
                id="app-salary"
                type="text"
                value={form.salary_range}
                onChange={set('salary_range')}
                className={inputClass}
                placeholder="e.g. $120k - $150k"
              />
            </div>
          </div>

          {/* Resume link */}
          {resumes.length > 0 && (
            <div>
              <label htmlFor="app-resume" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                Link to Resume
              </label>
              <select
                id="app-resume"
                value={form.resume_id}
                onChange={set('resume_id')}
                className={`${inputClass} pr-10`}
              >
                <option value="">None</option>
                {resumes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title || r.personalInfo?.jobTitle || r.personal_info?.jobTitle || 'Untitled Resume'}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Notes */}
          <div>
            <label htmlFor="app-notes" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
              Notes
            </label>
            <textarea
              id="app-notes"
              value={form.notes}
              onChange={set('notes')}
              className={`${inputClass} resize-y min-h-[60px]`}
              rows={2}
              placeholder="Follow-up reminders, contact info, etc."
            />
          </div>

          {/* Job Description */}
          <div>
            <label htmlFor="app-jd" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
              Job Description
            </label>
            <textarea
              id="app-jd"
              value={form.job_description}
              onChange={set('job_description')}
              className={`${inputClass} resize-y min-h-[80px]`}
              rows={3}
              placeholder="Paste the job description here..."
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" size="sm" onClick={onClose} type="button">
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" disabled={saving}>
              {saving ? 'Saving...' : initialData ? 'Update' : 'Add Application'}
            </Button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const ApplicationTracker = () => {
  const { user, loading: authLoading } = useAuth();
  const { resumes } = useResume();
  const navigate = useNavigate();

  // Data state
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [huntStats, setHuntStats] = useState(() => computeHuntStats([]));
  const [gmailConnection, setGmailConnection] = useState(null);
  const [syncingInbox, setSyncingInbox] = useState(false);
  const [lastSyncSummary, setLastSyncSummary] = useState('');
  const [inboxEvents, setInboxEvents] = useState([]);
  const [inboxBucket, setInboxBucket] = useState('all');

  // UI state
  const [statusFilter, setStatusFilter] = useState('all');
  const [focusFilter, setFocusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState('newest');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingApp, setEditingApp] = useState(null);
  const [deletingApp, setDeletingApp] = useState(null);
  const [applicationsPage, setApplicationsPage] = useState(1);

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------

  const refreshHuntStats = useCallback(async (apps) => {
    const { data } = await getHuntStats(apps);
    setHuntStats(data || computeHuntStats(apps || []));
  }, []);

  const fetchInboxEvents = useCallback(async () => {
    if (!user) return;
    const { data } = await listInboxEvents({ limit: 40 });
    setInboxEvents(Array.isArray(data) ? data : []);
  }, [user]);

  const fetchGmailConnection = useCallback(async () => {
    if (!user) return;
    const { data } = await getJobInboxGmailConnection();
    setGmailConnection(data || null);
  }, [user]);

  const fetchApplications = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchErr } = await getApplications();
      if (fetchErr) throw fetchErr;
      const apps = Array.isArray(data) ? data : [];
      setApplications(apps);
      await refreshHuntStats(apps);
    } catch (err) {
      setError(err.message || 'Failed to load applications.');
      toast.error('Failed to load applications.');
    } finally {
      setLoading(false);
    }
  }, [user, refreshHuntStats]);

  useEffect(() => {
    fetchApplications();
    fetchGmailConnection();
    fetchInboxEvents();
  }, [fetchApplications, fetchGmailConnection, fetchInboxEvents]);

  // Gmail OAuth return handling (supports HashRouter query placement)
  useEffect(() => {
    const legacyHashQuery = window.location.hash.includes('?')
      ? window.location.hash.split('?').slice(1).join('?')
      : '';
    const params = new URLSearchParams(window.location.search || legacyHashQuery);
    const gmailStatus = params.get('gmail');
    if (!gmailStatus) return;

    if (gmailStatus === 'connected') {
      const email = params.get('email');
      toast.success(email ? `Gmail connected (${email})` : 'Gmail connected');
      fetchGmailConnection();
    } else if (gmailStatus === 'error') {
      toast.error(`Gmail connection failed: ${params.get('reason') || 'unknown error'}`);
    }
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.hash.split('?')[0] || ''}`);
  }, [fetchGmailConnection]);

  const handleConnectGmail = async () => {
    const { data, error: connectError } = await connectJobInboxGmail({ returnPath: '/applications' });
    if (connectError || !data?.url) {
      toast.error(connectError?.message || 'Could not start Gmail connection.');
      return;
    }
    window.location.assign(data.url);
  };

  const handleDisconnectGmail = async () => {
    const { error: disconnectError } = await disconnectJobInboxGmail();
    if (disconnectError) {
      toast.error(disconnectError.message || 'Could not disconnect Gmail.');
      return;
    }
    setGmailConnection(null);
    toast.success('Gmail disconnected');
  };

  const handleSyncInbox = async () => {
    setSyncingInbox(true);
    try {
      const { data, error: syncError } = await syncJobInbox();
      if (syncError) throw syncError;
      const summary = `Scanned ${data?.scanned || 0} · ${data?.newEvents || 0} new · ${data?.createdApplications || 0} apps created · ${data?.updatedApplications || 0} updated`;
      setLastSyncSummary(summary);
      if (data?.stats) setHuntStats(data.stats);
      await fetchApplications();
      await fetchInboxEvents();

      const changes = Array.isArray(data?.statusChanges) ? data.statusChanges : [];
      if (changes.length > 0) {
        const first = changes[0];
        toast.success(
          (t) => (
            <span className="flex flex-col gap-1">
              <span>
                Updated {changes.length} status{changes.length === 1 ? '' : 'es'} from email
                {first?.from && first?.to ? ` (e.g. ${first.from} → ${first.to})` : ''}.
              </span>
              {first?.applicationId && (
                <button
                  type="button"
                  className="text-left text-xs font-semibold text-blue-700 underline"
                  onClick={async () => {
                    toast.dismiss(t.id);
                    const { error: undoError } = await undoApplicationStatusChange(first.applicationId);
                    if (undoError) toast.error(undoError.message || 'Undo failed');
                    else {
                      toast.success('Status restored');
                      fetchApplications();
                    }
                  }}
                >
                  Undo last change
                </button>
              )}
            </span>
          ),
          { duration: 8000 },
        );
      } else {
        toast.success(data?.success === false ? (data.error || 'Sync finished with limits') : 'Inbox synced');
      }
    } catch (err) {
      toast.error(err.message || 'Inbox sync failed');
    } finally {
      setSyncingInbox(false);
    }
  };

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  const handleCreate = async (formData) => {
    try {
      const { data: newApp, error: createErr } = await createApplication({
        ...formData,
        applied_at: formData.status !== 'saved' ? new Date().toISOString() : null,
      });
      if (createErr) throw createErr;
      setApplications((prev) => {
        const next = [newApp, ...prev];
        setHuntStats(computeHuntStats(next));
        return next;
      });
      toast.success('Application added!');
    } catch (err) {
      toast.error(err.message || 'Failed to create application.');
      throw err;
    }
  };

  const handleUpdate = async (formData) => {
    try {
      const { data: updated, error: updateErr } = await updateApplication(formData.id, formData);
      if (updateErr) throw updateErr;
      setApplications((prev) => {
        const next = prev.map((a) => (a.id === updated.id ? updated : a));
        setHuntStats(computeHuntStats(next));
        return next;
      });
      toast.success('Application updated!');
    } catch (err) {
      toast.error(err.message || 'Failed to update application.');
      throw err;
    }
  };

  const handleStatusChange = async (app, newStatus) => {
    try {
      const { data: updated, error: updateErr } = await updateApplication(app.id, { status: newStatus });
      if (updateErr) throw updateErr;
      setApplications((prev) => {
        const next = prev.map((a) => (a.id === updated.id ? updated : a));
        setHuntStats(computeHuntStats(next));
        return next;
      });
      toast.success(`Status changed to ${capitalize(newStatus)}`);
    } catch (err) {
      toast.error(err.message || 'Failed to update status.');
    }
  };

  const handleInlineFieldSave = async (app, field, value) => {
    try {
      const { data: updated, error: updateErr } = await updateApplication(app.id, { [field]: value });
      if (updateErr) throw updateErr;
      setApplications((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    } catch (err) {
      toast.error(err.message || 'Failed to save changes.');
    }
  };

  const handleDelete = async () => {
    if (!deletingApp) return;
    try {
      const { error: deleteErr } = await deleteApplication(deletingApp.id);
      if (deleteErr) throw deleteErr;
      setApplications((prev) => {
        const next = prev.filter((a) => a.id !== deletingApp.id);
        setHuntStats(computeHuntStats(next));
        return next;
      });
      toast.success('Application deleted.');
    } catch (err) {
      toast.error(err.message || 'Failed to delete application.');
    } finally {
      setDeletingApp(null);
    }
  };

  // -----------------------------------------------------------------------
  // Filtering, searching, sorting
  // -----------------------------------------------------------------------

  const filtered = applications
    .filter((a) => {
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (!matchesFocusFilter(a, focusFilter)) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          (a.company || '').toLowerCase().includes(q) ||
          (a.position || '').toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      const dateA = new Date(a.applied_at || a.created_at || 0);
      const dateB = new Date(b.applied_at || b.created_at || 0);
      return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
    });

  const applicationsTotalPages = Math.max(1, Math.ceil(filtered.length / APPLICATIONS_PER_PAGE));
  const paginatedApplications = filtered.slice(
    (applicationsPage - 1) * APPLICATIONS_PER_PAGE,
    applicationsPage * APPLICATIONS_PER_PAGE,
  );

  useEffect(() => {
    setApplicationsPage(1);
  }, [statusFilter, focusFilter, searchQuery, sortOrder]);

  useEffect(() => {
    setApplicationsPage((page) => Math.min(Math.max(page, 1), applicationsTotalPages));
  }, [applicationsTotalPages]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/signin', { replace: true });
    }
  }, [authLoading, user, navigate]);

  // -----------------------------------------------------------------------
  // Auth guard
  // -----------------------------------------------------------------------

  if (authLoading) {
    return (
      <div className="app-loading-viewport">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <motion.div
      className="app-page max-w-6xl"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
            Workspace
          </span>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-gray-900 dark:text-slate-100 md:text-3xl">Job Inbox</h1>
          <p className="mt-2 text-base leading-relaxed text-gray-600 dark:text-slate-400">
            Add roles, update status, and file Gmail into this list. Rates and charts live on Analytics.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button as="link" to="/analytics" variant="outline">Analytics</Button>
          <Button onClick={() => setShowAddModal(true)} variant="primary" className="shrink-0">
            <span className="flex items-center">
              <svg aria-hidden="true" className="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Add Application
            </span>
          </Button>
        </div>
      </div>

      <GmailInboxPanel
        connection={gmailConnection}
        syncing={syncingInbox}
        onConnect={handleConnectGmail}
        onDisconnect={handleDisconnectGmail}
        onSync={handleSyncInbox}
        lastSyncSummary={lastSyncSummary}
      />

      {!loading && inboxEvents.length > 0 && (
        <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">Classified mail</h2>
            <p className="text-xs font-medium text-blue-700 dark:text-blue-300">{huntStats.totalApplied} applications tracked</p>
          </div>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {INBOX_EVENT_BUCKETS.map((bucket) => (
              <button
                key={bucket.key}
                type="button"
                onClick={() => setInboxBucket(bucket.key)}
                className={`min-h-11 rounded-md px-3 py-1.5 text-xs font-semibold ${
                  inboxBucket === bucket.key
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-blue-50 hover:text-blue-700 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600'
                }`}
              >
                {bucket.label}
              </button>
            ))}
          </div>
          <ul className="divide-y divide-gray-100 dark:divide-slate-700">
            {inboxEvents
              .filter((event) => inboxBucket === 'all' || event.category === inboxBucket)
              .slice(0, 5)
              .map((event) => (
                <li key={event.id} className="py-3 first:pt-0 last:pb-0">
                  <p className="truncate text-sm font-medium text-gray-900 dark:text-slate-100">{event.subject || '(no subject)'}</p>
                  <p className="mt-1 line-clamp-1 text-xs text-gray-500 dark:text-slate-400">{event.category} · {event.classifier_reason || event.snippet || 'No preview'}</p>
                </li>
              ))}
          </ul>
        </div>
      )}

      {!loading && !error && applications.length > 0 && (
        <FocusOverview
          applications={applications}
          focusFilter={focusFilter}
          onFocusChange={setFocusFilter}
          onEdit={setEditingApp}
        />
      )}

      {/* Filters & Search */}
      {!loading && applications.length > 0 && (
        <div className="grid grid-cols-1 gap-3 mb-2 sm:grid-cols-[minmax(0,1fr)_11rem]">
          {/* Search */}
          <div className="relative min-w-0">
            <svg
              aria-hidden="true"
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search company or position..."
              className="w-full min-h-[44px] pl-10 pr-10 py-2 bg-white dark:bg-slate-800 dark:text-slate-100 border border-gray-300 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
              aria-label="Search applications"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-slate-400"
                aria-label="Clear search"
              >
                <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Status filter */}
          <div className="order-3 flex flex-wrap gap-1.5 sm:col-span-2">
            {STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`min-h-[44px] rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  statusFilter === s
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-600'
                }`}
                aria-label={`Filter by ${s}`}
                aria-pressed={statusFilter === s}
              >
                {capitalize(s)}
              </button>
            ))}
          </div>

          {/* Sort */}
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className={`${inputClass} order-2 min-h-[44px] pr-10`}
            aria-label="Sort applications"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {!loading && applications.length > 0 && (statusFilter !== 'all' || focusFilter !== 'all' || searchQuery) && (
        <div className="mb-6 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-gray-500 dark:text-slate-400">Showing:</span>
          {focusFilter !== 'all' && (
            <span className="rounded-full bg-blue-50 dark:bg-blue-950/60 px-3 py-1 text-blue-700 dark:text-blue-200">
              {FOCUS_FILTERS.find((item) => item.key === focusFilter)?.label}
            </span>
          )}
          {statusFilter !== 'all' && (
            <span className="rounded-full bg-gray-100 dark:bg-slate-800 px-3 py-1 text-gray-700 dark:text-slate-200">
              Status: {capitalize(statusFilter)}
            </span>
          )}
          {searchQuery && (
            <span className="rounded-full bg-gray-100 dark:bg-slate-800 px-3 py-1 text-gray-700 dark:text-slate-200">
              Search: {searchQuery}
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              setFocusFilter('all');
              setStatusFilter('all');
              setSearchQuery('');
            }}
            className="text-blue-600 hover:text-blue-700 hover:underline"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-700 text-sm">{error}</p>
          <button
            type="button"
            onClick={fetchApplications}
            className="text-red-600 underline text-sm mt-1 hover:text-red-800"
          >
            Try again
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && <LoadingSkeleton />}

      {/* Empty state */}
      {!loading && !error && applications.length === 0 && (
        <EmptyState
          onAdd={() => setShowAddModal(true)}
          onGoToBuilder={() => navigate('/dashboard')}
        />
      )}

      {/* No results from filter */}
      {!loading && !error && applications.length > 0 && filtered.length === 0 && (
        <div className="text-center py-12 text-gray-500 dark:text-slate-500">
          <p className="text-lg font-medium">No applications match your filters.</p>
          <button
            type="button"
            onClick={() => {
              setFocusFilter('all');
              setStatusFilter('all');
              setSearchQuery('');
            }}
            className="text-blue-600 hover:underline text-sm mt-2"
          >
            Clear filters
          </button>
        </div>
      )}

      {/* ============================================================= */}
      {/* Desktop Table View (hidden on mobile) */}
      {/* ============================================================= */}
      {!loading && filtered.length > 0 && (
        <div className="hidden lg:block">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-600 overflow-hidden">
            <table className="w-full table-fixed">
              <caption className="sr-only">Your applications. Edit a field or change its status to update it.</caption>
              <colgroup>
                <col className="w-[34%]" />
                <col className="w-[15%]" />
                <col className="w-[25%]" />
                <col className="w-[13%]" />
                <col className="w-[13%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-900">
                  <th className="text-left text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider px-4 py-3">
                    Role &amp; company
                  </th>
                  <th className="text-left text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider px-4 py-3">
                    Status
                  </th>
                  <th className="text-left text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider px-4 py-3">
                    Next Step
                  </th>
                  <th className="text-left text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider px-4 py-3">
                    Last Touch
                  </th>
                  <th className="text-right text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider px-4 py-3">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence mode="popLayout">
                  {paginatedApplications.map((app) => {
                    const guidance = getApplicationGuidance(app);
                    const timeline = getTimelineMeta(app);

                    return (
                      <motion.tr
                        key={app.id}
                        variants={listItem}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        layout
                        className="border-b border-gray-100 dark:border-slate-700 last:border-b-0 hover:bg-gray-50 dark:bg-slate-900 dark:hover:bg-slate-700/50 transition-colors"
                      >
                        <td className="px-4 py-4 align-top">
                          <InlineEdit
                            value={app.position}
                            onSave={(v) => handleInlineFieldSave(app, 'position', v)}
                            placeholder="Position"
                            prominent
                          />
                          <InlineEdit
                            value={app.company}
                            onSave={(v) => handleInlineFieldSave(app, 'company', v)}
                            placeholder="Company"
                          />
                          <details className="mt-2 px-1 text-xs text-gray-500 dark:text-slate-400">
                            <summary className="cursor-pointer py-1">{app.notes ? 'View notes' : 'Add notes'}</summary>
                            <InlineEdit
                              value={app.notes}
                              onSave={(v) => handleInlineFieldSave(app, 'notes', v)}
                              placeholder="Add notes..."
                              multiline
                            />
                          </details>
                        </td>
                        <td className="px-2 py-4 align-top">
                          <StatusBadge
                            status={app.status}
                            onChange={(s) => handleStatusChange(app, s)}
                          />
                        </td>
                        <td className="px-4 py-4 align-top">
                          <div className={`inline-flex max-w-full rounded-md border px-2 py-1 text-xs font-medium leading-5 ${GUIDANCE_STYLES[guidance.tone]}`}>
                            {guidance.title}
                          </div>
                          <p className="mt-2 line-clamp-2 text-xs leading-5 text-gray-600 dark:text-slate-400">
                            {guidance.detail}
                          </p>
                        </td>
                        <td className="px-3 py-4 align-top text-sm text-gray-600 dark:text-slate-400">
                          <div className="font-medium text-gray-800 dark:text-slate-200">{timeline.label}</div>
                          <div className="text-xs text-gray-500 dark:text-slate-400">{formatDate(timeline.date)}</div>
                        </td>
                        <td className="px-2 py-4 align-top text-right">
                          <div className="flex flex-wrap items-center justify-end gap-1">
                            {getSafeExternalUrl(app.job_url) && (
                              <a
                                href={getSafeExternalUrl(app.job_url)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 dark:text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                                title="Open job posting"
                                aria-label="Open job posting in new tab"
                              >
                                <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => setEditingApp(app)}
                              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 dark:text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                              title="Edit application"
                              aria-label="Edit application"
                            >
                              <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingApp(app)}
                              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 dark:text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                              title="Delete application"
                              aria-label="Delete application"
                            >
                              <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* Mobile Card View (hidden on desktop) */}
      {/* ============================================================= */}
      {!loading && filtered.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:hidden">
          <AnimatePresence mode="popLayout">
            {paginatedApplications.map((app) => {
              const guidance = getApplicationGuidance(app);
              const timeline = getTimelineMeta(app);

              return (
                <motion.div
                  key={app.id}
                  variants={listItem}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  layout
                  className="min-w-0 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-600 p-4"
                >
                  <div className="flex flex-col items-start gap-3 mb-3">
                    <div className="min-w-0 w-full">
                      <InlineEdit
                        value={app.position}
                        onSave={(v) => handleInlineFieldSave(app, 'position', v)}
                        placeholder="Position"
                        prominent
                      />
                      <InlineEdit
                        value={app.company}
                        onSave={(v) => handleInlineFieldSave(app, 'company', v)}
                        placeholder="Company"
                      />
                    </div>
                    <StatusBadge
                      status={app.status}
                      onChange={(s) => handleStatusChange(app, s)}
                    />
                  </div>

                  <div className={`mb-3 rounded-xl border px-3 py-3 ${GUIDANCE_STYLES[guidance.tone]}`}>
                    <p className="text-sm font-semibold">{guidance.title}</p>
                    <p className="mt-1 text-xs leading-relaxed opacity-90">{guidance.detail}</p>
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-slate-500 mb-3">
                    <span>{timeline.label}: {formatDate(timeline.date)}</span>
                    {app.location && <span>{app.location}</span>}
                    {app.salary_range && <span>{app.salary_range}</span>}
                  </div>

                  <details className="mb-3 text-sm text-gray-600 dark:text-slate-400">
                    <summary className="cursor-pointer py-2">{app.notes ? 'View notes' : 'Add notes'}</summary>
                    <InlineEdit
                      value={app.notes}
                      onSave={(v) => handleInlineFieldSave(app, 'notes', v)}
                      placeholder="Add notes..."
                      multiline
                    />
                  </details>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-slate-700">
                    {getSafeExternalUrl(app.job_url) && (
                      <a
                        href={getSafeExternalUrl(app.job_url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 text-gray-400 dark:text-slate-500 hover:text-blue-600 transition-colors"
                        aria-label="Open job posting in new tab"
                      >
                        <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => setEditingApp(app)}
                      className="p-2 text-gray-400 dark:text-slate-500 hover:text-blue-600 transition-colors"
                      aria-label="Edit application"
                    >
                      <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingApp(app)}
                      className="p-2 text-gray-400 dark:text-slate-500 hover:text-red-600 transition-colors"
                      aria-label="Delete application"
                    >
                      <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <Pagination
          currentPage={applicationsPage}
          totalPages={applicationsTotalPages}
          onPageChange={setApplicationsPage}
          totalItems={filtered.length}
          pageSize={APPLICATIONS_PER_PAGE}
          itemLabel="applications"
          className="mt-4 rounded-xl border border-gray-200 bg-white dark:border-slate-600 dark:bg-slate-800"
        />
      )}

      {!loading && applications.length > 0 && (
        <p className="mt-3 text-right text-xs text-gray-400 dark:text-slate-500">
          Filtered {filtered.length} of {applications.length} application{applications.length !== 1 ? 's' : ''}
        </p>
      )}

      {/* ============================================================= */}
      {/* Modals */}
      {/* ============================================================= */}

      <AnimatePresence>
        {showAddModal && (
          <ApplicationFormModal
            key="add-modal"
            resumes={resumes}
            onClose={() => setShowAddModal(false)}
            onSave={handleCreate}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editingApp && (
          <ApplicationFormModal
            key="edit-modal"
            resumes={resumes}
            initialData={editingApp}
            onClose={() => setEditingApp(null)}
            onSave={handleUpdate}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deletingApp && (
          <ConfirmDeleteModal
            key="delete-modal"
            application={deletingApp}
            onConfirm={handleDelete}
            onCancel={() => setDeletingApp(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default ApplicationTracker;
