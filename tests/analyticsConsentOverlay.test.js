import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const styles = fs.readFileSync('src/index.css', 'utf8');
const banner = fs.readFileSync('src/components/AnalyticsConsentBanner.jsx', 'utf8');
const consentStyles = fs.readFileSync('src/styles/analytics-consent.css', 'utf8');
const pricing = fs.readFileSync('src/pages/Pricing.jsx', 'utf8');

test('analytics consent stays at the viewport edge while dialogs remain accessible above it', () => {
  assert.match(styles, /\.analytics-consent-notice\s*\{[^}]*position: fixed;[^}]*bottom: max\(0\.75rem, var\(--safe-bottom\)\);[^}]*z-index: 10000;[^}]*pointer-events: none;/);
  assert.match(styles, /\.analytics-consent-notice > aside\s*\{[^}]*max-height: calc\(100dvh - var\(--app-chrome-top\) - max\(1rem, var\(--safe-bottom\)\)\);[^}]*overflow-y: auto;[^}]*pointer-events: auto;/);
  assert.match(styles, /\.support-widget-root--dialog-open\s*\{\s*z-index:\s*10001;/);
  assert.match(styles, /\.app-modal-layer\s*\{\s*z-index:\s*10001;/);
  assert.match(styles, /\.support-widget-root:not\(\.support-widget-root--dialog-open\)\s*\{\s*display: none;/);
  assert.match(banner, /compactOnMobile = true/);
  assert.match(consentStyles, /\.analytics-consent-notice--compact-mobile/);
});

test('mobile Free-plan signup appears before the optional six-feature disclosure', () => {
  assert.match(pricing, /className="order-2 mt-4 w-full md:order-3 md:mt-0"/);
  assert.ok(pricing.indexOf("{user ? 'Continue with Free Plan' : 'Sign Up for Free'}")
    < pricing.indexOf('See all 6 free-plan features'));
  assert.equal((pricing.match(/'Clear resume layouts with standard section headings\.'/g) ?? []).length, 1);
  assert.match(pricing, /BASIC_PLAN_FEATURES\.map/);
});
