/* global chrome */

/* global console, document, window, URL, setTimeout */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
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
  const bootstrapPage = await context.newPage();
  await bootstrapPage.goto(sitesToCheck[0].url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await bootstrapPage.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await bootstrapPage.waitForFunction(() => Boolean(document.getElementById('resumeats-job-widget-host-v3')?.shadowRoot), null, { timeout: 30000 });

  const serviceWorker = await waitForExtensionWorker(context);
  await bootstrapPage.close().catch(() => {});

  const extensionId = new URL(serviceWorker.url()).host;
  report.extensionId = extensionId;

  const popupPage = await context.newPage();
  await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
  await popupPage.waitForLoadState('domcontentloaded');

  const profile = {
    integration: { appUrl },
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
    automation: { autoSubmit: false },
  };

  await sendRuntimeMessage(popupPage, 'SYNC_PROFILE', profile);

  let hadFailures = false;

  for (const target of sitesToCheck) {
    const { url, expectedTitleIncludes } = target;
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
        await page.evaluate(() => {
          const root = document.getElementById('resumeats-job-widget-host-v3')?.shadowRoot;
          root?.querySelector('.launcher')?.click();
        }).catch(() => {});

        await sleep(500);

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
