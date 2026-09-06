import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { isAllowedQaRequest, requireLiveQaOptIn } from './qa-safety.mjs';

// Legacy staging integration flow: never runs against production or by default.
const liveTargets = requireLiveQaOptIn(process.env);
const BASE_URL = liveTargets.appOrigin;
const ROUTE_URL = (route = '/') => `${BASE_URL}${route}`;
const ARTIFACT_DIR = path.join(process.cwd(), 'playwright-artifacts-full-latest');
const VITE_BIN = path.join(
  process.cwd(),
  'node_modules',
  'vite',
  'bin',
  'vite.js',
);

const report = {
  startedAt: new Date().toISOString(),
  baseUrl: BASE_URL,
  artifactsDir: ARTIFACT_DIR,
  steps: [],
  failures: [],
  consoleErrors: [],
  pageErrors: [],
  requestFailures: [],
  notes: [],
};

const ignoredConsolePatterns = [
  /Download the React DevTools/i,
  /Reduced Motion enabled/i,
  /Stripe\.js integration over HTTP/i,
  /SES Removing unpermitted intrinsics/i,
  /checkSupportDomain domain: localhost/i,
  /font-src 'none'.*report-only/i,
];

const ensureDir = async (dir) => {
  await fs.mkdir(dir, { recursive: true });
};

const slugify = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const sleep = (ms) => new Promise((resolve) => globalThis.setTimeout(resolve, ms));

const isBaseUrlReachable = async () => {
  try {
    const response = await globalThis.fetch(BASE_URL, {
      redirect: 'manual',
      headers: { accept: 'text/html' },
    });
    return response.ok || response.status === 304;
  } catch {
    return false;
  }
};

let previewServerProcess = null;
let previewServerLog = '';

const cleanupPreviewServer = () => {
  if (!previewServerProcess || previewServerProcess.killed) return;
  previewServerProcess.kill();
};

process.once('exit', cleanupPreviewServer);
process.once('SIGINT', () => {
  cleanupPreviewServer();
  process.exit(130);
});
process.once('SIGTERM', () => {
  cleanupPreviewServer();
  process.exit(143);
});

const ensurePreviewServer = async () => {
  if (await isBaseUrlReachable()) {
    report.notes.push('Using existing server at http://localhost:5174.');
    return;
  }

  previewServerProcess = spawn(
    process.execPath,
    [VITE_BIN, 'preview', '--host', 'localhost', '--port', '5174', '--strictPort'],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    },
  );

  previewServerProcess.stdout?.on('data', (chunk) => {
    previewServerLog += chunk.toString();
  });
  previewServerProcess.stderr?.on('data', (chunk) => {
    previewServerLog += chunk.toString();
  });

  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (previewServerProcess.exitCode !== null) {
      throw new Error(`Vite preview exited before becoming ready.\n${previewServerLog}`);
    }

    if (await isBaseUrlReachable()) {
      report.notes.push('Started local Vite preview server for QA.');
      return;
    }

    await sleep(500);
  }

  throw new Error(`Timed out waiting for Vite preview at ${BASE_URL}.\n${previewServerLog}`);
};

const recordStep = (name, status, extra = {}) => {
  report.steps.push({
    name,
    status,
    at: new Date().toISOString(),
    ...extra,
  });
};

const recordFailure = (name, error, extra = {}) => {
  report.failures.push({
    name,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    at: new Date().toISOString(),
    ...extra,
  });
};

const shouldIgnoreConsole = (text) => ignoredConsolePatterns.some((pattern) => pattern.test(text));

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const screenshot = async (page, name) => {
  const filePath = path.join(ARTIFACT_DIR, `${slugify(name)}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
};

const waitForAppIdle = async (page) => {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle').catch(() => {});
  await sleep(500);
};


const runStep = async (page, name, fn) => {
  try {
    const result = await fn();
    recordStep(name, 'passed', { url: page.url(), ...(result || {}) });
    return result;
  } catch (error) {
    const shot = await screenshot(page, `failure-${name}`).catch(() => null);
    recordStep(name, 'failed', { url: page.url(), screenshot: shot });
    recordFailure(name, error, { url: page.url(), screenshot: shot });
    return null;
  }
};

const fillById = async (page, id, value) => {
  const locator = page.locator(`#${id}`);
  await locator.waitFor({ state: 'visible', timeout: 15000 });
  await locator.fill(value);
};


const runMobileSmoke = async (browser) => {
  const context = await browser.newContext({
    serviceWorkers: 'block',
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  });
  await context.route('**/*', (route) => {
    if (isAllowedQaRequest(route.request().url(), [liveTargets.appOrigin, liveTargets.backendOrigin])) return route.continue();
    return route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  const mobileFailures = [];

  const checkRoute = async (route, text) => {
    try {
      await page.goto(ROUTE_URL(route));
      await waitForAppIdle(page);
      await page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout: 15000 });
    } catch (error) {
      mobileFailures.push({ route, error: error.message });
    }
  };

  await checkRoute('/', 'Build an ATS-Optimized Resume');
  await checkRoute('/pricing', 'Premium AI+');
  await checkRoute('/contact', 'Contact');

  const shot = await screenshot(page, 'mobile-smoke').catch(() => null);
  await context.close();
  return { mobileFailures, screenshot: shot };
};

await ensureDir(ARTIFACT_DIR);
await ensurePreviewServer();

const browser = await chromium.launch({
  headless: true,
});

const context = await browser.newContext({
  serviceWorkers: 'block',
  acceptDownloads: true,
  viewport: { width: 1440, height: 900 },
});

await context.route('**/*', (route) => {
  if (isAllowedQaRequest(route.request().url(), [liveTargets.appOrigin, liveTargets.backendOrigin])) return route.continue();
  return route.abort('blockedbyclient');
});

const page = await context.newPage();
page.setDefaultTimeout(20000);

page.on('console', (msg) => {
  if (msg.type() !== 'error') return;
  const text = msg.text();
  if (shouldIgnoreConsole(text)) return;
  report.consoleErrors.push({
    text,
    url: page.url(),
    at: new Date().toISOString(),
  });
});

page.on('pageerror', (error) => {
  report.pageErrors.push({
    text: error.message,
    url: page.url(),
    at: new Date().toISOString(),
  });
});

page.on('requestfailed', (request) => {
  const failureText = request.failure()?.errorText || 'unknown';
  if (
    request.url().includes('/auth/v1/logout') &&
    /ERR_ABORTED/i.test(failureText)
  ) {
    return;
  }

  report.requestFailures.push({
    url: request.url(),
    method: request.method(),
    failure: failureText,
    pageUrl: page.url(),
    at: new Date().toISOString(),
  });
});

const randomEmail = `qa-${Date.now()}@example.com`;
const password = 'QaTest123!';
let createdResumeId = null;

await runStep(page, 'public-home', async () => {
  await page.goto(ROUTE_URL('/'));
  await waitForAppIdle(page);
  await page.getByText('Build an ATS-Optimized Resume', { exact: false }).first().waitFor({ state: 'visible' });
  return { screenshot: await screenshot(page, 'public-home') };
});

await runStep(page, 'public-pricing', async () => {
  await page.goto(ROUTE_URL('/pricing'));
  await waitForAppIdle(page);
  await page.getByText('Premium AI+', { exact: false }).first().waitFor({ state: 'visible' });
});

await runStep(page, 'public-contact', async () => {
  await page.goto(ROUTE_URL('/contact'));
  await waitForAppIdle(page);
  await page.getByText('Contact', { exact: false }).first().waitFor({ state: 'visible' });
});

await runStep(page, 'signup', async () => {
  await page.goto(ROUTE_URL('/signup'));
  await waitForAppIdle(page);
  await page.locator('#email-desktop').fill(randomEmail);
  await page.locator('#password-desktop').fill(password);
  await page.locator('#confirmPassword-desktop').fill(password);
  await page.locator('form').first().locator('button[type="submit"]').first().click();
  await page.getByText('Registration Successful', { exact: false }).waitFor({ state: 'visible', timeout: 30000 });
  return { email: randomEmail, screenshot: await screenshot(page, 'signup-success') };
});

await runStep(page, 'signin', async () => {
  if (/\/dashboard(?:[/?#]|$)/.test(page.url())) {
    await page.getByRole('button', { name: /Account/i }).first().click();
    await page.getByRole('menuitem', { name: /Sign Out/i }).first().click();
    await page.waitForURL(/\/signin(?:[/?#]|$)/, { timeout: 30000 });
  } else {
    await page.goto(ROUTE_URL('/signin'));
    await waitForAppIdle(page);
  }

  await waitForAppIdle(page);
  await page.locator('#email-desktop').fill(randomEmail);
  await page.locator('#password-desktop').fill(password);
  await page.locator('form').first().locator('button[type="submit"]').first().click();
  await page.waitForURL(/\/dashboard(?:[/?#]|$)/, { timeout: 30000 });
  await page.getByText('Choose a base resume', { exact: false }).first().waitFor({ state: 'visible', timeout: 20000 });
});

await runStep(page, 'dashboard', async () => {
  await page.goto(ROUTE_URL('/dashboard'));
  await waitForAppIdle(page);
  await page.getByText('Choose a base resume', { exact: false }).waitFor({ state: 'visible' });
});

await runStep(page, 'quick-resume-free-gate', async () => {
  await page.goto(ROUTE_URL('/quick-resume'));
  await waitForAppIdle(page);
  await page.getByText('Quick Resume Requires Premium', { exact: false }).waitFor({ state: 'visible' });
});

await runStep(page, 'ai-generator-free-gate', async () => {
  await page.goto(ROUTE_URL('/ai-generator'));
  await waitForAppIdle(page);
  await page.getByText('Generate a full AI draft before you start editing line by line', { exact: false }).waitFor({ state: 'visible' });
});

await runStep(page, 'profile-save', async () => {
  await page.goto(ROUTE_URL('/profile'));
  await waitForAppIdle(page);
  await fillById(page, 'fullName', 'QA Test User');
  await fillById(page, 'email', randomEmail);
  await fillById(page, 'location', 'Tbilisi, Georgia');
  await page.getByRole('button', { name: /Education & Certifications/i }).click();
  await fillById(page, 'institution', 'QA University');
  await fillById(page, 'degree', 'Bachelor of Science');
  await fillById(page, 'fieldOfStudy', 'Computer Science');
  await fillById(page, 'location', 'Tbilisi, Georgia');
  await fillById(page, 'startDate', '2018-09');
  await fillById(page, 'endDate', '2022-06');
  await fillById(page, 'description', 'Automation coursework and testing labs');
  await page.getByRole('button', { name: /Add This Qualification/i }).click();
  await page.getByText('QA University', { exact: false }).waitFor({ state: 'visible' });
  await fillById(page, 'certificationName', 'Certified QA Automation Engineer');
  await fillById(page, 'certificationIssuer', 'QA Institute');
  await fillById(page, 'certificationIssueDate', '2024-01');
  await fillById(page, 'certificationCredentialID', 'QA-12345');
  await fillById(page, 'certificationDescription', 'End-to-end browser automation certification');
  await page.getByRole('button', { name: /^Add Certification$/ }).click();
  await page.getByText('Certified QA Automation Engineer', { exact: false }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await page.getByText('Career foundation saved', { exact: false }).waitFor({ state: 'visible', timeout: 20000 });
  await page.getByText('QA University', { exact: false }).waitFor({ state: 'visible' });
  await page.getByText('Certified QA Automation Engineer', { exact: false }).waitFor({ state: 'visible' });
  return { screenshot: await screenshot(page, 'profile-save') };
});

await runStep(page, 'builder-create-save', async () => {
  await page.goto(ROUTE_URL('/builder'));
  await waitForAppIdle(page);

  await fillById(page, 'fullName', 'QA Test User');
  await fillById(page, 'email', randomEmail);
  await fillById(page, 'jobTitle', 'QA Automation Engineer');
  await fillById(page, 'location', 'Tbilisi, Georgia');

  const saveButton = page.getByRole('button', { name: /Create Resume|Save Resume/i }).first();
  await saveButton.click();
  await page.waitForURL(/\/builder\/.+/, { timeout: 30000 });

  const match = page.url().match(/\/builder\/([^/?#]+)/);
  createdResumeId = match?.[1] || null;
  assert(createdResumeId, 'Resume ID was not created after saving.');

  await page.getByText('Builder Status', { exact: false }).waitFor({ state: 'visible' });
  return { resumeId: createdResumeId, screenshot: await screenshot(page, 'builder-saved') };
});

await runStep(page, 'preview-export-docx', async () => {
  assert(createdResumeId, 'Missing saved resume id for preview test.');
  await page.goto(ROUTE_URL(`/preview/${createdResumeId}`));
  await waitForAppIdle(page);
  await page.getByText('Choose Export Format', { exact: false }).waitFor({ state: 'visible' });

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.getByRole('button', { name: /Export as DOCX/i }).click(),
  ]);

  const downloadPath = path.join(ARTIFACT_DIR, await download.suggestedFilename());
  await download.saveAs(downloadPath);
  return { download: downloadPath, screenshot: await screenshot(page, 'preview-export') };
});

await runStep(page, 'applications-add', async () => {
  await page.goto(ROUTE_URL('/applications'));
  await waitForAppIdle(page);

  const firstAddButton = page.getByRole('button', { name: /Add Your First Application|Add Application/i }).first();
  await firstAddButton.click();
  await page.getByRole('heading', { name: 'Add Application' }).waitFor({ state: 'visible' });
  await fillById(page, 'app-company', 'Acme QA');
  await fillById(page, 'app-position', 'Automation Engineer');
  await fillById(page, 'app-location', 'Remote');
  await fillById(page, 'app-notes', 'Created during automated QA run');
  await page.getByRole('button', { name: /^Add Application$/ }).last().click();
  await page.getByText('Application added!', { exact: false }).first().waitFor({ state: 'visible', timeout: 20000 });
  return { screenshot: await screenshot(page, 'applications-added') };
});

await runStep(page, 'analytics-load', async () => {
  await page.goto(ROUTE_URL('/analytics'));
  await waitForAppIdle(page);
  await page.getByText('Analytics', { exact: false }).first().waitFor({ state: 'visible', timeout: 20000 });
});


const mobileResult = await runMobileSmoke(browser);
report.mobile = mobileResult;
if (mobileResult.mobileFailures.length > 0) {
  recordFailure('mobile-smoke', new Error('Mobile smoke checks failed'), {
    details: mobileResult.mobileFailures,
    screenshot: mobileResult.screenshot,
  });
}

await context.close();
await browser.close();
cleanupPreviewServer();

report.finishedAt = new Date().toISOString();
report.summary = {
  passedSteps: report.steps.filter((step) => step.status === 'passed').length,
  failedSteps: report.steps.filter((step) => step.status === 'failed').length,
  consoleErrors: report.consoleErrors.length,
  pageErrors: report.pageErrors.length,
  requestFailures: report.requestFailures.length,
};

const reportPath = path.join(ARTIFACT_DIR, 'report.json');
await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');

if (
  report.summary.failedSteps > 0 ||
  report.summary.consoleErrors > 0 ||
  report.summary.pageErrors > 0 ||
  report.summary.requestFailures > 0
) {
  globalThis.console.error(`QA run completed with issues. Report: ${reportPath}`);
  process.exit(1);
}

globalThis.console.log(`QA run passed. Report: ${reportPath}`);
