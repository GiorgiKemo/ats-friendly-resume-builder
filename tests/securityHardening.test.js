import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Gmail OAuth state is signed and callback does not trust raw base64 JSON', () => {
  const auth = read('supabase/functions/gmail-auth/index.ts');
  const callback = read('supabase/functions/gmail-callback/index.ts');

  assert.match(auth, /createSignedOAuthState/);
  assert.doesNotMatch(auth, /const state\s*=\s*btoa/);
  assert.match(callback, /verifySignedOAuthState/);
  assert.doesNotMatch(callback, /atob\(stateParam\)/);
  assert.doesNotMatch(callback, /JSON\.stringify\(tokens\)/);
});

test('local Edge Function origins include the active 5175 preview and preserve its OAuth return origin', () => {
  const cors = read('supabase/functions/_shared/cors.ts');
  const portal = read('supabase/functions/create-portal-session/index.ts');
  const callback = read('supabase/functions/gmail-callback/index.ts');

  assert.match(cors, /http:\/\/localhost:5175/);
  assert.match(cors, /http:\/\/127\.0\.0\.1:5175/);
  assert.match(portal, /allowedReturnOrigins\.add\("http:\/\/127\.0\.0\.1:5175"\)/);
  assert.match(callback, /isOriginAllowed\(decoded\.origin\)/);
  assert.ok(callback.includes('appBaseUrl = `${origin}/auto-apply`'));
});

test('local Auth redirect URLs match the Vite and dedicated QA origins', () => {
  const config = read('supabase/config.toml');

  assert.doesNotMatch(config, /127\.0\.0\.1:3000|localhost:3000/);
  assert.match(config, /site_url\s*=\s*"http:\/\/127\.0\.0\.1:5175"/);
  for (const origin of [
    'http://127.0.0.1:5174',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://127.0.0.1:5176',
    'http://localhost:5176',
  ]) {
    assert.match(config, new RegExp(origin.replaceAll('.', '\\.'), 'i'));
  }
});

test('Brevo webhook handlers require bearer-secret authorization', () => {
  const emailWebhook = read('supabase/functions/email-webhook/index.ts');
  const inboundReply = read('supabase/functions/inbound-reply/index.ts');

  assert.match(emailWebhook, /BREVO_WEBHOOK_SECRET/);
  assert.match(emailWebhook, /verifyBearerSecret\(req,\s*BREVO_WEBHOOK_SECRET\)/);
  assert.match(inboundReply, /INBOUND_WEBHOOK_SECRET/);
  assert.match(inboundReply, /verifyBearerSecret\(req,\s*INBOUND_WEBHOOK_SECRET\)/);
  assert.doesNotMatch(inboundReply, /searchParams\.get\('secret'\)/);
});

test('Brevo contact proxy requires an authenticated matching user email', () => {
  const contact = read('supabase/functions/add-brevo-contact/index.ts');

  assert.match(contact, /getAuthenticatedUser/);
  assert.match(contact, /Unauthorized/);
  assert.match(contact, /Email does not match authenticated user/);
});

test('client error reports are rate limited and cannot spoof unauthenticated email', () => {
  const reporter = read('supabase/functions/report-client-error/index.ts');
  const migration = read('supabase/migrations/20260516175520_harden_client_error_reporting.sql');

  assert.match(reporter, /ERROR_REPORT_SCOPE = 'reportClientError'/);
  assert.match(reporter, /enforceRateLimit\(req,\s*user\)/);
  assert.match(reporter, /user_email:\s*user\?\.email \|\| ''/);
  assert.doesNotMatch(reporter, /body\.userEmail/);
  assert.match(migration, /'reportClientError'/);
});

test('public engagement admission is an atomic server-side claim, not count-then-insert', () => {
  const engagement = read('supabase/functions/public-engagement/index.ts');
  const reporter = read('supabase/functions/report-client-error/index.ts');
  const migration = read('supabase/migrations/20260905100000_atomic_public_engagement_rate_limits.sql');
  const config = read('supabase/config.toml');

  for (const source of [engagement, reporter]) {
    assert.match(source, /rpc\('claim_public_engagement_attempt'/);
    assert.match(source, /rpc\('finalize_public_engagement_attempt'/);
    assert.doesNotMatch(source, /from\(['"]public_engagement_attempts['"]\)/);
  }
  assert.match(migration, /pg_advisory_xact_lock\(/);
  assert.match(migration, /reason = 'reserved'/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.public_engagement_attempts FROM service_role/);
  assert.match(config, /\[functions\.public-engagement\][^[]*verify_jwt = false/);
});

test('CSP connect-src is pinned to the production Supabase project', () => {
  const vercel = read('vercel.json');
  const headers = read('public/_headers');
  const serviceWorker = read('public/service-worker.js');

  assert.doesNotMatch(vercel, /https:\/\/\*\.supabase\.co/);
  assert.doesNotMatch(headers, /https:\/\/\*\.supabase\.co/);
  assert.doesNotMatch(vercel, /https:\/\/\*\.stripe\.com/);
  assert.doesNotMatch(headers, /https:\/\/\*\.stripe\.com/);
  assert.doesNotMatch(vercel, /api\.ipify\.org/);
  assert.doesNotMatch(headers, /api\.ipify\.org/);
  for (const policy of [vercel, headers]) {
    assert.doesNotMatch(policy, /https:\/\/via\.placeholder\.com/);
    assert.doesNotMatch(policy, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
  }
  assert.doesNotMatch(serviceWorker, /https:\/\/\*\.supabase\.co/);
  assert.match(vercel, /https:\/\/onuxzcectniowxqtmjpg\.supabase\.co/);
  assert.match(headers, /https:\/\/onuxzcectniowxqtmjpg\.supabase\.co/);
  assert.match(vercel, /connect-src[^;]*https:\/\/api\.stripe\.com[^;]*;/);
  assert.match(headers, /connect-src[^;]*https:\/\/api\.stripe\.com[^;]*;/);
  assert.match(vercel, /connect-src[^;]*https:\/\/www\.google\.com\/g\/collect[^;]*;/);
  assert.match(headers, /connect-src[^;]*https:\/\/www\.google\.com\/g\/collect[^;]*;/);
  assert.match(vercel, /source": "\/assets\/\(\.\*\)"[\s\S]*?max-age=31536000, immutable/);
  for (const policy of [vercel, headers]) {
    assert.match(policy, /connect-src[^;]*https:\/\/www\.googletagmanager\.com\/td[^;]*;/);
    assert.match(policy, /img-src[^;]*https:\/\/www\.googletagmanager\.com\/td[^;]*;/);
    assert.match(policy, /img-src[^;]*https:\/\/www\.googletagmanager\.com\/a[^;]*;/);
  }
  assert.doesNotMatch(serviceWorker, /Content-Security-Policy/);
  assert.match(vercel, /base-uri 'self'/);
  assert.match(vercel, /frame-ancestors 'none'/);
  assert.match(headers, /base-uri 'self'/);
  assert.match(headers, /frame-ancestors 'none'/);
  assert.match(vercel, /frame-src[^;]*https:\/\/hooks\.stripe\.com/);
  assert.match(headers, /frame-src[^;]*https:\/\/hooks\.stripe\.com/);
});

test('legacy public users policy is removed and profile reads remain authenticated-only', () => {
  const migration = read('supabase/migrations/20260910035425_remove_legacy_public_users_select_policy.sql');

  assert.match(migration, /DROP POLICY IF EXISTS "Users can view own profile" ON public\.users/i);
  assert.match(migration, /REVOKE SELECT ON public\.users FROM PUBLIC, anon, authenticated/i);
  assert.match(migration, /GRANT SELECT ON public\.users TO authenticated/i);
  assert.match(migration, /CREATE POLICY "Core profile owner read"[\s\S]*?FOR SELECT[\s\S]*?TO authenticated/i);
  assert.match(migration, /USING \(\(SELECT auth\.uid\(\)\) = id\)/i);
});

test('theme bootstrap is same-origin and does not depend on a stale inline CSP hash', () => {
  const index = read('index.html');
  const bootstrap = read('public/theme-bootstrap.js');
  const vercel = read('vercel.json');
  const headers = read('public/_headers');

  assert.match(index, /<script src="\/theme-bootstrap\.js"><\/script>/);
  assert.doesNotMatch(index, /<script>\s*\(\(\) => \{/);
  assert.match(bootstrap, /localStorage\.getItem\(storageKey\)/);
  assert.match(bootstrap, /prefers-color-scheme: dark/);
  for (const policy of [vercel, headers]) {
    assert.match(policy, /script-src 'self'/);
    assert.doesNotMatch(policy, /theme-bootstrap\.js/);
    assert.doesNotMatch(policy, /sha256-mMpkovCzzuFysqxeZ2iwkN\+VEcAgKZxWGZro5Y\/sTeQ=/);
  }
});

test('security disclosure contact matches the verified support channel', () => {
  const security = read('SECURITY.md');

  assert.match(security, /contact@giorgi\.codes \(subject: Security report\)/);
  assert.doesNotMatch(security, /security@ats-resume-builder\.com/);
});

test('resume creation telemetry does not include the candidate payload', () => {
  const resumeContext = read('src/context/ResumeContext.tsx');

  assert.doesNotMatch(resumeContext, /logError\(e as Error, 'resume\.create',[\s\S]{0,180}resumeData\s*:/);
  assert.match(resumeContext, /logError\(e as Error, 'resume\.create',[\s\S]{0,180}resumeId:\s*'new'/);
});

test('free resume storage limit is enforced server-side and surfaced to the client', () => {
  const migration = read('supabase/migrations/20260909110000_enforce_free_resume_limit.sql');
  const service = read('src/services/supabaseService.js');
  const context = read('src/context/ResumeContext.tsx');

  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /resume_count >= 3/);
  assert.match(migration, /FREE_RESUME_LIMIT/);
  assert.match(migration, /CREATE TRIGGER enforce_free_resume_limit_before_insert/);
  assert.match(service, /error\.code === 'P0001' && error\.message === 'FREE_RESUME_LIMIT'/);
  assert.match(context, /code: 'FREE_RESUME_LIMIT'/);
});

test('generation service-worker updates retain account and run identity without forwarding job text', () => {
  const serviceWorker = read('public/service-worker.js');

  assert.match(serviceWorker, /userId:\s*event\.data\.userId\s*\|\|\s*progress\?\.userId/);
  assert.match(serviceWorker, /runId:\s*event\.data\.runId\s*\|\|\s*progress\?\.runId/);
  assert.doesNotMatch(serviceWorker, /jobDescription/);
});

test('AI parse diagnostics do not log user-generated response bodies', () => {
  const security = read('src/utils/security.js');

  assert.doesNotMatch(security, /console\.error\(['"]Raw response text:/);
  assert.match(security, /responseLength/);
  assert.match(security, /hasObjectBoundary/);
});

test('checkout verification never returns provider or database error objects to clients', () => {
  const verifier = read('supabase/functions/verify-checkout-session/index.ts');

  assert.doesNotMatch(verifier, /JSON\.stringify\(\{\s*error:\s*'Unauthorized',\s*details:/);
  assert.doesNotMatch(verifier, /error:\s*'Failed to get user profile',[\s\S]{0,120}details:\s*profileError/);
});

test('AI proxy upstream errors do not echo provider response bodies', () => {
  for (const path of ['supabase/functions/openrouter-proxy/index.ts', 'supabase/functions/groq-proxy/index.ts']) {
    const proxy = read(path);
    assert.match(proxy, /readBoundedResponseText\(response\)/);
    assert.match(proxy, /Provider responses can echo prompt\/profile fragments/);
    assert.doesNotMatch(proxy, /details,\s*\n\s*\}\),\s*\{/);
    assert.doesNotMatch(proxy, /logDebug\('[^']*upstream error',\s*response\.status,\s*responseText\)/);
  }
});

test('keyword analysis provider failures do not retain upstream response bodies', () => {
  const analyzeKeywords = read('supabase/functions/analyze-keywords/index.ts');

  assert.match(analyzeKeywords, /readBoundedResponseText\(response\)/);
  assert.match(analyzeKeywords, /Provider bodies can echo resume or job-description fragments/);
  assert.match(analyzeKeywords, /throw new Error\(`\$\{provider\} provider error: \$\{response\.status\}`\)/);
  assert.doesNotMatch(analyzeKeywords, /provider error: \$\{response\.status\} \$\{responseText\.slice/);
});

test('checkout diagnostics do not log request, identity or provider payloads', () => {
  const checkout = read('supabase/functions/create-checkout-session/index.ts');

  assert.match(checkout, /const summarizeError =/);
  assert.match(checkout, /const logError =/);
  assert.doesNotMatch(checkout, /console\.error\([^\n]*(?:requestBody|user\.id|customerId|priceId|stripeError|Raw Error|Error Message|Stringified)/);
  assert.doesNotMatch(checkout, /logDebug\([^\n]*(?:user\.id|customerId|profile\.email|priceId|planId|success_url|cancel_url)/);
});

test('checkout customer creation is idempotent and transient lookups fail closed', () => {
  const checkout = read('supabase/functions/create-checkout-session/index.ts');

  assert.match(checkout, /resumeats-customer-\$\{user\.id\}/);
  assert.match(checkout, /resumeats-customer-replacement-\$\{user\.id\}-\$\{customerId\}/);
  assert.match(checkout, /const isMissingStripeCustomer =/);
  assert.match(checkout, /if \(!isMissingStripeCustomer\(stripeError\)\)/);
});

test('Stripe webhook diagnostics and failures stay free of payment identifiers', () => {
  const webhook = read('supabase/functions/stripe-webhook/index.ts');

  assert.match(webhook, /const summarizeError =/);
  assert.match(webhook, /const getSubscriptionPeriodEnd =/);
  assert.doesNotMatch(webhook, /30 \* 24 \* 60 \* 60/);
  assert.match(webhook, /error: isProd \? ['"]Webhook processing failed['"]/);
  assert.doesNotMatch(webhook, /console\.error\([^\n]*(?:customerEmail|session\.customer|user\.id|customerId|invoice\.id|event\.id)/);
  assert.doesNotMatch(webhook, /message: errorMessage,\s*success: false/);
});

test('Gmail scanning fails truthfully and bounds provider work', () => {
  const gmail = read('supabase/functions/gmail-scan/index.ts');

  assert.match(gmail, /const MAX_APPLIED_JOBS = 500/);
  assert.match(gmail, /const MAX_CONTACT_EMAILS = 100/);
  assert.match(gmail, /const MAX_MESSAGES_PER_CONNECTION = 100/);
  assert.match(gmail, /const MAX_MESSAGE_BODY_CHARS = 20_000/);
  assert.match(gmail, /if \(connectionsError\) throw/);
  assert.match(gmail, /if \(appliedJobsError\) throw/);
  assert.match(gmail, /success: false, error: 'One or more Gmail connections could not be scanned/);
  assert.match(gmail, /Gmail scan is temporarily unavailable/);
  assert.match(gmail, /readBoundedResponseText\(res\)/);
  assert.doesNotMatch(gmail, /JSON\.stringify\(\{ error: message \}\)/);
});

test('AI workers bound successful provider response bodies before JSON parsing', () => {
  for (const path of ['supabase/functions/auto-apply-run/index.ts', 'supabase/functions/support-ai-worker/index.ts']) {
    const worker = read(path);
    assert.match(worker, /readBoundedResponseText\((?:res|response)\)/);
  }
});

test('keyword analysis honors the configured AI provider before falling back', () => {
  const analyzeKeywords = read('supabase/functions/analyze-keywords/index.ts');

  assert.match(analyzeKeywords, /configuredAiProvider === 'groq' \? \['groq', 'openrouter'\] : \['openrouter', 'groq'\]/);
  assert.match(analyzeKeywords, /unsupported AI_PROVIDER/);
  assert.doesNotMatch(analyzeKeywords, /AI_PROVIDER is ignored/);
});

test('Gmail scanning uses durable per-user lease and work-budget RPCs', () => {
  const gmail = read('supabase/functions/gmail-scan/index.ts');
  const migration = read('supabase/migrations/20260905110000_durable_gmail_scan_budgets.sql');

  assert.match(gmail, /rpc\('claim_gmail_scan'/);
  assert.match(gmail, /rpc\('reserve_gmail_scan_work'/);
  assert.match(gmail, /rpc\('release_gmail_scan'/);
  assert.match(gmail, /MAX_AI_PROVIDER_CALLS_PER_CLASSIFICATION/);
  assert.match(migration, /active_scan_id uuid/);
  assert.match(migration, /daily_message_limit integer := 500/);
  assert.match(migration, /daily_ai_limit integer := 100/);
  assert.match(migration, /lease_expires_at > now\(\)/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.claim_gmail_scan/);
  assert.match(migration, /REVOKE ALL ON private\.gmail_scan_control FROM PUBLIC, anon, authenticated, service_role/);
});

test('Auto-Apply matching controls are enforced by the server', () => {
  const autoApply = read('supabase/functions/auto-apply-run/index.ts');

  assert.match(autoApply, /const parseAnnualSalaryRange =/);
  assert.match(autoApply, /const salaryMatchesPreferences =/);
  assert.match(autoApply, /salaryMatchesPreferences\(job\.salary_range, prefs\.salary_min, prefs\.salary_max\)/);
  assert.match(autoApply, /const configuredThreshold = _getScoreThreshold\(prefs\.speed\)/);
  assert.match(autoApply, /case 'lead':\s*return 'director'/);
  assert.doesNotMatch(autoApply, /const MIN_MATCH_SCORE = hasAnyAiProvider\(\) \? 75 : 60/);
});

test('legacy external links are revalidated at every rendered href boundary', () => {
  const tracker = read('src/pages/ApplicationTracker.jsx');
  const autoApply = read('src/pages/AutoApply.jsx');
  const certifications = read('src/components/profile/CertificationsSection.jsx');
  const projects = read('src/components/profile/ProjectsSection.jsx');

  for (const source of [tracker, autoApply, certifications, projects]) {
    assert.match(source, /getSafeExternalUrl/);
  }
  assert.doesNotMatch(tracker, /href=\{app\.job_url\}/);
  assert.doesNotMatch(autoApply, /href=\{job\.job_url \|\|/);
  assert.doesNotMatch(certifications, /href=\{item\.credentialURL\}/);
  assert.doesNotMatch(projects, /href=\{item\.url\}/);
});

test('browser-agent direct imports reject unsafe URL schemes before queueing', () => {
  const browserAgent = read('src/services/browserAgentService.js');

  assert.match(browserAgent, /getSafeExternalUrl/);
  assert.match(browserAgent, /const normalizedUrl = getSafeExternalUrl\(jobUrl\)/);
  assert.match(browserAgent, /if \(!normalizedUrl\) return null/);
  assert.match(browserAgent, /job_url: getSafeExternalUrl\(job\.job_url\)/);
});

test('public and billing integrations keep provider/database details server-side', () => {
  const engagement = read('supabase/functions/public-engagement/index.ts');
  const portal = read('supabase/functions/create-portal-session/index.ts');
  const checkout = read('supabase/functions/create-checkout-session/index.ts');
  const brevo = read('supabase/functions/add-brevo-contact/index.ts');
  const emailWebhook = read('supabase/functions/email-webhook/index.ts');
  const inboundReply = read('supabase/functions/inbound-reply/index.ts');

  assert.match(engagement, /error instanceof HttpError \? error\.status : 500/);
  assert.match(engagement, /error instanceof HttpError \? error\.message : 'Could not process request'/);
  assert.match(portal, /isProd \? ["']Could not open the billing portal/);
  assert.match(checkout, /Could not start checkout\. Please try again or contact support/);
  assert.match(brevo, /Contact sync is temporarily unavailable/);
  assert.match(emailWebhook, /Webhook payload could not be processed/);
  assert.match(inboundReply, /Inbound reply could not be processed/);
});

test('provider redirects validate exact OAuth and billing origins before navigation', () => {
  const autoApply = read('src/pages/AutoApply.jsx');
  const checkout = read('src/components/premium/StripeCheckout.jsx');
  const manager = read('src/components/premium/SubscriptionManager.jsx');
  const subscription = read('src/pages/SubscriptionManage.jsx');

  assert.match(autoApply, /getSafeExternalUrl\(data\.url\)/);
  assert.match(autoApply, /https:\/\/accounts\.google\.com/);
  assert.match(checkout, /getSafeExternalUrl\(checkoutUrl\)/);
  assert.match(checkout, /https:\/\/checkout\.stripe\.com/);
  assert.match(manager, /getSafeExternalUrl\(portalUrl\)/);
  assert.match(manager, /https:\/\/billing\.stripe\.com/);
  assert.match(subscription, /destination\.origin !== 'https:\/\/billing\.stripe\.com'/);
});

test('admin mutations use durable idempotency receipts and entitlement reconciliation', () => {
  const adminApi = read('supabase/functions/admin-api/index.ts');
  const service = read('src/services/adminService.js');
  const migration = read('supabase/migrations/20260908233032_billing_entitlement_ai_limits.sql');
  const grants = read('supabase/migrations/20260909002122_manual_access_grants.sql');
  const paypalInbox = read('supabase/migrations/20260909003410_paypal_event_inbox.sql');
  const analyticsTriggers = read('supabase/migrations/20260909004500_analytics_domain_triggers.sql');
  const ownerMutations = read('supabase/migrations/20260909065711_admin_owner_mutations.sql');
  const routingSettings = read('supabase/migrations/20260909135222_support_routing_settings.sql');
  const stripeWebhook = read('supabase/functions/stripe-webhook/index.ts');
  const paypalWebhook = read('supabase/functions/paypal-webhook/index.ts');

  assert.match(adminApi, /reserve_admin_operation/);
  assert.match(adminApi, /finish_admin_operation/);
  assert.match(adminApi, /ADMIN_AAL2_ACTIONS/);
  assert.match(adminApi, /claims\?\.aal !== 'aal2'/);
  assert.match(adminApi, /MFA step-up required/);
  assert.match(adminApi, /ADMIN_BODY_LIMIT/);
  assert.match(adminApi, /Too many admin requests/);
  assert.match(adminApi, /Retry-After/);
  assert.match(adminApi, /grant_manual_access/);
  assert.match(adminApi, /revoke_all_manual_access/);
  assert.match(adminApi, /billing_entitlements/);
  assert.match(adminApi, /manual_access_grants/);
  assert.match(adminApi, /ensureOwnerSurvival/);
  assert.match(adminApi, /action === 'customer'/);
  assert.match(adminApi, /fetchCustomerDetail/);
  assert.match(adminApi, /fetchBillingEventHistory/);
  assert.match(adminApi, /stripe_webhook_events/);
  assert.match(adminApi, /billing_provider_events/);
  assert.match(adminApi, /fetchUsageSummary/);
  assert.match(adminApi, /fetchAutoApplySummary/);
  assert.match(adminApi, /fetchAutoApplyStatusCounts\('auto_apply_jobs'/);
  assert.match(adminApi, /fetchAutoApplyStatusCounts\('auto_apply_runs'/);
  assert.match(adminApi, /'discovered', 'queued', 'applying', 'applied', 'replied', 'interview', 'rejected', 'skipped', 'failed'/);
  assert.match(read('src/pages/AdminDashboard.jsx'), /Auto-apply run states/);
  assert.match(read('src/pages/AdminDashboard.jsx'), /jobStatuses\?\.\[status\]/);
  assert.match(read('src/pages/AdminDashboard.jsx'), /runStatuses\?\.\[status\]/);
  assert.match(adminApi, /The last active owner must remain available/);
  assert.match(adminApi, /updateAdminRole/);
  assert.match(adminApi, /invitation_expires_at/);
  assert.match(adminApi, /pendingInvitation/);
  assert.match(adminApi, /admin_revoke_member/);
  assert.match(adminApi, /admin_update_member_role/);
  assert.match(ownerMutations, /pg_advisory_xact_lock/);
  assert.match(ownerMutations, /admin\.revoke/);
  assert.match(ownerMutations, /admin\.role\.updated/);
  assert.match(ownerMutations, /grant execute on function public\.admin_revoke_member/i);
  assert.match(routingSettings, /support_routing_settings/);
  assert.match(routingSettings, /support\.routing\.updated/);
  assert.match(routingSettings, /first_response_target_minutes/);
  assert.match(routingSettings, /support_routing_settings_history/);
  assert.match(routingSettings, /support_get_routing_context/);
  assert.match(adminApi, /updateSupportRoutingSettings/);
  assert.match(service, /updateSupportRoutingSettings/);
  assert.match(read('supabase/functions/support-api/index.ts'), /support_get_routing_context/);
  assert.match(read('src/pages/AdminDashboard.jsx'), /Hours and routing/);
  assert.match(read('src/services/adminService.js'), /requestError\.code = data\?\.code/);
  assert.match(read('src/pages/AdminDashboard.jsx'), /Pending operation reconciliation/);
  assert.match(service, /updateAdminRole/);
  assert.match(read('src/pages/AdminDashboard.jsx'), /Change admin role/);
  assert.doesNotMatch(adminApi, /\.from\('users'\)\s*\n\s*\.upsert\(\{[\s\S]{0,260}is_premium:/);
  assert.match(service, /x-admin-idempotency-key/);
  assert.match(service, /fetchAdminCustomer/);
  assert.match(migration, /p_provider not in \('stripe', 'paypal', 'manual'\)/);
  assert.match(migration, /ai_limit integer not null default 30/);
  assert.match(grants, /create table if not exists public\.manual_access_grants/);
  assert.match(grants, /reconcile_effective_access/);
  assert.match(grants, /grant_manual_access/);
  assert.match(grants, /revoke_all_manual_access/);
  assert.match(grants, /revoked_at/);
  assert.match(paypalInbox, /billing_provider_events/);
  assert.match(paypalInbox, /provider in \('paypal'\)/);
  assert.match(stripeWebhook, /p_subscription_id: subscriptionId/);
  assert.match(paypalWebhook, /claimEvent/);
  assert.match(paypalWebhook, /finishEvent/);
  assert.match(paypalWebhook, /failEvent/);
  assert.match(analyticsTriggers, /capture_resume_created_event/);
  assert.match(analyticsTriggers, /capture_application_created_event/);
  assert.match(analyticsTriggers, /on conflict \(event_key\) do nothing/);
});

test('billing projections preserve provider environment and stay read-only in the admin view', () => {
  const migration = read('supabase/migrations/20260909160000_billing_projections.sql');
  const projection = read('supabase/functions/_shared/billingProjection.ts');
  const stripeWebhook = read('supabase/functions/stripe-webhook/index.ts');
  const paypal = read('supabase/functions/_shared/paypal.ts');
  const adminApi = read('supabase/functions/admin-api/index.ts');
  const dashboard = read('src/pages/AdminDashboard.jsx');

  assert.match(migration, /create table if not exists public\.billing_subscriptions/);
  assert.match(migration, /create table if not exists public\.billing_transactions/);
  assert.match(migration, /environment in \('live', 'test'\)/);
  assert.match(migration, /upsert_billing_subscription_projection/);
  assert.match(migration, /record_billing_transaction_projection/);
  assert.match(migration, /grant execute on function[\s\S]*public\.upsert_billing_subscription_projection[\s\S]*service_role/i);
  assert.match(migration, /grant execute on function[\s\S]*public\.record_billing_transaction_projection[\s\S]*service_role/i);
  assert.match(projection, /projectStripeSubscription/);
  assert.match(projection, /projectPayPalSubscription/);
  assert.match(projection, /projectBillingTransaction/);
  assert.match(stripeWebhook, /projectStripeSubscription/);
  assert.match(stripeWebhook, /projectBillingTransaction/);
  assert.match(paypal, /projectPayPalSubscription/);
  assert.match(paypal, /projectBillingTransaction/);
  assert.match(adminApi, /fetchBillingProjections/);
  assert.match(adminApi, /billingSubscriptions/);
  assert.match(adminApi, /billingTransactions/);
  assert.match(dashboard, /Provider subscription projections/);
  assert.match(dashboard, /Provider transaction projections/);
  assert.match(dashboard, /billingProjectionsAvailable/);
  assert.doesNotMatch(dashboard, /cancelSubscription|refundPayment|chargeback/);
});

test('billing reconciliation is leased, bounded, ownership-checked, and timeout-safe', () => {
  const migration = read('supabase/migrations/20260909170000_billing_reconciliation_runs.sql');
  const worker = read('supabase/functions/billing-reconciliation/index.ts');
  const config = read('supabase/config.toml');
  const dashboard = read('src/pages/AdminDashboard.jsx');
  const contract = read('docs/admin-dashboard-plan/BILLING-RECONCILIATION-CONTRACT.md');

  assert.match(migration, /billing_reconciliation_runs/);
  assert.match(migration, /billing_claim_reconciliation_run/);
  assert.match(migration, /billing_finish_reconciliation_run/);
  assert.match(migration, /billing_fail_reconciliation_run/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /unique index if not exists billing_reconciliation_active_provider_idx/);
  assert.match(worker, /BILLING_RECONCILIATION_SECRET/);
  assert.match(worker, /x-billing-reconciliation-secret/);
  assert.match(worker, /Math\.min\(maxBatch, limit\)/);
  assert.match(worker, /billing_claim_reconciliation_run/);
  assert.match(worker, /stripe_subscription_ownership_mismatch/);
  assert.match(worker, /syncPayPalSubscription/);
  assert.match(worker, /stripeEnvironment/);
  assert.match(worker, /paypalEnvironment/);
  assert.match(worker, /failed_observations|one_or_more_provider_observations_failed/);
  assert.match(config, /\[functions\.billing-reconciliation\][\s\S]*verify_jwt = false/);
  assert.match(dashboard, /Provider reconciliation health/);
  assert.match(contract, /never revoke local access/);
  assert.match(contract, /provider\/environment lease/);
});

test('billing actions are capability-gated, MFA-bound, idempotent, and never mocked as successful', () => {
  const migration = read('supabase/migrations/20260909220000_billing_action_intents.sql');
  const adminApi = read('supabase/functions/admin-api/index.ts');
  const service = read('src/services/adminService.js');
  const dashboard = read('src/pages/AdminDashboard.jsx');

  assert.match(migration, /billing_action_capabilities/);
  assert.match(migration, /enabled boolean not null default false/);
  assert.match(migration, /billing_action_intents/);
  assert.match(migration, /billing_action_attempts/);
  assert.match(migration, /billing_create_action_intent/);
  assert.match(migration, /billing_claim_action_intents/);
  assert.match(migration, /billing_record_action_attempt/);
  assert.match(migration, /Billing action unsupported/);
  assert.match(migration, /max_amount_minor/);
  assert.match(migration, /unique \(actor_user_id, idempotency_key\)/);
  assert.match(adminApi, /billingActionPreview/);
  assert.match(adminApi, /createBillingActionIntent/);
  assert.match(adminApi, /provider_capability_disabled/);
  assert.match(adminApi, /claims\?\.aal !== 'aal2'/);
  assert.match(adminApi, /billing_create_action_intent/);
  assert.match(service, /fetchAdminBillingActionPreview/);
  assert.match(service, /createAdminBillingActionIntent/);
  assert.match(dashboard, /Provider actions stay disabled/);
});

test('auto-apply admin controls are audited, idempotent, and fail closed around outbound work', () => {
  const migration = read('supabase/migrations/20260909260000_auto_apply_admin_actions.sql');
  const adminApi = read('supabase/functions/admin-api/index.ts');
  const service = read('src/services/adminService.js');
  const dashboard = read('src/pages/AdminDashboard.jsx');
  const dialog = read('src/components/admin/AdminActionDialog.jsx');

  assert.match(migration, /auto_apply_job_admin_actions/);
  assert.match(migration, /operation_id uuid not null unique/i);
  assert.match(migration, /action in \('retry', 'cancel', 'reconcile'\)/i);
  assert.match(migration, /status in \('requested', 'completed', 'failed', 'pending_reconciliation'\)/i);
  assert.match(migration, /revoke all on table public\.auto_apply_job_admin_actions from public, anon, authenticated/i);
  assert.match(adminApi, /'jobOperations'/);
  assert.match(adminApi, /'autoApplyJobAction'/);
  assert.match(adminApi, /fetchAdminJobOperations/);
  assert.match(adminApi, /performAutoApplyJobAction/);
  assert.match(adminApi, /job\.status !== 'failed' \|\| job\.email_sent_at \|\| job\.gmail_message_id \|\| job\.brevo_message_id/);
  assert.match(adminApi, /Only discovered or queued jobs can be cancelled/);
  assert.match(adminApi, /pending_reconciliation/);
  assert.match(adminApi, /auto_apply\.job\.reconciliation_requested/);
  assert.match(service, /fetchAdminJobOperations/);
  assert.match(service, /requestAdminAutoApplyJobAction/);
  assert.match(service, /'autoApplyJobAction'/);
  assert.match(dashboard, /Safe job controls/);
  assert.match(dashboard, /Outbound receipt present/);
  assert.match(dashboard, /onAction\(item, 'retry'\)/);
  assert.match(dashboard, /onAction\(item, 'cancel'\)/);
  assert.match(dashboard, /onAction\(item, 'reconcile'\)/);
  assert.match(dialog, /Retry is allowed only for a failed job with no outbound message/);
});

test('billing action worker is secret-bound, idempotent, provider-aware, and reconciliation-safe', () => {
  const worker = read('supabase/functions/billing-action-worker/index.ts');
  const config = read('supabase/config.toml');

  assert.match(worker, /BILLING_ACTION_WORKER_SECRET/);
  assert.match(worker, /x-billing-action-secret/);
  assert.match(worker, /billing_claim_action_intents/);
  assert.match(worker, /billing_record_action_attempt/);
  assert.match(worker, /stableRequestId/);
  assert.match(worker, /idempotencyKey: requestId/);
  assert.match(worker, /payments.*captures.*refund/);
  assert.match(worker, /billing.*subscriptions.*cancel/);
  assert.match(worker, /revise/);
  assert.match(worker, /awaiting_customer_approval/);
  assert.match(worker, /pending_reconciliation/);
  assert.match(worker, /provider_call_uncertain/);
  assert.match(worker, /stripe_plan_change_requires_reviewed_preview_contract/);
  assert.doesNotMatch(worker, /console\.(log|error|warn)/);
  assert.match(config, /\[functions\.billing-action-worker\][\s\S]*verify_jwt = false/);
});

test('feedback insights and improvement backlog stay operator-scoped, sanitized, and idempotent', () => {
  const migration = read('supabase/migrations/20260909230000_feedback_improvement_backlog.sql');
  const supportApi = read('supabase/functions/support-api/index.ts');
  const service = read('src/services/supportService.js');
  const dashboard = read('src/pages/AdminDashboard.jsx');

  assert.match(migration, /customer_feedback[\s\S]*add column if not exists tags text\[\]/);
  assert.match(migration, /create table if not exists public\.improvement_items/);
  assert.match(migration, /alter table public\.improvement_items enable row level security/);
  assert.match(migration, /support_update_feedback_tags/);
  assert.match(migration, /support_create_improvement_item/);
  assert.match(migration, /support_update_improvement_item/);
  assert.match(migration, /support_list_improvement_items/);
  assert.match(migration, /summary.*averageRating|average_rating/);
  assert.match(migration, /support_operation_receipts/);
  assert.match(supportApi, /feedbackTags/);
  assert.match(supportApi, /improvementCreate/);
  assert.match(supportApi, /improvementUpdate/);
  assert.match(service, /updateSupportFeedbackTags/);
  assert.match(service, /createSupportImprovementItem/);
  assert.match(service, /updateSupportImprovementItem/);
  assert.match(dashboard, /Feedback and improvement backlog/);
  assert.match(dashboard, /Sanitized summary/);
  assert.match(dashboard, /Operator tags/);
  assert.doesNotMatch(dashboard, /private transcript text is automatically/);
});

test('privacy operations are durable, private, and fail closed before destructive execution', () => {
  const adminApi = read('supabase/functions/admin-api/index.ts');
  const service = read('src/services/adminService.js');
  const dashboard = read('src/pages/AdminDashboard.jsx');
  const migration = read('supabase/migrations/20260909010000_privacy_lifecycle.sql');
  const exportMigration = read('supabase/migrations/20260909013438_privacy_export_worker.sql');
  const providerReviewMigration = read('supabase/migrations/20260909143000_privacy_provider_cancellation_review.sql');
  const ownerApprovalMigration = read('supabase/migrations/20260909150000_privacy_owner_approval.sql');
  const deletionMigration = read('supabase/migrations/20260909190000_privacy_deletion_execution.sql');
  const worker = read('supabase/functions/privacy-worker/index.ts');
  const deletionWorker = read('supabase/functions/privacy-deletion-worker/index.ts');
  const config = read('supabase/config.toml');

  assert.match(migration, /create table if not exists public\.privacy_holds/);
  assert.match(migration, /create table if not exists public\.privacy_export_jobs/);
  assert.match(migration, /create table if not exists public\.privacy_deletion_jobs/);
  assert.match(migration, /status in \('pending', 'processing', 'waiting_hold', 'failed', 'completed', 'cancelled'\)/);
  assert.match(migration, /privacy_claim_deletion_job/);
  assert.match(migration, /for update/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.privacy_deletion_jobs from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.privacy_claim_deletion_job/);
  assert.match(adminApi, /fetchPrivacyStatus/);
  assert.match(adminApi, /requestDeletion/);
  assert.match(adminApi, /privacy_deletion_jobs/);
  assert.match(adminApi, /durableWorkflow: true/);
  assert.doesNotMatch(adminApi, /auth\.admin\.deleteUser/);
  assert.match(service, /requestAdminExport/);
  assert.match(service, /placeAdminPrivacyHold/);
  assert.match(service, /releaseAdminPrivacyHold/);
  assert.match(service, /cancelAdminPrivacyDeletion/);
  assert.match(dashboard, /No immediate Auth deletion is performed here/);
  assert.match(dashboard, /Queue deletion/);
  assert.match(dashboard, /Place hold/);
  assert.match(dashboard, /Release privacy hold/);
  assert.match(read('src/components/admin/AdminActionDialog.jsx'), /privacyHold/);
  assert.match(exportMigration, /privacy-exports/);
  assert.match(exportMigration, /privacy_claim_export_jobs/);
  assert.match(exportMigration, /privacy_complete_export_job/);
  assert.match(exportMigration, /privacy_expire_exports/);
  assert.match(exportMigration, /grant execute on function public\.privacy_claim_export_jobs.*service_role/);
  assert.match(worker, /PRIVACY_WORKER_SECRET/);
  assert.match(worker, /Gmail connection tokens/);
  assert.match(worker, /internal support notes/);
  assert.match(worker, /customer_feedback/);
  assert.match(worker, /privacy_complete_export_job/);
  assert.match(worker, /privacy_expire_exports/);
  assert.match(adminApi, /createSignedUrl/);
  assert.match(dashboard, /Download export/);
  assert.match(providerReviewMigration, /privacy_provider_cancellation_reviews/);
  assert.match(providerReviewMigration, /waiting_provider_cancellation/);
  assert.match(providerReviewMigration, /privacy_initialize_provider_cancellation_reviews/);
  assert.match(providerReviewMigration, /privacy_record_provider_cancellation_review/);
  assert.match(providerReviewMigration, /provider_cancellation_review_required/);
  assert.match(adminApi, /recordProviderCancellationReview/);
  assert.match(service, /recordAdminProviderCancellationReview/);
  assert.match(dashboard, /Provider cancellation review/);
  assert.match(read('src/components/admin/AdminActionDialog.jsx'), /providerCancellation/);
  assert.match(ownerApprovalMigration, /owner_approved_by_user_id/);
  assert.match(ownerApprovalMigration, /privacy_approve_deletion_job/);
  assert.match(ownerApprovalMigration, /Owner access required for deletion approval/);
  assert.match(ownerApprovalMigration, /owner_approval_required/);
  assert.match(adminApi, /approvePrivacyDeletion/);
  assert.match(service, /approveAdminPrivacyDeletion/);
  assert.match(dashboard, /Approve account deletion/);
  assert.match(deletionMigration, /privacy_claim_deletion_execution/);
  assert.match(deletionMigration, /privacy_delete_user_data/);
  assert.match(deletionMigration, /privacy_mark_auth_deleted/);
  assert.match(deletionMigration, /privacy_complete_deletion_job/);
  assert.match(deletionMigration, /Active admin membership blocks account deletion/);
  assert.match(deletionMigration, /billing_subscriptions set user_id = null/);
  assert.match(deletionMigration, /billing_transactions set user_id = null/);
  assert.match(deletionWorker, /PRIVACY_DELETION_WORKER_SECRET/);
  assert.match(deletionWorker, /auth\.admin\.deleteUser/);
  assert.match(deletionWorker, /support-attachments/);
  assert.match(deletionWorker, /privacy-exports/);
  assert.match(deletionWorker, /privacy_release_deletion_job/);
  assert.match(config, /\[functions\.privacy-deletion-worker\][\s\S]*verify_jwt = false/);
});

test('first-party analytics is allowlisted, deduplicated, and free of sensitive fields', () => {
  const migration = read('supabase/migrations/20260908233401_first_party_analytics_events.sql');
  const analytics = read('supabase/functions/_shared/analytics.ts');
  const stripeReturn = read('supabase/functions/verify-checkout-session/index.ts');
  const stripeWebhook = read('supabase/functions/stripe-webhook/index.ts');
  const paypal = read('supabase/functions/_shared/paypal.ts');
  const paypalBilling = read('supabase/functions/paypal-billing/index.ts');

  assert.match(migration, /event_name text not null check \(event_name in/);
  assert.match(migration, /'upgrade_click'/);
  assert.match(migration, /'checkout_created'/);
  assert.match(migration, /on conflict \(event_key\) do nothing/);
  assert.match(migration, /resume_content/);
  assert.match(migration, /Analytics properties must be flat/);
  assert.match(migration, /This analytics event is server-only/);
  assert.match(migration, /grant execute on function public\.record_analytics_event/);
  assert.match(analytics, /Could not record first-party analytics event/);
  assert.match(stripeReturn, /stripe:purchase/);
  assert.match(stripeWebhook, /analytics_event_key: `stripe:purchase:/);
  assert.match(paypal, /paypal:purchase/);
  assert.match(paypalBilling, /paypal:checkout/);
});

test('admin account actions use the accessible dialog instead of browser prompts', () => {
  const dashboard = read('src/pages/AdminDashboard.jsx');
  const dialog = read('src/components/admin/AdminActionDialog.jsx');

  assert.doesNotMatch(dashboard, /window\.(prompt|confirm)/);
  assert.match(dialog, /role="dialog"/);
  assert.match(dialog, /aria-modal="true"/);
  assert.match(dialog, /event\.key === 'Escape'/);
  assert.match(dialog, /opener\?\.isConnected/);
});

test('admin privacy export links sanitize provider-returned URLs before rendering', () => {
  const dashboard = read('src/pages/AdminDashboard.jsx');

  assert.match(dashboard, /getSafeExternalUrl\(latestExport\?\.download_url\)/);
  assert.match(dashboard, /href=\{safeExportUrl\}/);
  assert.match(dashboard, /rel="noopener noreferrer"/);
  assert.doesNotMatch(dashboard, /href=\{latestExport\.download_url\}/);
});

test('support API bounds payload bytes, rate-limits authenticated identities, and hides RPC details', () => {
  const support = read('supabase/functions/support-api/index.ts');
  const widget = read('src/components/support/SupportWidget.jsx');
  const config = read('supabase/config.toml');

  assert.match(support, /new TextEncoder\(\)\.encode\(rawBody\)\.byteLength/);
  assert.match(support, /consumeRateLimit\(`user:\$\{user\.id\}`\)/);
  assert.match(support, /const getErrorMessage =/);
  assert.match(support, /return jsonResponse\(\{ error: getErrorMessage\(message\) \}/);
  assert.match(support, /try \{\s+await client\.rpc\('record_analytics_event'/);
  assert.doesNotMatch(support, /client\.rpc\('record_analytics_event'[\s\S]*\)\.catch\(/);
  assert.doesNotMatch(support, /return jsonResponse\(\{ error: message \}/);
  assert.match(widget, /aria-modal="true"/);
  assert.match(widget, /useSupportDialogAccessibility/);
  assert.match(widget, /event\.key === 'Escape'/);
  assert.match(widget, /previouslyFocused/);
  assert.match(widget, /ResumeATS assistant/);
  assert.match(widget, /reviewed help content/);
  assert.match(config, /\[functions\.support-api\][^[]*verify_jwt = false/);
});

test('support attachment downloads sanitize signed URLs before opening a new window', () => {
  const widget = read('src/components/support/SupportWidget.jsx');

  assert.match(widget, /getSafeExternalUrl\(result\.signedUrl\)/);
  assert.match(widget, /window\.open\(safeSignedUrl, '_blank', 'noopener,noreferrer'\)/);
  assert.match(widget, /This attachment is not available yet/);
});

test('support operators can mark an unassigned inbox conversation read', () => {
  const migration = read('supabase/migrations/20260909250000_support_operator_mark_read.sql');
  assert.match(migration, /create or replace function public\.support_mark_read/);
  assert.match(migration, /public\.is_support_operator\(\)/);
  assert.match(migration, /grant execute on function public\.support_mark_read\(uuid, bigint\) to authenticated/);
});

test('support availability is read-only, truthful, and visible before a customer starts a conversation', () => {
  const support = read('supabase/functions/support-api/index.ts');
  const service = read('src/services/supportService.js');
  const widget = read('src/components/support/SupportWidget.jsx');

  assert.match(support, /'routing'/);
  assert.match(support, /support_get_routing_context/);
  assert.match(support, /Support availability is temporarily unavailable/);
  assert.match(service, /getSupportRoutingContext/);
  assert.match(service, /invokeSupport\('routing'\)/);
  assert.match(widget, /getSupportRoutingContext/);
  assert.match(widget, /Availability unavailable · messages can still be sent/);
  assert.match(widget, /getAvailabilityCopy\(routing, routingUnavailable\)\.className/);
  assert.match(widget, /Offline · support hours/);
  assert.match(widget, /Support team available now/);
  assert.match(widget, /your message will be queued/);
  assert.match(widget, /Please do not include passwords/);
  assert.match(widget, /aria-live="polite"/);
});

test('admin navigation defaults to a light sidebar and persists a complete theme choice', () => {
  const provider = read('src/components/admin/AdminThemeProvider.jsx');
  const shell = read('src/components/admin/AdminShell.jsx');
  const styles = read('src/components/admin/admin-shell.css');
  const customerTheme = read('src/context/ThemeContext.jsx');
  const app = read('src/App.jsx');
  const appShellFrame = read('src/components/layout/AppShellFrame.jsx');

  assert.match(provider, /resumeats\.admin\.theme/);
  assert.match(provider, /return 'light'/);
  assert.match(provider, /new Set\(\['light', 'dark', 'system'\]\)/);
  assert.match(provider, /localStorage\.setItem/);
  assert.match(provider, /prefers-color-scheme: dark/);
  assert.doesNotMatch(provider, /root\.classList\.toggle\('dark'/);
  assert.match(shell, /Light/);
  assert.match(shell, /Dark/);
  assert.match(shell, /System/);
  assert.match(shell, /id: 'errors', label: 'Client errors', available: true/);
  assert.match(shell, /id: 'admins', label: 'Admin access', available: true/);
  assert.match(shell, /id: 'feedback', label: 'Feedback', available: true/);
  assert.doesNotMatch(read('src/pages/AdminDashboard.jsx'), /const tabs = \[/);
  assert.match(shell, /event\.key === 'Escape'/);
  assert.match(shell, /event\.key !== 'Tab'/);
  assert.match(shell, /focusableSelector/);
  assert.match(shell, /mobileSidebarRef/);
  assert.match(shell, /aria-modal=\{mobileNavigationOpen \? 'true' : undefined\}/);
  assert.match(shell, /requestAnimationFrame\(\(\) => mobileToggleRef\.current\?\.focus\(\)\)/);
  assert.match(shell, /admin-sidebar-backdrop/);
  assert.match(shell, /previousBodyOverflow/);
  assert.match(shell, /admin-shell\$\{isDark \? ' dark' : ''\}/);
  assert.match(styles, /--admin-sidebar: #ffffff/);
  assert.match(styles, /data-admin-theme='dark'/);
  assert.match(styles, /color-scheme: light/);
  assert.match(customerTheme, /globalThemeEnabled/);
  assert.match(customerTheme, /applyTheme\(isDark, globalThemeEnabled\)/);
  assert.match(app, /setGlobalThemeEnabled\(!adminMode\)/);
  assert.match(app, /const adminMode/);
  assert.match(appShellFrame, /data-admin-mode=/);
  assert.match(appShellFrame, /!adminMode && <Header \/>/);
});

test('support persistence separates customer messages from notes and enforces current access', () => {
  const migration = read('supabase/migrations/20260908234657_support_conversation_core.sql');
  const operatorMigration = read('supabase/migrations/20260908235835_support_operator_tools.sql');
  const directoryMigration = read('supabase/migrations/20260909001120_admin_user_directory_projection.sql');
  const api = read('supabase/functions/support-api/index.ts');
  const service = read('src/services/supportService.js');

  for (const table of [
    'support_conversations',
    'support_guest_sessions',
    'support_participants',
    'support_messages',
    'support_internal_notes',
    'support_conversation_events',
    'support_read_cursors',
    'support_operation_receipts',
    'support_delivery_outbox',
  ]) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(migration, new RegExp(`'${table}'`));
  }
  assert.match(migration, /execute format\('alter table public\.%I enable row level security'/);
  assert.match(migration, /revoke all on table public\.%I from public, anon, authenticated/);
  assert.match(migration, /unique \(conversation_id, sequence_no\)/);
  assert.match(migration, /unique \(conversation_id, client_message_id\)/);
  assert.match(migration, /for update/);
  assert.match(migration, /public\.is_support_operator\(\)/);
  assert.match(migration, /internalNotes/);
  assert.match(migration, /grant execute on function public\.support_read_conversation/);
  assert.match(migration, /support_guest_operation_receipts/);
  assert.match(migration, /support_start_guest_conversation/);
  assert.match(operatorMigration, /support_list_queue/);
  assert.match(operatorMigration, /support_add_internal_note/);
  assert.match(operatorMigration, /Support operator access required/);
  assert.match(directoryMigration, /create table if not exists public\.admin_user_directory/);
  assert.match(directoryMigration, /order by d\.created_at desc, d\.user_id desc/);
  assert.match(directoryMigration, /admin_list_user_directory/);
  assert.match(directoryMigration, /auth\.role\(\)/);
  assert.doesNotMatch(directoryMigration, /current_setting\('request\.jwt\.claim\.role'/);
  assert.match(directoryMigration, /enable row level security/);
  assert.match(directoryMigration, /nextCursor/);
  assert.doesNotMatch(migration, /email.*proof|proof.*email/i);
  assert.match(api, /x-support-guest-token/);
  assert.match(api, /SHA-256/);
  assert.match(api, /guestToken/);
  assert.match(api, /Payload too large/);
  assert.match(api, /Too many support requests/);
  assert.match(api, /Retry-After/);
  assert.doesNotMatch(api, /console\.(log|error).*guestToken/);
  assert.match(service, /x-support-guest-token/);
  assert.match(service, /sessionStorage/);
  assert.match(service, /storedSession\.conversationId/);
  assert.match(service, /clearSupportSession/);
  assert.match(service, /addSupportInternalNote/);
});

test('support email follow-up uses a durable lease and server-only provider worker', () => {
  const migration = read('supabase/migrations/20260909014309_support_email_notifications.sql');
  const leaseMigration = read('supabase/migrations/20260909015000_bind_support_email_leases.sql');
  const worker = read('supabase/functions/support-notification-worker/index.ts');

  assert.match(migration, /support_enqueue_agent_email/);
  assert.match(migration, /support_claim_email_outbox/);
  assert.match(migration, /support_complete_email_outbox/);
  assert.match(migration, /support_release_email_outbox/);
  assert.match(migration, /for update of o skip locked/);
  assert.match(migration, /grant execute on function public\.support_claim_email_outbox.*service_role/);
  assert.match(leaseMigration, /add column if not exists worker_id text/);
  assert.match(leaseMigration, /worker_id = btrim\(p_worker_id\)/);
  assert.match(leaseMigration, /worker_id = btrim\(p_worker_id\) and locked_until > clock_timestamp\(\)/);
  assert.match(worker, /SUPPORT_NOTIFICATION_SECRET/);
  assert.match(worker, /BREVO_API_KEY/);
  assert.match(worker, /api\.brevo\.com\/v3\/smtp\/email/);
  assert.match(worker, /Idempotency-Key/);
  assert.match(worker, /isSingleEmailAddress/);
  assert.match(worker, /escapeEmailHtml/);
  assert.doesNotMatch(worker, /console\.(log|error).*recipient|console\.(log|error).*body/i);
});

test('admin invitations use an expiring service-only email outbox', () => {
  const migration = read('supabase/migrations/20260909180000_admin_invitation_email.sql');
  const worker = read('supabase/functions/admin-invitation-email/index.ts');
  const api = read('supabase/functions/admin-api/index.ts');

  assert.match(migration, /admin_invitation_email_outbox/);
  assert.match(migration, /invitation_expires_at > clock_timestamp\(\)/);
  assert.match(migration, /for update of o skip locked/);
  assert.match(migration, /grant execute on function public\.admin_claim_invitation_email_outbox.*service_role/);
  assert.match(worker, /ADMIN_INVITATION_EMAIL_SECRET/);
  assert.match(worker, /BREVO_API_KEY/);
  assert.match(worker, /api\.brevo\.com\/v3\/smtp\/email/);
  assert.match(worker, /Idempotency-Key/);
  assert.match(worker, /escapeEmailHtml/);
  assert.match(api, /admin_invitation_email_outbox/);
});

test('support feedback is durable, identity-bound, and only available after resolution', () => {
  const migration = read('supabase/migrations/20260909015242_support_feedback_knowledge_settings.sql');
  const api = read('supabase/functions/support-api/index.ts');
  const service = read('src/services/supportService.js');
  const widget = read('src/components/support/SupportWidget.jsx');

  assert.match(migration, /create table if not exists public\.customer_feedback/);
  assert.match(migration, /rating smallint.*between 1 and 5/);
  assert.match(migration, /support_submit_feedback/);
  assert.match(migration, /support_submit_guest_feedback/);
  assert.match(migration, /status = 'resolved'/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.customer_feedback from public, anon, authenticated/);
  assert.match(api, /case 'feedback'/);
  assert.match(service, /submitSupportFeedback/);
  assert.match(widget, /How did we do/);
  assert.match(widget, /Submit feedback/);
  assert.match(read('src/pages/AdminDashboard.jsx'), /const AdminFeedbackPanel/);
  assert.match(read('src/pages/AdminDashboard.jsx'), /Load older feedback/);
});

test('support knowledge is versioned and published only through reviewed operator actions', () => {
  const migration = read('supabase/migrations/20260909015242_support_feedback_knowledge_settings.sql');
  const api = read('supabase/functions/support-api/index.ts');
  const service = read('src/services/supportService.js');
  const dashboard = read('src/pages/AdminDashboard.jsx');
  const securityService = read('src/services/adminSecurityService.js');

  assert.match(migration, /create table if not exists public\.support_knowledge_articles/);
  assert.match(migration, /create table if not exists public\.support_knowledge_versions/);
  assert.match(migration, /status in \('draft', 'published', 'archived'\)/);
  assert.match(migration, /support_create_knowledge_draft/);
  assert.match(migration, /support_publish_knowledge/);
  assert.match(migration, /support_rollback_knowledge/);
  assert.match(migration, /support_list_published_knowledge/);
  assert.match(migration, /reviewed_at/);
  assert.match(migration, /current_version_id/);
  assert.match(migration, /grant execute on function public\.support_list_published_knowledge.*service_role/);
  assert.match(api, /case 'knowledgeList'/);
  assert.match(api, /case 'knowledgePublish'/);
  assert.match(service, /createSupportKnowledgeDraft/);
  assert.match(dashboard, /AdminKnowledgePanel/);
  assert.match(dashboard, /Rollback to v/);
  assert.match(securityService, /mfa\.enroll/);
  assert.match(securityService, /mfa\.challenge/);
  assert.match(securityService, /mfa\.verify/);
});

test('support AI is disabled by default and uses a durable guarded worker boundary', () => {
  const migration = read('supabase/migrations/20260909021639_support_ai_runs.sql');
  const historyMigration = read('supabase/migrations/20260909022910_support_ai_settings_history.sql');
  const worker = read('supabase/functions/support-ai-worker/index.ts');
  const config = read('supabase/config.toml');
  const adminApi = read('supabase/functions/admin-api/index.ts');
  const adminService = read('src/services/adminService.js');
  const dashboard = read('src/pages/AdminDashboard.jsx');

  assert.match(migration, /create table if not exists public\.support_ai_settings/);
  assert.match(migration, /enabled boolean not null default false/);
  assert.match(migration, /create table if not exists public\.support_ai_runs/);
  assert.match(migration, /create table if not exists public\.support_ai_usage_records/);
  assert.match(migration, /admin_update_support_ai_settings/);
  assert.match(migration, /support-ai\.settings\.updated/);
  assert.match(migration, /insert into public\.admin_audit_events/);
  assert.match(migration, /role in \('owner', 'admin'\)/);
  assert.match(migration, /support_ai_claim_runs/);
  assert.match(migration, /for update skip locked/);
  assert.match(migration, /support_ai_complete_run/);
  assert.match(migration, /conversation\.ai_epoch <> run\.expected_ai_epoch/);
  assert.match(migration, /conversation\.mode <> 'ai'/);
  assert.match(migration, /support_ai_after_message/);
  assert.match(migration, /support_ai_enqueue_after_message/);
  assert.match(migration, /grant execute on function public\.support_ai_complete_run.*service_role/);
  assert.doesNotMatch(migration, /prompt text|chain.of.thought/i);
  assert.match(worker, /SUPPORT_AI_WORKER_SECRET/);
  assert.match(worker, /SUPPORT_AI_ENABLED/);
  assert.match(worker, /SUPPORT_AI_PROVIDER_TOKEN/);
  assert.match(worker, /support_ai_claim_runs/);
  assert.match(worker, /support_ai_complete_run/);
  assert.match(worker, /response_format/);
  assert.match(worker, /published knowledge/);
  assert.match(worker, /requestTimeoutMs/);
  assert.doesNotMatch(worker, /console\.(log|error).*providerToken|console\.(log|error).*body/i);
  assert.match(config, /\[functions\.support-ai-worker\]/);
  assert.match(config, /\[functions\.support-ai-worker\][\s\S]*?verify_jwt = false/);
  assert.match(adminApi, /support_ai_settings/);
  assert.match(adminApi, /providerConfigured/);
  assert.match(adminApi, /effectiveEnabled/);
  assert.match(adminApi, /circuitOpen/);
  assert.match(adminApi, /analyticsCsv/);
  assert.match(adminApi, /if \(\/\^\[=\+\\-@\]\/\.test\(text\)\)/);
  assert.match(adminApi, /updateSupportAiSettings/);
  assert.match(adminApi, /MFA step-up required/);
  assert.match(adminApi, /provider and worker secrets are configured/);
  assert.match(adminService, /fetchAdminSettings/);
  assert.match(adminService, /fetchAdminAnalyticsCsv/);
  assert.match(adminService, /updateAdminSupportAiSettings/);
  assert.match(dashboard, /AdminIntegrationHealthPanel/);
  assert.match(dashboard, /Secret values are never returned/);
  assert.match(dashboard, /Save AI safety settings/);
  assert.match(historyMigration, /support_ai_settings_history/);
  assert.match(historyMigration, /settings_revision bigint not null unique/);
  assert.match(historyMigration, /support_ai_settings_history_trigger/);
  assert.match(historyMigration, /support_ai_set_circuit/);
  assert.match(historyMigration, /admin_rollback_support_ai_settings/);
  assert.match(historyMigration, /support-ai\.settings\.rollback/);
  assert.match(historyMigration, /support-ai\.circuit\.opened/);
  assert.match(historyMigration, /revoke all on table public\.support_ai_settings_history/);
  assert.match(worker, /support_ai_set_circuit/);
  assert.match(adminApi, /resetSupportAiCircuit/);
  assert.match(adminApi, /rollbackSupportAiSettings/);
  assert.match(adminService, /resetAdminSupportAiCircuit/);
  assert.match(adminService, /rollbackAdminSupportAiSettings/);
  assert.match(dashboard, /Recent safety-setting history/);
  assert.match(dashboard, /Clear circuit/);
  assert.match(dashboard, /Confirm/);
  assert.match(dashboard, /Download CSV/);
});

test('support attachments use private signed uploads, quarantine, and expiring authorized downloads', () => {
  const migration = read('supabase/migrations/20260909011344_support_attachments.sql');
  const scanMigration = read('supabase/migrations/20260909012542_support_attachment_scan_worker.sql');
  const api = read('supabase/functions/support-api/index.ts');
  const scanner = read('supabase/functions/support-attachment-scan/index.ts');
  const service = read('src/services/supportService.js');
  const widget = read('src/components/support/SupportWidget.jsx');

  assert.match(migration, /support-attachments/);
  assert.match(migration, /public\.support_attachments/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.support_attachments from public, anon, authenticated/);
  assert.match(migration, /'quarantined'/);
  assert.match(migration, /support_mark_attachment_scan/);
  assert.match(migration, /'application\/pdf'/);
  assert.doesNotMatch(migration, /image\/svg|text\/html/);
  assert.match(api, /createSignedUploadUrl/);
  assert.match(api, /createSignedUrl/);
  assert.match(api, /awaiting safety review/);
  assert.match(api, /10 \* 1024 \* 1024/);
  assert.match(service, /uploadToSignedUrl/);
  assert.match(service, /downloadSupportAttachment/);
  assert.match(widget, /accept="image\/jpeg,image\/png,application\/pdf"/);
  assert.match(widget, /Safety review/);
  assert.match(scanMigration, /support_claim_attachment_scan/);
  assert.match(scanMigration, /for update skip locked/);
  assert.match(scanMigration, /support_complete_attachment_scan/);
  assert.match(scanMigration, /support_release_attachment_scan/);
  assert.match(scanMigration, /grant execute on function public\.support_claim_attachment_scan.*service_role/);
  assert.match(scanner, /SUPPORT_ATTACHMENT_SCANNER_SECRET/);
  assert.match(scanner, /ATTACHMENT_SCANNER_URL/);
  assert.match(scanner, /magic_mismatch/);
  assert.match(scanner, /support_complete_attachment_scan/);
  assert.match(scanner, /support_release_attachment_scan/);
  assert.doesNotMatch(scanner, /scannerUrl\s*=\s*['"]['"]/);
});
