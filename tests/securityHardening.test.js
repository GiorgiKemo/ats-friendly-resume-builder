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

  for (const source of [engagement, reporter]) {
    assert.match(source, /rpc\('claim_public_engagement_attempt'/);
    assert.match(source, /rpc\('finalize_public_engagement_attempt'/);
    assert.doesNotMatch(source, /from\(['"]public_engagement_attempts['"]\)/);
  }
  assert.match(migration, /pg_advisory_xact_lock\(/);
  assert.match(migration, /reason = 'reserved'/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.public_engagement_attempts FROM service_role/);
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
  assert.doesNotMatch(serviceWorker, /https:\/\/\*\.supabase\.co/);
  assert.match(vercel, /https:\/\/onuxzcectniowxqtmjpg\.supabase\.co/);
  assert.match(headers, /https:\/\/onuxzcectniowxqtmjpg\.supabase\.co/);
  assert.match(vercel, /connect-src[^;]*https:\/\/api\.stripe\.com[^;]*;/);
  assert.match(headers, /connect-src[^;]*https:\/\/api\.stripe\.com[^;]*;/);
  assert.doesNotMatch(serviceWorker, /Content-Security-Policy/);
  assert.match(vercel, /base-uri 'self'/);
  assert.match(vercel, /frame-ancestors 'none'/);
  assert.match(headers, /base-uri 'self'/);
  assert.match(headers, /frame-ancestors 'none'/);
});

test('resume creation telemetry does not include the candidate payload', () => {
  const resumeContext = read('src/context/ResumeContext.tsx');

  assert.doesNotMatch(resumeContext, /logError\(e as Error, 'resume\.create',[\s\S]{0,180}resumeData\s*:/);
  assert.match(resumeContext, /logError\(e as Error, 'resume\.create',[\s\S]{0,180}resumeId:\s*'new'/);
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
    assert.match(proxy, /Provider responses can echo prompt\/profile fragments/);
    assert.doesNotMatch(proxy, /details,\s*\n\s*\}\),\s*\{/);
    assert.doesNotMatch(proxy, /logDebug\('[^']*upstream error',\s*response\.status,\s*responseText\)/);
  }
});

test('checkout diagnostics do not log request, identity or provider payloads', () => {
  const checkout = read('supabase/functions/create-checkout-session/index.ts');

  assert.match(checkout, /const summarizeError =/);
  assert.match(checkout, /const logError =/);
  assert.doesNotMatch(checkout, /console\.error\([^\n]*(?:requestBody|user\.id|customerId|priceId|stripeError|Raw Error|Error Message|Stringified)/);
  assert.doesNotMatch(checkout, /logDebug\([^\n]*(?:user\.id|customerId|profile\.email|priceId|planId|success_url|cancel_url)/);
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
  assert.doesNotMatch(gmail, /JSON\.stringify\(\{ error: message \}\)/);
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
