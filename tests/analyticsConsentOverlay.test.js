import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const styles = fs.readFileSync('src/index.css', 'utf8');
const banner = fs.readFileSync('src/components/AnalyticsConsentBanner.jsx', 'utf8');
const consentStyles = fs.readFileSync('src/styles/analytics-consent.css', 'utf8');
const pricing = fs.readFileSync('src/pages/Pricing.jsx', 'utf8');

test('analytics consent stays at the viewport edge while dialogs remain accessible above it', () => {
  assert.match(styles, /\.analytics-consent-notice\s*\{[^}]*position: fixed;[^}]*bottom: max\(0\.75rem, var\(--safe-bottom\)\);[^}]*z-index: 2147483647;[^}]*pointer-events: none;/);
  assert.match(styles, /\.analytics-consent-notice > aside\s*\{[^}]*max-height: calc\(100dvh - var\(--app-chrome-top\) - max\(1rem, var\(--safe-bottom\)\)\);[^}]*overflow-y: auto;[^}]*pointer-events: auto;/);
  assert.doesNotMatch(styles, /\.app-shell:has\(\.app-builder-mobile-nav\) \.analytics-consent-notice/);
  assert.match(styles, /\.support-widget-root--dialog-open\s*\{\s*z-index:\s*2147483647;/);
  assert.match(styles, /\.app-modal-layer\s*\{\s*z-index:\s*2147483647;/);
  assert.match(styles, /\.app-skip-link\s*\{\s*@apply fixed left-4 top-4 z-\[2147483647\]/);
  assert.match(styles, /\.support-widget-root:not\(\.support-widget-root--dialog-open\)\s*\{\s*display: none;/);
  assert.match(banner, /compactOnMobile = true/);
  assert.match(consentStyles, /\.analytics-consent-notice--compact-mobile/);
});

test('mobile consent stays pinned to the viewport bottom without changing the page layout', () => {
  assert.doesNotMatch(styles, /\.app-shell\[data-mobile-nav='visible'\] \.analytics-consent-notice[^}]*bottom:/);
  assert.doesNotMatch(styles, /\.app-shell\[data-focus-mode='true'\] \.analytics-consent-notice[^}]*bottom:/);
  assert.match(styles, /\.analytics-consent-notice\s*\{[^}]*position: fixed;[^}]*z-index: 2147483647;/);
});

test('compact mobile consent preserves its accessible heading without consuming visible vertical space', () => {
  assert.match(consentStyles, /\.analytics-consent-notice--compact-mobile h2\s*\{[^}]*position:\s*absolute;[^}]*width:\s*1px;[^}]*height:\s*1px;[^}]*clip-path:\s*inset\(50%\);/);
  assert.match(consentStyles, /@media \(min-width: 360px\) and \(max-width: 767px\)\s*\{\s*\.analytics-consent-notice--compact-mobile > aside > div\s*\{\s*flex-direction: row; align-items: center;/);
  assert.match(banner, /<h2 className="text-sm font-bold">Help us improve ResumeATS<\/h2>/);
});

test('mobile Free-plan signup appears before the optional six-feature disclosure', () => {
  assert.match(pricing, /grid gap-3 md:gap-6 md:grid-cols-2/);
  assert.match(pricing, /className="order-2 mt-4 w-full md:order-3 md:mt-0"/);
  assert.ok(pricing.indexOf("{user ? 'Continue with Free Plan' : 'Sign Up for Free'}")
    < pricing.indexOf('See all 6 free-plan features'));
  assert.equal((pricing.match(/'Clear resume layouts with standard section headings\.'/g) ?? []).length, 1);
  assert.match(pricing, /BASIC_PLAN_FEATURES\.map/);
});
