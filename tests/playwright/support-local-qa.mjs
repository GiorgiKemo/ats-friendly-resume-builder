import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, firefox, webkit } from 'playwright';
import axe from 'axe-core';

const cwd = process.cwd();
const supportQaBrowserName = process.env.SUPPORT_QA_BROWSER || 'chromium';
const browserType = { chromium, firefox, webkit }[supportQaBrowserName];
const actualBrowserZoomQa = process.env.SUPPORT_QA_BROWSER_ZOOM === '1';
if (!browserType) throw new Error('SUPPORT_QA_BROWSER must be chromium, firefox, or webkit.');
if (actualBrowserZoomQa && supportQaBrowserName !== 'chromium') {
  throw new Error('Actual per-tab browser zoom QA is Chromium-only; omit SUPPORT_QA_BROWSER_ZOOM for other engines.');
}
const statusOutput = execFileSync(process.execPath, [path.join(cwd, 'node_modules', 'supabase', 'dist', 'supabase.js'), 'status', '-o', 'json'], {
  cwd,
  encoding: 'utf8',
});
const status = JSON.parse(statusOutput.slice(statusOutput.indexOf('{')));
const serviceHeaders = {
  apikey: status.SERVICE_ROLE_KEY,
  Authorization: `Bearer ${status.SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
};
const supportQaPort = process.env.SUPPORT_QA_PORT || '5176';
const baseUrl = `http://127.0.0.1:${supportQaPort}`;
const browserZoomExtensionPath = path.join(cwd, 'tests', 'playwright', 'fixtures', 'admin-zoom-extension');
const screenshotRunId = new Date().toISOString().replace(/[:.]/g, '-');
const adminMainControlSelector = 'main button:not(:disabled), main a[href], main input:not(:disabled):not([type="hidden"]), main select:not(:disabled), main textarea:not(:disabled), main [role="button"], main [role="link"], main [role="checkbox"], main [role="radio"], main [role="tab"], main [role="combobox"]';
const ownerEmail = `codex-support-owner-${Date.now()}@example.test`;
const ownerPassword = `LocalQA-${Date.now()}-Safe!`;
const subject = `Synthetic support QA ${Date.now()}`;
const guestMessage = 'Synthetic guest message for local support QA.';
const guestFollowUp = 'Synthetic guest follow-up after handoff.';
const agentReply = 'Synthetic agent reply for local support QA.';
const internalNote = 'Synthetic internal note must remain operator-only.';

const decodeBase32 = (secret) => {
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const character of secret.toUpperCase().replace(/=+$/, '')) {
    const digit = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(character);
    if (digit < 0) continue;
    value = (value << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
};

const totpCode = (secret, now = Date.now()) => {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)));
  const digest = createHmac('sha1', decodeBase32(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return `${code}`.padStart(6, '0');
};

const auditAdminSurface = () => {
  const hidden = (element) => {
    if (element.closest('[aria-hidden="true"]')) return true;
    const style = window.getComputedStyle(element);
    return style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0;
  };
  const text = (element) => element?.textContent?.replace(/\s+/g, ' ').trim() || '';
  const labelledBy = (element) => (element.getAttribute('aria-labelledby') || '')
    .split(/\s+/)
    .map((id) => document.getElementById(id))
    .map(text)
    .filter(Boolean)
    .join(' ');
  const labelFor = (element) => {
    const id = element.getAttribute('id');
    return id ? text(document.querySelector(`label[for="${CSS.escape(id)}"]`)) : '';
  };
  const controls = [...document.querySelectorAll('main input, main textarea, main select, main button, main a[href], main [role="button"], main [role="link"], main [role="checkbox"], main [role="radio"], main [role="tab"], main [role="combobox"]')];
  const issues = [];
  for (const element of controls) {
    if (hidden(element)) continue;
    const tag = element.tagName.toLowerCase();
    if (tag === 'input' && element.type === 'hidden') continue;
    const explicit = element.getAttribute('aria-label') || labelledBy(element);
    const associated = labelFor(element) || text(element.closest('label'));
    const content = tag === 'button' || tag === 'a' || element.getAttribute('role') ? text(element) : '';
    const name = (explicit || associated || content || element.getAttribute('title') || '').trim();
    if (!name) issues.push(`${tag}${element.id ? `#${element.id}` : ''} has no accessible name`);
    if ((tag === 'input' || tag === 'textarea' || tag === 'select') && !explicit && !associated) {
      issues.push(`${tag}${element.id ? `#${element.id}` : ''} has no programmatic label`);
    }
  }
  const ids = [...document.querySelectorAll('[id]')].map((element) => element.id).filter(Boolean);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  for (const id of [...new Set(duplicates)]) issues.push(`duplicate id #${id}`);
  return { issues, mainCount: document.querySelectorAll('main').length, headingCount: document.querySelectorAll('h1').length };
};

const auditAdminControlContrast = () => {
  const parseColor = (value) => {
    const hex = value.match(/^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i)?.[1];
    if (hex) {
      const expanded = hex.length <= 4 ? [...hex].map((channel) => channel + channel).join('') : hex;
      return {
        rgb: [0, 2, 4].map((offset) => Number.parseInt(expanded.slice(offset, offset + 2), 16)),
        alpha: expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1,
      };
    }
    const srgb = value.match(/^color\(srgb\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)(?:\s*\/\s*([\d.-]+%?))?\)$/i);
    if (srgb) {
      return {
        rgb: srgb.slice(1, 4).map((channel) => Number(channel) * 255),
        alpha: srgb[4] ? Number(srgb[4].replace('%', '')) / (srgb[4].endsWith('%') ? 100 : 1) : 1,
      };
    }
    const rgb = value.match(/^rgba?\((.+)\)$/i)?.[1];
    if (!rgb) return null;
    const channels = rgb.replaceAll(',', ' ').replace('/', ' ').trim().split(/\s+/);
    if (channels.length < 3) return null;
    const toChannel = (channel) => Number(channel.replace('%', '')) * (channel.endsWith('%') ? 2.55 : 1);
    const alpha = channels[3] ? Number(channels[3].replace('%', '')) / (channels[3].endsWith('%') ? 100 : 1) : 1;
    return { rgb: channels.slice(0, 3).map(toChannel), alpha };
  };
  const composite = (foreground, background) => foreground.rgb.map((channel, index) => (
    channel * foreground.alpha + background[index] * (1 - foreground.alpha)
  ));
  const luminance = (channels) => channels
    .map((channel) => channel / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  const contrastRatio = (first, second) => (
    (Math.max(luminance(first), luminance(second)) + 0.05)
    / (Math.min(luminance(first), luminance(second)) + 0.05)
  );
  const root = document.querySelector('.admin-shell');
  const controls = [...(root?.querySelectorAll('button, input:not([type="hidden"]), select, textarea') || [])]
    .filter((element) => {
      const style = getComputedStyle(element);
      return !element.disabled
        && element.getClientRects().length > 0
        && style.display !== 'none'
        && style.visibility === 'visible'
        && Number(style.opacity) > 0
        && !element.closest('[aria-hidden="true"], [inert]');
    });
  const findings = [];
  for (const element of controls) {
    const style = getComputedStyle(element);
    const ancestors = [];
    for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) ancestors.unshift(ancestor);
    let surroundingBackground = [255, 255, 255];
    for (const ancestor of ancestors) {
      const background = parseColor(getComputedStyle(ancestor).backgroundColor);
      if (background?.alpha > 0) surroundingBackground = composite(background, surroundingBackground);
    }

    const elementBackground = parseColor(style.backgroundColor);
    const effectiveBackground = elementBackground?.alpha > 0
      ? composite(elementBackground, surroundingBackground)
      : surroundingBackground;
    const fillContrast = elementBackground?.alpha > 0
      ? contrastRatio(effectiveBackground, surroundingBackground)
      : null;
    const borderVisible = ['Top', 'Right', 'Bottom', 'Left'].some((side) => (
      Number.parseFloat(style[`border${side}Width`]) >= 1
      && style[`border${side}Style`] !== 'none'
      && (parseColor(style[`border${side}Color`])?.alpha || 0) > 0
    ));
    const borderColor = parseColor(style.borderTopColor);
    const borderContrast = borderVisible && borderColor?.alpha > 0
      ? contrastRatio(composite(borderColor, surroundingBackground), surroundingBackground)
      : null;
    const activeIndicator = element.matches('.admin-nav button.is-active')
      ? parseColor(style.getPropertyValue('--admin-primary').trim())
      : null;
    const activeIndicatorContrast = activeIndicator?.alpha > 0
      ? contrastRatio(composite(activeIndicator, effectiveBackground), effectiveBackground)
      : null;
    if ((borderVisible || fillContrast !== null)
      && (borderContrast ?? 0) < 3
      && (fillContrast ?? 0) < 3
      && (activeIndicatorContrast ?? 0) < 3) {
      findings.push({
        tag: element.tagName.toLowerCase(),
        className: typeof element.className === 'string' ? element.className.slice(0, 160) : '',
        type: element.getAttribute('type') || '',
        borderColor: style.borderTopColor,
        borderContrast: borderContrast === null ? null : Number(borderContrast.toFixed(2)),
        background: style.backgroundColor,
        fillContrast: fillContrast === null ? null : Number(fillContrast.toFixed(2)),
        activeIndicatorContrast: activeIndicatorContrast === null ? null : Number(activeIndicatorContrast.toFixed(2)),
      });
    }
  }
  return { controlCount: controls.length, findings };
};

const assertKeyboardFocusIndicator = async (page, section, theme) => {
  const hasMainControl = await page.evaluate((selector) => {
    window.scrollTo(0, 0);
    document.activeElement?.blur?.();
    document.body.setAttribute('tabindex', '-1');
    document.body.focus();
    document.body.removeAttribute('tabindex');
    return [...document.querySelectorAll(selector)].some((element) => (
      element.tabIndex >= 0
      && element.getClientRects().length > 0
      && getComputedStyle(element).visibility !== 'hidden'
      && !element.closest('[aria-hidden="true"], [inert]')
    ));
  }, adminMainControlSelector);
  assert.equal(hasMainControl, true, `${section} must expose a keyboard-reachable main control`);

  let focusedMainControl = false;
  for (let tab = 0; tab < 100; tab += 1) {
    await page.keyboard.press('Tab');
    focusedMainControl = await page.evaluate((selector) => [...document.querySelectorAll(selector)].some((element) => (
      element === document.activeElement
      && element.tabIndex >= 0
      && element.getClientRects().length > 0
      && getComputedStyle(element).visibility !== 'hidden'
      && !element.closest('[aria-hidden="true"], [inert]')
    )), adminMainControlSelector);
    if (focusedMainControl) break;
  }
  assert.equal(focusedMainControl, true, `${section} main controls must be reachable by Tab`);

  const indicator = await page.evaluate(() => {
    const element = document.activeElement;
    const outline = getComputedStyle(element);
    const ring = outline.outlineColor.match(/[\d.]+/g)?.slice(0, 3).map(Number);
    let backgroundElement = element.parentElement;
    let backgroundColor = '';
    while (backgroundElement) {
      const candidate = getComputedStyle(backgroundElement).backgroundColor;
      const alpha = candidate.startsWith('rgba') ? Number(candidate.match(/[\d.]+/g)?.[3] || 0) : 1;
      if (alpha > 0) {
        backgroundColor = candidate;
        break;
      }
      backgroundElement = backgroundElement.parentElement;
    }
    const background = backgroundColor.match(/[\d.]+/g)?.slice(0, 3).map(Number);
    const luminance = (channels) => channels
      .map((channel) => channel / 255)
      .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
      .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
    const ratio = ring && background
      ? (Math.max(luminance(ring), luminance(background)) + 0.05) / (Math.min(luminance(ring), luminance(background)) + 0.05)
      : 0;
    return {
      focusVisible: element.matches(':focus-visible'),
      outlineStyle: outline.outlineStyle,
      outlineWidth: Number.parseFloat(outline.outlineWidth),
      outlineOffset: Number.parseFloat(outline.outlineOffset),
      contrastRatio: ratio,
    };
  });
  assert.equal(indicator.focusVisible, true, `${section} ${theme} focus must be keyboard-visible`);
  assert.equal(indicator.outlineStyle, 'solid', `${section} ${theme} focus must have a solid outline`);
  assert.ok(indicator.outlineWidth >= 2, `${section} ${theme} focus ring must be at least 2px: ${JSON.stringify(indicator)}`);
  assert.ok(indicator.outlineOffset >= 1, `${section} ${theme} focus ring must be offset: ${JSON.stringify(indicator)}`);
  assert.ok(indicator.contrastRatio >= 3, `${section} ${theme} focus ring must have 3:1 contrast: ${JSON.stringify(indicator)}`);
};

const assertFullKeyboardTraversal = async (page, section, theme) => {
  const targetCount = await page.evaluate(() => {
    const selector = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="tab"], [role="combobox"], [tabindex]:not([tabindex="-1"]), [contenteditable="true"], summary';
    const root = document.querySelector('.admin-shell');
    const targets = [...(root?.querySelectorAll(selector) || [])].filter((element) => (
      element.tabIndex >= 0
      && element.getClientRects().length > 0
      && getComputedStyle(element).display !== 'none'
      && getComputedStyle(element).visibility !== 'hidden'
      && Number(getComputedStyle(element).opacity) !== 0
      && !element.closest('[aria-hidden="true"], [inert]')
    ));
    window.__adminKeyboardTargets = new WeakMap(targets.map((element, index) => [element, index]));
    window.scrollTo(0, 0);
    document.activeElement?.blur?.();
    document.body.setAttribute('tabindex', '-1');
    document.body.focus();
    document.body.removeAttribute('tabindex');
    return targets.length;
  });
  assert.ok(targetCount > 0, `${section} ${theme} must expose keyboard-reachable controls`);

  const visited = new Set();
  for (let press = 0; press < targetCount * 2 + 20 && visited.size < targetCount; press += 1) {
    await page.keyboard.press('Tab');
    const focus = await page.evaluate(() => {
      const element = document.activeElement;
      const index = window.__adminKeyboardTargets?.get(element);
      if (index === undefined) return null;
      const focusWithinWrapper = element.closest('.admin-date-filter, .admin-time-filter');
      const indicatorElement = focusWithinWrapper?.matches(':focus-within') ? focusWithinWrapper : element;
      const style = getComputedStyle(indicatorElement);
      const channels = (value) => value.match(/[\d.]+/g)?.slice(0, 4).map(Number) || [];
      let backgroundElement = indicatorElement.parentElement;
      let backgroundChannels = [255, 255, 255];
      while (backgroundElement) {
        const candidate = getComputedStyle(backgroundElement).backgroundColor;
        const candidateChannels = channels(candidate);
        const alpha = candidate.startsWith('rgba') ? candidateChannels[3] ?? 0 : 1;
        if (alpha > 0) {
          backgroundChannels = candidateChannels.slice(0, 3).map((channel) => channel * alpha + 255 * (1 - alpha));
          break;
        }
        backgroundElement = backgroundElement.parentElement;
      }
      const outlineChannels = channels(style.outlineColor);
      const outlineAlpha = style.outlineColor.startsWith('rgba') ? outlineChannels[3] ?? 0 : 1;
      const ringChannels = outlineChannels.slice(0, 3).map((channel, index) => channel * outlineAlpha + backgroundChannels[index] * (1 - outlineAlpha));
      const luminance = (values) => values
        .map((channel) => channel / 255)
        .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
        .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
      const ringLuminance = luminance(ringChannels);
      const backgroundLuminance = luminance(backgroundChannels);
      const adminShell = document.querySelector('.admin-shell');
      return {
        index,
        tag: element.tagName.toLowerCase(),
        id: element.id,
        role: element.getAttribute('role'),
        type: element.getAttribute('type'),
        label: (element.getAttribute('aria-label') || [...(element.labels || [])].map((label) => label.textContent).join(' ') || element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 100),
        className: typeof element.className === 'string' ? element.className : '',
        focusVisible: element.matches(':focus-visible') || indicatorElement.matches(':focus-visible') || indicatorElement.matches(':focus-within'),
        indicatorElement: indicatorElement.className || indicatorElement.tagName.toLowerCase(),
        outlineStyle: style.outlineStyle,
        outlineWidth: Number.parseFloat(style.outlineWidth),
        outlineColor: style.outlineColor,
        adminFocusToken: adminShell ? getComputedStyle(adminShell).getPropertyValue('--admin-focus').trim() : '',
        contrastRatio: (Math.max(ringLuminance, backgroundLuminance) + 0.05) / (Math.min(ringLuminance, backgroundLuminance) + 0.05),
      };
    });
    if (!focus) continue;
    const description = `${section} ${theme} Tab target ${JSON.stringify(focus)}`;
    assert.notEqual(focus.outlineStyle, 'none', `${description} must have a focus indicator`);
    assert.ok(focus.outlineWidth >= 1, `${description} indicator must be visible`);
    assert.ok(focus.contrastRatio >= 3, `${description} indicator must meet 3:1 contrast`);
    visited.add(focus.index);
  }

  await page.evaluate(() => { delete window.__adminKeyboardTargets; });
  assert.equal(visited.size, targetCount, `${section} ${theme} keyboard traversal must reach every visible admin control (${visited.size}/${targetCount})`);
  return targetCount;
};

const inspectBrowserZoom = async (context, page, zoomFactor) => {
  await page.bringToFront();
  const serviceWorker = context.serviceWorkers().find((worker) => worker.url().startsWith('chrome-extension://'))
    || await context.waitForEvent('serviceworker', { timeout: 15_000 });
  return serviceWorker.evaluate(async (nextZoomFactor) => {
    const chromeApi = globalThis.chrome;
    const [tab] = await chromeApi.tabs.query({ active: true, lastFocusedWindow: true });
    if (typeof tab?.id !== 'number') throw new Error('No active browser tab is available for zoom verification.');
    if (typeof nextZoomFactor === 'number') {
      await chromeApi.tabs.setZoomSettings(tab.id, { mode: 'automatic', scope: 'per-tab' });
      await chromeApi.tabs.setZoom(tab.id, nextZoomFactor);
    }
    return { zoomFactor: await chromeApi.tabs.getZoom(tab.id), url: tab.url || '' };
  }, zoomFactor);
};

let ownerId = '';
let conversationId = '';
let viteProcess;
let ownsViteProcess = false;
let browser;
let adminContext;
let zoomProfilePath = '';
let browserZoomCheckCount = 0;

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

  browser = await browserType.launch({ headless: true });
  const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const otherGuestContext = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  if (actualBrowserZoomQa) {
    zoomProfilePath = await fs.mkdtemp(path.join(tmpdir(), 'resumeats-admin-zoom-'));
    adminContext = await chromium.launchPersistentContext(zoomProfilePath, {
      channel: 'chromium',
      headless: false,
      viewport: null,
      serviceWorkers: 'allow',
      args: [
        `--disable-extensions-except=${browserZoomExtensionPath}`,
        `--load-extension=${browserZoomExtensionPath}`,
        '--window-size=1280,900',
      ],
    });
  } else {
    adminContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  }
  const guestPage = await guestContext.newPage();
  const otherGuestPage = await otherGuestContext.newPage();
  const adminPage = await adminContext.newPage();
  const pages = [guestPage, otherGuestPage, adminPage];
  const consoleErrors = [];
  const expected403ConsoleErrors = [];
  const pageErrors = [];
  const httpErrors = [];
  const supportStatuses = [];

  for (const page of pages) {
    page.on('console', (message) => {
      if (message.type() === 'error') {
        const entry = `${page.url()}: ${message.text()}`;
        if (/Failed to load resource:.*\b403\b/i.test(message.text())) expected403ConsoleErrors.push(entry);
        else consoleErrors.push(entry);
      }
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
  await adminPage.getByText('Development environment', { exact: true }).waitFor({ state: 'visible' });
  const customerResponsePromise = adminPage.waitForResponse((response) => {
    if (!response.url().includes('/functions/v1/admin-api')) return false;
    try { return response.request().postDataJSON()?.action === 'customer'; } catch { return false; }
  });
  await adminPage.goto(`${baseUrl}/admin/users/${ownerId}`, { waitUntil: 'networkidle' });
  const customerResponse = await customerResponsePromise;
  assert.equal(customerResponse.status(), 200, 'customer detail route must receive a successful admin-api response');
  const customerPayload = await customerResponse.json();
  assert.equal(customerPayload?.ok, true, 'customer detail response must be successful');
  assert.equal(customerPayload?.customer?.customer?.id, ownerId, 'customer detail response must match the routed customer');
  const customerDetail = adminPage.locator('[role="dialog"][aria-labelledby="admin-customer-detail-title"]');
  try {
    await customerDetail.waitFor({ state: 'visible' });
  } catch (error) {
    console.error(JSON.stringify({
      browser: supportQaBrowserName,
      url: adminPage.url(),
      title: await adminPage.title(),
      body: (await adminPage.locator('body').innerText()).slice(0, 3000),
      consoleErrors,
      pageErrors,
      httpErrors,
    }));
    await adminPage.screenshot({ path: `docs/admin-dashboard-plan/evidence/admin-customer-detail-failure-${supportQaBrowserName}-${screenshotRunId}.png`, fullPage: true }).catch(() => {});
    throw error;
  }
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
  await adminPage.goto(`${baseUrl}/admin/support`, { waitUntil: 'domcontentloaded' });
  try {
    await adminPage.getByText('Verify your authenticator in Admin Settings before using support tools.', { exact: true }).waitFor({ state: 'visible' });
  } catch (error) {
    console.error(JSON.stringify({
      url: adminPage.url(),
      title: await adminPage.title(),
      body: (await adminPage.locator('body').innerText()).slice(0, 2500),
      supportStatuses,
      consoleErrors,
      pageErrors,
      httpErrors,
    }));
    throw error;
  }
  await adminPage.goto(`${baseUrl}/admin/settings`, { waitUntil: 'networkidle' });
  await adminPage.getByRole('heading', { name: 'Admin MFA', exact: true }).waitFor({ state: 'visible' });
  const enrollmentResponsePromise = adminPage.waitForResponse((response) => (
    response.url().includes('/auth/v1/factors') && response.request().method() === 'POST'
  ));
  await adminPage.getByRole('button', { name: 'Set up authenticator app', exact: true }).click();
  const enrollmentResponse = await enrollmentResponsePromise;
  assert.equal(enrollmentResponse.ok(), true, 'local owner TOTP enrollment must succeed');
  const enrollmentData = await enrollmentResponse.json();
  const totpSecret = enrollmentData?.totp?.secret;
  assert.equal(typeof totpSecret, 'string', 'local TOTP enrollment must return a secret to the authenticated page');
  await adminPage.locator('#admin-mfa-code').fill(totpCode(totpSecret));
  await adminPage.getByRole('button', { name: 'Verify authenticator', exact: true }).click();
  await adminPage.getByText('AAL2 verified', { exact: true }).waitFor({ state: 'visible' });
  await adminPage.goto(`${baseUrl}/admin/support`, { waitUntil: 'domcontentloaded' });
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

  const adminSurfaceMatrix = [
    ['Overview', 'What needs attention today?'],
    ['Users', 'Users'],
    ['Client errors', 'Client Errors'],
    ['Analytics', 'First-party product analytics'],
    ['Admin access', 'Admin Access'],
    ['Subscriptions', 'Provider access, in one view'],
    ['Support', 'Support inbox'],
    ['AI & Jobs', 'AI and job operations'],
    ['Feedback', 'Feedback and improvement backlog'],
    ['Audit log', 'Audit Log'],
    ['Settings', 'Admin MFA'],
  ];
  await adminPage.addScriptTag({ content: axe.source });
  let keyboardFocusTargetChecks = 0;
  let textContrastAuditCount = 0;
  const textContrastViolations = [];
  const textContrastIncomplete = [];
  let nonTextContrastAuditCount = 0;
  const nonTextContrastFindings = [];
  for (const [label, heading] of adminSurfaceMatrix) {
    const navigationItem = adminPage.locator('.admin-nav').getByRole('button', { name: label, exact: true });
    await navigationItem.click();
    await adminPage.getByRole('heading', { name: heading, exact: true }).waitFor({ state: 'visible' });
    assert.equal(await navigationItem.getAttribute('aria-current'), 'page', `${label} navigation must identify the current section`);
    const accessibility = await adminPage.evaluate(auditAdminSurface);
    assert.equal(accessibility.mainCount, 1, `${label} must have exactly one main landmark`);
    assert.equal(accessibility.headingCount, 1, `${label} must have exactly one h1`);
    assert.deepEqual(accessibility.issues, [], `${label} accessibility DOM audit must pass`);
    for (const [theme, value] of [['Light', 'light'], ['Dark', 'dark']]) {
      await adminPage.locator('.admin-sidebar-footer').getByRole('button', { name: theme, exact: true }).click();
      await adminPage.waitForFunction((expected) => document.querySelector('.admin-shell')?.getAttribute('data-admin-theme') === expected, value);
      await adminPage.waitForTimeout(250);
      const contrastResults = await adminPage.evaluate(async () => {
        const results = await window.axe.run(document.querySelector('.admin-shell'), {
          runOnly: { type: 'rule', values: ['color-contrast'] },
          resultTypes: ['violations', 'incomplete'],
        });
        const summarize = (issues) => issues.flatMap((issue) => issue.nodes.map((node) => ({
          rule: issue.id,
          target: node.target,
          html: node.html,
          summary: node.failureSummary,
          checks: [...node.any, ...node.all, ...node.none].map(({ data }) => data).filter(Boolean),
        })));
        return {
          violations: summarize(results.violations),
          incomplete: summarize(results.incomplete),
        };
      });
      textContrastAuditCount += 1;
      textContrastViolations.push(...contrastResults.violations.map((finding) => ({ section: label, theme, ...finding })));
      textContrastIncomplete.push(...contrastResults.incomplete.map((finding) => ({ section: label, theme, ...finding })));
      const nonTextContrast = await adminPage.evaluate(auditAdminControlContrast);
      nonTextContrastAuditCount += 1;
      nonTextContrastFindings.push(...nonTextContrast.findings.map((finding) => ({ section: label, theme, ...finding })));
      for (const width of [360, 720, 768, 1024, 1440, 1920]) {
        await adminPage.setViewportSize({ width, height: 900 });
        assert.equal(await adminPage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, `${label} ${theme} must not overflow at ${width}px`);
      }
      await adminPage.setViewportSize({ width: 1440, height: 1000 });
      await assertKeyboardFocusIndicator(adminPage, label, theme);
      keyboardFocusTargetChecks += await assertFullKeyboardTraversal(adminPage, label, theme);
      if (label === 'Overview' && theme === 'Light') {
        await adminPage.screenshot({ path: `docs/admin-dashboard-plan/evidence/admin-focus-ring-overview-light-local-${screenshotRunId}.png`, fullPage: true });
      }
    }
  }
  assert.equal(textContrastAuditCount, adminSurfaceMatrix.length * 2, 'Rendered text contrast must be audited for all admin surfaces in both themes');
  if (textContrastViolations.length > 0) {
    const groupedViolations = new Map();
    for (const finding of textContrastViolations) {
      const color = finding.checks.find((check) => check.contrastRatio !== undefined);
      const html = finding.html.slice(0, 180);
      const key = JSON.stringify({ target: finding.target, html, foreground: color?.fgColor, background: color?.bgColor, ratio: color?.contrastRatio });
      const group = groupedViolations.get(key) || { target: finding.target, html, foreground: color?.fgColor, background: color?.bgColor, ratio: color?.contrastRatio, sections: new Set() };
      group.sections.add(`${finding.section} ${finding.theme}`);
      groupedViolations.set(key, group);
    }
    const summary = [...groupedViolations.values()].map((group) => ({ ...group, sections: [...group.sections] }));
    console.log(`ADMIN_TEXT_CONTRAST_FAILURES total=${textContrastViolations.length} unique=${summary.length} ${JSON.stringify(summary.slice(0, 30))}`);
  }
  assert.equal(textContrastViolations.length, 0, `WCAG AA text contrast has ${textContrastViolations.length} violation nodes`);
  if (textContrastIncomplete.length > 0) {
    console.log(`ADMIN_TEXT_CONTRAST_INCOMPLETE ${JSON.stringify(textContrastIncomplete)}`);
  }
  assert.equal(textContrastIncomplete.length, 0, `WCAG AA text contrast has unresolved incomplete nodes: ${JSON.stringify(textContrastIncomplete)}`);
  assert.equal(nonTextContrastAuditCount, adminSurfaceMatrix.length * 2, 'Non-text control contrast must be audited for all admin surfaces in both themes');
  const nonTextContrastSummary = [...nonTextContrastFindings.reduce((summary, finding) => {
    const key = JSON.stringify([finding.tag, finding.className, finding.borderColor, finding.borderContrast, finding.background, finding.fillContrast]);
    const entry = summary.get(key) || { ...finding, occurrences: [] };
    entry.occurrences.push(`${finding.section}/${finding.theme}`);
    summary.set(key, entry);
    return summary;
  }, new Map()).values()];
  if (nonTextContrastFindings.length > 0) {
    console.log(`ADMIN_NON_TEXT_CONTRAST_FAILURES total=${nonTextContrastFindings.length} unique=${nonTextContrastSummary.length} ${JSON.stringify(nonTextContrastSummary.slice(0, 30))}`);
  }
  assert.equal(nonTextContrastFindings.length, 0, `WCAG AA control boundaries/fills need 3:1 contrast: ${JSON.stringify(nonTextContrastSummary.slice(0, 30))}`);
  if (actualBrowserZoomQa) {
    const zoomPage = await adminContext.newPage();
    await zoomPage.goto(`${baseUrl}/admin`, { waitUntil: 'networkidle' });
    await zoomPage.getByRole('heading', { name: 'What needs attention today?', exact: true }).waitFor({ state: 'visible' });
    const defaultZoom = await inspectBrowserZoom(adminContext, zoomPage);
    assert.equal(defaultZoom.zoomFactor, 1, 'isolated Chromium must start at its default 100% browser zoom');
    assert.ok(defaultZoom.url.startsWith(baseUrl), 'browser zoom helper must target only the local QA app');
    const defaultViewportWidth = await zoomPage.evaluate(() => window.innerWidth);
    const appliedZoom = await inspectBrowserZoom(adminContext, zoomPage, 2);
    assert.equal(appliedZoom.zoomFactor, 2, 'Chrome must report a real 200% per-tab zoom');
    await zoomPage.waitForFunction((width) => window.innerWidth < width * 0.8, defaultViewportWidth);
    const initialZoomViewport = await zoomPage.evaluate(() => ({
      innerWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      devicePixelRatio: window.devicePixelRatio,
    }));
    assert.ok(initialZoomViewport.innerWidth < defaultViewportWidth * 0.8, '200% browser zoom must reduce the CSS layout viewport');
    assert.ok(initialZoomViewport.documentWidth <= initialZoomViewport.innerWidth + 1, 'Overview must not overflow at 200% browser zoom');
    assert.ok(initialZoomViewport.bodyWidth <= initialZoomViewport.innerWidth + 1, 'Overview body must not overflow at 200% browser zoom');

    for (const [label, heading] of adminSurfaceMatrix) {
      const mobileNavigation = await zoomPage.evaluate(() => window.innerWidth <= 700);
      if (mobileNavigation) {
        await zoomPage.getByRole('button', { name: 'Admin menu', exact: true }).click();
        await zoomPage.getByRole('dialog', { name: 'Admin navigation', exact: true })
          .getByRole('button', { name: label, exact: true }).click();
      } else {
        await zoomPage.locator('.admin-nav').getByRole('button', { name: label, exact: true }).click();
      }
      await zoomPage.getByRole('heading', { name: heading, exact: true }).waitFor({ state: 'visible' });
      for (const [theme, value] of [['Light', 'light'], ['Dark', 'dark']]) {
        const mobileThemeSelector = await zoomPage.evaluate(() => window.innerWidth <= 700);
        if (mobileThemeSelector) {
          await zoomPage.getByRole('button', { name: 'Admin menu', exact: true }).click();
          await zoomPage.getByRole('dialog', { name: 'Admin navigation', exact: true })
            .locator('.admin-sidebar-footer').getByRole('button', { name: theme, exact: true }).click();
          await zoomPage.getByRole('button', { name: 'Close menu', exact: true }).click();
          await zoomPage.getByRole('dialog', { name: 'Admin navigation', exact: true }).waitFor({ state: 'detached' });
          await zoomPage.waitForFunction(() => getComputedStyle(document.querySelector('.admin-sidebar')).visibility === 'hidden');
        } else {
          await zoomPage.locator('.admin-sidebar-footer').getByRole('button', { name: theme, exact: true }).click();
        }
        await zoomPage.waitForFunction((expected) => document.querySelector('.admin-shell')?.getAttribute('data-admin-theme') === expected, value);
        const zoomState = await inspectBrowserZoom(adminContext, zoomPage);
        assert.equal(zoomState.zoomFactor, 2, `${label} ${theme} must remain at genuine 200% browser zoom`);
        const zoomViewport = await zoomPage.evaluate(() => ({
          innerWidth: window.innerWidth,
          documentWidth: document.documentElement.scrollWidth,
          bodyWidth: document.body.scrollWidth,
          mainLeft: document.querySelector('.admin-main')?.getBoundingClientRect().left ?? 0,
          mainRight: document.querySelector('.admin-main')?.getBoundingClientRect().right ?? 0,
          headingBounds: [...document.querySelectorAll('.admin-main h1, .admin-main h2')]
            .filter((element) => element.getClientRects().length > 0)
            .map((element) => ({
              text: element.textContent.trim(),
              left: element.getBoundingClientRect().left,
              right: element.getBoundingClientRect().right,
              clientWidth: element.clientWidth,
              scrollWidth: element.scrollWidth,
            })),
          devicePixelRatio: window.devicePixelRatio,
        }));
        assert.ok(zoomViewport.innerWidth < defaultViewportWidth * 0.8, `${label} ${theme} must retain the zoomed CSS viewport`);
        assert.ok(zoomViewport.documentWidth <= zoomViewport.innerWidth + 1, `${label} ${theme} must not overflow at 200% browser zoom`);
        assert.ok(zoomViewport.bodyWidth <= zoomViewport.innerWidth + 1, `${label} ${theme} body must not overflow at 200% browser zoom`);
        assert.ok(zoomViewport.mainLeft >= -1 && zoomViewport.mainRight <= zoomViewport.innerWidth + 1, `${label} ${theme} main landmark must fit at 200% browser zoom`);
        const clippedHeadings = zoomViewport.headingBounds.filter((heading) => (
          heading.left < -1
          || heading.right > zoomViewport.innerWidth + 1
          || heading.scrollWidth > heading.clientWidth + 1
        ));
        assert.deepEqual(clippedHeadings, [], `${label} ${theme} headings must fit the visible viewport at 200% browser zoom: ${JSON.stringify(zoomViewport)}`);
        await assertKeyboardFocusIndicator(zoomPage, label, theme);
        browserZoomCheckCount += 1;
        if (label === 'Overview' && theme === 'Light') {
          await zoomPage.evaluate(() => window.scrollTo({ left: 0, top: 0, behavior: 'instant' }));
          await zoomPage.waitForFunction(() => window.scrollX === 0 && window.scrollY === 0);
          const captureState = await zoomPage.evaluate(() => ({
            sidebarVisibility: getComputedStyle(document.querySelector('.admin-sidebar')).visibility,
            sidebarOpen: document.querySelector('.admin-sidebar')?.classList.contains('is-open'),
            navigationExpanded: document.querySelector('.admin-mobile-toggle')?.getAttribute('aria-expanded'),
          }));
          assert.deepEqual(captureState, { sidebarVisibility: 'hidden', sidebarOpen: false, navigationExpanded: 'false' }, '200% overview evidence must not capture the closed mobile navigation drawer');
          await zoomPage.screenshot({ path: `docs/admin-dashboard-plan/evidence/admin-200-percent-zoom-overview-light-local-${screenshotRunId}.png` });
        }
      }
    }
    const resetZoom = await inspectBrowserZoom(adminContext, zoomPage, 1);
    assert.equal(resetZoom.zoomFactor, 1, 'temporary local QA browser tab must restore to 100% before cleanup');
    await zoomPage.waitForFunction((width) => window.innerWidth >= width * 0.9, defaultViewportWidth);
    await zoomPage.close();
  }
  await adminPage.setViewportSize({ width: 1440, height: 1000 });
  await adminPage.locator('.admin-sidebar-footer').getByRole('button', { name: 'Light', exact: true }).click();

  for (const page of pages) {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, `No overflow at ${page.url()}`);
  }
  await adminPage.getByRole('button', { name: 'Support', exact: true }).click();
  await adminPage.getByRole('heading', { name: 'Support inbox', exact: true }).waitFor({ state: 'visible' });
  assert.equal(await adminPage.locator('.admin-shell').getAttribute('data-admin-theme'), 'light', 'admin theme must default to Light');
  for (const width of [360, 720, 768, 1024, 1440, 1920]) {
    await adminPage.setViewportSize({ width, height: 900 });
    if (width <= 700) {
      await adminPage.getByRole('button', { name: 'Admin menu', exact: true }).click();
      await adminPage.getByRole('dialog', { name: 'Admin navigation', exact: true }).waitFor({ state: 'visible' });
    }
    for (const [theme, value] of [['Light', 'light'], ['Dark', 'dark']]) {
      await adminPage.getByRole('button', { name: theme, exact: true }).click();
      await adminPage.waitForFunction((expected) => document.querySelector('.admin-shell')?.getAttribute('data-admin-theme') === expected, value);
      assert.equal(await adminPage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, `${theme} support inbox must not overflow at ${width}px`);
    }
    if (width <= 700) {
      await adminPage.keyboard.press('Escape');
      assert.equal(await adminPage.getByRole('dialog', { name: 'Admin navigation', exact: true }).count(), 0, 'Escape must close mobile admin navigation');
      await adminPage.waitForFunction(() => document.activeElement?.matches('.admin-mobile-toggle'));
      assert.equal(await adminPage.getByRole('button', { name: 'Admin menu', exact: true }).evaluate((button) => document.activeElement === button), true, 'closing mobile admin navigation must restore focus');
    }
  }
  await adminPage.setViewportSize({ width: 1440, height: 1000 });
  await adminPage.emulateMedia({ colorScheme: 'light' });
  await adminPage.getByRole('button', { name: 'System', exact: true }).click();
  await adminPage.waitForFunction(() => document.querySelector('.admin-shell')?.getAttribute('data-admin-theme') === 'light');
  await adminPage.emulateMedia({ colorScheme: 'dark' });
  await adminPage.waitForFunction(() => document.querySelector('.admin-shell')?.getAttribute('data-admin-theme') === 'dark');
  await adminPage.getByRole('button', { name: 'Light', exact: true }).click();
  await adminPage.reload({ waitUntil: 'networkidle' });
  await adminPage.getByRole('heading', { name: 'Support inbox', exact: true }).waitFor({ state: 'visible' });
  assert.equal(await adminPage.locator('.admin-shell').getAttribute('data-admin-theme'), 'light', 'Light preference must persist after reload');
  assert.equal(await adminPage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, 'Support inbox must not overflow at desktop width');
  const expected403Responses = supportStatuses.filter(({ status }) => status === 403).length;
  const supportStatusSummary = [...new Set(supportStatuses.map(({ action, status }) => `${action}:${status}`))].sort();
  const unexpectedHttpErrors = httpErrors.filter((entry) => !entry.includes(': 403 ') || !entry.includes('/functions/v1/support-api'));
  assert.deepEqual(unexpectedHttpErrors, [], `Only expected AAL1 support-api denials may return HTTP errors: ${JSON.stringify(httpErrors)}`);
  assert.deepEqual(consoleErrors, [], `Browser console must have no errors: ${JSON.stringify({ httpErrors, supportStatuses })}`);
  assert.deepEqual(pageErrors, [], 'Browser pages must have no errors');
  assert.ok(supportStatuses.length > 0, 'Support API must be exercised');
  assert.ok(supportStatuses.some(({ status }) => status === 403), 'AAL1 operator requests must be denied pending MFA step-up');
  assert.ok(supportStatuses.some(({ action, status }) => action === 'queue' && status === 200), 'AAL2 operator requests must reach the support queue');
  assert.ok(supportStatuses.every(({ status }) => status === 200 || status === 403), 'Support API must not return unexpected error statuses');
  await fs.mkdir('docs/admin-dashboard-plan/evidence', { recursive: true });
  await guestPage.screenshot({ path: `docs/admin-dashboard-plan/evidence/support-guest-resolved-local-${screenshotRunId}.png`, fullPage: true });
  await adminPage.screenshot({ path: `docs/admin-dashboard-plan/evidence/support-inbox-local-${screenshotRunId}.png`, fullPage: true });
  console.log(`PASS support-end-to-end-browser browser=${supportQaBrowserName} guest-recovery=true isolation=true handoff=true note-isolated=true resolution=true csat=true aal1-operator-denied=true expected403Responses=${expected403Responses} supportStatusActions=${JSON.stringify(supportStatusSummary)} browser403ResourceMessages=${expected403ConsoleErrors.length} aal2-operator-allowed=true overflow=false admin-text-contrast-audits=${textContrastAuditCount} text-contrast-violations=0 text-contrast-incomplete=${textContrastIncomplete.length} admin-nontext-contrast-audits=${nonTextContrastAuditCount} nontext-contrast-violations=0 admin-keyboard-target-checks=${keyboardFocusTargetChecks} real-browser-zoom-checks=${browserZoomCheckCount} consoleErrors=0 pageErrors=0`);
} finally {
  await adminContext?.close().catch(() => {});
  await browser?.close().catch(() => {});
  if (zoomProfilePath) {
    const temporaryRoot = path.resolve(tmpdir());
    const resolvedProfile = path.resolve(zoomProfilePath);
    assert.ok(resolvedProfile.startsWith(`${temporaryRoot}${path.sep}`), 'only remove the generated QA profile under the OS temporary directory');
    assert.ok(path.basename(resolvedProfile).startsWith('resumeats-admin-zoom-'), 'only remove the generated ResumeATS QA profile');
    await fs.rm(resolvedProfile, { recursive: true, force: true });
  }
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
