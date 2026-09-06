/* global window, URL, setTimeout, clearTimeout, console, chrome, crypto, fetch */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import http from 'node:http';
import { chromium } from 'playwright';
import { jsPDF } from 'jspdf';
import { spawn } from 'node:child_process';
import { createQaServer, QA_EMAIL, QA_PASSWORD, QA_USER_ID, QA_RESUME_ID } from '../fixtures/qa-server.mjs';
import { localFixtureEnvironment } from './qa-safety.mjs';

const realApp = process.argv.includes('--real-app');
const output = path.resolve(realApp ? 'output/playwright/campaign-integrated' : 'output/playwright/campaign');
await fs.mkdir(output, { recursive: true });
const pdf = new jsPDF();
pdf.text('Alex Morgan - Synthetic QA Resume', 20, 20);
const bytes = Buffer.from(pdf.output('arraybuffer'));
const sha256 = createHash('sha256').update(bytes).digest('hex');
const artifact = { mimeType: 'application/pdf', filename: 'Alex_Morgan.pdf', rendererVersion: 'qa', byteLength: bytes.length, sha256, artifactId: `sha256:${sha256}`, base64: bytes.toString('base64') };
const profile = { version: '2026-09-04', candidate: { userId: 'qa-user', fullName: 'Alex Morgan', firstName: 'Alex', lastName: 'Morgan', email: 'alex@example.com', phone: '+15550123456', location: 'London', currentTitle: 'Software Engineer' },
  answers: {}, skills: ['JavaScript'], experience: [], education: [], documents: {}, reusableAnswers: [{ question: 'When can you start?', answer: 'Two weeks' }], integration: { appUrl: 'https://resumeats.cv' } };
const resume = { id: 'qa-resume', revision: 1, title: 'Approved QA resume' };
const appHtml = `<!doctype html><html><body><h1>ResumeATS campaign QA</h1><script>
const profile = ${JSON.stringify(profile)}, resume = ${JSON.stringify(resume)}, artifact = ${JSON.stringify(artifact)};
window.preparations = 0;
window.addEventListener('message', event => {
  const message = event.data;
  if (event.source !== window || message.source !== 'resumeats-browser-agent' || !message.type?.startsWith('APP_')) return;
  let payload = {};
  if (message.type === 'APP_AUTH_STATE_REQUEST') payload = { userId: profile.candidate.userId };
  if (message.type === 'APP_SYNC_PROFILE_REQUEST') payload = { profile, resume };
  if (message.type === 'APP_VALIDATE_SAVED_RESUME_REQUEST') payload = { ownerId: profile.candidate.userId, resumeId: resume.id, revision: resume.revision };
  if (message.type === 'APP_PREPARE_SAVED_RESUME_REQUEST') { window.preparations++; payload = { status: 'ready', ownerId: profile.candidate.userId, handoffId: message.payload.handoffId, jobKey: message.payload.jobKey, resume, document: artifact }; }
  if (message.type === 'APP_AUTOFILL_AI_REQUEST') payload = { answers: [] };
  window.postMessage({ source: 'resumeats-web', target: 'resumeats-browser-agent', type: message.type + ':response', requestId: message.requestId, bridgeToken: message.bridgeToken, success: true, payload }, location.origin);
});
window.agent = (type, payload) => new Promise((resolve, reject) => {
  const requestId = crypto.randomUUID();
  const timer = setTimeout(() => reject(new Error(type + ' timed out')), 90000);
  const receive = event => { if (event.data?.requestId !== requestId || event.data?.type !== type + ':response') return;
    window.removeEventListener('message', receive); clearTimeout(timer);
    if (event.data.success === false || event.data.payload?.ok === false) reject(new Error(event.data.error || event.data.payload.error)); else resolve(event.data.payload);
  };
  window.addEventListener('message', receive);
  window.postMessage({ source: 'resumeats-web', target: 'resumeats-browser-agent', requestId, type, payload }, location.origin);
});
</script></body></html>`;

const jobHtml = blocked => `<!doctype html><html><head><style>body{font:16px Arial;margin:40px;max-width:720px}label{display:block;margin:18px 0}input,select{display:block;padding:10px;min-width:260px}button{padding:14px}</style></head><body>
<h1>Software Engineer</h1><p>Acme QA careers. Full-time remote engineering role.</p>
<form id="application"><div id="step-one"><h2>Application</h2>
<label>Full name<input name="full_name" required></label><label>Email address<input name="email" type="email" required></label>
<label>Phone number<input name="phone" type="tel" required></label><label>Resume<input name="resume" type="file" accept=".pdf" required></label>
${blocked ? '<label>What is your favourite project nickname?<input name="unusual_answer" required></label><button type="submit">Submit application</button>' : '<button id="next" type="button">Continue</button>'}
</div></form><script>
window.submits = 0; window.uploaded = '';
document.querySelector('input[type=file]').addEventListener('change', async event => {
  const file = event.target.files[0]; window.uploaded = await file.text();
  await fetch('/upload', { method: 'POST', body: file });
});
document.querySelector('#next')?.addEventListener('click', () => {
  if (!document.querySelector('form').reportValidity()) return;
  document.querySelector('#step-one').hidden = true;
  const second = document.createElement('div'); second.innerHTML = '<h2>Availability</h2><label>When can you start?<select name="start"><option value="">Choose an option</option><option>Immediately</option><option>Two weeks</option></select></label><button type="submit">Submit application</button>';
  second.querySelector('select').required = true; document.querySelector('form').append(second);
});
document.querySelector('form').addEventListener('submit', async event => {
  event.preventDefault(); window.submits++; await fetch('/receipt', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.target))) });
  document.body.innerHTML = '<h1>Thank you for applying</h1><p>Your application has been submitted successfully.</p>';
});
</script></body></html>`;

const report = { errors: [], consoleMessages: [], submissions: [], uploads: [], checks: [] };
const server = http.createServer(async (request, response) => {
  if (request.method === 'POST') {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    if (request.url === '/upload') report.uploads.push(body.length);
    if (request.url === '/receipt') report.submissions.push(JSON.parse(body.toString()));
    response.writeHead(200, { 'Content-Type': 'application/json' }); response.end('{"accepted":true}');
    return;
  }
  response.writeHead(200, { 'Content-Type': 'text/html' }); response.end(jobHtml(request.url === '/blocked'));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const jobOrigin = `http://jobs.example:${server.address().port}`;
let context;
let appProcess, fixtureServer, appOrigin, fixtureOrigin, fixtureState;
try {
  if (realApp) {
    const fixture = createQaServer();
    fixtureServer = fixture.server; fixtureState = fixture.state;
    await new Promise(resolve => fixtureServer.listen(0, '127.0.0.1', resolve));
    fixtureOrigin = `http://127.0.0.1:${fixtureServer.address().port}`;
    const probe = http.createServer();
    await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
    const port = probe.address().port;
    await new Promise(resolve => probe.close(resolve));
    appOrigin = `http://127.0.0.1:${port}`;
    fixtureState.profile.personal.applicationProfile = { reusableAnswers: [{ question: 'When can you start?', answer: 'Two weeks' }] };
    fixtureState.job_preferences.push({ id: 'qa-preferences', user_id: QA_USER_ID, is_active: true, default_resume_id: QA_RESUME_ID, job_titles: ['Designer'], locations: ['Remote'], daily_limit: 10, skills: [], excluded_companies: [] });
    fixtureState.auto_apply_jobs.push(...['blocked', 'ready'].map(id => ({ id, user_id: QA_USER_ID, title: `QA ${id}`, company: 'Local employer fixture', status: 'discovered', job_url: `${jobOrigin}/${id}`, created_at: new Date().toISOString() })));
    const buildDir = path.join(output, 'website');
    const fixtureEnv = { ...localFixtureEnvironment(process.env, fixtureOrigin), NODE_ENV: 'production' };
    const build = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', buildDir], { env: fixtureEnv, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let buildLog = '';
    build.stdout.on('data', chunk => { buildLog += chunk; }); build.stderr.on('data', chunk => { buildLog += chunk; });
    build.once('exit', () => fs.writeFile(path.join(output, 'build.log'), buildLog));
    assert.equal(await new Promise(resolve => build.once('exit', resolve)), 0, 'The production website must build with isolated backend fixtures');
    appProcess = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort', '--outDir', buildDir], { env: fixtureEnv, stdio: 'ignore', windowsHide: true });
    let reachable = false;
    for (let i = 0; i < 100; i++) {
      try { reachable = (await fetch(appOrigin)).ok; } catch { /* starting */ }
      if (reachable) break;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    assert.ok(reachable, 'The real website must start');
  }
  const extension = path.resolve('dist-extension');
  context = await chromium.launchPersistentContext(path.join(output, `profile-${Date.now()}`), {
    channel: 'chromium', headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--host-resolver-rules=MAP jobs.example 127.0.0.1', '--no-proxy-server', `--unsafely-treat-insecure-origin-as-secure=${jobOrigin}`],
  });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'resumeats.cv') {
      if (!realApp) return route.fulfill({ contentType: 'text/html', body: appHtml });
      const response = await route.fetch({ url: `${appOrigin}${url.pathname}${url.search}` });
      return route.fulfill({ response });
    }
    if (realApp && url.origin === fixtureOrigin) {
      if (/\/functions\/v1\/(openrouter|groq)-proxy$/.test(url.pathname)) return route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': 'https://resumeats.cv' }, body: JSON.stringify({ choices: [{ message: { content: '{"answers":[]}' } }] }) });
      const response = await route.fetch({ headers: { ...route.request().headers(), origin: appOrigin } });
      return route.fulfill({ response, headers: { ...response.headers(), 'access-control-allow-origin': 'https://resumeats.cv' } });
    }
    if (url.hostname === 'jobs.example') {
      return route.continue();
    }
    return route.abort();
  });
  context.on('page', page => {
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('console', message => { if (['warning', 'error'].includes(message.type())) report.consoleMessages.push({ type: message.type(), text: message.text(), url: page.url() }); });
  });
  const app = await context.newPage();
  app.setDefaultTimeout(20000);
  app.setDefaultNavigationTimeout(20000);
  console.log('QA: browser ready');
  await app.goto(realApp ? 'https://resumeats.cv/signin' : 'https://resumeats.cv');
  console.log('QA: app loaded');
  const call = (type, payload) => app.evaluate(({ type, payload }) => new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const timer = setTimeout(() => reject(new Error(`Bridge timeout: ${type}`)), 15000);
    const listener = event => {
      if (event.source !== window || event.data.source !== 'resumeats-browser-agent' || event.data.requestId !== requestId) return;
      clearTimeout(timer); window.removeEventListener('message', listener);
      if (event.data.success === false) reject(new Error(event.data.error)); else resolve(event.data.payload);
    };
    window.addEventListener('message', listener);
    window.postMessage({ source: 'resumeats-web', target: 'resumeats-browser-agent', type, requestId, payload }, window.origin);
  }), { type, payload });
  if (realApp) {
    await app.getByRole('textbox', { name: 'Email', exact: true }).fill(QA_EMAIL);
    await app.locator('input[type=password]').fill(QA_PASSWORD);
    await app.getByRole('button', { name: /^Sign in$/i }).click();
    await app.waitForURL(/\/dashboard/);
    await app.goto('https://resumeats.cv/auto-apply');
    await app.evaluate(() => {
      window.__qaBridgeErrors = [];
      window.addEventListener('message', event => {
        const message = event.data;
        if (event.source === window && message.source === 'resumeats-browser-agent' && (message.success === false || message.payload?.error)) window.__qaBridgeErrors.push({ type: message.type, error: message.error || message.payload.error });
      });
    });
    await app.getByText('Agent Connected', { exact: true }).waitFor();
    await app.getByLabel('Application mode', { exact: true }).selectOption('submit');
    await app.getByRole('checkbox', { name: /Use my saved profile/ }).check();
    await app.getByRole('button', { name: 'Start campaign', exact: true }).click();
    await app.getByRole('button', { name: 'Pause campaign', exact: true }).waitFor({ timeout: 60000 });
  } else {
  await call('SYNC_PROFILE', profile);
  console.log('QA: profile synced');
  await call('QUEUE_JOBS', { jobs: [
    { id: 'blocked', url: `${jobOrigin}/blocked`, title: 'Job needing an answer' },
    { id: 'ready', url: `${jobOrigin}/ready`, title: 'Multi-step application' },
  ] });
  await call('START_CAMPAIGN', { resumeId: resume.id, expectedRevision: 1, mode: 'submit', limit: 10, confirmed: true });
  }
  console.log('QA: campaign started');
  let state;
  const deadline = Date.now() + 120000;
  do {
    await new Promise(resolve => setTimeout(resolve, 1000));
    state = await call('GET_STATE');
  } while (state.isRunning && Date.now() < deadline);
  report.state = state;
  report.pages = context.pages().map(page => page.url());
  report.tabs = await context.serviceWorkers()[0].evaluate(() => chrome.tabs.query({}));
  for (const page of context.pages().filter(page => page.url().includes('jobs.example'))) {
    await page.screenshot({ path: path.join(output, `${new URL(page.url()).pathname.slice(1)}.png`), fullPage: true });
  }
  assert.equal(state.queue.find(job => job.id === 'blocked').status, 'needs_review');
  assert.equal(state.queue.find(job => job.id === 'ready').status, 'completed');
  if (!realApp) assert.equal(await app.evaluate(() => window.preparations), 1);
  assert.equal(report.submissions.length, 1);
  assert.equal(report.submissions[0].start, 'Two weeks');
  assert.ok(report.uploads.length >= 2 && report.uploads.every(length => realApp ? length > 1000 : length === bytes.length));
  if (realApp) {
    await app.getByRole('button', { name: 'Refresh Agent Status', exact: true }).click();
    await app.getByPlaceholder('Save an answer for this employer').fill('Compass');
    await app.getByRole('button', { name: 'Save answers and retry', exact: true }).click();
    await app.getByText('Answers saved for this employer.', { exact: false }).waitFor();
    assert.ok(fixtureState.profile.personal.applicationProfile.reusableAnswers.some(answer => answer.answer === 'Compass' && answer.hostname === 'jobs.example'));
    await app.getByRole('button', { name: 'Resume campaign', exact: true }).click();
    for (let i = 0; i < 90 && report.submissions.length < 2; i++) await new Promise(resolve => setTimeout(resolve, 1000));
    assert.equal(report.submissions.length, 2, 'The saved answer must resolve the real extension review item');
    for (let i = 0; i < 20; i++) {
      report.state = await call('GET_STATE');
      if (report.state.queue.every(job => job.status === 'completed')) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert.ok(report.state.queue.every(job => job.status === 'completed'), 'Both submissions must have confirmed receipts');
    await app.screenshot({ path: path.join(output, 'completed.png'), fullPage: true });
  }
  assert.equal(report.errors.length, 0);
  assert.deepEqual(report.consoleMessages, [], 'Browser console must have no warnings or errors');
  report.checks.push(realApp
    ? 'Real website and packaged extension: two fixture applications confirmed, PDF uploads accepted, multi-step dropdown filled, missing answer saved and retried successfully.'
    : 'Packaged extension: queue continues, one PDF preparation, native upload bytes accepted, exact saved answer selects dropdown, multi-step form submitted once and confirmed.');
  console.log(report.checks[0]);
} catch (error) {
  report.failure = error.stack;
  report.pages = await Promise.all((context?.pages() || []).map(async page => ({ url: page.url(), text: await page.locator('body').innerText({ timeout: 2000 }).catch(() => '') })));
  report.bridgeErrors = await Promise.all((context?.pages() || []).filter(page => page.url().includes('resumeats.cv')).map(page => page.evaluate(() => window.__qaBridgeErrors).catch(() => [])));
  for (const page of context?.pages() || []) if (page.url().includes('resumeats.cv')) await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {});
  process.exitCode = 1;
  console.error(error);
} finally {
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  await context?.close();
  appProcess?.kill();
  if (fixtureServer) await new Promise(resolve => { fixtureServer.close(resolve); fixtureServer.closeAllConnections(); });
  await new Promise(resolve => server.close(resolve));
}
