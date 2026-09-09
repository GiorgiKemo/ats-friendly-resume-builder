import { serve } from 'std/http/server.ts';
import { createClient } from 'supabase';
import { getCorsHeaders, isOriginAllowed } from '../_shared/cors.ts';

type AdminRole = 'owner' | 'admin' | 'support';

type AdminMember = {
  id: string;
  email: string;
  user_id: string | null;
  role: AdminRole;
  is_active: boolean;
  invitation_sent_at?: string | null;
  invitation_expires_at?: string | null;
  invitation_revoked_at?: string | null;
  invitation_delivery?: {
    status: string;
    attempts: number;
    last_error?: string | null;
    sent_at?: string | null;
    created_at: string;
  } | null;
  created_at: string;
  updated_at: string;
};

type AuthUser = {
  id: string;
  email?: string | null;
  app_metadata?: Record<string, unknown> | null;
  user_metadata?: Record<string, unknown> | null;
  created_at: string;
  last_sign_in_at?: string | null;
  email_confirmed_at?: string | null;
};

const supabaseUrl = Deno.env.get('SUPABASE_URL') || Deno.env.get('API_URL') || '';
const serviceRoleKey = Deno.env.get('SB_SECRET_KEY') ||
  Deno.env.get('SUPABASE_SECRET_KEY') ||
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
  Deno.env.get('SERVICE_ROLE_KEY') ||
  '';
const anonKey = Deno.env.get('SB_PUBLISHABLE_KEY') ||
  Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ||
  Deno.env.get('SUPABASE_ANON_KEY') ||
  Deno.env.get('ANON_KEY') ||
  '';

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

const authClient = createClient(supabaseUrl, anonKey, {
  auth: { persistSession: false },
});

const ADMIN_READ_ACTIONS = new Set(['overview', 'directory', 'analytics', 'analyticsCsv', 'customer', 'privacy', 'settings', 'billingActionPreview', 'jobOperations']);
const ADMIN_AAL2_ACTIONS = new Set([
  'setPremium',
  'setAiLimit',
  'banUser',
  'deleteUser',
  'approvePrivacyDeletion',
  'requestExport',
  'placePrivacyHold',
  'releasePrivacyHold',
  'cancelPrivacyDeletion',
  'recordProviderCancellationReview',
  'grantAdmin',
  'revokeAdmin',
  'updateAdminRole',
  'updateSupportAiSettings',
  'updateSupportRoutingSettings',
  'resetSupportAiCircuit',
  'rollbackSupportAiSettings',
  'createBillingActionIntent',
  'autoApplyJobAction',
]);
const adminRateBuckets = new Map<string, { startedAt: number; count: number }>();
const ADMIN_RATE_WINDOW_MS = 60_000;
const ADMIN_RATE_LIMIT = 60;
const ADMIN_BODY_LIMIT = 32 * 1024;

const consumeAdminRateLimit = (actorId: string) => {
  const now = Date.now();
  const current = adminRateBuckets.get(actorId);
  if (!current || now - current.startedAt >= ADMIN_RATE_WINDOW_MS) {
    adminRateBuckets.set(actorId, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= ADMIN_RATE_LIMIT) return false;
  current.count += 1;
  return true;
};

const jsonResponse = (body: Record<string, unknown>, status: number, origin: string | null) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...getCorsHeaders(origin),
    },
  });

const normalizeEmail = (value = '') => value.trim().toLowerCase();

const sanitizeString = (value: unknown, fallback = '') =>
  typeof value === 'string' ? value.trim() : fallback;

const stableSerialize = (value: unknown): string => {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => (
    `${JSON.stringify(key)}:${stableSerialize(record[key])}`
  )).join(',')}}`;
};

const hashRequest = async (action: string, payload: Record<string, unknown>) => {
  const bytes = new TextEncoder().encode(stableSerialize({ action, payload }));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const getTokenUser = async (req: Request) => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Missing Authorization header');
  }

  const token = authHeader.slice('Bearer '.length);
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) {
    throw new Error('Invalid session');
  }

  return { user: data.user, token };
};

const readValidatedTokenClaims = (token: string) => {
  try {
    const encoded = token.split('.')[1];
    if (!encoded) return null;
    const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(encoded.length / 4) * 4, '=');
    return JSON.parse(atob(normalized)) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const requireAal2 = (context: { token: string; user: { id: string } }) => {
  // GoTrue validated the bearer token above; the signed AAL claim prevents a
  // role row from bypassing the documented Supabase MFA assurance boundary.
  const claims = readValidatedTokenClaims(context.token);
  if (claims?.sub !== context.user.id || claims?.aal !== 'aal2') {
    throw new Error('MFA step-up required for this action');
  }
};

const findAdminMembership = async (user: { id: string; email?: string | null; email_confirmed_at?: string | null; app_metadata?: Record<string, unknown> | null }) => {
  // The database is authoritative. Metadata may be stale after a revocation or
  // role change, and must never restore access when this lookup fails.
  const { data: linkedMember, error: linkedError } = await adminClient
    .from('admin_members')
    .select('id,email,user_id,role,is_active,invitation_sent_at,invitation_expires_at,invitation_revoked_at,created_at,updated_at')
    .eq('user_id', user.id)
    .maybeSingle();

  if (linkedError) throw new Error('Could not verify admin access');
  if (linkedMember) return linkedMember.is_active ? linkedMember as AdminMember : null;

  const email = normalizeEmail(user.email || '');
  if (email && user.email_confirmed_at) {
    const { data, error } = await adminClient
      .from('admin_members')
      .select('id,email,user_id,role,is_active,invitation_sent_at,invitation_expires_at,invitation_revoked_at,created_at,updated_at')
      .eq('email', email)
      .is('user_id', null)
      .eq('is_active', true)
      .maybeSingle();

    if (error) throw new Error('Could not verify admin access');
    if (data && (!data.invitation_expires_at || Date.parse(data.invitation_expires_at) > Date.now())) {
      // Claim only unlinked invitations, and verify a concurrent request has not
      // revoked or claimed the invitation since it was read.
      const { data: claimed, error: claimError } = await adminClient
        .from('admin_members')
        .update({ user_id: user.id })
        .eq('id', data.id)
        .is('user_id', null)
        .eq('is_active', true)
        .select('id,email,user_id,role,is_active,invitation_sent_at,invitation_expires_at,invitation_revoked_at,created_at,updated_at')
        .maybeSingle();

      if (claimError) throw new Error('Could not verify admin access');
      return claimed as AdminMember | null;
    }
  }

  return null;
};

const requireAdmin = async (req: Request) => {
  const { user, token } = await getTokenUser(req);
  const membership = await findAdminMembership(user);

  if (!membership) {
    throw new Error('Admin access required');
  }

  return { user, membership, token };
};

const requireOwner = (membership: AdminMember) => {
  if (membership.role !== 'owner') {
    throw new Error('Owner access required');
  }
};

const requireAnyRole = (membership: AdminMember, allowedRoles: AdminRole[]) => {
  if (!allowedRoles.includes(membership.role)) {
    throw new Error(`${allowedRoles.join(' or ')} access required`);
  }
};

const requireAdminOrOwner = (membership: AdminMember) => {
  requireAnyRole(membership, ['owner', 'admin']);
};

const safeCount = async (table: string) => {
  const { count, error } = await adminClient
    .from(table)
    .select('*', { count: 'exact', head: true });

  if (error) throw new Error(`Could not count ${table}`);
  return count || 0;
};

const fetchUsageSummary = async () => {
  const { data, error } = await adminClient
    .from('users')
    .select('is_premium,ai_generations_used,ai_generations_limit,premium_until')
    .limit(10000);
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') return null;
    throw new Error('Could not load AI usage summary');
  }
  const now = Date.now();
  const rows = data || [];
  const activePremium = rows.filter((row) => row.is_premium === true && (!row.premium_until || Date.parse(String(row.premium_until)) > now));
  return {
    totalAiUsed: rows.reduce((sum, row) => sum + Math.max(0, Number(row.ai_generations_used) || 0), 0),
    totalAiLimit: rows.reduce((sum, row) => sum + Math.max(0, Number(row.ai_generations_limit) || 0), 0),
    premiumUsers: activePremium.length,
    freeUsers: Math.max(0, rows.length - activePremium.length),
    sourceRows: rows.length,
  };
};

const fetchAutoApplyStatusCounts = async (table: string, statuses: readonly string[]) => {
  const entries = await Promise.all(statuses.map(async (status) => {
    const { count, error } = await adminClient
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq('status', status);
    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205') return [status, null] as const;
      throw new Error('Could not load AI and jobs summary');
    }
    return [status, count || 0] as const;
  }));
  return Object.fromEntries(entries);
};

const fetchAutoApplySummary = async () => {
  const [jobStatuses, runStatuses] = await Promise.all([
    fetchAutoApplyStatusCounts('auto_apply_jobs', [
      'discovered', 'queued', 'applying', 'applied', 'replied', 'interview', 'rejected', 'skipped', 'failed',
    ]),
    fetchAutoApplyStatusCounts('auto_apply_runs', ['running', 'completed', 'failed', 'cancelled']),
  ]);
  return { jobStatuses, runStatuses };
};

const AUTO_APPLY_JOB_STATES = ['discovered', 'queued', 'applying', 'applied', 'replied', 'interview', 'rejected', 'skipped', 'failed'] as const;
const AUTO_APPLY_JOB_ACTIONS = ['retry', 'cancel', 'reconcile'] as const;

const fetchAdminJobOperations = async (payload: Record<string, unknown>) => {
  const requestedLimit = Number(payload.limit);
  const limit = Number.isSafeInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 50) : 25;
  const requestedStatus = sanitizeString(payload.status).toLowerCase();
  const status = requestedStatus && (AUTO_APPLY_JOB_STATES as readonly string[]).includes(requestedStatus)
    ? requestedStatus
    : '';

  let query = adminClient
    .from('auto_apply_jobs')
    .select('id,user_id,title,company,location,status,match_score,source,created_at,updated_at,applied_at,email_sent_at,gmail_message_id,brevo_message_id,failure_reason')
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) {
    if (isMissingTableError(error)) return { available: false, items: [], reason: 'migration_required' };
    throw new Error('Could not load auto-apply job operations');
  }

  const rows = (data || []) as Array<Record<string, unknown> & { id: string; user_id: string }>;
  const userMap = await fetchPublicUserRows([...new Set(rows.map((row) => row.user_id).filter(Boolean))]);
  let actionRows: Array<Record<string, unknown> & { job_id: string }> = [];
  if (rows.length > 0) {
    const { data, error: actionError } = await adminClient
      .from('auto_apply_job_admin_actions')
      .select('id,job_id,action,status,reason,result,created_at,updated_at')
      .in('job_id', rows.map((row) => row.id))
      .order('created_at', { ascending: false })
      .limit(Math.min(200, Math.max(limit * 4, 25)));
    if (actionError && !isMissingTableError(actionError)) throw new Error('Could not load auto-apply action history');
    actionRows = (data || []) as Array<Record<string, unknown> & { job_id: string }>;
  }

  const latestAction = new Map<string, Record<string, unknown>>();
  for (const action of actionRows || []) {
    if (!latestAction.has(action.job_id)) latestAction.set(action.job_id, action);
  }

  return {
    available: true,
    items: rows.map((row) => {
      const user = userMap.get(row.user_id) || {};
      const lastAction = latestAction.get(row.id) || null;
      return {
        id: row.id,
        userId: row.user_id,
        userEmail: user.email || null,
        title: row.title,
        company: row.company,
        location: row.location || null,
        status: row.status,
        matchScore: row.match_score ?? null,
        source: row.source || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        appliedAt: row.applied_at || null,
        hasOutboundReceipt: Boolean(row.email_sent_at || row.gmail_message_id || row.brevo_message_id),
        failureReason: row.failure_reason || null,
        lastAction: lastAction
          ? {
            action: lastAction.action,
            status: lastAction.status,
            reason: lastAction.reason,
            result: lastAction.result || {},
            createdAt: lastAction.created_at,
            updatedAt: lastAction.updated_at,
          }
          : null,
      };
    }),
  };
};

const safeEventCount = async (eventName: string) => {
  const { count, error } = await adminClient
    .from('analytics_events')
    .select('*', { count: 'exact', head: true })
    .eq('event_name', eventName);

  if (error) {
    // Keep the old admin read compatible during the additive migration window.
    if (error.code === '42P01') return null;
    throw new Error('Could not count analytics events');
  }
  return count || 0;
};

const ANALYTICS_EVENT_NAMES = [
  'account_created',
  'resume_created',
  'resume_exported',
  'application_created',
  'upgrade_click',
  'checkout_started',
  'checkout_created',
  'purchase_confirmed',
  'support_started',
  'support_resolved',
] as const;

const fetchAnalyticsSnapshot = async (payload: Record<string, unknown>) => {
  const now = new Date();
  const to = typeof payload.to === 'string' && !Number.isNaN(Date.parse(payload.to))
    ? new Date(payload.to)
    : now;
  const from = typeof payload.from === 'string' && !Number.isNaN(Date.parse(payload.from))
    ? new Date(payload.from)
    : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (from >= to || to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000) {
    throw new Error('Analytics date range is invalid');
  }

  const entries = await Promise.all(ANALYTICS_EVENT_NAMES.map(async (eventName) => {
    const { count, error } = await adminClient
      .from('analytics_events')
      .select('*', { count: 'exact', head: true })
      .eq('event_name', eventName)
      .gte('occurred_at', from.toISOString())
      .lt('occurred_at', to.toISOString());
    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205') return [eventName, null] as const;
      throw new Error('Could not load analytics events');
    }
    return [eventName, count || 0] as const;
  }));
  const metrics = Object.fromEntries(entries);
  const rate = (numerator: number | null, denominator: number | null) => (
    Number.isFinite(numerator) && Number.isFinite(denominator) && Number(denominator) > 0
      ? Number(((Number(numerator) / Number(denominator)) * 100).toFixed(2))
      : null
  );

  return {
    available: entries.every(([, value]) => value !== null),
    source: 'first_party_analytics_events',
    generatedAt: new Date().toISOString(),
    window: { from: from.toISOString(), to: to.toISOString() },
    metrics,
    rates: {
      signupToPurchase: rate(metrics.account_created, metrics.purchase_confirmed),
      signupToResume: rate(metrics.resume_created, metrics.account_created),
      resumeToExport: rate(metrics.resume_exported, metrics.resume_created),
      upgradeToCheckout: rate(metrics.checkout_created, metrics.upgrade_click),
      checkoutToPurchase: rate(metrics.purchase_confirmed, metrics.checkout_created),
      upgradeToPurchase: rate(metrics.purchase_confirmed, metrics.upgrade_click),
      supportResolution: rate(metrics.support_resolved, metrics.support_started),
    },
  };
};

const csvCell = (value: unknown) => {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
};

const buildAnalyticsCsv = (analytics: Awaited<ReturnType<typeof fetchAnalyticsSnapshot>>) => {
  const rows: Array<[string, unknown]> = [
    ['source', analytics.source],
    ['window_from', analytics.window.from],
    ['window_to', analytics.window.to],
    ['generated_at', analytics.generatedAt],
    ...ANALYTICS_EVENT_NAMES.map((eventName) => [`metric.${eventName}`, analytics.metrics[eventName]] as [string, unknown]),
    ['rate.signup_to_purchase', analytics.rates.signupToPurchase],
    ['rate.signup_to_resume', analytics.rates.signupToResume],
    ['rate.resume_to_export', analytics.rates.resumeToExport],
    ['rate.upgrade_to_checkout', analytics.rates.upgradeToCheckout],
    ['rate.checkout_to_purchase', analytics.rates.checkoutToPurchase],
    ['rate.upgrade_to_purchase', analytics.rates.upgradeToPurchase],
    ['rate.support_resolution', analytics.rates.supportResolution],
  ];
  return [
    ['Metric', 'Value'].map(csvCell).join(','),
    ...rows.map(([label, value]) => [label, value].map(csvCell).join(',')),
  ].join('\r\n') + '\r\n';
};

const fetchPublicUserRows = async (ids: string[]) => {
  if (ids.length === 0) return new Map<string, Record<string, unknown>>();

  const rows: Array<Record<string, unknown> & { id: string }> = [];
  for (let offset = 0; offset < ids.length; offset += 500) {
    const batchIds = ids.slice(offset, offset + 500);
    const { data, error } = await adminClient
      .from('users')
      .select('id,email,full_name,is_premium,premium_plan,premium_until,premium_updated_at,ai_generations_used,ai_generations_limit,stripe_customer_id,created_at,updated_at')
      .in('id', batchIds);

    if (error) throw new Error('Could not load user profiles');
    rows.push(...((data || []) as Array<Record<string, unknown> & { id: string }>));
  }

  return new Map(rows.map((row) => [row.id, row]));
};

const fetchBillingEntitlements = async (ids: string[]) => {
  if (ids.length === 0) return new Map<string, Array<Record<string, unknown>>>();

  const rows: Array<Record<string, unknown> & { user_id: string }> = [];
  for (let offset = 0; offset < ids.length; offset += 500) {
    const { data, error } = await adminClient
      .from('billing_entitlements')
      .select('user_id,provider,subscription_id,active,paid_until,plan,ai_limit,observed_at')
      .in('user_id', ids.slice(offset, offset + 500));

    // Additive rollout compatibility: the legacy profile remains the read
    // fallback until the entitlement migration has been applied.
    if (error?.code === '42P01' || error?.code === 'PGRST205') continue;
    if (error) throw new Error('Could not load billing entitlements');
    rows.push(...((data || []) as Array<Record<string, unknown> & { user_id: string }>));
  }

  const { data: grants, error: grantError } = await adminClient
    .from('manual_access_grants')
    .select('id,user_id,plan,ai_limit,starts_at,expires_at,created_at,revoked_at')
    .in('user_id', ids);
  if (grantError && grantError.code !== '42P01' && grantError.code !== 'PGRST205') {
    throw new Error('Could not load manual access grants');
  }
  const now = Date.now();
  for (const grant of (grants || []) as Array<Record<string, unknown> & { user_id: string; id: string }>) {
    const startsAt = typeof grant.starts_at === 'string' ? Date.parse(grant.starts_at) : Number.NaN;
    const expiresAt = typeof grant.expires_at === 'string' ? Date.parse(grant.expires_at) : Number.POSITIVE_INFINITY;
    rows.push({
      user_id: grant.user_id,
      provider: 'manual',
      subscription_id: `grant:${grant.id}`,
      active: !grant.revoked_at && Number.isFinite(startsAt) && startsAt <= now && expiresAt > now,
      paid_until: grant.expires_at || null,
      plan: grant.plan,
      ai_limit: grant.ai_limit,
      observed_at: grant.created_at,
      source: 'manual_grant',
      grant_id: grant.id,
      revoked_at: grant.revoked_at || null,
    });
  }

  return new Map(rows.reduce((map, row) => {
    const current = map.get(row.user_id) || [];
    current.push(row);
    map.set(row.user_id, current);
    return map;
  }, new Map<string, Array<Record<string, unknown>>>()));
};

const fetchCustomerCount = async (table: string, column: string, userId: string) => {
  const { count, error } = await adminClient
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq(column, userId);
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') return null;
    throw new Error(`Could not count ${table}`);
  }
  return count || 0;
};

const fetchCustomerDetail = async (payload: Record<string, unknown>) => {
  const userId = sanitizeString(payload.userId);
  if (!userId) throw new Error('Missing userId');

  const targetUser = await getAuthUserById(userId);
  const [profileResult, entitlements, counts, activityResult, supportCount, privacy] = await Promise.all([
    adminClient
      .from('users')
      .select('id,email,full_name,is_premium,premium_plan,premium_until,ai_generations_used,ai_generations_limit,created_at,updated_at')
      .eq('id', userId)
      .maybeSingle(),
    fetchBillingEntitlements([userId]),
    Promise.all([
      fetchCustomerCount('resumes', 'user_id', userId),
      fetchCustomerCount('job_applications', 'user_id', userId),
      fetchCustomerCount('auto_apply_jobs', 'user_id', userId),
    ]),
    adminClient
      .from('analytics_events')
      .select('event_name,occurred_at,provider')
      .eq('actor_user_id', userId)
      .order('occurred_at', { ascending: false })
      .limit(50),
    fetchCustomerCount('support_conversations', 'customer_user_id', userId),
    fetchPrivacyStatus({ userId }),
  ]);

  if (profileResult.error) throw new Error('Could not load customer profile');
  if (activityResult.error && activityResult.error.code !== '42P01' && activityResult.error.code !== 'PGRST205') {
    throw new Error('Could not load customer activity');
  }

  const profile = profileResult.data || {};
  return {
    available: true,
    customer: {
      id: targetUser.id,
      email: targetUser.email || profile.email || null,
      fullName: profile.full_name || null,
      createdAt: targetUser.created_at || profile.created_at || null,
      updatedAt: profile.updated_at || null,
      lastSignInAt: targetUser.last_sign_in_at || null,
      emailConfirmedAt: targetUser.email_confirmed_at || null,
      isPremium: Boolean(profile.is_premium),
      premiumPlan: profile.premium_plan || null,
      premiumUntil: profile.premium_until || null,
      aiGenerationsUsed: Number.isFinite(Number(profile.ai_generations_used)) ? Number(profile.ai_generations_used) : null,
      aiGenerationsLimit: Number.isFinite(Number(profile.ai_generations_limit)) ? Number(profile.ai_generations_limit) : null,
    },
    counts: {
      resumes: counts[0],
      applications: counts[1],
      autoApplyJobs: counts[2],
      supportConversations: supportCount,
    },
    billing: entitlements.get(userId) || [],
    activity: (activityResult.data || []).map((event) => ({
      eventName: event.event_name,
      occurredAt: event.occurred_at,
      provider: event.provider || null,
    })),
    privacy,
  };
};

const isMissingTableError = (error: { code?: string } | null) => (
  error?.code === '42P01' || error?.code === 'PGRST205'
);

const fetchPrivacyStatus = async (payload: Record<string, unknown>) => {
  const userId = sanitizeString(payload.userId);
  if (!userId) throw new Error('Missing userId');

  const targetUser = await getAuthUserById(userId);
  const [holdsResult, exportsResult, deletionsResult] = await Promise.all([
    adminClient
      .from('privacy_holds')
      .select('id,target_user_id,hold_type,reason,created_by_user_id,expires_at,released_at,created_at,updated_at')
      .eq('target_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50),
    adminClient
      .from('privacy_export_jobs')
      .select('id,status,storage_path,failure_code,item_count,requested_at,locked_until,completed_at,expires_at,created_at,updated_at')
      .eq('target_user_id', userId)
      .order('requested_at', { ascending: false })
      .limit(20),
    adminClient
      .from('privacy_deletion_jobs')
      .select('id,target_user_id,status,current_step,failure_code,attempt_count,requested_at,locked_until,next_attempt_at,owner_approved_by_user_id,owner_approved_at,completed_at,created_at,updated_at')
      .eq('target_user_id', userId)
      .order('requested_at', { ascending: false })
      .limit(20),
  ]);

  const providerReviewsResult = await adminClient
    .from('privacy_provider_cancellation_reviews')
    .select('id,deletion_job_id,target_user_id,provider,subscription_id,review_status,evidence_reference,reason,reviewed_by_user_id,reviewed_at,created_at,updated_at')
    .eq('target_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  const results = [holdsResult, exportsResult, deletionsResult];
  if (results.some((result) => result.error && !isMissingTableError(result.error))) {
    throw new Error('Could not load privacy workflow status');
  }
  if (results.some((result) => isMissingTableError(result.error))) {
    return { available: false, targetUserId: targetUser.id, holds: [], exports: [], deletions: [] };
  }
  if (providerReviewsResult.error && !isMissingTableError(providerReviewsResult.error)) {
    throw new Error('Could not load provider cancellation review status');
  }

  const exports = await Promise.all((exportsResult.data || []).map(async (job) => {
    if (job.status !== 'ready' || !job.storage_path || !job.expires_at || Date.parse(job.expires_at) <= Date.now()) {
      return { ...job, download_url: null };
    }
    const { data: signed, error: signedError } = await adminClient.storage
      .from('privacy-exports')
      .createSignedUrl(job.storage_path, 300, { download: `resumeats-privacy-${userId}.json` });
    return { ...job, download_url: signedError ? null : (signed?.signedUrl || null) };
  }));

  return {
    available: true,
    targetUserId: targetUser.id,
    holds: holdsResult.data || [],
    exports,
    deletions: deletionsResult.data || [],
    providerReviewAvailable: !isMissingTableError(providerReviewsResult.error),
    providerReviews: providerReviewsResult.data || [],
  };
};

const fetchAdminMembers = async () => {
  const { data, error } = await adminClient
    .from('admin_members')
    .select('id,email,user_id,role,is_active,invitation_sent_at,invitation_expires_at,invitation_revoked_at,created_at,updated_at')
    .order('created_at', { ascending: false });

  if (error) throw new Error('Could not load admin members');
  const members = (data || []) as AdminMember[];
  const memberIds = members.map((member) => member.id);
  if (memberIds.length === 0) return members;

  const deliveryResult = await adminClient
    .from('admin_invitation_email_outbox')
    .select('member_id,status,attempts,last_error,sent_at,created_at')
    .in('member_id', memberIds)
    .order('created_at', { ascending: false });
  if (deliveryResult.error) {
    if (isMissingTableError(deliveryResult.error)) return members;
    throw new Error('Could not load admin invitation delivery state');
  }

  const latestDelivery = new Map<string, AdminMember['invitation_delivery']>();
  for (const row of (deliveryResult.data || []) as Array<Record<string, unknown> & { member_id: string }>) {
    if (!latestDelivery.has(row.member_id)) {
      latestDelivery.set(row.member_id, {
        status: String(row.status || 'unknown'),
        attempts: Number(row.attempts || 0),
        last_error: typeof row.last_error === 'string' ? row.last_error : null,
        sent_at: typeof row.sent_at === 'string' ? row.sent_at : null,
        created_at: String(row.created_at || ''),
      });
    }
  }
  return members.map((member) => ({ ...member, invitation_delivery: latestDelivery.get(member.id) || null }));
};

const fetchAdminSettings = async () => {
  const { data, error } = await adminClient
    .from('support_ai_settings')
    .select('enabled,provider_name,model_name,per_turn_token_limit,conversation_turn_limit,daily_cost_micros,monthly_cost_micros,circuit_open_until,revision,updated_at')
    .eq('id', true)
    .maybeSingle();
  if (error) {
    if (isMissingTableError(error)) return { available: false, reason: 'migration_required' };
    throw new Error('Could not load admin settings');
  }

  const historyResult = await adminClient
    .from('support_ai_settings_history')
    .select('settings_revision,enabled,provider_name,model_name,per_turn_token_limit,conversation_turn_limit,daily_cost_micros,monthly_cost_micros,circuit_open_until,change_source,reason,changed_at')
    .order('changed_at', { ascending: false })
    .limit(20);
  if (historyResult.error && !isMissingTableError(historyResult.error)) {
    throw new Error('Could not load support AI settings history');
  }

  const routingResult = await adminClient
    .from('support_routing_settings')
    .select('timezone,business_days,business_start,business_end,first_response_target_minutes,max_queue_size,auto_route_enabled,revision,updated_at')
    .eq('id', true)
    .maybeSingle();
  if (routingResult.error && !isMissingTableError(routingResult.error)) {
    throw new Error('Could not load support routing settings');
  }
  const routingHistoryResult = routingResult.error
    ? { data: [], error: null }
    : await adminClient
      .from('support_routing_settings_history')
      .select('settings_revision,timezone,business_days,business_start,business_end,first_response_target_minutes,max_queue_size,auto_route_enabled,change_source,reason,changed_at')
      .order('changed_at', { ascending: false })
      .limit(20);
  if (routingHistoryResult.error && !isMissingTableError(routingHistoryResult.error)) {
    throw new Error('Could not load support routing settings history');
  }

  const runtimeEnabled = Deno.env.get('SUPPORT_AI_ENABLED') === 'true';
  const providerConfigured = Boolean(
    (Deno.env.get('SUPPORT_AI_PROVIDER_URL') || '').trim()
    && Deno.env.get('SUPPORT_AI_PROVIDER_TOKEN'),
  );
  const workerConfigured = Boolean(Deno.env.get('SUPPORT_AI_WORKER_SECRET'));
  const circuitOpen = Boolean(data?.circuit_open_until && Date.parse(String(data.circuit_open_until)) > Date.now());
  return {
    available: true,
    supportAi: {
      databaseEnabled: data?.enabled === true,
      runtimeEnabled,
      effectiveEnabled: data?.enabled === true && runtimeEnabled && providerConfigured && workerConfigured && !circuitOpen,
      circuitOpen,
      providerConfigured,
      workerConfigured,
      providerName: data?.provider_name || null,
      modelName: data?.model_name || null,
      perTurnTokenLimit: data?.per_turn_token_limit ?? null,
      conversationTurnLimit: data?.conversation_turn_limit ?? null,
      dailyCostMicros: data?.daily_cost_micros ?? null,
      monthlyCostMicros: data?.monthly_cost_micros ?? null,
      circuitOpenUntil: data?.circuit_open_until || null,
      revision: data?.revision ?? null,
      updatedAt: data?.updated_at || null,
      history: (historyResult.data || []).map((row) => ({
        revision: row.settings_revision,
        enabled: row.enabled === true,
        providerName: row.provider_name || null,
        modelName: row.model_name || null,
        perTurnTokenLimit: row.per_turn_token_limit ?? null,
        conversationTurnLimit: row.conversation_turn_limit ?? null,
        dailyCostMicros: row.daily_cost_micros ?? null,
        monthlyCostMicros: row.monthly_cost_micros ?? null,
        circuitOpenUntil: row.circuit_open_until || null,
        source: row.change_source || null,
        reason: row.reason || null,
        changedAt: row.changed_at || null,
      })),
    },
    supportRouting: routingResult.error
      ? { available: false, reason: 'migration_required' }
      : {
        available: true,
        timezone: routingResult.data?.timezone || 'UTC',
        businessDays: routingResult.data?.business_days || [],
        businessStart: routingResult.data?.business_start || null,
        businessEnd: routingResult.data?.business_end || null,
        firstResponseTargetMinutes: routingResult.data?.first_response_target_minutes ?? null,
        maxQueueSize: routingResult.data?.max_queue_size ?? null,
        autoRouteEnabled: routingResult.data?.auto_route_enabled === true,
        revision: routingResult.data?.revision ?? null,
        updatedAt: routingResult.data?.updated_at || null,
        history: (routingHistoryResult.data || []).map((row) => ({
          revision: row.settings_revision,
          timezone: row.timezone,
          businessDays: row.business_days || [],
          businessStart: row.business_start || null,
          businessEnd: row.business_end || null,
          firstResponseTargetMinutes: row.first_response_target_minutes ?? null,
          maxQueueSize: row.max_queue_size ?? null,
          autoRouteEnabled: row.auto_route_enabled === true,
          source: row.change_source || null,
          reason: row.reason || null,
          changedAt: row.changed_at || null,
        })),
      },
  };
};

const updateSupportAiSettings = async (adminUserId: string, payload: Record<string, unknown>) => {
  const enabled = payload.enabled === true;
  const providerName = sanitizeString(payload.providerName, '').slice(0, 120) || null;
  const modelName = sanitizeString(payload.modelName, '').slice(0, 120) || null;
  const perTurnTokenLimit = Number(payload.perTurnTokenLimit);
  const conversationTurnLimit = Number(payload.conversationTurnLimit);
  const dailyCostMicros = Number(payload.dailyCostMicros);
  const monthlyCostMicros = Number(payload.monthlyCostMicros);
  if (!Number.isSafeInteger(perTurnTokenLimit) || perTurnTokenLimit < 256 || perTurnTokenLimit > 12000) throw new Error('Invalid AI token limit');
  if (!Number.isSafeInteger(conversationTurnLimit) || conversationTurnLimit < 1 || conversationTurnLimit > 50) throw new Error('Invalid AI conversation limit');
  if (!Number.isSafeInteger(dailyCostMicros) || dailyCostMicros < 0) throw new Error('Invalid daily AI budget');
  if (!Number.isSafeInteger(monthlyCostMicros) || monthlyCostMicros < 0) throw new Error('Invalid monthly AI budget');
  if (enabled && (
    !(Deno.env.get('SUPPORT_AI_PROVIDER_URL') || '').trim()
    || !Deno.env.get('SUPPORT_AI_PROVIDER_TOKEN')
    || !Deno.env.get('SUPPORT_AI_WORKER_SECRET')
  )) {
    throw new Error('Support AI cannot be enabled until provider and worker secrets are configured');
  }

  const { data, error } = await adminClient.rpc('admin_update_support_ai_settings', {
    p_actor_user_id: adminUserId,
    p_enabled: enabled,
    p_provider_name: providerName,
    p_model_name: modelName,
    p_per_turn_token_limit: perTurnTokenLimit,
    p_conversation_turn_limit: conversationTurnLimit,
    p_daily_cost_micros: dailyCostMicros,
    p_monthly_cost_micros: monthlyCostMicros,
  });
  if (error) {
    if (error.code === '42883' || error.code === 'PGRST202') throw new Error('Support AI settings are unavailable until the migration is applied');
    throw new Error('Support AI settings could not be saved');
  }
  return data;
};

const updateSupportRoutingSettings = async (adminUserId: string, payload: Record<string, unknown>) => {
  const timezone = sanitizeString(payload.timezone, '').slice(0, 80);
  const businessDays = Array.isArray(payload.businessDays)
    ? payload.businessDays.filter((value): value is number => Number.isSafeInteger(value))
    : [];
  const businessStart = sanitizeString(payload.businessStart, '');
  const businessEnd = sanitizeString(payload.businessEnd, '');
  const firstResponseTargetMinutes = Number(payload.firstResponseTargetMinutes);
  const maxQueueSize = Number(payload.maxQueueSize);
  const autoRouteEnabled = payload.autoRouteEnabled !== false;
  const reason = sanitizeString(payload.reason, 'admin_settings_update').slice(0, 240) || 'admin_settings_update';
  if (!timezone || businessDays.length < 1 || businessDays.length > 7 || new Set(businessDays).size !== businessDays.length || businessDays.some((value) => value < 1 || value > 7)) {
    throw new Error('Invalid support business days or timezone');
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(businessStart) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(businessEnd) || businessStart >= businessEnd) {
    throw new Error('Invalid support business hours');
  }
  if (!Number.isSafeInteger(firstResponseTargetMinutes) || firstResponseTargetMinutes < 5 || firstResponseTargetMinutes > 10080) throw new Error('Invalid first-response target');
  if (!Number.isSafeInteger(maxQueueSize) || maxQueueSize < 1 || maxQueueSize > 10000) throw new Error('Invalid support queue size');

  const { data, error } = await adminClient.rpc('admin_update_support_routing_settings', {
    p_actor_user_id: adminUserId,
    p_timezone: timezone,
    p_business_days: businessDays,
    p_business_start: businessStart,
    p_business_end: businessEnd,
    p_first_response_target_minutes: firstResponseTargetMinutes,
    p_max_queue_size: maxQueueSize,
    p_auto_route_enabled: autoRouteEnabled,
    p_reason: reason,
  });
  if (error) {
    if (error.code === '42883' || error.code === 'PGRST202') throw new Error('Support routing settings are unavailable until the migration is applied');
    throw new Error('Support routing settings could not be saved');
  }
  return data;
};

const resetSupportAiCircuit = async (adminUserId: string, payload: Record<string, unknown>) => {
  const reason = sanitizeString(payload.reason, 'admin_manual_clear').slice(0, 240) || 'admin_manual_clear';
  const { data, error } = await adminClient.rpc('support_ai_set_circuit', {
    p_open_until: null,
    p_reason: reason,
    p_actor_user_id: adminUserId,
  });
  if (error) {
    if (error.code === '42883' || error.code === 'PGRST202') throw new Error('Support AI circuit controls are unavailable until the migration is applied');
    throw new Error('Support AI circuit could not be cleared');
  }
  return data;
};

const rollbackSupportAiSettings = async (adminUserId: string, payload: Record<string, unknown>) => {
  const targetRevision = Number(payload.targetRevision);
  if (!Number.isSafeInteger(targetRevision) || targetRevision < 1) throw new Error('A valid support AI settings revision is required');
  const { data: target, error: targetError } = await adminClient
    .from('support_ai_settings_history')
    .select('enabled')
    .eq('settings_revision', targetRevision)
    .maybeSingle();
  if (targetError) {
    if (isMissingTableError(targetError)) throw new Error('Support AI settings history is unavailable until the migration is applied');
    throw new Error('Support AI settings revision could not be loaded');
  }
  if (!target) throw new Error('Support AI settings revision was not found');
  if (target.enabled === true && (
    !(Deno.env.get('SUPPORT_AI_PROVIDER_URL') || '').trim()
    || !Deno.env.get('SUPPORT_AI_PROVIDER_TOKEN')
    || !Deno.env.get('SUPPORT_AI_WORKER_SECRET')
  )) {
    throw new Error('Support AI cannot be enabled until provider and worker secrets are configured');
  }

  const { data, error } = await adminClient.rpc('admin_rollback_support_ai_settings', {
    p_actor_user_id: adminUserId,
    p_target_revision: targetRevision,
  });
  if (error) {
    if (error.code === '42883' || error.code === 'PGRST202') throw new Error('Support AI rollback is unavailable until the migration is applied');
    throw new Error('Support AI settings could not be rolled back');
  }
  return data;
};

const parseDirectoryCursor = (value: unknown) => {
  if (typeof value !== 'string' || value.length > 1000) return {};
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return {
      createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : null,
      userId: typeof parsed.id === 'string' && /^[0-9a-f-]{36}$/i.test(parsed.id) ? parsed.id : null,
    };
  } catch {
    return {};
  }
};

const hydrateDirectoryUsers = async (items: Array<Record<string, unknown>>) => {
  const userIds = items.map((item) => String(item.id || '')).filter(Boolean);
  const [profileRows, entitlementRows, adminMembers, authRows] = await Promise.all([
    fetchPublicUserRows(userIds),
    fetchBillingEntitlements(userIds),
    fetchAdminMembers(),
    Promise.all(userIds.map(async (id) => {
      const { data } = await adminClient.auth.admin.getUserById(id);
      return [id, data?.user || null] as const;
    })),
  ]);
  const authUsers = new Map(authRows);
  const now = Date.now();

  return items.map((item) => {
    const id = String(item.id || '');
    const profile = (profileRows.get(id) || {}) as Record<string, unknown>;
    const authUser = authUsers.get(id) as Record<string, unknown> | null;
    const entitlements = entitlementRows.get(id) || [];
    const activeEntitlement = entitlements
      .filter((entitlement) => entitlement.active === true && (
        (typeof entitlement.paid_until === 'string' && Date.parse(entitlement.paid_until) > now) ||
        (entitlement.provider === 'manual' && entitlement.paid_until == null)
      ))
      .sort((left, right) => {
        const leftTime = left.paid_until ? Date.parse(String(left.paid_until)) : Number.POSITIVE_INFINITY;
        const rightTime = right.paid_until ? Date.parse(String(right.paid_until)) : Number.POSITIVE_INFINITY;
        return rightTime - leftTime;
      })[0];
    const profileUntil = typeof profile.premium_until === 'string' ? profile.premium_until : null;
    const legacyProfileActive = Boolean(profile.is_premium) && (!profileUntil || Date.parse(profileUntil) > now);
    const isPremium = Boolean(activeEntitlement || legacyProfileActive);
    const adminMember = adminMembers.find((member) => member.is_active && member.user_id === id);

    return {
      id,
      email: normalizeEmail(String(item.email || profile.email || '')),
      fullName: item.fullName || profile.full_name || '',
      createdAt: item.createdAt || profile.created_at || null,
      lastSignInAt: item.lastSignInAt || authUser?.last_sign_in_at || null,
      emailConfirmedAt: item.emailConfirmedAt || authUser?.email_confirmed_at || null,
      isPremium,
      premiumPlan: activeEntitlement?.plan || (isPremium ? profile.premium_plan : null) || null,
      premiumUntil: activeEntitlement?.paid_until || (isPremium ? profileUntil : null) || null,
      aiGenerationsUsed: profile.ai_generations_used || 0,
      aiGenerationsLimit: (activeEntitlement?.ai_limit ?? (isPremium ? profile.ai_generations_limit : 0)) || 0,
      isAdmin: Boolean(adminMember),
      adminRole: adminMember?.role || null,
      isBanned: item.isBanned === true,
      bannedReason: item.bannedReason || '',
      sourceUpdatedAt: item.sourceUpdatedAt || null,
    };
  });
};

const fetchAdminDirectory = async (payload: Record<string, unknown>) => {
  const cursor = parseDirectoryCursor(payload.cursor);
  const requestedLimit = Number(payload.limit);
  const limit = Number.isSafeInteger(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 100)) : 50;
  const { data, error } = await adminClient.rpc('admin_list_user_directory', {
    p_search: sanitizeString(payload.search).slice(0, 80),
    p_cursor_created_at: cursor.createdAt,
    p_cursor_user_id: cursor.userId,
    p_limit: limit,
  });

  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST202' || error.code === 'PGRST205') {
      return { available: false, items: [], nextCursor: null };
    }
    throw new Error('Could not load the customer directory');
  }

  const result = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const rawItems = Array.isArray(result.items) ? result.items as Array<Record<string, unknown>> : [];
  return {
    available: true,
    items: await hydrateDirectoryUsers(rawItems),
    nextCursor: result.nextCursor || null,
  };
};

const fetchErrors = async () => {
  const { data, error } = await adminClient
    .from('app_error_events')
    .select('id,user_id,user_email,severity,source,message,stack,context,url,user_agent,resolved_at,created_at')
    .order('created_at', { ascending: false })
    .limit(80);

  if (error) throw new Error('Could not load client errors');
  return data || [];
};

const fetchAudit = async () => {
  const { data, error } = await adminClient
    .from('admin_audit_events')
    .select('id,admin_user_id,target_user_id,action,metadata,created_at')
    .order('created_at', { ascending: false })
    .limit(80);

  if (error) throw new Error('Could not load the audit log');
  return data || [];
};

const AUTH_USER_PAGE_SIZE = 1000;
const MAX_AUTH_USER_PAGES = 100;

/**
 * Supabase Auth listUsers is paginated. Never let the dashboard silently
 * undercount users once the first page is full; a complete list is also
 * required when an owner grants access by email.
 */
const listAuthUsers = async () => {
  const users: AuthUser[] = [];

  for (let page = 1; page <= MAX_AUTH_USER_PAGES; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage: AUTH_USER_PAGE_SIZE,
    });

    if (error) throw error;

    const batch = Array.isArray(data?.users) ? data.users as AuthUser[] : [];
    users.push(...batch);

    const reportedTotal = Number((data as unknown as { total?: unknown })?.total);
    if (batch.length < AUTH_USER_PAGE_SIZE || (Number.isFinite(reportedTotal) && reportedTotal > 0 && users.length >= reportedTotal)) {
      return users;
    }
  }

  throw new Error('Auth user list exceeds the supported page limit');
};

const buildLegacyOverview = async () => {
  const authUsers = await listAuthUsers();
  const userIds = authUsers.map((user) => user.id);
  const profileRows = await fetchPublicUserRows(userIds);
  const entitlementRows = await fetchBillingEntitlements(userIds);
  const adminMembers = await fetchAdminMembers();
  const now = Date.now();
  const users = authUsers.map((authUser) => {
    const profile = (profileRows.get(authUser.id) || {}) as Record<string, unknown>;
    const entitlements = entitlementRows.get(authUser.id) || [];
    const activeEntitlement = entitlements
      .filter((entitlement) => entitlement.active === true && (
        (typeof entitlement.paid_until === 'string' && Date.parse(entitlement.paid_until) > now) ||
        (entitlement.provider === 'manual' && entitlement.paid_until == null)
      ))
      .sort((left, right) => {
        const leftTime = left.paid_until ? Date.parse(String(left.paid_until)) : Number.POSITIVE_INFINITY;
        const rightTime = right.paid_until ? Date.parse(String(right.paid_until)) : Number.POSITIVE_INFINITY;
        return rightTime - leftTime;
      })[0];
    const profileUntil = typeof profile.premium_until === 'string' ? profile.premium_until : null;
    const legacyProfileActive = Boolean(profile.is_premium) && (!profileUntil || Date.parse(profileUntil) > now);
    const isPremium = Boolean(activeEntitlement || legacyProfileActive);
    const metadata = authUser.app_metadata || {};
    const email = normalizeEmail(authUser.email || `${profile.email || ''}`);
    const adminMember = adminMembers.find((member) => member.is_active && (
      member.user_id === authUser.id ||
      (!member.user_id && authUser.email_confirmed_at && normalizeEmail(member.email) === email)
    ));

    return {
      id: authUser.id,
      email,
      fullName: profile.full_name || authUser.user_metadata?.full_name || '',
      createdAt: authUser.created_at,
      lastSignInAt: authUser.last_sign_in_at,
      emailConfirmedAt: authUser.email_confirmed_at,
      isPremium,
      premiumPlan: activeEntitlement?.plan || (isPremium ? profile.premium_plan : null) || null,
      premiumUntil: activeEntitlement?.paid_until || (isPremium ? profileUntil : null) || null,
      aiGenerationsUsed: profile.ai_generations_used || 0,
      aiGenerationsLimit: (activeEntitlement?.ai_limit ?? (isPremium ? profile.ai_generations_limit : 0)) || 0,
      stripeCustomerId: profile.stripe_customer_id || '',
      isAdmin: Boolean(adminMember),
      adminRole: adminMember?.role || null,
      isBanned: metadata.banned === true,
      bannedReason: metadata.ban_reason || '',
      providers: metadata.providers || [],
    };
  });

  const errors = await fetchErrors();
  const audit = await fetchAudit();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const premiumUsers = users.filter((user) => user.isPremium).length;
  const bannedUsers = users.filter((user) => user.isBanned).length;
  const recentSignups = users.filter((user) => {
    const createdAt = user.createdAt ? new Date(user.createdAt).getTime() : 0;
    return Number.isFinite(createdAt) && now - createdAt <= sevenDaysMs;
  }).length;
  const totalAiUsed = users.reduce((sum, user) => sum + Number(user.aiGenerationsUsed || 0), 0);
  const userEmails = new Map(users.map((user) => [user.id, user.email]));
  const billingEntitlements = Array.from(entitlementRows.entries()).flatMap(([userId, entitlements]) => (
    entitlements.map((entitlement) => ({
      ...entitlement,
      userId,
      userEmail: userEmails.get(userId) || '',
    }))
  ));
  const [signupEvents, purchaseEvents] = await Promise.all([
    safeEventCount('account_created'),
    safeEventCount('purchase_confirmed'),
  ]);
  const paidConversionRate = Number.isFinite(signupEvents) && Number.isFinite(purchaseEvents) && signupEvents > 0
    ? Number(((purchaseEvents / signupEvents) * 100).toFixed(2))
    : null;

  return {
    generatedAt: new Date().toISOString(),
    analytics: {
      totalUsers: users.length,
      premiumUsers,
      freeUsers: Math.max(0, users.length - premiumUsers),
      bannedUsers,
      adminUsers: users.filter((user) => user.isAdmin).length,
      recentSignups,
      unresolvedErrors: errors.filter((error) => !error.resolved_at).length,
      totalAiUsed,
      resumes: await safeCount('resumes'),
      applications: await safeCount('job_applications'),
      autoApplyJobs: await safeCount('auto_apply_jobs'),
      contactInquiries: await safeCount('contact_inquiries'),
      newsletterSubscribers: await safeCount('newsletter_subscribers'),
      signupEvents,
      purchaseEvents,
      paidConversionRate,
    },
    users,
    errors,
    audit,
    adminMembers,
    billingEntitlements,
    billingSubscriptions: [],
    billingTransactions: [],
    billingProjectionsAvailable: false,
  };
};

const fetchBillingLedger = async () => {
  const { data, error } = await adminClient
    .from('billing_entitlements')
    .select('user_id,provider,subscription_id,active,paid_until,plan,ai_limit,observed_at')
    .order('observed_at', { ascending: false })
    .limit(1000);
  if (error) {
    if (error.code !== '42P01' && error.code !== 'PGRST205') throw new Error('Could not load billing entitlements');
  }
  const rows = Array.isArray(data) ? data as Array<Record<string, unknown> & { user_id: string }> : [];
  const { data: grants, error: grantError } = await adminClient
    .from('manual_access_grants')
    .select('id,user_id,plan,ai_limit,starts_at,expires_at,created_at,revoked_at')
    .order('created_at', { ascending: false })
    .limit(1000);
  if (grantError && grantError.code !== '42P01' && grantError.code !== 'PGRST205') {
    throw new Error('Could not load manual access grants');
  }
  const now = Date.now();
  for (const grant of (grants || []) as Array<Record<string, unknown> & { user_id: string; id: string }>) {
    const startsAt = typeof grant.starts_at === 'string' ? Date.parse(grant.starts_at) : Number.NaN;
    const expiresAt = typeof grant.expires_at === 'string' ? Date.parse(grant.expires_at) : Number.POSITIVE_INFINITY;
    rows.push({
      user_id: grant.user_id,
      provider: 'manual',
      subscription_id: `grant:${grant.id}`,
      active: !grant.revoked_at && Number.isFinite(startsAt) && startsAt <= now && expiresAt > now,
      paid_until: grant.expires_at || null,
      plan: grant.plan,
      ai_limit: grant.ai_limit,
      observed_at: grant.created_at,
      source: 'manual_grant',
      grant_id: grant.id,
      revoked_at: grant.revoked_at || null,
    });
  }
  const profiles = await fetchPublicUserRows([...new Set(rows.map((row) => row.user_id))]);
  return rows.map((row) => ({
    ...row,
    userId: row.user_id,
    userEmail: profiles.get(row.user_id)?.email || '',
  }));
};

const fetchBillingProjections = async () => {
  const [subscriptionsResult, transactionsResult] = await Promise.all([
    adminClient
      .from('billing_subscriptions')
      .select('user_id,provider,environment,subscription_id,customer_id,status,plan,price_id,currency,amount_minor,billing_interval,current_period_start,current_period_end,cancel_at_period_end,cancel_at,canceled_at,source_event_id,observed_at,updated_at')
      .order('observed_at', { ascending: false })
      .limit(500),
    adminClient
      .from('billing_transactions')
      .select('user_id,provider,environment,transaction_id,transaction_type,subscription_id,status,currency,amount_minor,occurred_at,source_event_id,observed_at,updated_at')
      .order('occurred_at', { ascending: false })
      .limit(500),
  ]);
  const missingTable = (error: { code?: string } | null) => error?.code === '42P01' || error?.code === 'PGRST205';
  if (subscriptionsResult.error && !missingTable(subscriptionsResult.error)) throw new Error('Could not load billing subscription projections');
  if (transactionsResult.error && !missingTable(transactionsResult.error)) throw new Error('Could not load billing transaction projections');

  const subscriptions = (subscriptionsResult.data || []) as Array<Record<string, unknown> & { user_id?: string | null }>;
  const transactions = (transactionsResult.data || []) as Array<Record<string, unknown> & { user_id?: string | null }>;
  const profiles = await fetchPublicUserRows([
    ...new Set([
      ...subscriptions.map((row) => row.user_id).filter((value): value is string => typeof value === 'string'),
      ...transactions.map((row) => row.user_id).filter((value): value is string => typeof value === 'string'),
    ]),
  ]);
  const withCustomer = (row: Record<string, unknown> & { user_id?: string | null }) => ({
    ...row,
    userId: row.user_id || null,
    userEmail: row.user_id ? profiles.get(row.user_id)?.email || '' : '',
  });

  return {
    available: !subscriptionsResult.error && !transactionsResult.error,
    subscriptions: subscriptions.map(withCustomer),
    transactions: transactions.map(withCustomer),
  };
};

const billingActionValues = (payload: Record<string, unknown>) => {
  const provider = sanitizeString(payload.provider, '').toLowerCase();
  const environment = sanitizeString(payload.environment, '').toLowerCase();
  const operation = sanitizeString(payload.operation, '').toLowerCase();
  const targetUserId = sanitizeString(payload.targetUserId);
  const subscriptionId = sanitizeString(payload.subscriptionId) || null;
  const transactionId = sanitizeString(payload.transactionId) || null;
  const providerPaymentId = sanitizeString(payload.providerPaymentId) || null;
  const targetPriceId = sanitizeString(payload.targetPriceId) || null;
  const targetPlan = sanitizeString(payload.targetPlan) || null;
  const currency = sanitizeString(payload.currency, '').toLowerCase() || null;
  const rawAmount = payload.amountMinor === null || typeof payload.amountMinor === 'undefined' ? null : Number(payload.amountMinor);
  const amountMinor = rawAmount === null ? null : (Number.isSafeInteger(rawAmount) ? rawAmount : Number.NaN);
  const reason = sanitizeString(payload.reason, '').slice(0, 1000);
  const cancelAtPeriodEnd = payload.cancelAtPeriodEnd === true;
  if (!['stripe', 'paypal'].includes(provider) || !['live', 'test'].includes(environment)
    || !['cancel', 'resume', 'plan_change', 'refund'].includes(operation)
    || !targetUserId || !reason || (amountMinor !== null && (!Number.isSafeInteger(amountMinor) || amountMinor < 1 || amountMinor > 100000000))
    || (currency !== null && !/^[a-z]{3}$/.test(currency))) {
    throw new Error('Invalid billing action request');
  }
  if (['cancel', 'resume', 'plan_change'].includes(operation) && !subscriptionId) throw new Error('A subscription is required for this billing action');
  if (operation === 'plan_change' && !targetPriceId && !targetPlan) throw new Error('A target plan is required for this billing action');
  if (operation === 'refund' && (!providerPaymentId || amountMinor === null)) throw new Error('A payment reference and refund amount are required');
  return { provider, environment, operation, targetUserId, subscriptionId, transactionId, providerPaymentId, targetPriceId, targetPlan, currency, amountMinor, reason, cancelAtPeriodEnd };
};

const fetchBillingActionPreview = async (payload: Record<string, unknown>) => {
  const input = billingActionValues(payload);
  const [capabilityResult, subscriptionResult, transactionResult] = await Promise.all([
    adminClient
      .from('billing_action_capabilities')
      .select('provider,environment,operation,enabled,supports_preview,requires_owner,max_amount_minor,allowed_currencies,updated_at')
      .eq('provider', input.provider)
      .eq('environment', input.environment)
      .eq('operation', input.operation)
      .maybeSingle(),
    input.subscriptionId
      ? adminClient
        .from('billing_subscriptions')
        .select('user_id,provider,environment,subscription_id,customer_id,status,plan,price_id,currency,amount_minor,billing_interval,current_period_start,current_period_end,cancel_at_period_end,cancel_at,canceled_at,observed_at')
        .eq('provider', input.provider)
        .eq('environment', input.environment)
        .eq('subscription_id', input.subscriptionId)
        .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    input.transactionId
      ? adminClient
        .from('billing_transactions')
        .select('user_id,provider,environment,transaction_id,transaction_type,subscription_id,status,currency,amount_minor,occurred_at,observed_at')
        .eq('provider', input.provider)
        .eq('environment', input.environment)
        .eq('transaction_id', input.transactionId)
        .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (capabilityResult.error && !isMissingTableError(capabilityResult.error)) throw new Error('Billing action capability status could not be loaded');
  if (subscriptionResult.error && !isMissingTableError(subscriptionResult.error)) throw new Error('Billing subscription preview could not be loaded');
  if (transactionResult.error && !isMissingTableError(transactionResult.error)) throw new Error('Billing transaction preview could not be loaded');

  const capability = capabilityResult.data || null;
  const subscription = subscriptionResult.data || null;
  const transaction = transactionResult.data || null;
  if (subscription && subscription.user_id !== input.targetUserId) throw new Error('Billing subscription ownership could not be verified');
  if (transaction && transaction.user_id !== input.targetUserId) throw new Error('Billing transaction ownership could not be verified');

  const migrationAvailable = !capabilityResult.error && !subscriptionResult.error && !transactionResult.error;
  const recordAvailable = input.operation === 'refund' ? Boolean(transaction) : Boolean(subscription);
  const available = Boolean(migrationAvailable && capability?.enabled && capability?.supports_preview && recordAvailable);
  const reason = !migrationAvailable
    ? 'migration_required'
    : !capability
      ? 'provider_capability_missing'
      : !capability.enabled
        ? 'provider_capability_disabled'
        : !capability.supports_preview
          ? 'provider_preview_unconfigured'
          : !recordAvailable ? 'billing_projection_not_found' : 'ready_for_provider_preview';
  return {
    available,
    reason,
    provider: input.provider,
    environment: input.environment,
    operation: input.operation,
    targetUserId: input.targetUserId,
    limits: capability ? {
      maxAmountMinor: capability.max_amount_minor,
      allowedCurrencies: capability.allowed_currencies || [],
      requiresOwner: capability.requires_owner,
    } : null,
    current: subscription || transaction || null,
    providerPreviewAvailable: false,
    providerPreview: null,
  };
};

const createBillingActionIntent = async (adminUserId: string, adminRole: AdminRole, payload: Record<string, unknown>, requestHash: string, idempotencyKey: string) => {
  const input = billingActionValues(payload);
  const preview = await fetchBillingActionPreview(payload);
  if (!preview.available) throw new Error(`Billing action is unavailable: ${preview.reason}`);
  if (preview.limits?.requiresOwner && adminRole !== 'owner') throw new Error('Owner access required for this billing action');
  if (input.operation === 'refund' && preview.limits?.maxAmountMinor !== null && input.amountMinor && input.amountMinor > Number(preview.limits?.maxAmountMinor)) {
    throw new Error('Refund exceeds the configured amount limit');
  }
  const { data, error } = await adminClient.rpc('billing_create_action_intent', {
    p_actor_user_id: adminUserId,
    p_target_user_id: input.targetUserId,
    p_provider: input.provider,
    p_environment: input.environment,
    p_operation: input.operation,
    p_idempotency_key: idempotencyKey,
    p_request_hash: requestHash,
    p_subscription_id: input.subscriptionId,
    p_transaction_id: input.transactionId,
    p_provider_payment_id: input.providerPaymentId,
    p_target_price_id: input.targetPriceId,
    p_target_plan: input.targetPlan,
    p_cancel_at_period_end: input.cancelAtPeriodEnd,
    p_currency: input.currency,
    p_amount_minor: input.amountMinor,
    p_reason: input.reason,
    p_preview: preview,
    p_expected_observed_at: typeof preview.current?.observed_at === 'string' ? preview.current.observed_at : null,
  });
  if (error) {
    if (error.message?.includes('unsupported')) throw new Error('Billing action is unavailable: provider capability is disabled');
    throw new Error('Billing action intent could not be created');
  }
  await auditEvent(adminUserId, 'billing.action.intent_created', input.targetUserId, {
    intentId: data?.intentId || null,
    provider: input.provider,
    environment: input.environment,
    operation: input.operation,
    amountMinor: input.amountMinor,
    currency: input.currency,
    reason: input.reason,
  });
  return data;
};

const fetchBillingReconciliationHealth = async () => {
  const { data, error } = await adminClient
    .from('billing_reconciliation_runs')
    .select('id,provider,environment,status,worker_id,locked_until,started_at,completed_at,processed_count,failed_count,error,created_at')
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') return { available: false, runs: [] };
    throw new Error('Could not load billing reconciliation health');
  }
  return { available: true, runs: data || [] };
};

const fetchBillingEventHistory = async () => {
  const [stripeResult, providerResult] = await Promise.all([
    adminClient
      .from('stripe_webhook_events')
      .select('event_id,event_type,status,error,created_at,processed_at')
      .order('created_at', { ascending: false })
      .limit(200),
    adminClient
      .from('billing_provider_events')
      .select('provider,event_id,event_type,status,error,created_at,processed_at')
      .order('created_at', { ascending: false })
      .limit(200),
  ]);
  const missingTable = (error: { code?: string } | null) => error?.code === '42P01' || error?.code === 'PGRST205';
  if (stripeResult.error && !missingTable(stripeResult.error)) throw new Error('Could not load Stripe event history');
  if (providerResult.error && !missingTable(providerResult.error)) throw new Error('Could not load provider event history');

  const events: Array<Record<string, unknown>> = [
    ...((stripeResult.data || []) as Array<Record<string, unknown>>).map((event) => ({ ...event, provider: 'stripe' })),
    ...((providerResult.data || []) as Array<Record<string, unknown>>),
  ];
  return events
    .sort((left, right) => Date.parse(String(right.created_at || '')) - Date.parse(String(left.created_at || '')))
    .slice(0, 200);
};

const safeRecentSignupCount = async () => {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await adminClient
    .from('users')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', since);
  if (error) throw new Error('Could not count recent signups');
  return count || 0;
};

const buildOverview = async () => {
  const directory = await fetchAdminDirectory({ limit: 50 });
  if (!directory.available) return buildLegacyOverview();

  const [totalUsers, recentSignups, adminMembers, errors, audit, billingEntitlements, billingEvents, billingProjections, billingReconciliationHealth, usageSummary, jobsSummary, resumes, applications, autoApplyJobs, contactInquiries, newsletterSubscribers, signupEvents, purchaseEvents] = await Promise.all([
    safeCount('users'),
    safeRecentSignupCount(),
    fetchAdminMembers(),
    fetchErrors(),
    fetchAudit(),
    fetchBillingLedger(),
    fetchBillingEventHistory(),
    fetchBillingProjections(),
    fetchBillingReconciliationHealth(),
    fetchUsageSummary(),
    fetchAutoApplySummary(),
    safeCount('resumes'),
    safeCount('job_applications'),
    safeCount('auto_apply_jobs'),
    safeCount('contact_inquiries'),
    safeCount('newsletter_subscribers'),
    safeEventCount('account_created'),
    safeEventCount('purchase_confirmed'),
  ]);
  const paidConversionRate = Number.isFinite(Number(signupEvents)) && Number.isFinite(Number(purchaseEvents)) && Number(signupEvents) > 0
    ? Number(((Number(purchaseEvents) / Number(signupEvents)) * 100).toFixed(2))
    : null;

  return {
    generatedAt: new Date().toISOString(),
    analytics: {
      totalUsers,
      premiumUsers: usageSummary?.premiumUsers ?? null,
      freeUsers: usageSummary?.freeUsers ?? null,
      bannedUsers: null,
      adminUsers: adminMembers.filter((member) => member.is_active).length,
      recentSignups,
      unresolvedErrors: errors.filter((error) => !error.resolved_at).length,
      totalAiUsed: usageSummary?.totalAiUsed ?? null,
      totalAiLimit: usageSummary?.totalAiLimit ?? null,
      resumes,
      applications,
      autoApplyJobs,
      contactInquiries,
      newsletterSubscribers,
      signupEvents,
      purchaseEvents,
      paidConversionRate,
    },
    users: directory.items,
    errors,
    audit,
    adminMembers,
    billingEntitlements,
    billingEvents,
    billingSubscriptions: billingProjections.subscriptions,
    billingTransactions: billingProjections.transactions,
    billingProjectionsAvailable: billingProjections.available,
    billingReconciliationAvailable: billingReconciliationHealth.available,
    billingReconciliationRuns: billingReconciliationHealth.runs,
    jobs: jobsSummary,
  };
};

const auditEvent = async (
  adminUserId: string,
  action: string,
  targetUserId: string | null,
  metadata: Record<string, unknown> = {},
) => {
  const { error } = await adminClient.from('admin_audit_events').insert({
    admin_user_id: adminUserId,
    target_user_id: targetUserId,
    action,
    metadata,
  });

  if (error) {
    console.error('[admin-api] audit write failed', {
      action,
      targetUserId,
      errorCode: error.code,
    });
    throw new Error('Could not write admin audit event');
  }
};

const performAutoApplyJobAction = async (
  adminUserId: string,
  operationId: string,
  payload: Record<string, unknown>,
) => {
  const jobId = sanitizeString(payload.jobId);
  const action = sanitizeString(payload.operation).toLowerCase();
  const reason = sanitizeString(payload.reason).slice(0, 500);
  if (!jobId) throw new Error('Missing auto-apply job ID');
  if (!(AUTO_APPLY_JOB_ACTIONS as readonly string[]).includes(action)) throw new Error('Unsupported auto-apply job action');
  if (reason.length < 3) throw new Error('A reason is required for this auto-apply action');
  if (!operationId) throw new Error('Missing admin operation receipt');

  const { data: job, error: jobError } = await adminClient
    .from('auto_apply_jobs')
    .select('id,user_id,title,company,status,match_score,email_sent_at,gmail_message_id,brevo_message_id,failure_reason')
    .eq('id', jobId)
    .maybeSingle();
  if (jobError || !job) throw new Error('Auto-apply job not found');

  const { data: actionRow, error: actionError } = await adminClient
    .from('auto_apply_job_admin_actions')
    .insert({
      operation_id: operationId,
      job_id: job.id,
      actor_user_id: adminUserId,
      action,
      status: 'requested',
      reason,
    })
    .select('id')
    .single();
  if (actionError || !actionRow) {
    console.error('[admin-api] auto-apply action ledger insert failed', { action, errorCode: actionError?.code });
    throw new Error('Could not record the auto-apply action');
  }

  const finishAction = async (status: 'completed' | 'failed' | 'pending_reconciliation', result: Record<string, unknown>) => {
    const { error } = await adminClient
      .from('auto_apply_job_admin_actions')
      .update({ status, result })
      .eq('id', actionRow.id);
    if (error) throw new Error('Could not complete the auto-apply action receipt');
  };

  try {
    if (action === 'retry') {
      if (job.status !== 'failed' || job.email_sent_at || job.gmail_message_id || job.brevo_message_id) {
        throw new Error('Only a failed job without an outbound message can be retried safely');
      }
      const { data: updated, error } = await adminClient
        .from('auto_apply_jobs')
        .update({ status: 'queued', failure_reason: null })
        .eq('id', job.id)
        .eq('status', 'failed')
        .is('email_sent_at', null)
        .is('gmail_message_id', null)
        .is('brevo_message_id', null)
        .select('id,status,updated_at')
        .maybeSingle();
      if (error || !updated) throw new Error('The job changed before it could be re-queued');
      const result = { jobId: job.id, action, status: updated.status, updatedAt: updated.updated_at };
      await finishAction('completed', result);
      await auditEvent(adminUserId, 'auto_apply.job.retried', job.user_id, { jobId: job.id, reason });
      return result;
    }

    if (action === 'cancel') {
      if (!['discovered', 'queued'].includes(job.status)) {
        throw new Error('Only discovered or queued jobs can be cancelled before external work starts');
      }
      const { data: updated, error } = await adminClient
        .from('auto_apply_jobs')
        .update({ status: 'skipped', failure_reason: `Cancelled by administrator: ${reason}` })
        .eq('id', job.id)
        .in('status', ['discovered', 'queued'])
        .select('id,status,updated_at')
        .maybeSingle();
      if (error || !updated) throw new Error('The job changed before it could be cancelled');
      const result = { jobId: job.id, action, status: updated.status, updatedAt: updated.updated_at };
      await finishAction('completed', result);
      await auditEvent(adminUserId, 'auto_apply.job.cancelled', job.user_id, { jobId: job.id, reason });
      return result;
    }

    const hasOutboundReceipt = Boolean(job.email_sent_at || job.gmail_message_id || job.brevo_message_id);
    if (job.status !== 'applying' && !(job.status === 'failed' && hasOutboundReceipt)) {
      throw new Error('Only an applying job or a failed job with an outbound receipt can be reconciled');
    }
    const result = {
      jobId: job.id,
      action,
      status: 'pending_reconciliation',
      externalReceiptPresent: hasOutboundReceipt,
    };
    await finishAction('pending_reconciliation', result);
    await auditEvent(adminUserId, 'auto_apply.job.reconciliation_requested', job.user_id, { jobId: job.id, reason });
    return result;
  } catch (error) {
    try {
      await finishAction('failed', { error: error instanceof Error ? error.message : 'Auto-apply action failed' });
    } catch (receiptError) {
      console.error('[admin-api] auto-apply action failure receipt could not be stored', { errorCode: receiptError instanceof Error ? receiptError.message : 'unknown' });
    }
    throw error;
  }
};

const getAuthUserById = async (userId: string) => {
  const { data, error } = await adminClient.auth.admin.getUserById(userId);
  if (error || !data.user) {
    throw new Error('Target user not found');
  }
  return data.user;
};

const ensureOwnerSurvival = async (targetUserId: string) => {
  const { data: targetMember, error: memberError } = await adminClient
    .from('admin_members')
    .select('role,is_active')
    .eq('user_id', targetUserId)
    .eq('is_active', true)
    .maybeSingle();
  if (memberError) throw new Error('Could not verify owner safeguards');
  if (targetMember?.role !== 'owner') return;

  const { count, error: ownerCountError } = await adminClient
    .from('admin_members')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'owner')
    .eq('is_active', true);
  if (ownerCountError) throw new Error('Could not verify owner safeguards');
  if ((count || 0) <= 1) throw new Error('The last active owner must remain available');
};

const setPremium = async (adminUserId: string, payload: Record<string, unknown>) => {
  const targetUserId = sanitizeString(payload.userId);
  if (!targetUserId) throw new Error('Missing userId');

  const targetUser = await getAuthUserById(targetUserId);
  const premium = payload.premium === true;
  const plan = premium ? sanitizeString(payload.plan, 'premium_monthly') : null;
  const aiLimit = premium ? Math.max(1, Number(payload.aiLimit || 30)) : 0;
  const premiumUntil = premium ? (sanitizeString(payload.premiumUntil) || null) : null;

  const { error } = premium
    ? (await adminClient.rpc('grant_manual_access', {
      p_user_id: targetUserId,
      p_grant_id: crypto.randomUUID(),
      p_granted_by: adminUserId,
      p_plan: plan,
      p_ai_limit: aiLimit,
      p_starts_at: new Date().toISOString(),
      p_expires_at: premiumUntil,
      p_reason: 'Manual admin grant',
    }))
    : (await adminClient.rpc('revoke_all_manual_access', { p_user_id: targetUserId }));

  if (error) throw error;

  await auditEvent(adminUserId, premium ? 'premium.grant' : 'premium.remove', targetUserId, {
    plan,
    aiLimit,
    premiumUntil,
    targetEmail: targetUser.email,
  });
};

const setAiLimit = async (adminUserId: string, payload: Record<string, unknown>) => {
  const targetUserId = sanitizeString(payload.userId);
  if (!targetUserId) throw new Error('Missing userId');

  const targetUser = await getAuthUserById(targetUserId);
  const rawLimit = Number(payload.aiLimit);
  if (!Number.isInteger(rawLimit) || rawLimit < 0 || rawLimit > 100000) {
    throw new Error('Enter a valid AI limit between 0 and 100000');
  }

  const resetUsage = payload.resetUsage === true;
  const updatePayload: Record<string, unknown> = {
    id: targetUserId,
    email: targetUser.email,
    ai_generations_limit: rawLimit,
    updated_at: new Date().toISOString(),
  };

  if (resetUsage) {
    updatePayload.ai_generations_used = 0;
  }

  const { data: existingProfile, error: profileError } = await adminClient
    .from('users')
    .select('ai_generations_used,ai_generations_limit,is_premium,premium_until')
    .eq('id', targetUserId)
    .maybeSingle();

  if (profileError) throw new Error('Could not load target profile');

  const { error } = await adminClient
    .from('users')
    .upsert(updatePayload, {
      onConflict: 'id',
      ignoreDuplicates: false,
    });

  if (error) throw error;

  await auditEvent(adminUserId, 'ai_limit.update', targetUserId, {
    previousLimit: existingProfile?.ai_generations_limit ?? null,
    previousUsed: existingProfile?.ai_generations_used ?? null,
    aiLimit: rawLimit,
    resetUsage,
    targetEmail: targetUser.email,
    targetIsPremium: Boolean(existingProfile?.is_premium),
    targetPremiumUntil: existingProfile?.premium_until || null,
  });
};

const setBan = async (adminUserId: string, payload: Record<string, unknown>) => {
  const targetUserId = sanitizeString(payload.userId);
  if (!targetUserId) throw new Error('Missing userId');
  if (targetUserId === adminUserId) throw new Error('You cannot ban your own account');
  if (payload.banned === true) await ensureOwnerSurvival(targetUserId);

  const targetUser = await getAuthUserById(targetUserId);
  const banned = payload.banned === true;
  const reason = sanitizeString(payload.reason, banned ? 'Admin action' : '');
  const nextMetadata = {
    ...(targetUser.app_metadata || {}),
    banned,
    ban_reason: banned ? reason : null,
    banned_at: banned ? new Date().toISOString() : null,
    banned_by: banned ? adminUserId : null,
  };

  const updatePayload: Record<string, unknown> = {
    app_metadata: nextMetadata,
    ban_duration: banned ? '876000h' : 'none',
  };

  const { error } = await adminClient.auth.admin.updateUserById(targetUserId, updatePayload);
  if (error) throw error;

  const { error: directoryError } = await adminClient
    .from('admin_user_directory')
    .update({
      is_banned: banned,
      ban_reason: banned ? reason : null,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', targetUserId);
  if (directoryError && directoryError.code !== '42P01' && directoryError.code !== 'PGRST205') {
    throw new Error('Could not update the customer directory');
  }

  await auditEvent(adminUserId, banned ? 'user.ban' : 'user.unban', targetUserId, {
    reason,
    targetEmail: targetUser.email,
  });
};

const requestDeletion = async (adminUserId: string, payload: Record<string, unknown>) => {
  const targetUserId = sanitizeString(payload.userId);
  if (!targetUserId) throw new Error('Missing userId');
  if (targetUserId === adminUserId) throw new Error('You cannot request deletion of your own account from the admin panel');
  await ensureOwnerSurvival(targetUserId);

  const targetUser = await getAuthUserById(targetUserId);
  const [entitlementResult, grantResult] = await Promise.all([
    adminClient
      .from('billing_entitlements')
      .select('provider,active,paid_until')
      .eq('user_id', targetUserId),
    adminClient
      .from('manual_access_grants')
      .select('starts_at,expires_at,revoked_at')
      .eq('user_id', targetUserId),
  ]);
  const missingBillingTable = (error: { code?: string } | null) => (
    error?.code === '42P01' || error?.code === 'PGRST205'
  );
  if (entitlementResult.error && !missingBillingTable(entitlementResult.error)) {
    throw new Error('Could not verify billing access before deletion');
  }
  if (grantResult.error && !missingBillingTable(grantResult.error)) {
    throw new Error('Could not verify manual access before deletion');
  }
  const now = Date.now();
  const activeEntitlement = (entitlementResult.data || []).some((row) => (
    row.active === true && (!row.paid_until || Date.parse(String(row.paid_until)) > now)
  ));
  const activeExternalEntitlement = (entitlementResult.data || []).some((row) => (
    row.active === true && ['stripe', 'paypal'].includes(row.provider)
  ));
  const activeManualEntitlement = (entitlementResult.data || []).some((row) => (
    row.active === true && row.provider === 'manual'
  ));
  const activeGrant = (grantResult.data || []).some((grant) => {
    const startsAt = Date.parse(String(grant.starts_at || ''));
    const expiresAt = grant.expires_at ? Date.parse(String(grant.expires_at)) : Number.POSITIVE_INFINITY;
    return !grant.revoked_at && Number.isFinite(startsAt) && startsAt <= now && expiresAt > now;
  });
  if ((activeManualEntitlement || (activeEntitlement && !activeExternalEntitlement)) || activeGrant) {
    throw new Error('Revoke active manual access before deleting this account');
  }

  const { data: existing, error: existingError } = await adminClient
    .from('privacy_deletion_jobs')
    .select('id,status,current_step')
    .eq('target_user_id', targetUserId)
    .in('status', ['pending', 'waiting_owner_approval', 'processing', 'waiting_hold', 'waiting_provider_cancellation'])
    .maybeSingle();
  if (existingError) {
    if (isMissingTableError(existingError)) throw new Error('Privacy lifecycle is not available until its migration is applied');
    throw new Error('Could not check existing deletion requests');
  }

  let deletionJobId = existing?.id || null;
  if (!existing) {
    const { data: inserted, error: insertError } = await adminClient
      .from('privacy_deletion_jobs')
      .insert({
        target_user_id: targetUserId,
        requested_by_user_id: adminUserId,
        status: 'pending',
        current_step: 'preview',
      })
      .select('id')
      .single();
    if (insertError) throw new Error('Could not create the deletion request');
    deletionJobId = inserted?.id || null;
  }
  if (!deletionJobId) throw new Error('Could not identify the deletion request');

  const { error: providerReviewError } = await adminClient.rpc('privacy_initialize_provider_cancellation_reviews', {
    p_job_id: deletionJobId,
  });
  if (providerReviewError) throw new Error('Could not prepare provider cancellation review');

  await auditEvent(adminUserId, 'user.delete.requested', targetUserId, {
    targetEmail: targetUser.email,
    durableWorkflow: true,
    existingRequest: Boolean(existing),
    externalProviderReview: activeExternalEntitlement,
  });
};

const requestExport = async (adminUserId: string, payload: Record<string, unknown>) => {
  const targetUserId = sanitizeString(payload.userId);
  if (!targetUserId) throw new Error('Missing userId');
  const targetUser = await getAuthUserById(targetUserId);
  const { data: existing, error: existingError } = await adminClient
    .from('privacy_export_jobs')
    .select('id,status')
    .eq('target_user_id', targetUserId)
    .in('status', ['pending', 'processing', 'ready'])
    .maybeSingle();
  if (existingError) {
    if (isMissingTableError(existingError)) throw new Error('Privacy lifecycle is not available until its migration is applied');
    throw new Error('Could not check existing export requests');
  }
  if (!existing) {
    const { error: insertError } = await adminClient
      .from('privacy_export_jobs')
      .insert({ target_user_id: targetUserId, requested_by_user_id: adminUserId, status: 'pending' });
    if (insertError) throw new Error('Could not create the export request');
  }
  await auditEvent(adminUserId, 'user.export.requested', targetUserId, {
    targetEmail: targetUser.email,
    durableWorkflow: true,
    existingRequest: Boolean(existing),
  });
};

const placePrivacyHold = async (adminUserId: string, payload: Record<string, unknown>) => {
  const targetUserId = sanitizeString(payload.userId);
  const holdType = sanitizeString(payload.holdType);
  const reason = sanitizeString(payload.reason);
  const expiresAt = sanitizeString(payload.expiresAt) || null;
  if (!targetUserId) throw new Error('Missing userId');
  if (!['legal', 'accounting', 'security', 'support'].includes(holdType)) throw new Error('Invalid privacy hold type');
  if (reason.length < 1 || reason.length > 2000) throw new Error('A hold reason is required');
  if (expiresAt && (Number.isNaN(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now())) {
    throw new Error('Hold expiry must be a future date');
  }
  const targetUser = await getAuthUserById(targetUserId);
  const { error } = await adminClient.from('privacy_holds').insert({
    target_user_id: targetUserId,
    hold_type: holdType,
    reason,
    expires_at: expiresAt,
    created_by_user_id: adminUserId,
  });
  if (error) {
    if (isMissingTableError(error)) throw new Error('Privacy lifecycle is not available until its migration is applied');
    throw new Error('Could not place the privacy hold');
  }
  await auditEvent(adminUserId, 'privacy.hold.placed', targetUserId, { holdType, expiresAt, targetEmail: targetUser.email });
};

const releasePrivacyHold = async (adminUserId: string, payload: Record<string, unknown>) => {
  const holdId = sanitizeString(payload.holdId);
  if (!holdId) throw new Error('Missing holdId');
  const { data: hold, error: holdError } = await adminClient
    .from('privacy_holds')
    .select('id,target_user_id,released_at')
    .eq('id', holdId)
    .maybeSingle();
  if (holdError || !hold) throw new Error('Privacy hold not found');
  if (!hold.released_at) {
    const { error } = await adminClient
      .from('privacy_holds')
      .update({ released_at: new Date().toISOString(), released_by_user_id: adminUserId, updated_at: new Date().toISOString() })
      .eq('id', holdId)
      .is('released_at', null);
    if (error) throw new Error('Could not release the privacy hold');
  }
  await auditEvent(adminUserId, 'privacy.hold.released', hold.target_user_id, { holdId, alreadyReleased: Boolean(hold.released_at) });
};

const cancelPrivacyDeletion = async (adminUserId: string, payload: Record<string, unknown>) => {
  const jobId = sanitizeString(payload.jobId);
  const userId = sanitizeString(payload.userId);
  if (!jobId && !userId) throw new Error('Missing deletion request');
  let query = adminClient
    .from('privacy_deletion_jobs')
    .select('id,target_user_id,status')
    .in('status', ['pending', 'waiting_owner_approval', 'waiting_hold', 'waiting_provider_cancellation']);
  query = jobId ? query.eq('id', jobId) : query.eq('target_user_id', userId);
  const { data: job, error: jobError } = await query.maybeSingle();
  if (jobError || !job) throw new Error('No cancellable deletion request found');
  const { error } = await adminClient
    .from('privacy_deletion_jobs')
    .update({ status: 'cancelled', current_step: 'complete', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', job.id)
    .in('status', ['pending', 'waiting_owner_approval', 'waiting_hold', 'waiting_provider_cancellation']);
  if (error) throw new Error('Could not cancel the deletion request');
  await auditEvent(adminUserId, 'privacy.deletion.cancelled', job.target_user_id, { jobId: job.id });
};

const recordProviderCancellationReview = async (adminUserId: string, payload: Record<string, unknown>) => {
  const reviewId = sanitizeString(payload.reviewId);
  const evidenceReference = sanitizeString(payload.evidenceReference);
  const reason = sanitizeString(payload.reason);
  if (!reviewId) throw new Error('Missing provider cancellation review');
  if (evidenceReference.length < 1 || evidenceReference.length > 500) {
    throw new Error('A provider cancellation evidence reference is required');
  }
  if (reason.length < 1 || reason.length > 2000) {
    throw new Error('A provider cancellation review note is required');
  }

  const { data, error } = await adminClient.rpc('privacy_record_provider_cancellation_review', {
    p_review_id: reviewId,
    p_actor_user_id: adminUserId,
    p_evidence_reference: evidenceReference,
    p_reason: reason,
  });
  if (error || !data) throw new Error(error?.message || 'Could not record provider cancellation review');

  await auditEvent(adminUserId, 'privacy.provider_cancellation.reviewed', data.targetUserId, {
    reviewId,
    jobId: data.jobId,
    provider: data.provider,
    subscriptionId: data.subscriptionId,
    evidenceReference,
  });
};

const approvePrivacyDeletion = async (adminUserId: string, payload: Record<string, unknown>) => {
  const jobId = sanitizeString(payload.jobId);
  if (!jobId) throw new Error('Missing deletion request');

  const { data, error } = await adminClient.rpc('privacy_approve_deletion_job', {
    p_job_id: jobId,
    p_actor_user_id: adminUserId,
  });
  if (error || !data) throw new Error(error?.message || 'Could not approve the deletion request');

  await auditEvent(adminUserId, 'privacy.deletion.owner_approved', data.targetUserId, {
    jobId,
    alreadyApproved: Boolean(data.alreadyApproved),
  });
};

const resolveError = async (adminUserId: string, payload: Record<string, unknown>) => {
  const errorId = sanitizeString(payload.errorId);
  if (!errorId) throw new Error('Missing errorId');

  const { error } = await adminClient
    .from('app_error_events')
    .update({
      resolved_at: new Date().toISOString(),
      resolved_by: adminUserId,
    })
    .eq('id', errorId);

  if (error) throw error;

  await auditEvent(adminUserId, 'error.resolve', null, { errorId });
};

const grantAdmin = async (
  adminUserId: string,
  membership: AdminMember,
  payload: Record<string, unknown>,
) => {
  requireOwner(membership);
  const email = normalizeEmail(sanitizeString(payload.email));
  const role = sanitizeString(payload.role, 'admin') as AdminRole;
  if (!email) throw new Error('Missing email');
  if (!['owner', 'admin', 'support'].includes(role)) throw new Error('Invalid admin role');

  const authUsers = await listAuthUsers();
  const targetUser = authUsers.find((user) => normalizeEmail(`${user.email || ''}`) === email);
  const invitationSentAt = targetUser ? null : new Date().toISOString();
  const invitationExpiresAt = targetUser
    ? null
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await adminClient
    .from('admin_members')
    .upsert({
      email,
      user_id: targetUser?.id || null,
      role,
      is_active: true,
      granted_by: adminUserId,
      invitation_sent_at: invitationSentAt,
      invitation_expires_at: invitationExpiresAt,
      invitation_revoked_at: null,
    }, {
      onConflict: 'email',
      ignoreDuplicates: false,
    });

  if (error) throw error;

  if (targetUser) {
    await adminClient.auth.admin.updateUserById(targetUser.id, {
      app_metadata: {
        ...(targetUser.app_metadata || {}),
        role: role === 'owner' ? 'owner' : 'admin',
        is_admin: true,
      },
    });
  }

  await auditEvent(adminUserId, 'admin.grant', targetUser?.id || null, {
    email,
    role,
    pendingInvitation: !targetUser,
    invitationExpiresAt,
  });
};

const revokeAdmin = async (
  adminUserId: string,
  membership: AdminMember,
  payload: Record<string, unknown>,
) => {
  requireOwner(membership);
  const memberId = sanitizeString(payload.memberId);
  if (!memberId) throw new Error('Missing memberId');
  if (memberId === membership.id) throw new Error('You cannot revoke your own owner access');

  const { data: member, error: memberError } = await adminClient.rpc('admin_revoke_member', {
    p_actor_user_id: adminUserId,
    p_member_id: memberId,
  });

  if (memberError || !member) throw new Error(memberError?.message || 'Could not revoke admin access');

  if (member.user_id) {
    const targetUser = await getAuthUserById(member.user_id).catch(() => null);
    if (targetUser) {
      const metadata = { ...(targetUser.app_metadata || {}) };
      delete metadata.role;
      delete metadata.is_admin;
      await adminClient.auth.admin.updateUserById(member.user_id, { app_metadata: metadata });
    }
  }

};

const updateAdminRole = async (
  adminUserId: string,
  membership: AdminMember,
  payload: Record<string, unknown>,
) => {
  requireOwner(membership);
  const memberId = sanitizeString(payload.memberId);
  const nextRole = sanitizeString(payload.role) as AdminRole;
  if (!memberId) throw new Error('Missing memberId');
  if (!['owner', 'admin', 'support'].includes(nextRole)) throw new Error('Invalid admin role');
  if (memberId === membership.id) throw new Error('You cannot change your own owner role');

  const { data: member, error: memberError } = await adminClient.rpc('admin_update_member_role', {
    p_actor_user_id: adminUserId,
    p_member_id: memberId,
    p_role: nextRole,
  });
  if (memberError || !member) throw new Error(memberError?.message || 'Could not update admin role');

  if (member.user_id) {
    const targetUser = await getAuthUserById(member.user_id).catch(() => null);
    if (targetUser) {
      await adminClient.auth.admin.updateUserById(member.user_id, {
        app_metadata: {
          ...(targetUser.app_metadata || {}),
          role: nextRole === 'owner' ? 'owner' : 'admin',
          is_admin: true,
        },
      });
    }
  }

};

serve(async (req) => {
  const origin = req.headers.get('Origin');

  if (!isOriginAllowed(origin)) {
    return jsonResponse({ error: 'Origin not allowed' }, 403, origin);
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders(origin) });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, origin);
  }

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return jsonResponse({ error: 'Server misconfiguration' }, 500, origin);
  }

  let operationContext: { key: string; requestHash: string; id: string } | null = null;
  let operationStarted = false;
  let operationActorId = '';

  try {
    const adminContext = await requireAdmin(req);
    const { user, membership } = adminContext;
    operationActorId = user.id;
    if (!consumeAdminRateLimit(user.id)) {
      return new Response(JSON.stringify({ ok: false, code: 'rate_limited', error: 'Too many admin requests. Please wait and retry.' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Retry-After': '60', ...getCorsHeaders(origin) },
      });
    }
    const contentLength = Number(req.headers.get('Content-Length') || '0');
    if (contentLength > ADMIN_BODY_LIMIT) {
      return jsonResponse({ ok: false, code: 'payload_too_large', error: 'Admin request payload is too large' }, 413, origin);
    }
    const rawBody = await req.text();
    if (rawBody.length > ADMIN_BODY_LIMIT) {
      return jsonResponse({ ok: false, code: 'payload_too_large', error: 'Admin request payload is too large' }, 413, origin);
    }
    let body: Record<string, unknown>;
    try {
      const parsed = rawBody ? JSON.parse(rawBody) : {};
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid body');
      body = parsed as Record<string, unknown>;
    } catch {
      return jsonResponse({ ok: false, code: 'invalid_json', error: 'Admin request body must be valid JSON' }, 400, origin);
    }
    const action = sanitizeString(body.action, 'overview');
    const payload = (body.payload && typeof body.payload === 'object' ? body.payload : body) as Record<string, unknown>;
    const idempotencyKey = sanitizeString(req.headers.get('x-admin-idempotency-key'));

    if (ADMIN_AAL2_ACTIONS.has(action)) requireAal2(adminContext);

    if (!ADMIN_READ_ACTIONS.has(action)) {
      if (idempotencyKey.length < 8 || idempotencyKey.length > 200) {
        return jsonResponse({
          ok: false,
          code: 'idempotency_key_required',
          error: 'A valid idempotency key is required for admin mutations',
        }, 400, origin);
      }

      const requestHash = await hashRequest(action, payload);
      const { data: reserved, error: reserveError } = await adminClient.rpc('reserve_admin_operation', {
        p_actor_user_id: user.id,
        p_actor_email: user.email || null,
        p_action: action,
        p_idempotency_key: idempotencyKey,
        p_request_hash: requestHash,
      });

      if (reserveError) {
        console.error('[admin-api] operation reservation failed', { action, errorCode: reserveError.code });
        throw new Error('Could not reserve the admin operation');
      }

      const operation = (Array.isArray(reserved) ? reserved[0] : reserved) as {
        operation_id?: string;
        is_new?: boolean;
        status?: string;
        response_body?: Record<string, unknown> | null;
        error_code?: string | null;
        error_message?: string | null;
      } | null;

      if (!operation?.operation_id) throw new Error('Could not reserve the admin operation');
      if (!operation.is_new) {
        if (operation.status === 'succeeded' && operation.response_body) {
          return jsonResponse(operation.response_body, 200, origin);
        }
        if (operation.status === 'in_progress' || operation.status === 'pending_reconciliation') {
          return jsonResponse({
            ok: false,
            code: 'operation_pending_reconciliation',
            requestId: operation.operation_id,
            error: 'This admin operation is still being reconciled. Refresh before retrying.',
          }, 409, origin);
        }
        return jsonResponse({
          ok: false,
          code: operation.error_code || 'admin_operation_failed',
          requestId: operation.operation_id,
          error: operation.error_message || 'This admin operation previously failed.',
        }, 400, origin);
      }

      operationContext = { key: idempotencyKey, requestHash, id: operation.operation_id };
    }

    if (action === 'directory') {
      requireAnyRole(membership, ['owner', 'admin', 'support']);
      const directory = await fetchAdminDirectory(payload);
      return jsonResponse({
        ok: true,
        admin: {
          id: user.id,
          email: user.email,
          role: membership.role,
        },
        directory,
      }, 200, origin);
    }

    if (action === 'analytics') {
      requireAnyRole(membership, ['owner', 'admin', 'support']);
      const analytics = await fetchAnalyticsSnapshot(payload);
      return jsonResponse({
        ok: true,
        admin: {
          id: user.id,
          email: user.email,
          role: membership.role,
        },
        analytics,
      }, 200, origin);
    }

    if (action === 'analyticsCsv') {
      requireAnyRole(membership, ['owner', 'admin', 'support']);
      const analytics = await fetchAnalyticsSnapshot(payload);
      return jsonResponse({
        ok: true,
        admin: {
          id: user.id,
          email: user.email,
          role: membership.role,
        },
        analyticsCsv: {
          filename: `resumeats-analytics-${analytics.window.from.slice(0, 10)}-${analytics.window.to.slice(0, 10)}.csv`,
          contentType: 'text/csv;charset=utf-8',
          content: buildAnalyticsCsv(analytics),
        },
      }, 200, origin);
    }

    if (action === 'customer') {
      requireAnyRole(membership, ['owner', 'admin', 'support']);
      const customer = await fetchCustomerDetail(payload);
      return jsonResponse({
        ok: true,
        admin: {
          id: user.id,
          email: user.email,
          role: membership.role,
        },
        customer,
      }, 200, origin);
    }

    if (action === 'privacy') {
      requireAnyRole(membership, ['owner', 'admin', 'support']);
      const privacy = await fetchPrivacyStatus(payload);
      return jsonResponse({
        ok: true,
        admin: {
          id: user.id,
          email: user.email,
          role: membership.role,
        },
        privacy,
      }, 200, origin);
    }

    if (action === 'settings') {
      requireAdminOrOwner(membership);
      const settings = await fetchAdminSettings();
      return jsonResponse({
        ok: true,
        admin: {
          id: user.id,
          email: user.email,
          role: membership.role,
        },
        settings,
      }, 200, origin);
    }

    if (action === 'billingActionPreview') {
      requireAdminOrOwner(membership);
      return jsonResponse({
        ok: true,
        admin: { id: user.id, email: user.email, role: membership.role },
        billingActionPreview: await fetchBillingActionPreview(payload),
      }, 200, origin);
    }

    if (action === 'jobOperations') {
      requireAnyRole(membership, ['owner', 'admin', 'support']);
      return jsonResponse({
        ok: true,
        admin: { id: user.id, email: user.email, role: membership.role },
        jobOperations: await fetchAdminJobOperations(payload),
      }, 200, origin);
    }

    let actionResult: Record<string, unknown> | null = null;
    let actionResultKey: 'billingAction' | 'autoApplyJobAction' | null = null;
    switch (action) {
      case 'overview':
        break;
      case 'setPremium':
        requireAdminOrOwner(membership);
        operationStarted = true;
        await setPremium(user.id, payload);
        break;
      case 'setAiLimit':
        requireAdminOrOwner(membership);
        operationStarted = true;
        await setAiLimit(user.id, payload);
        break;
      case 'banUser':
        requireAdminOrOwner(membership);
        operationStarted = true;
        await setBan(user.id, payload);
        break;
      case 'deleteUser':
        requireAdminOrOwner(membership);
        operationStarted = true;
        await requestDeletion(user.id, payload);
        break;
      case 'approvePrivacyDeletion':
        requireOwner(membership);
        operationStarted = true;
        await approvePrivacyDeletion(user.id, payload);
        break;
      case 'requestExport':
        requireAnyRole(membership, ['owner', 'admin', 'support']);
        operationStarted = true;
        await requestExport(user.id, payload);
        break;
      case 'placePrivacyHold':
        requireAdminOrOwner(membership);
        operationStarted = true;
        await placePrivacyHold(user.id, payload);
        break;
      case 'releasePrivacyHold':
        requireAdminOrOwner(membership);
        operationStarted = true;
        await releasePrivacyHold(user.id, payload);
        break;
      case 'cancelPrivacyDeletion':
        requireAdminOrOwner(membership);
        operationStarted = true;
        await cancelPrivacyDeletion(user.id, payload);
        break;
      case 'recordProviderCancellationReview':
        requireAdminOrOwner(membership);
        operationStarted = true;
        await recordProviderCancellationReview(user.id, payload);
        break;
      case 'resolveError':
        requireAnyRole(membership, ['owner', 'admin', 'support']);
        operationStarted = true;
        await resolveError(user.id, payload);
        break;
      case 'grantAdmin':
        operationStarted = true;
        await grantAdmin(user.id, membership, payload);
        break;
      case 'revokeAdmin':
        operationStarted = true;
        await revokeAdmin(user.id, membership, payload);
        break;
      case 'updateAdminRole':
        operationStarted = true;
        await updateAdminRole(user.id, membership, payload);
        break;
      case 'updateSupportAiSettings':
        requireAdminOrOwner(membership);
        operationStarted = true;
        await updateSupportAiSettings(user.id, payload);
        break;
      case 'updateSupportRoutingSettings':
        requireAdminOrOwner(membership);
        operationStarted = true;
        await updateSupportRoutingSettings(user.id, payload);
        break;
      case 'resetSupportAiCircuit':
        requireAdminOrOwner(membership);
        operationStarted = true;
        await resetSupportAiCircuit(user.id, payload);
        break;
      case 'rollbackSupportAiSettings':
        requireAdminOrOwner(membership);
        operationStarted = true;
        await rollbackSupportAiSettings(user.id, payload);
        break;
      case 'createBillingActionIntent':
        requireAdminOrOwner(membership);
        operationStarted = true;
        actionResult = await createBillingActionIntent(user.id, membership.role, payload, operationContext?.requestHash || '', operationContext?.key || idempotencyKey);
        actionResultKey = 'billingAction';
        break;
      case 'autoApplyJobAction':
        requireAdminOrOwner(membership);
        operationStarted = true;
        actionResult = await performAutoApplyJobAction(user.id, operationContext?.id || '', payload);
        actionResultKey = 'autoApplyJobAction';
        break;
      default:
        return jsonResponse({ error: 'Unknown admin action' }, 400, origin);
    }

    const overview = await buildOverview();
    const responseBody = {
      ok: true,
      requestId: operationContext?.id || null,
      admin: {
        id: user.id,
        email: user.email,
        role: membership.role,
      },
      ...overview,
      ...(actionResult && actionResultKey ? { [actionResultKey]: actionResult } : {}),
    };

    if (operationContext) {
      const { data: finished, error: finishError } = await adminClient.rpc('finish_admin_operation', {
        p_actor_user_id: user.id,
        p_idempotency_key: operationContext.key,
        p_request_hash: operationContext.requestHash,
        p_status: 'succeeded',
        p_response_body: responseBody,
      });
      if (finishError || finished !== true) {
        console.error('[admin-api] operation result could not be stored', {
          requestId: operationContext.id,
          errorCode: finishError?.code,
        });
        return jsonResponse({
          ok: false,
          code: 'operation_pending_reconciliation',
          requestId: operationContext.id,
          error: 'The change may have completed, but its receipt is still being reconciled.',
        }, 503, origin);
      }
    }

    return jsonResponse(responseBody, 200, origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Admin request failed';
    const operationStatus = operationContext ? (operationStarted ? 'pending_reconciliation' : 'failed') : null;
    if (operationContext) {
      const { error: finishError } = await adminClient.rpc('finish_admin_operation', {
        p_actor_user_id: operationActorId,
        p_idempotency_key: operationContext.key,
        p_request_hash: operationContext.requestHash,
        p_status: operationStatus,
        p_error_code: operationStatus === 'pending_reconciliation' ? 'operation_pending_reconciliation' : 'admin_operation_failed',
        p_error_message: message,
      });
      if (finishError) console.error('[admin-api] operation failure receipt could not be stored', { errorCode: finishError.code });
    }
    const status = operationStatus === 'pending_reconciliation'
      ? 503
      : /access required|owner access/i.test(message) ? 403 : /session|authorization/i.test(message) ? 401 : 400;
    return jsonResponse({ ok: false, error: message }, status, origin);
  }
});
