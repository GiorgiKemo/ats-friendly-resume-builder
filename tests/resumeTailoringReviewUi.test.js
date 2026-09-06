import test from 'node:test';
import assert from 'node:assert/strict';
import PropTypes from 'prop-types';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { componentHarness, deferred, find, textContent, visit } from './helpers/componentHarness.js';
import * as reviewApi from '../src/utils/resumeTailoringReview.js';

const makeReview = (suffix = '') => {
  const baseResume = { personalInfo: { summary: 'Source summary.' }, workExperience: [{ title: 'Analyst', company: 'Example', description: 'Source work.' }], projects: [{ title: 'Class exercise', description: 'Source project.' }] };
  const candidateResume = structuredClone(baseResume);
  candidateResume.personalInfo.summary = `Suggested summary${suffix}.`;
  candidateResume.workExperience[0].description = `Suggested work${suffix}.`;
  candidateResume.projects[0].description = `Suggested project${suffix}.`;
  return reviewApi.createResumeTailoringReview({ baseResume, candidateResume, targetJobTitle: 'Engineer' });
};
function setup({ controlled = false, initialDecisions = {}, onComplete, review = makeReview() } = {}) {
  const completed = [];
  let props = { review, onComplete: onComplete || ((resume) => { completed.push(resume); }) };
  if (controlled) Object.assign(props, { decisions: initialDecisions, onDecisionsChange: (next) => { props = { ...props, decisions: next }; app.setProps(props); } });
  const app = componentHarness('src/components/resume/ResumeTailoringReview.jsx', {
    props,
    imports: {
      'prop-types': { default: PropTypes },
      '../ui/Button': { default: 'Button' }, '../ui/Textarea': { default: 'Textarea' },
      '../../utils/resumeTailoringReview': reviewApi,
    },
  });
  app.render();
  const buttons = (label) => visit(app.render(), (node) => node.type === 'Button' && textContent(node) === label);
  return {
    ...app, completed, buttons,
    changeReview: (next, decisions = {}) => { props = { ...props, review: next, ...(controlled ? { decisions } : {}) }; app.setProps(props); },
    complete: () => buttons('Use reviewed resume')[0],
    status: () => textContent(find(app.render(), (node) => node.props?.role === 'status')),
  };
}

test('shared review starts unselected, describes uncertainty and cannot materialize unresolved wording', async () => {
  const app = setup();
  assert.equal(app.completed.length, 0);
  assert.equal(app.complete().props.disabled, true);
  assert.match(app.status(), /3 of 3/);
  assert.match(textContent(app.render()), /does not verify its truth/);
  assert.equal(app.buttons('Use suggestion').length, 3);
  for (const button of app.buttons('Use suggestion')) assert.equal(button.props['aria-pressed'], false);
  await app.complete().props.onClick();
  assert.equal(app.completed.length, 0);
  assert.ok(find(app.render(), (node) => node.props?.role === 'alert'));
});

test('risky suggestions expose a confirmation control and stay blocked until it is checked', async () => {
  const baseResume = { personalInfo: { summary: 'Support engineer improving customer workflows.' }, workExperience: [], projects: [] };
  const candidateResume = { personalInfo: { summary: 'Executive engineering leader with global hiring and budget ownership.' }, workExperience: [], projects: [] };
  const app = setup({ review: reviewApi.createResumeTailoringReview({ baseResume, candidateResume }) });
  assert.match(textContent(app.render()), /Potential factual-risk claim/);
  app.buttons('Use suggestion')[0].props.onClick();
  assert.equal(app.complete().props.disabled, true);
  assert.match(app.status(), /accuracy confirmation/);
  const checkbox = find(app.render(), (node) => node.type === 'input' && node.props?.type === 'checkbox');
  assert.ok(checkbox);
  checkbox.props.onChange({ target: { checked: true } });
  assert.equal(app.complete().props.disabled, false);
  await app.complete().props.onClick();
  assert.equal(app.completed[0].personalInfo.summary, 'Executive engineering leader with global hiring and budget ownership.');
});

test('remaining-original action preserves chosen suggestions and exact manual edits', async () => {
  const app = setup();
  app.buttons('Use suggestion')[0].props.onClick();
  app.buttons('Edit wording')[1].props.onClick();
  const edited = '  My limited contribution: > 2 trials.\nNot a production result.  ';
  find(app.render(), (node) => node.type === 'Textarea').props.onChange({ target: { value: edited } });
  app.buttons('Keep originals for remaining changes')[0].props.onClick();
  assert.equal(app.complete().props.disabled, false);
  await app.complete().props.onClick();
  assert.equal(app.completed.length, 1);
  assert.equal(app.completed[0].personalInfo.summary, 'Suggested summary.');
  assert.equal(app.completed[0].workExperience[0].description, edited);
  assert.equal(app.completed[0].projects[0].description, 'Source project.');
});

test('each explicit original decision materializes the captured source rather than the proposal', async () => {
  const app = setup();
  for (const button of app.buttons('Keep original')) button.props.onClick();
  await app.complete().props.onClick();
  assert.equal(app.completed[0].personalInfo.summary, 'Source summary.');
  assert.equal(app.completed[0].workExperience[0].description, 'Source work.');
});

test('rapid duplicate completion is single-flight and a failed callback preserves choices for retry', async () => {
  const requests = [];
  const app = setup({ onComplete: (resume) => { const request = deferred(); requests.push({ ...request, resume }); return request.promise; } });
  app.buttons('Keep originals for remaining changes')[0].props.onClick();
  const button = app.complete();
  const first = button.props.onClick();
  await button.props.onClick();
  assert.equal(requests.length, 1);
  requests[0].reject(new Error('Save unavailable'));
  await first;
  assert.match(textContent(find(app.render(), (node) => node.props?.role === 'alert')), /Save unavailable/);
  assert.equal(app.complete().props.disabled, false);
  const retry = app.complete().props.onClick();
  requests[1].resolve();
  await retry;
  assert.equal(requests.length, 2);
});

test('new review clears local choices and old captured callbacks cannot resolve it', async () => {
  const app = setup();
  app.buttons('Keep originals for remaining changes')[0].props.onClick();
  const old = app.complete().props.onClick;
  app.changeReview(makeReview(' changed'));
  assert.match(app.status(), /3 of 3/);
  await old();
  assert.equal(app.completed.length, 0);
  assert.equal(app.complete().props.disabled, true);
});

test('controlled decisions restore for their review and a parent review reset leaves new wording undecided', () => {
  const review = makeReview();
  const initialDecisions = Object.fromEntries(review.suggestions.map(({ id }) => [id, { choice: 'original', reviewId: review.reviewId }]));
  const app = setup({ controlled: true, review, initialDecisions });
  assert.equal(app.complete().props.disabled, false);
  assert.match(app.status(), /Every wording/);
  app.changeReview(makeReview(' changed'), {});
  assert.equal(app.complete().props.disabled, true);
  assert.match(app.status(), /3 of 3/);
});

test('stale controlled choices remain undecided when the parent replaces the review without clearing its map', async () => {
  const previous = makeReview();
  const oldDecisions = Object.fromEntries(previous.suggestions.map(({ id }) => [id, { choice: 'suggested', reviewId: previous.reviewId }]));
  const app = setup({ controlled: true, review: previous, initialDecisions: oldDecisions });
  app.changeReview(makeReview(' changed'), oldDecisions);
  assert.equal(app.complete().props.disabled, true);
  assert.match(app.status(), /3 of 3/);
  await app.complete().props.onClick();
  assert.equal(app.completed.length, 0);
});

test('invalid review packets show an accessible blocking error without completion controls', () => {
  const app = setup({ review: { kind: 'resume-tailoring-review', version: 999 } });
  assert.ok(find(app.render(), (node) => node.props?.role === 'alert'));
  assert.equal(app.complete(), undefined);
  assert.equal(app.completed.length, 0);
});

test('real shared UI SSR supplies labelled choices, status and edit controls with a responsive comparison layout', async () => {
  const vite = await createServer({
    configFile: false, cacheDir: 'node_modules/.vite-qa-review-ui',
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom', esbuild: { jsx: 'automatic' },
  });
  try {
    const Component = (await vite.ssrLoadModule('/src/components/resume/ResumeTailoringReview.jsx')).default;
    const review = makeReview();
    const markup = renderToStaticMarkup(React.createElement(Component, {
      review, onComplete() {}, onDecisionsChange() {},
      decisions: { summary: { choice: 'edited', reviewId: review.reviewId, text: 'My limited contribution.' } },
    }));
    assert.match(markup, /role="status"/);
    assert.match(markup, /2 of 3 changes need a choice/);
    assert.equal((markup.match(/<fieldset/g) || []).length, 3);
    assert.match(markup, /aria-pressed="true"/);
    assert.match(markup, /lg:grid-cols-2/);
    assert.match(markup, /AI suggestion — not fact-checked/);
    const textareaId = markup.match(/<textarea[^>]*id="([^"]+)"/)?.[1];
    assert.ok(textareaId);
    assert.ok(markup.includes(`for="${textareaId}"`));
    assert.match(markup, /Your wording — Professional summary/);
    assert.ok(!markup.includes('Accept all'));
  } finally {
    await vite.close();
  }
});
