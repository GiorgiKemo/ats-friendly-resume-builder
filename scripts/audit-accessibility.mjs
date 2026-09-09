import process from 'node:process';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { chromium } from 'playwright';
import { publicRoutes } from './route-manifest.mjs';

const HOST = process.env.A11Y_HOST || '127.0.0.1';
const configuredPort = process.env.A11Y_PORT;
let port = configuredPort || '4198';
let baseUrl = (process.env.A11Y_BASE_URL || `http://${HOST}:${port}`).replace(/\/$/, '');
const viteBin = 'node_modules/vite/bin/vite.js';
let previewProcess = null;
let previewLog = '';
const auditRoutes = [
  ...publicRoutes.map(({ path }) => path),
  '/signin',
  '/signup',
  '/forgot-password',
  '/update-password',
  '/welcome',
  '/return-from-stripe',
  '/return-from-stripe/not-a-session-id',
  '/return-from-paypal',
  '/does-not-exist',
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const cleanup = () => {
  if (previewProcess && !previewProcess.killed) previewProcess.kill();
};

process.once('exit', cleanup);
process.once('SIGINT', () => { cleanup(); process.exit(130); });
process.once('SIGTERM', () => { cleanup(); process.exit(143); });

const useIsolatedPort = async () => {
  if (process.env.A11Y_BASE_URL || configuredPort) return;
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, HOST, resolve);
  });
  const address = probe.address();
  port = String(typeof address === 'object' && address ? address.port : port);
  await new Promise((resolve, reject) => probe.close((error) => (error ? reject(error) : resolve())));
  baseUrl = `http://${HOST}:${port}`;
};

const isReachable = async () => {
  try {
    const response = await fetch(baseUrl, { headers: { accept: 'text/html' }, signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
};

const ensurePreview = async () => {
  if (await isReachable()) return;
  previewProcess = spawn(process.execPath, [viteBin, 'preview', '--host', HOST, '--port', port, '--strictPort'], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });
  previewProcess.stdout?.on('data', (chunk) => { previewLog += chunk.toString(); });
  previewProcess.stderr?.on('data', (chunk) => { previewLog += chunk.toString(); });
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (previewProcess.exitCode !== null) {
      throw new Error(`Vite preview exited before accessibility audit became ready.\n${previewLog}`);
    }
    if (await isReachable()) return;
    await sleep(300);
  }
  throw new Error(`Timed out waiting for accessibility audit preview at ${baseUrl}.\n${previewLog}`);
};

const auditDom = () => ({
  issues: (() => {
    const hidden = (element) => {
      if (element.closest('[aria-hidden="true"]')) return true;
      const style = window.getComputedStyle(element);
      return style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0;
    };
    const text = (element) => element?.textContent?.replace(/\s+/g, ' ').trim() || '';
    const labelledBy = (element) => (element.getAttribute('aria-labelledby') || '')
      .split(/\s+/)
      .map((id) => document.getElementById(id))
      .map(text)
      .filter(Boolean)
      .join(' ');
    const labelFor = (element) => {
      const id = element.getAttribute('id');
      return id ? text(document.querySelector(`label[for="${CSS.escape(id)}"]`)) : '';
    };
    const controls = [...document.querySelectorAll('input, textarea, select, button, a[href], [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="tab"], [role="combobox"]')];
    const issues = [];
    for (const element of controls) {
      if (hidden(element)) continue;
      const tag = element.tagName.toLowerCase();
      if (tag === 'input' && element.type === 'hidden') continue;
      const explicit = element.getAttribute('aria-label') || labelledBy(element);
      const associated = labelFor(element) || text(element.closest('label'));
      const content = tag === 'button' || tag === 'a' || element.getAttribute('role') ? text(element) : '';
      const name = (explicit || associated || content || element.getAttribute('title') || '').trim();
      if (!name) issues.push(`${tag}${element.id ? `#${element.id}` : ''} has no accessible name`);
      if ((tag === 'input' || tag === 'textarea' || tag === 'select') && !explicit && !associated) {
        issues.push(`${tag}${element.id ? `#${element.id}` : ''} has no programmatic label`);
      }
    }
    const ids = [...document.querySelectorAll('[id]')].map((element) => element.id).filter(Boolean);
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    for (const id of [...new Set(duplicates)]) issues.push(`duplicate id #${id}`);
    return issues;
  })(),
  mainCount: document.querySelectorAll('main').length,
  headingCount: document.querySelectorAll('h1').length,
});

await useIsolatedPort();
await ensurePreview();

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
page.setDefaultTimeout(15000);
const failures = [];

for (const path of auditRoutes) {
  try {
    await page.goto(`${baseUrl}${path}`);
    await page.waitForLoadState('domcontentloaded');
    await page.locator('#root').waitFor({ state: 'visible' });
    await page.waitForTimeout(200);
    const result = await page.evaluate(auditDom);
    if (result.mainCount !== 1) failures.push(`${path}: expected one main landmark, got ${result.mainCount}`);
    if (result.headingCount !== 1) failures.push(`${path}: expected one h1, got ${result.headingCount}`);
    for (const issue of result.issues) failures.push(`${path}: ${issue}`);
  } catch (error) {
    failures.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

await browser.close();
cleanup();

if (failures.length) {
  console.error(JSON.stringify({ baseUrl, failures }, null, 2));
  process.exit(1);
}

console.log(`Accessibility DOM audit passed for ${auditRoutes.length} public/auth/error routes at ${baseUrl}.`);
