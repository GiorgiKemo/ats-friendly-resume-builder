import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { enrollAdminTotp, getAdminMfaState, verifyAdminTotp } from '../services/adminSecurityService';
import { Pagination } from '../components/ui';
import AdminShell, { AdminPageHeader } from '../components/admin/AdminShell';
import AdminActionDialog from '../components/admin/AdminActionDialog';
import { AdminThemeProvider, useAdminTheme } from '../components/admin/AdminThemeProvider';
import { ADMIN_STATUS_TONES } from '../components/admin/adminStatusTones';
import { AdminIcon } from '../components/admin/AdminIcons';
import { getSafeExternalUrl } from '../utils/urlSafety.js';
import { resolveSignupWeeks } from '../utils/adminSignupWeeks.js';
import {
  ANALYTICS_REPORTING_TIME_ZONE,
  formatAnalyticsTimestamp,
  formatDateInputValueInTimeZone,
  getAnalyticsDateRange,
  shiftDateInputValue,
} from '../utils/analyticsDateRange.js';
import {
  deleteAdminUser,
  approveAdminPrivacyDeletion,
  resumeAdminPrivacyDeletion,
  createAdminIdempotencyKey,
  cancelAdminPrivacyDeletion,
  fetchAdminAnalytics,
  rebuildAdminAnalyticsDailyAggregates,
  fetchAdminCustomer,
  fetchAdminDirectory,
  fetchAdminOverview,
  fetchAdminJobOperations,
  fetchFailedPrivacyDeletionJobs,
  fetchAdminSettings,
  fetchAdminAnalyticsCsv,
  reviewAdminAnalyticsCohortQuality,
  setAdminAnalyticsQaExclusion,
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
  linkLegacySupportInquiry,
  listSupportFeedback,
  listSupportImprovementItems,
  listSupportKnowledge,
  listSupportQueue,
  listLegacySupportInquiries,
  createSupportKnowledgeDraft,
  publishSupportKnowledge,
  rollbackSupportKnowledge,
  readSupportConversation,
  markSupportConversationRead,
  reopenSupportConversation,
  listSupportPresence,
  setSupportPresence,
  triageSupportConversation,
  resolveSupportConversation,
  sendSupportMessage,
  takeSupportConversation,
  updateSupportFeedbackTags,
  updateSupportImprovementItem,
} from '../services/supportService';

const cardClass = 'admin-card';
const inputClass = 'admin-input';
const primaryButtonClass = 'admin-btn admin-btn--primary';
const secondaryButtonClass = 'admin-btn admin-btn--secondary';
const dangerButtonClass = 'admin-btn admin-btn--danger';
const rowPrimaryClass = 'admin-row-btn admin-row-btn--primary';
const rowQuietClass = 'admin-row-btn admin-row-btn--quiet';
const rowDangerClass = 'admin-row-btn admin-row-btn--danger';
const adminPageSizes = {
  users: 20,
  errors: 10,
  admins: 10,
  audit: 10,
};

const ADMIN_SECTION_LABELS = {
  overview: 'Overview',
  users: 'Users',
  errors: 'Client errors',
  analytics: 'Analytics',
  admins: 'Admin access',
  subscriptions: 'Subscriptions',
  support: 'Support',
  jobs: 'AI and jobs',
  feedback: 'Feedback',
  audit: 'Audit log',
  settings: 'Settings',
};
const ADMIN_SECTIONS = new Set(Object.keys(ADMIN_SECTION_LABELS));
// These sections load their own data and show their own refresh control.
const SECTIONS_WITH_OWN_REFRESH = new Set(['analytics', 'support', 'feedback', 'settings']);

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

const getPrivacyDeletionFailureCopy = (failureCode) => {
  if (failureCode === 'pending_admin_operation') {
    return 'An admin operation is still running or awaiting reconciliation. Finish or resolve it, then resume this same deletion request.';
  }
  return failureCode || 'no failure code recorded';
};

const formatMoney = (amountMinor, currency) => {
  if (amountMinor === null || amountMinor === undefined || !Number.isFinite(Number(amountMinor))) return '—';
  return `${String(currency || 'USD').toUpperCase()} ${(Number(amountMinor) / 100).toFixed(2)}`;
};

const formatCurrencyMinorUnits = (amountMinor, currency) => {
  if (amountMinor === null || amountMinor === undefined || !Number.isFinite(Number(amountMinor))) return '—';
  const currencyCode = String(currency || '').toUpperCase();
  try {
    const fractionDigits = new Intl.NumberFormat('en', { style: 'currency', currency: currencyCode }).resolvedOptions().maximumFractionDigits;
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(Number(amountMinor) / (10 ** fractionDigits));
  } catch {
    return formatMoney(amountMinor, currencyCode || 'USD');
  }
};

const formatTimeShort = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

const AVATAR_TONES = ['indigo', 'violet', 'sky', 'emerald', 'amber', 'rose'];

const getAvatarTone = (seed = '') => {
  let hash = 0;
  for (const character of String(seed)) hash = (hash * 31 + character.charCodeAt(0)) % 997;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
};

const getInitials = (fullName, email) => {
  const source = String(fullName || '').trim() || String(email || '').split('@')[0];
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  const initials = parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : source.slice(0, 2);
  return initials.toUpperCase() || '?';
};

const getRemainingAiGenerations = (user) => Math.max(
  0,
  Number(user?.aiGenerationsLimit || 0) - Number(user?.aiGenerationsUsed || 0),
);

const MetricGrid = ({ items, columns = 'sm:grid-cols-2' }) => (
  <dl className={`grid gap-x-8 ${columns}`}>
    {items.map((item) => (
      <div key={item.label} className="flex items-baseline justify-between gap-4 border-b border-slate-200 py-2 dark:border-slate-700">
        <dt className="text-sm text-slate-600 dark:text-slate-300">{item.label}</dt>
        <dd className="text-right text-sm font-normal tabular-nums text-slate-950 dark:text-white">
          {item.value ?? '—'}
          {item.detail ? <span className="mt-0.5 block text-xs font-normal text-slate-500 dark:text-slate-400">{item.detail}</span> : null}
        </dd>
      </div>
    ))}
  </dl>
);

const StatusBadge = ({ tone = 'gray', children }) => {
  const resolvedTone = Object.hasOwn(ADMIN_STATUS_TONES, tone) ? tone : 'gray';

  return (
    <span data-admin-status-tone={resolvedTone} className={`inline-flex rounded-full px-2.5 py-1 text-xs font-normal ${ADMIN_STATUS_TONES[resolvedTone]}`}>
      {children}
    </span>
  );
};

const AdminDisclosure = ({ summary = 'Details', children }) => (
  <details className="admin-disclosure">
    <summary>{summary}</summary>
    <div className="admin-disclosure-body">{children}</div>
  </details>
);

const isMfaRequiredError = (message) => /verify your authenticator/i.test(String(message || ''));

// One consistent prompt when the server requires a two-factor (AAL2) session.
const AdminMfaRequired = ({ message, showAction = true }) => {
  const navigate = useNavigate();
  return (
    <div className="admin-mfa-required" role="status">
      <span className="admin-kpi-icon admin-tone-amber" aria-hidden="true"><AdminIcon name="admins" /></span>
      <div className="min-w-0 flex-1">
        <p className="admin-mfa-required-title">Two-factor sign-in required</p>
        <p className="admin-mfa-required-text">{message}</p>
      </div>
      {showAction && <button type="button" className={primaryButtonClass} onClick={() => navigate('/admin/settings')}>Go to Settings</button>}
    </div>
  );
};

const recurringRevenueQualityMessages = {
  provider_subscription_coverage_unverified: 'Provider subscription coverage has not been reconciled against Stripe and PayPal.',
  recurring_discounts_not_projected: 'Recurring discounts are not included in this estimate.',
  additional_subscription_items_not_projected: 'Additional Stripe subscription items are not included.',
  recurring_revenue_projection_unavailable: 'The subscription projection source is not installed or could not be read.',
  recurring_revenue_projection_invalid: 'The subscription projection returned data that failed validation.',
  recurring_revenue_projection_query_failed: 'The subscription projection could not be queried. Other analytics remain available.',
};

const AdminRecurringRevenuePanel = ({ snapshot }) => {
  const currencies = Array.isArray(snapshot?.currencies) ? snapshot.currencies : [];
  const qualityReasons = Array.isArray(snapshot?.qualityReasons) ? snapshot.qualityReasons : [];
  const available = snapshot?.available === true;

  return (
    <section className={`${cardClass} p-5`} aria-labelledby="admin-recurring-revenue-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="admin-recurring-revenue-title" className="text-lg font-normal text-slate-950 dark:text-white">Subscription run-rate preview</h3>
        </div>
        <StatusBadge tone={available ? 'amber' : 'gray'}>{available ? 'Incomplete estimate' : 'Unavailable'}</StatusBadge>
      </div>

      {!available && (
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400" role="status">
          No complete MRR figure is available. The billing projection could not provide a verified estimate; this is not evidence of zero revenue.
        </p>
      )}

      {available && currencies.length > 0 && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {currencies.map((row) => (
            <div key={row.currency} className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900/60 dark:bg-amber-950/20">
              <div className="text-xs font-normal uppercase tracking-wide text-slate-600 dark:text-slate-400">{row.currency} · observed monthly base-price run rate</div>
              <div className="mt-2 text-2xl font-normal text-slate-950 dark:text-white">{formatCurrencyMinorUnits(row.monthlyBasePriceMinor, row.currency)}</div>
              <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">{row.subscriptionCount} projected active subscription{row.subscriptionCount === 1 ? '' : 's'}</div>
            </div>
          ))}
        </div>
      )}

      {available && currencies.length === 0 && (
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400" role="status">
          No supported active live subscription projections were observed. This does not prove MRR is zero.
        </p>
      )}

      {available && snapshot.unsupportedProjectionCount > 0 && (
        <p className="mt-3 text-sm text-amber-800 dark:text-amber-200" role="status">
          {snapshot.unsupportedProjectionCount} active projection{snapshot.unsupportedProjectionCount === 1 ? '' : 's'} could not be normalized and are excluded from the preview.
        </p>
      )}

      {qualityReasons.length > 0 && (
        <AdminDisclosure summary="Why this is an estimate">
          <ul className="space-y-1" aria-label="Run-rate estimate limitations">
            {qualityReasons.map((reason) => <li key={reason}>{recurringRevenueQualityMessages[reason] || 'The projection has an unresolved data-quality limitation.'}</li>)}
          </ul>
        </AdminDisclosure>
      )}

      {available && snapshot.newestObservedAt && (
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Latest source observation: {formatDate(snapshot.newestObservedAt)}.</p>
      )}
    </section>
  );
};

const getMetric = (analytics, key) => (
  Number.isFinite(Number(analytics?.[key])) ? analytics[key] : null
);

const describePaidConversionQuality = (cohort) => {
  const reasons = cohort?.qualityReasons || [];
  const messages = {
    cohort_migration_not_applied: 'Cohort data source is not installed.',
    cohort_before_instrumentation_coverage: 'This cohort predates reliable tracking coverage.',
    qa_exclusion_review_required: 'Staff and QA exclusions need review.',
    privacy_deletion_history_may_be_incomplete: 'A completed privacy deletion may have removed historical cohort links.',
    stripe_reconciliation_missing_failed_or_stale: 'Stripe payment reconciliation is missing, failed, or stale.',
    paypal_reconciliation_missing_failed_or_stale: 'PayPal payment reconciliation is missing, failed, or stale.',
    consent_limited_export_event_coverage: 'Resume exports are recorded only when optional analytics consent is granted; this observed rate may undercount activation and is not a complete signup-population KPI.',
    product_action_event_coverage_incomplete: 'Recorded activity does not include every meaningful product action, and some events require optional analytics consent; retention is observed-only, not a complete account-population rate.',
  };
  return reasons.map((reason) => messages[reason] || 'Cohort source quality is incomplete.').join(' ');
};

const getPaidConversionSummary = (cohort) => {
  if (!cohort?.available) return { value: 'Not available', caption: describePaidConversionQuality(cohort) || 'Verified cohort data is unavailable.' };
  if (!cohort.isComplete) return { value: 'Not available', caption: describePaidConversionQuality(cohort) || 'The selected cohort is not complete.' };
  if (cohort.denominator === null || cohort.denominator === undefined || !Number.isFinite(Number(cohort.denominator))) {
    return { value: 'Not available', caption: 'The cohort denominator is unavailable.' };
  }
  if (Number(cohort.denominator) === 0) return { value: 'No mature accounts', caption: 'No eligible confirmed accounts in this completed cohort window.' };
  return {
    value: cohort.rate !== null && cohort.rate !== undefined && Number.isFinite(Number(cohort.rate)) ? `${cohort.rate}%` : 'Not available',
    caption: `${cohort.numerator} paid within 30 days / ${cohort.denominator} mature confirmed accounts · ${formatAnalyticsTimestamp(cohort.window?.from, cohort.window?.timezone || ANALYTICS_REPORTING_TIME_ZONE)} – ${formatAnalyticsTimestamp(cohort.window?.to, cohort.window?.timezone || ANALYTICS_REPORTING_TIME_ZONE)} (${cohort.window?.timezone || ANALYTICS_REPORTING_TIME_ZONE})`,
  };
};

const getResumeActivationSummary = (cohort) => {
  if (!cohort?.available) return { value: 'Not available', caption: describePaidConversionQuality(cohort) || 'Verified activation cohort data is unavailable.' };
  if (cohort.denominator === null || cohort.denominator === undefined || !Number.isFinite(Number(cohort.denominator))) {
    return { value: 'Not available', caption: 'The mature confirmed-account denominator is unavailable.' };
  }
  if (Number(cohort.denominator) === 0) {
    return { value: cohort.isComplete ? 'No mature accounts' : 'Not available', caption: describePaidConversionQuality(cohort) || 'No eligible confirmed accounts in this cohort window.' };
  }
  const observed = cohort.observedRate !== null && cohort.observedRate !== undefined && Number.isFinite(Number(cohort.observedRate))
    ? `${cohort.observedRate}% observed`
    : 'Not available';
  const quality = describePaidConversionQuality(cohort);
  const caption = `${cohort.numerator} recorded exports / ${cohort.denominator} mature confirmed accounts${quality ? ` · ${quality}` : ''}`;
  return { value: cohort.isComplete && cohort.rate !== null ? `${cohort.rate}%` : observed, caption };
};

const getProductRetentionPeriodSummary = (retention, periodKey, dayNumber) => {
  if (!retention?.available) return { value: 'Not available', caption: describePaidConversionQuality(retention) || 'Verified retention data is unavailable.' };
  const period = retention[periodKey];
  if (period?.denominator === null || period?.denominator === undefined) return { value: 'Not available', caption: 'The mature cohort denominator is unavailable.' };
  const numerator = Number(period?.numerator);
  const denominator = Number(period?.denominator);
  if (!Number.isFinite(denominator) || denominator < 0) return { value: 'Not available', caption: 'The mature cohort denominator is unavailable.' };
  if (denominator === 0) return { value: 'No mature accounts', caption: 'No eligible confirmed accounts have completed this observation day.' };
  const rate = Number(period?.observedRate);
  const value = Number.isFinite(rate) ? `${rate}% observed` : 'Not available';
  return {
    value,
    caption: `${Number.isFinite(numerator) ? numerator : '—'} / ${denominator} mature accounts with a recorded action on exact calendar day ${dayNumber}.`,
  };
};

const smoothLine = (points) => {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let path = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[index - 1] || points[index];
    const current = points[index];
    const next = points[index + 1];
    const after = points[index + 2] || next;
    const controlStartX = current.x + (next.x - previous.x) / 6;
    const controlStartY = current.y + (next.y - previous.y) / 6;
    const controlEndX = next.x - (after.x - current.x) / 6;
    const controlEndY = next.y - (after.y - current.y) / 6;
    path += ` C ${controlStartX.toFixed(1)} ${controlStartY.toFixed(1)}, ${controlEndX.toFixed(1)} ${controlEndY.toFixed(1)}, ${next.x.toFixed(1)} ${next.y.toFixed(1)}`;
  }
  return path;
};

const prefersReducedMotion = () => (
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches
);

const useCountUp = (target, duration = 900) => {
  const numericTarget = Number.isFinite(Number(target)) ? Number(target) : null;
  const [value, setValue] = useState(() => (numericTarget === null || prefersReducedMotion() ? numericTarget : 0));

  useEffect(() => {
    if (numericTarget === null || prefersReducedMotion()) {
      setValue(numericTarget);
      return undefined;
    }
    let frame = 0;
    const startedAt = performance.now();
    const tick = (now) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - (1 - progress) ** 4;
      setValue(Math.round(numericTarget * eased));
      if (progress < 1) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [numericTarget, duration]);

  return value;
};

const numberFormatter = new Intl.NumberFormat();

const formatCount = (value) => (value === null || value === undefined ? '—' : numberFormatter.format(value));

// The animated figure is decorative; assistive technology reads the final value.
const AnimatedCount = ({ value }) => {
  const animated = useCountUp(value);
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return <>—</>;
  return (
    <>
      <span aria-hidden="true">{formatCount(animated)}</span>
      <span className="sr-only">{formatCount(Number(value))}</span>
    </>
  );
};

const Sparkline = ({ values, tone = 'indigo' }) => {
  const colors = {
    indigo: ['#6366f1', '#a78bfa'],
    violet: ['#8b5cf6', '#d946ef'],
    emerald: ['#10b981', '#5eead4'],
    rose: ['#f43f5e', '#fb923c'],
    sky: ['#0ea5e9', '#67e8f9'],
  };
  const [from, to] = colors[tone] || colors.indigo;
  const width = 104;
  const height = 32;
  const peak = Math.max(1, ...values);
  const points = values.map((value, index) => ({
    x: values.length === 1 ? width / 2 : (index / (values.length - 1)) * width,
    y: height - 3 - (value / peak) * (height - 8),
  }));
  const line = smoothLine(points);
  const area = `${line} L ${width} ${height} L 0 ${height} Z`;
  const id = `admin-spark-${tone}`;

  return (
    <svg className="admin-sparkline" viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-stroke`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor={from} />
          <stop offset="100%" stopColor={to} />
        </linearGradient>
        <linearGradient id={`${id}-fill`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={from} stopOpacity="0.28" />
          <stop offset="100%" stopColor={from} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path className="is-area" d={area} fill={`url(#${id}-fill)`} />
      <path className="is-line" d={line} stroke={`url(#${id}-stroke)`} pathLength="1" />
    </svg>
  );
};

const AdminKpiCard = ({ label, value, icon, tone, caption, captionTone = '', captionIcon = null, spark = null }) => (
  <article className="admin-kpi">
    <span className={`admin-kpi-accent is-${tone}`} aria-hidden="true" />
    <div className="admin-kpi-top">
      <p className="admin-kpi-label">{label}</p>
      <span className={`admin-kpi-icon admin-tone-${tone}`} aria-hidden="true"><AdminIcon name={icon} /></span>
    </div>
    <p className="admin-kpi-value"><AnimatedCount value={value} /></p>
    <div className="admin-kpi-foot">
      <span className={`admin-kpi-caption ${captionTone}`.trim()}>
        {captionIcon ? <AdminIcon name={captionIcon} /> : null}
        {caption}
      </span>
      {spark}
    </div>
  </article>
);

const SignupWeekChart = ({ weeks }) => {
  const width = 640;
  const height = 260;
  const pad = { left: 40, right: 20, top: 34, bottom: 34 };
  const peak = Math.max(0, ...weeks.map((week) => week.count));
  const scaleMax = Math.max(1, peak);
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const baseline = pad.top + innerHeight;
  const xAt = (index) => {
    const inset = 28;
    const span = Math.max(0, innerWidth - inset * 2);
    return pad.left + inset + (weeks.length === 1 ? span / 2 : (index / (weeks.length - 1)) * span);
  };
  const yAt = (value) => pad.top + innerHeight - (value / scaleMax) * innerHeight;
  const points = weeks.map((week, index) => ({ x: xAt(index), y: yAt(week.count), week }));
  const line = smoothLine(points);
  const area = points.length ? `${line} L ${points[points.length - 1].x.toFixed(1)} ${baseline} L ${points[0].x.toFixed(1)} ${baseline} Z` : '';
  const ticks = scaleMax <= 4
    ? Array.from({ length: scaleMax + 1 }, (_, index) => index)
    : [0, Math.round(scaleMax / 2), scaleMax];
  const summary = weeks.map((week) => `${week.label} ${week.count}`).join(', ');
  const peakIndex = weeks.findIndex((week) => week.count === peak && peak > 0);
  const toLeft = (x) => `${(x / width) * 100}%`;
  const toTop = (y) => `${(y / height) * 100}%`;

  return (
    <div className="admin-area-chart" role="img" aria-label={`Signups by week. ${summary}. Vertical axis is signups.`}>
      <svg className="admin-chart-frame" viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="admin-signup-stroke" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="55%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#d946ef" />
          </linearGradient>
          <linearGradient id="admin-signup-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.32" />
            <stop offset="70%" stopColor="#6366f1" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((tick) => (
          <line key={tick} className={tick === 0 ? 'is-baseline' : ''} x1={pad.left} x2={width - pad.right} y1={yAt(tick)} y2={yAt(tick)} />
        ))}
        {area ? <path className="admin-chart-area" d={area} fill="url(#admin-signup-fill)" /> : null}
        <path className="admin-chart-line" d={line} pathLength="1" />
        {points.map((point, index) => (
          <circle
            key={point.week.start || point.week.label}
            className="admin-chart-dot"
            cx={point.x}
            cy={point.y}
            r="5"
            style={{ animationDelay: `${500 + index * 110}ms` }}
          />
        ))}
      </svg>
      {ticks.map((tick) => (
        <span key={`tick-${tick}`} className="admin-chart-label is-axis" style={{ left: toLeft(pad.left), top: toTop(yAt(tick)) }} aria-hidden="true">
          {Number.isInteger(tick) ? tick : tick.toFixed(1)}
        </span>
      ))}
      {points.map((point, index) => (
        <span
          key={`value-${point.week.start || point.week.label}`}
          className={`admin-chart-label is-value${index === peakIndex ? ' is-peak' : ''}`}
          style={{ left: toLeft(point.x), top: toTop(point.y), animationDelay: `${560 + index * 110}ms` }}
          aria-hidden="true"
        >
          {point.week.count}
        </span>
      ))}
      {points.map((point) => (
        <span
          key={`label-${point.week.start || point.week.label}`}
          className="admin-chart-label"
          style={{ left: toLeft(point.x), top: toTop(height - 20) }}
          aria-hidden="true"
        >
          {point.week.label}
        </span>
      ))}
    </div>
  );
};

const PlanMixDonut = ({ premium, free }) => {
  const ready = premium !== null && free !== null;
  const premiumCount = ready ? Number(premium) : 0;
  const freeCount = ready ? Number(free) : 0;
  const mixTotal = premiumCount + freeCount;
  const share = (count) => (mixTotal > 0 ? Math.round((count / mixTotal) * 100) : 0);
  const premiumShare = share(premiumCount);
  const freeShare = mixTotal > 0 ? 100 - premiumShare : 0;
  const radius = 80;
  const stroke = 22;
  const circumference = 2 * Math.PI * radius;
  // Leave a small visual gap between the two segments when both are present.
  const gap = premiumCount > 0 && freeCount > 0 ? 3 : 0;
  const premiumLength = mixTotal > 0 ? Math.max(0, (premiumCount / mixTotal) * circumference - gap) : 0;
  const freeLength = mixTotal > 0 ? Math.max(0, (freeCount / mixTotal) * circumference - gap) : 0;
  const freeOffset = -((premiumCount / Math.max(1, mixTotal)) * circumference);

  return (
    <div className="admin-donut">
      <div
        className="admin-donut-figure"
        role="img"
        aria-label={ready ? `Plan mix. Premium ${premiumCount}, ${premiumShare} percent. Free ${freeCount}, ${freeShare} percent.` : 'Plan mix is not available in this snapshot.'}
      >
        <svg viewBox="0 0 200 200" aria-hidden="true" focusable="false">
          <defs>
            <linearGradient id="admin-donut-premium" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" />
              <stop offset="100%" stopColor="#a855f7" />
            </linearGradient>
          </defs>
          <circle className="admin-donut-track" cx="100" cy="100" r={radius} strokeWidth={stroke} />
          {premiumLength > 0 && (
            <circle className="admin-donut-segment is-premium" cx="100" cy="100" r={radius} strokeWidth={stroke} strokeDasharray={`${premiumLength} ${circumference}`} />
          )}
          {freeLength > 0 && (
            <circle className="admin-donut-segment is-free" cx="100" cy="100" r={radius} strokeWidth={stroke} strokeDasharray={`${freeLength} ${circumference}`} strokeDashoffset={freeOffset} />
          )}
        </svg>
        <div className="admin-donut-center" aria-hidden="true">
          <strong>{ready ? `${premiumShare}%` : '—'}</strong>
          <span>premium share</span>
        </div>
      </div>
      {ready ? (
        <ul className="admin-donut-legend">
          <li>
            <div className="admin-donut-legend-row"><i className="admin-swatch" aria-hidden="true" /><span>Premium</span><strong>{formatCount(premiumCount)}</strong><em>{premiumShare}%</em></div>
            <div className="admin-meter" aria-hidden="true"><div className="admin-meter-fill" style={{ width: `${premiumShare}%` }} /></div>
          </li>
          <li>
            <div className="admin-donut-legend-row"><i className="admin-swatch is-free" aria-hidden="true" /><span>Free</span><strong>{formatCount(freeCount)}</strong><em>{freeShare}%</em></div>
            <div className="admin-meter" aria-hidden="true"><div className="admin-meter-fill is-free" style={{ width: `${freeShare}%` }} /></div>
          </li>
        </ul>
      ) : (
        <p className="admin-chart-note">Plan mix is not available in this snapshot.</p>
      )}
    </div>
  );
};

const overviewShortcuts = [
  { id: 'users', label: 'Customer directory', detail: 'Search and manage accounts', icon: 'users', tone: 'sky' },
  { id: 'support', label: 'Support inbox', detail: 'Reply to live conversations', icon: 'support', tone: 'violet' },
  { id: 'subscriptions', label: 'Billing health', detail: 'Provider reconciliation', icon: 'subscriptions', tone: 'emerald' },
  { id: 'errors', label: 'Error monitor', detail: 'Resolve client failures', icon: 'errors', tone: 'rose' },
];

const AdminOverview = ({ analytics, jobs, users, directoryComplete, generatedAt, onNavigate }) => {
  const totalUsers = getMetric(analytics, 'totalUsers');
  const premium = getMetric(analytics, 'premiumUsers');
  const openErrors = getMetric(analytics, 'unresolvedErrors');
  const free = getMetric(analytics, 'freeUsers');
  const aiUsed = getMetric(analytics, 'totalAiUsed');
  const aiLimit = getMetric(analytics, 'totalAiLimit');
  const trackedJobs = getMetric(analytics, 'autoApplyJobs');
  const createdAts = (users || []).map((user) => user?.createdAt).filter(Boolean);
  const countedUsers = Number(totalUsers);
  const usersCoverAccounts = Number.isFinite(countedUsers) && createdAts.length >= countedUsers;
  const weeks = resolveSignupWeeks({
    signupWeeks: analytics?.signupWeeks,
    createdAts,
    complete: Boolean(directoryComplete || usersCoverAccounts),
  });
  const weekTotal = weeks ? weeks.reduce((sum, week) => sum + week.count, 0) : null;
  const weekCounts = weeks ? weeks.map((week) => week.count) : null;
  const lastWeek = weeks?.[weeks.length - 1]?.count ?? null;
  const previousWeek = weeks?.[weeks.length - 2]?.count ?? null;
  const weekChange = lastWeek !== null && previousWeek ? Math.round(((lastWeek - previousWeek) / previousWeek) * 100) : null;
  const premiumRate = totalUsers !== null && premium !== null && Number(totalUsers) > 0
    ? Math.round((Number(premium) / Number(totalUsers)) * 100)
    : null;
  const aiShare = aiUsed !== null && aiLimit !== null && Number(aiLimit) > 0
    ? Math.min(100, Math.round((Number(aiUsed) / Number(aiLimit)) * 100))
    : null;
  const hasOpenErrors = openErrors !== null && Number(openErrors) > 0;
  const jobCount = (...statuses) => statuses.reduce((sum, status) => sum + (Number(jobs?.jobStatuses?.[status]) || 0), 0);
  const pipeline = [
    { id: 'progress', label: 'Applied', tone: 'emerald', count: jobCount('applied', 'replied', 'interview') },
    { id: 'queue', label: 'In queue', tone: 'indigo', count: jobCount('discovered', 'queued', 'applying') },
    { id: 'closed', label: 'Closed', tone: 'slate', count: jobCount('rejected', 'skipped') },
    { id: 'failed', label: 'Failed', tone: 'rose', count: jobCount('failed') },
  ];
  const pipelineTotal = pipeline.reduce((sum, stage) => sum + stage.count, 0);

  return (
    <section className="admin-stagger space-y-5" aria-label="Overview">
      <div className="admin-kpi-grid">
        <AdminKpiCard
          label="Users"
          value={totalUsers}
          icon="users"
          tone="indigo"
          caption={weekChange === null ? 'All registered accounts' : `${weekChange >= 0 ? '+' : ''}${weekChange}% this week`}
          captionTone={weekChange === null ? '' : weekChange >= 0 ? 'is-good' : 'is-warn'}
          captionIcon={weekChange === null ? null : 'analytics'}
          spark={weekCounts ? <Sparkline values={weekCounts} tone="indigo" /> : null}
        />
        <AdminKpiCard
          label="Premium"
          value={premium}
          icon="crown"
          tone="violet"
          caption={premiumRate === null ? 'Paid and manual plans' : `${premiumRate}% of all accounts`}
        />
        <AdminKpiCard
          label="Free"
          value={free}
          icon="userPlus"
          tone="sky"
          caption="Upgrade opportunities"
        />
        <AdminKpiCard
          label="Open errors"
          value={openErrors}
          icon={hasOpenErrors ? 'alert' : 'check'}
          tone={hasOpenErrors ? 'rose' : 'emerald'}
          caption={openErrors === null ? 'Not in this snapshot' : hasOpenErrors ? 'Needs review' : 'All clear'}
          captionTone={openErrors === null ? '' : hasOpenErrors ? 'is-warn' : 'is-good'}
          captionIcon={openErrors === null ? null : hasOpenErrors ? 'alert' : 'check'}
        />
      </div>

      <div className="admin-chart-grid">
        <div className="admin-chart-panel">
          <div className="admin-chart-heading">
            <div>
              <h2>Signups by week</h2>
              <p className="admin-chart-subtitle">New accounts per UTC week</p>
            </div>
            {weekTotal !== null && (
              <p className="admin-chart-kicker"><strong>{formatCount(weekTotal)}</strong><span>in these 5 weeks</span></p>
            )}
          </div>
          {weeks ? (
            <SignupWeekChart weeks={weeks} />
          ) : (
            <div className="admin-empty">
              <span className="admin-empty-icon admin-tone-indigo" aria-hidden="true"><AdminIcon name="analytics" /></span>
              Weekly signup history is not in this snapshot yet.
            </div>
          )}
          <p className="admin-chart-note">Accounts created each UTC week. Snapshot {formatDate(generatedAt)}.</p>
        </div>
        <div className="admin-chart-panel">
          <div className="admin-chart-heading">
            <div>
              <h2>Plan mix</h2>
              <p className="admin-chart-subtitle">Premium versus free accounts</p>
            </div>
          </div>
          <PlanMixDonut premium={premium} free={free} />
        </div>
      </div>

      <div className="admin-insight-grid">
        <div className="admin-panel">
          <div className="admin-panel-heading">
            <div>
              <h2>Platform health</h2>
              <p>Usage against allowances right now</p>
            </div>
          </div>
          <ul className="admin-health-list">
            <li className="admin-health-row">
              <span className="admin-kpi-icon admin-tone-violet" aria-hidden="true"><AdminIcon name="bolt" /></span>
              <div className="admin-health-body">
                <div className="admin-health-head">AI generations<span>{aiUsed === null ? '—' : `${formatCount(aiUsed)} / ${formatCount(aiLimit)}`}</span></div>
                <div className="admin-meter" role="img" aria-label={aiShare === null ? 'AI usage is not available' : `${aiShare} percent of the AI allowance used`}>
                  <div className={`admin-meter-fill${aiShare !== null && aiShare >= 85 ? ' is-rose' : ''}`} style={{ width: `${aiShare ?? 0}%` }} />
                </div>
              </div>
            </li>
            <li className="admin-health-row">
              <span className="admin-kpi-icon admin-tone-amber" aria-hidden="true"><AdminIcon name="briefcase" /></span>
              <div className="admin-health-body">
                <div className="admin-health-head">Auto-apply pipeline<span>{formatCount(trackedJobs)} tracked</span></div>
                {pipelineTotal > 0 ? (
                  <>
                    <div className="admin-stack-bar" role="img" aria-label={pipeline.map((stage) => `${stage.label} ${stage.count}`).join(', ')}>
                      {pipeline.filter((stage) => stage.count > 0).map((stage) => (
                        <span key={stage.id} className={`admin-stack-segment is-${stage.tone}`} style={{ flexGrow: stage.count }} />
                      ))}
                    </div>
                    <ul className="admin-stack-legend" aria-hidden="true">
                      {pipeline.map((stage) => (
                        <li key={stage.id}><i className={`admin-stack-dot is-${stage.tone}`} />{stage.label}<strong>{formatCount(stage.count)}</strong></li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="admin-health-note">Job states are not in this snapshot.</p>
                )}
              </div>
            </li>
            <li className="admin-health-row">
              <span className={`admin-kpi-icon ${hasOpenErrors ? 'admin-tone-rose' : 'admin-tone-emerald'}`} aria-hidden="true"><AdminIcon name={hasOpenErrors ? 'alert' : 'check'} /></span>
              <div className="admin-health-body">
                <div className="admin-health-head">Client error queue<span>{openErrors === null ? '—' : hasOpenErrors ? `${formatCount(openErrors)} open` : 'Clear'}</span></div>
                <p className="admin-health-note">{openErrors === null ? 'Error counts are not in this snapshot.' : hasOpenErrors ? 'Unresolved reports are waiting in the error monitor.' : 'No unresolved client errors right now.'}</p>
              </div>
            </li>
          </ul>
        </div>
        <div className="admin-panel">
          <div className="admin-panel-heading">
            <div>
              <h2>Jump back in</h2>
              <p>The places operators visit most</p>
            </div>
          </div>
          <div className="admin-shortcut-grid">
            {overviewShortcuts.map((shortcut) => (
              <div key={shortcut.id} className="admin-shortcut">
                <button type="button" onClick={() => onNavigate?.(shortcut.id)}>
                  <span className={`admin-shortcut-icon admin-tone-${shortcut.tone}`} aria-hidden="true"><AdminIcon name={shortcut.icon} /></span>
                  <span className="admin-shortcut-text">
                    <strong>{shortcut.label}</strong>
                    <span>{shortcut.detail}</span>
                  </span>
                  <AdminIcon name="arrowUpRight" className="admin-shortcut-arrow" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

const STATUS_BAR_TONES = {
  discovered: 'sky',
  queued: 'indigo',
  applying: 'violet',
  applied: 'emerald',
  replied: 'emerald',
  interview: 'emerald',
  rejected: 'slate',
  skipped: 'slate',
  failed: 'rose',
  running: 'violet',
  completed: 'emerald',
  cancelled: 'slate',
};

const AdminStatusBars = ({ items }) => {
  const numericValues = items.map((item) => Number(item.value)).filter(Number.isFinite);
  const peak = Math.max(1, ...numericValues);

  return (
    <ul className="admin-pipeline">
      {items.map((item, index) => {
        const numeric = Number(item.value);
        const available = Number.isFinite(numeric);
        return (
          <li key={item.status}>
            <span>{item.label}</span>
            <div className="admin-meter" aria-hidden="true">
              {available && (
                <div
                  className={`admin-meter-fill is-${STATUS_BAR_TONES[item.status] || 'indigo'}`}
                  style={{ width: `${Math.max(numeric > 0 ? 2 : 0, (numeric / peak) * 100)}%`, animationDelay: `${150 + index * 60}ms` }}
                />
              )}
            </div>
            <strong>{available ? formatCount(numeric) : item.value}</strong>
          </li>
        );
      })}
    </ul>
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
    <section className="admin-panel space-y-6" aria-labelledby="admin-jobs-title">
      <h2 id="admin-jobs-title" className="text-xl font-normal text-slate-950 dark:text-white">AI and job operations</h2>
      <div className="admin-stat-row">
        <div><span>AI generations used</span><strong>{formatCount(analytics?.totalAiUsed)}</strong></div>
        <div><span>AI allowance</span><strong>{formatCount(analytics?.totalAiLimit)}</strong></div>
        <div><span>Tracked jobs</span><strong>{formatCount(analytics?.autoApplyJobs)}</strong></div>
        <div><span>Accounts</span><strong>{formatCount(analytics?.totalUsers)}</strong></div>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="font-normal text-slate-950 dark:text-white">Auto-apply job states</h3>
          <div className="mt-3">
            <AdminStatusBars items={jobStatuses.map(([label, status]) => ({ label, status, value: jobs?.jobStatuses?.[status] ?? 'Not available' }))} />
          </div>
        </div>
        <div>
          <h3 className="font-normal text-slate-950 dark:text-white">Auto-apply run states</h3>
          <div className="mt-3">
            <AdminStatusBars items={runStatuses.map(([label, status]) => ({ label, status, value: jobs?.runStatuses?.[status] ?? 'Not available' }))} />
          </div>
        </div>
      </div>
      <div>
        <h3 className="font-normal text-slate-950 dark:text-white">Safe job controls</h3>
        {operations.loading && <div className="p-5 text-sm text-slate-500 dark:text-slate-400">Loading job operations…</div>}
        {!operations.loading && operations.available === false && <div className="p-5 text-sm text-slate-500 dark:text-slate-400">Job operation records are not available yet. Apply the latest local migration before using these controls.</div>}
        {!operations.loading && operations.available !== false && (operations.items || []).length === 0 && <div className="p-5 text-sm text-slate-500 dark:text-slate-400">No auto-apply jobs require administrator review.</div>}
        {!operations.loading && operations.available !== false && (operations.items || []).length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs font-normal uppercase tracking-wide text-slate-500 dark:bg-[var(--admin-surface-soft)] dark:text-slate-400">
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
                      <td className="min-w-56 px-4 py-3"><div className="font-normal text-slate-900 dark:text-slate-100">{item.title || 'Untitled job'}</div><div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.company || 'Unknown company'}{item.location ? ` · ${item.location}` : ''}</div></td>
                      <td className="whitespace-nowrap px-4 py-3"><StatusBadge tone={item.status === 'failed' ? 'red' : item.status === 'applying' ? 'amber' : ['applied', 'replied', 'interview'].includes(item.status) ? 'green' : 'blue'}>{item.status || 'Unknown'}</StatusBadge>{item.hasOutboundReceipt && <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Outbound receipt present</div>}</td>
                      <td className="min-w-40 px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{lastAction ? <><StatusBadge tone={lastAction.status === 'failed' ? 'red' : lastAction.status === 'pending_reconciliation' ? 'amber' : 'green'}>{lastAction.action} · {lastAction.status}</StatusBadge><div className="mt-1">{formatDate(lastAction.updatedAt)}</div><div className="mt-1 break-all font-mono" aria-label={`Operation ID ${lastAction.operationId || 'unavailable'}`}>Operation ID: {lastAction.operationId || 'Unavailable'}</div></> : 'None recorded'}</td>
                      <td className="px-4 py-3"><div className="flex min-w-56 flex-wrap gap-2">{canManageActions && canRetry && <button type="button" className={secondaryButtonClass} disabled={actionLoading === `job-action-retry-${item.id}`} onClick={() => onAction(item, 'retry')}>Retry</button>}{canManageActions && canCancel && <button type="button" className={dangerButtonClass} disabled={actionLoading === `job-action-cancel-${item.id}`} onClick={() => onAction(item, 'cancel')}>Cancel</button>}{canManageActions && canReconcile && lastAction?.status !== 'pending_reconciliation' && <button type="button" className={secondaryButtonClass} disabled={actionLoading === `job-action-reconcile-${item.id}`} onClick={() => onAction(item, 'reconcile')}>Reconcile</button>}{!canManageActions && <span className="text-xs text-slate-500 dark:text-slate-400">Read-only for this role</span>}{canManageActions && !canRetry && !canCancel && !canReconcile && <span className="text-xs text-slate-500 dark:text-slate-400">No safe action</span>}</div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
};

const AdminSubscriptions = ({ items, events = [], subscriptions = [], transactions = [], projectionsAvailable = true, reconciliationRuns = [], reconciliationAvailable = true, generatedAt }) => (
  <section className="space-y-5" aria-labelledby="admin-subscriptions-title">
    <div>
      <h2 id="admin-subscriptions-title" className="text-xl font-normal tracking-tight text-slate-950 dark:text-white">Provider access, in one view</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Provider actions stay disabled until reconciliation is complete.</p>
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
          <h3 className="font-normal text-slate-950 dark:text-white">Provider reconciliation health</h3>
        </div>
        {reconciliationRuns.length === 0 ? (
          <div className="p-5 text-sm text-slate-500 dark:text-slate-400">No scheduled reconciliation run has completed yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs font-normal uppercase tracking-wide text-slate-500 dark:bg-[var(--admin-surface-soft)] dark:text-slate-400"><tr><th className="px-4 py-3">Provider</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Processed</th><th className="px-4 py-3">Failed</th><th className="px-4 py-3">Started</th><th className="px-4 py-3">Error</th></tr></thead>
              <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                {reconciliationRuns.map((run) => <tr key={run.id}><td className="px-4 py-3 font-normal uppercase text-slate-700 dark:text-slate-200">{run.provider || 'Unknown'} · {run.environment || 'unknown'}</td><td className="px-4 py-3"><StatusBadge tone={run.status === 'completed' ? 'green' : run.status === 'failed' ? 'red' : 'amber'}>{run.status || 'Unknown'}</StatusBadge></td><td className="px-4 py-3 text-slate-600 dark:text-slate-300">{run.processed_count ?? '—'}</td><td className="px-4 py-3 text-slate-600 dark:text-slate-300">{run.failed_count ?? '—'}</td><td className="whitespace-nowrap px-4 py-3 text-slate-500 dark:text-slate-400">{formatDate(run.started_at)}</td><td className="max-w-xs truncate px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{run.error || '—'}</td></tr>)}
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
            <h3 className="font-normal text-slate-950 dark:text-white">Provider subscription projections</h3>
          </div>
          {subscriptions.length === 0 ? (
            <div className="p-5 text-sm text-slate-500 dark:text-slate-400">No provider subscription projections are available yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs font-normal uppercase tracking-wide text-slate-500 dark:bg-[var(--admin-surface-soft)] dark:text-slate-400"><tr><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Provider / env</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Plan</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Period end</th><th className="px-4 py-3">Observed</th></tr></thead>
                <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                  {subscriptions.map((item) => <tr key={`${item.provider}-${item.environment}-${item.subscription_id}`}><td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{item.userEmail || 'Unknown customer'}</td><td className="px-4 py-3 uppercase text-slate-600 dark:text-slate-300">{item.provider || 'Unknown'} · {item.environment || 'unknown'}</td><td className="px-4 py-3"><StatusBadge tone={['active', 'trialing'].includes(item.status) ? 'green' : item.status === 'canceled' ? 'red' : 'amber'}>{item.status || 'Unknown'}</StatusBadge></td><td className="px-4 py-3 text-slate-600 dark:text-slate-300">{item.plan || item.price_id || 'Unknown'}</td><td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">{formatMoney(item.amount_minor, item.currency)}</td><td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">{formatDate(item.current_period_end)}</td><td className="whitespace-nowrap px-4 py-3 text-slate-500 dark:text-slate-400">{formatDate(item.observed_at)}</td></tr>)}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className={`${cardClass} overflow-hidden`}>
          <div className="border-b border-gray-200 px-4 py-3 dark:border-slate-700">
            <h3 className="font-normal text-slate-950 dark:text-white">Provider transaction projections</h3>
          </div>
          {transactions.length === 0 ? (
            <div className="p-5 text-sm text-slate-500 dark:text-slate-400">No provider transaction projections are available yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs font-normal uppercase tracking-wide text-slate-500 dark:bg-[var(--admin-surface-soft)] dark:text-slate-400"><tr><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Provider / env</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Occurred</th></tr></thead>
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
            <thead className="bg-gray-50 text-xs font-normal uppercase tracking-wide text-slate-500 dark:bg-[var(--admin-surface-soft)] dark:text-slate-400">
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
        <h3 className="font-normal text-slate-950 dark:text-white">Webhook reconciliation receipts</h3>
      </div>
      {events.length === 0 ? (
        <div className="p-5 text-sm text-slate-500 dark:text-slate-400">No provider event receipts are available yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs font-normal uppercase tracking-wide text-slate-500 dark:bg-[var(--admin-surface-soft)] dark:text-slate-400">
              <tr><th className="px-4 py-3">Provider</th><th className="px-4 py-3">Event</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Received</th><th className="px-4 py-3">Error</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
              {events.slice(0, 50).map((event) => (
                <tr key={`${event.provider}-${event.event_id}`}>
                  <td className="px-4 py-3 font-normal uppercase text-slate-700 dark:text-slate-200">{event.provider || 'Unknown'}</td>
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

const ANALYTICS_QA_CATEGORIES = [
  ['internal_test_account', 'Internal test account'],
  ['automated_qa', 'Automated QA'],
  ['synthetic_fixture', 'Synthetic fixture'],
  ['other_test', 'Other test account'],
];

const AdminAnalyticsQaExclusion = ({ customer, exclusion, onChange, actionLoading }) => {
  const [category, setCategory] = useState('internal_test_account');
  const [scope, setScope] = useState(customer.emailConfirmedAt ? 'from_confirmation' : 'from_now');
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const isExcluded = exclusion?.excluded === true;
  const categoryLabel = ANALYTICS_QA_CATEGORIES.find(([value]) => value === exclusion?.category)?.[1] || exclusion?.category;

  useEffect(() => {
    setCategory('internal_test_account');
    setScope(customer.emailConfirmedAt ? 'from_confirmation' : 'from_now');
    setAcknowledged(false);
  }, [customer.id, customer.emailConfirmedAt]);

  const submit = async () => {
    setSubmitting(true);
    try {
      await onChange({
        userId: customer.id,
        operation: isExcluded ? 'include' : 'exclude',
        category: isExcluded ? null : category,
        scope: isExcluded ? null : scope,
      });
      setAcknowledged(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mt-5 rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/60 dark:bg-amber-950/20" aria-labelledby="admin-analytics-qa-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 id="admin-analytics-qa-title" className="font-normal text-slate-950 dark:text-white">Analytics QA classification</h4>
        </div>
        {exclusion?.available === false && <StatusBadge tone="amber">Migration pending</StatusBadge>}
        {exclusion?.available === true && <StatusBadge tone={isExcluded ? 'amber' : 'gray'}>{isExcluded ? 'Excluded as QA' : 'Included'}</StatusBadge>}
      </div>

      {exclusion?.available === false ? (
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">QA classification management is unavailable until the analytics migration is installed.</p>
      ) : isExcluded ? (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-slate-700 dark:text-slate-200">
            {categoryLabel || 'QA account'} · excluded from {formatDate(exclusion.effectiveFrom)} onward. Ending the exclusion includes only future activity; this recorded historical period remains excluded.
          </p>
          <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-1" />
            <span>I verified this account should be included in analytics going forward.</span>
          </label>
          <button type="button" className={secondaryButtonClass} onClick={() => { void submit(); }} disabled={!acknowledged || submitting || actionLoading}>
            {submitting || actionLoading ? 'Saving…' : 'End exclusion from now'}
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="admin-analytics-qa-category" className="text-sm font-normal text-slate-800 dark:text-slate-100">QA category</label>
              <select id="admin-analytics-qa-category" className={`${inputClass} mt-1`} value={category} onChange={(event) => setCategory(event.target.value)}>
                {ANALYTICS_QA_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="admin-analytics-qa-scope" className="text-sm font-normal text-slate-800 dark:text-slate-100">Exclusion begins</label>
              <select id="admin-analytics-qa-scope" className={`${inputClass} mt-1`} value={scope} onChange={(event) => setScope(event.target.value)}>
                <option value="from_confirmation" disabled={!customer.emailConfirmedAt}>From account confirmation</option>
                <option value="from_now">From now on</option>
              </select>
            </div>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {scope === 'from_confirmation'
              ? 'This recalculates historical cohorts from the account’s confirmation time (limited to measured coverage); it does not change account, payment, or activity records.'
              : 'Only future events and payments are excluded. Prior activity remains counted.'}
          </p>
          <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-1" />
            <span>I verified this is an internal QA/test account, not a customer, and I have authority to change its analytics classification.</span>
          </label>
          <button type="button" className={primaryButtonClass} onClick={() => { void submit(); }} disabled={!acknowledged || submitting || actionLoading}>
            {submitting || actionLoading ? 'Saving…' : 'Exclude from paid-conversion analytics'}
          </button>
          <p className="text-xs text-slate-500 dark:text-slate-400">A new owner review is required before conversion results become available again.</p>
        </div>
      )}
    </section>
  );
};

const AdminCustomerDetail = ({ detail, onClose, onRequestExport, onRequestDeletion, onCancelDeletion, onApproveDeletion, onPlaceHold, onReleaseHold, onRecordProviderCancellation, onSetAnalyticsQaExclusion, actionLoading, canManageAnalyticsQa, canManagePrivacy, canApproveDeletion }) => {
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
  const failedDeletion = privacy?.deletions?.find((job) => job.status === 'failed');
  const providerReviews = privacy?.providerReviews || [];
  const pendingProviderReviews = providerReviews.filter((review) => review.review_status === 'required');
  return (
    <section ref={detailRef} className={`${cardClass} admin-customer-detail mb-5 p-5`} role="dialog" aria-modal="true" aria-labelledby="admin-customer-detail-title" tabIndex={-1}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="admin-customer-detail-title" className="text-xl font-normal text-slate-950 dark:text-white">{customer.fullName || customer.email || 'Customer'}</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{customer.email || 'No email'} · {customer.id}</p>
        </div>
        <button type="button" className={secondaryButtonClass} onClick={onClose}>Close details</button>
      </div>
      <div className="admin-stat-row mt-5">
        <div><span>Resumes</span><strong>{counts.resumes ?? '—'}</strong></div>
        <div><span>Applications</span><strong>{counts.applications ?? '—'}</strong></div>
        <div><span>Auto-apply jobs</span><strong>{counts.autoApplyJobs ?? '—'}</strong></div>
        <div><span>Support conversations</span><strong>{counts.supportConversations ?? '—'}</strong></div>
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div>
          <h4 className="font-normal text-slate-950 dark:text-white">Account and access</h4>
          <dl className="mt-3 grid gap-2 text-sm text-slate-600 dark:text-slate-300">
            <div className="flex justify-between gap-3"><dt>Plan</dt><dd>{customer.premiumPlan || 'Free'}</dd></div>
            <div className="flex justify-between gap-3"><dt>Premium until</dt><dd>{formatDate(customer.premiumUntil)}</dd></div>
            <div className="flex justify-between gap-3"><dt>AI usage</dt><dd>{customer.aiGenerationsUsed ?? 'Not available'} / {customer.aiGenerationsLimit ?? 'Not available'}</dd></div>
            <div className="flex justify-between gap-3"><dt>Last sign in</dt><dd>{formatDate(customer.lastSignInAt)}</dd></div>
            <div className="flex justify-between gap-3"><dt>Email confirmed</dt><dd>{formatDate(customer.emailConfirmedAt)}</dd></div>
          </dl>
        </div>
        <div>
          <h4 className="font-normal text-slate-950 dark:text-white">Billing sources</h4>
          {billing.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">No entitlement rows are available. This is not proof that no billing history exists.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {billing.map((item) => (
                <div key={`${item.provider}-${item.subscription_id}`} className="rounded-xl border border-gray-200 p-3 text-sm dark:border-slate-700">
                  <div className="flex justify-between gap-3"><span className="font-normal uppercase">{item.provider}</span><StatusBadge tone={item.active ? 'green' : 'gray'}>{item.active ? 'Active' : 'Inactive'}</StatusBadge></div>
                  <div className="mt-1 text-slate-500 dark:text-slate-400">{item.plan || 'Unknown plan'} · until {formatDate(item.paid_until)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {canManageAnalyticsQa && (
        <AdminAnalyticsQaExclusion
          customer={customer}
          exclusion={detail.analyticsQaExclusion}
          onChange={onSetAnalyticsQaExclusion}
          actionLoading={actionLoading}
        />
      )}
      <div className="mt-5">
        <h4 className="font-normal text-slate-950 dark:text-white">Recent product activity</h4>
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
            <h4 className="font-normal text-slate-950 dark:text-white">Privacy workflows</h4>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">No immediate Auth deletion is performed here.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={secondaryButtonClass} onClick={() => onRequestExport(customer)}>Request export</button>
            {!activeDeletion && !failedDeletion && <button type="button" className={dangerButtonClass} onClick={() => onRequestDeletion(customer)}>Request deletion</button>}
            {activeDeletion && <button type="button" className={secondaryButtonClass} onClick={() => onCancelDeletion(activeDeletion)}>Cancel deletion request</button>}
            {canApproveDeletion && activeDeletion && !activeDeletion.owner_approved_at && ['pending', 'waiting_owner_approval'].includes(activeDeletion.status) && <button type="button" className={dangerButtonClass} onClick={() => onApproveDeletion(activeDeletion)}>Approve deletion</button>}
            {canManagePrivacy && <button type="button" className={secondaryButtonClass} onClick={() => onPlaceHold(customer)}>Place hold</button>}
          </div>
        </div>
        <div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-3 dark:text-slate-200">
          <div className="flex flex-wrap items-center gap-2"><span><span className="font-normal">Export:</span> {privacy?.available === false ? 'Migration pending' : (latestExport?.status || 'None requested')}</span>{safeExportUrl && <a href={safeExportUrl} target="_blank" rel="noopener noreferrer" className="font-normal text-blue-700 underline dark:text-blue-300">Download export</a>}</div>
          <div><span className="font-normal">Deletion:</span> {latestDeletion?.status || 'None requested'}</div>
          <div>
            <span className="font-normal">Active holds:</span> {privacy?.holds?.filter((hold) => !hold.released_at && (!hold.expires_at || new Date(hold.expires_at) > new Date())).length ?? 'Not available'}
            {canManagePrivacy && privacy?.holds?.filter((hold) => !hold.released_at).slice(0, 3).map((hold) => (
              <button key={hold.id} type="button" className="ml-2 text-xs font-normal text-blue-700 underline dark:text-blue-300" onClick={() => onReleaseHold(hold)}>Release {hold.hold_type}</button>
            ))}
          </div>
        </div>
        {failedDeletion && <p className="mt-3 text-sm text-amber-800 dark:text-amber-200" role="status">This deletion request failed ({getPrivacyDeletionFailureCopy(failedDeletion.failure_code)}). Do not create a duplicate; an owner can review and resume the existing request from the control-center overview.</p>}
        <div className="mt-4 rounded-xl border border-slate-200 bg-white/70 p-3 text-sm dark:border-slate-700 dark:bg-slate-900/50">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h5 className="font-normal text-slate-950 dark:text-white">Provider cancellation review</h5>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">This screen never cancels a provider subscription.</p>
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
                    <div className="font-normal uppercase text-slate-800 dark:text-slate-100">{review.provider} · {review.subscription_id}</div>
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
          {pendingProviderReviews.length > 0 && <p className="mt-3 text-xs font-normal text-amber-700 dark:text-amber-300">{pendingProviderReviews.length} provider review{pendingProviderReviews.length === 1 ? '' : 's'} still block destructive deletion work.</p>}
        </div>
      </div>
      <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">Private resume and application content is intentionally excluded from this view.</p>
    </section>
  );
};

const AdminFeedbackPanel = ({ operators = [] }) => {
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
  const [showCreateForm, setShowCreateForm] = useState(false);
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
      setShowCreateForm(false);
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
        ownerUserId: changes.ownerUserId !== undefined ? changes.ownerUserId || null : item.ownerUserId || null,
        outcome: item.outcome || null,
      });
      await loadFeedback();
    } catch (requestError) {
      setError(requestError.message || 'Improvement item could not be updated.');
    } finally {
      setSavingImprovementId(null);
    }
  };

  const mfaBlocked = isMfaRequiredError(error);

  return (
    <section className="space-y-5" aria-labelledby="admin-feedback-page-title">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h2 id="admin-feedback-page-title" className="text-xl font-normal text-slate-950 dark:text-white">Feedback and improvement backlog</h2>
        {!mfaBlocked && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={primaryButtonClass} onClick={() => setShowCreateForm((open) => !open)} aria-expanded={showCreateForm}>{showCreateForm ? 'Close form' : 'New improvement item'}</button>
            <button type="button" className={secondaryButtonClass} onClick={() => { void loadFeedback(); }} disabled={loading}><AdminIcon name="refresh" />Refresh</button>
          </div>
        )}
      </div>

      {mfaBlocked && <AdminMfaRequired message={error} />}
      {error && !mfaBlocked && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300" role="alert">{error}</div>}
      {!mfaBlocked && <>
      {summary && (
      <div className="admin-stat-row">
        <div><span>Feedback records</span><strong>{summary.count ?? '—'}</strong></div>
        <div><span>Average rating</span><strong>{Number.isFinite(Number(summary.averageRating)) ? `${Number(summary.averageRating).toFixed(2)}/5` : '—'}</strong></div>
      </div>
      )}

      {showCreateForm && <section className={`${cardClass} p-4`} aria-labelledby="admin-improvement-create-title">
        <h3 id="admin-improvement-create-title" className="font-normal text-slate-950 dark:text-white">Create improvement item</h3>
        <form className="mt-4 grid gap-3" onSubmit={createImprovement}>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-xs font-normal text-slate-700 dark:text-slate-200">Title<input className={`${inputClass} mt-1`} maxLength={160} value={improvementForm.title} onChange={(event) => setImprovementForm((current) => ({ ...current, title: event.target.value }))} /></label>
            <label className="text-xs font-normal text-slate-700 dark:text-slate-200">Source feedback<select className={`${inputClass} mt-1`} value={improvementForm.sourceFeedbackId} onChange={(event) => setImprovementForm((current) => ({ ...current, sourceFeedbackId: event.target.value }))}><option value="">No direct source</option>{items.map((item) => <option key={item.id} value={item.id}>{item.rating}/5 · {item.category} · {item.id.slice(0, 8)}</option>)}</select></label>
          </div>
          <label className="text-xs font-normal text-slate-700 dark:text-slate-200">Sanitized summary<textarea className={`${inputClass} mt-1 min-h-24`} maxLength={2000} value={improvementForm.sanitizedSummary} onChange={(event) => setImprovementForm((current) => ({ ...current, sanitizedSummary: event.target.value }))} /></label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs font-normal text-slate-700 dark:text-slate-200">Category<select className={`${inputClass} mt-1`} value={improvementForm.category} onChange={(event) => setImprovementForm((current) => ({ ...current, category: event.target.value }))}><option value="product">Product</option><option value="support">Support</option><option value="billing">Billing</option><option value="account">Account</option><option value="other">Other</option></select></label>
            <label className="text-xs font-normal text-slate-700 dark:text-slate-200">Impact<select className={`${inputClass} mt-1`} value={improvementForm.impact} onChange={(event) => setImprovementForm((current) => ({ ...current, impact: event.target.value }))}><option value="unknown">Unknown</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
            <label className="text-xs font-normal text-slate-700 dark:text-slate-200">Priority<select className={`${inputClass} mt-1`} value={improvementForm.priority} onChange={(event) => setImprovementForm((current) => ({ ...current, priority: event.target.value }))}><option value="normal">Normal</option><option value="low">Low</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
          </div>
          <button type="submit" className={`${primaryButtonClass} w-fit`} disabled={savingImprovementId === 'new'}>{savingImprovementId === 'new' ? 'Creating…' : 'Create improvement item'}</button>
        </form>
      </section>}

      {improvements.length > 0 && <section className={`${cardClass} p-4`} aria-labelledby="admin-improvement-list-title">
        <div className="flex flex-wrap items-center justify-between gap-3"><h3 id="admin-improvement-list-title" className="font-normal text-slate-950 dark:text-white">Improvement backlog</h3><span className="text-xs text-slate-500 dark:text-slate-400">{improvements.length} loaded</span></div>
        <div className="mt-3 space-y-3">{improvements.map((item) => <article key={item.id} className="rounded-xl border border-gray-200 p-3 dark:border-slate-700">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="font-normal text-slate-950 dark:text-white">{item.title}</h4><p className="mt-1 text-sm leading-6 text-slate-700 dark:text-slate-200">{item.sanitizedSummary}</p></div><span className="text-xs text-slate-500 dark:text-slate-400">{item.category} · {item.impact} impact</span></div>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-xs font-normal text-slate-700 dark:text-slate-200">Status<select className={`${inputClass} mt-1 min-w-36`} value={item.status} onChange={(event) => { void updateImprovement(item, { status: event.target.value }); }} disabled={savingImprovementId === item.id}><option value="backlog">Backlog</option><option value="planned">Planned</option><option value="in_progress">In progress</option><option value="done">Done</option><option value="declined">Declined</option></select></label>
            <label className="text-xs font-normal text-slate-700 dark:text-slate-200">Priority<select className={`${inputClass} mt-1 min-w-32`} value={item.priority} onChange={(event) => { void updateImprovement(item, { priority: event.target.value }); }} disabled={savingImprovementId === item.id}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
            <label className="text-xs font-normal text-slate-700 dark:text-slate-200">Owner<select className={`${inputClass} mt-1 min-w-48`} value={item.ownerUserId || ''} onChange={(event) => { void updateImprovement(item, { ownerUserId: event.target.value }); }} disabled={savingImprovementId === item.id}>
              <option value="">Unassigned</option>
              {item.ownerUserId && !operators.some((operator) => operator.user_id === item.ownerUserId) && <option value={item.ownerUserId} disabled>{item.ownerEmail || 'Inactive operator'} (inactive)</option>}
              {operators.map((operator) => <option key={operator.user_id} value={operator.user_id}>{operator.email} · {operator.role}</option>)}
            </select></label>
            {savingImprovementId === item.id && <span className="pb-2 text-xs text-slate-500 dark:text-slate-400" role="status">Saving update…</span>}
          </div>
        </article>)}</div>
      </section>}

      {loading && items.length === 0 && <div className="admin-empty">Loading feedback…</div>}
      {!loading && !error && items.length === 0 && <div className="admin-empty"><span className="admin-empty-icon admin-tone-violet" aria-hidden="true"><AdminIcon name="feedback" /></span>No feedback has been submitted yet.</div>}
      {items.length > 0 && <div className="space-y-3">
        {items.map((item) => <article key={item.id} className={`${cardClass} p-4`}>
          <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-normal text-slate-950 dark:text-white">{item.rating}/5 · {item.category || 'support'}</div><div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.customerEmail || 'Guest customer'} · {formatDate(item.createdAt)}</div></div>{item.conversationId && <span className="text-xs text-slate-500 dark:text-slate-400">Conversation {item.conversationId}</span>}</div>
          {item.comment && <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700 dark:text-slate-200">{item.comment}</p>}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end"><label className="min-w-0 flex-1 text-xs font-normal text-slate-700 dark:text-slate-200">Operator tags <span className="font-normal text-slate-500 dark:text-slate-400">(comma-separated)</span><input className={`${inputClass} mt-1`} maxLength={360} value={tagDrafts[item.id] ?? ''} onChange={(event) => setTagDrafts((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="performance, onboarding" /></label><button type="button" className={secondaryButtonClass} onClick={() => { void saveTags(item); }} disabled={savingFeedbackId === item.id}>{savingFeedbackId === item.id ? 'Saving…' : 'Save tags'}</button></div>
        </article>)}
        {hasMore && before && <button type="button" className={secondaryButtonClass} onClick={() => { void loadFeedback({ append: true, beforeCursor: before }); }} disabled={loading}>{loading ? 'Loading…' : 'Load older feedback'}</button>}
      </div>}
      </>}
    </section>
  );
};

const SUPPORT_QUEUE_FILTERS = [
  ['open', 'Open'],
  ['waiting_customer', 'Waiting'],
  ['resolved', 'Resolved'],
  ['all', 'All'],
];

const SUPPORT_STATUS_LABELS = { open: 'Open', waiting_customer: 'Waiting on customer', resolved: 'Resolved' };
const SUPPORT_SENDER_LABELS = { agent: 'You', ai: 'AI assistant', customer: 'Customer', guest: 'Guest', system: 'System' };

const getSupportModeLabel = (mode) => (mode === 'human' ? 'With agent' : mode === 'ai' ? 'AI assistant' : 'Waiting');

const relativeTimeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

const formatRelativeTime = (value) => {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return '';
  const seconds = (time - Date.now()) / 1000;
  const units = [['year', 31_536_000], ['month', 2_592_000], ['week', 604_800], ['day', 86_400], ['hour', 3_600], ['minute', 60]];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return relativeTimeFormatter.format(Math.round(seconds / size), unit);
  }
  return 'just now';
};

const AdminSupportInbox = () => {
  const { user } = useAuth();
  const [queue, setQueue] = useState([]);
  const [queueStatus, setQueueStatus] = useState('open');
  const [queueSearch, setQueueSearch] = useState('');
  const [appliedQueueSearch, setAppliedQueueSearch] = useState('');
  const [presenceStatus, setPresenceStatus] = useState('checking');
  const [presenceError, setPresenceError] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [selected, setSelected] = useState(null);
  const [customerContext, setCustomerContext] = useState(null);
  const [legacyInquiries, setLegacyInquiries] = useState([]);
  const [legacyLoading, setLegacyLoading] = useState(false);
  const [legacyError, setLegacyError] = useState('');
  const [reply, setReply] = useState('');
  const [note, setNote] = useState('');
  const [triagePriority, setTriagePriority] = useState('normal');
  const [triageTags, setTriageTags] = useState('');
  const [composerMode, setComposerMode] = useState('reply');
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

  const loadConversation = async (conversationId) => {
    setLoading(true);
    setError('');
    try {
      const response = await readSupportConversation(conversationId, 0);
      const customerUserId = response?.conversation?.customerUserId
        || queue.find((item) => item.id === conversationId)?.customerUserId;
      setSelected(response?.conversation
        ? { ...response, conversation: { ...response.conversation, customerUserId } }
        : response || null);
      setSelectedId(conversationId);
      setCustomerContext(null);
      setLegacyInquiries([]);
      setLegacyLoading(false);
      setLegacyError('');
      setTriagePriority(response?.conversation?.priority || 'normal');
      setTriageTags(Array.isArray(response?.conversation?.tags) ? response.conversation.tags.join(', ') : '');
      if (response?.conversation?.lastSequence !== undefined) {
        await markSupportConversationRead(conversationId, response.conversation.lastSequence);
      }
      if (customerUserId) {
        try {
          const customerResponse = await fetchAdminCustomer(customerUserId);
          setCustomerContext(customerResponse?.customer ? {
            ...customerResponse.customer,
            supportConversationCount: customerResponse.counts?.supportConversations,
          } : null);
        } catch {
          setCustomerContext(null);
        }
        setLegacyLoading(true);
        try {
          const legacyResponse = await listLegacySupportInquiries(conversationId);
          setLegacyInquiries(Array.isArray(legacyResponse?.items) ? legacyResponse.items : []);
        } catch (requestError) {
          setLegacyError(requestError.message || 'Historical contact submissions could not be loaded.');
        } finally {
          setLegacyLoading(false);
        }
      } else {
        setLegacyLoading(false);
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
    let cancelled = false;
    listSupportPresence()
      .then((response) => {
        if (cancelled) return;
        const ownPresence = response?.items?.find((item) => item.userId === user?.id);
        setPresenceStatus(ownPresence?.status === 'available' || ownPresence?.status === 'away'
          ? ownPresence.status
          : 'offline');
      })
      .catch(() => {
        if (cancelled) return;
        setPresenceStatus('unavailable');
        setPresenceError('Support presence could not be checked; current availability is unknown.');
      });
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    if (presenceStatus !== 'available' && presenceStatus !== 'away') return undefined;
    let active = true;
    const heartbeat = () => {
      void setSupportPresence(presenceStatus)
        .then(() => { if (active) setPresenceError(''); })
        .catch(() => {
          if (active) setPresenceError('Presence could not be refreshed; this status may expire automatically.');
        });
    };
    heartbeat();
    const timer = window.setInterval(heartbeat, 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [presenceStatus]);

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

  const mfaBlocked = isMfaRequiredError(error);
  const conversation = selected?.conversation;
  const selectedQueueItem = queue.find((item) => item.id === selectedId);
  const customerEmail = customerContext?.email || selectedQueueItem?.customerEmail || '';
  const presenceTone = presenceStatus === 'available' ? 'is-available' : presenceStatus === 'away' ? 'is-away' : 'is-offline';

  return (
    <section className="space-y-4" aria-label="Support inbox">
      {mfaBlocked && <AdminMfaRequired message={error} />}
      {!mfaBlocked && (
        <div className="admin-inbox-toolbar">
          <div className="admin-tabs" role="group" aria-label="Conversation status">
            {SUPPORT_QUEUE_FILTERS.map(([value, label]) => {
              const active = queueStatus === value;
              return (
                <button key={value} type="button" aria-pressed={active} className={active ? 'is-active' : ''} onClick={() => setQueueStatus(value)}>
                  {active && <motion.span layoutId="admin-inbox-filter-pill" className="admin-tab-pill" transition={{ type: 'spring', stiffness: 520, damping: 38 }} aria-hidden="true" />}
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
          <div className="admin-toolbar">
            <form className="admin-search" onSubmit={(event) => { event.preventDefault(); setAppliedQueueSearch(queueSearch.trim()); }}>
              <label htmlFor="support-queue-search" className="sr-only">Search support queue</label>
              <AdminIcon name="search" />
              <input id="support-queue-search" type="search" className={`${inputClass} w-56`} value={queueSearch} onChange={(event) => setQueueSearch(event.target.value)} placeholder="Search conversations" />
            </form>
            <div className={`admin-presence ${presenceTone}`}>
              <span className="admin-presence-dot" aria-hidden="true" />
              <label htmlFor="support-presence" className="sr-only">Your support status</label>
              <select
                id="support-presence"
                className={`${inputClass} w-auto`}
                value={presenceStatus}
                disabled={presenceStatus === 'checking'}
                onChange={(event) => {
                  const nextStatus = event.target.value;
                  setPresenceStatus(nextStatus);
                  setPresenceError('');
                  if (nextStatus === 'offline') {
                    void setSupportPresence('offline').catch(() => {
                      setPresenceError('Could not confirm offline status; previously reported availability will expire automatically.');
                    });
                  }
                }}
              >
                {presenceStatus === 'checking' && <option value="checking">Checking…</option>}
                {presenceStatus === 'unavailable' && <option value="unavailable">Status unknown</option>}
                <option value="available">Available</option>
                <option value="away">Away</option>
                <option value="offline">Offline</option>
              </select>
            </div>
            <button type="button" className={`${secondaryButtonClass} admin-icon-btn`} onClick={() => { void loadQueue(); }} disabled={loading} aria-label="Refresh conversations" title="Refresh conversations">
              <AdminIcon name="refresh" className={`admin-refresh-icon${loading ? ' is-spinning' : ''}`} />
            </button>
          </div>
        </div>
      )}

      {error && !mfaBlocked && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300" role="alert">{error}</div>}
      {presenceError && !mfaBlocked && <p className="text-xs text-amber-700 dark:text-amber-300" role="status">{presenceError}</p>}

      {!mfaBlocked && <div className="admin-inbox">
        <div className="admin-inbox-list">
          <div className="admin-inbox-list-head">
            <span>Conversations</span>
            <span>{queue.length}</span>
          </div>
          {queue.length === 0 ? (
            <div className="admin-empty m-3"><span className="admin-empty-icon admin-tone-sky" aria-hidden="true"><AdminIcon name="support" /></span>No conversations in this queue.</div>
          ) : queue.map((item) => {
            const active = selectedId === item.id;
            const unread = Number.isSafeInteger(item.unreadCount) && item.unreadCount > 0;
            return (
              <button key={item.id} type="button" onClick={() => loadConversation(item.id)} className={`admin-inbox-item${active ? ' is-active' : ''}`} aria-current={active ? 'true' : undefined}>
                {active && <span className="admin-inbox-item-highlight" aria-hidden="true" />}
                <span className={`admin-avatar admin-tone-${getAvatarTone(item.customerEmail || item.id)}`} aria-hidden="true">{getInitials('', item.customerEmail || 'Guest')}</span>
                <span className="admin-inbox-item-body">
                  <span className="admin-inbox-item-top">
                    <span className="admin-inbox-subject">{item.subject}</span>
                    <span className="admin-inbox-time" title={formatDate(item.updatedAt)}>{formatRelativeTime(item.updatedAt)}</span>
                  </span>
                  <span className="admin-inbox-customer">{item.customerEmail || item.customerUserId || 'Guest customer'}</span>
                  <span className="admin-inbox-preview">{item.preview || 'No message preview'}</span>
                  <span className="admin-inbox-tags">
                    {unread && <StatusBadge tone="amber">{item.unreadCount} unread</StatusBadge>}
                    <StatusBadge tone={item.mode === 'human' ? 'green' : 'blue'}>{getSupportModeLabel(item.mode)}</StatusBadge>
                    {item.firstResponseSlaStatus === 'breached' && <StatusBadge tone="red">Reply overdue</StatusBadge>}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="admin-inbox-detail">
          {!selected ? (
            <div className="flex h-full min-h-[22rem] flex-col items-center justify-center gap-3 p-6 text-center text-sm text-slate-500 dark:text-slate-400">
              <span className="admin-empty-icon admin-tone-indigo" aria-hidden="true"><AdminIcon name="support" /></span>
              Select a conversation to review it.
            </div>
          ) : (
            <>
              <header className="admin-thread-header">
                <div className="flex min-w-0 items-center gap-3">
                  <span className={`admin-avatar admin-tone-${getAvatarTone(customerEmail || selectedId)}`} aria-hidden="true">{getInitials('', customerEmail || 'Guest')}</span>
                  <div className="min-w-0">
                    <h3 className="truncate text-base text-slate-950 dark:text-white">{conversation?.subject}</h3>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {customerEmail || 'Guest customer'}
                      {customerContext ? ` · ${customerContext.premiumPlan || 'Free plan'}` : ''}
                      {customerContext?.supportConversationCount ? ` · ${customerContext.supportConversationCount} conversations` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={conversation?.status === 'resolved' ? 'green' : 'blue'}>{SUPPORT_STATUS_LABELS[conversation?.status] || conversation?.status || 'Open'}</StatusBadge>
                  {conversation?.mode !== 'human' && conversation?.status !== 'resolved' && <button type="button" className={primaryButtonClass} disabled={loading} onClick={() => runConversationAction(() => takeSupportConversation(selectedId))}>Take conversation</button>}
                  {conversation?.status !== 'resolved' && <button type="button" className={secondaryButtonClass} disabled={loading} onClick={() => runConversationAction(() => resolveSupportConversation(selectedId, 'Resolved by support operator.'))}><AdminIcon name="check" />Resolve</button>}
                  {conversation?.status === 'resolved' && <button type="button" className={secondaryButtonClass} disabled={loading} onClick={() => runConversationAction(() => reopenSupportConversation(selectedId))}>Reopen</button>}
                </div>
              </header>

              <div className="admin-thread-layout">
                <div className="admin-thread-main">
                  <div className="admin-thread-messages" aria-live="polite">
                    {(selected.messages || []).length === 0 && <p className="m-auto text-sm text-slate-500 dark:text-slate-400">No messages yet.</p>}
                    {(selected.messages || []).map((item) => {
                      const fromTeam = item.senderType === 'agent' || item.senderType === 'ai';
                      if (item.senderType === 'system') {
                        return <p key={item.id || item.sequence} className="admin-thread-system">{item.body}</p>;
                      }
                      return (
                        <div key={item.id || item.sequence} className={`admin-bubble-row${fromTeam ? ' is-team' : ''}`}>
                          <div className={`admin-bubble is-${item.senderType === 'agent' ? 'agent' : item.senderType === 'ai' ? 'ai' : 'customer'}`}>
                            <p className="whitespace-pre-wrap break-words">{item.body}</p>
                          </div>
                          <span className="admin-bubble-meta">{SUPPORT_SENDER_LABELS[item.senderType] || item.senderType} · <span title={formatDate(item.createdAt)}>{formatRelativeTime(item.createdAt)}</span></span>
                        </div>
                      );
                    })}
                  </div>

                  <div className={`admin-composer${composerMode === 'note' ? ' is-note' : ''}`}>
                    <div className="admin-composer-modes" role="group" aria-label="Message type">
                      <button type="button" aria-pressed={composerMode === 'reply'} className={composerMode === 'reply' ? 'is-active' : ''} onClick={() => setComposerMode('reply')}>Reply</button>
                      <button type="button" aria-pressed={composerMode === 'note'} className={composerMode === 'note' ? 'is-active' : ''} onClick={() => setComposerMode('note')}>Note</button>
                    </div>
                    {composerMode === 'reply' ? (
                      <form onSubmit={submitReply}>
                        <label htmlFor="admin-support-reply" className="sr-only">Customer-facing reply</label>
                        <textarea id="admin-support-reply" value={reply} onChange={(event) => setReply(event.target.value)} rows={3} maxLength={8000} className={inputClass} placeholder="Write a reply to the customer…" />
                        <div className="admin-composer-actions">
                          <span>The customer will see this.</span>
                          <button type="submit" className={primaryButtonClass} disabled={loading || !reply.trim()}>Send reply</button>
                        </div>
                      </form>
                    ) : (
                      <form onSubmit={submitNote}>
                        <label htmlFor="admin-support-note" className="sr-only">Internal note</label>
                        <textarea id="admin-support-note" value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={8000} className={inputClass} placeholder="Add a private note for the team…" />
                        <div className="admin-composer-actions">
                          <span>Only your team can see notes.</span>
                          <button type="submit" className={secondaryButtonClass} disabled={loading || !note.trim()}>Add internal note</button>
                        </div>
                      </form>
                    )}
                  </div>
                </div>

                <aside className="admin-thread-side">
                  <section className="admin-side-card" aria-labelledby="support-triage-title">
                    <h4 id="support-triage-title">Triage</h4>
                    <label className="admin-side-label">Priority<select className={`${inputClass} mt-1`} value={triagePriority} onChange={(event) => setTriagePriority(event.target.value)}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
                    <label className="admin-side-label">Tags<input className={`${inputClass} mt-1`} maxLength={800} value={triageTags} onChange={(event) => setTriageTags(event.target.value)} placeholder="billing, export" /></label>
                    <button type="button" className={`${secondaryButtonClass} w-full`} disabled={loading} onClick={saveTriage}>Save triage</button>
                  </section>

                  {Array.isArray(selected.internalNotes) && selected.internalNotes.length > 0 && (
                    <section className="admin-side-card" aria-labelledby="support-notes-title">
                      <h4 id="support-notes-title">Internal notes</h4>
                      {selected.internalNotes.map((item) => (
                        <div key={item.id} className="admin-note-item">
                          <p className="whitespace-pre-wrap break-words">{item.body}</p>
                          <span title={formatDate(item.createdAt)}>{formatRelativeTime(item.createdAt)}</span>
                        </div>
                      ))}
                    </section>
                  )}

                  <section className="admin-side-card" aria-labelledby="support-legacy-inquiries-title">
                    <h4 id="support-legacy-inquiries-title">Historical contact submissions</h4>
                    {!conversation?.customerUserId ? (
                      <p className="admin-side-text">Guest conversations cannot be matched automatically to older contact submissions.</p>
                    ) : legacyLoading ? (
                      <p className="admin-side-text" role="status">Checking eligible historical submissions…</p>
                    ) : legacyError ? (
                      <p className="text-sm text-red-700 dark:text-red-300" role="alert">{legacyError}</p>
                    ) : legacyInquiries.length === 0 ? (
                      <p className="admin-side-text">No eligible historical submissions were found for this verified account.</p>
                    ) : (
                      <div className="space-y-2">
                        {legacyInquiries.map((item) => (
                          <article key={item.id} className="admin-note-item">
                            <h5 className="break-words text-sm font-medium text-slate-900 dark:text-white">{item.subject}</h5>
                            <span>{formatDateShort(item.sourceCreatedAt)} · {item.source || 'website'}</span>
                            <p className="mt-1 whitespace-pre-wrap break-words">{item.message}</p>
                            {item.linkedToCurrentConversation ? (
                              <div className="mt-2"><StatusBadge tone="green">Linked history</StatusBadge></div>
                            ) : (
                              <button type="button" className={`${secondaryButtonClass} mt-2 w-full`} disabled={loading} onClick={() => runConversationAction(() => linkLegacySupportInquiry(selectedId, item.id))}>Link to conversation</button>
                            )}
                          </article>
                        ))}
                      </div>
                    )}
                  </section>
                </aside>
              </div>
            </>
          )}
        </div>
      </div>}
    </section>
  );
};

const AdminMfaPanel = () => {
  const [state, setState] = useState(null);
  const [enrollment, setEnrollment] = useState(null);
  const [code, setCode] = useState('');
  const [stepUpCode, setStepUpCode] = useState('');
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

  const verifiedFactors = (state?.factors || []).filter((factor) => factor.status === 'verified');
  const verifiedTotpFactor = verifiedFactors.find((factor) => factor.factor_type === 'totp');

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

  const verifyCurrentSession = async (event) => {
    event.preventDefault();
    if (!verifiedTotpFactor?.id || !/^\d{6}$/.test(stepUpCode.trim())) return;
    setLoading(true);
    setError('');
    try {
      setState(await verifyAdminTotp(verifiedTotpFactor.id, stepUpCode));
      setStepUpCode('');
    } catch (requestError) {
      setError(requestError.message || 'Authenticator verification failed.');
    } finally {
      setLoading(false);
    }
  };

  const verified = state?.currentLevel === 'aal2';
  const codeInput = (id, value, onChange) => (
    <input
      id={id}
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9]{6}"
      maxLength={6}
      placeholder="000000"
      value={value}
      onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 6))}
      className={`${inputClass} admin-otp-input`}
    />
  );

  return (
    <section className={`${cardClass} p-6`} aria-labelledby="admin-mfa-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`admin-kpi-icon ${verified ? 'admin-tone-emerald' : 'admin-tone-amber'}`} aria-hidden="true"><AdminIcon name="admins" /></span>
          <div>
            <h2 id="admin-mfa-title" className="text-lg text-slate-950 dark:text-white">Admin MFA</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Two-factor sign-in with an authenticator app</p>
          </div>
        </div>
        <StatusBadge tone={verified ? 'green' : 'amber'}>{verified ? 'AAL2 verified' : 'Not verified'}</StatusBadge>
      </div>
      {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300" role="alert">{error}</div>}

      {verified ? (
        <p className="mt-5 text-sm text-slate-600 dark:text-slate-300">You're verified. Support, feedback and data tools are unlocked for this session.</p>
      ) : verifiedTotpFactor && !enrollment ? (
        <form className="admin-mfa-step mt-6" onSubmit={verifyCurrentSession}>
          <span className="admin-mfa-step-number" aria-hidden="true"><AdminIcon name="bolt" /></span>
          <div className="min-w-0 flex-1">
            <label htmlFor="admin-mfa-step-up-code" className="admin-mfa-step-title">Enter the code from your authenticator app</label>
            <p className="admin-mfa-step-text">Verify your existing authenticator to enable support tools and high-risk admin actions in this session.</p>
            {codeInput('admin-mfa-step-up-code', stepUpCode, setStepUpCode)}
            <div className="mt-4">
              <button type="submit" className={primaryButtonClass} disabled={loading || !/^\d{6}$/.test(stepUpCode.trim())}>{loading ? 'Verifying…' : 'Verify authenticator for this session'}</button>
            </div>
          </div>
        </form>
      ) : verifiedFactors.length > 0 ? (
        <p className="mt-5 text-sm text-slate-600 dark:text-slate-300">{verifiedFactors.length} verified authenticator factor{verifiedFactors.length === 1 ? '' : 's'} available for this account.</p>
      ) : !enrollment ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-xl bg-[var(--admin-surface-soft)] p-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">Needed to use Support, Feedback and data tools. Takes about a minute.</p>
          <button type="button" className={primaryButtonClass} onClick={beginEnrollment} disabled={loading}>{loading ? 'Loading…' : 'Set up authenticator app'}</button>
        </div>
      ) : (
        <form className="admin-mfa-setup" onSubmit={verifyEnrollment}>
          <div className="admin-mfa-step">
            <span className="admin-mfa-step-number" aria-hidden="true">1</span>
            <div className="min-w-0 flex-1">
              <p className="admin-mfa-step-title">Scan this QR code</p>
              <p className="admin-mfa-step-text">Use Google Authenticator, 1Password, Authy or any authenticator app.</p>
              {enrollment.totp?.qr_code && <img src={enrollment.totp.qr_code} alt="QR code to add ResumeATS to your authenticator app" className="admin-mfa-qr" />}
              {enrollment.totp?.secret && (
                <AdminDisclosure summary="Can't scan it? Enter a key instead">
                  <code className="admin-mfa-secret">{enrollment.totp.secret}</code>
                </AdminDisclosure>
              )}
            </div>
          </div>
          <div className="admin-mfa-step">
            <span className="admin-mfa-step-number" aria-hidden="true">2</span>
            <div className="min-w-0 flex-1">
              <label htmlFor="admin-mfa-code" className="admin-mfa-step-title">Enter the 6-digit code</label>
              <p className="admin-mfa-step-text">The app shows a new code every 30 seconds.</p>
              {codeInput('admin-mfa-code', code, setCode)}
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="submit" className={primaryButtonClass} disabled={loading || !/^\d{6}$/.test(code.trim())}>{loading ? 'Verifying…' : 'Verify authenticator'}</button>
                <button type="button" className={secondaryButtonClass} onClick={() => { setEnrollment(null); setCode(''); }} disabled={loading}>Cancel</button>
              </div>
            </div>
          </div>
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
  const supportNotifications = settings?.supportNotifications;
  const supportEmailHealth = supportNotifications?.deliveryHealth;
  const canEnableSupportAi = Boolean(supportAi?.runtimeEnabled && supportAi?.providerConfigured && supportAi?.workerConfigured);
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
          <h2 id="admin-integration-health-title" className="text-xl font-normal text-slate-950 dark:text-white">Support AI readiness</h2>
        </div>
        <StatusBadge tone={status.tone}>{loading ? 'Loading…' : status.label}</StatusBadge>
      </div>
      {error && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300" role="alert">{error}</div>}
      {!loading && !error && settings?.available && (
        <>
          <form className="mt-5 grid gap-3" onSubmit={saveSettings}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-normal text-slate-950 dark:text-white">Safety controls</h3>
              <label className="flex items-center gap-2 text-sm font-normal text-slate-800 dark:text-slate-100"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))} disabled={saving || (!form.enabled && !canEnableSupportAi)} /> Enable support AI</label>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Enabling requires the runtime flag and provider/worker secrets. The USD budget fields are not an enforced spending limit.</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs font-normal text-slate-700 dark:text-slate-200">Max response tokens<input type="number" min="256" max="12000" step="1" className={`${inputClass} mt-1`} value={form.perTurnTokenLimit} onChange={(event) => setForm((current) => ({ ...current, perTurnTokenLimit: event.target.value }))} /></label>
              <label className="text-xs font-normal text-slate-700 dark:text-slate-200">Max AI replies per conversation<input type="number" min="1" max="50" step="1" className={`${inputClass} mt-1`} value={form.conversationTurnLimit} onChange={(event) => setForm((current) => ({ ...current, conversationTurnLimit: event.target.value }))} /></label>
              <label className="text-xs font-normal text-slate-700 dark:text-slate-200">Daily budget (USD)<input type="number" min="0" step="0.01" className={`${inputClass} mt-1`} value={form.dailyBudgetUsd} onChange={(event) => setForm((current) => ({ ...current, dailyBudgetUsd: event.target.value }))} /></label>
              <label className="text-xs font-normal text-slate-700 dark:text-slate-200">Monthly budget (USD)<input type="number" min="0" step="0.01" className={`${inputClass} mt-1`} value={form.monthlyBudgetUsd} onChange={(event) => setForm((current) => ({ ...current, monthlyBudgetUsd: event.target.value }))} /></label>
            </div>
            <button type="submit" className={`${primaryButtonClass} w-fit`} disabled={saving || (form.enabled && !canEnableSupportAi)}>{saving ? 'Saving…' : 'Save AI safety settings'}</button>
          </form>
        </>
      )}
      {!loading && !error && settings?.available && (
        <>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-[var(--admin-surface-soft)]">
            <div>
              <p className="text-sm font-medium text-slate-950 dark:text-white">Circuit breaker</p>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{circuitOpen ? `AI work is paused until ${formatDate(supportAi.circuitOpenUntil)}.` : 'No active AI circuit pause.'} Changes are audited.</p>
            </div>
            <button type="button" className={secondaryButtonClass} onClick={clearCircuit} disabled={clearingCircuit || !circuitOpen}>{clearingCircuit ? 'Clearing…' : 'Clear circuit'}</button>
          </div>
          <AdminDisclosure summary="Status details">
            <p>Secret values are never returned.</p>
            <div>
            <MetricGrid items={[
              { label: 'Database flag', value: supportAi?.databaseEnabled ? 'Enabled' : 'Off' },
              { label: 'Runtime flag', value: supportAi?.runtimeEnabled ? 'Enabled' : 'Off' },
              { label: 'Provider secret', value: supportAi?.providerConfigured ? 'Present' : 'Missing' },
              { label: 'Worker secret', value: supportAi?.workerConfigured ? 'Present' : 'Missing' },
              { label: 'Latest recorded run', value: supportAi?.workerActivity?.available === false ? 'Unavailable' : supportAi?.workerActivity?.lastUpdatedAt ? `${supportAi.workerActivity.latestRunStatus || 'Unknown'} · ${formatDate(supportAi.workerActivity.lastUpdatedAt)}` : 'No runs recorded' },
            ]} />
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Run status and timestamp are recorded queue telemetry; they do not test live provider connectivity.</p>
          <div className="mt-6" aria-labelledby="admin-support-ai-usage-title">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 id="admin-support-ai-usage-title" className="font-normal text-slate-950 dark:text-white">Usage and cost coverage · last 30 days</h3>
              {supportAi?.usageSummary?.available && <span className="text-xs text-slate-500 dark:text-slate-400">Through {formatDate(supportAi.usageSummary.windowEnd)}</span>}
            </div>
            {!supportAi?.usageSummary?.available ? (
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Summary unavailable{supportAi?.usageSummary?.reason === 'migration_required' ? ' until the required database migration is applied.' : ' right now.'}</p>
            ) : (
              <div className="mt-2">
                <MetricGrid items={[
                  { label: 'Runs', value: supportAi.usageSummary.runs.total, detail: `${supportAi.usageSummary.runs.completed} completed · ${supportAi.usageSummary.runs.queued} queued · ${supportAi.usageSummary.runs.processing} processing` },
                  { label: 'Recorded outcomes', value: supportAi.usageSummary.usage.total, detail: `${supportAi.usageSummary.usage.answered} answered · ${supportAi.usageSummary.usage.escalated} escalated · ${supportAi.usageSummary.usage.refused} refused · ${supportAi.usageSummary.usage.failed} failed · ${supportAi.usageSummary.usage.stale} stale` },
                  { label: 'Latency coverage', value: supportAi.usageSummary.usage.medianLatencyMs == null ? 'No samples' : `${supportAi.usageSummary.usage.medianLatencyMs} ms median · ${supportAi.usageSummary.usage.p95LatencyMs} ms p95`, detail: `${supportAi.usageSummary.usage.latencyReported} recorded · ${supportAi.usageSummary.usage.latencyMissing} missing` },
                  { label: 'Reported cost coverage', value: `${supportAi.usageSummary.usage.costReported} of ${supportAi.usageSummary.usage.total}`, detail: `${supportAi.usageSummary.usage.costMissing} missing estimates` },
                ]} />
              </div>
            )}
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Provider-reported cost units and currency are unverified, so no monetary total is shown.</p>
          </div>
          <div className="mt-6" aria-labelledby="admin-support-email-health-title">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="admin-support-email-health-title" className="font-normal text-slate-950 dark:text-white">Support email queue health</h3>
              <StatusBadge tone={supportNotifications?.configuration?.allRequiredValuesPresent ? 'green' : 'amber'}>
                {supportNotifications?.configuration?.allRequiredValuesPresent ? 'Required values present' : 'Configuration incomplete'}
              </StatusBadge>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Configuration indicators report value presence only; they do not test the worker or provider.</p>
            <div className="mt-2">
              <MetricGrid items={[
                { label: 'Worker secret', value: supportNotifications?.configuration?.workerSecretPresent ? 'Present' : 'Missing' },
                { label: 'Provider key', value: supportNotifications?.configuration?.providerKeyPresent ? 'Present' : 'Missing' },
                { label: 'Sender value', value: supportNotifications?.configuration?.senderValuePresent ? 'Present' : 'Missing' },
              ]} />
            </div>
            {!supportEmailHealth?.available ? (
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">Email queue summary unavailable{supportEmailHealth?.reason === 'migration_required' ? ' until the required database migration is applied.' : ' right now.'}</p>
            ) : (
              <>
                <div className="mt-2">
                  <MetricGrid items={[
                    { label: 'Ready to retry', value: supportEmailHealth.duePending, detail: supportEmailHealth.oldestPendingAt ? `Oldest queued ${formatDate(supportEmailHealth.oldestPendingAt)}` : 'No pending emails' },
                    { label: 'Scheduled retries', value: supportEmailHealth.deferredPending },
                    { label: 'Processing', value: supportEmailHealth.processing, detail: `${supportEmailHealth.staleProcessing} expired leases` },
                    { label: 'Suppressed by preference', value: supportEmailHealth.suppressed ?? 'Not reported', detail: 'Last 30 days' },
                    { label: 'Failed / dead letter', value: `${supportEmailHealth.failed} / ${supportEmailHealth.deadLetter}` },
                    { label: 'Provider accepted · last 30 days', value: supportEmailHealth.providerAcceptedLast30Days, detail: supportEmailHealth.mostRecentAcceptanceInWindow ? `Latest ${formatDate(supportEmailHealth.mostRecentAcceptanceInWindow)}` : 'No recent acceptances' },
                  ]} />
                </div>
                {supportEmailHealth.deliveryEventsAvailable === true ? (
                  <div className="mt-4" aria-labelledby="admin-support-email-provider-events-title">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h4 id="admin-support-email-provider-events-title" className="font-normal text-slate-950 dark:text-white">Brevo-reported delivery events · last 30 days</h4>
                      <span className="text-xs text-slate-500 dark:text-slate-400">{supportEmailHealth.providerEventsLast30Days} events received</span>
                    </div>
                    {supportEmailHealth.providerEventsLast30Days > 0 ? (
                      <div className="mt-2">
                        <MetricGrid items={[
                          { label: 'Recipient delivered', value: supportEmailHealth.recipientDeliveredLast30Days },
                          { label: 'Hard / soft bounce', value: `${supportEmailHealth.hardBouncedLast30Days} / ${supportEmailHealth.softBouncedLast30Days}` },
                          { label: 'Blocked / invalid', value: `${supportEmailHealth.blockedLast30Days} / ${supportEmailHealth.invalidLast30Days}` },
                          { label: 'Deferred', value: supportEmailHealth.deferredEventsLast30Days },
                          { label: 'Spam / unsubscribed', value: `${supportEmailHealth.spamReportedLast30Days} / ${supportEmailHealth.unsubscribedLast30Days}` },
                        ]} />
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400" role="status">No provider delivery events were received in this period; recipient delivery status is unknown.</p>
                    )}
                    {supportEmailHealth.mostRecentRecipientDeliveryAt && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Most recent recipient delivery reported {formatDate(supportEmailHealth.mostRecentRecipientDeliveryAt)}.</p>}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">Recipient delivery feedback is unavailable until the required database migration is applied.</p>
                )}
                {supportEmailHealth.sentWithoutAcceptanceTime > 0 && <p className="mt-3 text-sm text-amber-700 dark:text-amber-300" role="status">{supportEmailHealth.sentWithoutAcceptanceTime} sent record(s) are missing an acceptance timestamp and need investigation.</p>}
              </>
            )}
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">The outbox marks a send after the provider accepts the request; this is not confirmation that the recipient received the email.</p>
          </div>
          <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">Configured provider: {supportAi?.providerName || 'Not selected'} · Model: {supportAi?.modelName || 'Not selected'} · revision {supportAi?.revision ?? 'Not available'} · last settings update: {formatDate(supportAi?.updatedAt)}</p>
          {Array.isArray(supportAi?.history) && supportAi.history.length > 0 && (
            <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200 dark:border-slate-700">
              <div className="border-b border-gray-200 px-4 py-3 text-sm font-normal text-slate-950 dark:border-slate-700 dark:text-white">Recent safety-setting history</div>
              <table className="min-w-full text-left text-xs">
                <thead className="bg-gray-50 text-slate-500 dark:bg-[var(--admin-surface-soft)] dark:text-slate-400"><tr><th className="px-4 py-2 font-normal">Revision</th><th className="px-4 py-2 font-normal">State</th><th className="px-4 py-2 font-normal">Source</th><th className="px-4 py-2 font-normal">Changed</th><th className="px-4 py-2 font-normal">Reason</th><th className="px-4 py-2 font-normal">Action</th></tr></thead>
                <tbody>{supportAi.history.slice(0, 8).map((entry) => <tr key={`${entry.revision}-${entry.changedAt}`} className="border-t border-gray-100 dark:border-slate-800"><td className="px-4 py-2 font-normal text-slate-900 dark:text-slate-100">{entry.revision}</td><td className="px-4 py-2 text-slate-700 dark:text-slate-300">{entry.enabled ? 'Enabled' : 'Disabled'}{entry.circuitOpenUntil && ` · paused until ${formatDate(entry.circuitOpenUntil)}`}</td><td className="px-4 py-2 capitalize text-slate-700 dark:text-slate-300">{entry.source || 'Unknown'}</td><td className="px-4 py-2 text-slate-700 dark:text-slate-300">{formatDate(entry.changedAt)}</td><td className="px-4 py-2 text-slate-700 dark:text-slate-300">{entry.reason || '—'}</td><td className="px-4 py-2">{entry.revision !== supportAi.revision && (pendingRollbackRevision === entry.revision ? <span className="flex flex-wrap gap-2"><button type="button" className="font-normal text-red-700 underline dark:text-red-300" onClick={() => rollbackSettings(entry.revision)} disabled={rollingBackRevision !== null || saving || clearingCircuit}>{rollingBackRevision === entry.revision ? 'Restoring…' : 'Confirm'}</button><button type="button" className="font-normal text-slate-600 underline dark:text-slate-300" onClick={() => setPendingRollbackRevision(null)} disabled={rollingBackRevision !== null}>Cancel</button></span> : <button type="button" className="font-normal text-blue-700 underline dark:text-blue-300" onClick={() => setPendingRollbackRevision(entry.revision)} disabled={rollingBackRevision !== null || saving || clearingCircuit}>Rollback</button>)}</td></tr>)}</tbody>
              </table>
            </div>
          )}
          </AdminDisclosure>
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
          <h2 id="admin-support-routing-title" className="text-xl font-normal text-slate-950 dark:text-white">Hours and routing</h2>
        </div>
        <StatusBadge tone={!settings?.available ? 'amber' : 'green'}>{loading ? 'Loading…' : settings?.available ? `Revision ${settings.revision ?? '—'}` : 'Migration required'}</StatusBadge>
      </div>
      {error && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300" role="alert">{error}</div>}
      {!loading && !error && settings?.available && (
        <>
          <form className="mt-5 grid gap-4" onSubmit={saveSettings}>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="text-xs font-normal text-slate-700 dark:text-slate-200">Timezone<input className={`${inputClass} mt-1`} value={form.timezone} onChange={(event) => setForm((current) => ({ ...current, timezone: event.target.value }))} placeholder="Asia/Tbilisi" /></label>
              <label className="admin-time-filter text-xs font-normal text-slate-700 dark:text-slate-200">Opens at<input type="time" className={`${inputClass} mt-1`} value={form.businessStart} onChange={(event) => setForm((current) => ({ ...current, businessStart: event.target.value }))} /></label>
              <label className="admin-time-filter text-xs font-normal text-slate-700 dark:text-slate-200">Closes at<input type="time" className={`${inputClass} mt-1`} value={form.businessEnd} onChange={(event) => setForm((current) => ({ ...current, businessEnd: event.target.value }))} /></label>
            </div>
            <fieldset>
              <legend className="text-xs font-normal text-slate-700 dark:text-slate-200">Working days</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {dayOptions.map(([day, label]) => <label key={day} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"><input type="checkbox" checked={form.businessDays.includes(day)} onChange={() => toggleDay(day)} />{label}</label>)}
              </div>
            </fieldset>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="text-xs font-normal text-slate-700 dark:text-slate-200">Reply within (minutes)<input type="number" min="5" max="10080" step="1" className={`${inputClass} mt-1`} value={form.firstResponseTargetMinutes} onChange={(event) => setForm((current) => ({ ...current, firstResponseTargetMinutes: event.target.value }))} /></label>
              <label className="text-xs font-normal text-slate-700 dark:text-slate-200">Max open conversations<input type="number" min="1" max="10000" step="1" className={`${inputClass} mt-1`} value={form.maxQueueSize} onChange={(event) => setForm((current) => ({ ...current, maxQueueSize: event.target.value }))} /></label>
              <label className="flex items-center gap-2 pt-6 text-sm font-normal text-slate-800 dark:text-slate-100"><input type="checkbox" checked={form.autoRouteEnabled} onChange={(event) => setForm((current) => ({ ...current, autoRouteEnabled: event.target.checked }))} /> Auto-assign new conversations</label>
            </div>
            <label className="text-xs font-normal text-slate-700 dark:text-slate-200">Note for the change log (optional)<input className={`${inputClass} mt-1`} maxLength={240} value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} placeholder="Why is this setting changing?" /></label>
            <button type="submit" className={`${primaryButtonClass} w-fit`} disabled={saving}>{saving ? 'Saving…' : 'Save routing settings'}</button>
          </form>
          {Array.isArray(settings.history) && settings.history.length > 0 && <AdminDisclosure summary="Change history"><div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-slate-700"><div className="border-b border-gray-200 px-4 py-3 text-sm font-normal text-slate-950 dark:border-slate-700 dark:text-white">Recent routing-setting history</div><table className="min-w-full text-left text-xs"><thead className="bg-gray-50 text-slate-500 dark:bg-[var(--admin-surface-soft)] dark:text-slate-400"><tr><th className="px-4 py-2">Revision</th><th className="px-4 py-2">Window</th><th className="px-4 py-2">Queue</th><th className="px-4 py-2">Changed</th><th className="px-4 py-2">Reason</th></tr></thead><tbody>{settings.history.slice(0, 8).map((entry) => <tr key={`${entry.revision}-${entry.changedAt}`} className="border-t border-gray-100 dark:border-slate-800"><td className="px-4 py-2 font-normal">{entry.revision}</td><td className="px-4 py-2">{entry.timezone} · {entry.businessStart || '—'}–{entry.businessEnd || '—'}</td><td className="px-4 py-2">{entry.maxQueueSize ?? '—'} max · {entry.autoRouteEnabled ? 'auto' : 'manual'}</td><td className="px-4 py-2">{formatDate(entry.changedAt)}</td><td className="px-4 py-2">{entry.reason || '—'}</td></tr>)}</tbody></table></div></AdminDisclosure>}
        </>
      )}
    </section>
  );
};

const AdminKnowledgePanel = () => {
  const [articles, setArticles] = useState([]);
  const [form, setForm] = useState({ slug: '', title: '', body: '', sourceRef: '' });
  const [showDraftForm, setShowDraftForm] = useState(false);
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
      setShowDraftForm(false);
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

  const mfaBlocked = isMfaRequiredError(error);

  return (
    <section className="space-y-5" aria-labelledby="admin-knowledge-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="admin-knowledge-title" className="text-xl font-normal text-slate-950 dark:text-white">Knowledge review</h2>
        {!mfaBlocked && <button type="button" className={secondaryButtonClass} onClick={() => setShowDraftForm((open) => !open)} aria-expanded={showDraftForm}>{showDraftForm ? 'Close form' : 'New draft'}</button>}
      </div>
      {mfaBlocked && <AdminMfaRequired message={error} showAction={false} />}
      {error && !mfaBlocked && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300" role="alert">{error}</div>}
      {!mfaBlocked && <>
      {showDraftForm && <form className={`${cardClass} grid gap-3 p-5`} onSubmit={saveDraft}>
        <h3 className="font-normal text-slate-950 dark:text-white">Create a draft version</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm font-normal text-slate-800 dark:text-slate-100">Slug<input className={`${inputClass} mt-1`} value={form.slug} onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))} placeholder="export-help" /></label>
          <label className="text-sm font-normal text-slate-800 dark:text-slate-100">Source reference<input className={`${inputClass} mt-1`} value={form.sourceRef} onChange={(event) => setForm((current) => ({ ...current, sourceRef: event.target.value }))} placeholder="docs or approved policy reference" /></label>
        </div>
        <label className="text-sm font-normal text-slate-800 dark:text-slate-100">Title<input className={`${inputClass} mt-1`} value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} maxLength={200} /></label>
        <label className="text-sm font-normal text-slate-800 dark:text-slate-100">Approved answer body<textarea className={`${inputClass} mt-1`} value={form.body} onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))} maxLength={20000} rows={5} /></label>
        <button type="submit" className={`${primaryButtonClass} w-fit`} disabled={loading || !form.slug.trim() || !form.title.trim() || !form.body.trim() || !form.sourceRef.trim()}>{loading ? 'Saving…' : 'Save draft'}</button>
      </form>}
      <div className={`${cardClass} divide-y divide-slate-200 dark:divide-slate-700`}>
        {articles.length === 0 ? <p className="p-5 text-sm text-slate-500 dark:text-slate-400">No knowledge articles are available.</p> : articles.map((article) => (
          <article key={article.articleId} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-normal text-slate-950 dark:text-white">{article.currentVersion?.title || article.slug}</h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{article.slug} · {article.locale} · {article.status}</p>
              </div>
              {article.latestVersion && article.latestVersion.id !== article.currentVersionId && <button type="button" className={primaryButtonClass} disabled={loading} onClick={() => runKnowledgeAction(() => publishSupportKnowledge({ articleId: article.articleId, versionId: article.latestVersion.id }))}>Publish v{article.latestVersion.versionNumber}</button>}
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {(article.versions || []).map((version) => (
                <div key={version.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-900">
                  <div className="flex items-center justify-between gap-2"><span className="font-normal text-slate-900 dark:text-white">v{version.versionNumber} · {version.title}</span>{version.publishedAt && <StatusBadge tone="green">Published</StatusBadge>}</div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Source: {version.sourceRef}</p>
                  {version.publishedAt && version.id !== article.currentVersionId && <button type="button" className={`${secondaryButtonClass} mt-2`} disabled={loading} onClick={() => runKnowledgeAction(() => rollbackSupportKnowledge({ articleId: article.articleId, versionId: version.id }))}>Rollback to v{version.versionNumber}</button>}
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
      </>}
    </section>
  );
};

const SETTINGS_TABS = [
  { id: 'security', label: 'Security', icon: 'admins', Panel: AdminMfaPanel },
  { id: 'hours', label: 'Support hours', icon: 'clock', Panel: AdminSupportRoutingPanel },
  { id: 'ai', label: 'Support AI', icon: 'jobs', Panel: AdminIntegrationHealthPanel },
  { id: 'knowledge', label: 'Knowledge base', icon: 'audit', Panel: AdminKnowledgePanel },
];

// Every panel stays mounted (so each loads its data once); only the selected one is shown.
const AdminSettingsPage = () => {
  const [selected, setSelected] = useState('security');
  const tabRefs = useRef({});

  const handleKeyDown = (event, index) => {
    const moves = { ArrowRight: 1, ArrowLeft: -1, Home: -index, End: SETTINGS_TABS.length - 1 - index };
    if (!(event.key in moves)) return;
    event.preventDefault();
    const next = SETTINGS_TABS[(index + moves[event.key] + SETTINGS_TABS.length) % SETTINGS_TABS.length];
    setSelected(next.id);
    tabRefs.current[next.id]?.focus();
  };

  return (
    <div className="space-y-5">
      <div className="admin-tabs" role="tablist" aria-label="Settings sections">
        {SETTINGS_TABS.map((tab, index) => {
          const active = selected === tab.id;
          return (
            <button
              key={tab.id}
              ref={(element) => { tabRefs.current[tab.id] = element; }}
              type="button"
              role="tab"
              id={`admin-settings-tab-${tab.id}`}
              aria-selected={active}
              aria-controls={`admin-settings-panel-${tab.id}`}
              tabIndex={active ? 0 : -1}
              className={active ? 'is-active' : ''}
              onClick={() => setSelected(tab.id)}
              onKeyDown={(event) => handleKeyDown(event, index)}
            >
              {active && <motion.span layoutId="admin-settings-tab-pill" className="admin-tab-pill" transition={{ type: 'spring', stiffness: 520, damping: 38 }} aria-hidden="true" />}
              <AdminIcon name={tab.icon} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
      {SETTINGS_TABS.map(({ id, Panel }) => (
        <div key={id} role="tabpanel" id={`admin-settings-panel-${id}`} aria-labelledby={`admin-settings-tab-${id}`} hidden={selected !== id}>
          <Panel />
        </div>
      ))}
    </div>
  );
};

const formatGa4Count = (value) => (
  Number.isFinite(value) ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value) : '—'
);

const formatGa4Rate = (value) => (
  Number.isFinite(value) && value >= 0 && value <= 1 ? `${(value * 100).toFixed(2)}%` : '—'
);

const getGa4UnavailableMessage = (report) => {
  if (report?.status === 'not_connected' && report.reason === 'credentials_missing') {
    return 'Not connected. Add GA4_SERVICE_ACCOUNT_JSON as a server-side Supabase secret for a dedicated read-only service account, grant it Viewer access to property 552904382, and enable the Google Analytics Data API. No sample data is shown.';
  }
  if (report?.reason === 'reporting_timezone_mismatch') {
    return `The GA4 property timezone (${report.propertyTimeZone || 'unknown'}) does not match the selected dashboard timezone (${report.window?.reportingTimeZone || 'unknown'}). No report is shown to avoid incorrect date totals.`;
  }
  const reasons = {
    credential_configuration_invalid: 'The server-side GA4 credential is not in the expected service-account format. Replace it securely; secret values are never shown here.',
    property_configuration_invalid: 'The GA4 property configuration is invalid.',
    cache_not_configured: 'The private GA4 report cache migration is not installed in this environment. The API is not queried without the cache.',
    cache_unavailable: 'The private GA4 report cache could not be read. An uncached provider request was not made.',
    google_access_denied: 'Google denied the reporting identity. Confirm the service account has Viewer access to this GA4 property and the Data API is enabled.',
    google_quota_exceeded: 'The Google Analytics Data API quota is currently exhausted.',
    google_report_unavailable: 'Google could not run the configured report. Confirm sign_up is still a GA4 key event.',
    google_report_invalid: 'Google returned a report that did not match the expected schema.',
    cache_write_failed: 'The live report could not be safely cached, so it was not presented as current data.',
    google_api_unavailable: 'Google Analytics did not return a fresh report.',
    invalid_reporting_window: 'The selected analytics date window is invalid.',
    reporting_timezone_missing: 'Google did not return the GA4 property timezone, so the report dates cannot be verified.',
  };
  return reasons[report?.reason] || 'The GA4 report is unavailable; no zero or mock result is substituted.';
};

const AdminGoogleAnalyticsPanel = ({ report }) => {
  const unavailable = report?.available !== true;
  const statusLabel = report?.status === 'stale'
    ? 'Stale report'
    : report?.status === 'connected'
      ? 'Connected'
      : 'Not connected';
  const statusTone = report?.status === 'connected'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200'
    : report?.status === 'stale'
      ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200'
      : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-[var(--admin-surface-soft)] dark:text-slate-300';

  return (
    <section className={`${cardClass} p-5`} aria-labelledby="admin-ga4-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="admin-ga4-title" className="text-base font-normal text-slate-950 dark:text-white">GA4 visitor acquisition &amp; sign-up conversion</h3>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-normal ${statusTone}`}>{statusLabel}</span>
      </div>
      {unavailable ? (
        <AdminDisclosure summary="Why it's unavailable">
          <p role="status">{getGa4UnavailableMessage(report)}</p>
        </AdminDisclosure>
      ) : (
        <>
          {report.stale && <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200" role="status">Showing the last successful cached report because refresh failed ({report.reason}). Its original fetch time is shown below.</p>}
          {report.qualityReasons?.length > 0 && <p className="mt-3 text-sm text-amber-800 dark:text-amber-200" role="status">Some GA4 metrics were missing from the response: {report.qualityReasons.join(', ')}.</p>}
          <div className="admin-stat-row mt-4">
            <div><span>Sessions</span><strong>{formatGa4Count(report.totals.sessions)}</strong></div>
            <div><span>GA4 users</span><strong>{formatGa4Count(report.totals.totalUsers)}</strong></div>
            <div><span>New users</span><strong>{formatGa4Count(report.totals.newUsers)}</strong></div>
            <div><span>Sessions with sign_up</span><strong>{formatGa4Rate(report.totals.signUpSessionConversionRate)}</strong></div>
          </div>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Selected dates: {report.window.startDate} – {report.window.endDate} · dashboard timezone {report.window.reportingTimeZone} · GA4 property timezone {report.propertyTimeZone || 'not returned'} · last fetched {report.fetchedAt ? formatAnalyticsTimestamp(report.fetchedAt, ANALYTICS_REPORTING_TIME_ZONE) : 'unknown'}.
            {report.totals.sessions === 0 ? ' No sessions were reported in this window.' : ''}
          </p>
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm dark:divide-slate-700">
              <caption className="sr-only">Google Analytics acquisition and sign-up session conversion by channel</caption>
              <thead className="bg-slate-50 text-xs font-normal uppercase tracking-wide text-slate-500 dark:bg-[var(--admin-surface-soft)] dark:text-slate-400">
                <tr><th scope="col" className="px-4 py-3">Channel</th><th scope="col" className="px-4 py-3 text-right">Sessions</th><th scope="col" className="px-4 py-3 text-right">Users</th><th scope="col" className="px-4 py-3 text-right">New users</th><th scope="col" className="px-4 py-3 text-right">Sign-up session rate</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {report.channels.length === 0
                  ? <tr><td colSpan={5} className="px-4 py-5 text-center text-slate-500 dark:text-slate-400">No channel rows were returned for this range.</td></tr>
                  : report.channels.map((channel) => (
                    <tr key={channel.channel}>
                      <th scope="row" className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{channel.channel}</th>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">{formatGa4Count(channel.sessions)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">{formatGa4Count(channel.totalUsers)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">{formatGa4Count(channel.newUsers)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">{formatGa4Rate(channel.signUpSessionConversionRate)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
};

const AdminAnalyticsPanel = ({ adminRole, onReviewQuality, onRebuildAggregates }) => {
  const [mfaLevel, setMfaLevel] = useState(null);
  const [dateRange, setDateRange] = useState(() => {
    const to = formatDateInputValueInTimeZone(new Date(), ANALYTICS_REPORTING_TIME_ZONE);
    return { from: shiftDateInputValue(to, -29), to };
  });
  const { from, to } = dateRange;
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [qualityReviewAcknowledged, setQualityReviewAcknowledged] = useState(false);
  const [qualityReviewLoading, setQualityReviewLoading] = useState(false);
  const [aggregateRebuildLoading, setAggregateRebuildLoading] = useState(false);
  const [aggregateRebuildNotice, setAggregateRebuildNotice] = useState('');

  useEffect(() => {
    let active = true;
    void getAdminMfaState()
      .then((state) => {
        if (active) setMfaLevel(state.currentLevel);
      })
      .catch(() => {
        if (active) setMfaLevel(null);
      });
    return () => { active = false; };
  }, []);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await fetchAdminAnalytics(getAnalyticsDateRange(from, to, ANALYTICS_REPORTING_TIME_ZONE));
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
      const result = await fetchAdminAnalyticsCsv(getAnalyticsDateRange(from, to, ANALYTICS_REPORTING_TIME_ZONE));
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

  const submitQualityReview = async () => {
    if (!qualityReviewAcknowledged || !onReviewQuality) return;
    setQualityReviewLoading(true);
    try {
      const reviewed = await onReviewQuality();
      if (reviewed) {
        setQualityReviewAcknowledged(false);
        await loadAnalytics();
      }
    } finally {
      setQualityReviewLoading(false);
    }
  };

  const rebuildDailyAggregates = async () => {
    if (adminRole !== 'owner' || !onRebuildAggregates) return;
    setAggregateRebuildLoading(true);
    setAggregateRebuildNotice('');
    try {
      const completed = await onRebuildAggregates(getAnalyticsDateRange(from, to, ANALYTICS_REPORTING_TIME_ZONE));
      if (completed) {
        setAggregateRebuildNotice('Daily aggregates rebuilt for the selected reporting window.');
        await loadAnalytics();
      }
    } catch (requestError) {
      setError(requestError.message || 'Daily analytics aggregates could not be rebuilt.');
    } finally {
      setAggregateRebuildLoading(false);
    }
  };

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  const metrics = snapshot?.metrics || {};
  const eventRatios = snapshot?.eventRatios || {};
  const paidConversion = snapshot?.paidConversion;
  const resumeActivation = snapshot?.resumeActivation;
  const productRetention = snapshot?.productRetention;
  const paidConversionSummary = getPaidConversionSummary(paidConversion);
  const resumeActivationSummary = getResumeActivationSummary(resumeActivation);
  const retentionD7 = getProductRetentionPeriodSummary(productRetention, 'd7', 7);
  const retentionD30 = getProductRetentionPeriodSummary(productRetention, 'd30', 30);
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
    ['AI generations started', metrics.ai_generation_started],
    ['AI generations completed', metrics.ai_generation_completed],
    ['AI generations failed', metrics.ai_generation_failed],
  ];
  const headlineCards = [
    ['Accounts created', metrics.account_created],
    ['Resumes created', metrics.resume_created],
    ['Resume exports', metrics.resume_exported],
    ['Verified purchases', metrics.purchase_confirmed],
  ];
  const eventRatioCards = [
    ['Purchases / account-created events', eventRatios.purchasesPerAccountCreatedEvent],
    ['Resumes / account-created events', eventRatios.resumesPerAccountCreatedEvent],
    ['Exports / resume-created events', eventRatios.exportsPerResumeCreatedEvent],
    ['Checkouts / upgrade clicks', eventRatios.checkoutsPerUpgradeClick],
    ['Purchases / checkout-created events', eventRatios.purchasesPerCheckoutCreatedEvent],
    ['Purchases / upgrade clicks', eventRatios.purchasesPerUpgradeClick],
    ['Resolutions / support-started events', eventRatios.supportResolutionsPerStartedEvent],
  ];

  return (
    <section className="space-y-5" aria-labelledby="admin-analytics-title">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 id="admin-analytics-title" className="text-xl font-normal text-slate-950 dark:text-white">First-party product analytics</h2>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="admin-date-filter"><label htmlFor="admin-analytics-from" className="block text-xs font-normal text-slate-500 dark:text-slate-400">From</label><input id="admin-analytics-from" type="date" value={from} onChange={(event) => setDateRange((current) => ({ ...current, from: event.target.value }))} className={`${inputClass} mt-1`} /></div>
          <div className="admin-date-filter"><label htmlFor="admin-analytics-to" className="block text-xs font-normal text-slate-500 dark:text-slate-400">To</label><input id="admin-analytics-to" type="date" value={to} onChange={(event) => setDateRange((current) => ({ ...current, to: event.target.value }))} className={`${inputClass} mt-1`} /></div>
          <button type="button" className={secondaryButtonClass} onClick={loadAnalytics} disabled={loading}>Refresh</button>
          <button type="button" className={secondaryButtonClass} onClick={() => { void downloadAnalyticsCsv(); }} disabled={loading}>Download CSV</button>
          {adminRole === 'owner' && <button type="button" className={secondaryButtonClass} onClick={() => { void rebuildDailyAggregates(); }} disabled={loading || aggregateRebuildLoading || mfaLevel !== 'aal2'} aria-describedby="admin-analytics-aggregate-help">{aggregateRebuildLoading ? 'Rebuilding…' : 'Rebuild daily aggregates'}</button>}
        </div>
      </div>

      <p id="admin-analytics-aggregate-help" className="sr-only">Rebuilding daily aggregates requires an owner session with verified MFA.</p>
      {adminRole === 'owner' && mfaLevel !== 'aal2' && <p className="text-xs text-amber-700 dark:text-amber-300">Verify your authenticator in Admin Settings before rebuilding analytics data.</p>}
      {snapshot && <p className="text-xs text-slate-500 dark:text-slate-400" role="status">
        {snapshot.dailyAggregates?.available
          ? `Daily cache built ${formatAnalyticsTimestamp(snapshot.dailyAggregates.computedAt, ANALYTICS_REPORTING_TIME_ZONE)} (${snapshot.dailyAggregates.actualRows} rows).`
          : 'Showing live counts.'}
        {aggregateRebuildNotice && <span className="ml-2">{aggregateRebuildNotice}</span>}
      </p>}

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300" role="alert">{error}</div>}
      {loading && <div className="admin-empty">Loading measured events…</div>}
      {!loading && snapshot && (
        <>
          <div className="admin-stat-row">
            {headlineCards.map(([label, value]) => (
              <div key={label}><span>{label}</span><strong>{value === null || value === undefined ? '—' : formatCount(value)}</strong></div>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="admin-metric-card">
              <h3>7-day resume activation</h3>
              <p className="admin-metric-value">{resumeActivationSummary.value}</p>
              {resumeActivationSummary.caption && <AdminDisclosure><p role={resumeActivation?.isComplete ? undefined : 'status'}>{resumeActivationSummary.caption}</p></AdminDisclosure>}
            </div>
            <div className="admin-metric-card">
              <h3>30-day signup-to-paid conversion</h3>
              <p className="admin-metric-value">{paidConversionSummary.value}</p>
              {paidConversionSummary.caption && <AdminDisclosure><p role={paidConversion?.isComplete ? undefined : 'status'}>{paidConversionSummary.caption}</p></AdminDisclosure>}
            </div>
            <div className="admin-metric-card">
              <h3>Product retention</h3>
              <div className="mt-2 grid grid-cols-2 gap-3">
                {[
                  { label: 'Day 7 · exact-day retention', summary: retentionD7 },
                  { label: 'Day 30 · exact-day retention', summary: retentionD30 },
                ].map(({ label, summary }) => (
                  <div key={label}>
                    <h4 className="text-xs text-slate-500 dark:text-slate-400">{label}</h4>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-slate-950 dark:text-white">{summary.value}</p>
                  </div>
                ))}
              </div>
              <AdminDisclosure>
                <p>Day 7: {retentionD7.caption}</p>
                <p className="mt-1">Day 30: {retentionD30.caption}</p>
                {productRetention?.qualityReasons?.length > 0 && <p className="mt-1" role="status">{describePaidConversionQuality(productRetention)}</p>}
              </AdminDisclosure>
            </div>
          </div>
          {adminRole === 'owner' && paidConversion?.qualityReasons?.includes('qa_exclusion_review_required') && (
            <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
              <p className="text-sm text-amber-950 dark:text-amber-100">Confirm the recorded QA exclusions. A later tag change needs another review.</p>
              <label className="mt-3 flex items-start gap-2 text-sm text-amber-950 dark:text-amber-100">
                <input type="checkbox" checked={qualityReviewAcknowledged} onChange={(event) => setQualityReviewAcknowledged(event.target.checked)} className="mt-1" />
                <span>I reviewed the QA-exclusion coverage and confirm the recorded exclusions are appropriate.</span>
              </label>
              <button type="button" className={`${primaryButtonClass} mt-3`} onClick={() => { void submitQualityReview(); }} disabled={!qualityReviewAcknowledged || qualityReviewLoading}>
                {qualityReviewLoading ? 'Recording review…' : 'Record owner review'}
              </button>
            </div>
          )}
          <AdminGoogleAnalyticsPanel report={snapshot.googleAnalytics} />
          <AdminRecurringRevenuePanel snapshot={snapshot.recurringRevenue} />
          <AdminDisclosure summary="All tracked events and ratios">
            <dl className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
              {[...cards, ...eventRatioCards.map(([label, value]) => [label, value === null || value === undefined ? null : `${value}%`])].map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-4 border-b border-slate-200 py-2 dark:border-slate-700">
                  <dt>{label}</dt>
                  <dd className="tabular-nums text-slate-950 dark:text-white">{value === null || value === undefined ? '—' : value}</dd>
                </div>
              ))}
            </dl>
          </AdminDisclosure>
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
  const { isDark } = useAdminTheme();
  const routeState = useMemo(() => getAdminRouteState(location.pathname), [location.pathname]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const overviewLoaded = useRef(false);
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
  const [failedDeletionQueue, setFailedDeletionQueue] = useState({ available: null, items: [], loading: false, error: '' });
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

  const loadFailedDeletionQueue = useCallback(async () => {
    setFailedDeletionQueue((current) => ({ ...current, loading: true, error: '' }));
    try {
      const result = await fetchFailedPrivacyDeletionJobs();
      const queue = result?.failedPrivacyDeletionJobs || { available: false, items: [] };
      setFailedDeletionQueue({ available: queue.available === true, items: queue.items || [], loading: false, error: '' });
    } catch (error) {
      setFailedDeletionQueue({ available: false, items: [], loading: false, error: error.message || 'Failed deletion requests could not be loaded.' });
    }
  }, []);

  const loadOverview = useCallback(async () => {
    if (overviewLoaded.current) setRefreshing(true);
    else setLoading(true);
    setAccessError('');
    try {
      const [overviewResult, directoryResult] = await Promise.allSettled([
        fetchAdminOverview(),
        fetchAdminDirectory({ limit: 50 }),
      ]);
      if (overviewResult.status !== 'fulfilled') throw overviewResult.reason;
      overviewLoaded.current = true;
      setData(overviewResult.value);
      if (overviewResult.value?.admin?.role === 'owner') void loadFailedDeletionQueue();
      else setFailedDeletionQueue({ available: false, items: [], loading: false, error: '' });
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
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadFailedDeletionQueue]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/signin', { replace: true });
      return;
    }
    loadOverview();
    void loadJobOperations();
  }, [authLoading, user, navigate, loadJobOperations, loadOverview]);

  useEffect(() => {
    if (directoryState.available !== true) return undefined;
    const timer = setTimeout(() => {
      void loadDirectory({ searchTerm: search });
    }, 250);
    return () => clearTimeout(timer);
  }, [directoryState.available, loadDirectory, search]);

  const analytics = data?.analytics || {};
  const overviewUsers = directoryState.available === true && !directoryState.nextCursor
    ? (directoryState.items || [])
    : (data?.users || []);
  const overviewDirectoryComplete = directoryState.available === true && !directoryState.nextCursor;
  const canManageAdmins = data?.admin?.role === 'owner';
  const canManagePrivacy = ['owner', 'admin'].includes(data?.admin?.role);
  const canManageJobActions = ['owner', 'admin'].includes(data?.admin?.role);
  const canApproveDeletion = data?.admin?.role === 'owner';
  const canManageAnalyticsQa = data?.admin?.role === 'owner';

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
      return true;
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
      return false;
    } finally {
      if (key.startsWith('job-action-')) void loadJobOperations();
      if (key.startsWith('privacy-deletion-resume-')) void loadFailedDeletionQueue();
      setActionLoading('');
    }
  };

  const changeAnalyticsQaExclusion = ({ userId, operation, category, scope }) => runAction(
    `analytics-qa-${userId}`,
    (idempotencyKey) => setAdminAnalyticsQaExclusion({ userId, operation, category, scope, idempotencyKey }),
    operation === 'exclude' ? 'QA exclusion recorded.' : 'QA exclusion ended for future activity.',
    userId,
  );

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

  const resumeDeletion = (job) => {
    setActionDialog({
      type: 'resumeDeletion',
      key: `privacy-deletion-resume-${job.id}`,
      target: { id: job.id, userId: job.target_user_id, email: `Request ${job.id}` },
      title: 'Resume failed deletion request',
      confirmLabel: 'Requeue same request',
      danger: true,
      message: `The worker will resume this same request at “${job.current_step}”. Data removed before the failure stays removed. Owner approval, eligibility, hold, and provider checks are not bypassed. Check the failure reason (${getPrivacyDeletionFailureCopy(job.failure_code)}) and correct its cause before continuing.`,
    });
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
    } else if (dialog.type === 'resumeDeletion') {
      runAction(dialog.key, (idempotencyKey) => resumeAdminPrivacyDeletion(dialog.target.id, idempotencyKey), 'Existing deletion request requeued');
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
      <div className={`admin-boot${isDark ? ' is-dark' : ''}`} role="status" aria-live="polite">
        <div className="admin-boot-mark" aria-hidden="true">
          <svg viewBox="0 0 384 512" aria-hidden="true"><path fill="currentColor" d="M224 136V0H24C10.7 0 0 10.7 0 24v464c0 13.3 10.7 24 24 24h336c13.3 0 24-10.7 24-24V160H248c-13.2 0-24-10.8-24-24zm160-14.1v6.1H256V0h6.1c6.4 0 12.5 2.5 17 7l97.9 98c4.5 4.5 7 10.6 7 16.9z" /></svg>
        </div>
        <p className="text-sm font-medium">Loading control center</p>
        <div className="admin-boot-bar" aria-hidden="true"><span /></div>
      </div>
    );
  }

  if (accessError) {
    return (
      <div className={`admin-access-error${isDark ? ' dark' : ''}`}>
        <div className="admin-access-card">
          <div className="admin-access-icon" aria-hidden="true"><AdminIcon name="admins" /></div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">Admin access unavailable</h1>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{accessError}</p>
          <button type="button" className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-600/25 transition hover:bg-indigo-700 dark:bg-indigo-300 dark:text-slate-950 dark:hover:bg-indigo-200" onClick={loadOverview}>
            <AdminIcon name="refresh" />
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <AdminShell activeSection={activeTab} onNavigate={navigateToSection}>
      <AdminActionDialog dialog={actionDialog} pending={Boolean(actionDialog && actionLoading === actionDialog.key)} onClose={() => setActionDialog(null)} onConfirm={submitActionDialog} />
      <div className="app-page admin-page text-slate-900 dark:text-slate-100">
      <div className="admin-stagger mx-auto max-w-7xl space-y-6">
        <AdminPageHeader
          section={activeTab}
          actions={SECTIONS_WITH_OWN_REFRESH.has(activeTab) ? null : (
            <button type="button" className={primaryButtonClass} onClick={loadOverview} disabled={refreshing} aria-busy={refreshing}>
              <AdminIcon name="refresh" className={`admin-refresh-icon${refreshing ? ' is-spinning' : ''}`} />
              Refresh
            </button>
          )}
        />

        {pendingOperations.length > 0 && (
          <div className={`${cardClass} border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/30`} role="status" aria-live="polite">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-normal text-amber-950 dark:text-amber-100">Pending operation reconciliation</h2>
                <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">The server could not store a final receipt yet. The original idempotency key is retained, so retrying will not blindly duplicate the mutation.</p>
              </div>
              <button type="button" className={secondaryButtonClass} onClick={() => { setPendingOperations([]); void loadOverview(); }}>Refresh status</button>
            </div>
            <ul className="mt-3 space-y-1 text-xs text-amber-900 dark:text-amber-100">
              {pendingOperations.map((item) => <li key={item.key}>Operation {item.requestId || item.key}: {item.message}</li>)}
            </ul>
          </div>
        )}

        <>
            {activeTab === 'overview' && (
              <>
                <AdminOverview
                  analytics={analytics}
                  jobs={data?.jobs}
                  users={overviewUsers}
                  directoryComplete={overviewDirectoryComplete}
                  generatedAt={data?.generatedAt}
                  onNavigate={navigateToSection}
                />
                {canApproveDeletion && (failedDeletionQueue.items.length > 0 || failedDeletionQueue.error) && (
                <section className={`${cardClass} border-amber-300 bg-amber-50 p-5 dark:border-amber-900/60 dark:bg-amber-950/25`} aria-labelledby="failed-deletion-queue-title">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 id="failed-deletion-queue-title" className="text-lg font-normal text-slate-950 dark:text-white">Failed privacy deletion requests</h2>
                      <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-300">Owner-only recovery queue. Resuming reuses the same request and recorded step; it does not undo already-removed data or bypass worker safety checks.</p>
                    </div>
                    <button type="button" className={secondaryButtonClass} onClick={() => void loadFailedDeletionQueue()} disabled={failedDeletionQueue.loading}>
                      {failedDeletionQueue.loading ? 'Refreshing…' : 'Refresh queue'}
                    </button>
                  </div>
                  {failedDeletionQueue.error && <p className="mt-3 text-sm text-red-700 dark:text-red-300" role="alert">{failedDeletionQueue.error}</p>}
                  {failedDeletionQueue.items.length > 0 && (
                    <div className="mt-4 space-y-3">
                      {failedDeletionQueue.items.map((job) => (
                        <div key={job.id} className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-white/80 p-4 dark:border-amber-900/50 dark:bg-slate-900/60 md:flex-row md:items-center md:justify-between">
                          <div className="min-w-0 text-sm">
                            <div className="font-medium text-slate-950 dark:text-white">Request {job.id}</div>
                            <div className="mt-1 break-all text-xs text-slate-600 dark:text-slate-300">Account {job.target_user_id} · step {job.current_step} · failure {getPrivacyDeletionFailureCopy(job.failure_code)}</div>
                            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{job.attempt_count} attempts · {job.destructive_started_at ? 'destructive phase started' : 'destructive phase not started'} · updated {formatDate(job.updated_at)}</div>
                          </div>
                          <button type="button" className={dangerButtonClass} onClick={() => resumeDeletion(job)} disabled={Boolean(actionLoading)}>
                            Resume request
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
                )}
              </>
            )}

              {activeTab === 'users' && (
                <section className="admin-panel">
                  <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h2 className="text-xl font-normal">Users</h2>
                      <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{formatCount(filteredUsers.length)} {filteredUsers.length === 1 ? 'account' : 'accounts'}{search.trim() ? ' match this search' : ' loaded'}</p>
                    </div>
                    <label htmlFor="admin-user-search" className="sr-only">Search users</label>
                    <div className="admin-search w-full md:max-w-sm">
                      <AdminIcon name="search" />
                      <input
                        id="admin-user-search"
                        type="search"
                        className={inputClass}
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search by email, name, or ID"
                      />
                    </div>
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
                    onSetAnalyticsQaExclusion={changeAnalyticsQaExclusion}
                    actionLoading={actionLoading}
                    canManageAnalyticsQa={canManageAnalyticsQa}
                    canManagePrivacy={canManagePrivacy}
                    canApproveDeletion={canApproveDeletion}
                  />}
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-slate-700">
                      <thead className="bg-gray-50 text-left text-xs font-normal uppercase tracking-wide text-slate-500 dark:bg-[var(--admin-surface-soft)] dark:text-slate-400">
                        <tr>
                          <th className="px-4 py-3">User</th>
                          <th className="px-4 py-3">Plan and AI</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Last sign in</th>
                          <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                        {paginatedUsers.map((item) => (
                          <tr key={item.id} className="align-middle">
                            <td className="px-4 py-3.5">
                              <div className="admin-user-cell">
                                <span className={`admin-avatar admin-tone-${getAvatarTone(item.id || item.email)}`} aria-hidden="true">{getInitials(item.fullName, item.email)}</span>
                                <div className="min-w-0">
                                  <div className="truncate font-medium leading-5 text-slate-950 dark:text-white">{item.email || 'No email'}</div>
                                  <div className="truncate text-xs leading-5 text-slate-500 dark:text-slate-400">{item.fullName || 'No name'} · {item.id}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3.5">
                              <StatusBadge tone={item.isPremium ? 'green' : 'gray'}>
                                {item.isPremium ? 'Premium' : 'Free'}
                              </StatusBadge>
                              {item.premiumPlan ? (
                                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                  {item.premiumPlan}{item.premiumUntil ? ` · until ${formatDateShort(item.premiumUntil)}` : ''}
                                </div>
                              ) : null}
                              <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                                {Number(item.aiGenerationsLimit) > 0 ? `${getRemainingAiGenerations(item)} AI left` : 'No AI allowance'}
                              </div>
                            </td>
                            <td className="px-4 py-3.5">
                              <div className="flex flex-wrap items-center gap-1.5">
                                {item.isAdmin && <StatusBadge tone="blue">{item.adminRole || 'Admin'}</StatusBadge>}
                                {item.isBanned ? <StatusBadge tone="red">Banned</StatusBadge> : <StatusBadge tone="green">Active</StatusBadge>}
                              </div>
                              {item.bannedReason && (
                                <div className="mt-1 max-w-48 whitespace-normal text-xs text-red-600 dark:text-red-300">{item.bannedReason}</div>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3.5 text-slate-600 dark:text-slate-300">
                              {item.lastSignInAt ? (
                                <>
                                  <div className="leading-5">{formatDateShort(item.lastSignInAt)}</div>
                                  <div className="text-xs leading-5 text-slate-500 dark:text-slate-400">{formatTimeShort(item.lastSignInAt)}</div>
                                </>
                              ) : <span className="leading-5">Never</span>}
                            </td>
                            <td className="px-4 py-3.5">
                              <div className="flex flex-nowrap items-center justify-end gap-1">
                                <button type="button" className={rowQuietClass} onClick={() => openCustomer(item.id)}>
                                  View details
                                </button>
                                {item.isPremium ? (
                                  <button type="button" className={rowQuietClass} disabled={actionLoading === `premium-${item.id}`} onClick={() => removePremium(item)}>
                                    Remove premium
                                  </button>
                                ) : (
                                  <button type="button" className={rowPrimaryClass} disabled={actionLoading === `premium-${item.id}`} onClick={() => grantPremium(item)}>
                                    <AdminIcon name="crown" />
                                    Give premium
                                  </button>
                                )}
                                <button type="button" className={`${rowQuietClass} admin-row-btn--icon`} disabled={actionLoading === `ai-limit-${item.id}`} onClick={() => editAiLimit(item)} aria-label="Set limit" title="Set AI limit">
                                  <AdminIcon name="gauge" />
                                </button>
                                <button type="button" className={`${rowQuietClass} admin-row-btn--icon`} disabled={actionLoading === `ban-${item.id}`} onClick={() => toggleBan(item)} aria-label={item.isBanned ? 'Unban' : 'Ban'} title={item.isBanned ? 'Unban user' : 'Ban user'}>
                                  <AdminIcon name={item.isBanned ? 'unlock' : 'ban'} />
                                </button>
                                <button type="button" className={`${rowDangerClass} admin-row-btn--icon`} disabled={actionLoading === `delete-${item.id}`} onClick={() => deleteUser(item)} aria-label="Delete" title="Queue account deletion">
                                  <AdminIcon name="trash" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {directoryState.available === true ? (
                    directoryState.nextCursor ? (
                      <div className="mt-4">
                        <button type="button" className={secondaryButtonClass} disabled={directoryState.loading} onClick={() => loadDirectory({ searchTerm: search, cursor: directoryState.nextCursor, append: true })}>{directoryState.loading ? 'Loading…' : 'Load more users'}</button>
                      </div>
                    ) : null
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
                <section className="admin-panel space-y-3">
                  <div>
                    <h2 className="text-xl font-normal">Client Errors</h2>
                  </div>
                  {paginatedErrors.map((item) => (
                    <div key={item.id} className="admin-list-item p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="flex min-w-0 gap-3.5">
                          <span className={`admin-kpi-icon ${item.resolved_at ? 'admin-tone-emerald' : item.severity === 'critical' ? 'admin-tone-rose' : 'admin-tone-amber'}`} aria-hidden="true">
                            <AdminIcon name={item.resolved_at ? 'check' : 'alert'} />
                          </span>
                          <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusBadge tone={item.resolved_at ? 'green' : item.severity === 'critical' ? 'red' : 'amber'}>
                              {item.resolved_at ? 'Resolved' : item.severity}
                            </StatusBadge>
                            <span className="text-xs text-slate-500 dark:text-slate-400">{formatDate(item.created_at)}</span>
                          </div>
                          <div className="mt-3 font-normal text-slate-950 dark:text-white">{item.message}</div>
                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.user_email || 'Anonymous'} · {item.source}</div>
                          {item.url && <div className="mt-1 break-all text-xs text-blue-600 dark:text-blue-300">{item.url}</div>}
                          {item.stack && (
                            <pre className="admin-code mt-3">{item.stack}</pre>
                          )}
                          </div>
                        </div>
                        {!item.resolved_at && (
                          <button type="button" className={secondaryButtonClass} disabled={actionLoading === `resolve-${item.id}`} onClick={() => resolveError(item.id)}>
                            <AdminIcon name="check" />
                            Resolve
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {errors.length === 0 && (
                    <div className="admin-empty">
                      <span className="admin-empty-icon admin-tone-emerald" aria-hidden="true"><AdminIcon name="check" /></span>
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
                <AdminAnalyticsPanel
                  adminRole={data?.admin?.role}
                  onReviewQuality={() => runAction(
                    'analytics-cohort-quality-review',
                    (idempotencyKey) => reviewAdminAnalyticsCohortQuality(idempotencyKey),
                    'QA exclusion review recorded.',
                  )}
                  onRebuildAggregates={(range) => runAction(
                    'analytics-daily-aggregate-rebuild',
                    (idempotencyKey) => rebuildAdminAnalyticsDailyAggregates(range, idempotencyKey),
                    'Daily analytics aggregates rebuilt.',
                  )}
                />
              )}

              {activeTab === 'admins' && (
                <section className="admin-panel space-y-5">
                  <div>
                    <h2 className="text-xl font-normal">Admin Access</h2>
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
                      <thead className="bg-gray-50 text-left text-xs font-normal uppercase tracking-wide text-slate-500 dark:bg-[var(--admin-surface-soft)] dark:text-slate-400">
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
                            <td className="px-4 py-4 font-normal">{member.email}</td>
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
                <section className="admin-panel space-y-3">
                  <div>
                    <h2 className="text-xl font-normal">Audit Log</h2>
                  </div>
                  {paginatedAudit.map((item) => (
                    <div key={item.id} className="admin-list-item p-4 text-sm">
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="admin-kpi-icon admin-tone-indigo" aria-hidden="true"><AdminIcon name="audit" /></span>
                          <div className="min-w-0">
                          <div className="font-medium text-slate-950 dark:text-white">{item.action}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            Admin {item.admin_user_id || 'unknown'} · Target {item.target_user_id || 'none'}
                          </div>
                          </div>
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{formatDate(item.created_at)}</div>
                      </div>
                      <pre className="admin-code mt-3">
                        {JSON.stringify(item.metadata || {}, null, 2)}
                      </pre>
                    </div>
                  ))}
                  {audit.length === 0 && (
                    <div className="admin-empty">
                      <span className="admin-empty-icon admin-tone-indigo" aria-hidden="true"><AdminIcon name="audit" /></span>
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

              {activeTab === 'settings' && <AdminSettingsPage />}
              {activeTab === 'feedback' && <AdminFeedbackPanel operators={adminMembers.filter((member) => member.is_active && member.user_id)} />}
        </>
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
