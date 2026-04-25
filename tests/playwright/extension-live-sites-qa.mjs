/* global chrome, console, document, window, URL, setTimeout */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { chromium } from 'playwright';
import { resolveBrowserConfig } from './browser-config.mjs';

const cwd = process.cwd();
const extensionArg = process.argv.find((value) => value.startsWith('--extension-path='));
const browserArg = process.argv.find((value) => value.startsWith('--browser='));
const siteFilterArg = process.argv.find((value) => value.startsWith('--site='));
const browserConfig = resolveBrowserConfig(browserArg ? browserArg.split('=')[1] : 'edge');
const extensionPath = path.resolve(cwd, extensionArg ? extensionArg.split('=')[1] : 'dist-extension');
const siteFilter = siteFilterArg ? siteFilterArg.split('=').slice(1).join('=').toLowerCase() : '';
const artifactsDir = path.join(cwd, `playwright-artifacts-extension-live-${browserConfig.id}`);
const userDataDir = path.join(artifactsDir, `user-data-${Date.now()}`);
const appUrl = 'https://resumeats.cv';

const sitesToCheck = [
  {
    url: 'https://24-mag.careers-page.com/jobs/be4383ea-7e3d-4a9d-98b3-2e622eb4a932/apply',
    expectedTitleIncludes: 'Backend Engineer Talent Network',
    verifyAutofill: true,
    verifyRecommendationAutofill: true,
    allowClosedForm: true,
  },
  {
    url: 'https://senecahq.com/wp-content/plugins/bullhorn-oscp/#/jobs/46773',
    expectedTitleIncludes: 'Backend Engineer',
  },
  {
    url: 'https://job-boards.greenhouse.io/tailscale/jobs/4653722005?gh_src=4fd1e7935us',
    expectedTitleIncludes: 'Backend Engineer, Control Plane',
  },
  {
    url: 'https://www.consensus.com/careers/jobs/?gh_jid=4669422006&gh_src=70afcd996us',
    expectedTitleIncludes: 'UI/UX Software Design Intern',
  },
  {
    url: 'https://jobs.micro1.ai/post/89732d3c-8a07-4936-b4f3-e67dd9a2f1d5?referralCode=e91c9585-63ad-45aa-9820-d63708190a83&utm_source=referral&utm_medium=share&utm_campaign=job_referral',
    expectedTitleIncludes: 'Full-stack Developer',
  },
  {
    url: 'https://devapo.traffit.com/public/form/a/1abb27e675ce80da9e56068a827bd435412f326e?source=linkedin.com',
    expectedTitleIncludes: 'React Developer',
  },
  {
    url: 'https://yohrconsultancy.hiresome.ai/apply_form/technical-lead-remote-69e5b5c64636017ceae145e5?utm_source=linkedin',
    expectedTitleIncludes: 'Technical Lead',
    verifyAutofill: true,
    minAutofillFields: 12,
    expectedFilledValues: [
      { id: 'nameid', valuePattern: /^Test Candidate$/i, label: 'name' },
      { id: 'emailid', valuePattern: /^qa-candidate@example\.com$/i, label: 'email' },
      { namePattern: /^phone$/i, valuePattern: /\+?48[\s()-]*518[\s()-]*966[\s()-]*402/i, label: 'phone number' },
      { id: 'noticePeriodid', valuePattern: /^Immediate$/i, label: 'notice period' },
      { id: 'highestDegreeid', valuePattern: /Bachelor of Science/i, label: 'highest qualification' },
    ],
  },
  {
    url: 'https://ats.rippling.com/flatiron-school/jobs/6461237c-1442-4be2-ac1e-09f65a67f446/apply?src=LinkedIn&jobBoardSlug=flatiron-school&jobId=6461237c-1442-4be2-ac1e-09f65a67f446&step=application',
    expectedTitleIncludes: 'Software Engineer Trainee Program',
    verifyAutofill: true,
    minAutofillFields: 12,
    expectedFilledValues: [
      { id: 'field-8', labelPattern: /first name/i, valuePattern: /^Test$/i, label: 'first name' },
      { id: 'field-12', labelPattern: /last name/i, valuePattern: /^Candidate$/i, label: 'last name' },
      { id: 'field-27', labelPattern: /phone number/i, valuePattern: /(\+?48\s*)?518\s*966\s*402|48518966402|518966402/i, label: 'phone number' },
      { id: 'field-38', labelPattern: /location/i, valuePattern: /New York/i, label: 'location' },
      { id: 'field-69', valuePattern: /^NY$/i, label: 'state of residence' },
      { id: 'field-76', valuePattern: /^Yes$/i, label: 'work authorization' },
      { id: 'field-82', valuePattern: /^No$/i, label: 'sponsorship' },
    ],
  },
];

const selectedSites = siteFilter
  ? sitesToCheck.filter((site) => site.url.toLowerCase().includes(siteFilter))
  : sitesToCheck;

if (selectedSites.length === 0) {
  throw new Error(`No live extension QA site matched --site=${siteFilter}`);
}

const report = {
  startedAt: new Date().toISOString(),
  extensionPath,
  appUrl,
  browser: browserConfig,
  sites: [],
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const slugify = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
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

const collectWidgetState = async (page) => (
  page.evaluate(() => {
    const host = document.getElementById('resumeats-job-widget-host-v3');
    const root = host?.shadowRoot;
    if (!root) {
      return { injected: false };
    }

    const dock = root.querySelector('.dock');
    const launcher = root.querySelector('.launcher');
    const rect = launcher?.getBoundingClientRect();

    return {
      injected: true,
      status: root.querySelector('.status')?.textContent?.trim() || '',
      headline: root.querySelector('.score-headline')?.textContent?.trim() || '',
      identityTitle: root.querySelector('.identity-title')?.textContent?.trim() || '',
      identityMeta: root.querySelector('.identity-meta')?.textContent?.trim() || '',
      recommendation: root.querySelector('.recommendation')?.textContent?.trim() || '',
      snap: dock?.dataset.snap || '',
      open: dock?.dataset.open || '',
      launcher: rect
        ? {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
          }
        : null,
      viewport: {
        clientWidth: document.documentElement.clientWidth,
        clientHeight: document.documentElement.clientHeight,
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
      },
    };
  })
);

const collectFilledFieldSignals = async (page) => (
  page.evaluate(() => {
    const genericValuePattern = /^(select|select\.{3}|choose|choose\.{3}|search|loading|optional|required)$/i;
    const getControlValue = (el) => {
      if (el.tagName === 'SELECT') {
        return el.selectedOptions?.[0]?.textContent?.trim() || el.value || '';
      }
      return el.value || el.textContent?.trim() || el.getAttribute('aria-label') || '';
    };
    const getControlLabel = (el) => {
      const parts = [];
      if (el.id) {
        const escapedId = window.CSS?.escape ? window.CSS.escape(el.id) : el.id.replace(/"/g, '\\"');
        const linkedLabel = document.querySelector(`label[for="${escapedId}"]`);
        if (linkedLabel?.textContent) parts.push(linkedLabel.textContent);
      }
      if (el.closest('label')?.textContent) parts.push(el.closest('label').textContent);
      if (el.getAttribute('aria-label')) parts.push(el.getAttribute('aria-label'));
      if (el.getAttribute('placeholder')) parts.push(el.getAttribute('placeholder'));
      let cursor = el;
      for (let depth = 0; depth < 3 && cursor; depth += 1) {
        if (cursor.previousElementSibling?.textContent) parts.push(cursor.previousElementSibling.textContent);
        cursor = cursor.parentElement;
      }
      return parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 320);
    };
    const toSignal = (el) => {
      const value = getControlValue(el).replace(/\s+/g, ' ').trim();
      return {
        tag: el.tagName,
        type: el.getAttribute('type'),
        name: el.getAttribute('name'),
        id: el.id,
        role: el.getAttribute('role') || '',
        value,
        label: getControlLabel(el),
        checked: Boolean(el.checked),
        placeholder: el.getAttribute('placeholder') || '',
      };
    };
    const isFilledSignal = (entry) => (
      entry.value
      && entry.type !== 'checkbox'
      && entry.type !== 'file'
      && entry.type !== 'hidden'
      && (entry.type !== 'radio' || entry.checked)
      && !genericValuePattern.test(entry.value)
    );

    const topFields = Array.from(document.querySelectorAll('input, textarea, select, [role="combobox"], [aria-haspopup="listbox"], button[class*="select"], button[class*="dropdown"]'))
      .map(toSignal)
      .filter(isFilledSignal);

    const shadowFields = [];
    const walk = (root) => {
      for (const el of root.querySelectorAll('*')) {
        if (!el.shadowRoot) continue;
        for (const field of el.shadowRoot.querySelectorAll('input, textarea, select, [role="combobox"], [aria-haspopup="listbox"], button[class*="select"], button[class*="dropdown"]')) {
          const signal = toSignal(field);
          if (isFilledSignal(signal)) {
            shadowFields.push(signal);
          }
        }
        walk(el.shadowRoot);
      }
    };
    walk(document);

    return {
      topFields,
      shadowFields,
      totalFilled: topFields.length + shadowFields.length,
    };
  })
);

const waitForAutofillToSettle = async (page, { timeoutMs = 60000 } = {}) => {
  await page.waitForFunction(
    () => {
      const host = document.getElementById('resumeats-job-widget-host-v3');
      const root = host?.shadowRoot;
      const status = root?.querySelector('.status')?.textContent?.trim() || '';
      const finished = /autofilled \d+ fields|prepared .* autofilled \d+ fields|no fillable fields|closed by the employer/i.test(status);
      const busy = /preparing|uploading|downloading|generating|analyzing|autofill/i.test(status)
        && !finished;

      if (busy) {
        window.__resumeatsQaSawAutofillBusy = true;
      }

      return finished;
    },
    { timeout: timeoutMs }
  ).catch(() => {});
};

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
          fullName: 'Test Candidate',
          email: 'qa-candidate@example.com',
          phoneNumber: '+48 518 966 402',
          linkedin: 'https://linkedin.com/in/test-candidate',
          github: 'https://github.com/test-candidate',
          portfolio: 'https://example.com',
          website: 'https://example.com',
          currentTitle: 'Senior Backend Developer',
          currentCompany: 'ResumeATS',
        },
        personal: {
          fullName: 'Test Candidate',
          email: 'qa-candidate@example.com',
          phone: '+48 518 966 402',
          location: 'New York, United States',
        },
        personalInfo: {
          fullName: 'Test Candidate',
          email: 'qa-candidate@example.com',
          phone: '+48 518 966 402',
          location: 'New York, United States',
        },
        skills: ['Node.js', 'TypeScript', 'React', 'AWS', 'PostgreSQL'],
        answers: {
          linkedinUrl: 'https://linkedin.com/in/giorgi-kemoklidze',
          githubUrl: 'https://github.com/GiorgiKemo',
          portfolioUrl: 'https://example.com',
          websiteUrl: 'https://example.com',
          currentCompany: 'ResumeATS',
          currentTitle: 'Senior Backend Developer',
          city: 'New York',
          stateProvince: 'New York',
          state: 'New York',
          country: 'United States',
          phoneCountryCode: '+48',
          countryCallingCode: '+48',
          isAdult: 'Yes',
          ageOver18: 'Yes',
          workAuthorization: 'Yes',
          requiresSponsorship: 'No',
          yearsOfExperience: '5+',
          preferredWorkSetup: 'Remote',
          noticePeriod: 'Immediate',
          salaryCurrent: '120000',
          salaryExpectation: '150000',
          highestEducation: 'Bachelor of Science',
          pronouns: 'Prefer not to answer',
          gender: 'Prefer not to answer',
          raceEthnicity: 'Prefer not to answer',
          hispanicLatino: 'No',
          veteranStatus: 'No',
          disabilityStatus: 'No',
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
          payload = {
            answers: questions.map((question) => {
              const label = String(question.label || '').toLowerCase();
              let answer = '';

              if (label.includes('why')) {
                answer = 'This role is a strong fit for my backend engineering background and my interest in reliable TypeScript systems.';
              } else if (label.includes('about')) {
                answer = 'I am a backend-focused engineer with strong Node.js, TypeScript, AWS, and PostgreSQL experience.';
              } else if (label.includes('18') || label.includes('age or older')) {
                answer = 'Yes';
              } else if (label.includes('state')) {
                answer = 'New York';
              } else if (label.includes('authorized')) {
                answer = 'Yes';
              } else if (label.includes('work setup') || label.includes('remote')) {
                answer = 'Remote';
              } else if (label.includes('sponsorship') || label.includes('immigration')) {
                answer = 'No';
              } else if (label.includes('pronoun') || label.includes('gender') || label.includes('race') || label.includes('veteran') || label.includes('disability')) {
                answer = 'Prefer not to answer';
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

await fs.mkdir(artifactsDir, { recursive: true });
await fs.mkdir(userDataDir, { recursive: true });

const launchOptions = {
  headless: false,
  viewport: { width: 1440, height: 960 },
  ignoreHTTPSErrors: true,
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

const context = await chromium.launchPersistentContext(userDataDir, launchOptions);

try {
  await context.route('https://resumeats.cv/resume.pdf', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/pdf',
      body: Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Contents 4 0 R>>endobj\n4 0 obj<</Length 44>>stream\nBT /F1 12 Tf 36 120 Td (ResumeATS QA PDF) Tj ET\nendstream\nendobj\ntrailer<</Root 1 0 R>>\n%%EOF'),
    });
  });
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

  const bootstrapPage = await context.newPage();
  await bootstrapPage.goto(selectedSites[0].url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await bootstrapPage.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await bootstrapPage.waitForFunction(() => Boolean(document.getElementById('resumeats-job-widget-host-v3')?.shadowRoot), null, { timeout: 30000 });

  const serviceWorker = await waitForExtensionWorker(context);
  await bootstrapPage.close().catch(() => {});

  const extensionId = new URL(serviceWorker.url()).host;
  report.extensionId = extensionId;

  const appPage = await context.newPage();
  await appPage.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await appPage.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});

  const popupPage = await context.newPage();
  await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
  await popupPage.waitForLoadState('domcontentloaded');
  await popupPage.locator('#sync-profile').click();
  let synced = false;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const state = await sendRuntimeMessage(popupPage, 'GET_STATE');
    if (state?.hasProfile) {
      synced = true;
      break;
    }
    await sleep(1000);
  }
  if (!synced) {
    throw new Error('Live-site QA could not sync the ResumeATS profile into the extension.');
  }

  let hadFailures = false;

  for (const target of selectedSites) {
    const {
      url,
      expectedTitleIncludes,
      verifyAutofill,
      verifyRecommendationAutofill,
      allowClosedForm = false,
      minAutofillFields = 3,
      expectedFilledValues = [],
    } = target;
    const site = {
      url,
      checkedAt: new Date().toISOString(),
      expectedTitleIncludes,
    };

    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
      await sleep(3500);

      site.finalUrl = page.url();
      site.title = await page.title().catch(() => '');

      const host = new URL(page.url()).hostname || new URL(url).hostname;
      const shot = path.join(artifactsDir, `${slugify(host)}.png`);
      await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
      site.screenshot = shot;

      site.beforeAnalyze = await collectWidgetState(page);
      site.assertions = [];

      if (!site.beforeAnalyze.injected) {
        site.assertions.push({
          ok: false,
          check: 'widget-injected',
          message: 'Widget did not mount on the page.',
        });
        hadFailures = true;
      }

      if (site.beforeAnalyze.injected) {
        if (verifyAutofill || verifyRecommendationAutofill) {
          site.debugFormDiscovery = await sendRuntimeMessage(popupPage, 'DEBUG_ACTIVE_TAB_FORM_DISCOVERY').catch((error) => ({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          }));
        }

        await page.evaluate(() => {
          const root = document.getElementById('resumeats-job-widget-host-v3')?.shadowRoot;
          root?.querySelector('.launcher')?.click();
        }).catch(() => {});

        await sleep(500);

        if (verifyRecommendationAutofill) {
          await page.evaluate(() => {
            const root = document.getElementById('resumeats-job-widget-host-v3')?.shadowRoot;
            root?.querySelector('.recommendation')?.click();
          }).catch(() => {});

          await page.waitForTimeout(900);
          await waitForAutofillToSettle(page);
          site.recommendationWidgetState = await collectWidgetState(page);
          site.recommendationAutofill = {
            urlAfterClick: page.url(),
            ...await collectFilledFieldSignals(page),
          };
          const recommendationStayedOnPage = site.recommendationAutofill.urlAfterClick === site.finalUrl;
          const recommendationFilled = (site.recommendationAutofill.totalFilled || 0) >= 3;
          const recommendationClosedForm = allowClosedForm
            && /closed by the employer|no fillable fields|waiting for visible fields|application questions/i.test(site.recommendationWidgetState?.status || '');
          site.assertions.push({
            ok: recommendationStayedOnPage && (recommendationFilled || recommendationClosedForm),
            check: 'recommendation-autofill-live',
            message: recommendationStayedOnPage && recommendationFilled
              ? `Recommendation action stayed on the application page and filled ${site.recommendationAutofill.totalFilled} field(s).`
              : recommendationStayedOnPage && recommendationClosedForm
                ? `Recommendation action correctly reported that the external form is unavailable: "${site.recommendationWidgetState.status}".`
                : `Recommendation action failed. stayedOnPage=${recommendationStayedOnPage}, filled=${site.recommendationAutofill.totalFilled || 0}.`,
          });
          if (!recommendationStayedOnPage || (!recommendationFilled && !recommendationClosedForm)) {
            hadFailures = true;
          }
        }

        await page.evaluate(() => {
          const root = document.getElementById('resumeats-job-widget-host-v3')?.shadowRoot;
          root?.querySelector('.analyze')?.click();
        }).catch(() => {});

        await sleep(4500);

        site.afterAnalyze = await collectWidgetState(page);
        const extractedTitle = site.afterAnalyze?.identityTitle || '';
        const titleMatched = extractedTitle.toLowerCase().includes(expectedTitleIncludes.toLowerCase());
        site.assertions.push({
          ok: titleMatched,
          check: 'title-extraction',
          message: titleMatched
            ? `Extracted title matched "${expectedTitleIncludes}".`
            : `Expected extracted title to include "${expectedTitleIncludes}", got "${extractedTitle || 'nothing'}".`,
        });
        if (!titleMatched) {
          hadFailures = true;
        }

        if (verifyAutofill) {
          await page.evaluate(() => {
            const root = document.getElementById('resumeats-job-widget-host-v3')?.shadowRoot;
            root?.querySelector('.autofill')?.click();
          }).catch(() => {});

          await page.waitForTimeout(900);
          await waitForAutofillToSettle(page);
          site.autofillWidgetState = await collectWidgetState(page);
          site.autofill = await collectFilledFieldSignals(page);
          const autofillMatched = (site.autofill?.totalFilled || 0) >= minAutofillFields;
          const autofillClosedForm = allowClosedForm
            && /closed by the employer|no fillable fields|waiting for visible fields|application questions/i.test(site.autofillWidgetState?.status || '');
          if (!autofillMatched && host.includes('24-mag')) {
            await page.bringToFront().catch(() => {});
            const prepared = await sendRuntimeMessage(popupPage, 'PREPARE_ACTIVE_TAB_AUTOFILL').catch((error) => ({
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            }));
            const directMainWorld = prepared?.ok
              ? await sendRuntimeMessage(popupPage, 'RUN_MAIN_WORLD_ACTIVE_TAB_AUTOFILL', { profile: prepared.profile }).catch((error) => ({
                ok: false,
                error: error instanceof Error ? error.message : String(error),
              }))
              : prepared;
            await page.waitForTimeout(1000);
            site.directMainWorldAutofill = {
              prepared,
              directMainWorld,
              filledSignals: await collectFilledFieldSignals(page),
            };
          }
          site.assertions.push({
            ok: autofillMatched || autofillClosedForm,
            check: 'autofill-live',
            message: autofillMatched
              ? `Autofill populated ${site.autofill.totalFilled} field(s) on the live page.`
              : autofillClosedForm
                ? `Autofill correctly reported that the external form is unavailable: "${site.autofillWidgetState.status}".`
                : `Expected live autofill to populate at least ${minAutofillFields} fields, got ${site.autofill?.totalFilled || 0}.`,
          });
          if (!autofillMatched && !autofillClosedForm) {
            hadFailures = true;
          }

          if (autofillClosedForm) {
            continue;
          }

          const filledSignals = [
            ...(site.autofill?.topFields || []),
            ...(site.autofill?.shadowFields || []),
          ];
          for (const expected of expectedFilledValues) {
            const matchingSignals = filledSignals.filter((entry) => (
              (expected.id && entry.id === expected.id)
              || (expected.labelPattern && expected.labelPattern.test(`${entry.label || ''} ${entry.placeholder || ''}`))
              || (expected.namePattern && expected.namePattern.test(`${entry.name || ''}`))
            ));
            const signal = matchingSignals.find((entry) => expected.valuePattern.test(`${entry.value || ''}`))
              || matchingSignals[0];
            const matched = Boolean(signal && expected.valuePattern.test(`${signal.value || ''}`));
            site.assertions.push({
              ok: matched,
              check: `autofill-${expected.label}`,
              message: matched
                ? `Autofill set ${expected.label} to "${signal.value}".`
                : `Expected ${expected.label} to match ${expected.valuePattern}, got "${signal?.value || 'missing'}".`,
            });
            if (!matched) {
              hadFailures = true;
            }
          }
        }
      }
    } catch (error) {
      site.error = error instanceof Error ? error.message : String(error);
      hadFailures = true;
    } finally {
      report.sites.push(site);
      await page.close().catch(() => {});
    }
  }

  report.completedAt = new Date().toISOString();
  await fs.writeFile(path.join(artifactsDir, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify(report, null, 2));
  if (hadFailures) {
    process.exitCode = 1;
  }
} finally {
  await context.close().catch(() => {});
  await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
}
