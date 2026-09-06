/* global document, window */
import assert from 'node:assert/strict';
import console from 'node:console';
import { setTimeout } from 'node:timers/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';
import { createQaServer, QA_EMAIL, QA_PASSWORD, QA_RESUME_ID } from '../fixtures/qa-server.mjs';
import { isAllowedQaRequest, localFixtureEnvironment } from './qa-safety.mjs';

// Runs a real application against disposable HTTP fixtures. The transport, React
// state and UI are real; auth/RLS, AI, email and billing are not verified here.
const artifactsDir = path.resolve('playwright-artifacts-fixtures');
const { server: fixtureServer, state } = createQaServer();
const report = { steps: [], failures: [], pageErrors: [], blockedRequests: [] };
let appProcess;
let browser;
let appLog = '';

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
}

async function availablePort() {
  const probe = http.createServer();
  const port = await listen(probe);
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

async function waitForServer(url) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (appProcess.exitCode !== null) throw new Error(`Fixture app exited: ${appLog}`);
    try { if ((await globalThis.fetch(url)).ok) return; } catch { /* starting */ }
    await setTimeout(200);
  }
  throw new Error(`Fixture app did not start: ${appLog}`);
}

try {
  await fs.mkdir(artifactsDir, { recursive: true });
  const fixtureUrl = `http://127.0.0.1:${await listen(fixtureServer)}`;
  const appPort = await availablePort();
  const appUrl = `http://127.0.0.1:${appPort}`;
  appProcess = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(appPort), '--strictPort'], {
    cwd: process.cwd(), env: localFixtureEnvironment(process.env, fixtureUrl),
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  appProcess.stdout.on('data', (chunk) => { appLog += chunk.toString(); });
  appProcess.stderr.on('data', (chunk) => { appLog += chunk.toString(); });
  await waitForServer(appUrl);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true, serviceWorkers: 'block' });
  await context.route('**/*', (route) => {
    if (isAllowedQaRequest(route.request().url(), [appUrl, fixtureUrl])) return route.continue();
    report.blockedRequests.push({ url: route.request().url(), method: route.request().method() });
    return route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => report.pageErrors.push(error.message));
  const visit = async (route) => {
    await page.goto(`${appUrl}${route}`);
    await page.locator('main').waitFor({ state: 'visible' });
  };
  const step = async (name, run) => {
    try {
      await run();
      report.steps.push({ name, status: 'passed' });
    } catch (error) {
      const screenshot = path.join(artifactsDir, `${name}.png`);
      await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {});
      report.steps.push({ name, status: 'failed' });
      report.failures.push({ name, error: error.message, screenshot });
    }
  };

  await step('protected-route-redirect', async () => {
    await visit('/dashboard');
    await page.waitForURL(/\/signin(?:[/?#]|$)/);
    await page.getByRole('button', { name: /^Sign in$/i }).waitFor({ state: 'visible' });
  });
  await step('sign-in', async () => {
    await visit('/signin');
    await page.getByRole('textbox', { name: 'Email', exact: true }).fill(QA_EMAIL);
    await page.getByLabel('Password', { exact: true }).fill(QA_PASSWORD);
    await page.getByRole('button', { name: /^Sign in$/i }).click();
    await page.waitForURL(/\/dashboard(?:[/?#]|$)/);
    await page.getByRole('button', { name: /Open my resume|Open Latest Resume/i }).waitFor({ state: 'visible' });
  });
  await step('profile-save-reload', async () => {
    await visit('/profile');
    await page.locator('#fullName').fill('Alex Morgan QA');
    await page.getByRole('button', { name: 'Save profile', exact: true }).click();
    await page.getByText('Career foundation saved', { exact: false }).waitFor({ state: 'visible' });
    await page.reload();
    await page.locator('#fullName').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#fullName').inputValue(), 'Alex Morgan QA');
    assert.equal(state.profile.personal.fullName, 'Alex Morgan QA');
  });
  await step('saved-resume-load-and-export', async () => {
    await visit(`/preview/${QA_RESUME_ID}`);
    const exportButton = page.getByRole('button', { name: /Export as DOCX|Download DOCX/i });
    await exportButton.waitFor({ state: 'visible' });
    const [download] = await Promise.all([page.waitForEvent('download'), exportButton.click()]);
    assert.match(download.suggestedFilename(), /\.docx$/i);
    const file = path.join(artifactsDir, download.suggestedFilename());
    await download.saveAs(file);
    const contents = await fs.readFile(file);
    assert.equal(contents.subarray(0, 2).toString(), 'PK', 'DOCX must be an OOXML ZIP, not an HTML error response');
    assert.ok(contents.length > 1000, 'DOCX should contain actual resume content');
  });
  await step('application-create-and-persist', async () => {
    await visit('/applications');
    await page.getByRole('button', { name: /Add Application|Add Your First Application/i }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ state: 'visible' });
    await page.locator('#app-company').fill('Fixture QA Company');
    await page.locator('#app-position').fill('Product Designer');
    await page.locator('#app-notes').fill('Synthetic QA data only');
    await dialog.getByRole('button', { name: /^Add Application$/ }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.ok(state.job_applications.some((app) => app.company === 'Fixture QA Company'));
    await page.reload();
    await page.getByText('Fixture QA Company', { exact: true }).first().waitFor({ state: 'visible' });
  });
  await step('application-modal-keyboard', async () => {
    await visit('/applications');
    await page.getByRole('button', { name: /^Add Application$/ }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
  });
  for (const [route, heading] of [['/analytics', 'Analytics'], ['/new', 'How do you want to start?'], ['/pricing', 'Find your perfect resume-building plan.']]) {
    await step(`authenticated-${route.slice(1)}`, async () => {
      await visit(route);
      await page.getByRole('heading', { level: 1, name: heading, exact: true }).waitFor({ state: 'visible' });
    });
  }
  await step('mobile-workspace-overflow', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await visit('/dashboard');
    await page.getByRole('heading', { level: 1 }).waitFor({ state: 'visible' });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    assert.equal(overflow, false, 'Mobile dashboard must not overflow horizontally');
    await page.screenshot({ path: path.join(artifactsDir, 'mobile-dashboard.png'), fullPage: true });
  });
  report.fixtureRequests = state.requestLog;
  // Blocking optional third-party assets is expected. Any attempted write to an
  // external host is a failure even though it was stopped before transmission.
  const externalWrites = report.blockedRequests.filter((request) => !['GET', 'HEAD', 'OPTIONS'].includes(request.method));
  assert.equal(externalWrites.length, 0, `Unexpected external writes: ${JSON.stringify(externalWrites)}`);
} catch (error) {
  report.failures.push({ name: 'suite', error: error.message });
} finally {
  await browser?.close();
  appProcess?.kill();
  await new Promise((resolve) => { fixtureServer.close(resolve); fixtureServer.closeAllConnections(); });
  await fs.mkdir(artifactsDir, { recursive: true });
  await fs.writeFile(path.join(artifactsDir, 'report.json'), JSON.stringify(report, null, 2));
}

console.log(JSON.stringify(report, null, 2));
if (report.failures.length || report.pageErrors.length) process.exitCode = 1;
