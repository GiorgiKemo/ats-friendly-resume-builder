import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { Pagination } from '../components/ui';
import {
  deleteAdminUser,
  fetchAdminAnalytics,
  fetchAdminAnalyticsCsv,
  fetchAdminOverview,
  grantAdminAccess,
  resolveClientError,
  revokeAdminAccess,
  setUserAiLimit,
  setUserBan,
  setUserPremium,
} from '../services/adminService';

const tabs = [
  { id: 'users', label: 'Users' },
  { id: 'errors', label: 'Errors' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'admins', label: 'Admins' },
  { id: 'audit', label: 'Audit' },
];

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

const getRemainingAiGenerations = (user) => Math.max(
  0,
  Number(user?.aiGenerationsLimit || 0) - Number(user?.aiGenerationsUsed || 0),
);

const StatCard = ({ label, value, caption }) => (
  <div className={`${cardClass} p-5`}>
    <div className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</div>
    <div className="mt-2 text-3xl font-bold text-slate-950 dark:text-white">{value ?? 0}</div>
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

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('users');
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminRole, setAdminRole] = useState('admin');
  const [accessError, setAccessError] = useState('');
  const [pages, setPages] = useState({
    users: 1,
    errors: 1,
    admins: 1,
    audit: 1,
  });

  const loadOverview = async () => {
    setLoading(true);
    setAccessError('');
    try {
      const result = await fetchAdminOverview();
      setData(result);
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
  }, [authLoading, user, navigate]);

  const analytics = data?.analytics || {};
  const canManageAdmins = data?.admin?.role === 'owner';

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    const users = data?.users || [];
    if (!query) return users;
    return users.filter((item) => (
      item.email?.toLowerCase().includes(query) ||
      item.fullName?.toLowerCase().includes(query) ||
      item.id?.toLowerCase().includes(query)
    ));
  }, [data?.users, search]);

  const errors = useMemo(() => data?.errors || [], [data?.errors]);
  const adminMembers = useMemo(() => data?.adminMembers || [], [data?.adminMembers]);
  const audit = useMemo(() => data?.audit || [], [data?.audit]);
  const usersTotalPages = getTotalPages(filteredUsers, adminPageSizes.users);
  const errorsTotalPages = getTotalPages(errors, adminPageSizes.errors);
  const adminsTotalPages = getTotalPages(adminMembers, adminPageSizes.admins);
  const auditTotalPages = getTotalPages(audit, adminPageSizes.audit);
  const paginatedUsers = useMemo(
    () => paginate(filteredUsers, pages.users, adminPageSizes.users),
    [filteredUsers, pages.users],
  );
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

  const runAction = async (key, task, successMessage) => {
    setActionLoading(key);
    try {
      const result = await task();
      setData(result);
      toast.success(successMessage);
    } catch (error) {
      toast.error(error.message || 'Admin action failed');
    } finally {
      setActionLoading('');
    }
  };

  const grantPremium = (target) => {
    const days = window.prompt('Premium duration in days', '30');
    if (days === null) return;
    const numericDays = Number(days);
    if (!Number.isFinite(numericDays) || numericDays <= 0) {
      toast.error('Enter a valid number of days');
      return;
    }

    const aiLimit = window.prompt('Monthly AI generation limit', `${target.aiGenerationsLimit || 30}`);
    if (aiLimit === null) return;
    const numericLimit = Number(aiLimit);
    if (!Number.isFinite(numericLimit) || numericLimit <= 0) {
      toast.error('Enter a valid AI limit');
      return;
    }

    const premiumUntil = new Date(Date.now() + numericDays * 24 * 60 * 60 * 1000).toISOString();
    runAction(
      `premium-${target.id}`,
      () => setUserPremium({
        userId: target.id,
        premium: true,
        plan: 'premium_manual',
        aiLimit: numericLimit,
        premiumUntil,
      }),
      'Premium access granted',
    );
  };

  const removePremium = (target) => {
    if (!window.confirm(`Remove premium from ${target.email}?`)) return;
    runAction(
      `premium-${target.id}`,
      () => setUserPremium({ userId: target.id, premium: false }),
      'Premium access removed',
    );
  };

  const editAiLimit = (target) => {
    const aiLimit = window.prompt('Monthly AI generation limit', `${target.aiGenerationsLimit || 0}`);
    if (aiLimit === null) return;
    const numericLimit = Number(aiLimit);
    if (!Number.isInteger(numericLimit) || numericLimit < 0) {
      toast.error('Enter a whole-number AI limit of 0 or higher');
      return;
    }

    const resetUsage = window.confirm(
      `Reset current usage for ${target.email} from ${target.aiGenerationsUsed || 0} to 0? Choose Cancel to keep usage as-is.`,
    );

    runAction(
      `ai-limit-${target.id}`,
      () => setUserAiLimit({
        userId: target.id,
        aiLimit: numericLimit,
        resetUsage,
      }),
      'AI usage limit updated',
    );
  };

  const toggleBan = (target) => {
    if (target.isBanned) {
      if (!window.confirm(`Unban ${target.email}?`)) return;
      runAction(
        `ban-${target.id}`,
        () => setUserBan({ userId: target.id, banned: false }),
        'User unbanned',
      );
      return;
    }

    const reason = window.prompt(`Reason for banning ${target.email}`, 'Policy violation');
    if (reason === null) return;
    runAction(
      `ban-${target.id}`,
      () => setUserBan({ userId: target.id, banned: true, reason }),
      'User banned',
    );
  };

  const deleteUser = (target) => {
    const confirmation = window.prompt(`Type DELETE to soft-delete ${target.email}`);
    if (confirmation !== 'DELETE') return;
    runAction(
      `delete-${target.id}`,
      () => deleteAdminUser(target.id),
      'User deleted',
    );
  };

  const resolveError = (errorId) => {
    runAction(
      `resolve-${errorId}`,
      () => resolveClientError(errorId),
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
      () => grantAdminAccess({ email: adminEmail.trim(), role: adminRole }),
      'Admin access updated',
    );
    setAdminEmail('');
  };

  const revokeAdmin = (member) => {
    if (!window.confirm(`Revoke admin access for ${member.email}?`)) return;
    runAction(
      `revoke-${member.id}`,
      () => revokeAdminAccess(member.id),
      'Admin access revoked',
    );
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
    <div className="app-page text-slate-900 dark:text-slate-100">
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
              <div className="flex flex-wrap gap-2 border-b border-gray-200 p-3 dark:border-slate-700">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                      activeTab === tab.id
                        ? 'bg-blue-600 text-white dark:bg-blue-500'
                        : 'text-slate-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-700'
                    }`}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

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
                  <Pagination
                    currentPage={pages.users}
                    totalPages={usersTotalPages}
                    onPageChange={(page) => setTabPage('users', page)}
                    totalItems={filteredUsers.length}
                    pageSize={adminPageSizes.users}
                    itemLabel="users"
                    className="mt-4 rounded-2xl"
                  />
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
                      Only owners can grant or revoke admin access. Roles are stored in app metadata and the server-side allowlist.
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
                        Grant Access
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
                            <td className="px-4 py-4">{member.role}</td>
                            <td className="px-4 py-4">
                              <StatusBadge tone={member.is_active ? 'green' : 'gray'}>
                                {member.is_active ? 'Active' : 'Inactive'}
                              </StatusBadge>
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
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
