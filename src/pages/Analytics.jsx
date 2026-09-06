import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getApplicationAnalytics, getResumePerformance } from '../services/applicationService';
import { getApplicationMetrics } from '../utils/applicationMetrics.js';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';

const EMPTY_ARRAY = [];

// ─── Animation helpers ───────────────────────────────────────────────
const cardVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: 'easeOut', delay: i * 0.08 },
  }),
};

const sectionVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
};

// ─── Status colour map ───────────────────────────────────────────────
const STATUS_COLOURS = {
  applied: 'bg-blue-500 dark:bg-blue-400',
  screening: 'bg-purple-500',
  interview: 'bg-indigo-500',
  offer: 'bg-green-500',
  rejected: 'bg-red-500',
  withdrawn: 'bg-gray-400',
};

const STATUS_LABELS = {
  applied: 'Applied',
  screening: 'Screening',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

// ─── Skeleton loaders ────────────────────────────────────────────────
const SkeletonCard = () => (
  <div className="bg-white dark:bg-slate-800 rounded-xl shadow p-6 animate-pulse">
    <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded w-1/3 mb-4" />
    <div className="h-8 bg-gray-200 dark:bg-slate-700 rounded w-1/2" />
  </div>
);

const SkeletonSection = ({ rows = 4 }) => (
  <div className="bg-white dark:bg-slate-800 rounded-xl shadow p-6 animate-pulse space-y-4">
    <div className="h-5 bg-gray-200 dark:bg-slate-700 rounded w-1/4" />
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="h-4 bg-gray-200 dark:bg-slate-700 rounded" style={{ width: `${80 - i * 10}%` }} />
    ))}
  </div>
);

// ─── Helpers ─────────────────────────────────────────────────────────
const pct = (num, denom) => (denom > 0 ? Math.round((num / denom) * 100) : 0);

const formatWeekLabel = (isoDate) => {
  const d = new Date(isoDate + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const timeAgo = (dateStr) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
};

export function CurrentPipelineChart({ stages }) {
  const maxCount = Math.max(...stages.map((stage) => stage.count), 1);
  return (
    <div className="space-y-4">
      {stages.map((stage) => (
        <div key={stage.label} className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-700 dark:text-slate-300 w-24 shrink-0">{stage.label}</span>
          <div className="flex-1 bg-gray-100 dark:bg-slate-700/70 rounded-full h-8 overflow-hidden" aria-hidden="true">
            <div className="h-full rounded-full bg-blue-500 dark:bg-blue-400" style={{ width: `${(stage.count / maxCount) * 100}%` }} />
          </div>
          <span className="w-8 text-right text-sm font-semibold">{stage.count}</span>
        </div>
      ))}
    </div>
  );
}

export function WeeklyActivityChart({ weeks }) {
  const maxCount = Math.max(...weeks.map((week) => week.count), 1);
  return (
    <div className="flex items-end gap-2">
      {weeks.map((week) => (
        <div key={week.week} className="flex-1 flex flex-col items-center gap-1 min-w-0">
          <span className="text-xs font-medium text-gray-700 dark:text-slate-300">{week.count}</span>
          <div className="relative w-full" style={{ height: '8rem' }} aria-hidden="true">
            <div className="absolute bottom-0 w-full rounded-t-md bg-blue-500 dark:bg-blue-400" style={{ height: `${(week.count / maxCount) * 100}%` }} />
          </div>
          <span className="text-[10px] text-gray-500 dark:text-slate-400 truncate w-full text-center">{formatWeekLabel(week.week)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────
const Analytics = () => {
  const { user, loading: authLoading } = useAuth();

  const [analyticsData, setAnalyticsData] = useState(null);
  const [resumeData, setResumeData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryKey, setRetryKey] = useState(0);

  // ── Fetch data on mount ──────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    if (!user) {
      return () => {
        cancelled = true;
      };
    }

    const fetchData = async () => {
      setLoading(true);
      setError('');
      try {
        const [analyticsResult, resumeResult] = await Promise.all([
          getApplicationAnalytics(),
          getResumePerformance(),
        ]);

        if (cancelled) return;

        if (analyticsResult.error || resumeResult.error) throw new Error('Analytics could not be loaded. Your data has not been changed.');

        setAnalyticsData(analyticsResult);
        setResumeData(resumeResult.data);
      } catch {
        if (!cancelled) {
          setError('Analytics could not be loaded. Please try again.');
          toast.error('Something went wrong loading analytics');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [user, retryKey]);

  // ── Derived data ─────────────────────────────────────────────────
  const weeklyData = analyticsData?.weeklyData ?? EMPTY_ARRAY;
  const recentApplications = analyticsData?.recentApplications ?? EMPTY_ARRAY;
  const { totalApplications, savedCount, statusCounts, responseCount, responseRate, interviewCount, offerCount } = analyticsData?.metrics || getApplicationMetrics();

  // This is a current-stage snapshot, not historical stage conversion. The
  // tracker does not retain a complete event history for each application.
  const funnelStages = useMemo(() => [
    { label: 'Awaiting reply', count: statusCounts.applied || 0 },
    { label: 'Screening', count: statusCounts.screening || 0 },
    { label: 'Interview', count: statusCounts.interview || 0 },
    { label: 'Offer', count: offerCount },
  ], [statusCounts, offerCount]);

  // Resume performance sorted by response rate desc
  const sortedResumes = useMemo(
    () =>
      [...(resumeData || [])].sort((a, b) => b.response_rate - a.response_rate),
    [resumeData],
  );

  // Recent activity (last 10)
  const recentActivity = useMemo(
    () => recentApplications.slice(-10).reverse(),
    [recentApplications],
  );

  // Insights
  const insights = useMemo(() => {
    const tips = [];

    if (totalApplications === 0) return tips;

    // Response rate insight
    if (responseRate < 25) {
      tips.push({
        type: 'warning',
        text: `Your response rate is ${responseRate}%. Consider tailoring your resume and cover letter more closely to each job description.`,
      });
    } else if (responseRate >= 50) {
      tips.push({
        type: 'success',
        text: `${responseCount} of your ${totalApplications} submitted applications have a recorded response or a response-stage status. Keep your tracker up to date to make this useful.`,
      });
    } else {
      tips.push({
        type: 'info',
        text: `Your response rate is ${responseRate}%. Focus on quality over quantity - customizing your resume for each role can push this higher.`,
      });
    }

    // Pending applications insight
    const pendingCount = statusCounts.applied || 0;
    if (pendingCount > 5) {
      tips.push({
        type: 'info',
        text: `You have ${pendingCount} applications still in "Applied" status. Consider following up on ones older than 2 weeks.`,
      });
    }

    // Interview conversion insight
    if (interviewCount > 0 && offerCount === 0) {
      tips.push({
        type: 'warning',
        text: 'You have interviews but no offers yet. Practice common interview questions and research each company before your next one.',
      });
    }

    // Volume insight
    if (totalApplications < 10) {
      tips.push({
        type: 'info',
        text: `You have ${totalApplications} submitted applications. Small samples can swing these rates considerably; look for patterns as you collect more outcomes.`,
      });
    }

    // Top resume insight
    if (sortedResumes.length > 1 && sortedResumes[0].response_rate > 0) {
      tips.push({
        type: 'success',
        text: `"${sortedResumes[0].resume_title}" is your best-performing resume with a ${sortedResumes[0].response_rate}% response rate. Consider using it as a template for future applications.`,
      });
    }

    return tips;
  }, [totalApplications, responseCount, responseRate, statusCounts, interviewCount, offerCount, sortedResumes]);

  // ── Auth guard ───────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="app-loading-viewport">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-lg text-center">
        <h2 className="text-2xl font-bold mb-4">Sign in to view analytics</h2>
        <p className="text-gray-600 dark:text-slate-400 mb-6">Track your job application performance and resume effectiveness.</p>
        <Link
          to="/signin"
          className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
        >
          Sign In
        </Link>
      </div>
    );
  }

  if (!loading && error) {
    return (
      <div className="app-page max-w-2xl">
        <h1 className="text-3xl font-bold mb-4">Analytics</h1>
        <p role="alert" className="mb-4 text-red-700 dark:text-red-300">{error}</p>
        <button type="button" onClick={() => setRetryKey((value) => value + 1)} className="rounded-lg bg-blue-600 px-4 py-3 text-white">Try again</button>
      </div>
    );
  }

  // ── Empty state ──────────────────────────────────────────────────
  if (!loading && totalApplications === 0) {
    return (
      <motion.div
        className="container mx-auto px-4 py-16 max-w-2xl text-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-10">
          <svg
            className="w-20 h-20 mx-auto text-gray-300 mb-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
          <h1 className="text-2xl font-bold mb-3">No Application Data Yet</h1>
          <p className="text-gray-600 dark:text-slate-400 mb-8">
            Start tracking your job applications to see performance analytics, resume insights, and application trends.
          </p>
          <Link
            to="/applications"
            className="inline-block bg-blue-600 text-white px-8 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Track an application
          </Link>
        </div>
      </motion.div>
    );
  }

  // ── Loading state ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-7xl space-y-8">
        <div className="h-8 bg-gray-200 dark:bg-slate-700 rounded w-48 animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SkeletonSection rows={5} />
          <SkeletonSection rows={6} />
        </div>
        <SkeletonSection rows={4} />
      </div>
    );
  }

  // ── Main render ──────────────────────────────────────────────────
  return (
    <motion.div
      className="container mx-auto px-4 py-8 max-w-7xl"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold">Analytics</h1>
          <p className="text-gray-600 dark:text-slate-400 mt-1">Track your job application performance</p>
        </div>
        <Link
          to="/dashboard"
          className="text-blue-600 hover:text-blue-700 dark:text-blue-400 font-medium flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Dashboard
        </Link>
      </div>

      {/* ─── Section 1: Overview Cards ──────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* Total Applications */}
        <motion.div
          className="bg-white dark:bg-slate-800 rounded-xl shadow hover:shadow-md dark:shadow-slate-700/30 transition-shadow p-6"
          custom={0}
          variants={cardVariants}
          initial="hidden"
          animate="visible"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-500 dark:text-slate-400">Total Applications</span>
            <span className="p-2 bg-blue-100 dark:bg-blue-500/10 rounded-lg">
              <svg className="w-5 h-5 text-blue-600 dark:text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </span>
          </div>
          <p className="text-3xl font-bold">{totalApplications}</p>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Submitted roles only; {savedCount} saved roles excluded</p>
        </motion.div>

        {/* Response Rate */}
        <motion.div
          className="bg-white dark:bg-slate-800 rounded-xl shadow hover:shadow-md dark:shadow-slate-700/30 transition-shadow p-6"
          custom={1}
          variants={cardVariants}
          initial="hidden"
          animate="visible"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-500 dark:text-slate-400">Response Rate</span>
            <span
              className={`p-2 rounded-lg ${
                responseRate >= 50
                  ? 'bg-green-100 dark:bg-green-500/10'
                  : responseRate >= 25
                  ? 'bg-yellow-100 dark:bg-yellow-500/10'
                  : 'bg-red-100 dark:bg-red-900/20'
              }`}
            >
              <svg
                className={`w-5 h-5 ${
                  responseRate >= 50
                    ? 'text-green-600 dark:text-green-300'
                    : responseRate >= 25
                    ? 'text-yellow-600 dark:text-yellow-300'
                    : 'text-red-600 dark:text-red-300'
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </span>
          </div>
          <p
            className={`text-3xl font-bold ${
              responseRate >= 50
                ? 'text-green-600 dark:text-green-300'
                : responseRate >= 25
                ? 'text-yellow-600 dark:text-yellow-300'
                : 'text-red-600 dark:text-red-300'
            }`}
          >
            {responseRate}%
          </p>
          <p className="text-xs text-gray-400 dark:text-slate-400 mt-1">{responseCount} of {totalApplications} have a response date or a screening, interview, offer, or rejection status</p>
        </motion.div>

        {/* Interviews Secured */}
        <motion.div
          className="bg-white dark:bg-slate-800 rounded-xl shadow hover:shadow-md dark:shadow-slate-700/30 transition-shadow p-6"
          custom={2}
          variants={cardVariants}
          initial="hidden"
          animate="visible"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-500 dark:text-slate-400">In Interview or Offer</span>
            <span className="p-2 bg-indigo-100 dark:bg-indigo-500/10 rounded-lg">
              <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </span>
          </div>
          <p className="text-3xl font-bold">{interviewCount}</p>
        </motion.div>

        {/* Offers Received */}
        <motion.div
          className="bg-white dark:bg-slate-800 rounded-xl shadow hover:shadow-md dark:shadow-slate-700/30 transition-shadow p-6"
          custom={3}
          variants={cardVariants}
          initial="hidden"
          animate="visible"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-500 dark:text-slate-400">Offers Received</span>
            <span className="p-2 bg-green-100 dark:bg-green-500/10 rounded-lg">
              <svg className="w-5 h-5 text-green-600 dark:text-green-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </span>
          </div>
          <p className="text-3xl font-bold">{offerCount}</p>
        </motion.div>
      </div>

      {/* ─── Section 2 & 3: Funnel + Weekly Activity ────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Application Funnel */}
        <motion.div
          className="bg-white dark:bg-slate-800 rounded-xl shadow p-6"
          variants={sectionVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-40px' }}
        >
          <h2 className="text-lg font-semibold mb-2">Current Pipeline</h2>
          <p className="text-sm text-gray-500 dark:text-slate-400 mb-5">Current stages, not historical conversion rates.</p>
          <CurrentPipelineChart stages={funnelStages} />
        </motion.div>

        {/* Weekly Application Activity */}
        <motion.div
          className="bg-white dark:bg-slate-800 rounded-xl shadow p-6"
          variants={sectionVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-40px' }}
        >
          <h2 className="text-lg font-semibold mb-5">Weekly Activity</h2>
          {weeklyData.length === 0 ? (
            <p className="text-gray-500 dark:text-slate-400 text-sm py-8 text-center">No recent application data to chart.</p>
          ) : (
            <WeeklyActivityChart weeks={weeklyData} />
          )}
        </motion.div>
      </div>

      {/* ─── Section 4: Resume Performance Table ────────────────── */}
      <motion.div
        className="bg-white dark:bg-slate-800 rounded-xl shadow p-6 mb-8 overflow-x-auto"
        variants={sectionVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-40px' }}
      >
        <h2 className="text-lg font-semibold mb-5">Resume Performance</h2>
        {sortedResumes.length === 0 ? (
          <p className="text-gray-500 dark:text-slate-400 text-sm py-4 text-center">No resume performance data available yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-slate-600 text-left">
                <th className="pb-3 font-medium text-gray-500 dark:text-slate-400">Resume</th>
                <th className="pb-3 font-medium text-gray-500 dark:text-slate-400 text-center">Applications</th>
                <th className="pb-3 font-medium text-gray-500 dark:text-slate-400 text-center">Responses</th>
                <th className="pb-3 font-medium text-gray-500 dark:text-slate-400 text-center">Response Rate</th>
                <th className="pb-3 font-medium text-gray-500 dark:text-slate-400 text-center">Interviews</th>
              </tr>
            </thead>
            <tbody>
              {sortedResumes.map((resume) => (
                <tr
                  key={resume.resume_id || 'none'}
                  className="border-b border-gray-100 dark:border-slate-700 last:border-0 hover:bg-gray-50 dark:bg-slate-900 dark:hover:bg-slate-700 transition-colors"
                >
                  <td className="py-3 pr-4">
                    {resume.resume_id ? (
                      <Link
                        to={`/builder/${resume.resume_id}`}
                        className="text-blue-600 hover:text-blue-700 dark:text-blue-400 font-medium hover:underline"
                      >
                        {resume.resume_title}
                      </Link>
                    ) : (
                      <span className="text-gray-500 dark:text-slate-400">{resume.resume_title}</span>
                    )}
                  </td>
                  <td className="py-3 text-center">{resume.total_applications}</td>
                  <td className="py-3 text-center">{resume.responses}</td>
                  <td className="py-3 text-center">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                        resume.response_rate >= 50
                          ? 'bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-300 border border-green-300 dark:border-green-700'
                          : resume.response_rate >= 25
                          ? 'bg-yellow-50 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300 border border-yellow-300 dark:border-yellow-700'
                          : 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300 border border-red-300 dark:border-red-700'
                      }`}
                    >
                      {resume.response_rate}%
                    </span>
                  </td>
                  <td className="py-3 text-center">{resume.interviews}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </motion.div>

      {/* ─── Section 5 & 6: Status Distribution + Recent Activity ─ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Status Distribution */}
        <motion.div
          className="bg-white dark:bg-slate-800 rounded-xl shadow p-6"
          variants={sectionVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-40px' }}
        >
          <h2 className="text-lg font-semibold mb-5">Status Distribution</h2>
          {totalApplications === 0 ? (
            <p className="text-gray-500 dark:text-slate-400 text-sm py-4 text-center">No data yet.</p>
          ) : (
            <>
              {/* Stacked bar */}
              <div className="flex h-6 rounded-full overflow-hidden mb-5">
                {Object.entries(statusCounts)
                  .filter(([, count]) => count > 0)
                  .map(([status, count]) => (
                    <div
                      key={status}
                      className={`${STATUS_COLOURS[status] || 'bg-gray-400'} transition-[width,background-color] duration-300 relative group`}
                      style={{ width: `${pct(count, totalApplications)}%`, minWidth: count > 0 ? '8px' : 0 }}
                    >
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-gray-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10">
                        {STATUS_LABELS[status] || status}: {count}
                      </div>
                    </div>
                  ))}
              </div>

              {/* Legend rows */}
              <div className="space-y-3">
                {Object.entries(statusCounts)
                  .filter(([, count]) => count > 0)
                  .sort(([, a], [, b]) => b - a)
                  .map(([status, count]) => (
                    <div key={status} className="flex items-center gap-3">
                      <span className={`w-3 h-3 rounded-full shrink-0 ${STATUS_COLOURS[status] || 'bg-gray-400'}`} />
                      <span className="text-sm text-gray-700 dark:text-slate-300 flex-1">
                        {STATUS_LABELS[status] || status}
                      </span>
                      <span className="text-sm font-medium text-gray-900 dark:text-slate-100">{count}</span>
                      <span className="text-xs text-gray-500 dark:text-slate-400 w-10 text-right">
                        {pct(count, totalApplications)}%
                      </span>
                    </div>
                  ))}
              </div>
            </>
          )}
        </motion.div>

        {/* Recent Activity Timeline */}
        <motion.div
          className="bg-white dark:bg-slate-800 rounded-xl shadow p-6"
          variants={sectionVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-40px' }}
        >
          <h2 className="text-lg font-semibold mb-5">Recent Applications</h2>
          {recentActivity.length === 0 ? (
            <p className="text-gray-500 dark:text-slate-400 text-sm py-4 text-center">No recent applications.</p>
          ) : (
            <div className="space-y-0">
              {recentActivity.map((app, idx) => (
                <div
                  key={app.id}
                  className={`flex items-start gap-3 py-3 ${
                    idx < recentActivity.length - 1 ? 'border-b border-gray-100 dark:border-slate-700' : ''
                  }`}
                >
                  {/* Timeline dot */}
                  <div className="mt-1.5 shrink-0">
                    <span
                      className={`block w-2.5 h-2.5 rounded-full ${
                        STATUS_COLOURS[app.status] || 'bg-gray-400'
                      }`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 dark:text-slate-100 leading-snug">
                      {app.status === 'applied' ? (
                        <>
                          Applied to{' '}
                          <span className="font-semibold">{app.company}</span> for{' '}
                          <span className="font-medium">{app.position}</span>
                        </>
                      ) : (
                        <>
                          Current status: {' '}
                          <span
                            className={`font-semibold ${
                              app.status === 'offer'
                                ? 'text-green-600'
                                : app.status === 'rejected'
                                ? 'text-red-600'
                                : 'text-blue-600'
                            }`}
                          >
                            {STATUS_LABELS[app.status] || app.status}
                          </span>{' '}
                          for{' '}
                          <span className="font-semibold">{app.company}</span>
                        </>
                      )}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-slate-400 mt-0.5">
                      Submitted {timeAgo(app.applied_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {/* ─── Section 7: Insights Panel ──────────────────────────── */}
      {insights.length > 0 && (
        <motion.div
          className="bg-white dark:bg-slate-800 rounded-xl shadow p-6"
          variants={sectionVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-40px' }}
        >
          <h2 className="text-lg font-semibold mb-5">Insights &amp; Tips</h2>
          <div className="space-y-4">
            {insights.map((insight, idx) => {
              const iconColour =
                insight.type === 'success'
                  ? 'text-green-500 bg-green-50'
                  : insight.type === 'warning'
                  ? 'text-yellow-500 bg-yellow-50 dark:bg-yellow-900/20'
                  : 'text-blue-500 bg-blue-50 dark:bg-blue-900/20';

              return (
                <div
                  key={idx}
                  className="flex items-start gap-3 p-4 rounded-lg bg-gray-50 dark:bg-slate-900"
                >
                  <span className={`p-1.5 rounded-lg shrink-0 ${iconColour}`}>
                    {insight.type === 'success' ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : insight.type === 'warning' ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                  </span>
                  <p className="text-sm text-gray-700 dark:text-slate-300 leading-relaxed">{insight.text}</p>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
};

export default Analytics;
