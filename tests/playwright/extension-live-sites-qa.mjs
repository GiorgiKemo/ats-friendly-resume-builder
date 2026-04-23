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
const browserConfig = resolveBrowserConfig(browserArg ? browserArg.split('=')[1] : 'edge');
const extensionPath = path.resolve(cwd, extensionArg ? extensionArg.split('=')[1] : 'dist-extension');
const artifactsDir = path.join(cwd, `playwright-artifacts-extension-live-${browserConfig.id}`);
const userDataDir = path.join(artifactsDir, 'user-data');
const appUrl = 'https://resumeats.cv';

const sitesToCheck = [
  {
    url: 'https://24-mag.careers-page.com/jobs/be4383ea-7e3d-4a9d-98b3-2e622eb4a932/apply',
    expectedTitleIncludes: 'Backend Engineer Talent Network',
    verifyAutofill: true,
    verifyRecommendationAutofill: true,
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
    url: 'https://jobs.micro1.ai/post/89732d3c-8a07-4936-b4f3-e67dd9a2f1d5?referralCode=e91c9585-63ad-45aa-9820-d63708190a83&utm_source=referral&utm_medium=share&utm_campaign=job_referral',
    expectedTitleIncludes: 'Full-stack Developer',
  },
  {
    url: 'https://devapo.traffit.com/public/form/a/1abb27e675ce80da9e56068a827bd435412f326e?source=linkedin.com',
    expectedTitleIncludes: 'React Developer',
  },
];

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
    const topFields = Array.from(document.querySelectorAll('input, textarea, select'))
      .map((el) => ({
        tag: el.tagName,
        type: el.getAttribute('type'),
        name: el.getAttribute('name'),
        id: el.id,
        value: el.value || '',
        placeholder: el.getAttribute('placeholder') || '',
      }))
      .filter((entry) => entry.value && entry.type !== 'checkbox' && entry.type !== 'file');

    const shadowFields = [];
    const walk = (root) => {
      for (const el of root.querySelectorAll('*')) {
        if (!el.shadowRoot) continue;
        for (const field of el.shadowRoot.querySelectorAll('input, textarea, select')) {
          const value = field.value || '';
          if (!value || field.type === 'checkbox' || field.type === 'file') continue;
          shadowFields.push({
            tag: field.tagName,
            type: field.getAttribute('type'),
            name: field.getAttribute('name'),
            id: field.id,
            value,
            placeholder: field.getAttribute('placeholder') || '',
          });
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
              } else if (label.includes('work setup') || label.includes('remote')) {
                answer = 'Remote';
              } else if (label.includes('sponsorship') || label.includes('immigration')) {
                answer = 'No';
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

await fs.rm(artifactsDir, { recursive: true, force: true });
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
  await bootstrapPage.goto(sitesToCheck[0].url, { waitUntil: 'domcontentloaded', timeout: 90000 });
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

  for (const target of sitesToCheck) {
      const { url, expectedTitleIncludes, verifyAutofill, verifyRecommendationAutofill } = target;
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

          await page.waitForTimeout(7000);
          site.recommendationWidgetState = await collectWidgetState(page);
          site.recommendationAutofill = {
            urlAfterClick: page.url(),
            ...await collectFilledFieldSignals(page),
          };
          const recommendationStayedOnPage = site.recommendationAutofill.urlAfterClick === site.finalUrl;
          const recommendationFilled = (site.recommendationAutofill.totalFilled || 0) >= 3;
          site.assertions.push({
            ok: recommendationStayedOnPage && recommendationFilled,
            check: 'recommendation-autofill-live',
            message: recommendationStayedOnPage && recommendationFilled
              ? `Recommendation action stayed on the application page and filled ${site.recommendationAutofill.totalFilled} field(s).`
              : `Recommendation action failed. stayedOnPage=${recommendationStayedOnPage}, filled=${site.recommendationAutofill.totalFilled || 0}.`,
          });
          if (!recommendationStayedOnPage || !recommendationFilled) {
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

          await page.waitForTimeout(7000);
          site.autofillWidgetState = await collectWidgetState(page);
          site.autofill = await collectFilledFieldSignals(page);
          const autofillMatched = (site.autofill?.totalFilled || 0) >= 3;
          site.assertions.push({
            ok: autofillMatched,
            check: 'autofill-live',
            message: autofillMatched
              ? `Autofill populated ${site.autofill.totalFilled} field(s) on the live page.`
              : `Expected live autofill to populate at least 3 fields, got ${site.autofill?.totalFilled || 0}.`,
          });
          if (!autofillMatched) {
            hadFailures = true;
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
}
