import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { enrollAdminTotp, getAdminMfaState, verifyAdminTotp } from '../services/adminSecurityService';
import { Pagination } from '../components/ui';
import AdminShell from '../components/admin/AdminShell';
import AdminActionDialog from '../components/admin/AdminActionDialog';
import { AdminThemeProvider } from '../components/admin/AdminThemeProvider';
import { getSafeExternalUrl } from '../utils/urlSafety.js';
import {
  deleteAdminUser,
  approveAdminPrivacyDeletion,
  createAdminIdempotencyKey,
  cancelAdminPrivacyDeletion,
  fetchAdminAnalytics,
  fetchAdminCustomer,
  fetchAdminDirectory,
  fetchAdminOverview,
  fetchAdminJobOperations,
  fetchAdminSettings,
  fetchAdminAnalyticsCsv,
  grantAdminAccess,
  placeAdminPrivacyHold,
  releaseAdminPrivacyHold,
  recordAdminProviderCancellationReview,
  requestAdminExport,
  requestAdminAutoApplyJobAction,
  rollbackAdminSupportAiSettings,
  resetAdminSupportAiCircuit,
  resolveClientError,
  revokeAdminAccess,
  setUserAiLimit,
  setUserBan,
  setUserPremium,
  updateAdminRole,
  updateAdminSupportAiSettings,
  updateAdminSupportRoutingSettings,
} from '../services/adminService';
import {
  addSupportInternalNote,
  createSupportImprovementItem,
  listSupportFeedback,
  listSupportImprovementItems,
  listSupportKnowledge,
  listSupportQueue,
  createSupportKnowledgeDraft,
  publishSupportKnowledge,
  rollbackSupportKnowledge,
  readSupportConversation,
  markSupportConversationRead,
  reopenSupportConversation,
  setSupportPresence,
  triageSupportConversation,
  resolveSupportConversation,
  sendSupportMessage,
  takeSupportConversation,
  updateSupportFeedbackTags,
  updateSupportImprovementItem,
} from '../services/supportService';

const cardClass = 'rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800';
const inputClass = 'w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
const buttonClass = 'inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60';
const primaryButtonClass = `${buttonClass} bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400`;
const secondaryButtonClass = `${buttonClass} border border-gray-300 bg-white text-slate-800 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-700`;
const dangerButtonClass = `${buttonClass} border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-300`;
const adminPageSizes = {
  users: 20,
  errors: 10,
  admins: 10,
  audit: 10,
};

const ADMIN_SECTIONS = new Set(['overview', 'users', 'errors', 'analytics', 'admins', 'subscriptions', 'support', 'jobs', 'feedback', 'audit', 'settings']);

const getAdminRouteState = (pathname) => {
  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] !== 'admin') return { section: 'overview', userId: null };
  if (segments[1] === 'users' && segments[2]) {
    try {
      return { section: 'users', userId: decodeURIComponent(segments[2]) };
    } catch {
      return { section: 'users', userId: segments[2] };
    }
  }
  const section = segments[1] || 'overview';
  return { section: ADMIN_SECTIONS.has(section) ? section : 'overview', userId: null };
};

const paginate = (items, page, pageSize) => {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
};

const getTotalPages = (items, pageSize) => Math.max(1, Math.ceil(items.length / pageSize));

const formatDate = (value) => {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Invalid date';
  return date.toLocaleString();
};

const formatDateShort = (value) => {
  if (!value) return 'None';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Invalid';
  return date.toLocaleDateString();
};

const formatMoney = (amountMinor, currency) => {
  if (amountMinor === null || amountMinor === undefined || !Number.isFinite(Number(amountMinor))) return '—';
  return `${String(currency || 'USD').toUpperCase()} ${(Number(amountMinor) / 100).toFixed(2)}`;
};

const getRemainingAiGenerations = (user) => Math.max(
  0,
  Number(user?.aiGenerationsLimit || 0) - Number(user?.aiGenerationsUsed || 0),
);

const StatCard = ({ label, value, caption }) => (
  <div className={`${cardClass} p-5`}>
    <div className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</div>
    <div className="mt-2 text-3xl font-bold text-slate-950 dark:text-white">{value ?? 'Not available'}</div>
    {caption && <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{caption}</div>}
  </div>
);

const StatusBadge = ({ tone = 'gray', children }) => {
  const tones = {
    blue: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300',
    green: 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-300',
    red: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
    gray: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
  };

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone] || tones.gray}`}>
      {children}
    </span>
  );
};

const getMetric = (analytics, key) => (
  Number.isFinite(Number(analytics?.[key])) ? analytics[key] : null
);

const AdminOverview = ({ analytics, generatedAt, onNavigate }) => {
  const overviewMetrics = [
    ['Active users', getMetric(analytics, 'totalUsers'), 'Account directory snapshot'],
    ['Premium access', getMetric(analytics, 'premiumUsers'), 'Paid and manual access combined'],
    ['Resumes saved', getMetric(analytics, 'resumes'), 'Persisted resume records'],
    ['Applications', getMetric(analytics, 'applications'), 'Saved application records'],
    ['Paid conversion', getMetric(analytics, 'paidConversionRate') === null
      ? null
      : `${getMetric(analytics, 'paidConversionRate')}%`, 'Verified paid events ÷ account-created events'],
  ];

  const attentionItems = [
    ['Unresolved client errors', getMetric(analytics, 'unresolvedErrors'), 'errors'],
    ['Recent signups', getMetric(analytics, 'recentSignups'), 'this week'],
    ['Auto-apply jobs', getMetric(analytics, 'autoApplyJobs'), 'tracked jobs'],
  ];

  return (
    <section className="space-y-5" aria-labelledby="admin-overview-title">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-400">
          Business overview
        </p>
        <h2 id="admin-overview-title" className="mt-2 text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
          What needs attention today?
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600 dark:text-slate-400">
          Current values come from the connected admin snapshot. Conversion rates and revenue stay unavailable until their verified event and billing sources are connected.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {overviewMetrics.map(([label, value, caption]) => (
          <StatCard key={label} label={label} value={value} caption={caption} />
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)]">
        <div className={`${cardClass} p-5`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-slate-950 dark:text-white">Product activity snapshot</h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">A source-backed baseline, not a conversion funnel.</p>
            </div>
            <button type="button" className={secondaryButtonClass} onClick={() => onNavigate('analytics')}>
              Open analytics
            </button>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {[
              ['Free users', getMetric(analytics, 'freeUsers')],
              ['Contact inquiries', getMetric(analytics, 'contactInquiries')],
              ['Newsletter subscribers', getMetric(analytics, 'newsletterSubscribers')],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-slate-700 dark:bg-slate-900/60">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
                <div className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">{value ?? 'Not available'}</div>
              </div>
            ))}
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {[
              ['Account-created events', getMetric(analytics, 'signupEvents')],
              ['Verified purchase events', getMetric(analytics, 'purchaseEvents')],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-slate-700 dark:bg-slate-900/60">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
                <div className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">{value ?? 'Not available'}</div>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-xl border border-dashed border-blue-200 bg-blue-50/60 p-4 text-sm text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-100">
            Paid conversion is computed only from durable account-created and provider-verified purchase events. A missing denominator is not a zero-percent result.
          </div>
        </div>

        <div className={`${cardClass} p-5`}>
          <h3 className="text-lg font-bold text-slate-950 dark:text-white">Needs attention</h3>
          <div className="mt-4 space-y-3">
            {attentionItems.map(([label, value, suffix]) => (
              <div key={label} className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 p-3 dark:border-slate-700">
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">{label}</div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Snapshot value · {suffix}</div>
                </div>
                <StatusBadge tone={label.includes('error') ? 'amber' : 'blue'}>{value ?? 'Unavailable'}</StatusBadge>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">Snapshot generated {formatDate(generatedAt)}.</p>
        </div>
      </div>
    </section>
  );
};

const AdminJobsPanel = ({ analytics, jobs, operations = {}, onAction, actionLoading, canManageActions = false }) => {
  const jobStatuses = [
    ['Discovered', 'discovered'],
    ['Queued', 'queued'],
    ['Applying', 'applying'],
    ['Applied', 'applied'],
    ['Replied', 'replied'],
    ['Interview', 'interview'],
    ['Rejected', 'rejected'],
    ['Skipped', 'skipped'],
    ['Failed', 'failed'],
  ];
  const runStatuses = [
    ['Running', 'running'],
    ['Completed', 'completed'],
    ['Failed', 'failed'],
    ['Cancelled', 'cancelled'],
  ];
  return (
    <section className="space-y-5 p-5" aria-labelledby="admin-jobs-title">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-400">Operations</p>
        <h2 id="admin-jobs-title" className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">AI and job operations</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600 dark:text-slate-400">Source-backed usage and job-state counts. Safe administrator controls are limited to durable, idempotent state transitions and reconciliation requests.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="AI generations used" value={analytics?.totalAiUsed} caption="Across visible user profiles" />
        <StatCard label="AI allowance" value={analytics?.totalAiLimit} caption="Configured profile limits" />
        <StatCard label="Tracked jobs" value={analytics?.autoApplyJobs} caption="Persisted auto-apply records" />
        <StatCard label="Usage source rows" value={analytics?.totalUsers} caption="Directory population reference" />
      </div>
      <div className={`${cardClass} p-5`}>
        <h3 className="font-semibold text-slate-950 dark:text-white">Auto-apply job states</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {jobStatuses.map(([label, status]) => (
            <div key={label} className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-slate-700 dark:bg-slate-900/60">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
              <div className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">{jobs?.jobStatuses?.[status] ?? 'Not available'}</div>
            </div>
          ))}
        </div>
      </div>
      <div className={`${cardClass} p-5`}>
        <h3 className="font-semibold text-slate-950 dark:text-white">Auto-apply run states</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {runStatuses.map(([label, status]) => (
            <div key={label} className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-slate-700 dark:bg-slate-900/60">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
              <div className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">{jobs?.runStatuses?.[status] ?? 'Not available'}</div>
            </div>
          ))}
        </div>
      </div>
      <div className={`${cardClass} overflow-hidden`}>
        <div className="border-b border-gray-200 px-4 py-3 dark:border-slate-700">
          <h3 className="font-semibold text-slate-950 dark:text-white">Safe job controls</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Retry never reuses a job after an outbound receipt. Cancel is limited to work that has not started. Reconcile records a review request without claiming an external result.</p>
        </div>
        {operations.loading && <div className="p-5 text-sm text-slate-500 dark:text-slate-400">Loading job operations…</div>}
        {!operations.loading && operations.available === false && <div className="p-5 text-sm text-slate-500 dark:text-slate-400">Job operation records are not available yet. Apply the latest local migration before using these controls.</div>}
        {!operations.loading && operations.available !== false && (operations.items || []).length === 0 && <div className="p-5 text-sm text-slate-500 dark:text-slate-400">No auto-apply jobs require administrator review.</div>}
        {!operations.loading && operations.available !== false && (operations.items || []).length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
                <tr><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Job</th><th className="px-4 py-3">State</th><th className="px-4 py-3">Last action</th><th className="px-4 py-3">Controls</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                {(operations.items || []).map((item) => {
                  const canRetry = item.status === 'failed' && !item.hasOutboundReceipt;
                  const canCancel = ['discovered', 'queued'].includes(item.status);
                  const canReconcile = item.status === 'applying' || (item.status === 'failed' && item.hasOutboundReceipt);
                  const lastAction = item.lastAction;
                  return (
                    <tr key={item.id}>
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{item.userEmail || 'Unknown customer'}</td>
                      <td className="min-w-56 px-4 py-3"><div className="font-semibold text-slate-900 dark:text-slate-100">{item.title || 'Untitled job'}</div><div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.company || 'Unknown company'}{item.location ? ` · ${item.location}` : ''}</div></td>
                      <td className="whitespace-nowrap px-4 py-3"><StatusBadge tone={item.status === 'failed' ? 'red' : item.status === 'applying' ? 'amber' : ['applied', 'replied', 'interview'].includes(item.status) ? 'green' : 'blue'}>{item.status || 'Unknown'}</StatusBadge>{item.hasOutboundReceipt && <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Outbound receipt present</div>}</td>
                      <td className="min-w-40 px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{lastAction ? <><StatusBadge tone={lastAction.status === 'failed' ? 'red' : lastAction.status === 'pending_reconciliation' ? 'amber' : 'green'}>{lastAction.action} · {lastAction.status}</StatusBadge><div className="mt-1">{formatDate(lastAction.updatedAt)}</div></> : 'None recorded'}</td>
                      <td className="px-4 py-3"><div className="flex min-w-56 flex-wrap gap-2">{canManageActions && canRetry && <button type="button" className={secondaryButtonClass} disabled={actionLoading === `job-action-retry-${item.id}`} onClick={() => onAction(item, 'retry')}>Retry</button>}{canManageActions && canCancel && <button type="button" className={dangerButtonClass} disabled={actionLoading === `job-action-cancel-${item.id}`} onClick={() => onAction(item, 'cancel')}>Cancel</button>}{canManageActions && canReconcile && lastAction?.status !== 'pending_reconciliation' && <button type="button" className={secondaryButtonClass} disabled={actionLoading === `job-action-reconcile-${item.id}`} onClick={() => onAction(item, 'reconcile')}>Reconcile</button>}{!canManageActions && <span className="text-xs text-slate-500 dark:text-slate-400">Read-only for this role</span>}{canManageActions && !canRetry && !canCancel && !canReconcile && <span className="text-xs text-slate-500 dark:text-slate-400">No safe action</span>}</div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
        External AI cost and provider health are intentionally not shown as zero. Employer-facing application submission remains outside this admin control surface.
      </div>
    </section>
  );
};

const AdminSubscriptions = ({ items, events = [], subscriptions = [], transactions = [], projectionsAvailable = true, reconciliationRuns = [], reconciliationAvailable = true, generatedAt }) => (
  <section className="space-y-5" aria-labelledby="admin-subscriptions-title">
    <div>
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-400">Billing ledger</p>
      <h2 id="admin-subscriptions-title" className="mt-2 text-2xl font-bold tracking-tight text-slate-950 dark:text-white">Provider access, in one view</h2>
      <p className="mt-2 max-w-3xl text-sm text-slate-600 dark:text-slate-400">Source-backed entitlement rows and webhook receipts. Provider actions stay disabled until their reconciliation and idempotency contracts are complete.</p>
    </div>
    {!projectionsAvailable && (
      <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
        Provider subscription and transaction projections are not available yet. Apply the billing projection migration before using this view for reconciliation.
      </div>
    )}
    {!reconciliationAvailable && (
      <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
        Reconciliation health is not available yet. Apply the billing reconciliation migration and configure the scheduled worker before treating provider state as fresh.
      </div>
    )}
    {reconciliationAvailable && (
      <div className={`${cardClass} overflow-hidden`}>
        <div className="border-b border-gray-200 px-4 py-3 dark:border-slate-700">
          <h3 className="font-semibold text-slate-950 dark:text-white">Provider reconciliation health</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Worker outcomes are shown separately from webhook receipts; a failed observation never becomes a false cancellation.</p>
        </div>
        {reconciliationRuns.length === 0 ? (
          <div className="p-5 text-sm text-slate-500 dark:text-slate-400">No scheduled reconciliation run has completed yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-900/60 dark:text-slate-400"><tr><th className="px-4 py-3">Provider</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Processed</th><th className="px-4 py-3">Failed</th><th className="px-4 py-3">Started</th><th className="px-4 py-3">Error</th></tr></thead>
              <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                {reconciliationRuns.map((run) => <tr key={run.id}><td className="px-4 py-3 font-semibold uppercase text-slate-700 dark:text-slate-200">{run.provider || 'Unknown'} · {run.environment || 'unknown'}</td><td className="px-4 py-3"><StatusBadge tone={run.status === 'completed' ? 'green' : run.status === 'failed' ? 'red' : 'amber'}>{run.status || 'Unknown'}</StatusBadge></td><td className="px-4 py-3 text-slate-600 dark:text-slate-300">{run.processed_count ?? '—'}</td><td className="px-4 py-3 text-slate-600 dark:text-slate-300">{run.failed_count ?? '—'}</td><td className="whitespace-nowrap px-4 py-3 text-slate-500 dark:text-slate-400">{formatDate(run.started_at)}</td><td className="max-w-xs truncate px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{run.error || '—'}</td></tr>)}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )}
    {projectionsAvailable && (
      <>
        <div className={`${cardClass} overflow-hidden`}>
          <div className="border-b border-gray-200 px-4 py-3 dark:border-slate-700">
            <h3 className="font-semibold text-slate-950 dark:text-white">Provider subscription projections</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Normalized observations from Stripe and PayPal webhooks. The provider remains authoritative.</p>
          </div>
          {subscriptions.length === 0 ? (
            <div className="p-5 text-sm text-slate-500 dark:text-slate-400">No provider subscription projections are available yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-900/60 dark:text-slate-400"><tr><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Provider / env</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Plan</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Period end</th><th className="px-4 py-3">Observed</th></tr></thead>
                <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                  {subscriptions.map((item) => <tr key={`${item.provider}-${item.environment}-${item.subscription_id}`}><td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{item.userEmail || 'Unknown customer'}</td><td className="px-4 py-3 uppercase text-slate-600 dark:text-slate-300">{item.provider || 'Unknown'} · {item.environment || 'unknown'}</td><td className="px-4 py-3"><StatusBadge tone={['active', 'trialing'].includes(item.status) ? 'green' : item.status === 'canceled' ? 'red' : 'amber'}>{item.status || 'Unknown'}</StatusBadge></td><td className="px-4 py-3 text-slate-600 dark:text-slate-300">{item.plan || item.price_id || 'Unknown'}</td><td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">{formatMoney(item.amount_minor, item.currency)}</td><td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">{formatDate(item.current_period_end)}</td><td className="whitespace-nowrap px-4 py-3 text-slate-500 dark:text-slate-400">{formatDate(item.observed_at)}</td></tr>)}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className={`${cardClass} overflow-hidden`}>
          <div className="border-b border-gray-200 px-4 py-3 dark:border-slate-700">
            <h3 className="font-semibold text-slate-950 dark:text-white">Provider transaction projections</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Payments and invoices observed from provider events, with amount and environment preserved.</p>
          </div>
          {transactions.length === 0 ? (
            <div className="p-5 text-sm text-slate-500 dark:text-slate-400">No provider transaction projections are available yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-900/60 dark:text-slate-400"><tr><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Provider / env</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Occurred</th></tr></thead>
                <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                  {transactions.map((item) => <tr key={`${item.provider}-${item.environment}-${item.transaction_id}-${item.transaction_type}`}><td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{item.userEmail || 'Unknown customer'}</td><td className="px-4 py-3 uppercase text-slate-600 dark:text-slate-300">{item.provider || 'Unknown'} · {item.environment || 'unknown'}</td><td className="px-4 py-3 capitalize text-slate-600 dark:text-slate-300">{item.transaction_type || 'Unknown'}</td><td className="px-4 py-3"><StatusBadge tone={['completed', 'paid', 'succeeded'].includes(String(item.status).toLowerCase()) ? 'green' : 'amber'}>{item.status || 'Unknown'}</StatusBadge></td><td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">{formatMoney(item.amount_minor, item.currency)}</td><td className="whitespace-nowrap px-4 py-3 text-slate-500 dark:text-slate-400">{formatDate(item.occurred_at || item.observed_at)}</td></tr>)}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </>
    )}
    <div className={`${cardClass} overflow-hidden`}>
      {items.length === 0 ? (
        <div className="p-6 text-sm text-slate-600 dark:text-slate-400">No entitlement rows are available yet. This is not an assertion that there are zero subscriptions.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Provider</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">State</th>
                <th className="px-4 py-3">Paid until</th>
                <th className="px-4 py-3">Observed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
              {items.map((item) => (
                <tr key={`${item.userId}-${item.provider}-${item.subscription_id}`}>
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{item.userEmail || 'Unknown customer'}</td>
                  <td className="px-4 py-3 uppercase text-slate-600 dark:text-slate-300">{item.provider || 'Unknown'}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{item.plan || 'Unknown'}</td>
                  <td className="px-4 py-3"><StatusBadge tone={item.active ? 'green' : 'gray'}>{item.active ? 'Active source' : 'Inactive source'}</StatusBadge></td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">{formatDate(item.paid_until)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-500 dark:text-slate-400">{formatDate(item.observed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="border-t border-gray-200 px-4 py-3 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">Snapshot generated {formatDate(generatedAt)}.</div>
    </div>
    <div className={`${cardClass} overflow-hidden`}>
      <div className="border-b border-gray-200 px-4 py-3 dark:border-slate-700">
        <h3 className="font-semibold text-slate-950 dark:text-white">Webhook reconciliation receipts</h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Duplicates and failed deliveries remain visible instead of being presented as successful payments.</p>
      </div>
      {events.length === 0 ? (
        <div className="p-5 text-sm text-slate-500 dark:text-slate-400">No provider event receipts are available yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
              <tr><th className="px-4 py-3">Provider</th><th className="px-4 py-3">Event</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Received</th><th className="px-4 py-3">Error</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
              {events.slice(0, 50).map((event) => (
                <tr key={`${event.provider}-${event.event_id}`}>
                  <td className="px-4 py-3 font-semibold uppercase text-slate-700 dark:text-slate-200">{event.provider || 'Unknown'}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{event.event_type || 'Unknown event'}</td>
                  <td className="px-4 py-3"><StatusBadge tone={event.status === 'processed' || event.status === 'skipped' ? 'green' : event.status === 'failed' ? 'red' : 'amber'}>{event.status || 'Unknown'}</StatusBadge></td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-500 dark:text-slate-400">{formatDate(event.created_at)}</td>
                  <td className="max-w-xs truncate px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{event.error || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  </section>
);

const AdminCustomerDetail = ({ detail, onClose, onRequestExport, onRequestDeletion, onCancelDeletion, onApproveDeletion, onPlaceHold, onReleaseHold, onRecordProviderCancellation, canManagePrivacy, canApproveDeletion }) => {
  const detailRef = useRef(null);

  useEffect(() => {
    if (!detail) return undefined;

    const previousBodyOverflow = document.body.style.overflow;
    const previousActiveElement = document.activeElement;
    document.body.style.overflow = 'hidden';
    const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusFirstDetailControl = () => {
      const firstControl = detailRef.current?.querySelector(focusableSelector);
      (firstControl || detailRef.current)?.focus();
    };
    const animationFrame = window.requestAnimationFrame(focusFirstDetailControl);
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !detailRef.current) return;

      const focusableItems = Array.from(detailRef.current.querySelectorAll(focusableSelector));
      if (!focusableItems.length) {
        event.preventDefault();
        detailRef.current.focus();
        return;
      }

      const firstItem = focusableItems[0];
      const lastItem = focusableItems[focusableItems.length - 1];
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      if (previousActiveElement instanceof HTMLElement && document.contains(previousActiveElement)) {
        window.requestAnimationFrame(() => previousActiveElement.focus());
      }
    };
  }, [detail, onClose]);

  if (!detail) return null;

  const { customer, counts, billing, activity, privacy } = detail;
  const latestDeletion = privacy?.deletions?.[0] || null;
  const latestExport = privacy?.exports?.[0] || null;
  const safeExportUrl = getSafeExternalUrl(latestExport?.download_url);
  const activeDeletion = privacy?.deletions?.find((job) => ['pending', 'waiting_owner_approval', 'processing', 'waiting_hold', 'waiting_provider_cancellation'].includes(job.status));
  const providerReviews = privacy?.providerReviews || [];
  const pendingProviderReviews = providerReviews.filter((review) => review.review_status === 'required');
  return (
    <section ref={detailRef} className={`${cardClass} admin-customer-detail mb-5 p-5`} role="dialog" aria-modal="true" aria-labelledby="admin-customer-detail-title" tabIndex={-1}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-400">Customer 360</p>
          <h3 id="admin-customer-detail-title" className="mt-2 text-xl font-bold text-slate-950 dark:text-white">{customer.fullName || customer.email || 'Customer'}</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{customer.email || 'No email'} · {customer.id}</p>
        </div>
        <button type="button" className={secondaryButtonClass} onClick={onClose}>Close details</button>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Resumes', counts.resumes],
          ['Applications', counts.applications],
          ['Auto-apply jobs', counts.autoApplyJobs],
          ['Support conversations', counts.supportConversations],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-slate-700 dark:bg-slate-900/60">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
            <div className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">{value ?? 'Not available'}</div>
          </div>
        ))}
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div>
          <h4 className="font-semibold text-slate-950 dark:text-white">Account and access</h4>
          <dl className="mt-3 grid gap-2 text-sm text-slate-600 dark:text-slate-300">
            <div className="flex justify-between gap-3"><dt>Plan</dt><dd>{customer.premiumPlan || 'Free'}</dd></div>
            <div className="flex justify-between gap-3"><dt>Premium until</dt><dd>{formatDate(customer.premiumUntil)}</dd></div>
            <div className="flex justify-between gap-3"><dt>AI usage</dt><dd>{customer.aiGenerationsUsed ?? 'Not available'} / {customer.aiGenerationsLimit ?? 'Not available'}</dd></div>
            <div className="flex justify-between gap-3"><dt>Last sign in</dt><dd>{formatDate(customer.lastSignInAt)}</dd></div>
            <div className="flex justify-between gap-3"><dt>Email confirmed</dt><dd>{formatDate(customer.emailConfirmedAt)}</dd></div>
          </dl>
        </div>
        <div>
          <h4 className="font-semibold text-slate-950 dark:text-white">Billing sources</h4>
          {billing.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">No entitlement rows are available. This is not proof that no billing history exists.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {billing.map((item) => (
                <div key={`${item.provider}-${item.subscription_id}`} className="rounded-xl border border-gray-200 p-3 text-sm dark:border-slate-700">
                  <div className="flex justify-between gap-3"><span className="font-semibold uppercase">{item.provider}</span><StatusBadge tone={item.active ? 'green' : 'gray'}>{item.active ? 'Active' : 'Inactive'}</StatusBadge></div>
                  <div className="mt-1 text-slate-500 dark:text-slate-400">{item.plan || 'Unknown plan'} · until {formatDate(item.paid_until)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="mt-5">
        <h4 className="font-semibold text-slate-950 dark:text-white">Recent product activity</h4>
        {activity.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">No first-party activity is available.</p>
        ) : (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {activity.slice(0, 12).map((event, index) => (
              <div key={`${event.eventName}-${event.occurredAt}-${index}`} className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-slate-700">
                <span className="font-medium text-slate-700 dark:text-slate-200">{event.eventName}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">{formatDate(event.occurredAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/20">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="font-semibold text-slate-950 dark:text-white">Privacy workflows</h4>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Requests stay queued for reviewed export, provider, retention-hold, and deletion steps. No immediate Auth deletion is performed here.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={secondaryButtonClass} onClick={() => onRequestExport(customer)}>Request export</button>
            {!activeDeletion && <button type="button" className={dangerButtonClass} onClick={() => onRequestDeletion(customer)}>Request deletion</button>}
            {activeDeletion && <button type="button" className={secondaryButtonClass} onClick={() => onCancelDeletion(activeDeletion)}>Cancel deletion request</button>}
            {canApproveDeletion && activeDeletion && !activeDeletion.owner_approved_at && ['pending', 'waiting_owner_approval'].includes(activeDeletion.status) && <button type="button" className={dangerButtonClass} onClick={() => onApproveDeletion(activeDeletion)}>Approve deletion</button>}
            {canManagePrivacy && <button type="button" className={secondaryButtonClass} onClick={() => onPlaceHold(customer)}>Place hold</button>}
          </div>
        </div>
        <div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-3 dark:text-slate-200">
          <div className="flex flex-wrap items-center gap-2"><span><span className="font-semibold">Export:</span> {privacy?.available === false ? 'Migration pending' : (latestExport?.status || 'None requested')}</span>{safeExportUrl && <a href={safeExportUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-700 underline dark:text-blue-300">Download export</a>}</div>
          <div><span className="font-semibold">Deletion:</span> {latestDeletion?.status || 'None requested'}</div>
          <div>
            <span className="font-semibold">Active holds:</span> {privacy?.holds?.filter((hold) => !hold.released_at && (!hold.expires_at || new Date(hold.expires_at) > new Date())).length ?? 'Not available'}
            {canManagePrivacy && privacy?.holds?.filter((hold) => !hold.released_at).slice(0, 3).map((hold) => (
              <button key={hold.id} type="button" className="ml-2 text-xs font-semibold text-blue-700 underline dark:text-blue-300" onClick={() => onReleaseHold(hold)}>Release {hold.hold_type}</button>
            ))}
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-slate-200 bg-white/70 p-3 text-sm dark:border-slate-700 dark:bg-slate-900/50">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h5 className="font-semibold text-slate-950 dark:text-white">Provider cancellation review</h5>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">The deletion workflow remains blocked until every external subscription has a reviewed cancellation receipt. This screen never cancels a provider subscription.</p>
            </div>
            {privacy?.providerReviewAvailable === false && <StatusBadge tone="amber">Migration pending</StatusBadge>}
          </div>
          {providerReviews.length === 0 ? (
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">No provider review rows are available yet.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {providerReviews.map((review) => (
                <div key={review.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
                  <div>
                    <div className="font-semibold uppercase text-slate-800 dark:text-slate-100">{review.provider} · {review.subscription_id}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{review.reason || 'No review note recorded'}{review.reviewed_at ? ` · ${formatDate(review.reviewed_at)}` : ''}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge tone={review.review_status === 'confirmed' ? 'green' : review.review_status === 'required' ? 'amber' : 'gray'}>{review.review_status === 'confirmed' ? 'Confirmed' : review.review_status === 'required' ? 'Review required' : 'Not required'}</StatusBadge>
                    {canManagePrivacy && review.review_status === 'required' && <button type="button" className={secondaryButtonClass} onClick={() => onRecordProviderCancellation(review)}>Record evidence</button>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {pendingProviderReviews.length > 0 && <p className="mt-3 text-xs font-semibold text-amber-700 dark:text-amber-300">{pendingProviderReviews.length} provider review{pendingProviderReviews.length === 1 ? '' : 's'} still block destructive deletion work.</p>}
        </div>
      </div>
      <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">Private resume and application content is intentionally excluded from this view.</p>
    </section>
  );
};

const AdminFeedbackPanel = () => {
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [improvements, setImprovements] = useState([]);
  const [before, setBefore] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingFeedbackId, setSavingFeedbackId] = useState(null);
  const [savingImprovementId, setSavingImprovementId] = useState(null);
  const [error, setError] = useState('');
  const [tagDrafts, setTagDrafts] = useState({});
  const [improvementForm, setImprovementForm] = useState({
    title: '',
    sanitizedSummary: '',
    category: 'product',
    impact: 'unknown',
    priority: 'normal',
    sourceFeedbackId: '',
  });

  const loadFeedback = useCallback(async ({ append = false, beforeCursor = null } = {}) => {
    setLoading(true);
    setError('');
    try {
      const [response, improvementResponse] = await Promise.all([
        listSupportFeedback({ before: beforeCursor }),
        listSupportImprovementItems(),
      ]);
      const nextItems = Array.isArray(response?.items) ? response.items : [];
      setItems((current) => (append ? [...current, ...nextItems] : nextItems));
      setSummary(response?.summary || null);
      setImprovements(Array.isArray(improvementResponse?.items) ? improvementResponse.items : []);
      setTagDrafts((current) => Object.fromEntries(nextItems.map((item) => [item.id, current[item.id] ?? (Array.isArray(item.tags) ? item.tags.join(', ') : '')])));
      const nextBefore = nextItems[nextItems.length - 1]?.createdAt || null;
      setBefore(nextBefore);
      setHasMore(nextItems.length >= 100);
    } catch (requestError) {
      setError(requestError.message || 'Customer insight could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFeedback();
  }, [loadFeedback]);

  const saveTags = async (item) => {
    setSavingFeedbackId(item.id);
    setError('');
    try {
      const tags = String(tagDrafts[item.id] || '').split(',').map((tag) => tag.trim()).filter(Boolean);
      await updateSupportFeedbackTags({ feedbackId: item.id, tags });
      await loadFeedback();
    } catch (requestError) {
      setError(requestError.message || 'Feedback tags could not be saved.');
    } finally {
      setSavingFeedbackId(null);
    }
  };

  const createImprovement = async (event) => {
    event.preventDefault();
    if (!improvementForm.title.trim() || !improvementForm.sanitizedSummary.trim()) {
      setError('Enter a title and sanitized summary before creating an improvement item.');
      return;
    }
    setError('');
    setSavingImprovementId('new');
    try {
      await createSupportImprovementItem({
        ...improvementForm,
        sourceFeedbackId: improvementForm.sourceFeedbackId || null,
      });
      setImprovementForm({ title: '', sanitizedSummary: '', category: 'product', impact: 'unknown', priority: 'normal', sourceFeedbackId: '' });
      await loadFeedback();
    } catch (requestError) {
      setError(requestError.message || 'Improvement item could not be created.');
    } finally {
      setSavingImprovementId(null);
    }
  };

  const updateImprovement = async (item, changes) => {
    setSavingImprovementId(item.id);
    setError('');
    try {
      await updateSupportImprovementItem({
        improvementId: item.id,
        status: changes.status ?? item.status,
        priority: changes.priority ?? item.priority,
        ownerUserId: item.ownerUserId || null,
        outcome: item.outcome || null,
      });
      await loadFeedback();
    } catch (requestError) {
      setError(requestError.message || 'Improvement item could not be updated.');
    } finally {
      setSavingImprovementId(null);
    }
  };

  const byCategory = summary?.byCategory && typeof summary.byCategory === 'object' ? Object.entries(summary.byCategory) : [];
  const byTag = summary?.byTag && typeof summary.byTag === 'object' ? Object.entries(summary.byTag) : [];

  return (
    <section className="space-y-5 p-5" aria-labelledby="admin-feedback-page-title">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-400">Customer insight</p>
          <h2 id="admin-feedback-page-title" className="mt-2 text-xl font-bold text-slate-950 dark:text-white">Feedback and improvement backlog</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Ratings and comments stay bounded to support operators. Create improvement summaries explicitly; private transcript text is never copied into the backlog automatically.</p>
        </div>
        <button type="button" className={secondaryButtonClass} onClick={() => { void loadFeedback(); }} disabled={loading}>Refresh</button>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300" role="alert">{error}</div>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Feedback records', summary?.count ?? 'Unavailable'],
          ['Average rating', Number.isFinite(Number(summary?.averageRating)) ? `${Number(summary.averageRating).toFixed(2)}/5` : 'Unavailable'],
          ['Themes', byCategory.length ? byCategory.map(([category, count]) => `${category}: ${count}`).join(' · ') : 'Unavailable'],
          ['Operator tags', byTag.length ? byTag.map(([tag, count]) => `${tag}: ${count}`).join(' · ') : 'None yet'],
        ].map(([label, value]) => <div key={label} className={`${cardClass} p-4`}><div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div><div className="mt-2 break-words text-sm font-semibold text-slate-950 dark:text-white">{value}</div></div>)}
      </div>

      <section className={`${cardClass} p-4`} aria-labelledby="admin-improvement-create-title">
        <h3 id="admin-improvement-create-title" className="font-semibold text-slate-950 dark:text-white">Create improvement item</h3>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Write a sanitized, evidence-linked summary. Do not paste passwords, payment details, resume text, or raw private transcripts.</p>
        <form className="mt-4 grid gap-3" onSubmit={createImprovement}>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">Title<input className={`${inputClass} mt-1`} maxLength={160} value={improvementForm.title} onChange={(event) => setImprovementForm((current) => ({ ...current, title: event.target.value }))} /></label>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">Source feedback<select className={`${inputClass} mt-1`} value={improvementForm.sourceFeedbackId} onChange={(event) => setImprovementForm((current) => ({ ...current, sourceFeedbackId: event.target.value }))}><option value="">No direct source</option>{items.map((item) => <option key={item.id} value={item.id}>{item.rating}/5 · {item.category} · {item.id.slice(0, 8)}</option>)}</select></label>
          </div>
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">Sanitized summary<textarea className={`${inputClass} mt-1 min-h-24`} maxLength={2000} value={improvementForm.sanitizedSummary} onChange={(event) => setImprovementForm((current) => ({ ...current, sanitizedSummary: event.target.value }))} /></label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">Category<select className={`${inputClass} mt-1`} value={improvementForm.category} onChange={(event) => setImprovementForm((current) => ({ ...current, category: event.target.value }))}><option value="product">Product</option><option value="support">Support</option><option value="billing">Billing</option><option value="account">Account</option><option value="other">Other</option></select></label>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">Impact<select className={`${inputClass} mt-1`} value={improvementForm.impact} onChange={(event) => setImprovementForm((current) => ({ ...current, impact: event.target.value }))}><option value="unknown">Unknown</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">Priority<select className={`${inputClass} mt-1`} value={improvementForm.priority} onChange={(event) => setImprovementForm((current) => ({ ...current, priority: event.target.value }))}><option value="normal">Normal</option><option value="low">Low</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
          </div>
          <button type="submit" className={`${primaryButtonClass} w-fit`} disabled={savingImprovementId === 'new'}>{savingImprovementId === 'new' ? 'Creating…' : 'Create improvement item'}</button>
        </form>
      </section>

      {improvements.length > 0 && <section className={`${cardClass} p-4`} aria-labelledby="admin-improvement-list-title">
        <div className="flex flex-wrap items-center justify-between gap-3"><h3 id="admin-improvement-list-title" className="font-semibold text-slate-950 dark:text-white">Improvement backlog</h3><span className="text-xs text-slate-500 dark:text-slate-400">{improvements.length} loaded</span></div>
        <div className="mt-3 space-y-3">{improvements.map((item) => <article key={item.id} className="rounded-xl border border-gray-200 p-3 dark:border-slate-700">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="font-semibold text-slate-950 dark:text-white">{item.title}</h4><p className="mt-1 text-sm leading-6 text-slate-700 dark:text-slate-200">{item.sanitizedSummary}</p></div><span className="text-xs text-slate-500 dark:text-slate-400">{item.category} · {item.impact} impact</span></div>
          <div className="mt-3 flex flex-wrap items-end gap-3"><label className="text-xs font-semibold text-slate-700 dark:text-slate-200">Status<select className={`${inputClass} mt-1 min-w-36`} value={item.status} onChange={(event) => { void updateImprovement(item, { status: event.target.value }); }} disabled={savingImprovementId === item.id}><option value="backlog">Backlog</option><option value="planned">Planned</option><option value="in_progress">In progress</option><option value="done">Done</option><option value="declined">Declined</option></select></label><label className="text-xs font-semibold text-slate-700 dark:text-slate-200">Priority<select className={`${inputClass} mt-1 min-w-32`} value={item.priority} onChange={(event) => { void updateImprovement(item, { priority: event.target.value }); }} disabled={savingImprovementId === item.id}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>{item.ownerEmail && <span className="pb-2 text-xs text-slate-500 dark:text-slate-400">Owner: {item.ownerEmail}</span>}</div>
        </article>)}</div>
      </section>}

      {loading && items.length === 0 && <div className="rounded-2xl border border-dashed border-gray-300 p-8 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">Loading feedback…</div>}
      {!loading && !error && items.length === 0 && <div className="rounded-2xl border border-dashed border-gray-300 p-8 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">No feedback has been submitted yet.</div>}
      {items.length > 0 && <div className="space-y-3">
        {items.map((item) => <article key={item.id} className={`${cardClass} p-4`}>
          <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-semibold text-slate-950 dark:text-white">{item.rating}/5 · {item.category || 'support'}</div><div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.customerEmail || 'Guest customer'} · {formatDate(item.createdAt)}</div></div>{item.conversationId && <span className="text-xs text-slate-500 dark:text-slate-400">Conversation {item.conversationId}</span>}</div>
          {item.comment && <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700 dark:text-slate-200">{item.comment}</p>}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end"><label className="min-w-0 flex-1 text-xs font-semibold text-slate-700 dark:text-slate-200">Operator tags <span className="font-normal text-slate-500 dark:text-slate-400">(comma-separated)</span><input className={`${inputClass} mt-1`} maxLength={360} value={tagDrafts[item.id] ?? ''} onChange={(event) => setTagDrafts((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="performance, onboarding" /></label><button type="button" className={secondaryButtonClass} onClick={() => { void saveTags(item); }} disabled={savingFeedbackId === item.id}>{savingFeedbackId === item.id ? 'Saving…' : 'Save tags'}</button></div>
        </article>)}
        {hasMore && before && <button type="button" className={secondaryButtonClass} onClick={() => { void loadFeedback({ append: true, beforeCursor: before }); }} disabled={loading}>{loading ? 'Loading…' : 'Load older feedback'}</button>}
      </div>}
    </section>
  );
};

const AdminSupportInbox = () => {
  const [queue, setQueue] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [queueStatus, setQueueStatus] = useState('open');
  const [queueSearch, setQueueSearch] = useState('');
  const [appliedQueueSearch, setAppliedQueueSearch] = useState('');
  const [presenceStatus, setPresenceStatus] = useState('available');
  const [selectedId, setSelectedId] = useState('');
  const [selected, setSelected] = useState(null);
  const [customerContext, setCustomerContext] = useState(null);
  const [reply, setReply] = useState('');
  const [note, setNote] = useState('');
  const [triagePriority, setTriagePriority] = useState('normal');
  const [triageTags, setTriageTags] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await listSupportQueue({ status: queueStatus, search: appliedQueueSearch });
      setQueue(Array.isArray(response?.items) ? response.items : []);
    } catch (requestError) {
      setError(requestError.message || 'Support queue could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [appliedQueueSearch, queueStatus]);

  const loadFeedback = useCallback(async () => {
    try {
      const response = await listSupportFeedback();
      setFeedback(Array.isArray(response?.items) ? response.items : []);
    } catch (requestError) {
      setError(requestError.message || 'Support feedback could not be loaded.');
    }
  }, []);

  const loadConversation = async (conversationId) => {
    setLoading(true);
    setError('');
    try {
      const response = await readSupportConversation(conversationId, 0);
      setSelected(response || null);
      setSelectedId(conversationId);
      setCustomerContext(null);
      setTriagePriority(response?.conversation?.priority || 'normal');
      setTriageTags(Array.isArray(response?.conversation?.tags) ? response.conversation.tags.join(', ') : '');
      if (response?.conversation?.lastSequence !== undefined) {
        await markSupportConversationRead(conversationId, response.conversation.lastSequence);
      }
      if (response?.conversation?.customerUserId) {
        try {
          const customerResponse = await fetchAdminCustomer(response.conversation.customerUserId);
          setCustomerContext(customerResponse?.customer ? {
            ...customerResponse.customer,
            supportConversationCount: customerResponse.counts?.supportConversations,
          } : null);
        } catch {
          setCustomerContext(null);
        }
      }
    } catch (requestError) {
      setError(requestError.message || 'Support conversation could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    const heartbeat = () => {
      void setSupportPresence(presenceStatus).catch(() => {});
    };
    heartbeat();
    const timer = window.setInterval(heartbeat, 60_000);
    return () => window.clearInterval(timer);
  }, [presenceStatus]);

  useEffect(() => {
    void loadFeedback();
  }, [loadFeedback]);

  const runConversationAction = async (action) => {
    if (!selectedId) return;
    setLoading(true);
    setError('');
    try {
      await action();
      await loadConversation(selectedId);
      await loadQueue();
    } catch (requestError) {
      setError(requestError.message || 'Support action could not be completed.');
      setLoading(false);
    }
  };

  const submitReply = async (event) => {
    event.preventDefault();
    if (!reply.trim() || !selectedId) return;
    await runConversationAction(async () => {
      await sendSupportMessage(reply, selectedId);
      setReply('');
    });
  };

  const submitNote = async (event) => {
    event.preventDefault();
    if (!note.trim() || !selectedId) return;
    await runConversationAction(async () => {
      await addSupportInternalNote(selectedId, note);
      setNote('');
    });
  };

  const saveTriage = async () => {
    if (!selectedId || !selected?.conversation) return;
    await runConversationAction(() => triageSupportConversation(
      selectedId,
      selected.conversation.revision,
      triagePriority,
      triageTags.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 20),
    ));
  };

  return (
    <section className="space-y-5 p-5" aria-labelledby="admin-support-title">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-400">Customer care</p>
          <h2 id="admin-support-title" className="mt-2 text-xl font-bold text-slate-950 dark:text-white">Support inbox</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Messages and internal notes use separate server contracts. Customer-facing replies never expose operator notes.</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <form className="flex items-center gap-2" onSubmit={(event) => { event.preventDefault(); setAppliedQueueSearch(queueSearch.trim()); }}>
            <label htmlFor="support-queue-search" className="sr-only">Search support queue</label>
            <input id="support-queue-search" className={`${inputClass} w-44`} value={queueSearch} onChange={(event) => setQueueSearch(event.target.value)} placeholder="Search queue" />
            <button type="submit" className={secondaryButtonClass} disabled={loading}>Search</button>
          </form>
          <label htmlFor="support-presence" className="sr-only">Support presence</label>
          <select id="support-presence" className={inputClass} value={presenceStatus} onChange={(event) => setPresenceStatus(event.target.value)}>
            <option value="available">Available</option>
            <option value="away">Away</option>
            <option value="offline">Offline</option>
          </select>
          <label htmlFor="support-queue-status" className="sr-only">Support queue status</label>
          <select id="support-queue-status" className={inputClass} value={queueStatus} onChange={(event) => setQueueStatus(event.target.value)}>
            <option value="open">Open</option>
            <option value="waiting_customer">Waiting for customer</option>
            <option value="resolved">Resolved</option>
            <option value="all">All</option>
          </select>
          <button type="button" className={secondaryButtonClass} onClick={() => { void loadQueue(); void loadFeedback(); }} disabled={loading}>Refresh</button>
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300" role="alert">{error}</div>}

      <div className={`${cardClass} p-5`} aria-labelledby="admin-feedback-title">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h3 id="admin-feedback-title" className="font-bold text-slate-950 dark:text-white">Recent customer feedback</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Ratings are collected only after a conversation is resolved.</p>
          </div>
          {feedback.length > 0 && <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{feedback.length} loaded</span>}
        </div>
        {feedback.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">No feedback has been submitted yet.</p>
        ) : (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {feedback.slice(0, 6).map((item) => (
              <article key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-semibold text-slate-900 dark:text-white">{item.rating}/5</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{formatDate(item.createdAt)}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.category} · {item.customerEmail || 'Guest customer'}</p>
                {item.comment && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-700 dark:text-slate-200">{item.comment}</p>}
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(18rem,0.75fr)_minmax(0,1.25fr)]">
        <div className={`${cardClass} max-h-[38rem] overflow-y-auto`}>
          {queue.length === 0 ? (
            <div className="p-6 text-sm text-slate-500 dark:text-slate-400">No conversations in this queue.</div>
          ) : queue.map((item) => (
            <button key={item.id} type="button" onClick={() => loadConversation(item.id)} className={`block w-full border-b border-gray-200 p-4 text-left transition last:border-b-0 dark:border-slate-700 ${selectedId === item.id ? 'bg-blue-50 dark:bg-blue-950/30' : 'hover:bg-gray-50 dark:hover:bg-slate-800'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-slate-950 dark:text-white">{item.subject}</div>
                  <div className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{item.customerEmail || item.customerUserId || 'Guest customer'}</div>
                </div>
                <StatusBadge tone={item.mode === 'human' ? 'green' : 'blue'}>{item.mode || 'queued'}</StatusBadge>
              </div>
              <p className="mt-3 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">{item.preview || 'No message preview'}</p>
              <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                <span>{formatDate(item.updatedAt)}</span>
                {item.firstResponseSlaStatus && <span>· First response {item.firstResponseSlaStatus}</span>}
              </div>
            </button>
          ))}
        </div>

        <div className={`${cardClass} min-h-[24rem] p-5`}>
          {!selected ? (
            <div className="flex h-full min-h-[22rem] items-center justify-center text-center text-sm text-slate-500 dark:text-slate-400">Select a conversation to review it.</div>
          ) : (
            <>
              <div className="flex flex-col gap-3 border-b border-gray-200 pb-4 dark:border-slate-700 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="font-bold text-slate-950 dark:text-white">{selected.conversation?.subject}</h3>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Conversation {selected.conversation?.id}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge tone={selected.conversation?.status === 'resolved' ? 'green' : 'blue'}>{selected.conversation?.status || 'open'}</StatusBadge>
                  {selected.conversation?.mode !== 'human' && selected.conversation?.status !== 'resolved' && <button type="button" className={secondaryButtonClass} disabled={loading} onClick={() => runConversationAction(() => takeSupportConversation(selectedId))}>Take conversation</button>}
                  {selected.conversation?.status !== 'resolved' && <button type="button" className={dangerButtonClass} disabled={loading} onClick={() => runConversationAction(() => resolveSupportConversation(selectedId, 'Resolved by support operator.'))}>Resolve</button>}
                  {selected.conversation?.status === 'resolved' && <button type="button" className={secondaryButtonClass} disabled={loading} onClick={() => runConversationAction(() => reopenSupportConversation(selectedId))}>Reopen</button>}
                </div>
              </div>
              <div className="mt-4 grid gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-slate-700 dark:bg-slate-900/60 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto] sm:items-end">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">Priority<select className={`${inputClass} mt-1`} value={triagePriority} onChange={(event) => setTriagePriority(event.target.value)}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">Tags, comma separated<input className={`${inputClass} mt-1`} maxLength={800} value={triageTags} onChange={(event) => setTriageTags(event.target.value)} placeholder="billing, export" /></label>
                <button type="button" className={secondaryButtonClass} disabled={loading} onClick={saveTriage}>Save triage</button>
              </div>
              {customerContext && <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-xs text-slate-700 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-slate-200">
                <div className="font-semibold text-slate-950 dark:text-white">Bounded customer context</div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <span>Email: {customerContext.email || 'Not available'}</span>
                  <span>Plan: {customerContext.premiumPlan || 'Free'}</span>
                  <span>Support conversations: {customerContext.supportConversationCount ?? 'Not available'}</span>
                  <span>Premium until: {formatDate(customerContext.premiumUntil)}</span>
                </div>
              </div>}
              <div className="mt-4 max-h-72 space-y-3 overflow-y-auto" aria-live="polite">
                {(selected.messages || []).map((item) => (
                  <div key={item.id || item.sequence} className={`flex ${item.senderType === 'agent' ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm ${item.senderType === 'agent' ? 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100' : 'bg-blue-600 text-white dark:bg-blue-500'}`}>
                      <p className="whitespace-pre-wrap break-words">{item.body}</p>
                      <div className="mt-1 text-[10px] opacity-70">{item.senderType} · {formatDate(item.createdAt)}</div>
                    </div>
                  </div>
                ))}
              </div>
              <form className="mt-4 space-y-2" onSubmit={submitReply}>
                <label htmlFor="admin-support-reply" className="text-sm font-semibold text-slate-800 dark:text-slate-100">Customer-facing reply</label>
                <textarea id="admin-support-reply" value={reply} onChange={(event) => setReply(event.target.value)} rows={3} maxLength={8000} className={inputClass} placeholder="Write a reply visible to the customer…" />
                <button type="submit" className={primaryButtonClass} disabled={loading || !reply.trim()}>Send reply</button>
              </form>
              <form className="mt-4 border-t border-dashed border-gray-200 pt-4 dark:border-slate-700" onSubmit={submitNote}>
                <label htmlFor="admin-support-note" className="text-sm font-semibold text-slate-800 dark:text-slate-100">Internal note</label>
                <textarea id="admin-support-note" value={note} onChange={(event) => setNote(event.target.value)} rows={2} maxLength={8000} className={`${inputClass} mt-2`} placeholder="Only support operators can see this…" />
                <button type="submit" className={`${secondaryButtonClass} mt-2`} disabled={loading || !note.trim()}>Add internal note</button>
              </form>
              {Array.isArray(selected.internalNotes) && selected.internalNotes.length > 0 && <div className="mt-4 space-y-2 border-t border-dashed border-gray-200 pt-4 dark:border-slate-700"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Internal notes</div>{selected.internalNotes.map((item) => <div key={item.id} className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-100"><p className="whitespace-pre-wrap">{item.body}</p><div className="mt-1 text-[10px] opacity-70">{formatDate(item.createdAt)}</div></div>)}</div>}
            </>
          )}
        </div>
      </div>
    </section>
  );
};

const AdminMfaPanel = () => {
  const [state, setState] = useState(null);
  const [enrollment, setEnrollment] = useState(null);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadState = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setState(await getAdminMfaState());
    } catch (requestError) {
      setError(requestError.message || 'MFA status could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  const beginEnrollment = async () => {
    setLoading(true);
    setError('');
    try {
      setEnrollment(await enrollAdminTotp());
    } catch (requestError) {
      setError(requestError.message || 'Authenticator setup could not be started.');
    } finally {
      setLoading(false);
    }
  };

  const verifyEnrollment = async (event) => {
    event.preventDefault();
    if (!enrollment?.id || !/^\d{6}$/.test(code.trim())) return;
    setLoading(true);
    setError('');
    try {
      setState(await verifyAdminTotp(enrollment.id, code));
      setEnrollment(null);
      setCode('');
    } catch (requestError) {
      setError(requestError.message || 'Authenticator verification failed.');
    } finally {
      setLoading(false);
    }
  };

  const verifiedFactors = (state?.factors || []).filter((factor) => factor.status === 'verified');

  return (
    <section className={`${cardClass} p-5`} aria-labelledby="admin-mfa-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="admin-mfa-title" className="font-bold text-slate-950 dark:text-white">Admin MFA</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">High-risk admin changes require an AAL2 session. Read-only dashboard access remains available while setup is incomplete.</p>
        </div>
        <StatusBadge tone={state?.currentLevel === 'aal2' ? 'green' : 'amber'}>{state?.currentLevel === 'aal2' ? 'AAL2 verified' : 'AAL1 session'}</StatusBadge>
      </div>
      {error && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300" role="alert">{error}</div>}
      {verifiedFactors.length > 0 ? (
        <p className="mt-3 text-sm text-slate-700 dark:text-slate-200">{verifiedFactors.length} verified authenticator factor{verifiedFactors.length === 1 ? '' : 's'} available for this account.</p>
      ) : !enrollment ? (
        <button type="button" className={`${secondaryButtonClass} mt-4`} onClick={beginEnrollment} disabled={loading}>{loading ? 'Loading…' : 'Set up authenticator app'}</button>
      ) : (
        <form className="mt-4 space-y-3" onSubmit={verifyEnrollment}>
          {enrollment.totp?.qr_code && <img src={enrollment.totp.qr_code} alt="Scan this QR code with your authenticator app" className="h-44 w-44 rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-700" />}
          <p className="text-xs text-slate-600 dark:text-slate-400">Scan the QR code in your authenticator app, then enter the six-digit code. The setup secret is shown only in this authenticated browser session.</p>
          <label htmlFor="admin-mfa-code" className="text-sm font-semibold text-slate-800 dark:text-slate-100">Authenticator code<input id="admin-mfa-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} className={`${inputClass} mt-1 max-w-xs`} /></label>
          <div className="flex flex-wrap gap-2"><button type="submit" className={primaryButtonClass} disabled={loading || !/^\d{6}$/.test(code.trim())}>{loading ? 'Verifying…' : 'Verify authenticator'}</button><button type="button" className={secondaryButtonClass} onClick={() => { setEnrollment(null); setCode(''); }} disabled={loading}>Cancel</button></div>
        </form>
      )}
    </section>
  );
};

const AdminIntegrationHealthPanel = () => {
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState({
    enabled: false,
    providerName: '',
    modelName: '',
    perTurnTokenLimit: '2000',
    conversationTurnLimit: '6',
    dailyBudgetUsd: '0',
    monthlyBudgetUsd: '0',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clearingCircuit, setClearingCircuit] = useState(false);
  const [rollingBackRevision, setRollingBackRevision] = useState(null);
  const [pendingRollbackRevision, setPendingRollbackRevision] = useState(null);
  const [error, setError] = useState('');

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetchAdminSettings();
      setSettings(response?.settings || null);
      const supportAi = response?.settings?.supportAi;
      if (supportAi) {
        setForm({
          enabled: supportAi.databaseEnabled === true,
          providerName: supportAi.providerName || '',
          modelName: supportAi.modelName || '',
          perTurnTokenLimit: String(supportAi.perTurnTokenLimit ?? 2000),
          conversationTurnLimit: String(supportAi.conversationTurnLimit ?? 6),
          dailyBudgetUsd: Number.isFinite(Number(supportAi.dailyCostMicros)) ? (Number(supportAi.dailyCostMicros) / 1_000_000).toFixed(2) : '0',
          monthlyBudgetUsd: Number.isFinite(Number(supportAi.monthlyCostMicros)) ? (Number(supportAi.monthlyCostMicros) / 1_000_000).toFixed(2) : '0',
        });
      }
    } catch (requestError) {
      setError(requestError.message || 'Integration health could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  const saveSettings = async (event) => {
    event.preventDefault();
    const perTurnTokenLimit = Number(form.perTurnTokenLimit);
    const conversationTurnLimit = Number(form.conversationTurnLimit);
    const dailyBudget = Number(form.dailyBudgetUsd);
    const monthlyBudget = Number(form.monthlyBudgetUsd);
    if (!Number.isSafeInteger(perTurnTokenLimit) || !Number.isSafeInteger(conversationTurnLimit) || !Number.isFinite(dailyBudget) || !Number.isFinite(monthlyBudget) || dailyBudget < 0 || monthlyBudget < 0) {
      setError('Enter valid AI limits and non-negative budgets.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await updateAdminSupportAiSettings({
        enabled: form.enabled,
        providerName: form.providerName,
        modelName: form.modelName,
        perTurnTokenLimit,
        conversationTurnLimit,
        dailyCostMicros: Math.round(dailyBudget * 1_000_000),
        monthlyCostMicros: Math.round(monthlyBudget * 1_000_000),
        idempotencyKey: createAdminIdempotencyKey(),
      });
      await loadSettings();
    } catch (requestError) {
      setError(requestError.message || 'Support AI settings could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const clearCircuit = async () => {
    setClearingCircuit(true);
    setError('');
    try {
      await resetAdminSupportAiCircuit({
        reason: 'admin_manual_clear',
        idempotencyKey: createAdminIdempotencyKey(),
      });
      await loadSettings();
    } catch (requestError) {
      setError(requestError.message || 'Support AI circuit could not be cleared.');
    } finally {
      setClearingCircuit(false);
    }
  };

  const rollbackSettings = async (targetRevision) => {
    setRollingBackRevision(targetRevision);
    setError('');
    try {
      await rollbackAdminSupportAiSettings({
        targetRevision,
        idempotencyKey: createAdminIdempotencyKey(),
      });
      await loadSettings();
    } catch (requestError) {
      setError(requestError.message || 'Support AI settings could not be rolled back.');
    } finally {
      setRollingBackRevision(null);
      setPendingRollbackRevision(null);
    }
  };

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const supportAi = settings?.supportAi;
  const circuitOpen = Boolean(supportAi?.circuitOpenUntil && Date.parse(supportAi.circuitOpenUntil) > Date.now());
  const status = !settings?.available
    ? { label: 'Migration required', tone: 'amber' }
    : circuitOpen
      ? { label: 'Paused by circuit', tone: 'amber' }
    : supportAi?.effectiveEnabled
      ? { label: 'Enabled', tone: 'green' }
      : { label: 'Disabled by default', tone: 'gray' };

  return (
    <section className={`${cardClass} p-5`} aria-labelledby="admin-integration-health-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-400">Integration health</p>
          <h2 id="admin-integration-health-title" className="mt-2 text-xl font-bold text-slate-950 dark:text-white">Support AI readiness</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-600 dark:text-slate-400">Shows configuration presence only. Secret values are never returned, and this panel does not enable a provider.</p>
        </div>
        <StatusBadge tone={status.tone}>{loading ? 'Loading…' : status.label}</StatusBadge>
      </div>
      {error && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300" role="alert">{error}</div>}
      {!loading && !error && settings?.available && (
        <>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['Database flag', supportAi?.databaseEnabled ? 'Enabled' : 'Off'],
            ['Runtime flag', supportAi?.runtimeEnabled ? 'Enabled' : 'Off'],
            ['Provider secret', supportAi?.providerConfigured ? 'Present' : 'Missing'],
            ['Worker secret', supportAi?.workerConfigured ? 'Present' : 'Missing'],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-slate-700 dark:bg-slate-900/60">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</dt>
              <dd className="mt-1 text-sm font-bold text-slate-950 dark:text-white">{value}</dd>
            </div>
          ))}
          </dl>
          <form className="mt-5 grid gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-slate-700 dark:bg-slate-900/60" onSubmit={saveSettings}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-950 dark:text-white">Safety controls</h3>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Saving requires an AAL2 session. Enabling is refused until provider and worker secrets are present.</p>
              </div>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))} disabled={saving} /> Enable support AI</label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">Per-turn tokens<input type="number" min="256" max="12000" step="1" className={`${inputClass} mt-1`} value={form.perTurnTokenLimit} onChange={(event) => setForm((current) => ({ ...current, perTurnTokenLimit: event.target.value }))} /></label>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">Conversation turns<input type="number" min="1" max="50" step="1" className={`${inputClass} mt-1`} value={form.conversationTurnLimit} onChange={(event) => setForm((current) => ({ ...current, conversationTurnLimit: event.target.value }))} /></label>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">Daily budget (USD)<input type="number" min="0" step="0.01" className={`${inputClass} mt-1`} value={form.dailyBudgetUsd} onChange={(event) => setForm((current) => ({ ...current, dailyBudgetUsd: event.target.value }))} /></label>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">Monthly budget (USD)<input type="number" min="0" step="0.01" className={`${inputClass} mt-1`} value={form.monthlyBudgetUsd} onChange={(event) => setForm((current) => ({ ...current, monthlyBudgetUsd: event.target.value }))} /></label>
            </div>
            <button type="submit" className={`${primaryButtonClass} w-fit`} disabled={saving || (form.enabled && (!supportAi?.providerConfigured || !supportAi?.workerConfigured))}>{saving ? 'Saving…' : 'Save AI safety settings'}</button>
          </form>
        </>
      )}
      {!loading && !error && settings?.available && (
        <>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950/50">
            <div>
              <p className="text-sm font-semibold text-slate-950 dark:text-white">Circuit breaker</p>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{circuitOpen ? `AI work is paused until ${formatDate(supportAi.circuitOpenUntil)}.` : 'No active AI circuit pause.'} Changes are audited.</p>
            </div>
            <button type="button" className={secondaryButtonClass} onClick={clearCircuit} disabled={clearingCircuit || !circuitOpen}>{clearingCircuit ? 'Clearing…' : 'Clear circuit'}</button>
          </div>
          <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">Configured provider: {supportAi?.providerName || 'Not selected'} · Model: {supportAi?.modelName || 'Not selected'} · revision {supportAi?.revision ?? 'Not available'} · last settings update: {formatDate(supportAi?.updatedAt)}</p>
          {Array.isArray(supportAi?.history) && supportAi.history.length > 0 && (
            <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200 dark:border-slate-700">
              <div className="border-b border-gray-200 px-4 py-3 text-sm font-semibold text-slate-950 dark:border-slate-700 dark:text-white">Recent safety-setting history</div>
              <table className="min-w-full text-left text-xs">
                <thead className="bg-gray-50 text-slate-500 dark:bg-slate-900/60 dark:text-slate-400"><tr><th className="px-4 py-2 font-semibold">Revision</th><th className="px-4 py-2 font-semibold">State</th><th className="px-4 py-2 font-semibold">Source</th><th className="px-4 py-2 font-semibold">Changed</th><th className="px-4 py-2 font-semibold">Reason</th><th className="px-4 py-2 font-semibold">Action</th></tr></thead>
                <tbody>{supportAi.history.slice(0, 8).map((entry) => <tr key={`${entry.revision}-${entry.changedAt}`} className="border-t border-gray-100 dark:border-slate-800"><td className="px-4 py-2 font-semibold text-slate-900 dark:text-slate-100">{entry.revision}</td><td className="px-4 py-2 text-slate-700 dark:text-slate-300">{entry.enabled ? 'Enabled' : 'Disabled'}{entry.circuitOpenUntil && ` · paused until ${formatDate(entry.circuitOpenUntil)}`}</td><td className="px-4 py-2 capitalize text-slate-700 dark:text-slate-300">{entry.source || 'Unknown'}</td><td className="px-4 py-2 text-slate-700 dark:text-slate-300">{formatDate(entry.changedAt)}</td><td className="px-4 py-2 text-slate-700 dark:text-slate-300">{entry.reason || '—'}</td><td className="px-4 py-2">{entry.revision !== supportAi.revision && (pendingRollbackRevision === entry.revision ? <span className="flex flex-wrap gap-2"><button type="button" className="font-semibold text-red-700 underline dark:text-red-300" onClick={() => rollbackSettings(entry.revision)} disabled={rollingBackRevision !== null || saving || clearingCircuit}>{rollingBackRevision === entry.revision ? 'Restoring…' : 'Confirm'}</button><button type="button" className="font-semibold text-slate-600 underline dark:text-slate-300" onClick={() => setPendingRollbackRevision(null)} disabled={rollingBackRevision !== null}>Cancel</button></span> : <button type="button" className="font-semibold text-blue-700 underline dark:text-blue-300" onClick={() => setPendingRollbackRevision(entry.revision)} disabled={rollingBackRevision !== null || saving || clearingCircuit}>Rollback</button>)}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
};

const AdminSupportRoutingPanel = () => {
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState({
    timezone: 'Asia/Tbilisi',
    businessDays: [1, 2, 3, 4, 5],
    businessStart: '09:00',
    businessEnd: '18:00',
    firstResponseTargetMinutes: '1440',
    maxQueueSize: '100',
    autoRouteEnabled: true,
    reason: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetchAdminSettings();
      setSettings(response?.settings?.supportRouting || null);
      const routing = response?.settings?.supportRouting;
      if (routing?.available) {
        setForm({
          timezone: routing.timezone || 'UTC',
          businessDays: Array.isArray(routing.businessDays) ? routing.businessDays : [],
          businessStart: routing.businessStart || '09:00',
          businessEnd: routing.businessEnd || '18:00',
          firstResponseTargetMinutes: String(routing.firstResponseTargetMinutes ?? 1440),
          maxQueueSize: String(routing.maxQueueSize ?? 100),
          autoRouteEnabled: routing.autoRouteEnabled === true,
          reason: '',
        });
      }
    } catch (requestError) {
      setError(requestError.message || 'Support routing settings could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const toggleDay = (day) => {
    setForm((current) => ({
      ...current,
      businessDays: current.businessDays.includes(day)
        ? current.businessDays.filter((value) => value !== day)
        : [...current.businessDays, day].sort((left, right) => left - right),
    }));
  };

  const saveSettings = async (event) => {
    event.preventDefault();
    const firstResponseTargetMinutes = Number(form.firstResponseTargetMinutes);
    const maxQueueSize = Number(form.maxQueueSize);
    if (!form.timezone.trim() || form.businessDays.length < 1 || !Number.isSafeInteger(firstResponseTargetMinutes) || !Number.isSafeInteger(maxQueueSize)) {
      setError('Enter a valid timezone, at least one business day, response target, and queue size.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await updateAdminSupportRoutingSettings({
        timezone: form.timezone.trim(),
        businessDays: form.businessDays,
        businessStart: form.businessStart,
        businessEnd: form.businessEnd,
        firstResponseTargetMinutes,
        maxQueueSize,
        autoRouteEnabled: form.autoRouteEnabled,
        reason: form.reason.trim() || 'admin_settings_update',
        idempotencyKey: createAdminIdempotencyKey(),
      });
      await loadSettings();
    } catch (requestError) {
      setError(requestError.message || 'Support routing settings could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const dayOptions = [
    [1, 'Mon'],
    [2, 'Tue'],
    [3, 'Wed'],
    [4, 'Thu'],
    [5, 'Fri'],
    [6, 'Sat'],
    [7, 'Sun'],
  ];

  return (
    <section className={`${cardClass} p-5`} aria-labelledby="admin-support-routing-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-400">Support operations</p>
          <h2 id="admin-support-routing-title" className="mt-2 text-xl font-bold text-slate-950 dark:text-white">Hours and routing</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-600 dark:text-slate-400">Controls the documented support window, first-response target, queue guard, automatic routing flag, and operator presence TTL. Presence is an operational signal, not a guarantee of staffing or delivery.</p>
        </div>
        <StatusBadge tone={!settings?.available ? 'amber' : 'green'}>{loading ? 'Loading…' : settings?.available ? `Revision ${settings.revision ?? '—'}` : 'Migration required'}</StatusBadge>
      </div>
      {error && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300" role="alert">{error}</div>}
      {!loading && !error && settings?.available && (
        <>
          <form className="mt-5 grid gap-4 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-slate-700 dark:bg-slate-900/60" onSubmit={saveSettings}>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">IANA timezone<input className={`${inputClass} mt-1`} value={form.timezone} onChange={(event) => setForm((current) => ({ ...current, timezone: event.target.value }))} placeholder="Asia/Tbilisi" /></label>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">Business start<input type="time" className={`${inputClass} mt-1`} value={form.businessStart} onChange={(event) => setForm((current) => ({ ...current, businessStart: event.target.value }))} /></label>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">Business end<input type="time" className={`${inputClass} mt-1`} value={form.businessEnd} onChange={(event) => setForm((current) => ({ ...current, businessEnd: event.target.value }))} /></label>
            </div>
            <fieldset>
              <legend className="text-xs font-semibold text-slate-700 dark:text-slate-200">Business days</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {dayOptions.map(([day, label]) => <label key={day} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"><input type="checkbox" checked={form.businessDays.includes(day)} onChange={() => toggleDay(day)} />{label}</label>)}
              </div>
            </fieldset>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">First-response target (minutes)<input type="number" min="5" max="10080" step="1" className={`${inputClass} mt-1`} value={form.firstResponseTargetMinutes} onChange={(event) => setForm((current) => ({ ...current, firstResponseTargetMinutes: event.target.value }))} /></label>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">Maximum queued conversations<input type="number" min="1" max="10000" step="1" className={`${inputClass} mt-1`} value={form.maxQueueSize} onChange={(event) => setForm((current) => ({ ...current, maxQueueSize: event.target.value }))} /></label>
              <label className="flex items-center gap-2 pt-6 text-sm font-semibold text-slate-800 dark:text-slate-100"><input type="checkbox" checked={form.autoRouteEnabled} onChange={(event) => setForm((current) => ({ ...current, autoRouteEnabled: event.target.checked }))} /> Automatic routing enabled</label>
            </div>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">Change reason (optional)<input className={`${inputClass} mt-1`} maxLength={240} value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} placeholder="Why is this setting changing?" /></label>
            <button type="submit" className={`${primaryButtonClass} w-fit`} disabled={saving}>{saving ? 'Saving…' : 'Save routing settings'}</button>
          </form>
          {Array.isArray(settings.history) && settings.history.length > 0 && <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200 dark:border-slate-700"><div className="border-b border-gray-200 px-4 py-3 text-sm font-semibold text-slate-950 dark:border-slate-700 dark:text-white">Recent routing-setting history</div><table className="min-w-full text-left text-xs"><thead className="bg-gray-50 text-slate-500 dark:bg-slate-900/60 dark:text-slate-400"><tr><th className="px-4 py-2">Revision</th><th className="px-4 py-2">Window</th><th className="px-4 py-2">Queue</th><th className="px-4 py-2">Changed</th><th className="px-4 py-2">Reason</th></tr></thead><tbody>{settings.history.slice(0, 8).map((entry) => <tr key={`${entry.revision}-${entry.changedAt}`} className="border-t border-gray-100 dark:border-slate-800"><td className="px-4 py-2 font-semibold">{entry.revision}</td><td className="px-4 py-2">{entry.timezone} · {entry.businessStart || '—'}–{entry.businessEnd || '—'}</td><td className="px-4 py-2">{entry.maxQueueSize ?? '—'} max · {entry.autoRouteEnabled ? 'auto' : 'manual'}</td><td className="px-4 py-2">{formatDate(entry.changedAt)}</td><td className="px-4 py-2">{entry.reason || '—'}</td></tr>)}</tbody></table></div>}
        </>
      )}
    </section>
  );
};

const AdminKnowledgePanel = () => {
  const [articles, setArticles] = useState([]);
  const [form, setForm] = useState({ slug: '', title: '', body: '', sourceRef: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadKnowledge = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await listSupportKnowledge({ status: 'all' });
      setArticles(Array.isArray(response?.items) ? response.items : []);
    } catch (requestError) {
      setError(requestError.message || 'Knowledge articles could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadKnowledge();
  }, [loadKnowledge]);

  const saveDraft = async (event) => {
    event.preventDefault();
    if (!form.slug.trim() || !form.title.trim() || !form.body.trim() || !form.sourceRef.trim()) return;
    setLoading(true);
    setError('');
    try {
      await createSupportKnowledgeDraft(form);
      setForm({ slug: '', title: '', body: '', sourceRef: '' });
      await loadKnowledge();
    } catch (requestError) {
      setError(requestError.message || 'Knowledge draft could not be saved.');
      setLoading(false);
    }
  };

  const runKnowledgeAction = async (action) => {
    setLoading(true);
    setError('');
    try {
      await action();
      await loadKnowledge();
    } catch (requestError) {
      setError(requestError.message || 'Knowledge action could not be completed.');
      setLoading(false);
    }
  };

  return (
    <section className="space-y-5 p-5" aria-labelledby="admin-knowledge-title">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-400">Controlled support content</p>
        <h2 id="admin-knowledge-title" className="mt-2 text-xl font-bold text-slate-950 dark:text-white">Knowledge review</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600 dark:text-slate-400">Only reviewed published versions are eligible for future support automation. Drafts remain operator-only and every version keeps its source reference.</p>
      </div>
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300" role="alert">{error}</div>}
      <form className={`${cardClass} grid gap-3 p-5`} onSubmit={saveDraft}>
        <h3 className="font-bold text-slate-950 dark:text-white">Create a draft version</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm font-semibold text-slate-800 dark:text-slate-100">Slug<input className={`${inputClass} mt-1`} value={form.slug} onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))} placeholder="export-help" /></label>
          <label className="text-sm font-semibold text-slate-800 dark:text-slate-100">Source reference<input className={`${inputClass} mt-1`} value={form.sourceRef} onChange={(event) => setForm((current) => ({ ...current, sourceRef: event.target.value }))} placeholder="docs or approved policy reference" /></label>
        </div>
        <label className="text-sm font-semibold text-slate-800 dark:text-slate-100">Title<input className={`${inputClass} mt-1`} value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} maxLength={200} /></label>
        <label className="text-sm font-semibold text-slate-800 dark:text-slate-100">Approved answer body<textarea className={`${inputClass} mt-1`} value={form.body} onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))} maxLength={20000} rows={5} /></label>
        <button type="submit" className={`${primaryButtonClass} w-fit`} disabled={loading || !form.slug.trim() || !form.title.trim() || !form.body.trim() || !form.sourceRef.trim()}>{loading ? 'Saving…' : 'Save draft'}</button>
      </form>
      <div className={`${cardClass} divide-y divide-slate-200 dark:divide-slate-700`}>
        {articles.length === 0 ? <p className="p-5 text-sm text-slate-500 dark:text-slate-400">No knowledge articles are available.</p> : articles.map((article) => (
          <article key={article.articleId} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-950 dark:text-white">{article.currentVersion?.title || article.slug}</h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{article.slug} · {article.locale} · {article.status}</p>
              </div>
              {article.latestVersion && article.latestVersion.id !== article.currentVersionId && <button type="button" className={primaryButtonClass} disabled={loading} onClick={() => runKnowledgeAction(() => publishSupportKnowledge({ articleId: article.articleId, versionId: article.latestVersion.id }))}>Publish v{article.latestVersion.versionNumber}</button>}
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {(article.versions || []).map((version) => (
                <div key={version.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-900">
                  <div className="flex items-center justify-between gap-2"><span className="font-semibold text-slate-900 dark:text-white">v{version.versionNumber} · {version.title}</span>{version.publishedAt && <StatusBadge tone="green">Published</StatusBadge>}</div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Source: {version.sourceRef}</p>
                  {version.publishedAt && version.id !== article.currentVersionId && <button type="button" className={`${secondaryButtonClass} mt-2`} disabled={loading} onClick={() => runKnowledgeAction(() => rollbackSupportKnowledge({ articleId: article.articleId, versionId: version.id }))}>Rollback to v{version.versionNumber}</button>}
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};

const getDateInputValue = (date) => date.toISOString().slice(0, 10);

const AdminAnalyticsPanel = () => {
  const [from, setFrom] = useState(() => getDateInputValue(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)));
  const [to, setTo] = useState(() => getDateInputValue(new Date()));
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const end = new Date(`${to}T00:00:00.000Z`);
      end.setUTCDate(end.getUTCDate() + 1);
      const result = await fetchAdminAnalytics({
        from: new Date(`${from}T00:00:00.000Z`).toISOString(),
        to: end.toISOString(),
      });
      setSnapshot(result?.analytics || null);
    } catch (requestError) {
      setError(requestError.message || 'Analytics could not be loaded.');
      setSnapshot(null);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  const downloadAnalyticsCsv = async () => {
    setError('');
    try {
      const end = new Date(`${to}T00:00:00.000Z`);
      end.setUTCDate(end.getUTCDate() + 1);
      const result = await fetchAdminAnalyticsCsv({
        from: new Date(`${from}T00:00:00.000Z`).toISOString(),
        to: end.toISOString(),
      });
      const csv = result?.analyticsCsv;
      if (!csv?.content || !csv.filename) throw new Error('Analytics export was unavailable.');
      const blob = new Blob([csv.content], { type: csv.contentType || 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = csv.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(requestError.message || 'Analytics export could not be downloaded.');
    }
  };

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  const metrics = snapshot?.metrics || {};
  const rates = snapshot?.rates || {};
  const checkoutGap = Number.isFinite(Number(metrics.checkout_created)) && Number.isFinite(Number(metrics.purchase_confirmed))
    ? Math.max(0, Number(metrics.checkout_created) - Number(metrics.purchase_confirmed))
    : null;
  const cards = [
    ['Accounts created', metrics.account_created],
    ['Resumes created', metrics.resume_created],
    ['Resume exports', metrics.resume_exported],
    ['Applications created', metrics.application_created],
    ['Upgrade clicks', metrics.upgrade_click],
    ['Checkout sessions', metrics.checkout_created],
    ['Observed checkout gap', checkoutGap],
    ['Checkout starts', metrics.checkout_started],
    ['Verified purchases', metrics.purchase_confirmed],
    ['Support started', metrics.support_started],
    ['Support resolved', metrics.support_resolved],
  ];
  const rateCards = [
    ['Signup → purchase', rates.signupToPurchase],
    ['Signup → resume', rates.signupToResume],
    ['Resume → export', rates.resumeToExport],
    ['Upgrade click → checkout', rates.upgradeToCheckout],
    ['Checkout → purchase', rates.checkoutToPurchase],
    ['Upgrade click → purchase', rates.upgradeToPurchase],
    ['Support resolution', rates.supportResolution],
  ];

  return (
    <section className="space-y-5 p-5" aria-labelledby="admin-analytics-title">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-400">Measurement</p>
          <h2 id="admin-analytics-title" className="mt-2 text-xl font-bold text-slate-950 dark:text-white">First-party product analytics</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Clicks are client intent; checkout sessions are server-created; purchases are provider-confirmed. Missing event infrastructure is shown as unavailable, never as zero.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div><label htmlFor="admin-analytics-from" className="block text-xs font-semibold text-slate-500 dark:text-slate-400">From</label><input id="admin-analytics-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} className={`${inputClass} mt-1`} /></div>
          <div><label htmlFor="admin-analytics-to" className="block text-xs font-semibold text-slate-500 dark:text-slate-400">To</label><input id="admin-analytics-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} className={`${inputClass} mt-1`} /></div>
          <button type="button" className={secondaryButtonClass} onClick={loadAnalytics} disabled={loading}>Refresh</button>
          <button type="button" className={secondaryButtonClass} onClick={() => { void downloadAnalyticsCsv(); }} disabled={loading}>Download CSV</button>
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300" role="alert">{error}</div>}
      {loading && <div className="rounded-2xl border border-dashed border-gray-300 p-8 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">Loading measured events…</div>}
      {!loading && snapshot && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {rateCards.map(([label, value]) => <StatCard key={label} label={label} value={value === null || value === undefined ? 'Not available' : `${value}%`} caption="Within the selected UTC window" />)}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map(([label, value]) => <StatCard key={label} label={label} value={value === null || value === undefined ? 'Not available' : value} />)}
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400">
            Source: {snapshot.source || 'Unknown'} · {snapshot.window?.from ? `${formatDate(snapshot.window.from)} – ${formatDate(snapshot.window.to)}` : 'Window unavailable'} · Generated {formatDate(snapshot.generatedAt)}.
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Observed checkout gap is checkout-session events minus verified purchase events in the selected window. It is an event-count proxy, not a unique-person abandonment count.</p>
        </>
      )}
      {!loading && !snapshot && !error && <div className="rounded-2xl border border-dashed border-gray-300 p-8 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">Analytics is not available yet.</div>}
    </section>
  );
};

const AdminDashboardContent = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const routeState = useMemo(() => getAdminRouteState(location.pathname), [location.pathname]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(routeState.section);
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState('');
  const [directoryState, setDirectoryState] = useState({ available: null, items: [], nextCursor: null, loading: false });
  const [adminEmail, setAdminEmail] = useState('');
  const [adminRole, setAdminRole] = useState('admin');
  const [accessError, setAccessError] = useState('');
  const [pendingOperations, setPendingOperations] = useState([]);
  const [actionDialog, setActionDialog] = useState(null);
  const [customerDetail, setCustomerDetail] = useState({ loading: false, data: null, error: '' });
  const [jobOperations, setJobOperations] = useState({ available: null, items: [], loading: false, error: '' });
  const actionKeys = useRef(new Map());
  const customerRequestRef = useRef(0);
  const [pages, setPages] = useState({
    users: 1,
    errors: 1,
    admins: 1,
    audit: 1,
  });

  const loadDirectory = useCallback(async ({ searchTerm = '', cursor = null, append = false } = {}) => {
    setDirectoryState((current) => ({ ...current, loading: true }));
    try {
      const result = await fetchAdminDirectory({ search: searchTerm, cursor: cursor ? JSON.stringify(cursor) : null, limit: 50 });
      const directory = result?.directory || { available: false, items: [], nextCursor: null };
      setDirectoryState((current) => ({
        available: directory.available === true,
        items: append ? [...current.items, ...(directory.items || [])] : (directory.items || []),
        nextCursor: directory.nextCursor || null,
        loading: false,
      }));
      return directory;
    } catch {
      setDirectoryState((current) => ({ ...current, loading: false }));
      return null;
    }
  }, []);

  const loadJobOperations = useCallback(async () => {
    setJobOperations((current) => ({ ...current, loading: true, error: '' }));
    try {
      const result = await fetchAdminJobOperations({ limit: 25 });
      const operations = result?.jobOperations || { available: false, items: [] };
      setJobOperations({
        available: operations.available === true,
        items: operations.items || [],
        loading: false,
        error: '',
      });
    } catch (error) {
      setJobOperations({ available: false, items: [], loading: false, error: error.message || 'Job operations could not be loaded.' });
    }
  }, []);

  const loadOverview = async () => {
    setLoading(true);
    setAccessError('');
    try {
      const [overviewResult, directoryResult] = await Promise.allSettled([
        fetchAdminOverview(),
        fetchAdminDirectory({ limit: 50 }),
      ]);
      if (overviewResult.status !== 'fulfilled') throw overviewResult.reason;
      setData(overviewResult.value);
      const directory = directoryResult.status === 'fulfilled'
        ? (directoryResult.value?.directory || { available: false, items: [], nextCursor: null })
        : { available: false, items: [], nextCursor: null };
      setDirectoryState({
        available: directory.available === true,
        items: directory.items || [],
        nextCursor: directory.nextCursor || null,
        loading: false,
      });
    } catch (error) {
      const message = error.message || 'Could not load admin dashboard';
      setAccessError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/signin');
      return;
    }
    loadOverview();
    void loadJobOperations();
  }, [authLoading, user, navigate, loadJobOperations]);

  useEffect(() => {
    if (directoryState.available !== true) return undefined;
    const timer = setTimeout(() => {
      void loadDirectory({ searchTerm: search });
    }, 250);
    return () => clearTimeout(timer);
  }, [directoryState.available, loadDirectory, search]);

  const analytics = data?.analytics || {};
  const canManageAdmins = data?.admin?.role === 'owner';
  const canManagePrivacy = ['owner', 'admin'].includes(data?.admin?.role);
  const canManageJobActions = ['owner', 'admin'].includes(data?.admin?.role);
  const canApproveDeletion = data?.admin?.role === 'owner';

  const loadCustomer = useCallback(async (userId) => {
    const requestId = customerRequestRef.current + 1;
    customerRequestRef.current = requestId;
    setCustomerDetail({ loading: true, data: null, error: '' });
    try {
      const result = await fetchAdminCustomer(userId);
      if (customerRequestRef.current !== requestId) return;
      setCustomerDetail({ loading: false, data: result?.customer || null, error: '' });
    } catch (error) {
      if (customerRequestRef.current !== requestId) return;
      setCustomerDetail({ loading: false, data: null, error: error.message || 'Customer details could not be loaded.' });
    }
  }, []);

  const navigateToSection = useCallback((section) => {
    const nextSection = ADMIN_SECTIONS.has(section) ? section : 'overview';
    navigate(nextSection === 'overview' ? '/admin' : `/admin/${nextSection}`);
  }, [navigate]);

  const openCustomer = useCallback((userId) => {
    navigate(`/admin/users/${encodeURIComponent(userId)}`);
  }, [navigate]);

  const closeCustomerDetail = useCallback(() => {
    setCustomerDetail({ loading: false, data: null, error: '' });
    navigate('/admin/users');
  }, [navigate]);

  useEffect(() => {
    setActiveTab(routeState.section);
  }, [routeState.section]);

  useEffect(() => {
    if (routeState.userId) {
      void loadCustomer(routeState.userId);
      return;
    }
    setCustomerDetail((current) => current.data || current.error || current.loading
      ? { loading: false, data: null, error: '' }
      : current);
  }, [loadCustomer, routeState.userId]);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    const users = directoryState.available === true ? directoryState.items : (data?.users || []);
    if (!query) return users;
    return users.filter((item) => (
      item.email?.toLowerCase().includes(query) ||
      item.fullName?.toLowerCase().includes(query) ||
      item.id?.toLowerCase().includes(query)
    ));
  }, [data?.users, directoryState.available, directoryState.items, search]);

  const errors = useMemo(() => data?.errors || [], [data?.errors]);
  const adminMembers = useMemo(() => data?.adminMembers || [], [data?.adminMembers]);
  const audit = useMemo(() => data?.audit || [], [data?.audit]);
  const billingEntitlements = useMemo(() => data?.billingEntitlements || [], [data?.billingEntitlements]);
  const billingSubscriptions = useMemo(() => data?.billingSubscriptions || [], [data?.billingSubscriptions]);
  const billingTransactions = useMemo(() => data?.billingTransactions || [], [data?.billingTransactions]);
  const usersTotalPages = directoryState.available === true ? 1 : getTotalPages(filteredUsers, adminPageSizes.users);
  const errorsTotalPages = getTotalPages(errors, adminPageSizes.errors);
  const adminsTotalPages = getTotalPages(adminMembers, adminPageSizes.admins);
  const auditTotalPages = getTotalPages(audit, adminPageSizes.audit);
  const paginatedUsers = useMemo(() => (
    directoryState.available === true ? filteredUsers : paginate(filteredUsers, pages.users, adminPageSizes.users)
  ), [directoryState.available, filteredUsers, pages.users]);
  const paginatedErrors = useMemo(
    () => paginate(errors, pages.errors, adminPageSizes.errors),
    [errors, pages.errors],
  );
  const paginatedAdminMembers = useMemo(
    () => paginate(adminMembers, pages.admins, adminPageSizes.admins),
    [adminMembers, pages.admins],
  );
  const paginatedAudit = useMemo(
    () => paginate(audit, pages.audit, adminPageSizes.audit),
    [audit, pages.audit],
  );

  const setTabPage = (tab, page) => {
    setPages((current) => ({ ...current, [tab]: page }));
  };

  useEffect(() => {
    setTabPage('users', 1);
  }, [search]);

  useEffect(() => {
    setPages((current) => ({
      users: Math.min(Math.max(current.users, 1), usersTotalPages),
      errors: Math.min(Math.max(current.errors, 1), errorsTotalPages),
      admins: Math.min(Math.max(current.admins, 1), adminsTotalPages),
      audit: Math.min(Math.max(current.audit, 1), auditTotalPages),
    }));
  }, [usersTotalPages, errorsTotalPages, adminsTotalPages, auditTotalPages]);

  const runAction = async (key, task, successMessage, refreshUserId = null) => {
    setActionLoading(key);
    const idempotencyKey = actionKeys.current.get(key) || createAdminIdempotencyKey();
    actionKeys.current.set(key, idempotencyKey);
    try {
      const result = await task(idempotencyKey);
      setData(result);
      if (refreshUserId) void loadCustomer(refreshUserId);
      if (directoryState.available === true) {
        void loadDirectory({ searchTerm: search });
      }
      actionKeys.current.delete(key);
      toast.success(successMessage);
    } catch (error) {
      if (error.code === 'operation_pending_reconciliation') {
        setPendingOperations((current) => [
          { key, requestId: error.requestId || null, message: error.message || 'The result is still being reconciled.' },
          ...current.filter((item) => item.key !== key),
        ].slice(0, 5));
        toast.error('The change may have completed. Refresh to reconcile its status.');
        void loadOverview();
      } else {
        toast.error(error.message || 'Admin action failed');
      }
    } finally {
      if (key.startsWith('job-action-')) void loadJobOperations();
      setActionLoading('');
    }
  };

  const grantPremium = (target) => {
    setActionDialog({ type: 'grantPremium', key: `premium-${target.id}`, target, title: 'Grant premium access', confirmLabel: 'Grant access' });
  };

  const removePremium = (target) => {
    setActionDialog({ type: 'removePremium', key: `premium-${target.id}`, target, title: 'Remove manual premium access', confirmLabel: 'Remove access', danger: true, message: 'This removes the manual entitlement. A separate valid Stripe or PayPal entitlement will remain active.' });
  };

  const editAiLimit = (target) => {
    setActionDialog({ type: 'aiLimit', key: `ai-limit-${target.id}`, target, title: 'Update AI allowance', confirmLabel: 'Save allowance' });
  };

  const toggleBan = (target) => {
    if (target.isBanned) {
      setActionDialog({ type: 'unban', key: `ban-${target.id}`, target, title: 'Unban user', confirmLabel: 'Unban user', message: 'This restores sign-in access for the account.', danger: false });
      return;
    }
    setActionDialog({ type: 'ban', key: `ban-${target.id}`, target, title: 'Ban user', confirmLabel: 'Ban user', danger: true });
  };

  const deleteUser = (target) => {
    setActionDialog({ type: 'delete', key: `delete-${target.id}`, target, title: 'Queue account deletion review', confirmLabel: 'Queue deletion', danger: true, message: 'This creates a durable deletion request for provider, export, hold, and resumable data-review steps. It does not delete the account immediately.' });
  };

  const requestExport = (target) => {
    setActionDialog({ type: 'export', key: `export-${target.id}`, target, title: 'Request customer export', confirmLabel: 'Queue export', message: 'The export will be created as a durable background request. No download link is created until an export worker completes and authorizes it.' });
  };

  const cancelDeletion = (job) => {
    setActionDialog({ type: 'cancelDeletion', key: `cancel-deletion-${job.id}`, target: { id: job.id, userId: job.target_user_id, email: `Request ${job.id}` }, title: 'Cancel deletion request', confirmLabel: 'Cancel request', message: 'Only pending, provider-blocked, or hold-blocked deletion requests can be cancelled. A processing request is left for reconciliation.' });
  };

  const approveDeletion = (job) => {
    setActionDialog({ type: 'approveDeletion', key: `approve-deletion-${job.id}`, target: { id: job.id, userId: job.target_user_id, email: `Request ${job.id}` }, title: 'Approve account deletion', confirmLabel: 'Approve deletion', danger: true, message: 'This is the owner confirmation step. It does not delete Auth data, cancel a provider, remove accounting evidence, or bypass holds; the durable workflow remains resumable and fail-closed.' });
  };

  const recordProviderCancellation = (review) => {
    setActionDialog({ type: 'providerCancellation', key: `provider-cancellation-${review.id}`, target: { id: review.id, userId: review.target_user_id, email: `${review.provider} ${review.subscription_id}` }, title: 'Record provider cancellation review', confirmLabel: 'Record evidence', message: 'This creates an audited receipt for a cancellation completed outside ResumeATS. It does not cancel the provider subscription.' });
  };

  const placeHold = (target) => {
    setActionDialog({ type: 'privacyHold', key: `privacy-hold-${target.id}`, target, title: 'Place privacy hold', confirmLabel: 'Place hold', message: 'A hold pauses deletion review until it is released or expires. Record only the minimum operational reason.' });
  };

  const releaseHold = (hold) => {
    setActionDialog({ type: 'releaseHold', key: `release-hold-${hold.id}`, target: { id: hold.id, userId: hold.target_user_id, email: `${hold.hold_type} hold` }, title: 'Release privacy hold', confirmLabel: 'Release hold', danger: true, message: 'Only the hold is released. Any deletion request remains a separate durable workflow.' });
  };

  const openAutoApplyJobAction = (job, operation) => {
    const labels = { retry: 'Retry auto-apply job', cancel: 'Cancel auto-apply job', reconcile: 'Request auto-apply reconciliation' };
    const messages = {
      retry: 'This re-queues the failed job only when no outbound message receipt exists.',
      cancel: 'This marks the job skipped only while it is discovered or queued; it does not cancel external work.',
      reconcile: 'This records a review request for an applying job or a failed job with an outbound receipt. It does not claim success or failure externally.',
    };
    setActionDialog({
      type: 'autoApplyJobAction',
      key: `job-action-${operation}-${job.id}`,
      target: { id: job.id, email: job.userEmail || job.title || 'Auto-apply job' },
      operation,
      title: labels[operation],
      confirmLabel: operation === 'cancel' ? 'Cancel job' : operation === 'retry' ? 'Queue retry' : 'Request reconciliation',
      danger: operation === 'cancel',
      message: messages[operation],
    });
  };

  const submitActionDialog = (values) => {
    const dialog = actionDialog;
    setActionDialog(null);
    if (!dialog) return;

    if (dialog.type === 'grantPremium') {
      const numericDays = Number(values.days);
      const numericLimit = Number(values.aiLimit);
      if (!Number.isFinite(numericDays) || numericDays <= 0 || !Number.isFinite(numericLimit) || numericLimit <= 0) {
        toast.error('Enter valid positive values for duration and AI limit');
        return;
      }
      const premiumUntil = new Date(Date.now() + numericDays * 24 * 60 * 60 * 1000).toISOString();
      runAction(dialog.key, (idempotencyKey) => setUserPremium({ userId: dialog.target.id, premium: true, plan: 'premium_manual', aiLimit: numericLimit, premiumUntil, idempotencyKey }), 'Premium access granted');
    } else if (dialog.type === 'removePremium') {
      runAction(dialog.key, (idempotencyKey) => setUserPremium({ userId: dialog.target.id, premium: false, idempotencyKey }), 'Premium access removed');
    } else if (dialog.type === 'aiLimit') {
      const numericLimit = Number(values.aiLimit);
      if (!Number.isInteger(numericLimit) || numericLimit < 0) {
        toast.error('Enter a whole-number AI limit of 0 or higher');
        return;
      }
      runAction(dialog.key, (idempotencyKey) => setUserAiLimit({ userId: dialog.target.id, aiLimit: numericLimit, resetUsage: values.resetUsage, idempotencyKey }), 'AI usage limit updated');
    } else if (dialog.type === 'ban') {
      runAction(dialog.key, (idempotencyKey) => setUserBan({ userId: dialog.target.id, banned: true, reason: values.reason, idempotencyKey }), 'User banned');
    } else if (dialog.type === 'unban') {
      runAction(dialog.key, (idempotencyKey) => setUserBan({ userId: dialog.target.id, banned: false, idempotencyKey }), 'User unbanned');
    } else if (dialog.type === 'delete') {
      runAction(dialog.key, (idempotencyKey) => deleteAdminUser(dialog.target.id, idempotencyKey), 'Deletion request queued for review', dialog.target.id);
    } else if (dialog.type === 'approveDeletion') {
      runAction(dialog.key, (idempotencyKey) => approveAdminPrivacyDeletion(dialog.target.id, idempotencyKey), 'Deletion approval recorded', dialog.target.userId);
    } else if (dialog.type === 'export') {
      runAction(dialog.key, (idempotencyKey) => requestAdminExport(dialog.target.id, idempotencyKey), 'Export request queued', dialog.target.id);
    } else if (dialog.type === 'cancelDeletion') {
      runAction(dialog.key, (idempotencyKey) => cancelAdminPrivacyDeletion({ jobId: dialog.target.id, idempotencyKey }), 'Deletion request cancelled', dialog.target.userId);
    } else if (dialog.type === 'privacyHold') {
      runAction(dialog.key, (idempotencyKey) => placeAdminPrivacyHold({ userId: dialog.target.id, holdType: values.holdType, reason: values.reason, expiresAt: values.expiresAt ? new Date(values.expiresAt).toISOString() : null, idempotencyKey }), 'Privacy hold placed', dialog.target.id);
    } else if (dialog.type === 'releaseHold') {
      runAction(dialog.key, (idempotencyKey) => releaseAdminPrivacyHold(dialog.target.id, idempotencyKey), 'Privacy hold released', dialog.target.userId);
    } else if (dialog.type === 'providerCancellation') {
      runAction(dialog.key, (idempotencyKey) => recordAdminProviderCancellationReview({ reviewId: dialog.target.id, evidenceReference: values.evidenceReference, reason: values.reason, idempotencyKey }), 'Provider cancellation review recorded', dialog.target.userId);
    } else if (dialog.type === 'autoApplyJobAction') {
      if (!values.reason.trim()) {
        toast.error('Enter a reason for this job action');
        return;
      }
      runAction(dialog.key, (idempotencyKey) => requestAdminAutoApplyJobAction({ jobId: dialog.target.id, operation: dialog.operation, reason: values.reason.trim(), idempotencyKey }), 'Auto-apply operation recorded');
    } else if (dialog.type === 'revokeAdmin') {
      runAction(dialog.key, (idempotencyKey) => revokeAdminAccess(dialog.target.id, idempotencyKey), 'Admin access revoked');
    } else if (dialog.type === 'updateAdminRole') {
      runAction(dialog.key, (idempotencyKey) => updateAdminRole({ memberId: dialog.target.id, role: dialog.target.nextRole, idempotencyKey }), 'Admin role updated');
    }
  };

  const resolveError = (errorId) => {
    runAction(
      `resolve-${errorId}`,
      (idempotencyKey) => resolveClientError(errorId, idempotencyKey),
      'Error marked as resolved',
    );
  };

  const submitGrantAdmin = (event) => {
    event.preventDefault();
    if (!adminEmail.trim()) {
      toast.error('Enter an email address');
      return;
    }

    runAction(
      'grant-admin',
      (idempotencyKey) => grantAdminAccess({ email: adminEmail.trim(), role: adminRole, idempotencyKey }),
      'Admin access updated',
    );
    setAdminEmail('');
  };

  const revokeAdmin = (member) => {
    setActionDialog({ type: 'revokeAdmin', key: `revoke-${member.id}`, target: member, title: 'Revoke admin access', confirmLabel: 'Revoke access', danger: true, message: 'The membership will be deactivated and the next request will re-check access from the database.' });
  };

  const changeAdminRole = (member, nextRole) => {
    if (!nextRole || nextRole === member.role) return;
    setActionDialog({
      type: 'updateAdminRole',
      key: `role-${member.id}`,
      target: { ...member, nextRole },
      title: 'Change admin role',
      confirmLabel: 'Change role',
      message: `Change ${member.email} from ${member.role} to ${nextRole}? The server will re-check owner safeguards and record the change in the audit log.`,
    });
  };

  const getAdminMemberStatus = (member) => {
    if (!member.is_active) return 'Inactive';
    if (!member.user_id) {
      if (member.invitation_expires_at && Date.parse(member.invitation_expires_at) <= Date.now()) return 'Invite expired';
      if (member.invitation_delivery?.status === 'sent') return 'Invitation sent';
      if (member.invitation_delivery?.status === 'processing') return 'Invitation sending';
      if (member.invitation_delivery?.status === 'dead_letter') return 'Invitation email failed';
      return member.invitation_delivery?.status === 'pending' ? 'Invitation queued' : 'Invitation pending';
    }
    return 'Active';
  };

  if (loading || authLoading) {
    return (
      <div className="app-page bg-gray-50 dark:bg-slate-900">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="h-10 w-72 animate-pulse rounded-xl bg-gray-200 dark:bg-slate-700" />
          <div className="grid gap-4 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className={`${cardClass} h-32 animate-pulse`} />
            ))}
          </div>
          <div className={`${cardClass} h-96 animate-pulse`} />
        </div>
      </div>
    );
  }

  return (
    <AdminShell activeSection={activeTab} onNavigate={navigateToSection}>
      <AdminActionDialog dialog={actionDialog} pending={Boolean(actionDialog && actionLoading === actionDialog.key)} onClose={() => setActionDialog(null)} onConfirm={submitActionDialog} />
      <div className="app-page admin-page text-slate-900 dark:text-slate-100">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400">
              Admin
            </div>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 dark:text-white">
              ResumeATS Control Center
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Manage users, subscriptions, bans, errors, audit history, and platform health.
            </p>
          </div>
          <button type="button" className={secondaryButtonClass} onClick={loadOverview}>
            Refresh
          </button>
        </div>

        {pendingOperations.length > 0 && (
          <div className={`${cardClass} border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/30`} role="status" aria-live="polite">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-amber-950 dark:text-amber-100">Pending operation reconciliation</h2>
                <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">The server could not store a final receipt yet. The original idempotency key is retained, so retrying will not blindly duplicate the mutation.</p>
              </div>
              <button type="button" className={secondaryButtonClass} onClick={() => { setPendingOperations([]); void loadOverview(); }}>Refresh status</button>
            </div>
            <ul className="mt-3 space-y-1 text-xs text-amber-900 dark:text-amber-100">
              {pendingOperations.map((item) => <li key={item.key}>Operation {item.requestId || item.key}: {item.message}</li>)}
            </ul>
          </div>
        )}

        {accessError ? (
          <div className={`${cardClass} p-8`}>
            <h2 className="text-xl font-bold text-slate-950 dark:text-white">Admin access unavailable</h2>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">{accessError}</p>
            <button type="button" className={`${primaryButtonClass} mt-5`} onClick={loadOverview}>
              Try again
            </button>
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <StatCard label="Total Users" value={analytics.totalUsers} caption={`${analytics.recentSignups || 0} joined this week`} />
              <StatCard label="Premium" value={analytics.premiumUsers} caption={`${analytics.freeUsers || 0} free users`} />
              <StatCard label="Unresolved Errors" value={analytics.unresolvedErrors} caption="Client reports waiting" />
              <StatCard label="Applications" value={analytics.applications} caption={`${analytics.resumes || 0} resumes saved`} />
              <StatCard label="AI Usage" value={analytics.totalAiUsed} caption="Lifetime visible profile usage" />
            </div>

            <div className={`${cardClass} overflow-hidden`}>
              {activeTab === 'overview' && (
                <AdminOverview analytics={analytics} generatedAt={data?.generatedAt} onNavigate={navigateToSection} />
              )}

              {activeTab === 'users' && (
                <section className="p-5">
                  <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h2 className="text-xl font-bold">Users</h2>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Grant premium, change AI usage limits, remove premium, ban, unban, and delete accounts.
                      </p>
                    </div>
                    <label htmlFor="admin-user-search" className="sr-only">Search users</label>
                    <input
                      id="admin-user-search"
                      type="search"
                      className={`${inputClass} md:max-w-sm`}
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search by email, name, or ID"
                    />
                  </div>
                  {customerDetail.loading && <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-100">Loading customer details…</div>}
                  {customerDetail.error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100">{customerDetail.error}</div>}
                  {customerDetail.data && <button type="button" className="admin-customer-detail-backdrop" aria-label="Close customer details" onClick={closeCustomerDetail} />}
                  {customerDetail.data && <AdminCustomerDetail
                    detail={customerDetail.data}
                    onClose={closeCustomerDetail}
                    onRequestExport={requestExport}
                    onRequestDeletion={deleteUser}
                    onCancelDeletion={cancelDeletion}
                    onApproveDeletion={approveDeletion}
                    onPlaceHold={placeHold}
                    onReleaseHold={releaseHold}
                    onRecordProviderCancellation={recordProviderCancellation}
                    canManagePrivacy={canManagePrivacy}
                    canApproveDeletion={canApproveDeletion}
                  />}
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-slate-700">
                      <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
                        <tr>
                          <th className="px-4 py-3">User</th>
                          <th className="px-4 py-3">Plan</th>
                          <th className="px-4 py-3">AI</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Last sign in</th>
                          <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                        {paginatedUsers.map((item) => (
                          <tr key={item.id} className="align-top">
                            <td className="px-4 py-4">
                              <div className="font-semibold text-slate-950 dark:text-white">{item.email || 'No email'}</div>
                              <div className="text-xs text-slate-500 dark:text-slate-400">{item.fullName || 'No name'} · {item.id}</div>
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex flex-col gap-1">
                                <StatusBadge tone={item.isPremium ? 'green' : 'gray'}>
                                  {item.isPremium ? 'Premium' : 'Free'}
                                </StatusBadge>
                                <span className="text-xs text-slate-500 dark:text-slate-400">
                                  {item.premiumPlan || 'No plan'} · until {formatDateShort(item.premiumUntil)}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <div className="space-y-2">
                                <div>
                                  <span className="font-semibold text-slate-950 dark:text-white">
                                    {item.aiGenerationsUsed || 0} / {item.aiGenerationsLimit || 0}
                                  </span>
                                  <div className="text-xs text-slate-500 dark:text-slate-400">
                                    {getRemainingAiGenerations(item)} remaining
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  className={secondaryButtonClass}
                                  disabled={actionLoading === `ai-limit-${item.id}`}
                                  onClick={() => editAiLimit(item)}
                                >
                                  Set Limit
                                </button>
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex flex-wrap gap-2">
                                {item.isAdmin && <StatusBadge tone="blue">{item.adminRole || 'Admin'}</StatusBadge>}
                                {item.isBanned ? <StatusBadge tone="red">Banned</StatusBadge> : <StatusBadge tone="green">Active</StatusBadge>}
                              </div>
                              {item.bannedReason && (
                                <div className="mt-1 text-xs text-red-600 dark:text-red-300">{item.bannedReason}</div>
                              )}
                            </td>
                            <td className="px-4 py-4 text-slate-600 dark:text-slate-300">
                              {formatDate(item.lastSignInAt)}
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex flex-wrap justify-end gap-2">
                                {item.isPremium ? (
                                  <button type="button" className={secondaryButtonClass} disabled={actionLoading === `premium-${item.id}`} onClick={() => removePremium(item)}>
                                    Remove Premium
                                  </button>
                                ) : (
                                  <button type="button" className={primaryButtonClass} disabled={actionLoading === `premium-${item.id}`} onClick={() => grantPremium(item)}>
                                    Give Premium
                                  </button>
                                )}
                                <button type="button" className={secondaryButtonClass} disabled={actionLoading === `ban-${item.id}`} onClick={() => toggleBan(item)}>
                                  {item.isBanned ? 'Unban' : 'Ban'}
                                </button>
                                <button type="button" className={secondaryButtonClass} onClick={() => openCustomer(item.id)}>
                                  View details
                                </button>
                                <button type="button" className={dangerButtonClass} disabled={actionLoading === `delete-${item.id}`} onClick={() => deleteUser(item)}>
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {directoryState.available === true ? (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200 p-3 text-sm dark:border-slate-700">
                      <span className="text-slate-500 dark:text-slate-400">Showing a bounded server-side directory page.</span>
                      {directoryState.nextCursor && <button type="button" className={secondaryButtonClass} disabled={directoryState.loading} onClick={() => loadDirectory({ searchTerm: search, cursor: directoryState.nextCursor, append: true })}>{directoryState.loading ? 'Loading…' : 'Load more users'}</button>}
                    </div>
                  ) : (
                    <Pagination
                      currentPage={pages.users}
                      totalPages={usersTotalPages}
                      onPageChange={(page) => setTabPage('users', page)}
                      totalItems={filteredUsers.length}
                      pageSize={adminPageSizes.users}
                      itemLabel="users"
                      className="mt-4 rounded-2xl"
                    />
                  )}
                </section>
              )}

              {activeTab === 'errors' && (
                <section className="space-y-3 p-5">
                  <div>
                    <h2 className="text-xl font-bold">Client Errors</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Browser errors reported from the app and extension-facing flows.
                    </p>
                  </div>
                  {paginatedErrors.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-gray-200 p-4 dark:border-slate-700">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusBadge tone={item.resolved_at ? 'green' : item.severity === 'critical' ? 'red' : 'amber'}>
                              {item.resolved_at ? 'Resolved' : item.severity}
                            </StatusBadge>
                            <span className="text-xs text-slate-500 dark:text-slate-400">{formatDate(item.created_at)}</span>
                          </div>
                          <div className="mt-3 font-semibold text-slate-950 dark:text-white">{item.message}</div>
                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.user_email || 'Anonymous'} · {item.source}</div>
                          {item.url && <div className="mt-1 break-all text-xs text-blue-600 dark:text-blue-300">{item.url}</div>}
                          {item.stack && (
                            <pre className="mt-3 max-h-40 overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-100">{item.stack}</pre>
                          )}
                        </div>
                        {!item.resolved_at && (
                          <button type="button" className={secondaryButtonClass} disabled={actionLoading === `resolve-${item.id}`} onClick={() => resolveError(item.id)}>
                            Resolve
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {errors.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-gray-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                      No client errors have been reported yet.
                    </div>
                  )}
                  {errors.length > 0 && (
                    <Pagination
                      currentPage={pages.errors}
                      totalPages={errorsTotalPages}
                      onPageChange={(page) => setTabPage('errors', page)}
                      totalItems={errors.length}
                      pageSize={adminPageSizes.errors}
                      itemLabel="errors"
                      className="rounded-2xl"
                    />
                  )}
                </section>
              )}

              {activeTab === 'analytics' && (
                <AdminAnalyticsPanel />
              )}

              {activeTab === 'admins' && (
                <section className="space-y-5 p-5">
                  <div>
                    <h2 className="text-xl font-bold">Admin Access</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Only owners can grant or revoke admin access. The database membership is authoritative, and email-only access is a seven-day invitation claimed after sign-in with the same verified email. Delivery remains visible as queued, sent, or failed.
                    </p>
                  </div>

                  {canManageAdmins && (
                    <form className="grid gap-3 rounded-2xl border border-gray-200 p-4 dark:border-slate-700 md:grid-cols-[1fr_180px_auto]" onSubmit={submitGrantAdmin}>
                      <label htmlFor="grant-admin-email" className="sr-only">Admin email</label>
                      <input id="grant-admin-email" className={inputClass} type="email" value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} placeholder="admin@example.com" />
                      <label htmlFor="grant-admin-role" className="sr-only">Admin role</label>
                      <select id="grant-admin-role" className={inputClass} value={adminRole} onChange={(event) => setAdminRole(event.target.value)}>
                        <option value="admin">Admin</option>
                        <option value="support">Support</option>
                        <option value="owner">Owner</option>
                      </select>
                      <button type="submit" className={primaryButtonClass} disabled={actionLoading === 'grant-admin'}>
                        Invite / grant access
                      </button>
                    </form>
                  )}

                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-slate-700">
                      <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
                        <tr>
                          <th className="px-4 py-3">Email</th>
                          <th className="px-4 py-3">Role</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Created</th>
                          <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                        {paginatedAdminMembers.map((member) => (
                          <tr key={member.id}>
                            <td className="px-4 py-4 font-semibold">{member.email}</td>
                            <td className="px-4 py-4">{canManageAdmins && member.is_active && member.user_id !== data?.admin?.id ? <label className="flex items-center gap-2"><span className="sr-only">Role for {member.email}</span><select className={`${inputClass} min-w-32`} value={member.role} onChange={(event) => changeAdminRole(member, event.target.value)}><option value="admin">Admin</option><option value="support">Support</option><option value="owner">Owner</option></select></label> : member.role}</td>
                            <td className="px-4 py-4">
                              <StatusBadge tone={member.is_active && member.user_id ? 'green' : 'gray'}>
                                {getAdminMemberStatus(member)}
                              </StatusBadge>
                              {!member.user_id && member.is_active && member.invitation_expires_at && (
                                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Expires {formatDate(member.invitation_expires_at)}</div>
                              )}
                              {!member.user_id && member.invitation_delivery?.last_error && (
                                <div className="mt-1 max-w-xs break-words text-xs text-red-600 dark:text-red-300">{member.invitation_delivery.last_error}</div>
                              )}
                            </td>
                            <td className="px-4 py-4">{formatDate(member.created_at)}</td>
                            <td className="px-4 py-4 text-right">
                              {canManageAdmins && member.is_active && (
                                <button type="button" className={dangerButtonClass} disabled={actionLoading === `revoke-${member.id}`} onClick={() => revokeAdmin(member)}>
                                  Revoke
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Pagination
                    currentPage={pages.admins}
                    totalPages={adminsTotalPages}
                    onPageChange={(page) => setTabPage('admins', page)}
                    totalItems={adminMembers.length}
                    pageSize={adminPageSizes.admins}
                    itemLabel="admins"
                    className="rounded-2xl"
                  />
                </section>
              )}

              {activeTab === 'audit' && (
                <section className="space-y-3 p-5">
                  <div>
                    <h2 className="text-xl font-bold">Audit Log</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Recent privileged actions performed through the admin dashboard.
                    </p>
                  </div>
                  {paginatedAudit.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-gray-200 p-4 text-sm dark:border-slate-700">
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                          <div className="font-semibold text-slate-950 dark:text-white">{item.action}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            Admin {item.admin_user_id || 'unknown'} · Target {item.target_user_id || 'none'}
                          </div>
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{formatDate(item.created_at)}</div>
                      </div>
                      <pre className="mt-3 max-h-32 overflow-auto rounded-xl bg-gray-50 p-3 text-xs text-slate-700 dark:bg-slate-900 dark:text-slate-300">
                        {JSON.stringify(item.metadata || {}, null, 2)}
                      </pre>
                    </div>
                  ))}
                  {audit.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-gray-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                      No audit events yet.
                    </div>
                  )}
                  {audit.length > 0 && (
                    <Pagination
                      currentPage={pages.audit}
                      totalPages={auditTotalPages}
                      onPageChange={(page) => setTabPage('audit', page)}
                      totalItems={audit.length}
                      pageSize={adminPageSizes.audit}
                      itemLabel="audit events"
                      className="rounded-2xl"
                    />
                  )}
                </section>
              )}

              {activeTab === 'subscriptions' && (
                <AdminSubscriptions
                  items={billingEntitlements}
                  events={data?.billingEvents || []}
                  subscriptions={billingSubscriptions}
                  transactions={billingTransactions}
                  projectionsAvailable={data?.billingProjectionsAvailable !== false}
                  reconciliationRuns={data?.billingReconciliationRuns || []}
                  reconciliationAvailable={data?.billingReconciliationAvailable !== false}
                  generatedAt={data?.generatedAt}
                />
              )}

              {activeTab === 'support' && <AdminSupportInbox />}

              {activeTab === 'jobs' && <AdminJobsPanel analytics={analytics} jobs={data?.jobs} operations={jobOperations} onAction={openAutoApplyJobAction} actionLoading={actionLoading} canManageActions={canManageJobActions} />}

              {activeTab === 'settings' && <div className="space-y-5"><AdminMfaPanel /><AdminIntegrationHealthPanel /><AdminSupportRoutingPanel /><AdminKnowledgePanel /></div>}
              {activeTab === 'feedback' && <AdminFeedbackPanel />}
            </div>
          </>
        )}
      </div>
      </div>
    </AdminShell>
  );
};

const AdminDashboard = () => (
  <AdminThemeProvider>
    <AdminDashboardContent />
  </AdminThemeProvider>
);

export default AdminDashboard;
