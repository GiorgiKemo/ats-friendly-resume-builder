/* global document, window */
import assert from 'node:assert/strict';
import console from 'node:console';
import { setTimeout } from 'node:timers/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { URL } from 'node:url';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';
import { createQaServer, QA_EMAIL, QA_PASSWORD, QA_RESUME_ID, QA_USER_ID } from '../fixtures/qa-server.mjs';
import { isAllowedQaRequest, localFixtureEnvironment } from './qa-safety.mjs';

// Runs a real application against disposable HTTP fixtures. The transport, React
// state and UI are real; auth/RLS, AI, email and billing are not verified here.
const artifactsDir = path.resolve(process.env.PLAYWRIGHT_ARTIFACTS_DIR || 'playwright-artifacts-fixtures');
const aiOnly = process.argv.includes('--ai-only');
const aiFreeOnly = process.argv.includes('--ai-free-only');
const aiSuite = aiOnly || aiFreeOnly;
const mobileMenuOnly = process.argv.includes('--mobile-menu-only');
const pricingOnly = process.argv.includes('--pricing-only');
const heroOnly = process.argv.includes('--hero-only');
const profileOnly = process.argv.includes('--profile-only');
const resumeVisualOnly = process.argv.includes('--resume-visual-only');
const weakPasswordOnly = process.argv.includes('--weak-password-only');
const { server: fixtureServer, state } = createQaServer({ premium: aiOnly, aiReview: aiOnly });
const report = { steps: [], failures: [], pageErrors: [], consoleMessages: [], expectedEnvironmentWarnings: [], blockedRequests: [] };
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
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_BROWSER_CHANNEL ? { channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL } : {}),
    args: heroOnly ? ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true, serviceWorkers: 'block' });
  await context.route('**/*', (route) => {
    if (isAllowedQaRequest(route.request().url(), [appUrl, fixtureUrl])) return route.continue();
    report.blockedRequests.push({ url: route.request().url(), method: route.request().method() });
    return route.abort('blockedbyclient');
  });
  if (weakPasswordOnly) {
    await context.route(`${fixtureUrl}/auth/v1/token*`, async (route) => {
      if (new URL(route.request().url()).searchParams.get('grant_type') !== 'password') return route.continue();
      const response = await route.fetch();
      const body = await response.json();
      await route.fulfill({
        response,
        json: { ...body, weak_password: { message: 'Password no longer meets current requirements.', reasons: ['length'] } },
      });
    });
  }
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => report.pageErrors.push(error.message));
  page.on('console', message => {
    if (!['warning', 'error'].includes(message.type())) return;
    const issue = { type: message.type(), text: message.text(), url: page.url() };
    const knownTestDiagnostics = heroOnly && message.type() === 'warning' && (
      message.text().startsWith('You have Reduced Motion enabled on your device.') ||
      message.text() === 'THREE.WebGLRenderer: KHR_parallel_shader_compile extension not supported.'
    );
    (knownTestDiagnostics ? report.expectedEnvironmentWarnings : report.consoleMessages).push(issue);
  });
  const visit = async (route) => {
    // The first Vite transform can outlive the browser load event on a cold
    // fixture server. DOM readiness is the contract this suite exercises;
    // waiting for every load listener makes the first protected-route check
    // intermittently fail on an otherwise healthy app.
    await page.goto(`${appUrl}${route}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.locator('main').waitFor({ state: 'visible' });
  };
  const inspectConsentOverlay = (notice) => notice.evaluate((element) => {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const main = document.querySelector('main');
    const mainTop = main?.getBoundingClientRect().top ?? null;
    const previousDisplay = element.style.display;
    element.style.display = 'none';
    const mainTopWithoutNotice = main?.getBoundingClientRect().top ?? null;
    element.style.display = previousDisplay;
    return {
      position: style.position,
      zIndex: style.zIndex,
      bottomGap: window.innerHeight - rect.bottom,
      mainTop,
      mainTopWithoutNotice,
    };
  });
  const step = async (name, run) => {
    if (weakPasswordOnly && !['protected-route-redirect', 'sign-in'].includes(name)) return;
    if (heroOnly && !['protected-route-redirect', 'hero-scene-interaction-and-motion'].includes(name)) return;
    if (!heroOnly && name === 'hero-scene-interaction-and-motion') return;
    if (mobileMenuOnly && !['protected-route-redirect', 'mobile-menu-consent-visibility'].includes(name)) return;
    if (pricingOnly && !['protected-route-redirect', 'pricing-plan-intent'].includes(name)) return;
    if (profileOnly && !['protected-route-redirect', 'sign-in', 'profile-save-reload', 'reusable-answers-save-reload'].includes(name)) return;
    if (resumeVisualOnly && !['protected-route-redirect', 'sign-in', 'resume-creation-visual-journey'].includes(name)) return;
    if (process.argv.includes('--applications-only') && !['protected-route-redirect', 'sign-in'].includes(name) && !name.startsWith('application-')) return;
    if (process.argv.includes('--campaign-only') && !['protected-route-redirect', 'sign-in', 'profile-save-reload', 'reusable-answers-save-reload', 'campaign-controls-and-consent'].includes(name)) return;
    if (!aiSuite && name.startsWith('ai-generator-')) return;
    if (aiOnly && !['protected-route-redirect', 'sign-in', 'ai-generator-runtime'].includes(name)) return;
    if (aiFreeOnly && !['protected-route-redirect', 'sign-in', 'ai-generator-free-gate'].includes(name)) return;
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
  await step('pricing-plan-intent', async () => {
    await visit('/pricing?plan=premium_yearly');
    const yearlyPlan = page.getByRole('radio', { name: /Yearly/i });
    await yearlyPlan.waitFor({ state: 'visible' });
    assert.equal(await yearlyPlan.getAttribute('aria-checked'), 'true', 'Pricing return links should restore the selected billing period');
    await visit('/pricing');
    await page.waitForTimeout(800);
    const desktopConsentLayout = await inspectConsentOverlay(page.locator('.analytics-consent-notice'));
    assert.equal(desktopConsentLayout.position, 'fixed', 'The first-visit consent notice should be fixed to the viewport');
    assert.equal(desktopConsentLayout.zIndex, '2147483647', 'The first-visit consent notice should sit above page content');
    assert.ok(Math.abs(desktopConsentLayout.bottomGap - 12) <= 1, `The consent notice should sit just above the desktop viewport bottom: ${JSON.stringify(desktopConsentLayout)}`);
    assert.ok(Math.abs(desktopConsentLayout.mainTop - desktopConsentLayout.mainTopWithoutNotice) <= 0.5,
      'Showing the consent notice must not move desktop page content');
    await page.screenshot({ path: path.join(artifactsDir, 'pricing-01-monthly-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    const mobilePricingLayout = await page.evaluate(() => {
      const consent = document.querySelector('.analytics-consent-notice > aside');
      const premiumHeading = [...document.querySelectorAll('h2')].find((heading) => heading.textContent.trim() === 'Premium AI+');
      const freePlanCta = document.querySelector('a[href="/signup?plan=free"]');
      const consentNotice = document.querySelector('.analytics-consent-notice');
      return {
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        consentHeight: consent?.getBoundingClientRect().height ?? null,
        freePlanCtaBottom: freePlanCta?.getBoundingClientRect().bottom ?? null,
        consentTop: consentNotice?.getBoundingClientRect().top ?? null,
        premiumHeadingTop: premiumHeading?.getBoundingClientRect().top ?? null,
        premiumHeadingBottom: premiumHeading?.getBoundingClientRect().bottom ?? null,
      };
    });
    assert.equal(mobilePricingLayout.documentWidth, mobilePricingLayout.viewportWidth, 'Mobile pricing should not overflow horizontally');
    assert.ok(mobilePricingLayout.consentHeight <= 160, `Mobile consent should remain compact and readable: ${JSON.stringify(mobilePricingLayout)}`);
    assert.ok(mobilePricingLayout.freePlanCtaBottom <= mobilePricingLayout.consentTop,
      `The Free plan sign-up CTA should remain visible above the first-visit consent panel: ${JSON.stringify(mobilePricingLayout)}`);
    assert.ok(mobilePricingLayout.premiumHeadingTop >= 0 && mobilePricingLayout.premiumHeadingBottom <= 844,
      `The recommended Premium plan heading should be fully visible in the first mobile viewport: ${JSON.stringify(mobilePricingLayout)}`);
    assert.ok(mobilePricingLayout.premiumHeadingBottom <= mobilePricingLayout.consentTop,
      `The consent panel should not cover the Premium plan heading on mobile: ${JSON.stringify(mobilePricingLayout)}`);
    assert.ok(mobilePricingLayout.consentTop - mobilePricingLayout.premiumHeadingBottom >= 8,
      `The Premium plan heading should have at least 8px clearance above the consent panel: ${JSON.stringify(mobilePricingLayout)}`);
    const mobileConsentLayout = await inspectConsentOverlay(page.locator('.analytics-consent-notice'));
    assert.equal(mobileConsentLayout.position, 'fixed', 'The consent notice should remain fixed on mobile');
    assert.equal(mobileConsentLayout.zIndex, '2147483647', 'The mobile consent notice should sit above page content');
    assert.ok(Math.abs(mobileConsentLayout.mainTop - mobileConsentLayout.mainTopWithoutNotice) <= 0.5,
      'Showing the consent notice must not move mobile page content');
    await page.screenshot({ path: path.join(artifactsDir, 'pricing-mobile-first-fold.png') });
    const mobileFreeFeatures = page.locator('#free-plan-features-mobile');
    assert.equal(await mobileFreeFeatures.count(), 1, 'The compact Free plan should retain a mobile disclosure for every feature');
    const mobileFreeFeaturesSummary = mobileFreeFeatures.locator('summary');
    await mobileFreeFeaturesSummary.focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('#free-plan-features-mobile')?.open === true);
    await mobileFreeFeatures.getByText(/Fundamental Styling Tools/).waitFor({ state: 'visible' });
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('#free-plan-features-mobile')?.open === false);
    await page.setViewportSize({ width: 375, height: 667 });
    await page.evaluate(() => window.scrollTo(0, 0));
    const shortViewportCta = await page.evaluate(() => {
      const cta = document.querySelector('a[href="/signup?plan=free"]')?.getBoundingClientRect();
      const consent = document.querySelector('.analytics-consent-notice')?.getBoundingClientRect();
      return { ctaBottom: cta?.bottom ?? null, consentTop: consent?.top ?? null };
    });
    assert.ok(shortViewportCta.ctaBottom <= shortViewportCta.consentTop,
      `The Free plan sign-up CTA should remain visible above consent on a short mobile screen: ${JSON.stringify(shortViewportCta)}`);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(250);
    const hiddenFocusableControls = await page.locator('main a[href], main button, main input, main select, main textarea').evaluateAll((elements) => elements
      .filter((element) => {
        let node = element;
        while (node) {
          const styles = window.getComputedStyle(node);
          if (styles.opacity === '0' || styles.visibility === 'hidden' || styles.display === 'none') return true;
          node = node.parentElement;
        }
        return false;
      })
      .map((element) => element.textContent?.trim() || element.getAttribute('aria-label') || element.getAttribute('name') || element.tagName)
      .filter(Boolean));
    assert.deepEqual(hiddenFocusableControls, [], 'Pricing controls must not remain focusable while visually hidden');
    await page.getByRole('radio', { name: /Yearly/i }).click();
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(artifactsDir, 'pricing-02-yearly-desktop.png'), fullPage: true });
    await page.getByRole('link', { name: 'Sign Up for Premium Yearly', exact: true }).click();
    await page.waitForURL(/\/signup\?plan=premium_yearly$/);
    await page.getByRole('complementary', { name: 'Selected plan' }).waitFor({ state: 'visible' });
    await page.getByText('Premium AI+ — Yearly', { exact: true }).waitFor({ state: 'visible' });
    await page.waitForTimeout(650);
    await page.waitForFunction(() => {
      const prompt = [...document.querySelectorAll('p')].find((element) => element.textContent.includes('Already have an account?'));
      return prompt && window.getComputedStyle(prompt.parentElement).opacity === '1';
    });
    await page.screenshot({ path: path.join(artifactsDir, 'pricing-03-signup-desktop.png'), fullPage: true });
    await page.screenshot({ path: path.join(artifactsDir, 'pricing-04-signup-desktop-viewport.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(artifactsDir, 'pricing-05-signup-mobile.png'), fullPage: true });
    await visit('/signup');
    await page.waitForFunction(() => {
      const prompt = [...document.querySelectorAll('p')].find((element) => element.textContent.includes('Already have an account?'));
      return prompt && window.getComputedStyle(prompt.parentElement).opacity === '1';
    });
    const freeSignupButton = page.getByRole('button', { name: 'Sign Up', exact: true });
    for (const width of [320, 360, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(() => window.scrollTo(0, 0));
      const buttonBox = await freeSignupButton.boundingBox();
      assert.ok(buttonBox, `The ${width}px mobile signup button should have a measurable layout box`);
      assert.ok(buttonBox.y >= 0 && buttonBox.y + buttonBox.height <= 836,
        `The free first-visit signup action should fit with a safe gap at ${width}px: ${JSON.stringify(buttonBox)}`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(artifactsDir, 'pricing-05b-free-signup-first-fold.png') });
    await page.setViewportSize({ width: 1440, height: 1000 });
    const signupButton = page.getByRole('button', { name: 'Sign Up', exact: true });
    await signupButton.scrollIntoViewIfNeeded();
    const consentCard = page.locator('.analytics-consent-notice > aside');
    const [consentBox, signupButtonBox] = await Promise.all([consentCard.boundingBox(), signupButton.boundingBox()]);
    assert.ok(consentBox && signupButtonBox, 'The consent choice and signup button should both have measurable layout boxes');
    const overlaps = (first, second) => first.x < second.x + second.width
      && first.x + first.width > second.x
      && first.y < second.y + second.height
      && first.y + first.height > second.y;
    assert.equal(overlaps(consentBox, signupButtonBox), false, 'The first-visit consent choice must not cover the account-creation button');

    await page.getByRole('textbox', { name: 'Email', exact: true }).fill('pricing-audit@example.test');
    const passwordField = page.locator('#password-desktop');
    const confirmPasswordField = page.locator('#confirmPassword-desktop');
    assert.match(await passwordField.evaluate((element) => element.labels?.[0]?.textContent.trim() || ''), /^Password\s*\*/,
      'The password control should keep its visible, programmatic label');
    assert.match(await confirmPasswordField.evaluate((element) => element.labels?.[0]?.textContent.trim() || ''), /^Confirm Password\s*\*/,
      'The confirmation control should keep its visible, programmatic label');
    assert.equal(await passwordField.evaluate((element) => element.minLength), 8, 'Native signup validation should enforce the configured minimum');
    assert.equal(await confirmPasswordField.evaluate((element) => element.minLength), 8, 'Password confirmation should share the configured minimum');
    await passwordField.fill('12345');
    await confirmPasswordField.fill('12345');
    await page.getByRole('button', { name: 'Sign Up', exact: true }).click();
    assert.equal(await passwordField.evaluate((element) => element.validity.tooShort), true, 'The browser must reject short password values before submission');
    assert.equal(await confirmPasswordField.evaluate((element) => element.validity.tooShort), true, 'The browser must reject short confirmation values before submission');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(artifactsDir, 'pricing-06-password-minimum-desktop.png'), fullPage: true });

    await passwordField.fill('LongEnough123!');
    await confirmPasswordField.fill('LongEnough456!');
    await page.getByRole('button', { name: 'Sign Up', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Passwords do not match' }).waitFor({ state: 'visible' });
    assert.equal(await page.locator('#password-desktop').getAttribute('aria-invalid'), null, 'A mismatch error must not mark the password field invalid');
    assert.equal(await page.locator('#confirmPassword-desktop').getAttribute('aria-invalid'), 'true', 'A mismatch error must be associated with the confirmation field');
    await page.waitForFunction(() => window.getComputedStyle(document.querySelector('#password-desktop')).borderTopColor !== 'rgb(239, 68, 68)');
    const passwordBorderColor = await page.locator('#password-desktop').evaluate((input) => window.getComputedStyle(input).borderTopColor);
    assert.notEqual(passwordBorderColor, 'rgb(239, 68, 68)', 'A mismatch error must not style the password field as invalid');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(artifactsDir, 'pricing-07-password-mismatch-desktop.png'), fullPage: true });
  });
  await step('mobile-menu-consent-visibility', async () => {
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await visit('/pricing');
      const consent = page.locator('.analytics-consent-notice');
      await consent.waitFor({ state: 'visible' });
      const toggle = page.getByRole('button', { name: 'Open menu', exact: true });
      await toggle.click();
      const mobileMenu = page.getByRole('navigation', { name: 'Mobile menu', exact: true });
      await mobileMenu.waitFor({ state: 'visible' });
      await page.waitForTimeout(300);
      const firstLink = mobileMenu.getByRole('link', { name: 'Home', exact: true });
      const hit = await firstLink.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const topElement = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        const consentNotice = document.querySelector('.analytics-consent-notice');
        return { consentCoversLink: Boolean(topElement && consentNotice?.contains(topElement)) };
      });
      assert.equal(hit.consentCoversLink, false, 'The first-visit consent notice must not cover mobile navigation links');

      await mobileMenu.getByRole('link', { name: 'Sign up free', exact: true }).focus();
      await page.keyboard.press('Tab');
      await mobileMenu.waitFor({ state: 'detached' });
      assert.equal(await consent.evaluate((element) => element.contains(document.activeElement)), true, 'Leaving the mobile menu should close it before keyboard focus enters the consent notice');
      await page.keyboard.press('Tab');
      assert.equal(await consent.getByRole('button', { name: 'Decline', exact: true }).evaluate((element) => document.activeElement === element), true, 'The consent action after its privacy link should remain keyboard reachable');
    } finally {
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
  });
  await step('hero-scene-interaction-and-motion', async () => {
    const captures = path.resolve('output/playwright/audit-2026-10-03-continuation');
    await fs.mkdir(captures, { recursive: true });
    for (const width of [320, 360, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await visit('/');
      const headlineWords = await page.locator('#home-hero-heading').evaluate((heading) => {
        const finalPhrase = heading.querySelector('.home-hero-title-line:last-child .whitespace-nowrap');
        const textNode = finalPhrase?.firstChild;
        if (!textNode || textNode.nodeType !== 3) return null;
        const measure = (word) => {
          const start = textNode.textContent.lastIndexOf(word);
          const range = document.createRange();
          range.setStart(textNode, start);
          range.setEnd(textNode, start + word.length);
          return range.getBoundingClientRect().top;
        };
        return { width: window.innerWidth, proudTop: measure('proud'), ofTop: measure('of.') };
      });
      assert.ok(headlineWords && Math.abs(headlineWords.proudTop - headlineWords.ofTop) < 1,
        `The mobile hero heading must not strand “of.” on its own line: ${JSON.stringify(headlineWords)}`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await visit('/');
    await page.waitForFunction(() => document.querySelector('.home-hero-stage')?.getAttribute('data-renderer') === 'webgl', null, { timeout: 15000 });
    await page.waitForFunction(() => {
      const pageElement = document.querySelector('.hero-page[data-page="front"]');
      return Number.parseFloat(window.getComputedStyle(pageElement).getPropertyValue('--reveal')) >= 0.99;
    }, null, { timeout: 12000 });
    await page.waitForTimeout(350);
    const firstVisitMobileHero = await page.evaluate(() => {
      const consent = document.querySelector('.analytics-consent-notice > aside')?.getBoundingClientRect();
      const stage = document.querySelector('.home-hero-stage')?.getBoundingClientRect();
      const primaryCta = document.querySelector('.home-hero-actions a')?.getBoundingClientRect();
      const supportRoot = document.querySelector('.support-widget-root');
      return {
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        consentHeight: consent?.height ?? null,
        primaryCtaBottom: primaryCta?.bottom ?? null,
        supportLauncherDisplay: supportRoot ? window.getComputedStyle(supportRoot).display : null,
        visibleResumeStageHeight: stage ? Math.max(0, Math.min(stage.bottom, window.innerHeight) - Math.max(stage.top, 0)) : 0,
      };
    });
    assert.equal(firstVisitMobileHero.documentWidth, firstVisitMobileHero.viewportWidth, 'The first-visit mobile hero should not overflow horizontally');
    assert.ok(firstVisitMobileHero.consentHeight <= 160, `The first-visit mobile consent notice should stay compact: ${JSON.stringify(firstVisitMobileHero)}`);
    assert.ok(firstVisitMobileHero.primaryCtaBottom <= 844,
      `The primary mobile action should fit in the first viewport: ${JSON.stringify(firstVisitMobileHero)}`);
    assert.equal(firstVisitMobileHero.supportLauncherDisplay, 'none',
      `The fixed support button must not cover public mobile page content: ${JSON.stringify(firstVisitMobileHero)}`);
    assert.ok(firstVisitMobileHero.visibleResumeStageHeight >= 120,
      `The animated resume and first-visit notice should leave a visible hero preview without scrolling: ${JSON.stringify(firstVisitMobileHero)}`);
    await page.screenshot({ path: path.join(artifactsDir, 'home-mobile-first-fold.png') });

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await visit('/');
    const stage = page.locator('.home-hero-stage');
    const control = stage.getByRole('button', { name: 'Replay the example resume scan', exact: true });
    await page.getByRole('button', { name: 'Decline', exact: true }).click();
    await stage.waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelector('.home-hero-stage')?.getAttribute('data-renderer') === 'fallback');
    assert.equal(await stage.getAttribute('data-renderer'), 'fallback', 'Reduced-motion mode should use the static resume composition');
    assert.equal(await stage.getAttribute('data-interactive'), 'false', 'Reduced-motion mode should disable 3D interaction');
    assert.equal(await control.isDisabled(), true, 'Reduced-motion mode should not expose a non-working replay control');
    assert.equal(await page.locator('.home-hero-canvas canvas').count(), 0, 'Reduced-motion mode should not create a WebGL canvas');
    await stage.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(captures, '07-home-hero-reduced-motion.png') });

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await visit('/');
    await page.waitForFunction(() => ['webgl', 'fallback'].includes(document.querySelector('.home-hero-stage')?.getAttribute('data-renderer')), null, { timeout: 15000 });
    assert.equal(await stage.getAttribute('data-renderer'), 'webgl', 'The opt-in local SwiftShader run should exercise the actual WebGL scene');
    assert.equal(await stage.getAttribute('data-interactive'), 'true', 'The WebGL scene should expose its interactions once ready');
    assert.equal(await control.isDisabled(), false, 'The replay button should be usable when WebGL is ready');
    await page.waitForFunction(() => {
      const pageElement = document.querySelector('.hero-page[data-page="front"]');
      return Number.parseFloat(window.getComputedStyle(pageElement).getPropertyValue('--reveal')) >= 0.99;
    }, null, { timeout: 12000 });
    assert.equal(await page.locator('.hero-pages').getAttribute('aria-hidden'), 'true', 'The decorative resume stack should stay hidden from assistive technology');
    const themeIsDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    if (themeIsDark) {
      await page.getByRole('button', { name: 'Switch to light mode', exact: true }).click();
      await page.waitForFunction(() => !document.documentElement.classList.contains('dark'));
    }
    const primaryCta = page.locator('.home-hero .app-hero-cta-primary');
    const focusPrimaryCtaWithKeyboard = async () => {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        if (await primaryCta.evaluate((element) => element === document.activeElement)) break;
        await page.keyboard.press('Tab');
      }
      return primaryCta.evaluate((element) => {
        const style = window.getComputedStyle(element);
        return {
          focused: element === document.activeElement,
          focusVisible: element.matches(':focus-visible'),
          outlineStyle: style.outlineStyle,
          outlineWidth: Number.parseFloat(style.outlineWidth),
          outlineColor: style.outlineColor,
        };
      });
    };
    const lightCtaFocus = await focusPrimaryCtaWithKeyboard();
    assert.equal(lightCtaFocus.focused && lightCtaFocus.focusVisible, true,
      `Keyboard focus should reach the primary CTA in light theme: ${JSON.stringify(lightCtaFocus)}`);
    assert.equal(lightCtaFocus.outlineStyle, 'solid', 'The light-theme primary CTA needs a distinct keyboard focus outline');
    assert.ok(lightCtaFocus.outlineWidth >= 2, `The light-theme focus outline must be visible: ${JSON.stringify(lightCtaFocus)}`);
    await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
    await page.waitForFunction(() => document.documentElement.classList.contains('dark'));
    const darkCtaFocus = await focusPrimaryCtaWithKeyboard();
    assert.equal(darkCtaFocus.focused && darkCtaFocus.focusVisible, true,
      `Keyboard focus should reach the primary CTA in dark theme: ${JSON.stringify(darkCtaFocus)}`);
    assert.equal(darkCtaFocus.outlineStyle, 'solid', 'The dark-theme primary CTA needs a distinct keyboard focus outline');
    assert.ok(darkCtaFocus.outlineWidth >= 2, `The dark-theme focus outline must be visible: ${JSON.stringify(darkCtaFocus)}`);
    await page.getByRole('button', { name: 'Switch to light mode', exact: true }).click();
    await page.waitForFunction(() => !document.documentElement.classList.contains('dark'));
    await stage.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(captures, '08-home-hero-webgl-ready.png') });

    const scene = page.locator('.home-hero-scene');
    const sceneBox = await scene.boundingBox();
    assert.ok(sceneBox?.width, 'The hero scene should have a measurable interaction area');
    await page.mouse.move(sceneBox.x + sceneBox.width * 0.5, sceneBox.y + sceneBox.height * 0.5);
    await page.waitForTimeout(350);
    const beforePointer = await page.locator('.hero-page[data-page="front"]').evaluate((element) => element.style.transform);
    await page.mouse.move(sceneBox.x + sceneBox.width * 0.9, sceneBox.y + sceneBox.height * 0.5);
    await page.waitForTimeout(350);
    const afterPointer = await page.locator('.hero-page[data-page="front"]').evaluate((element) => element.style.transform);
    assert.notEqual(afterPointer, beforePointer, 'Moving the pointer across the hero should change the resume stack transform');

    await control.click();
    const pointerFocus = await control.evaluate((element) => ({
      focusVisible: element.matches(':focus-visible'),
      outlineStyle: window.getComputedStyle(element).outlineStyle,
    }));
    assert.equal(pointerFocus.focusVisible, false, 'Pointer activation must not leave a keyboard-only ring on the hero control');
    assert.equal(pointerFocus.outlineStyle, 'none', 'Pointer activation must not leave a visible focus frame on the hero control');
    await page.locator('.home-hero-stage [role="status"]').getByText('Scanning the example resume. This is a demonstration, not an assessment of your resume.', { exact: true }).waitFor({ state: 'visible' });
    await page.waitForFunction(() => {
      const pageElement = document.querySelector('.hero-page[data-page="front"]');
      return Number.parseFloat(window.getComputedStyle(pageElement).getPropertyValue('--scan')) < 0.5;
    }, null, { timeout: 1500 });
  });
  await step('sign-in', async () => {
    await visit('/signin');
    await page.getByRole('textbox', { name: 'Email', exact: true }).fill(QA_EMAIL);
    await page.locator('input[type="password"]').fill(QA_PASSWORD);
    await page.getByRole('button', { name: /^Sign in$/i }).click();
    await page.waitForURL(/\/dashboard(?:[/?#]|$)/);
    if (weakPasswordOnly) {
      const notice = page.getByRole('region', { name: 'Password security notice', exact: true });
      await notice.getByRole('status').waitFor({ state: 'visible' });
      await notice.getByRole('link', { name: 'Reset password', exact: true }).click();
      await page.waitForURL(/\/forgot-password(?:[/?#]|$)/);
      return;
    }
    await page.getByRole('button', { name: /Open my resume|Open Latest Resume/i }).waitFor({ state: 'visible' });
    const dashboardHeading = page.locator('main h1').first();
    await dashboardHeading.waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.activeElement?.classList.contains('route-focus-target'));
    assert.equal(await dashboardHeading.evaluate((element) => element === document.activeElement), true, 'Authenticated route navigation should focus the destination heading');
    assert.equal(await dashboardHeading.evaluate((element) => window.getComputedStyle(element).outlineStyle), 'none', 'Programmatic route navigation must not leave a focus frame');
  });
  await step('resume-creation-visual-journey', async () => {
    const originalResumes = state.resumes;
    let createdResumeId = '';
    try {
      await visit('/dashboard');
      await page.getByRole('heading', { name: 'Your working resumes', exact: true }).waitFor({ state: 'visible' });
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(artifactsDir, 'resume-flow-01-dashboard.png'), fullPage: true });
      await page.locator('main').getByRole('link', { name: 'New resume', exact: true }).first().click();
      await page.getByRole('heading', { name: 'How do you want to start?' }).waitFor({ state: 'visible' });
      await page.screenshot({ path: path.join(artifactsDir, 'resume-flow-02-start-options.png'), fullPage: true });
      await page.getByRole('button', { name: /Fill in my details step by step/ }).click();
      await page.getByRole('heading', { name: /^(Create New Resume|Edit Resume)$/ }).waitFor({ state: 'visible' });
      await page.waitForURL(/\/builder\/[0-9a-f-]{36}$/i);
      createdResumeId = page.url().split('/').at(-1);
      await page.locator('#fullName').fill('Alex Morgan QA');
      await page.locator('#jobTitle').fill('Product Designer');
      await page.locator('#email').fill(QA_EMAIL);

      const sectionNavigation = page.getByRole('navigation', { name: 'Resume sections' });
      await sectionNavigation.getByRole('button', { name: /Work History/ }).click();
      await page.getByRole('button', { name: 'Add Work Experience', exact: true }).first().click();
      await page.locator('#jobTitle').fill('Product Designer');
      await page.locator('#company').fill('Northstar Studio');
      await page.locator('#location').fill('Austin, TX');
      await page.locator('#startDate').fill('2021-06');
      await page.getByLabel('I currently work here').check();
      await page.locator('#description').fill('Led onboarding research and shipped accessible product workflows with engineering.');
      await page.getByRole('button', { name: 'Add Experience', exact: true }).click();

      await sectionNavigation.getByRole('button', { name: 'Education' }).click();
      await page.getByRole('button', { name: 'Add Education', exact: true }).first().click();
      await page.locator('#institution').fill('State University');
      await page.locator('#degree').fill('Bachelor of Arts');
      await page.locator('#fieldOfStudy').fill('Design');
      await page.locator('#startDate').fill('2015-09');
      await page.locator('#endDate').fill('2019-05');
      await page.getByRole('button', { name: 'Add Education', exact: true }).last().click();

      await sectionNavigation.getByRole('button', { name: /Skills & Expertise/ }).click();
      for (const skill of ['User Research', 'Figma', 'Accessibility']) {
        await page.locator('#newSkill').fill(skill);
        await page.getByRole('button', { name: 'Add', exact: true }).click();
      }
      await page.screenshot({ path: path.join(artifactsDir, 'resume-flow-03-editor.png'), fullPage: true });
      await page.getByRole('button', { name: /^Save Resume$/ }).click();
      await page.getByText('Resume updated successfully', { exact: true }).waitFor({ state: 'visible' });
      const savedResume = state.resumes.find((resume) => resume.id === createdResumeId);
      assert.equal(savedResume?.personal_info?.fullName, 'Alex Morgan QA', 'The locally created resume should persist its synthetic profile details');
      assert.equal(savedResume?.work_experience?.length, 1, 'The locally created resume should persist its synthetic work history');
      assert.equal(savedResume?.education?.length, 1, 'The locally created resume should persist its synthetic education');
      assert.equal(savedResume?.skills?.length, 3, 'The locally created resume should persist its synthetic skills');
      await page.waitForTimeout(3500);
      await page.getByRole('button', { name: /^Preview$/ }).click();
      await page.getByRole('complementary', { name: 'Resume preview' }).waitFor({ state: 'visible' });
      await page.screenshot({ path: path.join(artifactsDir, 'resume-flow-04-editor-preview.png'), fullPage: true });
      const editorConsentLayout = await inspectConsentOverlay(page.locator('.analytics-consent-notice'));
      assert.equal(editorConsentLayout.position, 'fixed', 'Consent should stay pinned while editing a resume');
      assert.equal(editorConsentLayout.zIndex, '2147483647', 'Consent should overlay the resume editor');
      assert.ok(Math.abs(editorConsentLayout.mainTop - editorConsentLayout.mainTopWithoutNotice) <= 0.5,
        'Showing consent must not move the resume editor or preview');
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(300);
      const mobileAutosaveToast = page.getByText(/^All changes saved at /).locator('xpath=../..');
      await mobileAutosaveToast.waitFor({ state: 'visible' });
      const [autosaveStatusBox, mobileSectionNavBox] = await Promise.all([
        mobileAutosaveToast.boundingBox(),
        page.getByRole('navigation', { name: 'Resume section navigation' }).boundingBox(),
      ]);
      assert.ok(autosaveStatusBox && mobileSectionNavBox, 'The saved-state announcement and sticky mobile section navigation should both be measurable');
      assert.ok(autosaveStatusBox.y + autosaveStatusBox.height <= mobileSectionNavBox.y,
        `The autosave status must sit above, not cover, the sticky mobile section navigation: ${JSON.stringify({ autosaveStatusBox, mobileSectionNavBox })}`);
      const skillHelperOverlap = await page.evaluate(() => {
        const toast = [...document.querySelectorAll('[role="status"]')]
          .find((element) => element.textContent.trim().startsWith('All changes saved at '));
        const helper = [...document.querySelectorAll('*')]
          .find((element) => element.childElementCount === 0 && element.textContent.trim() === 'Press Enter to add a skill or click the Add button');
        if (!toast || !helper) return null;
        const toastRect = toast.getBoundingClientRect();
        const helperRect = helper.getBoundingClientRect();
        return {
          overlaps: toastRect.left < helperRect.right && toastRect.right > helperRect.left
            && toastRect.top < helperRect.bottom && toastRect.bottom > helperRect.top,
          toastRect: { x: toastRect.x, y: toastRect.y, width: toastRect.width, height: toastRect.height },
          helperRect: { x: helperRect.x, y: helperRect.y, width: helperRect.width, height: helperRect.height },
        };
      });
      assert.ok(skillHelperOverlap, 'The saved-state announcement and skill helper should be present in the mobile builder');
      assert.equal(
        await mobileAutosaveToast.evaluate((element) => window.getComputedStyle(element).position),
        'static',
        'On mobile, the autosave status should join document flow instead of floating over resume fields',
      );
      assert.equal(skillHelperOverlap.overlaps, false,
        `The autosave status must not obscure the skill-entry helper: ${JSON.stringify(skillHelperOverlap)}`);
      assert.equal(await mobileAutosaveToast.getAttribute('role'), 'status', 'Screen readers should receive the autosave result as a status announcement');
      assert.equal(await mobileAutosaveToast.getAttribute('aria-live'), 'polite', 'The save status should be announced without interrupting current speech');
      await page.screenshot({ path: path.join(artifactsDir, 'resume-flow-04b-editor-preview-mobile.png'), fullPage: true });
      const consentNotice = page.locator('.analytics-consent-notice');
      await consentNotice.getByRole('button', { name: 'Decline' }).click();
      await consentNotice.waitFor({ state: 'hidden' });
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const mobileSectionNavigation = page.getByRole('navigation', { name: 'Resume section navigation' });
      await mobileSectionNavigation.getByRole('button', { name: /Resume sections, current: Skills & Expertise/ }).click();
      await mobileSectionNavigation.getByRole('button', { name: /Work History/ }).click();
      const mobileWorkHeading = page.getByRole('region', { name: 'Resume editor' })
        .getByRole('heading', { name: 'Work Experience', exact: true });
      await mobileWorkHeading.waitFor({ state: 'visible' });
      const [mobileWorkHeadingBox, switchedMobileNavBox] = await Promise.all([
        mobileWorkHeading.boundingBox(),
        mobileSectionNavigation.boundingBox(),
      ]);
      await page.screenshot({ path: path.join(artifactsDir, 'resume-flow-04c-mobile-section-switch.png') });
      assert.ok(mobileWorkHeadingBox && switchedMobileNavBox
        && mobileWorkHeadingBox.y >= 0
        && mobileWorkHeadingBox.y + mobileWorkHeadingBox.height <= switchedMobileNavBox.y,
      `Switching sections on mobile should reveal the new section heading above the fixed navigator: ${JSON.stringify({ mobileWorkHeadingBox, switchedMobileNavBox, scrollY: await page.evaluate(() => window.scrollY) })}`);
      await page.evaluate(() => {
        window.localStorage.removeItem('resumeats.analytics-consent');
        window.dispatchEvent(new window.Event('resumeats:analytics-consent-changed'));
      });
      await page.locator('.analytics-consent-notice').waitFor({ state: 'visible' });
      await page.setViewportSize({ width: 1440, height: 1000 });
      await visit(`/preview/${createdResumeId}`);
      await page.getByRole('heading', { name: 'Resume Preview', exact: true }).waitFor({ state: 'visible' });
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(artifactsDir, 'resume-flow-05-preview.png'), fullPage: true });
      const previewConsentLayout = await inspectConsentOverlay(page.locator('.analytics-consent-notice'));
      assert.equal(previewConsentLayout.position, 'fixed', 'Consent should stay pinned on the standalone resume preview');
      assert.equal(previewConsentLayout.zIndex, '2147483647', 'Consent should overlay the resume preview');
      assert.ok(Math.abs(previewConsentLayout.mainTop - previewConsentLayout.mainTopWithoutNotice) <= 0.5,
        'Showing consent must not move the standalone resume preview');
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(artifactsDir, 'resume-flow-05b-preview-mobile.png'), fullPage: true });
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.getByRole('button', { name: /^PDF Best for layout/ }).click();
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(artifactsDir, 'resume-flow-06-export-options.png'), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(artifactsDir, 'resume-flow-06b-export-options-mobile.png'), fullPage: true });
      assert.equal(await page.getByRole('button', { name: 'Export as PDF', exact: true }).isVisible(), true);
    } finally {
      state.resumes = originalResumes;
      await visit('/dashboard');
      await page.getByRole('heading', { name: 'Your working resumes', exact: true }).waitFor({ state: 'visible' });
    }
  });
  await step('resume-limit-error-preserves-dashboard', async () => {
    const originalResumes = state.resumes;
    try {
      state.resumes = [originalResumes[0], ...['55555555-5555-4555-8555-555555555555', '66666666-6666-4666-8666-666666666666']
        .map((id, index) => ({ ...originalResumes[0], id, title: `Saved resume ${index + 2}` }))];
      await visit('/dashboard');
      await page.getByRole('button', { name: 'Open resume', exact: true }).first().waitFor({ state: 'visible' });
      assert.equal(await page.getByRole('button', { name: 'Open resume', exact: true }).count(), 3);
      await page.locator('main').getByRole('link', { name: 'New resume', exact: true }).first().click();
      await page.getByRole('button', { name: /Fill in my details step by step/ }).click();
      await page.getByRole('alert').filter({ hasText: 'Resume creation needs attention' }).waitFor({ state: 'visible' });
      assert.equal(state.resumes.length, 3, 'A rejected creation must not modify saved resumes');
      await page.getByRole('link', { name: /Back to my resumes/ }).click();
      await page.getByRole('heading', { name: 'Your working resumes', exact: true }).waitFor({ state: 'visible' });
      assert.equal(await page.getByRole('heading', { name: 'We couldn’t load your resumes', exact: true }).count(), 0);
      assert.equal(await page.getByRole('button', { name: 'Open resume', exact: true }).count(), 3);
      await page.waitForFunction(() => [...document.querySelectorAll('main button')]
        .filter((button) => button.textContent.trim() === 'Open resume')
        .every((button) => {
          for (let node = button; node; node = node.parentElement) {
            if (Number(window.getComputedStyle(node).opacity) < 0.99) return false;
          }
          return true;
        }));
      await page.screenshot({ path: path.join(artifactsDir, 'resume-limit-dashboard-recovery.png') });
      await page.getByRole('button', { name: 'Open resume', exact: true }).first().click();
      await page.getByRole('heading', { name: 'Edit Resume', exact: true }).waitFor({ state: 'visible' });
    } finally {
      state.resumes = originalResumes;
      await visit('/dashboard');
    }
  });
  await step('resume-builder-toolbar-responsive', async () => {
    await visit(`/builder/${QA_RESUME_ID}`);
    try {
      for (const width of [1024, 930, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        if (width === 390) {
          const consentNotice = page.locator('.analytics-consent-notice--compact');
          await consentNotice.waitFor({ state: 'visible' });
          const consentBox = await consentNotice.boundingBox();
          // Allow minor cross-platform font-metric differences while catching
          // meaningful extra wrapping in this compact mobile notice.
          assert.ok(consentBox && consentBox.height <= 150, `Compact consent notice should leave more of the 390px workspace in view; height was ${consentBox?.height}px`);
          await page.screenshot({ path: path.join(artifactsDir, 'compact-consent-390.png') });
        }
        const saveButton = page.getByRole('button', { name: /^Save(?: Resume)?(?: \+ (?:PDF|DOCX))?$/ });
        await saveButton.waitFor({ state: 'visible' });
        const box = await saveButton.boundingBox();
        assert.ok(box && box.x >= 0 && box.x + box.width <= width + 1, `Save action must remain fully visible at ${width}px`);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, `Builder must not overflow at ${width}px`);
      }
    } finally {
      await page.setViewportSize({ width: 1440, height: 900 });
      await visit('/dashboard');
    }
  });
  await step('ai-generator-runtime', async () => {
    await visit(`/builder/${QA_RESUME_ID}`);
    await page.getByRole('heading', { name: 'Edit Resume', exact: true }).waitFor({ state: 'visible' });
    const aiSection = page.locator('nav[aria-label="Resume sections"] button').filter({ hasText: 'AI Content Generator' });
    await aiSection.waitFor({ state: 'visible' });
    await aiSection.click();
    await page.getByRole('heading', { name: 'Tailor, review, then save', exact: true }).waitFor({ state: 'visible' });
    await page.screenshot({ path: path.join(artifactsDir, 'ai-generator-premium-entry.png'), fullPage: true });
    const jobDescription = page.locator('#jobDescription');
    await jobDescription.fill('Product designer needed to lead accessible onboarding research and collaborate with engineering on a React design system.');
    const generateButton = page.getByRole('button', { name: 'Craft My AI Resume Draft', exact: true });
    await generateButton.click();
    await page.getByRole('heading', { name: /Review AI wording/i }).waitFor({ state: 'visible', timeout: 30000 });
    await page.screenshot({ path: path.join(artifactsDir, 'ai-generator-premium-review.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    const mobileReviewLayout = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
    }));
    assert.equal(mobileReviewLayout.documentWidth, mobileReviewLayout.viewportWidth,
      `The Premium wording review should not overflow on mobile: ${JSON.stringify(mobileReviewLayout)}`);
    await page.getByRole('heading', { name: /Review AI wording/i }).waitFor({ state: 'visible' });
    await page.screenshot({ path: path.join(artifactsDir, 'ai-generator-premium-review-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: 'Keep originals for remaining changes', exact: true }).click();
    await page.getByRole('button', { name: 'Save reviewed resume', exact: true }).waitFor({ state: 'visible' });
    assert.equal(await page.getByText(/Every wording change has a choice|No changed wording to review/).isVisible(), true);
    assert.equal(state.requestLog.some(({ path }) => path === '/functions/v1/openrouter-proxy'), true, 'AI generation should use the synthetic provider proxy');
  });
  await step('ai-generator-free-gate', async () => {
    await visit(`/builder/${QA_RESUME_ID}`);
    await page.getByRole('heading', { name: 'Edit Resume', exact: true }).waitFor({ state: 'visible' });
    const aiSection = page.locator('nav[aria-label="Resume sections"] button').filter({ hasText: 'AI Content Generator' });
    await aiSection.waitFor({ state: 'visible' });
    await aiSection.click();
    await page.getByRole('heading', { name: 'Generate a full AI draft before you start editing line by line.', exact: true }).waitFor({ state: 'visible' });
    await page.getByRole('link', { name: 'Upgrade to Premium', exact: true }).waitFor({ state: 'visible' });
    await page.screenshot({ path: path.join(artifactsDir, 'ai-generator-free-upgrade.png'), fullPage: true });
    assert.equal(await page.locator('#jobDescription').count(), 0, 'A regular account should not receive AI-generation inputs');
    assert.equal(await page.getByRole('button', { name: 'Craft My AI Resume Draft', exact: true }).count(), 0,
      'A regular account should not be able to start an AI generation');
    assert.equal(state.requestLog.some(({ path }) => path === '/functions/v1/openrouter-proxy'), false,
      'The regular-account fixture must not request AI generation');
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileGateLayout = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
    }));
    assert.equal(mobileGateLayout.documentWidth, mobileGateLayout.viewportWidth,
      `The regular-account Premium gate should not overflow on mobile: ${JSON.stringify(mobileGateLayout)}`);
    await page.getByRole('link', { name: 'Upgrade to Premium', exact: true }).waitFor({ state: 'visible' });
    await page.screenshot({ path: path.join(artifactsDir, 'ai-generator-free-upgrade-mobile.png'), fullPage: true });
  });
  await step('confirmation-dialog-keyboard', async () => {
    const deleteButton = page.getByRole('button', { name: 'Delete resume', exact: true }).first();
    await deleteButton.waitFor({ state: 'visible' });
    await deleteButton.click();
    const dialog = page.getByRole('dialog', { name: 'Delete this resume?' });
    await dialog.waitFor({ state: 'visible' });
    assert.equal(await dialog.getByRole('button', { name: 'Delete resume', exact: true }).isVisible(), true);
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    await deleteButton.click();
    await page.getByRole('dialog', { name: 'Delete this resume?' }).getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('dialog', { name: 'Delete this resume?' }).waitFor({ state: 'hidden' });
    await deleteButton.waitFor({ state: 'visible' });
  });
  await step('profile-save-reload', async () => {
    await visit('/profile');
    const fullName = page.locator('#fullName');
    await fullName.waitFor({ state: 'visible' });
    await page.waitForTimeout(350);
    const consentNotice = page.locator('.analytics-consent-notice');
    await consentNotice.waitFor({ state: 'visible' });
    const profileConsentLayout = await inspectConsentOverlay(consentNotice);
    assert.equal(profileConsentLayout.position, 'fixed', 'Consent should overlay the profile workspace instead of shifting it');
    assert.equal(profileConsentLayout.zIndex, '2147483647', 'Consent should sit above the profile workspace');
    assert.ok(Math.abs(profileConsentLayout.mainTop - profileConsentLayout.mainTopWithoutNotice) <= 0.5,
      'Showing consent must not move the profile editor');
    await page.screenshot({ path: path.join(artifactsDir, 'profile-01-personal-details-desktop.png') });
    const readFieldContrast = () => page.locator('[id="professionalLinks.linkedin"]').evaluate((element) => {
      const channels = (color) => color.match(/[\d.]+/g).slice(0, 3).map(Number);
      const luminance = (color) => channels(color).map((channel) => channel / 255)
        .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
        .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
      const ratio = (first, second) => (Math.max(luminance(first), luminance(second)) + 0.05)
        / (Math.min(luminance(first), luminance(second)) + 0.05);
      const style = window.getComputedStyle(element);
      const placeholder = window.getComputedStyle(element, '::placeholder').color;
      const background = style.backgroundColor;
      const border = style.borderTopColor;
      return {
        placeholderColor: placeholder,
        placeholderContrast: ratio(placeholder, background),
        borderColor: border,
        borderContrast: ratio(border, background),
      };
    });
    const lightFieldContrast = await readFieldContrast();
    assert.ok(lightFieldContrast.placeholderContrast >= 4.5, `Light-theme field examples must meet 4.5:1 contrast: ${JSON.stringify(lightFieldContrast)}`);
    assert.ok(lightFieldContrast.borderContrast >= 3, `Light-theme field boundaries must meet 3:1 contrast: ${JSON.stringify(lightFieldContrast)}`);
    await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
    await page.waitForFunction(() => document.documentElement.classList.contains('dark'));
    await page.waitForTimeout(600);
    const darkFieldContrast = await readFieldContrast();
    assert.ok(darkFieldContrast.placeholderContrast >= 4.5, `Dark-theme field examples must meet 4.5:1 contrast: ${JSON.stringify(darkFieldContrast)}`);
    assert.ok(darkFieldContrast.borderContrast >= 3, `Dark-theme field boundaries must meet 3:1 contrast: ${JSON.stringify(darkFieldContrast)}`);
    await page.screenshot({ path: path.join(artifactsDir, 'profile-01b-personal-details-dark-desktop.png') });
    await page.getByRole('button', { name: 'Switch to light mode', exact: true }).click();
    await page.waitForFunction(() => !document.documentElement.classList.contains('dark'));
    await page.waitForTimeout(600);
    await fullName.fill('Alex Morgan QA');
    await page.getByRole('status').getByText(/unsaved profile changes/i).waitFor({ state: 'visible' });
    await page.screenshot({ path: path.join(artifactsDir, 'profile-02-unsaved-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#profile-section').waitFor({ state: 'visible' });
    await page.screenshot({ path: path.join(artifactsDir, 'profile-03-unsaved-mobile.png') });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: 'Save profile', exact: true }).click();
    await page.getByText('Career foundation saved', { exact: false }).waitFor({ state: 'visible' });
    await page.waitForTimeout(3700);
    await page.reload();
    await page.locator('#fullName').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#fullName').inputValue(), 'Alex Morgan QA');
    assert.equal(state.profile.personal.fullName, 'Alex Morgan QA');
    await page.screenshot({ path: path.join(artifactsDir, 'profile-04-saved-after-reload.png') });
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

    const pdfOption = page.getByRole('button', { name: /^PDF Best for layout/ });
    await pdfOption.click();
    const pdfExportButton = page.getByRole('button', { name: 'Export as PDF', exact: true });
    const [pdfDownload] = await Promise.all([page.waitForEvent('download'), pdfExportButton.click()]);
    assert.match(pdfDownload.suggestedFilename(), /\.pdf$/i);
    const pdfFile = path.join(artifactsDir, pdfDownload.suggestedFilename());
    await pdfDownload.saveAs(pdfFile);
    const pdfContents = await fs.readFile(pdfFile);
    assert.equal(pdfContents.subarray(0, 5).toString(), '%PDF-', 'PDF must be a real PDF, not an HTML error response');
    assert.ok(pdfContents.length > 1000, 'PDF should contain actual resume content');
  });
  await step('pointer-route-focus', async () => {
    await visit('/learn');
    await page.getByRole('link', { name: 'Best practices', exact: true }).click();
    await page.waitForURL(/\/learn#best-practices$/);
    const target = page.locator('#best-practices').getByRole('heading', { name: 'ATS Best Practices', exact: true });
    await target.waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.activeElement?.classList.contains('route-focus-target'));
    assert.equal(await target.evaluate((element) => element === document.activeElement), true, 'Route navigation should focus the destination heading');
    assert.equal(await target.evaluate((element) => window.getComputedStyle(element).outlineStyle), 'none', 'Pointer navigation must not leave a focus frame');
    assert.equal(await target.evaluate((element) => window.getComputedStyle(element).boxShadow), 'none', 'Pointer navigation must not leave a focus ring shadow');
  });
  await step('reusable-answers-save-reload', async () => {
    await visit('/profile');
    await page.getByRole('button', { name: 'Autofill Answers', exact: true }).click();
    await page.getByRole('heading', { name: 'Application Autofill Profile', exact: true }).waitFor({ state: 'visible' });
    await page.screenshot({ path: path.join(artifactsDir, 'profile-05-autofill-profile-desktop.png') });
    await page.getByRole('button', { name: 'Add reusable answer', exact: true }).click();
    await page.getByLabel('Exact application question', { exact: true }).fill('When can you start?');
    await page.getByLabel('Your answer', { exact: true }).fill('Two weeks');
    await page.getByLabel('Employer hostname (optional)', { exact: true }).fill('jobs.example');
    await page.screenshot({ path: path.join(artifactsDir, 'profile-06-reusable-answer-draft.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(artifactsDir, 'profile-07-reusable-answer-mobile.png') });
    await page.setViewportSize({ width: 1440, height: 1000 });
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
    await page.getByRole('button', { name: 'Edit: Fixture QA Company', exact: true }).filter({ visible: true }).waitFor({ state: 'visible' });
  });
  await step('application-modal-keyboard', async () => {
    await visit('/applications');
    await page.getByRole('button', { name: /^Add Application$/ }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
  });
  await step('application-responsive-layout', async () => {
    state.job_applications[0].position = 'Senior Product Designer — Enterprise Platforms and Customer Experience';
    state.job_applications[0].company = 'Northstar Labs International';
    state.job_applications[0].notes = 'Long notes stay readable without stretching the table. '.repeat(12);
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await visit('/applications');
      await page.getByRole('button', { name: `Edit: ${state.job_applications[0].position}`, exact: true }).filter({ visible: true }).waitFor();
      await page.waitForTimeout(600); // Finish the page and row entrance animations before visual capture.
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, `No page overflow at ${width}px`);
      const title = page.getByRole('button', { name: `Edit: ${state.job_applications[0].position}`, exact: true }).filter({ visible: true });
      assert.equal(await title.evaluate(el => el.scrollWidth > el.clientWidth + 1), false, 'Long role titles must wrap');
      if (width >= 1024) {
        const table = await page.getByRole('table').boundingBox();
        assert.ok(table.y < 700, 'Applications should not be buried below oversized summaries');
      }
      await page.screenshot({ path: path.join(artifactsDir, `applications-${width}.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole('button', { name: /Switch to dark mode/i }).click();
    await page.waitForTimeout(600); // Allow theme colors to finish transitioning.
    await page.screenshot({ path: path.join(artifactsDir, 'applications-dark.png'), fullPage: true });
    await page.getByRole('button', { name: /Switch to light mode/i }).click();
    await page.getByRole('textbox', { name: 'Search applications' }).fill('no-matching-role');
    await page.getByText('No applications match your filters.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
    await page.getByRole('table').waitFor();
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
    const mobileConsent = page.locator('.analytics-consent-notice--compact');
    const resumeSectionHint = page.getByText('Keep one clean base for each direction you apply in.', { exact: true });
    await mobileConsent.waitFor({ state: 'visible' });
    await resumeSectionHint.waitFor({ state: 'visible' });
    await page.waitForTimeout(1200);
    const dashboardConsentLayout = await inspectConsentOverlay(mobileConsent);
    assert.equal(dashboardConsentLayout.position, 'fixed', 'The mobile consent notice should float above the dashboard');
    assert.equal(dashboardConsentLayout.zIndex, '2147483647', 'The mobile consent notice should be above page content');
    assert.ok(dashboardConsentLayout.bottomGap >= 8 && dashboardConsentLayout.bottomGap <= 24,
      `The mobile consent notice should remain anchored to the viewport bottom: ${JSON.stringify(dashboardConsentLayout)}`);
    assert.ok(Math.abs(dashboardConsentLayout.mainTop - dashboardConsentLayout.mainTopWithoutNotice) <= 0.5,
      'Showing the mobile consent notice must not move dashboard content');
    await page.screenshot({ path: path.join(artifactsDir, 'mobile-dashboard-consent-entry.png') });
    await page.evaluate(() => {
      const hint = [...document.querySelectorAll('main p')]
        .find((element) => element.textContent.trim() === 'Keep one clean base for each direction you apply in.');
      if (!hint) return;
      const documentTop = hint.getBoundingClientRect().top + window.scrollY;
      window.scrollTo(0, documentTop - Math.round(window.innerHeight * 0.75));
    });
    assert.equal(await mobileConsent.evaluate((element) => window.getComputedStyle(element).position), 'fixed',
      'Scrolling the dashboard must not move the consent notice out of its viewport position');
    await page.screenshot({ path: path.join(artifactsDir, 'mobile-consent-scroll.png') });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, 'Entrance animations must not overflow horizontally');
    const resumeCardVisibility = await page.getByRole('button', { name: 'Open resume', exact: true }).first().evaluate((element) => {
      let node = element;
      while (node) {
        const styles = window.getComputedStyle(node);
        if (styles.opacity === '0' || styles.visibility === 'hidden') {
          return { opacity: styles.opacity, visibility: styles.visibility };
        }
        node = node.parentElement;
      }
      return { opacity: '1', visibility: 'visible' };
    });
    assert.notEqual(resumeCardVisibility.opacity, '0', 'Saved resume cards must not remain hidden below the initial viewport');
    assert.notEqual(resumeCardVisibility.visibility, 'hidden', 'Saved resume cards must remain visible below the initial viewport');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    assert.equal(overflow, false, 'Mobile dashboard must not overflow horizontally');
    const openMenu = page.getByRole('button', { name: 'Open menu', exact: true });
    await openMenu.click();
    await page.getByRole('navigation', { name: 'Mobile menu', exact: true }).waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');
    await page.getByRole('navigation', { name: 'Mobile menu', exact: true }).waitFor({ state: 'hidden' });
    assert.equal(await openMenu.evaluate((element) => document.activeElement === element), true, 'Escape should restore focus to the mobile menu trigger');
    await openMenu.click();
    await page.getByRole('navigation', { name: 'Mobile menu', exact: true }).waitFor({ state: 'visible' });
    const outsidePoint = await page.evaluate(() => {
      const menu = document.querySelector('nav[aria-label="Mobile menu"]');
      const x = Math.floor(window.innerWidth / 2);
      const y = Math.min(window.innerHeight - 8, Math.max(Math.ceil(menu.getBoundingClientRect().bottom + 8), Math.floor(window.innerHeight * 0.85)));
      const target = document.elementFromPoint(x, y);
      return { x, y, insideHeader: Boolean(target?.closest('header')) };
    });
    assert.equal(outsidePoint.insideHeader, false, 'Mobile menu dismissal point must be outside the header and menu');
    await page.mouse.click(outsidePoint.x, outsidePoint.y);
    await page.getByRole('navigation', { name: 'Mobile menu', exact: true }).waitFor({ state: 'hidden' });
    await openMenu.click();
    await page.getByRole('navigation', { name: 'Mobile menu', exact: true }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: 'Get support', exact: true }).click();
    await page.getByRole('navigation', { name: 'Mobile menu', exact: true }).waitFor({ state: 'hidden' });
    const supportDialog = page.getByRole('dialog', { name: 'ResumeATS support', exact: true });
    await supportDialog.waitFor({ state: 'visible' });
    const supportLayering = await page.evaluate(() => {
      const root = document.querySelector('.support-widget-root--dialog-open');
      const consentNotice = document.querySelector('.analytics-consent-notice');
      const dialog = document.querySelector('[role="dialog"]');
      const submit = [...(dialog?.querySelectorAll('button') ?? [])]
        .find((button) => button.textContent.trim() === 'Start support conversation');
      if (!root || !consentNotice || !dialog || !submit) return null;
      const rect = submit.getBoundingClientRect();
      const hitTarget = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return {
        dialogZ: Number.parseInt(window.getComputedStyle(root).zIndex, 10),
        consentZ: Number.parseInt(window.getComputedStyle(consentNotice).zIndex, 10),
        submitIsTopmost: hitTarget === submit,
      };
    });
    assert.ok(supportLayering, 'The mobile support dialog and consent layer should both render');
    assert.ok(supportLayering.dialogZ >= supportLayering.consentZ, `The support dialog should be at least level with consent: ${JSON.stringify(supportLayering)}`);
    assert.equal(supportLayering.submitIsTopmost, true, 'Consent must not intercept the support conversation button');
    await page.screenshot({ path: path.join(artifactsDir, 'mobile-support-dialog.png') });
    await supportDialog.getByRole('button', { name: 'Close support', exact: true }).click();
    await supportDialog.waitFor({ state: 'hidden' });
    assert.equal(await page.getByRole('button', { name: 'Open support dialog', exact: true }).isVisible(), false, 'Mobile support should not float over workspace actions');
    await page.getByRole('heading', { level: 1 }).click();
    const headingStyles = await page.getByRole('heading', { level: 1 }).evaluate((element) => {
      const styles = window.getComputedStyle(element);
      return { outlineStyle: styles.outlineStyle, boxShadow: styles.boxShadow };
    });
    assert.equal(headingStyles.outlineStyle, 'none', 'Text activation must not leave a focus frame');
    assert.equal(headingStyles.boxShadow, 'none', 'Text activation must not leave a focus ring shadow');
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
