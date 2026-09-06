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

  return data.user;
};

const findAdminMembership = async (user: { id: string; email?: string | null; email_confirmed_at?: string | null; app_metadata?: Record<string, unknown> | null }) => {
  // The database is authoritative. Metadata may be stale after a revocation or
  // role change, and must never restore access when this lookup fails.
  const { data: linkedMember, error: linkedError } = await adminClient
    .from('admin_members')
    .select('id,email,user_id,role,is_active,created_at,updated_at')
    .eq('user_id', user.id)
    .maybeSingle();

  if (linkedError) throw new Error('Could not verify admin access');
  if (linkedMember) return linkedMember.is_active ? linkedMember as AdminMember : null;

  const email = normalizeEmail(user.email || '');
  if (email && user.email_confirmed_at) {
    const { data, error } = await adminClient
      .from('admin_members')
      .select('id,email,user_id,role,is_active,created_at,updated_at')
      .eq('email', email)
      .is('user_id', null)
      .eq('is_active', true)
      .maybeSingle();

    if (error) throw new Error('Could not verify admin access');
    if (data) {
      // Claim only unlinked invitations, and verify a concurrent request has not
      // revoked or claimed the invitation since it was read.
      const { data: claimed, error: claimError } = await adminClient
        .from('admin_members')
        .update({ user_id: user.id })
        .eq('id', data.id)
        .is('user_id', null)
        .eq('is_active', true)
        .select('id,email,user_id,role,is_active,created_at,updated_at')
        .maybeSingle();

      if (claimError) throw new Error('Could not verify admin access');
      return claimed as AdminMember | null;
    }
  }

  return null;
};

const requireAdmin = async (req: Request) => {
  const user = await getTokenUser(req);
  const membership = await findAdminMembership(user);

  if (!membership) {
    throw new Error('Admin access required');
  }

  return { user, membership };
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

const fetchAdminMembers = async () => {
  const { data, error } = await adminClient
    .from('admin_members')
    .select('id,email,user_id,role,is_active,created_at,updated_at')
    .order('created_at', { ascending: false });

  if (error) throw new Error('Could not load admin members');
  return data || [];
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

const buildOverview = async () => {
  const authUsers = await listAuthUsers();
  const profileRows = await fetchPublicUserRows(authUsers.map((user) => user.id));
  const adminMembers = await fetchAdminMembers();
  const users = authUsers.map((authUser) => {
    const profile = (profileRows.get(authUser.id) || {}) as Record<string, unknown>;
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
      isPremium: Boolean(profile.is_premium),
      premiumPlan: profile.premium_plan || null,
      premiumUntil: profile.premium_until || null,
      aiGenerationsUsed: profile.ai_generations_used || 0,
      aiGenerationsLimit: profile.ai_generations_limit || 0,
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
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const premiumUsers = users.filter((user) => user.isPremium).length;
  const bannedUsers = users.filter((user) => user.isBanned).length;
  const recentSignups = users.filter((user) => {
    const createdAt = user.createdAt ? new Date(user.createdAt).getTime() : 0;
    return Number.isFinite(createdAt) && now - createdAt <= sevenDaysMs;
  }).length;
  const totalAiUsed = users.reduce((sum, user) => sum + Number(user.aiGenerationsUsed || 0), 0);

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
    },
    users,
    errors,
    audit,
    adminMembers,
  };
};

const auditEvent = async (
  adminUserId: string,
  action: string,
  targetUserId: string | null,
  metadata: Record<string, unknown> = {},
) => {
  await adminClient.from('admin_audit_events').insert({
    admin_user_id: adminUserId,
    target_user_id: targetUserId,
    action,
    metadata,
  });
};

const getAuthUserById = async (userId: string) => {
  const { data, error } = await adminClient.auth.admin.getUserById(userId);
  if (error || !data.user) {
    throw new Error('Target user not found');
  }
  return data.user;
};

const setPremium = async (adminUserId: string, payload: Record<string, unknown>) => {
  const targetUserId = sanitizeString(payload.userId);
  if (!targetUserId) throw new Error('Missing userId');

  const targetUser = await getAuthUserById(targetUserId);
  const premium = payload.premium === true;
  const plan = premium ? sanitizeString(payload.plan, 'premium_monthly') : null;
  const aiLimit = premium ? Math.max(1, Number(payload.aiLimit || 30)) : 0;
  const premiumUntil = premium ? (sanitizeString(payload.premiumUntil) || null) : null;

  const { data: existingProfile, error: profileError } = await adminClient
    .from('users')
    .select('ai_generations_used')
    .eq('id', targetUserId)
    .maybeSingle();

  if (profileError) throw new Error('Could not load target profile');

  const { error } = await adminClient
    .from('users')
    .upsert({
      id: targetUserId,
      email: targetUser.email,
      is_premium: premium,
      premium_plan: plan,
      premium_until: premiumUntil,
      premium_updated_at: new Date().toISOString(),
      ai_generations_limit: aiLimit,
      ai_generations_used: premium ? Number(existingProfile?.ai_generations_used || 0) : 0,
    }, {
      onConflict: 'id',
      ignoreDuplicates: false,
    });

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

  await auditEvent(adminUserId, banned ? 'user.ban' : 'user.unban', targetUserId, {
    reason,
    targetEmail: targetUser.email,
  });
};

const deleteUser = async (adminUserId: string, payload: Record<string, unknown>) => {
  const targetUserId = sanitizeString(payload.userId);
  if (!targetUserId) throw new Error('Missing userId');
  if (targetUserId === adminUserId) throw new Error('You cannot delete your own account');

  const targetUser = await getAuthUserById(targetUserId);
  await auditEvent(adminUserId, 'user.delete.requested', targetUserId, {
    targetEmail: targetUser.email,
  });

  const { error } = await adminClient.auth.admin.deleteUser(targetUserId, true);
  if (error) throw error;

  await auditEvent(adminUserId, 'user.delete.completed', targetUserId, {
    targetEmail: targetUser.email,
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

  const { error } = await adminClient
    .from('admin_members')
    .upsert({
      email,
      user_id: targetUser?.id || null,
      role,
      is_active: true,
      granted_by: adminUserId,
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

  await auditEvent(adminUserId, 'admin.grant', targetUser?.id || null, { email, role });
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

  const { data: member, error: memberError } = await adminClient
    .from('admin_members')
    .select('id,email,user_id,role')
    .eq('id', memberId)
    .maybeSingle();

  if (memberError || !member) throw new Error('Admin member not found');

  const { error } = await adminClient
    .from('admin_members')
    .update({ is_active: false })
    .eq('id', memberId);

  if (error) throw error;

  if (member.user_id) {
    const targetUser = await getAuthUserById(member.user_id).catch(() => null);
    if (targetUser) {
      const metadata = { ...(targetUser.app_metadata || {}) };
      delete metadata.role;
      delete metadata.is_admin;
      await adminClient.auth.admin.updateUserById(member.user_id, { app_metadata: metadata });
    }
  }

  await auditEvent(adminUserId, 'admin.revoke', member.user_id || null, {
    email: member.email,
    role: member.role,
  });
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

  try {
    const { user, membership } = await requireAdmin(req);
    const body = await req.json().catch(() => ({}));
    const action = sanitizeString(body.action, 'overview');
    const payload = (body.payload && typeof body.payload === 'object' ? body.payload : body) as Record<string, unknown>;

    switch (action) {
      case 'overview':
        break;
      case 'setPremium':
        requireAdminOrOwner(membership);
        await setPremium(user.id, payload);
        break;
      case 'setAiLimit':
        requireAdminOrOwner(membership);
        await setAiLimit(user.id, payload);
        break;
      case 'banUser':
        requireAdminOrOwner(membership);
        await setBan(user.id, payload);
        break;
      case 'deleteUser':
        requireAdminOrOwner(membership);
        await deleteUser(user.id, payload);
        break;
      case 'resolveError':
        requireAnyRole(membership, ['owner', 'admin', 'support']);
        await resolveError(user.id, payload);
        break;
      case 'grantAdmin':
        await grantAdmin(user.id, membership, payload);
        break;
      case 'revokeAdmin':
        await revokeAdmin(user.id, membership, payload);
        break;
      default:
        return jsonResponse({ error: 'Unknown admin action' }, 400, origin);
    }

    const overview = await buildOverview();
    return jsonResponse({
      ok: true,
      admin: {
        id: user.id,
        email: user.email,
        role: membership.role,
      },
      ...overview,
    }, 200, origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Admin request failed';
    const status = /access required|owner access/i.test(message) ? 403 : /session|authorization/i.test(message) ? 401 : 400;
    return jsonResponse({ ok: false, error: message }, status, origin);
  }
});
