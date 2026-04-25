/* global chrome, console, document, KeyboardEvent, setTimeout, URL, window */

import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { chromium } from 'playwright';
import { resolveBrowserConfig } from './browser-config.mjs';

const cwd = process.cwd();
const extensionArg = process.argv.find((value) => value.startsWith('--extension-path='));
const browserArg = process.argv.find((value) => value.startsWith('--browser='));
const browserConfig = resolveBrowserConfig(browserArg ? browserArg.split('=')[1] : 'edge');
const extensionPath = path.resolve(
  cwd,
  extensionArg ? extensionArg.split('=')[1] : 'browser-agent',
);
const useProductionAppHost = path.basename(extensionPath).toLowerCase() === 'dist-extension';
const PRODUCTION_APP_STUB_URL = 'https://resumeats.cv';
const artifactsDir = path.join(cwd, `playwright-artifacts-extension-qa-${browserConfig.id}`);
const userDataDir = path.join(artifactsDir, `user-data-${Date.now()}`);

const report = {
  startedAt: new Date().toISOString(),
  artifactsDir,
  steps: [],
  failures: [],
  extensionPath,
  browser: browserConfig,
};

const recordStep = (name, status, extra = {}) => {
  report.steps.push({ name, status, at: new Date().toISOString(), ...extra });
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

const slugify = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const screenshot = async (page, name) => {
  const filePath = path.join(artifactsDir, `${slugify(name)}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const waitForExtensionWorker = async (context, timeoutMs = 20000) => {
  const existing = context.serviceWorkers().find((worker) => /^chrome-extension:\/\//.test(worker.url()));
  if (existing) {
    return existing;
  }

  return context.waitForEvent('serviceworker', {
    timeout: timeoutMs,
    predicate: (worker) => /^chrome-extension:\/\//.test(worker.url()),
  });
};

const sendRuntimeMessage = async (page, type, payload) => (
  page.evaluate(
    ({ type, payload }) => new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type, payload }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (response?.success === false) {
          reject(new Error(response.error || `${type} failed`));
          return;
        }
        resolve(response);
      });
    }),
    { type, payload },
  )
);

const fixtureHtml = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>QA Fixture Backend Developer</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 0; background: #f8fafc; color: #0f172a; }
      .shell { max-width: 980px; margin: 0 auto; padding: 48px 24px 120px; }
      .eyebrow { color: #2563eb; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .14em; }
      h1 { margin: 12px 0; font-size: 42px; }
      .meta { color: #475569; font-size: 18px; }
      .grid { display: grid; grid-template-columns: 1.1fr .9fr; gap: 28px; margin-top: 32px; }
      .card { background: white; border: 1px solid #cbd5e1; border-radius: 18px; padding: 24px; box-shadow: 0 10px 28px rgba(15,23,42,.06); }
      ul { line-height: 1.8; }
      .apply-cta { margin-top: 24px; }
      .apply-cta button { background: #2563eb; color: white; border: 0; border-radius: 12px; padding: 12px 20px; font-size: 16px; cursor: pointer; }
      form { display: grid; gap: 14px; }
      label { display: grid; gap: 6px; font-size: 14px; color: #334155; }
      input, textarea, select { padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 10px; font: inherit; }
      textarea { min-height: 90px; resize: vertical; }
      .custom-combobox { position: relative; }
      .custom-combobox ul { position: absolute; z-index: 50; top: calc(100% + 4px); left: 0; right: 0; margin: 0; padding: 6px; list-style: none; background: white; border: 1px solid #cbd5e1; border-radius: 12px; box-shadow: 0 14px 30px rgba(15,23,42,.16); }
      .custom-combobox li { padding: 8px 10px; border-radius: 8px; cursor: pointer; }
      .custom-combobox li:hover { background: #eff6ff; }
      .submit { background: #0f172a; color: white; border: 0; border-radius: 12px; padding: 12px 18px; font-size: 15px; cursor: pointer; }
    </style>
  </head>
  <body>
    <div class="shell">
      <div class="eyebrow">Remote • Full-time</div>
      <h1>Senior Backend Developer (Node.js)</h1>
      <div class="meta">Acme Robotics • Chorzow, Poland • Posted on ResumeATS QA Board</div>
      <div class="grid">
        <section class="card">
          <h2>Role Summary</h2>
          <p>We need a backend engineer to build resilient Node.js and TypeScript services, maintain PostgreSQL data models, and collaborate closely with React product teams. This is a remote role with occasional AWS architecture work.</p>
          <h3>Core Skills</h3>
          <ul>
            <li>Node.js and TypeScript in production</li>
            <li>PostgreSQL and API design</li>
            <li>AWS operations and monitoring</li>
            <li>Clear communication with frontend and product teams</li>
          </ul>
        </section>
        <section class="card">
          <h2>Quick Application</h2>
          <form>
            <label>Full Name<input id="full-name" name="full_name" type="text" /></label>
            <label>Email Address<input id="email" name="email" type="email" /></label>
            <label>Phone Country Code<select id="phone-country" name="phone_country_code"><option value="">Select</option><option value="+1">+1 US</option><option value="+48">+48 Poland</option><option value="+995">+995 Georgia</option></select></label>
            <label>Phone Number<input id="phone" name="phone" type="tel" /></label>
            <label>LinkedIn Profile<input id="linkedin" name="linkedin" type="url" /></label>
            <label>GitHub Profile<input id="github" name="github" type="url" /></label>
            <label>Website / Portfolio<input id="website" name="website" type="url" /></label>
            <label>Current Company<input id="company" name="company" type="text" /></label>
            <label>Current Job Title<input id="title" name="title" type="text" /></label>
            <label>Work Authorization<select id="authorization" name="authorization"><option value="">Select</option><option>Yes</option><option>No</option></select></label>
            <label>State / Province
              <div class="custom-combobox" data-custom-select>
                <input id="state-province" name="state_province" role="combobox" aria-expanded="false" aria-controls="state-province-options" autocomplete="off" />
                <ul id="state-province-options" role="listbox" hidden>
                  <li role="option" data-value="Georgia">Georgia</li>
                  <li role="option" data-value="Silesian">Silesian</li>
                  <li role="option" data-value="California">California</li>
                </ul>
              </div>
            </label>
            <label>Years of Experience<input id="experience" name="experience" type="text" /></label>
            <label>Preferred Work Setup<select id="work-setup" name="work_setup"><option value="">Select</option><option>Remote</option><option>Hybrid</option><option>On-site</option></select></label>
            <label>Gender<select id="gender" name="gender"><option value="">Select</option><option>Woman</option><option>Man</option><option>Non-binary</option><option>Prefer not to answer</option></select></label>
            <label>Race / Ethnicity<select id="race" name="race"><option value="">Select</option><option>Asian</option><option>Black or African American</option><option>White</option><option>Prefer not to answer</option></select></label>
            <label>Are you Hispanic or Latino?<select id="hispanic" name="hispanic_latino"><option value="">Select</option><option>Yes, Hispanic or Latino</option><option>No, not Hispanic or Latino</option><option>Prefer not to answer</option></select></label>
            <fieldset>
              <legend>Would you need immigration support in the future?</legend>
              <label><input type="radio" name="immigration_support" value="Yes" /> Yes</label>
              <label><input type="radio" name="immigration_support" value="No" /> No</label>
            </fieldset>
            <label>Why are you interested in this role?<textarea id="why-role" name="why_role"></textarea></label>
            <label>Tell us about yourself<textarea id="cover-letter" name="cover_letter"></textarea></label>
            <button class="submit" id="submit-app" type="button">Submit Application</button>
          </form>
        </section>
      </div>
    </div>
    <script>
      const combo = document.querySelector('[data-custom-select]');
      const input = document.getElementById('state-province');
      const list = document.getElementById('state-province-options');
      const open = () => {
        list.hidden = false;
        input.setAttribute('aria-expanded', 'true');
      };
      const close = () => {
        list.hidden = true;
        input.setAttribute('aria-expanded', 'false');
      };
      input.addEventListener('focus', open);
      input.addEventListener('click', open);
      input.addEventListener('input', open);
      list.querySelectorAll('[role="option"]').forEach((option) => {
        option.addEventListener('mousedown', (event) => event.preventDefault());
        option.addEventListener('click', () => {
          input.value = option.dataset.value || option.textContent.trim();
          input.dataset.selected = input.value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          close();
        });
      });
      document.addEventListener('click', (event) => {
        if (!combo.contains(event.target)) close();
      });
    </script>
  </body>
</html>`;

const iframeFormHtml = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      body { font-family: Arial, sans-serif; margin: 0; background: #ffffff; color: #0f172a; }
      .shell { padding: 18px; }
      form { display: grid; gap: 14px; }
      label { display: grid; gap: 6px; font-size: 14px; color: #334155; }
      input, textarea, select { padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 10px; font: inherit; }
      textarea { min-height: 90px; resize: vertical; }
    </style>
  </head>
  <body>
    <div class="shell">
      <form>
        <label>Full Name<input id="embedded-full-name" name="full_name" type="text" /></label>
        <label>Email Address<input id="embedded-email" name="email" type="email" /></label>
        <label>Phone Number<input id="embedded-phone" name="phone" type="tel" /></label>
        <label>Website / Portfolio<input id="embedded-website" name="website" type="url" /></label>
        <label>Preferred Work Setup<select id="embedded-work-setup" name="work_setup"><option value="">Select</option><option>Remote</option><option>Hybrid</option><option>On-site</option></select></label>
        <fieldset>
          <legend>Would you need immigration support in the future?</legend>
          <label><input type="radio" name="embedded_immigration_support" value="Yes" /> Yes</label>
          <label><input type="radio" name="embedded_immigration_support" value="No" /> No</label>
        </fieldset>
        <label>Why are you interested in this role?<textarea id="embedded-why-role" name="why_role"></textarea></label>
      </form>
    </div>
  </body>
</html>`;

const iframeFixtureHtml = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>QA Fixture Embedded Application</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 0; background: #eef2ff; color: #0f172a; }
      .shell { max-width: 1080px; margin: 0 auto; padding: 48px 24px 120px; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }
      .card { background: white; border: 1px solid #cbd5e1; border-radius: 18px; padding: 24px; box-shadow: 0 10px 28px rgba(15,23,42,.06); }
      h1 { margin-top: 0; font-size: 40px; }
      iframe { width: 100%; height: 680px; border: 1px solid #cbd5e1; border-radius: 16px; background: white; }
    </style>
  </head>
  <body>
    <div class="shell">
      <div class="grid">
        <section class="card">
          <h1>Platform Engineer</h1>
          <p>Northstar Labs • Remote • Full-time</p>
          <p>This role owns backend platform reliability, developer tooling, and TypeScript services. The application form is embedded below in an iframe to simulate ATS wrappers that render the real candidate fields in a nested document.</p>
          <p>Key skills: Node.js, TypeScript, AWS, PostgreSQL, CI/CD, systems thinking.</p>
        </section>
        <section class="card">
          <h2>Embedded Application</h2>
          <iframe name="embedded-application" src="/embedded-form.html" title="Embedded Application Form"></iframe>
        </section>
      </div>
    </div>
  </body>
</html>`;

const neutralHtml = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>QA Fixture Settings</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 0; background: #f8fafc; color: #0f172a; }
      .shell { max-width: 760px; margin: 0 auto; padding: 64px 24px; }
      .card { background: white; border: 1px solid #cbd5e1; border-radius: 18px; padding: 24px; box-shadow: 0 10px 28px rgba(15,23,42,.06); }
      h1 { margin-top: 0; }
      label { display: grid; gap: 6px; margin-top: 14px; color: #334155; }
      input { padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 10px; font: inherit; }
    </style>
  </head>
  <body>
    <div class="shell">
      <div class="card">
        <h1>Router Settings</h1>
        <p>This is a generic admin page. The ResumeATS companion should stay docked, but switch into a neutral state here.</p>
        <label>Router Name<input type="text" value="Office Router" /></label>
        <label>Admin Email<input type="email" value="admin@example.com" /></label>
      </div>
    </div>
  </body>
</html>`;

const appBridgeHtml = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>ResumeATS QA App Bridge</title>
  </head>
  <body>
    <script>
      const bridgeProfile = {
        integration: { appUrl: window.location.origin },
        candidate: {
          firstName: 'Giorgi',
          lastName: 'Kemoklidze',
          fullName: 'Giorgi Kemoklidze',
          email: 'gegakemoklidze@gmail.com',
          phone: '+48 518 966 402',
          location: 'Chorzow, Poland',
          linkedin: 'https://linkedin.com/in/giorgi-kemoklidze',
          github: 'https://github.com/GiorgiKemo',
          portfolio: 'https://giorgi.codes',
          website: 'https://giorgi.codes',
          currentTitle: 'Senior Backend Developer',
          currentCompany: 'ResumeATS',
        },
        skills: ['Node.js', 'TypeScript', 'React', 'AWS', 'PostgreSQL'],
        answers: {
          linkedinUrl: 'https://linkedin.com/in/giorgi-kemoklidze',
          githubUrl: 'https://github.com/GiorgiKemo',
          portfolioUrl: 'https://giorgi.codes',
          websiteUrl: 'https://giorgi.codes',
          currentCompany: 'ResumeATS',
          currentTitle: 'Senior Backend Developer',
          workAuthorization: 'Yes',
          requiresSponsorship: 'No',
          yearsOfExperience: '5+',
          preferredWorkSetup: 'Remote',
          phoneCountryCode: '+48',
          stateProvince: 'Silesian',
          gender: 'Male',
          raceEthnicity: 'White',
          hispanicLatino: 'No',
        },
        documents: {
          resumeId: 'qa-resume-id',
          resumeFilename: 'Giorgi_Kemoklidze_Resume.pdf',
          resumePdfUrl: window.location.origin + '/resume.pdf',
        },
        automation: { autoSubmit: false },
      };

      window.addEventListener('message', (event) => {
        const message = event.data;
        if (
          event.source !== window ||
          !message ||
          message.source !== 'resumeats-browser-agent' ||
          message.target !== 'resumeats-web'
        ) {
          return;
        }

        let payload = {};

        if (message.type === 'APP_AUTOFILL_AI_REQUEST') {
          const questions = Array.isArray(message.payload?.questions) ? message.payload.questions : [];
          window.__lastApplicationQuestions = questions;
          payload = {
            answers: questions.map((question) => {
              const label = String(question.label || '').toLowerCase();
              let answer = '';

              if (label.includes('why are you interested in this role')) {
                answer = 'This role fits my background in Node.js, TypeScript, and PostgreSQL, and it gives me room to contribute to backend reliability while collaborating closely with product and frontend teams.';
              } else if (label.includes('preferred work setup')) {
                answer = 'Remote';
              } else if (label.includes('immigration support')) {
                answer = 'No';
              } else if (label.includes('tell us about yourself')) {
                answer = 'I am a backend-focused engineer with strong Node.js, TypeScript, AWS, and PostgreSQL experience, and I enjoy building reliable systems that support fast-moving product teams.';
              }

              return {
                id: question.id,
                answer,
                confidence: 'high',
              };
            }),
          };
        } else if (message.type === 'APP_SYNC_PROFILE_REQUEST') {
          payload = {
            profile: bridgeProfile,
            candidate: {
              fullName: bridgeProfile.candidate.fullName,
              currentTitle: bridgeProfile.candidate.currentTitle,
            },
            resume: {
              id: bridgeProfile.documents.resumeId,
              title: 'QA Resume',
              filename: bridgeProfile.documents.resumeFilename,
              resumePdfUrl: bridgeProfile.documents.resumePdfUrl,
            },
          };
        } else if (message.type === 'APP_PREPARE_RESUME_REQUEST') {
          window.__lastPreparedJob = message.payload?.jobPosting || null;
          payload = {
            profile: {
              ...bridgeProfile,
              documents: {
                ...bridgeProfile.documents,
                preparedForUrl: message.payload?.jobPosting?.url || '',
                preparedForTitle: message.payload?.jobPosting?.title || '',
                preparedAt: new Date().toISOString(),
                preparedResumeId: 'qa-tailored-resume-id',
                preparedResumeTitle: 'QA Tailored Resume',
              },
            },
            resume: {
              id: 'qa-tailored-resume-id',
              title: 'QA Tailored Resume',
              filename: bridgeProfile.documents.resumeFilename,
              resumePdfUrl: bridgeProfile.documents.resumePdfUrl,
            },
          };
        } else {
          return;
        }

        window.postMessage(
          {
            source: 'resumeats-web',
            target: 'resumeats-browser-agent',
            type: message.type + ':response',
            requestId: message.requestId,
            payload,
            success: true,
          },
          window.origin
        );
      });
    </script>
  </body>
</html>`;

let server;
let context;

try {
  await fs.mkdir(artifactsDir, { recursive: true });
  await fs.mkdir(userDataDir, { recursive: true });

  server = http.createServer((req, res) => {
    const host = req.headers.host || '';
    if ((req.url || '').includes('resume.pdf')) {
      res.writeHead(200, { 'content-type': 'application/pdf' });
      res.end(Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Contents 4 0 R>>endobj\n4 0 obj<</Length 44>>stream\nBT /F1 12 Tf 36 120 Td (ResumeATS QA PDF) Tj ET\nendstream\nendobj\ntrailer<</Root 1 0 R>>\n%%EOF'));
      return;
    }

    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    if (!useProductionAppHost && /^localhost:/i.test(host)) {
      res.end(appBridgeHtml);
      return;
    }

    if ((req.url || '').includes('embedded-form')) {
      res.end(iframeFormHtml);
      return;
    }

    if ((req.url || '').includes('embedded')) {
      res.end(iframeFixtureHtml);
      return;
    }

    if ((req.url || '').includes('settings')) {
      res.end(neutralHtml);
      return;
    }

    res.end(fixtureHtml);
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const fixtureUrl = `http://127.0.0.1.nip.io:${port}/job.html`;
  const iframeFixtureUrl = `http://127.0.0.1.nip.io:${port}/embedded.html`;
  const neutralUrl = `http://127.0.0.1.nip.io:${port}/settings.html`;
  const appUrl = useProductionAppHost ? PRODUCTION_APP_STUB_URL : `http://localhost:${port}`;
  const appUrlPattern = useProductionAppHost
    ? /^https:\/\/(?:www\.)?resumeats\.cv/i
    : new RegExp(`^${appUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
  report.fixtureUrl = fixtureUrl;
  report.iframeFixtureUrl = iframeFixtureUrl;
  report.neutralUrl = neutralUrl;
  report.appUrl = appUrl;
  report.appMode = useProductionAppHost ? 'production-host-route' : 'localhost-stub';

  const launchOptions = {
    headless: false,
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 960 },
    args: [
      '--disable-features=DisableLoadExtensionCommandLineSwitch',
      '--enable-unsafe-extension-debugging',
      '--no-first-run',
      '--no-default-browser-check',
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  };
  if (browserConfig.executablePath) {
    launchOptions.executablePath = browserConfig.executablePath;
  }
  if (browserConfig.channel) {
    launchOptions.channel = browserConfig.channel;
  }

  context = await chromium.launchPersistentContext(userDataDir, launchOptions);

  if (useProductionAppHost) {
    await context.route('https://resumeats.cv/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: appBridgeHtml,
      });
    });
    await context.route('https://www.resumeats.cv/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: appBridgeHtml,
      });
    });
  }

  const appPage = await context.newPage();
  await appPage.goto(appUrl);
  await appPage.waitForLoadState('domcontentloaded');
  recordStep('app-bridge-ready', 'passed', { url: appUrl });

  const jobPage = await context.newPage();
  await jobPage.goto(fixtureUrl);
  await jobPage.waitForLoadState('domcontentloaded');
  await jobPage.waitForFunction(() => Boolean(document.getElementById('resumeats-job-widget-host-v3')?.shadowRoot), null, { timeout: 20000 });
  recordStep('widget-injected', 'passed', { screenshot: await screenshot(jobPage, 'widget-injected') });

  const serviceWorker = await waitForExtensionWorker(context);
  const extensionId = new URL(serviceWorker.url()).host;
  report.extensionId = extensionId;
  recordStep('extension-loaded', 'passed', { extensionId });

  let popupPage = await context.newPage();
  await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
  await popupPage.waitForLoadState('domcontentloaded');

  const sidepanelPage = await context.newPage();
  await sidepanelPage.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await sidepanelPage.waitForSelector('#next-step-title');

  await popupPage.locator('#recommended-button').click();
  await popupPage.waitForFunction(() => document.querySelector('#status')?.textContent?.toLowerCase().includes('synced'), null, { timeout: 20000 });
  recordStep('connect-profile-synced', 'passed');

  await popupPage.locator('#sync-profile').click();
  await popupPage.waitForFunction(() => document.querySelector('#status')?.textContent?.toLowerCase().includes('synced'), null, { timeout: 20000 });
  recordStep('profile-synced', 'passed');

  await popupPage.locator('#ai-generator').click();
  await appPage.waitForFunction(() => Boolean(window.__lastPreparedJob?.title), null, { timeout: 25000 });
  await popupPage.waitForFunction(() => !document.querySelector('#ai-generator')?.disabled, null, { timeout: 10000 });
  const popupPreparedJob = await appPage.evaluate(() => window.__lastPreparedJob);
  if (!/backend developer/i.test(popupPreparedJob?.title || '')) {
    throw new Error(`AI Resume did not prepare from the active job. Received: ${popupPreparedJob?.title || 'none'}`);
  }
  recordStep('popup-ai-resume', 'passed', popupPreparedJob);

  await popupPage.locator('#autofill').click();
  await jobPage.waitForFunction(() => {
    const fields = [
      document.getElementById('full-name')?.value,
      document.getElementById('email')?.value,
      document.getElementById('phone-country')?.value,
      document.getElementById('phone')?.value,
      document.getElementById('linkedin')?.value,
      document.getElementById('github')?.value,
      document.getElementById('website')?.value,
    ];
    return fields.every(Boolean);
  }, null, { timeout: 20000 });
  const popupAutofillValues = await jobPage.evaluate(() => ({
    fullName: document.getElementById('full-name')?.value,
    email: document.getElementById('email')?.value,
    phoneCountry: document.getElementById('phone-country')?.value,
    phone: document.getElementById('phone')?.value,
    linkedin: document.getElementById('linkedin')?.value,
    github: document.getElementById('github')?.value,
    website: document.getElementById('website')?.value,
  }));
  recordStep('popup-autofill', 'passed', popupAutofillValues);

  await jobPage.evaluate(() => {
    document.getElementById('full-name').value = '';
    document.getElementById('email').value = '';
    document.getElementById('phone-country').value = '';
    document.getElementById('phone').value = '';
    document.getElementById('linkedin').value = '';
    document.getElementById('github').value = '';
    document.getElementById('website').value = '';
    document.getElementById('authorization').value = '';
    document.getElementById('state-province').value = '';
    document.getElementById('state-province').dataset.selected = '';
    document.getElementById('experience').value = '';
    document.getElementById('work-setup').value = '';
    document.getElementById('gender').value = '';
    document.getElementById('race').value = '';
    document.getElementById('hispanic').value = '';
    document.querySelectorAll('input[name="immigration_support"]').forEach((entry) => {
      entry.checked = false;
    });
    document.getElementById('why-role').value = '';
    document.getElementById('cover-letter').value = '';
  });

  const aiBridgeResult = await sendRuntimeMessage(popupPage, 'GENERATE_APPLICATION_ANSWERS', {
    job: {
      title: 'Senior Backend Developer (Node.js)',
      company: 'Acme Robotics',
      location: 'Chorzow, Poland',
      description: 'Backend role focused on Node.js, TypeScript, PostgreSQL, and collaboration.',
    },
    questions: [
      {
        id: 'select:work_setup',
        label: 'Preferred Work Setup',
        kind: 'select',
        options: ['Remote', 'Hybrid', 'On-site'],
      },
      {
        id: 'radio:immigration_support',
        label: 'Would you need immigration support in the future?',
        kind: 'choice',
        options: ['Yes', 'No'],
      },
      {
        id: 'textarea:why_role',
        label: 'Why are you interested in this role?',
        kind: 'textarea',
      },
    ],
  });
  recordStep('app-bridge-ai', 'passed', aiBridgeResult);

  const launcherStartRect = await jobPage.evaluate(() => {
    const root = document.getElementById('resumeats-job-widget-host-v3')?.shadowRoot;
    const rect = root?.querySelector('.launcher')?.getBoundingClientRect();
    const snap = root?.querySelector('.dock')?.dataset.snap || '';
    return rect
      ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height, snap }
      : null;
  });

  if (!launcherStartRect) {
    throw new Error('Could not measure the injected launcher.');
  }

  await jobPage.mouse.move(
    launcherStartRect.left + launcherStartRect.width / 2,
    launcherStartRect.top + launcherStartRect.height / 2,
  );
  await jobPage.mouse.down();
  await jobPage.mouse.move(1320, 320, { steps: 12 });
  await jobPage.mouse.up();

  await jobPage.waitForFunction(() => {
    const root = document.getElementById('resumeats-job-widget-host-v3')?.shadowRoot;
    return root?.querySelector('.dock')?.dataset.snap === 'right';
  }, null, { timeout: 10000 });

  const launcherDragState = await jobPage.evaluate(() => {
    const root = document.getElementById('resumeats-job-widget-host-v3')?.shadowRoot;
    const rect = root?.querySelector('.launcher')?.getBoundingClientRect();
    return rect
      ? {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          width: rect.width,
          height: rect.height,
          snap: root?.querySelector('.dock')?.dataset.snap || '',
          clientWidth: document.documentElement.clientWidth,
          clientHeight: document.documentElement.clientHeight,
          scrollbarWidth: Math.max(0, window.innerWidth - document.documentElement.clientWidth),
        }
      : null;
  });
  if (launcherDragState?.snap === 'right' && launcherDragState.scrollbarWidth > 0) {
    if (launcherDragState.right > launcherDragState.clientWidth + 1) {
      throw new Error('Right-snapped launcher is still overlapping the page scrollbar gutter.');
    }
  }
  recordStep('widget-drag-snap', 'passed', {
    ...launcherDragState,
    screenshot: await screenshot(jobPage, 'widget-drag-snap'),
  });

  await jobPage.evaluate(() => {
    const host = document.getElementById('resumeats-job-widget-host-v3');
    host.shadowRoot.querySelector('.launcher').dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
    }));
  });

  await jobPage.waitForFunction(
    () => document.getElementById('resumeats-job-widget-host-v3')?.shadowRoot?.querySelector('.dock')?.dataset.open === 'true',
    null,
    { timeout: 10000 },
  );

  await jobPage.evaluate(() => {
    const host = document.getElementById('resumeats-job-widget-host-v3');
    host.shadowRoot.querySelector('.analyze').click();
  });

  await jobPage.waitForFunction(() => {
    const root = document.getElementById('resumeats-job-widget-host-v3')?.shadowRoot;
    if (!root) return false;
    const scoreValue = root.querySelector('.score-value')?.textContent?.trim();
    const statusText = root.querySelector('.status')?.textContent?.trim() || '';
    return (scoreValue && scoreValue !== '--') || /captured /i.test(statusText);
  }, null, { timeout: 20000 });

  const widgetState = await jobPage.evaluate(() => {
    const root = document.getElementById('resumeats-job-widget-host-v3').shadowRoot;
    return {
      title: root.querySelector('.identity-title')?.textContent?.trim(),
      headline: root.querySelector('.score-headline')?.textContent?.trim(),
      recommendation: root.querySelector('.recommendation')?.textContent?.trim(),
    };
  });
  recordStep('widget-scan', 'passed', { ...widgetState, screenshot: await screenshot(jobPage, 'widget-scanned') });

  await appPage.evaluate(() => {
    window.__lastPreparedJob = null;
  });
  await jobPage.evaluate(() => {
    const host = document.getElementById('resumeats-job-widget-host-v3');
    host.shadowRoot.querySelector('.open-ai').click();
  });
  await appPage.waitForFunction(() => Boolean(window.__lastPreparedJob?.title), null, { timeout: 25000 });
  const widgetPreparedJob = await appPage.evaluate(() => window.__lastPreparedJob);
  if (!/backend developer/i.test(widgetPreparedJob?.title || '')) {
    throw new Error(`Widget AI Resume did not prepare from the active job. Received: ${widgetPreparedJob?.title || 'none'}`);
  }
  recordStep('widget-ai-resume', 'passed', widgetPreparedJob);

  await jobPage.evaluate(() => {
    const host = document.getElementById('resumeats-job-widget-host-v3');
    host.shadowRoot.querySelector('.autofill').click();
  });

  await sleep(2500);
  const partialAutofill = await jobPage.evaluate(() => ({
    fullName: document.getElementById('full-name')?.value,
    email: document.getElementById('email')?.value,
    phone: document.getElementById('phone')?.value,
    phoneCountry: document.getElementById('phone-country')?.value,
    linkedin: document.getElementById('linkedin')?.value,
    github: document.getElementById('github')?.value,
    website: document.getElementById('website')?.value,
    authorization: document.getElementById('authorization')?.value,
    stateProvince: document.getElementById('state-province')?.dataset?.selected || document.getElementById('state-province')?.value,
    experience: document.getElementById('experience')?.value,
    workSetup: document.getElementById('work-setup')?.value,
    gender: document.getElementById('gender')?.value,
    race: document.getElementById('race')?.value,
    hispanic: document.getElementById('hispanic')?.value,
    immigrationSupport: document.querySelector('input[name="immigration_support"]:checked')?.value || '',
    radioStates: Array.from(document.querySelectorAll('input[name="immigration_support"]')).map((entry) => ({
      value: entry.value,
      checked: entry.checked,
    })),
    whyRoleLength: document.getElementById('why-role')?.value?.length || 0,
    coverLength: document.getElementById('cover-letter')?.value?.length || 0,
    widgetStatus: document.getElementById('resumeats-job-widget-host-v3')?.shadowRoot?.querySelector('.status')?.textContent?.trim() || '',
    widgetStatusTone: document.getElementById('resumeats-job-widget-host-v3')?.shadowRoot?.querySelector('.status')?.dataset?.tone || '',
    widgetProgress: document.getElementById('resumeats-job-widget-host-v3')?.shadowRoot?.querySelector('.progress-fill')?.style?.width || '',
  }));
  const aiQuestionBatch = await appPage.evaluate(() => window.__lastApplicationQuestions || []);
  recordStep('autofill-partial', 'passed', { ...partialAutofill, aiQuestionBatch });

  await jobPage.waitForFunction(() => {
    const fields = [
      document.getElementById('full-name')?.value,
      document.getElementById('email')?.value,
      document.getElementById('phone')?.value,
      document.getElementById('phone-country')?.value,
      document.getElementById('linkedin')?.value,
      document.getElementById('github')?.value,
      document.getElementById('website')?.value,
      document.getElementById('work-setup')?.value,
      document.getElementById('gender')?.value,
      document.getElementById('race')?.value,
      document.getElementById('hispanic')?.value,
      document.getElementById('state-province')?.dataset?.selected || document.getElementById('state-province')?.value,
      document.querySelector('input[name="immigration_support"]:checked')?.value,
      document.getElementById('why-role')?.value,
      document.getElementById('cover-letter')?.value,
    ];
    return fields.every(Boolean);
  }, null, { timeout: 20000 });

  const autofillValues = await jobPage.evaluate(() => ({
    fullName: document.getElementById('full-name')?.value,
    email: document.getElementById('email')?.value,
    phone: document.getElementById('phone')?.value,
    phoneCountry: document.getElementById('phone-country')?.value,
    linkedin: document.getElementById('linkedin')?.value,
    github: document.getElementById('github')?.value,
    website: document.getElementById('website')?.value,
    authorization: document.getElementById('authorization')?.value,
    stateProvince: document.getElementById('state-province')?.dataset?.selected || document.getElementById('state-province')?.value,
    experience: document.getElementById('experience')?.value,
    workSetup: document.getElementById('work-setup')?.value,
    gender: document.getElementById('gender')?.value,
    race: document.getElementById('race')?.value,
    hispanic: document.getElementById('hispanic')?.value,
    immigrationSupport: document.querySelector('input[name="immigration_support"]:checked')?.value,
    whyRole: document.getElementById('why-role')?.value || '',
    coverLetter: document.getElementById('cover-letter')?.value || '',
    whyRoleLength: document.getElementById('why-role')?.value?.length || 0,
    coverLength: document.getElementById('cover-letter')?.value?.length || 0,
  }));
  const expectedWhyRole = 'This role fits my background in Node.js, TypeScript, and PostgreSQL, and it gives me room to contribute to backend reliability while collaborating closely with product and frontend teams.';
  const expectedCoverLetter = 'I am a backend-focused engineer with strong Node.js, TypeScript, AWS, and PostgreSQL experience, and I enjoy building reliable systems that support fast-moving product teams.';
  if (autofillValues.whyRole !== expectedWhyRole) {
    throw new Error(`AI answer was not used for "Why are you interested in this role?". Received: ${autofillValues.whyRole}`);
  }
  if (autofillValues.coverLetter !== expectedCoverLetter) {
    throw new Error(`AI answer was not used for "Tell us about yourself". Received: ${autofillValues.coverLetter}`);
  }
  if (autofillValues.stateProvince !== 'Silesian') {
    throw new Error(`Custom combobox option was not selected. Received: ${autofillValues.stateProvince}`);
  }
  if (autofillValues.phoneCountry !== '+48') {
    throw new Error(`Phone country code was not selected. Received: ${autofillValues.phoneCountry}`);
  }
  if (autofillValues.gender !== 'Man') {
    throw new Error(`Gender alias was not selected. Received: ${autofillValues.gender}`);
  }
  if (autofillValues.race !== 'White') {
    throw new Error(`Race / ethnicity was not selected. Received: ${autofillValues.race}`);
  }
  if (autofillValues.hispanic !== 'No, not Hispanic or Latino') {
    throw new Error(`Hispanic / Latino answer was not selected. Received: ${autofillValues.hispanic}`);
  }
  recordStep('widget-autofill', 'passed', { ...autofillValues, screenshot: await screenshot(jobPage, 'widget-autofill') });

  const embeddedPage = await context.newPage();
  await embeddedPage.goto(iframeFixtureUrl);
  await embeddedPage.waitForLoadState('domcontentloaded');
  await embeddedPage.waitForFunction(() => Boolean(document.getElementById('resumeats-job-widget-host-v3')?.shadowRoot), null, { timeout: 20000 });
  await embeddedPage.waitForFunction(
    () => Boolean(document.querySelector('iframe[name="embedded-application"]')?.contentDocument?.body),
    null,
    { timeout: 15000 },
  );

  await embeddedPage.evaluate(() => {
    const host = document.getElementById('resumeats-job-widget-host-v3');
    host.shadowRoot.querySelector('.autofill').click();
  });

  await embeddedPage.waitForFunction(() => {
    const frameDocument = document.querySelector('iframe[name="embedded-application"]')?.contentDocument;
    return Boolean(
      frameDocument?.getElementById('embedded-full-name')?.value
      && frameDocument?.getElementById('embedded-email')?.value
      && frameDocument?.getElementById('embedded-phone')?.value
      && frameDocument?.getElementById('embedded-work-setup')?.value
      && frameDocument?.querySelector('input[name="embedded_immigration_support"]:checked')?.value
      && frameDocument?.getElementById('embedded-why-role')?.value
    );
  }, null, { timeout: 20000 });

  const embeddedAutofillValues = await embeddedPage.evaluate(() => {
    const frameDocument = document.querySelector('iframe[name="embedded-application"]')?.contentDocument;
    const root = document.getElementById('resumeats-job-widget-host-v3')?.shadowRoot;
    return {
      fullName: frameDocument?.getElementById('embedded-full-name')?.value || '',
      email: frameDocument?.getElementById('embedded-email')?.value || '',
      phone: frameDocument?.getElementById('embedded-phone')?.value || '',
      website: frameDocument?.getElementById('embedded-website')?.value || '',
      workSetup: frameDocument?.getElementById('embedded-work-setup')?.value || '',
      immigrationSupport: frameDocument?.querySelector('input[name="embedded_immigration_support"]:checked')?.value || '',
      whyRole: frameDocument?.getElementById('embedded-why-role')?.value || '',
      whyRoleLength: frameDocument?.getElementById('embedded-why-role')?.value?.length || 0,
      widgetStatus: root?.querySelector('.status')?.textContent?.trim() || '',
    };
  });
  if (embeddedAutofillValues.whyRole !== expectedWhyRole) {
    throw new Error(`AI answer was not used inside the embedded application form. Received: ${embeddedAutofillValues.whyRole}`);
  }
  recordStep('widget-autofill-iframe', 'passed', {
    ...embeddedAutofillValues,
    screenshot: await screenshot(embeddedPage, 'widget-autofill-iframe'),
  });

  await popupPage.waitForFunction(
    () => document.getElementById('latest-job')?.textContent && !/No job captured/i.test(document.getElementById('latest-job').textContent),
    null,
    { timeout: 10000 },
  );
  const popupState = await popupPage.evaluate(() => ({
    recommendedTitle: document.getElementById('recommended-title')?.textContent?.trim(),
    latestJob: document.getElementById('latest-job')?.textContent?.trim(),
    snapshotState: document.getElementById('snapshot-state')?.textContent?.trim(),
  }));
  recordStep('popup-render', 'passed', { ...popupState, screenshot: await screenshot(popupPage, 'popup') });

  await sidepanelPage.waitForFunction(
    () => document.getElementById('job-title')?.textContent && !/No analyzed job yet/i.test(document.getElementById('job-title').textContent),
    null,
    { timeout: 10000 },
  );
  const sidepanelState = await sidepanelPage.evaluate(() => ({
    nextStep: document.getElementById('next-step-title')?.textContent?.trim(),
    jobTitle: document.getElementById('job-title')?.textContent?.trim(),
    footer: document.getElementById('footer-copy')?.textContent?.trim(),
  }));
  recordStep('sidepanel-render', 'passed', { ...sidepanelState, screenshot: await screenshot(sidepanelPage, 'sidepanel') });

  await jobPage.waitForFunction(
    () => document.getElementById('resumeats-job-widget-host-v3')?.shadowRoot?.querySelector('.dock')?.dataset.open === 'false',
    null,
    { timeout: 10000 },
  );
  recordStep('widget-autocollapse', 'passed', { screenshot: await screenshot(jobPage, 'widget-autocollapse') });

  await jobPage.goto(neutralUrl);
  await jobPage.waitForLoadState('domcontentloaded');
  await jobPage.waitForFunction(
    () => {
      const root = document.getElementById('resumeats-job-widget-host-v3')?.shadowRoot;
      return Boolean(root?.querySelector('.launcher'));
    },
    null,
    { timeout: 10000 },
  );
  const neutralState = await jobPage.evaluate(() => {
    const root = document.getElementById('resumeats-job-widget-host-v3')?.shadowRoot;
    return {
      widgetStatus: root?.querySelector('.status')?.textContent?.trim() || '',
      headline: root?.querySelector('.score-headline')?.textContent?.trim() || '',
    };
  });
  recordStep('widget-neutral-state', 'passed', { ...neutralState, screenshot: await screenshot(jobPage, 'widget-neutral-page') });

  const routePagePromise = context.waitForEvent('page', { timeout: 15000 }).catch(() => null);
  await popupPage.locator('#quick-resume').click();
  let routePage = await routePagePromise;
  if (!routePage) {
    routePage = context.pages().find((page) => appUrlPattern.test(page.url())) || null;
  }
  if (!routePage) {
    throw new Error('Popup route action did not open ResumeATS.');
  }
  await routePage.waitForLoadState('domcontentloaded').catch(() => {});
  if (!new RegExp(`${appUrlPattern.source}/#/(quick-resume|ai-generator|dashboard)`, 'i').test(routePage.url())) {
    throw new Error(`Unexpected route from popup: ${routePage.url()}`);
  }
  recordStep('popup-route-open', 'passed', { url: routePage.url() });

  report.completedAt = new Date().toISOString();
  await fs.writeFile(path.join(artifactsDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`Extension QA passed. Report: ${path.join(artifactsDir, 'report.json')}`);
} catch (error) {
  recordFailure('extension-qa', error);
  report.completedAt = new Date().toISOString();
  await fs.mkdir(artifactsDir, { recursive: true });
  await fs.writeFile(path.join(artifactsDir, 'report.json'), JSON.stringify(report, null, 2));
  console.error(`Extension QA failed. Report: ${path.join(artifactsDir, 'report.json')}`);
  console.error(error);
  process.exitCode = 1;
} finally {
  await context?.close().catch(() => {});
  await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
}
