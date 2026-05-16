import process from 'node:process';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const HOST = process.env.SMOKE_HOST || '127.0.0.1';
const PORT = process.env.SMOKE_PORT || '4173';
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || `http://${HOST}:${PORT}`;
const VITE_BIN = 'node_modules/vite/bin/vite.js';
const HASH_URL = (route = '/') => `${BASE_URL}/#${route}`;

const publicRoutes = [
  ['/', /Build an ATS-Optimized Resume/i],
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
  '/subscription/manage',
  '/subscription/success',
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isReachable = async () => {
  try {
    const response = await fetch(BASE_URL, { headers: { accept: 'text/html' } });
    return response.ok || response.status === 304;
  } catch {
    return false;
  }
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
      throw new Error(`Vite preview exited before it became reachable.\n${previewLog}`);
    }
    if (await isReachable()) return;
    await sleep(500);
  }

  throw new Error(`Timed out waiting for Vite preview at ${BASE_URL}.\n${previewLog}`);
};

const failures = [];
const consoleErrors = [];
const pageErrors = [];

const waitForAppIdle = async (page) => {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle').catch(() => {});
  await sleep(200);
};

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
  } catch (error) {
    failures.push({ route, error: error instanceof Error ? error.message : String(error) });
  }
}

for (const route of protectedRoutes) {
  try {
    await page.goto(HASH_URL(route));
    await waitForAppIdle(page);
    await page.waitForURL(/#\/signin/, { timeout: 10000 });
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
