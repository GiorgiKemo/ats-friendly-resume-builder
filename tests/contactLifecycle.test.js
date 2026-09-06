import test from 'node:test';
import assert from 'node:assert/strict';
import { componentHarness, deferred, find } from './helpers/componentHarness.js';
import * as supportInfo from '../src/config/supportInfo.js';

function setup() {
  const request = deferred();
  const submissions = [];
  const notifications = [];
  const app = componentHarness('src/pages/Contact.jsx', {
    imports: {
      '../components/ui/Button': { default: 'Button' },
      '../components/ui': { PageHero: 'PageHero' },
      'react-hot-toast': { default: { success: (text) => notifications.push(text), error: (text) => notifications.push(text) } },
      'framer-motion': { motion: { div: 'div', section: 'section' } },
      '../utils/animationVariants': { fadeInLeft: {}, fadeInRight: {} },
      '../config/supportInfo': supportInfo,
      '../services/publicEngagementService': { submitContactInquiry: (data) => { submissions.push(data); return request.promise; } },
    },
  });
  const change = (name, value) => find(app.render(), (node) => node.props?.name === name).props.onChange({ target: { name, value } });
  const submit = () => find(app.render(), (node) => node.type === 'form').props.onSubmit({ preventDefault() {} });
  return { ...app, request, submissions, notifications, change, submit };
}

test('support submission is single-flight and does not erase newer writing', async () => {
  const app = setup();
  app.change('message', 'Original question');
  const pending = app.submit();
  await app.submit();
  assert.equal(app.submissions.length, 1);
  app.change('message', 'A newer draft');
  app.request.resolve();
  await pending;
  const tree = app.render();
  assert.equal(find(tree, (node) => node.props?.name === 'message').props.value, 'A newer draft');
  assert.ok(find(tree, (node) => node.props?.role === 'status'));
});

test('support success clears only the submitted draft; failure preserves it with a persistent error', async () => {
  for (const fails of [false, true]) {
    const app = setup();
    app.change('message', 'Original question');
    const pending = app.submit();
    if (fails) app.request.reject(new Error('Offline'));
    else app.request.resolve();
    await pending;
    const tree = app.render();
    assert.equal(find(tree, (node) => node.props?.name === 'message').props.value, fails ? 'Original question' : '');
    assert.ok(find(tree, (node) => node.props?.role === (fails ? 'alert' : 'status')));
  }
});

test('support responses after navigation do not announce success on a different page', async () => {
  const app = setup();
  const pending = app.submit();
  app.unmount();
  app.request.resolve();
  await pending;
  assert.deepEqual(app.notifications, []);
});
