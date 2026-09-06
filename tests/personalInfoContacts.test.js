import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { componentHarness, find } from './helpers/componentHarness.js';
import { splitPhoneNumber } from '../src/utils/phoneNumber.js';

const savedPersonal = { fullName: 'Alex Morgan', email: 'alex.morgan@example.com', phone: '+1 202 555 0142',
  location: 'Austin, TX', summary: 'Source summary.' };

function form() {
  let currentResume = { personalInfo: {} };
  const writes = [];
  const app = componentHarness('src/components/resume/PersonalInfoSection.jsx', {
    imports: {
      '../../context/ResumeContext': { useResume: () => ({ currentResume,
        updateCurrentResume: (update) => { writes.push(update); currentResume = { ...currentResume, ...update }; },
      }) },
      '../ui/Input': { default: 'Input' }, '../ui/Textarea': { default: 'Textarea' },
      '../ui/PhoneInputWithCountry': { default: 'PhoneInput' },
    },
  });
  return { ...app, writes, load: (personalInfo) => { currentResume = { personalInfo }; return app.render(); },
    input: (name) => find(app.render(), (node) => node.props?.name === name),
  };
}

test('builder contact fields immediately reflect loaded resume values after an initially empty form', () => {
  const app = form();
  assert.equal(app.input('email').props.value, '');
  assert.equal(app.input('phone').props.value, '');
  app.load(savedPersonal);
  assert.equal(app.input('email').props.value, savedPersonal.email);
  assert.equal(app.input('phone').props.value, savedPersonal.phone);
  assert.equal(splitPhoneNumber(app.input('phone').props.value).number, '202 555 0142');
  assert.deepEqual(app.writes, []);
});

test('editing an unrelated personal field preserves both loaded contacts in the next resume update', () => {
  const app = form();
  app.load(savedPersonal);
  app.input('location').props.onChange({ target: { name: 'location', value: 'Dallas, TX' } });
  assert.equal(app.writes[0].personalInfo.email, savedPersonal.email);
  assert.equal(app.writes[0].personalInfo.phone, savedPersonal.phone);
  assert.equal(app.writes[0].personalInfo.location, 'Dallas, TX');
  assert.equal(app.input('email').props.value, savedPersonal.email);
  assert.equal(app.input('phone').props.value, savedPersonal.phone);
});

test('resume headline guidance distinguishes current experience from an aspirational target', () => {
  const app = form();
  const headline = app.input('jobTitle');
  assert.equal(headline.props.label, 'Resume headline');
  assert.equal(headline.props['aria-describedby'], 'resume-headline-help');
  const help = find(app.render(), (node) => node.props?.id === 'resume-headline-help');
  assert.match(help.props.children, /actual experience/);
  assert.match(help.props.children, /Target role: Software Engineer/);
  assert.match(help.props.children, /leave this blank/);
});

test('editing or clearing a resume headline preserves the exact manual value and existing contacts', () => {
  const app = form();
  app.load({ ...savedPersonal, jobTitle: 'Target role: CEO' });
  for (const value of ['Operations specialist — pursuing leadership', '']) {
    app.input('jobTitle').props.onChange({ target: { name: 'jobTitle', value } });
    const saved = app.writes.at(-1).personalInfo;
    assert.equal(saved.jobTitle, value);
    assert.equal(app.input('jobTitle').props.value, value);
    assert.equal(saved.email, savedPersonal.email);
    assert.equal(saved.phone, savedPersonal.phone);
  }
});

test('real email and country-phone controls render nonempty saved HTML values without emitting blank changes', async () => {
  const vite = await createServer({ configFile: false, cacheDir: 'node_modules/.vite-qa-contact-inputs',
    optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom', esbuild: { jsx: 'automatic' },
  });
  try {
    const Input = (await vite.ssrLoadModule('/src/components/ui/Input.jsx')).default;
    const Phone = (await vite.ssrLoadModule('/src/components/ui/PhoneInputWithCountry.jsx')).default;
    let changes = 0;
    const markup = renderToStaticMarkup(React.createElement(React.Fragment, null,
      React.createElement(Input, { id: 'email', name: 'email', label: 'Email', type: 'email', value: savedPersonal.email, onChange: () => { changes += 1; } }),
      React.createElement(Phone, { id: 'phone', name: 'phone', label: 'Phone', value: savedPersonal.phone, onChange: () => { changes += 1; } }),
    ));
    assert.match(markup, /<input[^>]*id="email"[^>]*value="alex\.morgan@example\.com"/);
    assert.match(markup, /<input[^>]*id="phone"[^>]*value="202 555 0142"/);
    assert.match(markup, /<option value="US" selected="">\+1/);
    assert.equal(changes, 0);
  } finally {
    await vite.close();
  }
});
