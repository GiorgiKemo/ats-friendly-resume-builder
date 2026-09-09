import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_PROJECT_REF = 'onuxzcectniowxqtmjpg';
const SUPABASE_ENV_FILE = '.env.supabase.local';

const requiredSecrets = {
  providerCredentials: [
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'PAYPAL_CLIENT_ID',
    'PAYPAL_CLIENT_SECRET',
    'BREVO_API_KEY',
  ],
  billingWorkers: [
    'BILLING_RECONCILIATION_SECRET',
    'BILLING_ACTION_WORKER_SECRET',
  ],
  supportWorkers: [
    'SUPPORT_NOTIFICATION_SECRET',
    'SUPPORT_ATTACHMENT_SCANNER_SECRET',
    'ATTACHMENT_SCANNER_URL',
    'ATTACHMENT_SCANNER_TOKEN',
  ],
  privacyWorkers: [
    'PRIVACY_WORKER_SECRET',
    'PRIVACY_DELETION_WORKER_SECRET',
  ],
  invitationWorker: [
    'ADMIN_INVITATION_EMAIL_SECRET',
    'ADMIN_APP_URL',
    'ADMIN_EMAIL_FROM',
  ],
  supportAi: [
    'SUPPORT_AI_ENABLED',
    'SUPPORT_AI_PROVIDER_URL',
    'SUPPORT_AI_PROVIDER_TOKEN',
    'SUPPORT_AI_WORKER_SECRET',
  ],
};

const loadLocalEnv = () => {
  if (!existsSync(SUPABASE_ENV_FILE)) return;
  for (const line of readFileSync(SUPABASE_ENV_FILE, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
};

const runSupabase = (args) => {
  try {
    const supabaseCli = path.join(process.cwd(), 'node_modules', 'supabase', 'dist', 'supabase.js');
    const stdout = execFileSync(process.execPath, [supabaseCli, ...args], {
      cwd: process.cwd(),
      env: process.env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, value: JSON.parse(stdout) };
  } catch (error) {
    const detail = String(error?.stderr || error?.message || 'Supabase CLI request failed')
      .replace(/\r?\n/g, ' ')
      .replace(/(sbp_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9._-]+)/g, '[redacted]');
    return { ok: false, error: detail.slice(0, 280) };
  }
};

const asRows = (value) => {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.secrets)) return value.secrets;
  if (Array.isArray(value?.functions)) return value.functions;
  if (Array.isArray(value?.migrations)) return value.migrations;
  return [];
};

const rowName = (row) => row?.name || row?.key || row?.version || row?.version_id || row?.remote || row?.local || null;

const localFunctionNames = () => readdirSync(path.join(process.cwd(), 'supabase', 'functions'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(path.join(process.cwd(), 'supabase', 'functions', entry.name, 'index.ts')))
  .map((entry) => entry.name)
  .sort();

const localMigrationVersions = () => readdirSync(path.join(process.cwd(), 'supabase', 'migrations'))
  .filter((file) => file.endsWith('.sql'))
  .map((file) => file.split('_', 1)[0])
  .sort();

const inspectSecrets = (projectRef) => {
  const result = runSupabase(['secrets', 'list', '--project-ref', projectRef, '--output', 'json']);
  if (!result.ok) return { status: 'blocked', error: result.error };
  const names = new Set(asRows(result.value).map(rowName).filter(Boolean));
  const groups = Object.fromEntries(Object.entries(requiredSecrets).map(([group, keys]) => [group, {
    present: keys.filter((key) => names.has(key)),
    missing: keys.filter((key) => !names.has(key)),
  }]));
  return { status: 'checked', groups, totalNamedSecrets: names.size };
};

const inspectFunctions = (projectRef) => {
  const result = runSupabase(['functions', 'list', '--project-ref', projectRef, '--output', 'json']);
  if (!result.ok) return { status: 'blocked', error: result.error };
  const rows = asRows(result.value);
  const deployed = new Map(rows.map((row) => [rowName(row), row]).filter(([name]) => name));
  const local = localFunctionNames();
  return {
    status: 'checked',
    localCount: local.length,
    deployedCount: deployed.size,
    missing: local.filter((name) => !deployed.has(name)),
    inactive: local.filter((name) => {
      const row = deployed.get(name);
      return row && String(row.status || row.state || '').toUpperCase() !== 'ACTIVE';
    }),
  };
};

const inspectMigrations = (projectRef) => {
  const result = runSupabase(['migration', 'list', '--project-ref', projectRef, '--output-format', 'json']);
  if (!result.ok) return {
    status: 'blocked',
    localCount: localMigrationVersions().length,
    error: result.error,
  };
  const remote = new Set(asRows(result.value).map(rowName).filter(Boolean));
  const local = localMigrationVersions();
  return {
    status: 'checked',
    localCount: local.length,
    remoteCount: remote.size,
    missingRemotely: local.filter((version) => !remote.has(version)),
  };
};

const inspectDatabaseMetadata = () => {
  const sql = `select json_build_object(
    'databaseName', current_database(),
    'publicTableCount', (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'p')),
    'rlsTableCount', (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity),
    'publicPolicyCount', (select count(*)::int from pg_policies where schemaname = 'public'),
    'publicFunctionCount', (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind = 'f'),
    'activeAdminMemberCounts', jsonb_build_object(
      'owner', (select count(*)::int from public.admin_members where is_active = true and role = 'owner'),
      'admin', (select count(*)::int from public.admin_members where is_active = true and role = 'admin'),
      'support', (select count(*)::int from public.admin_members where is_active = true and role = 'support')
    ),
    'keyTableRls', (select coalesce(jsonb_object_agg(c.relname, jsonb_build_object('rls', c.relrowsecurity, 'forceRls', c.relforcerowsecurity) order by c.relname), '{}'::jsonb) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relname in ('admin_members', 'admin_audit_events', 'users', 'subscriptions', 'entitlements', 'support_conversations', 'support_messages', 'support_attachments', 'privacy_deletion_requests', 'privacy_export_requests', 'billing_provider_events', 'analytics_events')),
    'keyTablePolicyCounts', (select coalesce(jsonb_object_agg(tablename, policy_count order by tablename), '{}'::jsonb) from (select tablename, count(*)::int as policy_count from pg_policies where schemaname = 'public' and tablename in ('admin_members', 'admin_audit_events', 'users', 'subscriptions', 'entitlements', 'support_conversations', 'support_messages', 'support_attachments', 'privacy_deletion_requests', 'privacy_export_requests', 'billing_provider_events', 'analytics_events') group by tablename) policies),
    'apiRoleTableGrants', (select coalesce(jsonb_agg(jsonb_build_object('table', table_name, 'grantee', grantee, 'privileges', privileges) order by table_name, grantee), '[]'::jsonb) from (select table_name, grantee, array_agg(privilege_type order by privilege_type) as privileges from information_schema.role_table_grants where table_schema = 'public' and table_name in ('admin_members', 'admin_audit_events', 'users', 'subscriptions', 'entitlements', 'support_conversations', 'support_messages', 'support_attachments', 'privacy_deletion_requests', 'privacy_export_requests', 'billing_provider_events', 'analytics_events') and grantee in ('anon', 'authenticated', 'service_role') group by table_name, grantee) grants),
    'keyPolicySummary', (select coalesce(jsonb_agg(jsonb_build_object('table', tablename, 'name', policyname, 'roles', roles, 'command', cmd, 'hasUsing', qual is not null, 'hasCheck', with_check is not null, 'usingReferencesAuthIdentity', position('auth.uid()' in lower(coalesce(qual, ''))) > 0, 'checkReferencesAuthIdentity', position('auth.uid()' in lower(coalesce(with_check, ''))) > 0) order by tablename, policyname), '[]'::jsonb) from pg_policies where schemaname = 'public' and tablename in ('admin_members', 'admin_audit_events', 'users', 'subscriptions', 'entitlements', 'support_conversations', 'support_messages', 'support_attachments', 'privacy_deletion_requests', 'privacy_export_requests', 'billing_provider_events', 'analytics_events'))
  ) as capability_summary;`;
  const result = runSupabase(['db', 'query', '--linked', '--output-format', 'json', sql]);
  if (!result.ok) return { status: 'blocked', error: result.error };
  const rows = Array.isArray(result.value?.rows) ? result.value.rows : (Array.isArray(result.value) ? result.value : []);
  const summary = rows.find((row) => row && typeof row === 'object' && row.capability_summary)?.capability_summary;
  if (!summary || typeof summary !== 'object') return { status: 'checked', summary: null, responseShape: Array.isArray(result.value) ? 'array' : 'object' };
  return { status: 'checked', summary };
};

const queryRows = (value) => (
  Array.isArray(value?.rows) ? value.rows : (Array.isArray(value) ? value : [])
);

const queryValue = (value, key) => {
  const row = queryRows(value).find((item) => item && typeof item === 'object' && item[key] !== undefined);
  return row?.[key];
};

const inspectScheduler = () => {
  const extensionSql = `select json_build_object(
    'pgCronInstalled', exists(select 1 from pg_extension where extname = 'pg_cron'),
    'pgNetInstalled', exists(select 1 from pg_extension where extname = 'pg_net'),
    'jobTableAvailable', to_regclass('cron.job') is not null,
    'runTableAvailable', to_regclass('cron.job_run_details') is not null
  ) as scheduler_metadata;`;
  const extensionResult = runSupabase(['db', 'query', '--linked', '--output-format', 'json', extensionSql]);
  if (!extensionResult.ok) return { status: 'blocked', error: extensionResult.error };
  const metadata = queryValue(extensionResult.value, 'scheduler_metadata');
  if (!metadata || typeof metadata !== 'object') return { status: 'checked', available: false, jobs: [], recentRuns: [], responseShape: 'unrecognized' };
  if (metadata.jobTableAvailable !== true) {
    return {
      status: 'checked',
      available: false,
      pgCronInstalled: metadata.pgCronInstalled === true,
      pgNetInstalled: metadata.pgNetInstalled === true,
      jobs: [],
      recentRuns: [],
      note: 'Supabase Cron job metadata is not available; no scheduler configuration is inferred.',
    };
  }

  const jobsResult = runSupabase(['db', 'query', '--linked', '--output-format', 'json', `select coalesce(jsonb_agg(jsonb_build_object(
    'jobId', jobid,
    'jobName', jobname,
    'schedule', schedule,
    'active', active
  ) order by jobid), '[]'::jsonb) as scheduler_jobs from cron.job;`]);
  if (!jobsResult.ok) return { status: 'blocked', error: jobsResult.error };
  const jobs = queryValue(jobsResult.value, 'scheduler_jobs');
  if (!Array.isArray(jobs)) return { status: 'checked', available: true, jobs: [], recentRuns: [], responseShape: 'unrecognized' };

  let recentRuns = [];
  if (metadata.runTableAvailable === true) {
    const runsResult = runSupabase(['db', 'query', '--linked', '--output-format', 'json', `select coalesce(jsonb_agg(jsonb_build_object(
      'jobId', jobid,
      'status', status,
      'startedAt', start_time,
      'finishedAt', end_time
    ) order by start_time desc), '[]'::jsonb) as scheduler_runs
    from (select jobid, status, start_time, end_time from cron.job_run_details order by start_time desc limit 50) recent;`]);
    if (!runsResult.ok) return { status: 'blocked', error: runsResult.error };
    const runRows = queryValue(runsResult.value, 'scheduler_runs');
    if (Array.isArray(runRows)) recentRuns = runRows;
  }
  return {
    status: 'checked',
    available: true,
    pgCronInstalled: metadata.pgCronInstalled === true,
    pgNetInstalled: metadata.pgNetInstalled === true,
    jobs,
    recentRuns,
  };
};

loadLocalEnv();
const projectRef = process.argv[2] || process.env.SUPABASE_PROJECT_REF || DEFAULT_PROJECT_REF;
const report = {
  checkedAt: new Date().toISOString(),
  projectRef,
  readOnly: true,
  secrets: inspectSecrets(projectRef),
  functions: inspectFunctions(projectRef),
  migrations: inspectMigrations(projectRef),
  databaseMetadata: inspectDatabaseMetadata(),
  scheduler: inspectScheduler(),
};

console.log(JSON.stringify(report, null, 2));
