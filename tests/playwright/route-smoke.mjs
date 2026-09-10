import process from 'node:process';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { chromium } from 'playwright';

const HOST = process.env.SMOKE_HOST || '127.0.0.1';
const configuredPort = process.env.SMOKE_PORT;
let PORT = configuredPort || '4199';
let BASE_URL = process.env.PLAYWRIGHT_BASE_URL || `http://${HOST}:${PORT}`;
const VITE_BIN = 'node_modules/vite/bin/vite.js';
const ROUTE_URL = (route = '/') => `${BASE_URL}${route}`;
const RESUMEATS_ROOT_MARKER = /<div[^>]+id=["']root["'][^>]*>/i;
const RESUMEATS_ENTRYPOINT_MARKER = /<title>\s*ResumeATS\s*-\s*ATS-Friendly Resume Builder\s*<\/title>/i;

const publicRoutes = [
  ['/', /Build an ATS-Friendly Resume/i],
  ['/learn', /What is an ATS|ATS Best Practices/i],
  ['/pricing', /Premium AI\+/i],
  ['/about', /About ResumeATS|Now that you know us/i],
  ['/terms', /ResumeATS Terms of Service/i],
  ['/privacy-policy', /Privacy Policy/i],
  ['/faq', /Your Questions, Answered/i],
  ['/contact', /Contact/i],
  ['/signin', /Sign in/i],
  ['/signup', /Create|Sign up|Get started/i],
  ['/forgot-password', /Forgot Password/i],
  ['/update-password', /Reset Link Invalid|Set New Password/i],
  ['/welcome', /Checking|Welcome|sign/i],
  ['/return-from-stripe', /Payment Verification Failed/i],
  ['/return-from-stripe/not-a-session-id', /Payment Verification Failed/i],
  ['/return-from-paypal', /Payment not confirmed yet/i],
  ['/does-not-exist', /Page Not Found/i],
];

const protectedRoutes = [
  '/dashboard',
  '/builder',
  '/builder/test-resume-id',
  '/preview/test-resume-id',
  '/profile',
  '/ai-generator',
  '/quick-resume',
  '/applications',
  '/auto-apply',
  '/analytics',
  '/admin',
  '/admin/users',
  '/admin/analytics',
  '/subscription/manage',
  '/subscription/success',
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isReachable = async () => {
  try {
    const responses = await Promise.all([
      fetch(BASE_URL, { headers: { accept: 'text/html' }, signal: AbortSignal.timeout(2000) }),
      fetch(`${BASE_URL}/terms/`, { headers: { accept: 'text/html' }, signal: AbortSignal.timeout(2000) }),
      fetch(`${BASE_URL}/theme-bootstrap.js`, { headers: { accept: 'text/javascript' }, signal: AbortSignal.timeout(2000) }),
      fetch(`${BASE_URL}/signin`, { headers: { accept: 'text/html' }, signal: AbortSignal.timeout(2000) }),
      fetch(`${BASE_URL}/faq`, { headers: { accept: 'text/html' }, signal: AbortSignal.timeout(2000) }),
      fetch(`${BASE_URL}/admin/users`, { headers: { accept: 'text/html' }, signal: AbortSignal.timeout(2000) }),
    ]);
    const [rootResponse, termsResponse, bootstrapResponse, signinResponse, faqResponse, adminUsersResponse] = responses;
    if (![rootResponse, termsResponse, bootstrapResponse, signinResponse, faqResponse, adminUsersResponse].every((response) => response.ok)) return false;
    const [rootBody, termsBody, signinBody] = await Promise.all([rootResponse.text(), termsResponse.text(), signinResponse.text()]);
    const bootstrapType = bootstrapResponse.headers.get('content-type') || '';
    return RESUMEATS_ROOT_MARKER.test(rootBody)
      && RESUMEATS_ENTRYPOINT_MARKER.test(rootBody)
      && /<title>\s*Terms of Service\s*-\s*ResumeATS\s*<\/title>/i.test(termsBody)
      && RESUMEATS_ROOT_MARKER.test(signinBody)
      && bootstrapType.toLowerCase().includes('javascript');
  } catch {
    return false;
  }
};

const useIsolatedPort = async () => {
  if (process.env.PLAYWRIGHT_BASE_URL || configuredPort) return;

  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, HOST, resolve);
  });
  const address = probe.address();
  PORT = String(typeof address === 'object' && address ? address.port : 4199);
  await new Promise((resolve, reject) => probe.close((error) => (error ? reject(error) : resolve())));
  BASE_URL = `http://${HOST}:${PORT}`;
};

let previewProcess = null;
let previewLog = '';

const cleanup = () => {
  if (previewProcess && !previewProcess.killed) previewProcess.kill();
};

process.once('exit', cleanup);
process.once('SIGINT', () => {
  cleanup();
  process.exit(130);
});
process.once('SIGTERM', () => {
  cleanup();
  process.exit(143);
});

const ensurePreview = async () => {
  if (await isReachable()) return;

  previewProcess = spawn(
    process.execPath,
    [VITE_BIN, 'preview', '--host', HOST, '--port', PORT, '--strictPort'],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    },
  );

  previewProcess.stdout?.on('data', (chunk) => {
    previewLog += chunk.toString();
  });
  previewProcess.stderr?.on('data', (chunk) => {
    previewLog += chunk.toString();
  });

  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (previewProcess.exitCode !== null) {
      throw new Error(`Vite preview exited before a ResumeATS page became reachable at ${BASE_URL}.\n${previewLog}`);
    }
    if (await isReachable()) return;
    await sleep(500);
  }

  throw new Error(`Timed out waiting for a ResumeATS preview at ${BASE_URL}; another service may own the port.\n${previewLog}`);
};

const failures = [];
const consoleErrors = [];
const pageErrors = [];

const waitForAppIdle = async (page) => {
  await page.waitForLoadState('domcontentloaded');
  // Third-party analytics and blocked provider requests can keep a page from
  // reaching network-idle indefinitely; route smoke only needs the app DOM.
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
  await sleep(200);
};

await useIsolatedPort();
await ensurePreview();

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
page.setDefaultTimeout(15000);

page.on('console', (message) => {
  if (message.type() !== 'error') return;
  consoleErrors.push({ url: page.url(), text: message.text() });
});

page.on('pageerror', (error) => {
  pageErrors.push({ url: page.url(), text: error.message });
});

for (const [route, expected] of publicRoutes) {
  try {
    await page.goto(route === '/' ? BASE_URL : `${BASE_URL}${route}`);
    await waitForAppIdle(page);
    await page.locator('#root').waitFor({ state: 'visible' });
    await page.getByText(expected).first().waitFor({ state: 'visible' });
    const mainCount = await page.locator('main').count();
    if (mainCount !== 1) throw new Error(`Route rendered ${mainCount} main landmarks`);
    const headingCount = await page.locator('h1').count();
    if (headingCount !== 1) throw new Error(`Route rendered ${headingCount} primary headings`);
    const focusableWrappers = await page.locator('div[tabindex="0"]:not([role])').count();
    if (focusableWrappers) {
      throw new Error(`Route rendered ${focusableWrappers} focusable generic wrapper(s)`);
    }
    if (route === '/does-not-exist') {
      if (await page.title() !== 'Page Not Found - ResumeATS') {
        throw new Error(`Unknown route kept an incorrect document title: ${await page.title()}`);
      }
      const robots = await page.locator('meta[name="robots"]').getAttribute('content');
      if (robots !== 'noindex,follow') throw new Error(`Unknown route robots metadata was ${robots}`);
    }
  } catch (error) {
    failures.push({ route, error: error instanceof Error ? error.message : String(error) });
  }
}

try {
  await page.goto(`${BASE_URL}/contact`);
  await page.getByLabel('Analytics preferences').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Decline' }).click();
  await page.getByLabel('Analytics preferences').waitFor({ state: 'hidden' });
  if (await page.evaluate(() => window.localStorage.getItem('resumeats.analytics-consent')) !== 'denied') {
    throw new Error('Declining analytics did not persist the denied state');
  }

  await page.goto(`${BASE_URL}/privacy-policy`);
  await page.getByRole('button', { name: 'Change analytics preference' }).click();
  await page.goto(`${BASE_URL}/contact`);
  await page.getByLabel('Analytics preferences').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Accept analytics' }).click();
  await page.getByLabel('Analytics preferences').waitFor({ state: 'hidden' });
  if (await page.evaluate(() => window.localStorage.getItem('resumeats.analytics-consent')) !== 'granted') {
    throw new Error('Accepting analytics did not persist the granted state');
  }
} catch (error) {
  failures.push({ route: '/privacy-policy#analytics-consent', error: error instanceof Error ? error.message : String(error) });
}

try {
  await page.goto(`${BASE_URL}/learn`);
  await waitForAppIdle(page);
  const brandLink = page.getByRole('link', { name: 'ResumeATS home' });
  await brandLink.waitFor({ state: 'visible' });
  if (await brandLink.getAttribute('href') !== '/') {
    throw new Error('ResumeATS brand link does not target the homepage');
  }
  await brandLink.click();
  await page.waitForURL((url) => url.pathname === '/');

  await page.evaluate(() => window.scrollTo(0, window.document.body.scrollHeight));
  await page.getByRole('link', { name: 'ResumeATS home' }).click();
  const scrollY = await page.evaluate(() => window.scrollY);
  if (scrollY !== 0) throw new Error(`ResumeATS brand link left the homepage scrolled to ${scrollY}px`);
} catch (error) {
  failures.push({ route: '/learn#brand-navigation', error: error instanceof Error ? error.message : String(error) });
}

for (const route of protectedRoutes) {
  try {
    await page.goto(ROUTE_URL(route));
    await waitForAppIdle(page);
    await page.waitForURL(/\/signin(?:[/?#]|$)/, { timeout: 10000 });
    await page.getByRole('button', { name: /Sign In|Sign in/i }).first().waitFor({ state: 'visible' });
  } catch (error) {
    failures.push({ route, error: error instanceof Error ? error.message : String(error) });
  }
}

await browser.close();
cleanup();

if (failures.length || consoleErrors.length || pageErrors.length) {
  console.error(JSON.stringify({ failures, consoleErrors, pageErrors }, null, 2));
  process.exit(1);
}

console.log(`Route smoke passed for ${publicRoutes.length + protectedRoutes.length} routes at ${BASE_URL}.`);
