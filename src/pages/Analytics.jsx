import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getApplicationAnalytics, getResumePerformance } from '../services/applicationService';
import { getApplicationMetrics } from '../utils/applicationMetrics.js';
import { computeHuntStats } from '../utils/jobInboxDedupe.js';
import {
  connectJobInboxGmail,
  disconnectJobInboxGmail,
  getHuntStats,
  getJobInboxGmailConnection,
  syncJobInbox,
  undoApplicationStatusChange,
} from '../services/jobInboxService';
import Button from '../components/ui/Button';
import toast from 'react-hot-toast';

const EMPTY_ARRAY = [];
const AUTO_SCAN_KEY = 'resumeats.jobInbox.autoScanEnabled';
const AUTO_SCAN_MS = 30 * 60 * 1000;
const LAST_SYNC_KEY = 'resumeats.jobInbox.lastSyncAt';

const STATUS_COLOURS = {
  applied: 'bg-sky-500',
  screening: 'bg-amber-500',
  interview: 'bg-violet-500',
  offer: 'bg-emerald-500',
  rejected: 'bg-rose-500',
  withdrawn: 'bg-slate-400',
};

const STATUS_LABELS = {
  applied: 'Applied',
  screening: 'Screening',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

const pct = (num, denom) => (denom > 0 ? Math.round((num / denom) * 100) : 0);

const formatWeekLabel = (isoDate) => {
  const d = new Date(`${isoDate}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const timeAgo = (dateStr) => {
  if (!dateStr) return 'never';
  const diff = Date.now() - new Date(dateStr).getTime();
  if (!Number.isFinite(diff) || diff < 0) return 'just now';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
};

const readAutoScanEnabled = () => {
  try { return localStorage.getItem(AUTO_SCAN_KEY) === '1'; } catch { return false; }
};
const writeAutoScanEnabled = (enabled) => {
  try { localStorage.setItem(AUTO_SCAN_KEY, enabled ? '1' : '0'); } catch { /* ignore */ }
};
const readLastSyncAt = () => {
  try { return localStorage.getItem(LAST_SYNC_KEY) || ''; } catch { return ''; }
};
const writeLastSyncAt = (iso) => {
  try { localStorage.setItem(LAST_SYNC_KEY, iso); } catch { /* ignore */ }
};

const readOauthGmailHint = () => {
  try {
    const legacyHashQuery = window.location.hash.includes('?')
      ? window.location.hash.split('?').slice(1).join('?')
      : '';
    const params = new URLSearchParams(window.location.search || legacyHashQuery);
    if (params.get('gmail') !== 'connected') return null;
    const email = params.get('email');
    return { email: email || 'Connected', connected: true };
  } catch {
    return null;
  }
};

export function CurrentPipelineChart({ stages }) {
  const maxCount = Math.max(...stages.map((stage) => stage.count), 1);
  return (
    <div className="space-y-5">
      {stages.map((stage) => (
        <div key={stage.label}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <span className="text-xs font-medium text-gray-700 dark:text-slate-300">{stage.label}</span>
            <span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-slate-100">{stage.count}</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-blue-50 dark:bg-slate-700/70" aria-hidden="true">
            <div className="h-full rounded-full bg-blue-500 dark:bg-blue-400" style={{ width: `${(stage.count / maxCount) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function WeeklyActivityChart({ weeks }) {
  const maxCount = Math.max(...weeks.map((week) => week.count), 1);
  const summary = weeks.length
    ? `Applications by week: ${weeks.map((week) => `${formatWeekLabel(week.week)}, ${week.count}`).join('; ')}`
    : 'Applications by week: no applications in this range';
  return (
    <div className="space-y-2" role="img" aria-label={summary}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Applications</p>
      <div className="flex items-end gap-3">
        {weeks.map((week) => (
          <div key={week.week} className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <span className="text-xs font-medium tabular-nums text-slate-700 dark:text-slate-200">{week.count}</span>
            <div className="relative w-full" style={{ height: '8rem' }} aria-hidden="true">
              <div className="absolute bottom-0 w-full rounded-t-md bg-blue-500 dark:bg-blue-400" style={{ height: `${(week.count / maxCount) * 100}%` }} />
            </div>
            <span className="w-full truncate text-center text-[11px] text-slate-500">{formatWeekLabel(week.week)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value, detail }) {
  return (
    <div className="min-w-[8.5rem] flex-1 px-5 py-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-blue-700/80 dark:text-blue-300">{label}</p>
      <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-gray-900 dark:text-slate-100">{value}</p>
      {detail ? <p className="mt-1.5 text-xs leading-5 text-gray-500 dark:text-slate-400">{detail}</p> : null}
    </div>
  );
}

const Analytics = () => {
  const { user, loading: authLoading } = useAuth();
  const [analyticsData, setAnalyticsData] = useState(null);
  const [resumeData, setResumeData] = useState(null);
  const [huntStats, setHuntStats] = useState(() => computeHuntStats([]));
  const [gmailConnection, setGmailConnection] = useState(() => readOauthGmailHint());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [autoScan, setAutoScan] = useState(() => readAutoScanEnabled());
  const [lastSyncAt, setLastSyncAt] = useState(() => readLastSyncAt());
  const [lastSyncSummary, setLastSyncSummary] = useState('');
  const syncInFlight = useRef(false);

  const loadDashboard = useCallback(async ({ quiet = false } = {}) => {
    if (!user) return;
    if (!quiet) setLoading(true);
    setError('');
    try {
      const [analyticsResult, resumeResult, connectionResult] = await Promise.all([
        getApplicationAnalytics(),
        getResumePerformance(),
        getJobInboxGmailConnection(),
      ]);
      if (analyticsResult.error || resumeResult.error) {
        throw new Error('Analytics could not be loaded. Your data has not been changed.');
      }
      const applicationRows = analyticsResult.applications || [];
      const statsResult = await getHuntStats(applicationRows);
      setAnalyticsData(analyticsResult);
      setResumeData(resumeResult.data);
      setGmailConnection(connectionResult.data || null);
      setHuntStats(statsResult.data || computeHuntStats(applicationRows));
    } catch {
      setError('Analytics could not be loaded. Please try again.');
      toast.error('Something went wrong loading analytics');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    (async () => { if (!cancelled) await loadDashboard(); })();
    return () => { cancelled = true; };
  }, [user, retryKey, loadDashboard]);

  useEffect(() => {
    const legacyHashQuery = window.location.hash.includes('?')
      ? window.location.hash.split('?').slice(1).join('?')
      : '';
    const params = new URLSearchParams(window.location.search || legacyHashQuery);
    const gmailStatus = params.get('gmail');
    if (!gmailStatus) return;
    if (gmailStatus === 'connected') {
      const email = params.get('email');
      // Show connected immediately so the header doesn't flash "not connected" while data loads.
      setGmailConnection((prev) => prev || { email: email || 'Connected', connected: true });
      toast.success(email ? `Gmail connected (${email})` : 'Gmail connected');
      void getJobInboxGmailConnection().then(({ data }) => {
        if (data) setGmailConnection(data);
      });
    } else if (gmailStatus === 'error') {
      toast.error(`Gmail connection failed: ${params.get('reason') || 'unknown error'}`);
    }
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.hash.split('?')[0] || ''}`);
  }, []);

  const runSync = useCallback(async ({ silent = false } = {}) => {
    if (syncInFlight.current) return;
    syncInFlight.current = true;
    setSyncing(true);
    try {
      const { data, error: syncError } = await syncJobInbox();
      if (syncError) throw syncError;
      const now = new Date().toISOString();
      writeLastSyncAt(now);
      setLastSyncAt(now);
      setLastSyncSummary(`Scanned ${data?.scanned || 0} · ${data?.newEvents || 0} new · ${data?.updatedApplications || 0} updated`);
      if (data?.stats) setHuntStats(data.stats);
      await loadDashboard({ quiet: true });
      const changes = Array.isArray(data?.statusChanges) ? data.statusChanges : [];
      if (!silent && changes.length > 0) {
        const first = changes[0];
        toast.success((t) => (
          <span className="flex flex-col gap-1">
            <span>Updated {changes.length} status{changes.length === 1 ? '' : 'es'} from email.</span>
            {first?.applicationId ? (
              <button
                type="button"
                className="text-left text-xs font-semibold underline"
                onClick={async () => {
                  toast.dismiss(t.id);
                  const { error: undoError } = await undoApplicationStatusChange(first.applicationId);
                  if (undoError) toast.error(undoError.message || 'Undo failed');
                  else { toast.success('Status restored'); void loadDashboard({ quiet: true }); }
                }}
              >
                Undo last change
              </button>
            ) : null}
          </span>
        ), { duration: 8000 });
      } else if (!silent) {
        toast.success(data?.success === false ? (data.error || 'Sync finished with limits') : 'Inbox synced');
      }
    } catch (err) {
      if (!silent) toast.error(err.message || 'Inbox sync failed');
    } finally {
      syncInFlight.current = false;
      setSyncing(false);
    }
  }, [loadDashboard]);

  useEffect(() => {
    if (!user || !autoScan || !gmailConnection) return undefined;
    const id = window.setInterval(() => { void runSync({ silent: true }); }, AUTO_SCAN_MS);
    return () => window.clearInterval(id);
  }, [user, autoScan, gmailConnection, runSync]);

  const handleConnect = async () => {
    const { data, error: connectError } = await connectJobInboxGmail({ returnPath: '/analytics' });
    if (connectError || !data?.url) {
      toast.error(connectError?.message || 'Could not start Gmail connection.');
      return;
    }
    window.location.assign(data.url);
  };

  const handleDisconnect = async () => {
    const { error: disconnectError } = await disconnectJobInboxGmail();
    if (disconnectError) {
      toast.error(disconnectError.message || 'Could not disconnect Gmail.');
      return;
    }
    setGmailConnection(null);
    setAutoScan(false);
    writeAutoScanEnabled(false);
    toast.success('Gmail disconnected');
  };

  const toggleAutoScan = () => {
    if (!gmailConnection) {
      toast.error('Connect Gmail before enabling auto-scan.');
      return;
    }
    const next = !autoScan;
    setAutoScan(next);
    writeAutoScanEnabled(next);
    toast.success(next ? 'Auto-scan on — about every 30 minutes while this page is open' : 'Auto-scan off');
  };

  const weeklyData = analyticsData?.weeklyData ?? EMPTY_ARRAY;
  const recentApplications = analyticsData?.recentApplications ?? EMPTY_ARRAY;
  const metrics = analyticsData?.metrics || getApplicationMetrics();
  const { totalApplications, statusCounts, responseCount, interviewCount, offerCount } = metrics;

  const funnelStages = useMemo(() => [
    { label: 'Awaiting reply', count: statusCounts.applied || 0 },
    { label: 'Screening', count: statusCounts.screening || 0 },
    { label: 'Interview', count: statusCounts.interview || 0 },
    { label: 'Offer', count: offerCount },
  ], [statusCounts, offerCount]);

  const sortedResumes = useMemo(
    () => [...(resumeData || [])].sort((a, b) => b.response_rate - a.response_rate),
    [resumeData],
  );
  const recentActivity = useMemo(() => recentApplications.slice(-8).reverse(), [recentApplications]);

  if (authLoading) {
    return (
      <div className="app-loading-viewport">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-blue-500" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="app-page max-w-lg text-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Analytics</h1>
        <p className="mt-3 text-gray-600 dark:text-slate-400">Sign in to see reply rate, interviews, and resume performance.</p>
        <Link to="/signin" className="mt-6 inline-flex min-h-12 items-center rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700">Sign in</Link>
      </div>
    );
  }

  if (!loading && error) {
    return (
      <div className="app-page max-w-2xl">
        <h1 className="mb-4 text-3xl font-bold text-gray-900 dark:text-slate-100">Analytics</h1>
        <p role="alert" className="mb-4 text-red-700 dark:text-red-300">{error}</p>
        <button type="button" onClick={() => setRetryKey((v) => v + 1)} className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700">Try again</button>
      </div>
    );
  }

  const card = 'rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800';
  const showInitialSkeleton = loading && !analyticsData;

  return (
    <div className="app-page max-w-6xl">
      <header className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
            Outcomes
          </span>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-gray-900 dark:text-slate-100 md:text-3xl">Analytics</h1>
          <p className="mt-2 text-base leading-relaxed text-gray-600 dark:text-slate-400">
            Reply rate, interviews, and which resume is working. Manage the list on Applications.
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 lg:items-end">
          <div className="flex flex-wrap gap-2">
            {gmailConnection ? (
              <>
                <Button variant="primary" size="sm" onClick={() => runSync()} disabled={syncing || showInitialSkeleton}>
                  {syncing ? 'Scanning…' : 'Scan inbox now'}
                </Button>
                <Button variant="outline" size="sm" onClick={toggleAutoScan} disabled={syncing || showInitialSkeleton}>
                  {autoScan ? 'Auto-scan on' : 'Auto-scan off'}
                </Button>
                <Button variant="outline" size="sm" onClick={handleDisconnect} disabled={syncing || showInitialSkeleton}>
                  Disconnect
                </Button>
              </>
            ) : (
              <Button variant="primary" size="sm" onClick={handleConnect} disabled={syncing || showInitialSkeleton}>Connect Gmail</Button>
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-slate-400">
            {gmailConnection ? (gmailConnection.email || 'Gmail connected') : 'Gmail not connected'}
            {' · '}
            Last sync {timeAgo(lastSyncAt)}
            {lastSyncSummary ? ` · ${lastSyncSummary}` : ''}
            {syncing ? ' · Scanning inbox…' : ''}
          </p>
        </div>
      </header>

      {showInitialSkeleton ? (
        <div role="status" aria-live="polite" aria-busy="true" className="space-y-6">
          <div className={`flex items-center gap-3 px-5 py-4 ${card}`}>
            <div className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Loading analytics…</p>
              <p className="text-xs text-gray-500 dark:text-slate-400">Pulling applications, resume stats, and Gmail status.</p>
            </div>
            <span className="sr-only">Loading analytics</span>
          </div>
          <div className={`overflow-hidden ${card}`}>
            <div className="grid grid-cols-2 gap-px bg-gray-100 dark:bg-slate-700 sm:grid-cols-3 lg:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="space-y-3 bg-white px-5 py-5 dark:bg-slate-800">
                  <div className="h-3 w-16 animate-pulse rounded bg-blue-50 dark:bg-slate-700" />
                  <div className="h-8 w-12 animate-pulse rounded bg-gray-100 dark:bg-slate-700" />
                  <div className="h-3 w-24 animate-pulse rounded bg-gray-100 dark:bg-slate-700" />
                </div>
              ))}
            </div>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className={`${card} space-y-4 p-6`}>
              <div className="h-5 w-40 animate-pulse rounded bg-gray-100 dark:bg-slate-700" />
              <div className="h-3 w-56 animate-pulse rounded bg-gray-100 dark:bg-slate-700" />
              <div className="mt-6 space-y-5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <div className="h-3 w-full animate-pulse rounded bg-gray-100 dark:bg-slate-700" />
                    <div className="h-3 w-full animate-pulse rounded-full bg-blue-50 dark:bg-slate-700" />
                  </div>
                ))}
              </div>
            </div>
            <div className={`${card} space-y-4 p-6`}>
              <div className="h-5 w-44 animate-pulse rounded bg-gray-100 dark:bg-slate-700" />
              <div className="h-3 w-48 animate-pulse rounded bg-gray-100 dark:bg-slate-700" />
              <div className="mt-6 flex h-32 items-end gap-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex-1 animate-pulse rounded-t-md bg-blue-100 dark:bg-slate-700" style={{ height: `${40 + (i % 3) * 20}%` }} />
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <section className={`overflow-hidden ${card}`}>
            <div className="flex flex-wrap divide-x divide-y divide-gray-100 dark:divide-slate-700">
              <Metric label="Applied" value={huntStats.totalApplied} detail="Each company + role once" />
              <Metric label="Replies" value={huntStats.gotReply} detail={`${huntStats.replyRate}% reply rate`} />
              <Metric label="Interviews" value={huntStats.interviews} detail={`${huntStats.interviewRate}% interview rate`} />
              <Metric label="Waiting" value={huntStats.waiting} />
              <Metric label="Rejections" value={huntStats.rejections} />
              <Metric label="Offers" value={huntStats.offers} />
            </div>
            <p className="border-t border-gray-100 bg-blue-50/40 px-5 py-3 text-sm text-gray-600 dark:border-slate-700 dark:bg-blue-950/20 dark:text-slate-300">
              {responseCount} of {totalApplications} submitted applications have a response. {interviewCount} reached interview or offer.
              {' '}
              <Link to="/applications" className="font-semibold text-blue-700 hover:text-blue-800 dark:text-blue-300">Open Applications</Link>
            </p>
          </section>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <section className={`${card} p-6`}>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Where things sit now</h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">Current stage, not a historical funnel.</p>
              <div className="mt-6">
                {totalApplications === 0
                  ? <p className="py-10 text-sm text-slate-500">No submitted applications yet.</p>
                  : <CurrentPipelineChart stages={funnelStages} />}
              </div>
            </section>
            <section className={`${card} p-6`}>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Applications by week</h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">Submitted in the last 30 days.</p>
              <div className="mt-6">
                {weeklyData.length === 0
                  ? <p className="py-10 text-sm text-slate-500">No recent application data to chart.</p>
                  : <WeeklyActivityChart weeks={weeklyData} />}
              </div>
            </section>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <section className={`${card} p-6`}>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Status mix</h2>
              {totalApplications === 0 ? (
                <p className="mt-6 text-sm text-slate-500">No data yet.</p>
              ) : (
                <ul className="mt-5 space-y-3">
                  {Object.entries(statusCounts)
                    .filter(([, count]) => count > 0)
                    .sort(([, a], [, b]) => b - a)
                    .map(([status, count]) => (
                      <li key={status} className="grid grid-cols-[7rem_1fr_2.5rem_2.5rem] items-center gap-3 text-sm">
                        <span className="flex items-center gap-2 text-gray-700 dark:text-slate-300">
                          <span className={`h-2 w-2 rounded-full ${STATUS_COLOURS[status] || 'bg-slate-400'}`} />
                          {STATUS_LABELS[status] || status}
                        </span>
                        <span className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-slate-700">
                          <span className={`block h-full ${STATUS_COLOURS[status] || 'bg-slate-400'}`} style={{ width: `${pct(count, totalApplications)}%` }} />
                        </span>
                        <span className="text-right tabular-nums">{count}</span>
                        <span className="text-right text-xs text-slate-500">{pct(count, totalApplications)}%</span>
                      </li>
                    ))}
                </ul>
              )}
            </section>

            <section className={`${card} p-6`}>
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Resume performance</h2>
                <Link to="/applications" className="text-sm font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-300">Applications</Link>
              </div>
              {sortedResumes.length === 0 ? (
                <p className="mt-6 text-sm text-slate-500">No resume performance data yet.</p>
              ) : (
                <table className="mt-4 w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500 dark:border-slate-700">
                      <th className="pb-2 font-medium">Resume</th>
                      <th className="pb-2 text-right font-medium">Apps</th>
                      <th className="pb-2 text-right font-medium">Reply</th>
                      <th className="pb-2 text-right font-medium">Interviews</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedResumes.map((resume) => (
                      <tr key={resume.resume_id || 'none'} className="border-b border-gray-100 last:border-0 dark:border-slate-700">
                        <td className="py-3 pr-3">
                          {resume.resume_id ? (
                            <Link to={`/builder/${resume.resume_id}`} className="font-medium text-blue-600 hover:text-blue-800 dark:text-blue-300">{resume.resume_title}</Link>
                          ) : (
                            <span className="text-gray-500 dark:text-slate-400">{resume.resume_title}</span>
                          )}
                        </td>
                        <td className="py-3 text-right tabular-nums">{resume.total_applications}</td>
                        <td className="py-3 text-right tabular-nums">{resume.response_rate}%</td>
                        <td className="py-3 text-right tabular-nums">{resume.interviews}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>

          <section className={`mt-6 ${card} p-6`}>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Latest submitted roles</h2>
            {recentActivity.length === 0 ? (
              <p className="mt-4 text-sm text-gray-500 dark:text-slate-400">Nothing submitted yet.</p>
            ) : (
              <ul className="mt-4 divide-y divide-gray-100 dark:divide-slate-700">
                {recentActivity.map((app) => (
                  <li key={app.id} className="flex items-baseline justify-between gap-4 py-3">
                    <p className="min-w-0 truncate text-sm text-gray-900 dark:text-slate-100">
                      <span className="font-semibold">{app.company}</span>
                      <span className="text-gray-500 dark:text-slate-400"> · {app.position}</span>
                    </p>
                    <p className="shrink-0 text-xs font-medium text-blue-700 dark:text-blue-300">{STATUS_LABELS[app.status] || app.status} · {timeAgo(app.applied_at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
};

export default Analytics;
