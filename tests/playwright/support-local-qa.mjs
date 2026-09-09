import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const cwd = process.cwd();
const statusOutput = execFileSync('npx.cmd', ['--no-install', 'supabase', 'status', '-o', 'json'], {
  cwd,
  encoding: 'utf8',
  // Windows exposes npx through a .cmd shim; no user input is interpolated.
  shell: process.platform === 'win32',
});
const status = JSON.parse(statusOutput.slice(statusOutput.indexOf('{')));
const serviceHeaders = {
  apikey: status.SERVICE_ROLE_KEY,
  Authorization: `Bearer ${status.SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
};
const supportQaPort = process.env.SUPPORT_QA_PORT || '5176';
const baseUrl = `http://127.0.0.1:${supportQaPort}`;
const ownerEmail = `codex-support-owner-${Date.now()}@example.test`;
const ownerPassword = `LocalQA-${Date.now()}-Safe!`;
const subject = `Synthetic support QA ${Date.now()}`;
const guestMessage = 'Synthetic guest message for local support QA.';
const guestFollowUp = 'Synthetic guest follow-up after handoff.';
const agentReply = 'Synthetic agent reply for local support QA.';
const internalNote = 'Synthetic internal note must remain operator-only.';

let ownerId = '';
let conversationId = '';
let viteProcess;
let ownsViteProcess = false;
let browser;

const api = async (path, options = {}) => {
  const response = await fetch(`${status.API_URL}${path}`, {
    ...options,
    headers: { ...serviceHeaders, ...(options.headers || {}) },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path} ${response.status}: ${body.slice(0, 400)}`);
  return body ? JSON.parse(body) : null;
};

const waitForServer = async (url, processHandle, output) => {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (processHandle.exitCode !== null) {
      throw new Error(`Vite exited before the isolated support QA server became ready.\n${output.join('')}`);
    }
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error('Vite did not become ready');
};

const assertLocalViteServer = async () => {
  const sourceResponse = await fetch(`${baseUrl}/src/services/supabase.js`);
  const servedSource = await sourceResponse.text();
  assert.equal(sourceResponse.ok, true, 'Vite server must expose the Supabase source');
  assert.match(servedSource, new RegExp(status.API_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'Vite server must use the local Supabase API');
};

const localEnv = {
  ...process.env,
  VITE_SUPABASE_URL: status.API_URL,
  VITE_SUPABASE_URL_DEV: status.API_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
  VITE_SUPABASE_PUBLISHABLE_KEY_DEV: status.PUBLISHABLE_KEY,
  VITE_SUPABASE_ANON_KEY: status.ANON_KEY,
  VITE_SUPABASE_ANON_KEY_DEV: status.ANON_KEY,
};

try {
  const owner = await api('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email: ownerEmail, password: ownerPassword, email_confirm: true }),
  });
  ownerId = owner.id;
  await api('/rest/v1/admin_members', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ email: ownerEmail, user_id: ownerId, role: 'owner', is_active: true }),
  });

  const existingResponse = await fetch(`${baseUrl}/contact`).catch(() => null);
  if (existingResponse && existingResponse.status < 500) {
    await assertLocalViteServer();
  } else {
    viteProcess = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', supportQaPort, '--strictPort'], {
      cwd,
      env: localEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    ownsViteProcess = true;
    const viteOutput = [];
    viteProcess.stdout?.on('data', (chunk) => viteOutput.push(chunk.toString()));
    viteProcess.stderr?.on('data', (chunk) => viteOutput.push(chunk.toString()));
    await waitForServer(`${baseUrl}/contact`, viteProcess, viteOutput);
    await assertLocalViteServer();
  }

  browser = await chromium.launch({ headless: true });
  const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const otherGuestContext = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  const guestPage = await guestContext.newPage();
  const otherGuestPage = await otherGuestContext.newPage();
  const adminPage = await adminContext.newPage();
  const pages = [guestPage, otherGuestPage, adminPage];
  const consoleErrors = [];
  const pageErrors = [];
  const httpErrors = [];
  const supportStatuses = [];

  for (const page of pages) {
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(`${page.url()}: ${message.text()}`);
    });
    page.on('pageerror', (error) => pageErrors.push(`${page.url()}: ${error.message}`));
    page.on('response', (response) => {
      if (response.status() >= 400) httpErrors.push(`${page.url()}: ${response.status()} ${response.url()}`);
    });
    page.on('response', async (response) => {
      if (response.url().includes('/functions/v1/support-api')) {
        let action = 'unknown';
        let requestBody = {};
        try { requestBody = response.request().postDataJSON() || {}; action = requestBody.action || action; } catch { /* Request body may be unavailable after navigation. */ }
        supportStatuses.push({ action, status: response.status(), pageUrl: page.url() });
      }
    });
  }

  await guestPage.goto(`${baseUrl}/contact`, { waitUntil: 'networkidle' });
  try {
    await guestPage.getByRole('button', { name: 'Open support dialog', exact: true }).click();
  } catch (error) {
    console.error(JSON.stringify({ url: guestPage.url(), title: await guestPage.title(), body: (await guestPage.locator('body').innerText()).slice(0, 3000), consoleErrors, pageErrors }));
    throw error;
  }
  let guestDialog = guestPage.getByRole('dialog', { name: 'ResumeATS support' });
  await guestDialog.waitFor({ state: 'visible' });
  await guestDialog.getByLabel('What do you need help with?', { exact: true }).fill(subject);
  await guestDialog.getByLabel('Message', { exact: true }).fill(guestMessage);
  await guestDialog.getByRole('button', { name: 'Start support conversation', exact: true }).click();
  try {
    await guestDialog.getByText('Open', { exact: true }).waitFor({ timeout: 15_000 });
  } catch (error) {
    console.error(JSON.stringify({ supportStatuses, dialogText: await guestDialog.innerText().catch(() => '') }));
    throw error;
  }
  const guestSession = await guestPage.evaluate(() => JSON.parse(sessionStorage.getItem('resumeats.support.session') || '{}'));
  assert.ok(guestSession.guestToken, 'guest token must be persisted in session storage');
  assert.ok(guestSession.conversationId, 'conversation ID must be persisted in session storage');
  conversationId = guestSession.conversationId;

  await guestDialog.getByRole('button', { name: 'Request a human', exact: true }).click();
  await guestDialog.getByText('Open', { exact: true }).waitFor();
  await guestDialog.getByLabel('Reply to support', { exact: true }).fill(guestFollowUp);
  await guestDialog.getByRole('button', { name: 'Send reply', exact: true }).click();
  await guestDialog.getByText(guestFollowUp, { exact: true }).waitFor({ timeout: 15_000 });

  await guestPage.reload({ waitUntil: 'networkidle' });
  await guestPage.getByRole('button', { name: 'Open support dialog', exact: true }).click();
  guestDialog = guestPage.getByRole('dialog', { name: 'ResumeATS support' });
  await guestDialog.waitFor({ state: 'visible' });
  await guestDialog.getByText(guestMessage, { exact: true }).waitFor({ timeout: 15_000 });

  await otherGuestPage.goto(`${baseUrl}/contact`, { waitUntil: 'networkidle' });
  await otherGuestPage.getByRole('button', { name: 'Open support dialog', exact: true }).click();
  const otherDialog = otherGuestPage.getByRole('dialog', { name: 'ResumeATS support' });
  await otherDialog.waitFor({ state: 'visible' });
  await otherDialog.getByLabel('What do you need help with?', { exact: true }).waitFor({ state: 'visible' });
  assert.equal(await otherGuestPage.getByText(guestMessage, { exact: true }).count(), 0, 'guest sessions must not share transcripts');

  await adminPage.goto(`${baseUrl}/signin`, { waitUntil: 'networkidle' });
  await adminPage.locator('#email-desktop').fill(ownerEmail);
  await adminPage.locator('#password-desktop').fill(ownerPassword);
  await adminPage.getByRole('button', { name: 'Sign In', exact: true }).click();
  await adminPage.waitForURL('**/dashboard', { timeout: 15_000 });
  await adminPage.goto(`${baseUrl}/admin/users`, { waitUntil: 'networkidle' });
  await adminPage.getByRole('heading', { name: 'Users', exact: true }).waitFor({ state: 'visible' });
  await adminPage.goto(`${baseUrl}/admin/users/${ownerId}`, { waitUntil: 'networkidle' });
  const customerDetail = adminPage.locator('[role="dialog"][aria-labelledby="admin-customer-detail-title"]');
  await customerDetail.waitFor({ state: 'visible' });
  await adminPage.getByRole('button', { name: 'Close details', exact: true }).waitFor({ state: 'visible' });
  assert.equal(await customerDetail.evaluate((element) => getComputedStyle(element).position), 'fixed', 'desktop customer detail must be a fixed drawer');
  assert.equal(await adminPage.locator('.admin-customer-detail-backdrop').evaluate((element) => getComputedStyle(element).display), 'block', 'desktop customer detail must expose a backdrop');
  assert.equal(await adminPage.locator('body').evaluate((element) => element.style.overflow), 'hidden', 'customer detail must lock background scroll');
  await adminPage.keyboard.press('Escape');
  await adminPage.waitForURL('**/admin/users');
  assert.equal(await customerDetail.count(), 0, 'Escape must close customer details');

  await adminPage.setViewportSize({ width: 390, height: 844 });
  await adminPage.goto(`${baseUrl}/admin/users/${ownerId}`, { waitUntil: 'networkidle' });
  await customerDetail.waitFor({ state: 'visible' });
  const mobileDetailBox = await customerDetail.boundingBox();
  assert.ok(mobileDetailBox && mobileDetailBox.width >= 389 && mobileDetailBox.height >= 843, 'mobile customer detail must use the full page surface');
  assert.equal(await adminPage.locator('.admin-customer-detail-backdrop').evaluate((element) => getComputedStyle(element).display), 'none', 'mobile customer detail must not depend on a backdrop');
  await adminPage.keyboard.press('Escape');
  await adminPage.waitForURL('**/admin/users');
  await adminPage.setViewportSize({ width: 1440, height: 1000 });
  await adminPage.goto(`${baseUrl}/admin/analytics`, { waitUntil: 'networkidle' });
  await adminPage.getByRole('heading', { name: 'First-party product analytics', exact: true }).waitFor({ state: 'visible' });
  await adminPage.goto(`${baseUrl}/admin/support`, { waitUntil: 'networkidle' });
  await adminPage.getByRole('button', { name: 'Support', exact: true }).click();
  await adminPage.getByRole('heading', { name: 'Support inbox', exact: true }).waitFor({ state: 'visible' });
  await adminPage.getByText(subject, { exact: true }).waitFor({ state: 'visible', timeout: 15_000 });
  await adminPage.getByText(subject, { exact: true }).click();
  await adminPage.getByRole('button', { name: 'Take conversation', exact: true }).click();
  await adminPage.getByRole('button', { name: 'Resolve', exact: true }).waitFor({ state: 'visible' });
  await adminPage.getByLabel('Internal note', { exact: true }).fill(internalNote);
  await adminPage.getByRole('button', { name: 'Add internal note', exact: true }).click();
  await adminPage.getByText(internalNote, { exact: true }).waitFor({ state: 'visible' });
  await adminPage.getByLabel('Customer-facing reply', { exact: true }).fill(agentReply);
  await adminPage.getByRole('button', { name: 'Send reply', exact: true }).click();
  await adminPage.getByText(agentReply, { exact: true }).waitFor({ state: 'visible' });
  await adminPage.getByRole('button', { name: 'Resolve', exact: true }).click();
  try {
    await adminPage.getByRole('button', { name: 'Reopen', exact: true }).waitFor({ state: 'visible' });
  } catch (error) {
    console.error(JSON.stringify({ supportStatuses: supportStatuses.map(({ action, status }) => ({ action, status })), adminText: (await adminPage.locator('body').innerText()).slice(-2500) }));
    throw error;
  }

  await guestPage.reload({ waitUntil: 'networkidle' });
  await guestPage.getByRole('button', { name: 'Open support dialog', exact: true }).click();
  guestDialog = guestPage.getByRole('dialog', { name: 'ResumeATS support' });
  await guestDialog.getByText(agentReply, { exact: true }).waitFor({ timeout: 15_000 });
  assert.equal(await guestDialog.getByText(internalNote, { exact: true }).count(), 0, 'internal notes must not reach customers');
  await guestDialog.getByRole('heading', { name: 'How did we do?', exact: true }).waitFor({ state: 'visible' });
  await guestDialog.getByRole('radio', { name: '5 out of 5', exact: true }).click();
  await guestDialog.getByLabel('Optional feedback', { exact: true }).fill('Synthetic CSAT feedback for local QA.');
  await guestDialog.getByRole('button', { name: 'Submit feedback', exact: true }).click();
  await guestDialog.getByText('Thanks — your feedback was saved with this conversation.', { exact: true }).waitFor({ state: 'visible' });

  await adminPage.getByRole('button', { name: 'AI & Jobs', exact: true }).click();
  await adminPage.getByRole('heading', { name: 'AI and job operations', exact: true }).waitFor({ state: 'visible' });
  await adminPage.getByText('Auto-apply job states', { exact: true }).waitFor({ state: 'visible' });
  await adminPage.getByText('Auto-apply run states', { exact: true }).waitFor({ state: 'visible' });

  for (const page of pages) {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, `No overflow at ${page.url()}`);
  }
  assert.deepEqual(consoleErrors, [], `Browser console must have no errors: ${JSON.stringify({ httpErrors, supportStatuses })}`);
  assert.deepEqual(pageErrors, [], 'Browser pages must have no errors');
  assert.ok(supportStatuses.length > 0, 'Support API must be exercised');
  assert.deepEqual([...new Set(supportStatuses.map(({ status }) => status))], [200], 'Support API requests must succeed');
  await fs.mkdir('docs/admin-dashboard-plan/evidence', { recursive: true });
  await guestPage.screenshot({ path: 'docs/admin-dashboard-plan/evidence/20260909-support-guest-resolved-local.png', fullPage: true });
  await adminPage.screenshot({ path: 'docs/admin-dashboard-plan/evidence/20260909-support-inbox-local.png', fullPage: true });
  console.log('PASS support-end-to-end-browser guest-recovery=true isolation=true handoff=true note-isolated=true resolution=true csat=true overflow=false consoleErrors=0 pageErrors=0');
} finally {
  await browser?.close().catch(() => {});
  if (ownsViteProcess && viteProcess && !viteProcess.killed) viteProcess.kill();
  if (conversationId) {
    await fetch(`${status.API_URL}/rest/v1/support_conversations?id=eq.${encodeURIComponent(conversationId)}`, {
      method: 'DELETE',
      headers: { ...serviceHeaders, Prefer: 'return=minimal' },
    }).catch(() => {});
  }
  if (ownerId) {
    await fetch(`${status.API_URL}/rest/v1/admin_members?user_id=eq.${encodeURIComponent(ownerId)}`, {
      method: 'DELETE',
      headers: { ...serviceHeaders, Prefer: 'return=minimal' },
    }).catch(() => {});
    await fetch(`${status.API_URL}/auth/v1/admin/users/${encodeURIComponent(ownerId)}`, {
      method: 'DELETE',
      headers: serviceHeaders,
    }).catch(() => {});
  }
}
