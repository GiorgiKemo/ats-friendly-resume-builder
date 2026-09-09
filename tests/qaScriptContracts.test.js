import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('browser smoke contracts follow the current public homepage copy', () => {
  const routeSmoke = read('tests/playwright/route-smoke.mjs');
  const fullQa = read('tests/playwright/full-website-qa.mjs');

  assert.match(routeSmoke, /Build an ATS-Friendly Resume/i);
  assert.match(fullQa, /Build an ATS-Friendly Resume/i);
  assert.doesNotMatch(routeSmoke, /Build an ATS-Optimized Resume/i);
  assert.doesNotMatch(fullQa, /Build an ATS-Optimized Resume/i);
  assert.match(fullQa, /Using existing server at \$\{BASE_URL\}/);
  assert.doesNotMatch(fullQa, /Using existing server at http:\/\/localhost:5174/);
  assert.match(routeSmoke, /Unknown route kept an incorrect document title/);
  assert.match(routeSmoke, /noindex,follow/);
  assert.match(routeSmoke, /focusable generic wrapper/);
  assert.match(routeSmoke, /div\[tabindex="0"\]:not\(\[role\]\)/);
  assert.match(routeSmoke, /main landmarks/);
  assert.match(routeSmoke, /primary headings/);
});

test('the default Vite development origin matches the documented local preview', () => {
  const viteConfig = read('vite.config.js');
  const responsiveAudit = read('scripts/responsive-audit.mjs');

  assert.match(viteConfig, /server:\s*\{[\s\S]*?port:\s*5175/);
  assert.match(responsiveAudit, /127\.0\.0\.1:5175/);
  assert.doesNotMatch(viteConfig, /server:\s*\{[\s\S]*?port:\s*5174/);
});

test('browser smoke refuses to attach to an unrelated HTTP service', () => {
  const routeSmoke = read('tests/playwright/route-smoke.mjs');

  assert.match(routeSmoke, /RESUMEATS_ROOT_MARKER/);
  assert.match(routeSmoke, /RESUMEATS_ENTRYPOINT_MARKER/);
  assert.match(routeSmoke, /process\.env\.SMOKE_PORT \|\| '4199'/);
  assert.match(routeSmoke, /<title>\\s\*ResumeATS/);
  assert.match(routeSmoke, /signinResponse/);
  assert.match(routeSmoke, /RESUMEATS_ROOT_MARKER\.test\(signinBody\)/);
  assert.match(routeSmoke, /AbortSignal\.timeout/);
  assert.match(routeSmoke, /Response\.text\(\)/);
  assert.match(routeSmoke, /BASE_URL\}\/terms\//);
  assert.match(routeSmoke, /theme-bootstrap\.js/);
  assert.match(routeSmoke, /Terms of Service/);
  assert.match(routeSmoke, /another service may own the port/);
});

test('admin mode keeps a single main landmark and the skip-link target', () => {
  const shellFrame = read('src/components/layout/AppShellFrame.jsx');
  const adminShell = read('src/components/admin/AdminShell.jsx');

  assert.match(shellFrame, /adminMode \? \(/);
  assert.match(shellFrame, /<div className="app-main">\{children\}<\/div>/);
  assert.match(shellFrame, /<main className="app-main" id="main-content" tabIndex=\{-1\}>/);
  assert.match(adminShell, /<main className="admin-main" id="main-content" tabIndex=\{-1\}>/);
});

test('extension QA rejects unsupported Firefox execution instead of hanging', () => {
  const extensionQa = read('tests/playwright/extension-qa.mjs');
  const liveExtensionQa = read('tests/playwright/extension-live-sites-qa.mjs');
  const firefoxCompat = read('tests/playwright/extension-firefox-compat.mjs');
  const workflow = read('.github/workflows/ci.yml');

  assert.match(extensionQa, /browserConfig\.engine !== 'chromium'/);
  assert.match(extensionQa, /extension-firefox-compat\.mjs/);
  assert.match(liveExtensionQa, /browserConfig\.engine !== 'chromium'/);
  assert.match(liveExtensionQa, /extension-firefox-compat\.mjs/);
  assert.match(liveExtensionQa, /QA_ALLOW_LIVE_EXTENSION_SITES !== '1'/);
  assert.match(firefoxCompat, /firefoxReady/);
  assert.match(firefoxCompat, /dist-extension-firefox/);
  assert.match(workflow, /npm run test:extension:chromium/);
  assert.match(workflow, /npm run test:extension:firefox/);
  assert.match(workflow, /bash -n deploy-to-vercel\.sh deploy-env-to-vercel\.sh deploy-supabase-functions\.sh deploy-webhook\.sh/);
});

test('support browser QA exercises the admin AI and job status panels', () => {
  const supportQa = read('tests/playwright/support-local-qa.mjs');

  assert.match(supportQa, /process\.env\.SUPPORT_QA_PORT \|\| '5176'/);
  assert.match(supportQa, /name: 'AI & Jobs'/);
  assert.match(supportQa, /getByText\('Auto-apply job states'/);
  assert.match(supportQa, /getByText\('Auto-apply run states'/);
});

test('production HTTP audit keeps public, private and unknown-route gates explicit', () => {
  const productionAudit = read('scripts/audit-production-http.mjs');
  const routeManifest = read('scripts/route-manifest.mjs');
  const sourceRouteManifest = read('src/routeManifest.js');

  assert.match(productionAudit, /PRODUCTION_BASE_URL/);
  assert.match(productionAudit, /noindex,follow/);
  assert.match(productionAudit, /X-Robots-Tag|xRobotsTag/);
  assert.match(productionAudit, /__resumeats-audit-missing-route__/);
  assert.match(productionAudit, /expected HTTP 404/);
  assert.match(productionAudit, /theme-bootstrap\.js/);
  assert.match(productionAudit, /JavaScript content type/);
  assert.match(productionAudit, /extractLocalAssetPaths/);
  assert.match(productionAudit, /extractJavascriptChunkPaths/);
  assert.match(productionAudit, /dynamicAssets/);
  assert.match(productionAudit, /route-manifest\.mjs/);
  assert.match(routeManifest, /export \{ publicRoutes, privateRoutes, routes, routeMatchesPath \} from '\.\.\/src\/routeManifest\.js'/);
  assert.match(sourceRouteManifest, /export const publicRoutes = \[/);
  assert.match(sourceRouteManifest, /export const privateRoutes = \[/);
  assert.match(sourceRouteManifest, /\['\/update-password'/);
  assert.match(sourceRouteManifest, /\['\/dashboard'/);
  assert.match(sourceRouteManifest, /\['\/builder'/);
  assert.match(sourceRouteManifest, /\['\/preview'/);
  assert.match(sourceRouteManifest, /\['\/profile'/);
  assert.match(sourceRouteManifest, /\['\/ai-generator'/);
  assert.match(sourceRouteManifest, /\['\/new'/);
  assert.match(sourceRouteManifest, /\['\/quick-resume'/);
  assert.match(sourceRouteManifest, /\['\/applications'/);
  assert.match(sourceRouteManifest, /\['\/auto-apply'/);
  assert.match(sourceRouteManifest, /\['\/analytics'/);
  assert.match(sourceRouteManifest, /\['\/admin'/);
  assert.match(sourceRouteManifest, /\['\/subscription\/manage'/);
  assert.match(sourceRouteManifest, /\['\/subscription\/success'/);
  assert.match(productionAudit, /edgeFunctionRoutes/);
  assert.match(productionAudit, /expected GET health response 405/);
  assert.match(productionAudit, /referenced asset returned an HTML document/);
  assert.match(productionAudit, /forbiddenPublicClaims/);
  assert.match(productionAudit, /deployed JavaScript contains forbidden public copy/);
  assert.match(productionAudit, /obsoleteThemeHash/);
});

test('production capability audit is read-only and never reports scheduler or secret values as proven', () => {
  const capabilityAudit = read('scripts/audit-production-capabilities.mjs');

  assert.match(capabilityAudit, /readOnly: true/);
  assert.match(capabilityAudit, /SUPPORT_NOTIFICATION_SECRET/);
  assert.match(capabilityAudit, /BILLING_RECONCILIATION_SECRET/);
  assert.match(capabilityAudit, /missingRemotely/);
  assert.match(capabilityAudit, /databaseMetadata/);
  assert.match(capabilityAudit, /db', 'query'/);
  assert.match(capabilityAudit, /activeAdminMemberCounts/);
  assert.match(capabilityAudit, /keyTablePolicyCounts/);
  assert.match(capabilityAudit, /apiRoleTableGrants/);
  assert.match(capabilityAudit, /keyPolicySummary/);
  assert.match(capabilityAudit, /usingReferencesAuthIdentity/);
  assert.match(capabilityAudit, /scheduler: \{[\s\S]*status: 'unverified'/);
  assert.match(capabilityAudit, /redact/);
  assert.doesNotMatch(capabilityAudit, /secrets set|functions deploy|db push/);
});

test('the interactive Vercel deploy script refuses to claim an unverified release', () => {
  const deploy = read('deploy-to-vercel.sh');

  assert.match(deploy, /npm run audit:production:http/);
  assert.match(deploy, /production HTTP release gate failed/i);
  assert.doesNotMatch(deploy, /Your application should now be live on Vercel/i);
});

test('Stripe return routes reject malformed session IDs before provider verification', () => {
  const stripeReturn = read('src/pages/StripeReturnPage.jsx');

  assert.ok(stripeReturn.includes('const STRIPE_SESSION_ID_PATTERN = /^cs_[A-Za-z0-9_-]{4,255}$/;'));
  assert.match(stripeReturn, /must not trigger a provider request that can hang/);
  assert.match(stripeReturn, /STRIPE_SESSION_ID_PATTERN\.test\(sessionId\)/);
  assert.match(stripeReturn, /role="alert" className="text-red-700 dark:text-red-300/);
});

test('header marks Home active only on the exact home route', () => {
  const header = read('src/components/layout/Header.jsx');

  assert.match(header, /path === '\/'[\s\S]*location\.pathname === '\/'/);
  assert.doesNotMatch(header, /const isActive = \(path\) =>\s*location\.pathname === path \|\| location\.pathname\.startsWith\(`\$\{path\}\/`\)/);
});

test('native buttons keep explicit submit versus control semantics', () => {
  const eslintConfig = read('eslint.config.js');

  assert.match(eslintConfig, /['"]react\/button-has-type['"]:\s*['"]error['"]/);
});

test('admin action dialog keeps keyboard focus and locks background scroll', () => {
  const dialog = read('src/components/admin/AdminActionDialog.jsx');

  assert.match(dialog, /const dialogRef = useRef\(null\)/);
  assert.match(dialog, /document\.body\.style\.overflow = 'hidden'/);
  assert.match(dialog, /event\.key !== 'Tab'/);
  assert.match(dialog, /dialogElement\.querySelectorAll\(/);
  assert.match(dialog, /aria-modal="true"/);
});

test('mobile support trigger stays compact without losing its accessible name', () => {
  const support = read('src/components/support/SupportWidget.jsx');
  const styles = read('src/index.css');

  assert.match(support, /aria-label=\{open \? 'Close support dialog' : 'Open support dialog'\}/);
  assert.match(support, /support-widget-trigger-label/);
  assert.match(styles, /\.support-widget-root \.support-widget-trigger \{[\s\S]*?width: 3rem/);
  assert.match(styles, /\.support-widget-root \.support-widget-trigger-label \{[\s\S]*?display: none/);
});

test('support browser QA targets the trigger accessible name', () => {
  const support = read('src/components/support/SupportWidget.jsx');
  const qa = read('tests/playwright/support-local-qa.mjs');

  assert.match(support, /aria-label=\{open \? 'Close support dialog' : 'Open support dialog'\}/);
  assert.equal((qa.match(/getByRole\('button', \{ name: 'Open support dialog', exact: true \}\)/g) || []).length, 4);
  assert.match(qa, /adminPage\.getByRole\('button', \{ name: 'Support', exact: true \}\)/);
});

test('responsive audit measures heading clearance from fixed header only', () => {
  const responsiveAudit = read('scripts/responsive-audit.mjs');

  assert.match(responsiveAudit, /consent notice is in normal page flow/);
  assert.match(responsiveAudit, /headingGapFromHeader/);
  assert.doesNotMatch(responsiveAudit, /headingTop - headerHeight - noticeHeight/);
});

test('repository-facing product copy avoids universal ATS outcome claims', () => {
  const readme = read('README.md');

  assert.match(readme, /ATS-aware/i);
  assert.match(readme, /not a\s+guarantee/i);
  assert.doesNotMatch(readme, /ATS-optimized/i);
  assert.doesNotMatch(readme, /designed to pass Applicant Tracking Systems/i);
});
