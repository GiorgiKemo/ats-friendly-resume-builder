import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE_URL = 'http://localhost:5174';
const HASH_URL = (route = '/') => `${BASE_URL}/#${route}`;
const ARTIFACT_DIR = path.join(process.cwd(), 'playwright-artifacts-full-latest');

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

const visible = async (locator) => {
  try {
    return await locator.isVisible();
  } catch {
    return false;
  }
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

const fillStripeCardField = async (page, selectorList, value) => {
  for (const frame of page.frames()) {
    for (const selector of selectorList) {
      const locator = frame.locator(selector).first();
      try {
        if (await locator.isVisible({ timeout: 1000 }).catch(() => false)) {
          await locator.fill(value);
          return true;
        }
      } catch {
        // Ignore and continue searching other frames/selectors.
      }
    }
  }
  return false;
};

const completeStripeCheckout = async (page) => {
  await page.waitForURL(/checkout\.stripe\.com|billing\.stripe\.com/i, { timeout: 30000 });
  await waitForAppIdle(page);

  const cardholder = page.locator('input[placeholder="Full name on card"]').first();
  if (await visible(cardholder)) {
    await cardholder.fill('QA Tester');
  }

  const filledCardNumber = await fillStripeCardField(page, [
    'input[name="cardnumber"]',
    'input[autocomplete="cc-number"]',
    'input[placeholder="1234 1234 1234 1234"]',
  ], '4242424242424242');
  assert(filledCardNumber, 'Could not find Stripe card number field.');

  const filledExpiry = await fillStripeCardField(page, [
    'input[name="exp-date"]',
    'input[autocomplete="cc-exp"]',
    'input[placeholder="MM / YY"]',
  ], '1234');
  assert(filledExpiry, 'Could not find Stripe expiry field.');

  const filledCvc = await fillStripeCardField(page, [
    'input[name="cvc"]',
    'input[autocomplete="cc-csc"]',
    'input[placeholder="CVC"]',
  ], '123');
  assert(filledCvc, 'Could not find Stripe CVC field.');

  const countrySelect = page.locator('select').filter({ has: page.locator('option') }).first();
  if (await visible(countrySelect)) {
    await countrySelect.selectOption({ label: 'United States' }).catch(() => {});
  }

  const saveInfoToggle = page.getByLabel(/Save my information for faster checkout/i).first();
  if (await visible(saveInfoToggle)) {
    await saveInfoToggle.uncheck().catch(() => {});
  }

  const zipInput = page.locator('input[placeholder="ZIP"], input[autocomplete="postal-code"], input[name="postalCode"]').first();
  if (await visible(zipInput)) {
    await zipInput.fill('10001').catch(() => {});
  }

  const phoneInput = page.locator('input[type="tel"], input[autocomplete="tel"]').first();
  if (await visible(phoneInput)) {
    await phoneInput.fill('2015550123').catch(() => {});
  }

  const submitButton = page.getByRole('button', { name: /Subscribe|Pay|Start subscription|Continue/i }).first();
  await submitButton.waitFor({ state: 'visible', timeout: 15000 });
  await submitButton.click();

  await page.waitForURL(new RegExp(`${BASE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), { timeout: 90000 });
  await waitForAppIdle(page);
};

const runMobileSmoke = async (browser) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  });
  const page = await context.newPage();
  const mobileFailures = [];

  const checkRoute = async (route, text) => {
    try {
      await page.goto(HASH_URL(route));
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

const browser = await chromium.launch({
  headless: true,
  executablePath: EDGE_PATH,
});

const context = await browser.newContext({
  acceptDownloads: true,
  viewport: { width: 1440, height: 900 },
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
let upgradedToPremium = false;

await runStep(page, 'public-home', async () => {
  await page.goto(HASH_URL('/'));
  await waitForAppIdle(page);
  await page.getByText('Build an ATS-Optimized Resume', { exact: false }).first().waitFor({ state: 'visible' });
  return { screenshot: await screenshot(page, 'public-home') };
});

await runStep(page, 'public-pricing', async () => {
  await page.goto(HASH_URL('/pricing'));
  await waitForAppIdle(page);
  await page.getByText('Premium AI+', { exact: false }).first().waitFor({ state: 'visible' });
});

await runStep(page, 'public-contact', async () => {
  await page.goto(HASH_URL('/contact'));
  await waitForAppIdle(page);
  await page.getByText('Contact', { exact: false }).first().waitFor({ state: 'visible' });
});

await runStep(page, 'signup', async () => {
  await page.goto(HASH_URL('/signup'));
  await waitForAppIdle(page);
  await page.locator('#email-desktop').fill(randomEmail);
  await page.locator('#password-desktop').fill(password);
  await page.locator('#confirmPassword-desktop').fill(password);
  await page.locator('form').first().locator('button[type="submit"]').first().click();
  await page.getByText('Registration Successful', { exact: false }).waitFor({ state: 'visible', timeout: 30000 });
  return { email: randomEmail, screenshot: await screenshot(page, 'signup-success') };
});

await runStep(page, 'signin', async () => {
  if (/#\/dashboard/.test(page.url())) {
    await page.getByRole('button', { name: /Account/i }).first().click();
    await page.getByRole('button', { name: /Sign Out/i }).first().click();
    await page.waitForURL(/#\/signin/, { timeout: 30000 });
  } else {
    await page.goto(HASH_URL('/signin'));
    await waitForAppIdle(page);
  }

  await waitForAppIdle(page);
  await page.locator('#email-desktop').fill(randomEmail);
  await page.locator('#password-desktop').fill(password);
  await page.locator('form').first().locator('button[type="submit"]').first().click();
  await page.waitForURL(/#\/dashboard/, { timeout: 30000 });
  await page.getByText('Choose a base resume', { exact: false }).first().waitFor({ state: 'visible', timeout: 20000 });
});

await runStep(page, 'dashboard', async () => {
  await page.goto(HASH_URL('/dashboard'));
  await waitForAppIdle(page);
  await page.getByText('Choose a base resume', { exact: false }).waitFor({ state: 'visible' });
});

await runStep(page, 'quick-resume-free-gate', async () => {
  await page.goto(HASH_URL('/quick-resume'));
  await waitForAppIdle(page);
  await page.getByText('Quick Resume Requires Premium', { exact: false }).waitFor({ state: 'visible' });
});

await runStep(page, 'ai-generator-free-gate', async () => {
  await page.goto(HASH_URL('/ai-generator'));
  await waitForAppIdle(page);
  await page.getByText('Generate a full AI draft before you start editing line by line', { exact: false }).waitFor({ state: 'visible' });
});

await runStep(page, 'profile-save', async () => {
  await page.goto(HASH_URL('/profile'));
  await waitForAppIdle(page);
  await fillById(page, 'fullName', 'QA Test User');
  await fillById(page, 'email', randomEmail);
  await fillById(page, 'location', 'Tbilisi, Georgia');
  await page.getByRole('button', { name: /Save My Foundation/i }).click();
  await sleep(1500);
  return { screenshot: await screenshot(page, 'profile-save') };
});

await runStep(page, 'builder-create-save', async () => {
  await page.goto(HASH_URL('/builder'));
  await waitForAppIdle(page);

  await fillById(page, 'fullName', 'QA Test User');
  await fillById(page, 'email', randomEmail);
  await fillById(page, 'jobTitle', 'QA Automation Engineer');
  await fillById(page, 'location', 'Tbilisi, Georgia');

  const saveButton = page.getByRole('button', { name: /Create Resume|Save Resume/i }).first();
  await saveButton.click();
  await page.waitForURL(/#\/builder\/.+/, { timeout: 30000 });

  const match = page.url().match(/#\/builder\/([^/?]+)/);
  createdResumeId = match?.[1] || null;
  assert(createdResumeId, 'Resume ID was not created after saving.');

  await page.getByText('Builder Status', { exact: false }).waitFor({ state: 'visible' });
  return { resumeId: createdResumeId, screenshot: await screenshot(page, 'builder-saved') };
});

await runStep(page, 'preview-export-docx', async () => {
  assert(createdResumeId, 'Missing saved resume id for preview test.');
  await page.goto(HASH_URL(`/preview/${createdResumeId}`));
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
  await page.goto(HASH_URL('/applications'));
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
  await page.goto(HASH_URL('/analytics'));
  await waitForAppIdle(page);
  await page.getByText('Analytics', { exact: false }).first().waitFor({ state: 'visible', timeout: 20000 });
});

await runStep(page, 'pricing-upgrade-checkout', async () => {
  await page.goto(HASH_URL('/pricing'));
  await waitForAppIdle(page);
  await page.getByRole('button', { name: /Upgrade to Premium Monthly/i }).click();
  await completeStripeCheckout(page);
  await page.goto(HASH_URL('/pricing'));
  await waitForAppIdle(page);
  await page.getByRole('button', { name: /Manage Subscription/i }).first().waitFor({ state: 'visible', timeout: 30000 });
  upgradedToPremium = true;
  return { screenshot: await screenshot(page, 'pricing-premium') };
});

await runStep(page, 'quick-resume-premium-access', async () => {
  if (!upgradedToPremium) throw new Error('Premium upgrade did not complete, cannot verify premium quick resume access.');
  await page.goto(HASH_URL('/quick-resume'));
  await waitForAppIdle(page);
  await page.getByText('Create Your Resume', { exact: false }).waitFor({ state: 'visible', timeout: 20000 });
  await page.getByText('Three simple steps to a professional resume', { exact: false }).waitFor({ state: 'visible' });
});

await runStep(page, 'ai-generator-premium-access', async () => {
  if (!upgradedToPremium) throw new Error('Premium upgrade did not complete, cannot verify AI generator access.');
  await page.goto(HASH_URL('/ai-generator'));
  await waitForAppIdle(page);
  await page.getByText('Craft Your Next Career Move with AI Precision', { exact: false }).waitFor({ state: 'visible', timeout: 20000 });
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
  report.summary.pageErrors > 0 ||
  report.summary.requestFailures > 0
) {
  globalThis.console.error(`QA run completed with issues. Report: ${reportPath}`);
  process.exit(1);
}

globalThis.console.log(`QA run passed. Report: ${reportPath}`);
