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
import { createQaServer, QA_EMAIL, QA_PASSWORD, QA_RESUME_ID, QA_USER_ID } from '../fixtures/qa-server.mjs';
import { isAllowedQaRequest, localFixtureEnvironment } from './qa-safety.mjs';

// Runs a real application against disposable HTTP fixtures. The transport, React
// state and UI are real; auth/RLS, AI, email and billing are not verified here.
const artifactsDir = path.resolve('playwright-artifacts-fixtures');
const { server: fixtureServer, state } = createQaServer();
const report = { steps: [], failures: [], pageErrors: [], consoleMessages: [], blockedRequests: [] };
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
  page.on('console', message => {
    if (['warning', 'error'].includes(message.type())) report.consoleMessages.push({ type: message.type(), text: message.text(), url: page.url() });
  });
  const visit = async (route) => {
    await page.goto(`${appUrl}${route}`);
    await page.locator('main').waitFor({ state: 'visible' });
  };
  const step = async (name, run) => {
    if (process.argv.includes('--campaign-only') && !['protected-route-redirect', 'sign-in', 'profile-save-reload', 'reusable-answers-save-reload', 'campaign-controls-and-consent'].includes(name)) return;
    try {
      await run();
      console.log(`PASS ${name}`);
      report.steps.push({ name, status: 'passed' });
    } catch (error) {
      console.error(`FAIL ${name}: ${error.message}`);
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
    await page.locator('input[type="password"]').fill(QA_PASSWORD);
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
  await step('reusable-answers-save-reload', async () => {
    await visit('/profile');
    await page.getByRole('button', { name: 'Autofill Answers', exact: true }).click();
    await page.getByRole('button', { name: 'Add reusable answer', exact: true }).click();
    await page.getByLabel('Exact application question', { exact: true }).fill('When can you start?');
    await page.getByLabel('Your answer', { exact: true }).fill('Two weeks');
    await page.getByLabel('Employer hostname (optional)', { exact: true }).fill('jobs.example');
    await page.getByRole('button', { name: 'Save profile', exact: true }).click();
    await page.getByText('Career foundation saved', { exact: false }).waitFor();
    await page.reload();
    await page.getByRole('button', { name: 'Autofill Answers', exact: true }).click();
    assert.equal(await page.getByLabel('Your answer', { exact: true }).inputValue(), 'Two weeks');
    assert.equal(state.profile.personal.applicationProfile.reusableAnswers[0].hostname, 'jobs.example');
  });
  await step('campaign-controls-and-consent', async () => {
    state.job_preferences.push({ id: 'campaign-prefs', user_id: QA_USER_ID, is_active: true, default_resume_id: QA_RESUME_ID, job_titles: ['Designer'], locations: ['Remote'], daily_limit: 10, skills: [], excluded_companies: [] });
    state.auto_apply_jobs.push({ id: 'campaign-job', user_id: QA_USER_ID, title: 'Product Designer', company: 'QA Employer', status: 'discovered', job_url: 'https://jobs.example/design', created_at: new Date().toISOString() });
    // The UI bridge is synthetic here; campaign-qa.mjs tests the packaged runtime.
    await page.addInitScript(() => {
      const state = { installed: true, campaignSupported: true, isRunning: false, queue: [{ id: 'qa-answer', url: 'https://jobs.example/answer', title: 'Application with a new question', status: 'needs_review', reviewFields: [{ label: 'Preferred interview time?', reason: 'Required answer' }] }], version: '0.3.0' };
      window.addEventListener('message', event => {
        const message = event.data;
        if (event.source !== window || message.source !== 'resumeats-web' || !['PING', 'GET_STATE', 'SYNC_PROFILE', 'QUEUE_JOBS', 'START_CAMPAIGN', 'RETRY_CAMPAIGN_JOB'].includes(message.type)) return;
        if (message.type === 'START_CAMPAIGN') { window.__qaCampaign = message.payload; state.isRunning = true; state.campaign = { id: 'qa-campaign' }; }
        if (message.type === 'RETRY_CAMPAIGN_JOB') state.queue = state.queue.map(job => job.id === message.payload.jobId ? { ...job, status: 'queued' } : job);
        window.postMessage({ source: 'resumeats-browser-agent', target: 'resumeats-web', type: `${message.type}:response`, requestId: message.requestId, success: true, payload: state }, window.origin);
      });
    });
    await visit('/auto-apply');
    const start = page.getByRole('button', { name: 'Start campaign', exact: true });
    await start.waitFor();
    assert.equal(await start.isDisabled(), true);
    await page.getByLabel('Application mode', { exact: true }).selectOption('submit');
    await page.getByLabel('Maximum applications per day', { exact: true }).fill('5');
    await page.getByRole('checkbox', { name: /Use my saved profile/ }).check();
    await start.click();
    await page.getByRole('button', { name: 'Pause campaign', exact: true }).waitFor();
    const campaign = await page.evaluate(() => window.__qaCampaign);
    assert.equal(campaign.confirmed, true);
    assert.equal(campaign.mode, 'submit');
    assert.equal(campaign.limit, 5);
    assert.equal(campaign.resumeId, QA_RESUME_ID);
    assert.ok(campaign.expectedRevision > 0);
    await setTimeout(1200);
    await page.screenshot({ path: path.join(artifactsDir, 'campaign-controls.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);
    await page.screenshot({ path: path.join(artifactsDir, 'campaign-controls-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByPlaceholder('Save an answer for this employer').fill('Weekday afternoons');
    await page.getByRole('button', { name: 'Save answers and retry', exact: true }).click();
    await page.getByText('Answers saved for this employer.', { exact: false }).waitFor();
    const saved = state.profile.personal.applicationProfile.reusableAnswers.find(entry => entry.question === 'Preferred interview time?');
    assert.equal(saved.answer, 'Weekday afternoons');
    assert.equal(saved.hostname, 'jobs.example');
  });
  await step('interrupted-search-history', async () => {
    state.auto_apply_runs.push({ id: 'stale-run', user_id: QA_USER_ID, status: 'running', started_at: new Date(Date.now() - 20 * 60000).toISOString(), jobs_discovered: 0, jobs_applied: 0 });
    await visit('/auto-apply');
    await page.getByRole('button', { name: 'Run History', exact: true }).click();
    await page.getByText('interrupted', { exact: true }).waitFor();
    await page.getByText('No completion was recorded. Check your job list before starting another search.', { exact: true }).waitFor();
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
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, 'Entrance animations must not overflow horizontally');
    await page.waitForTimeout(1200);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    assert.equal(overflow, false, 'Mobile dashboard must not overflow horizontally');
    await page.screenshot({ path: path.join(artifactsDir, 'mobile-dashboard.png'), fullPage: true });
  });
  report.fixtureRequests = state.requestLog;
  // Blocking optional third-party assets is expected. Any attempted write to an
  // external host is a failure even though it was stopped before transmission.
  const externalWrites = report.blockedRequests.filter((request) => !['GET', 'HEAD', 'OPTIONS'].includes(request.method));
  assert.equal(externalWrites.length, 0, `Unexpected external writes: ${JSON.stringify(externalWrites)}`);
  assert.deepEqual(report.consoleMessages, [], 'Browser console must have no warnings or errors');
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
