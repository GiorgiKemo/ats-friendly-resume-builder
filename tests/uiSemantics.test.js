import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import { createServer } from 'vite';

let vite;
const components = {};
before(async () => {
  vite = await createServer({
    configFile: false,
    cacheDir: 'node_modules/.vite-qa-unit',
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
    esbuild: { jsx: 'automatic' },
    define: {
      'import.meta.env.VITE_SUPABASE_URL_DEV': JSON.stringify('http://127.0.0.1:54329'),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY_DEV': JSON.stringify('qa-local-anon-key'),
    },
  });
  for (const name of ['Input', 'Select', 'Textarea', 'MobileFormField', 'Button']) {
    components[name] = (await vite.ssrLoadModule(`/src/components/ui/${name}.jsx`)).default;
  }
  components.TouchLink = (await vite.ssrLoadModule('/src/components/ui/TouchLink.jsx')).default;
  components.TouchExternalLink = (await vite.ssrLoadModule('/src/components/ui/TouchExternalLink.jsx')).default;
  components.Tooltip = (await vite.ssrLoadModule('/src/components/ui/Tooltip.jsx')).default;
  components.ConfirmDialog = (await vite.ssrLoadModule('/src/components/ui/ConfirmDialog.jsx')).default;
  components.AuthProvider = (await vite.ssrLoadModule('/src/context/AuthContext.jsx')).AuthProvider;
  Object.assign(components, await vite.ssrLoadModule('/src/pages/Analytics.jsx'));
  components.buildBrowserAgentProfile = (await vite.ssrLoadModule('/src/services/browserAgentService.js')).buildBrowserAgentProfile;
  components.ApplicationProfileSection = (await vite.ssrLoadModule('/src/components/profile/ApplicationProfileSection.jsx')).default;
  for (const name of ['SignIn', 'SignUp']) {
    components[name] = (await vite.ssrLoadModule(`/src/components/auth/${name}.jsx`)).default;
  }
});
after(async () => { await vite?.close(); });

test('extension profile leaves unknown sensitive answers empty instead of inventing legal consent', async () => {
  const profile = await components.buildBrowserAgentProfile({ user: { id: 'account-a' }, resume: null, userProfile: {} });
  for (const key of ['workAuthorization', 'requiresSponsorship', 'backgroundCheckConsent', 'privacyConsent', 'gender', 'raceEthnicity', 'veteranStatus', 'disabilityStatus', 'yearsOfExperience']) {
    assert.equal(profile.answers[key], '', `${key} must require user-provided facts`);
  }
  const provided = await components.buildBrowserAgentProfile({ user: { id: 'account-a' }, resume: null, userProfile: { applicationProfile: { workAuthorization: 'No', privacyConsent: 'Yes' } } });
  assert.equal(provided.answers.workAuthorization, 'No');
  assert.equal(provided.answers.privacyConsent, 'Yes');
});

test('autofill profile UI displays unanswered sensitive choices until the user selects one', () => {
  const markup = renderToStaticMarkup(React.createElement(components.ApplicationProfileSection, { data: {}, onChange() {} }));
  for (const id of ['workAuthorization', 'requiresSponsorship', 'backgroundCheckConsent', 'privacyConsent', 'gender']) {
    const select = markup.match(new RegExp(`<select[^>]*id="${id}"[^>]*>[\\s\\S]*?<\\/select>`))?.[0];
    assert.ok(select, id);
    assert.match(select, /<option value="" selected="">Choose an answer/);
    assert.doesNotMatch(select, /<option value="(?:Yes|No|Prefer not to answer)" selected=""/);
  }
});

test('pipeline bars render exact proportional widths including a true zero', () => {
  const markup = renderToStaticMarkup(React.createElement(components.CurrentPipelineChart, {
    stages: [{ label: 'Awaiting reply', count: 0 }, { label: 'Screening', count: 1 }, { label: 'Interview', count: 2 }],
  }));
  const bars = [...markup.matchAll(/<div[^>]*style="width:([^"]+)"[^>]*>/g)];
  assert.deepEqual(bars.map((bar) => bar[1]), ['0%', '50%', '100%']);
  for (const [tag] of bars) assert.doesNotMatch(tag, /(?:p[rlx]?-\d|padding|min-width)/);
  assert.match(markup, />Awaiting reply<\/span>/);
  assert.match(markup, />0<\/span>/);
});

test('weekly bars have a fixed-height parent and exact zero-baseline heights', () => {
  const markup = renderToStaticMarkup(React.createElement(components.WeeklyActivityChart, {
    weeks: [{ week: '2026-08-17', count: 0 }, { week: '2026-08-24', count: 1 }, { week: '2026-08-31', count: 2 }],
  }));
  assert.equal([...markup.matchAll(/style="height:8rem"/g)].length, 3);
  assert.deepEqual([...markup.matchAll(/style="height:(\d+%)"/g)].map((match) => match[1]), ['0%', '50%', '100%']);
  assert.equal([...markup.matchAll(/class="absolute bottom-0 /g)].length, 3);
  assert.match(markup, />2<\/span>/);
  const empty = renderToStaticMarkup(React.createElement(components.WeeklyActivityChart, { weeks: [] }));
  assert.doesNotMatch(empty, /NaN|Infinity/);
});

for (const [name, tag] of [['Input', 'input'], ['Select', 'select'], ['Textarea', 'textarea'], ['MobileFormField', 'input']]) {
  const extra = name === 'Select' ? { options: [{ value: 'option', label: 'Option' }] } : {};
  test(`${name} links labels, caller help, and validation errors in rendered HTML`, () => {
    const markup = renderToStaticMarkup(React.createElement(components[name], {
      ...extra, label: 'Field label', id: 'candidate-field', error: 'Please complete this field',
      required: true, 'aria-describedby': 'field-help', 'aria-invalid': false,
    }));
    const element = markup.match(new RegExp(`<${tag}\\b[^>]*>`))?.[0];
    assert.ok(element, `${name} should render a native ${tag}`);
    assert.match(markup, /<label[^>]*for="candidate-field"/);
    assert.match(element, /id="candidate-field"/);
    assert.match(element, /aria-describedby="field-help candidate-field-error"/);
    assert.match(element, /aria-invalid="true"/);
    assert.match(element, /required=""/);
    assert.match(markup, /<p[^>]*id="candidate-field-error"[^>]*role="alert"/);
    assert.match(markup, /aria-hidden="true">\*<\/span>/);
  });
  test(`${name} generates deterministic, unique linked IDs when omitted`, () => {
    const tree = React.createElement(React.Fragment, null,
      React.createElement(components[name], { ...extra, label: 'First' }),
      React.createElement(components[name], { ...extra, label: 'Second' }),
    );
    const markup = renderToStaticMarkup(tree);
    assert.equal(renderToStaticMarkup(tree), markup, 'Generated IDs must not use randomness');
    const ids = [...markup.matchAll(new RegExp(`<${tag}\\b[^>]*id="([^"]+)"`, 'g'))].map((match) => match[1]);
    assert.equal(ids.length, 2);
    assert.notEqual(ids[0], ids[1]);
    for (const id of ids) assert.ok(markup.includes(`for="${id}"`));
    assert.equal(markup.includes('undefined-error'), false);
  });
  test(`${name} preserves caller accessibility state without a local error`, () => {
    const markup = renderToStaticMarkup(React.createElement(components[name], {
      ...extra, label: 'Field', 'aria-describedby': 'help', 'aria-invalid': 'grammar',
    }));
    assert.match(markup, /aria-describedby="help"/);
    assert.match(markup, /aria-invalid="grammar"/);
    assert.equal(markup.includes('role="alert"'), false);
  });
}

test('Button navigation renders an anchor, not a fake button role', () => {
  const markup = renderToStaticMarkup(React.createElement(StaticRouter, { location: '/' },
    React.createElement(components.Button, { as: 'link', to: '/builder', animate: false }, 'Edit resume'),
  ));
  assert.match(markup, /<a[^>]*href="\/builder"/);
  assert.equal(markup.includes('role="button"'), false);
});

test('animated links keep the native link as the only keyboard stop', () => {
  const markup = renderToStaticMarkup(React.createElement(StaticRouter, { location: '/' },
    React.createElement(React.Fragment, null,
      React.createElement(components.Button, { as: 'link', to: '/builder' }, 'Edit resume'),
      React.createElement(components.TouchLink, { to: '/learn' }, 'Resume tips'),
      React.createElement(components.TouchExternalLink, { href: 'https://example.com' }, 'External'),
    ),
  ));
  assert.doesNotMatch(markup, /<div[^>]*tabindex="0"/i);
  assert.equal((markup.match(/tabindex="-1"/gi) || []).length, 3);
  assert.equal((markup.match(/<a\b/g) || []).length, 3);
});

test('Button navigation forwards click callbacks and suppresses disabled clicks', () => {
  let clicks = 0;
  let prevented = false;
  const event = { preventDefault() { prevented = true; } };
  // The component has no hooks; invoke its render function to exercise the actual
  // Link handler, which static HTML intentionally cannot serialize.
  const makeLink = (disabled) => components.Button.type({ as: 'link', to: '/builder', children: 'Edit', animate: false, disabled, onClick: () => { clicks += 1; } }).props.children;
  const enabled = makeLink(false);
  enabled.props.onClick(event);
  assert.equal(clicks, 1);
  assert.equal(prevented, false);
  const disabled = makeLink(true);
  disabled.props.onClick(event);
  assert.equal(clicks, 1);
  assert.equal(prevented, true);
  assert.equal(disabled.props['aria-disabled'], true);
  assert.equal(disabled.props.tabIndex, -1);
});

test('Button defaults to a non-submitting native button and honors disabled', () => {
  const markup = renderToStaticMarkup(React.createElement(components.Button, { disabled: true, animate: false }, 'Save'));
  assert.match(markup, /<button[^>]*type="button"/);
  assert.match(markup, /disabled=""/);
});

test('marketing feature icons are hidden from assistive technology', () => {
  const features = fs.readFileSync('src/components/home/FeaturesSection.jsx', 'utf8');
  const premium = fs.readFileSync('src/components/home/PremiumFeatures.jsx', 'utf8');
  assert.equal((features.match(/<svg aria-hidden="true"/g) || []).length, 3);
  assert.equal((premium.match(/<svg aria-hidden="true"/g) || []).length, 4);
});

test('the labelled scroll control hides its decorative icon', () => {
  const footer = fs.readFileSync('src/components/layout/Footer.jsx', 'utf8');
  assert.match(footer, /aria-label="Scroll to top"[\s\S]*?<svg aria-hidden="true"/);
});

test('footer support contacts wrap between channels instead of splitting phone digits', () => {
  const footer = fs.readFileSync('src/components/layout/Footer.jsx', 'utf8');
  assert.match(footer, /<span className="whitespace-nowrap">Email: \{SUPPORT_EMAIL\}<\/span>/);
  assert.match(footer, /<span className="whitespace-nowrap">\{SUPPORT_PHONE_DISPLAY\}<\/span>/);
  assert.match(footer, /<span aria-hidden="true" className="mx-1">\/<\/span>/);
});

test('compact footer reserves horizontal space for the fixed support trigger', () => {
  const footer = fs.readFileSync('src/components/layout/Footer.jsx', 'utf8');
  const styles = fs.readFileSync('src/index.css', 'utf8');
  assert.match(footer, /app-footer--compact[\s\S]*app-footer-inner/);
  assert.match(styles, /\.app-shell\[data-support='visible'\] \.app-footer--compact \.app-footer-inner/);
  assert.match(styles, /padding-right: max\(7rem, calc\(6rem \+ var\(--safe-right\)\)\)/);
});

test('authenticated content reserves a desktop safe area beside the support trigger', () => {
  const styles = fs.readFileSync('src/index.css', 'utf8');
  assert.match(styles, /\.app-shell\[data-mobile-nav='visible'\]\[data-support='visible'\] \.app-main/);
  assert.match(styles, /padding-right: clamp\(5\.5rem, 7vw, 8rem\)/);
});

test('Tooltip exposes a keyboard-operable labelled control', () => {
  const markup = renderToStaticMarkup(React.createElement(components.Tooltip, { content: 'Helpful context' }, React.createElement('span', null, 'Info')));
  assert.match(markup, /<button[^>]+type="button"/);
  assert.doesNotMatch(markup, /role="button"/);
  assert.match(markup, /aria-label="Information: Helpful context"/);
  assert.match(markup, /aria-expanded="false"/);
  const tooltip = fs.readFileSync('src/components/ui/Tooltip.jsx', 'utf8');
  assert.match(tooltip, /event\.key === 'Escape'/);
});

test('workspace consent treatment covers the routes that actually exist', () => {
  const app = fs.readFileSync('src/App.jsx', 'utf8');
  assert.ok(app.includes('const WORKSPACE_ROUTE_PATTERN = /^\\/(dashboard|applications|analytics|auto-apply|profile|new|ai-generator|builder|preview|quick-resume)(\\/|$)/;'));
  assert.doesNotMatch(app, /WORKSPACE_ROUTE_PATTERN[^\n]*new-resume/);
});

test('analytics consent stays in page flow and avoids content overlap', () => {
  const shell = fs.readFileSync('src/components/layout/AppShellFrame.jsx', 'utf8');
  const banner = fs.readFileSync('src/components/AnalyticsConsentBanner.jsx', 'utf8');
  const styles = fs.readFileSync('src/index.css', 'utf8');
  const bodyStart = shell.indexOf('<div className="app-body">');
  const noticeRender = shell.indexOf('{!adminMode && topNotice}');
  const noticeStyles = styles.slice(styles.indexOf('.analytics-consent-notice'));

  assert.ok(bodyStart >= 0);
  assert.ok(noticeRender > bodyStart, 'consent must render inside the app body flow');
  assert.match(banner, /analytics-consent-notice/);
  assert.match(banner, /sm:flex-row sm:items-center sm:justify-between/);
  assert.match(noticeStyles, /\.analytics-consent-notice\s*\{/);
  assert.match(noticeStyles, /position: relative;/);
  assert.match(shell, /data-consent=\{consentPending \? 'visible' : 'hidden'\}/);
  assert.match(styles, /\.app-shell\[data-consent='visible'\] \.app-hero-viewport/);
});

test('ConfirmDialog exposes a labelled, keyboard-oriented destructive confirmation', () => {
  const markup = renderToStaticMarkup(React.createElement(components.ConfirmDialog, {
    request: {
      title: 'Delete this resume?',
      message: 'This cannot be undone.',
      confirmLabel: 'Delete resume',
      danger: true,
    },
    onConfirm() {},
    onCancel() {},
  }));
  assert.match(markup, /role="dialog"/);
  assert.match(markup, /aria-modal="true"/);
  assert.match(markup, /aria-labelledby="[^"]+"/);
  assert.match(markup, /aria-describedby="[^"]+"/);
  assert.match(markup, /data-confirm-cancel/);
  assert.match(markup, /data-confirm-primary/);
  assert.match(markup, />Delete resume<\/button>/);
  assert.match(markup, /bg-red-100/);
  assert.equal(renderToStaticMarkup(React.createElement(components.ConfirmDialog, { request: null, onConfirm() {}, onCancel() {} })), '');
});

for (const [name, passwordCount, autocomplete] of [['SignIn', 1, 'current-password'], ['SignUp', 2, 'new-password']]) {
  test(`${name} renders only one auth form with unique fields and correct autofill`, () => {
    const markup = renderToStaticMarkup(React.createElement(StaticRouter, { location: '/' },
      React.createElement(components.AuthProvider, null, React.createElement(components[name])),
    ));
    assert.equal([...markup.matchAll(/<form\b/g)].length, 1);
    assert.equal([...markup.matchAll(/type="email"/g)].length, 1);
    assert.equal([...markup.matchAll(/type="password"/g)].length, passwordCount);
    assert.ok(markup.includes(`autoComplete="${autocomplete}"`));
    assert.match(markup, /autoComplete="email"/);
    assert.match(markup, /name="email"/);
    assert.match(markup, /name="password"/);
    assert.doesNotMatch(markup, /placeholder="••••••••"/);
    assert.match(markup, name === 'SignIn' ? /placeholder="Enter your password"/ : /placeholder="Create a password"/);
    if (name === 'SignUp') assert.match(markup, /placeholder="Re-enter your password"/);
    const ids = [...markup.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    assert.equal(new Set(ids).size, ids.length, 'Auth form field IDs must be unique');
  });
}
