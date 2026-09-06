import assert from 'node:assert/strict';
import { test } from 'node:test';
import { componentHarness, deferred, find, textContent } from './helpers/componentHarness.js';

function setup({ isPremium = true, stripeCustomerId = 'cus_test', subscriptionLoading = false } = {}) {
  let user = { id: 'user-a' };
  const requests = [];
  const redirects = [];
  const navigations = [];
  const app = componentHarness('src/pages/SubscriptionManage.jsx', {
    imports: {
      '../context/AuthContext': { useAuth: () => ({ user }) },
      '../context/SubscriptionContext': { useSubscription: () => ({ isPremium, loading: subscriptionLoading, subscriptionData: { stripeCustomerId, premiumPlan: 'premium_yearly', premiumUntil: '2027-01-01', aiGenerationsUsed: 4, aiGenerationsLimit: 30 } }) },
      'react-router-dom': { useSearchParams: () => [new URLSearchParams()], useNavigate: () => (path) => navigations.push(path) },
      '../components/ui/Button': { default: 'Button' },
      '../config/supportInfo': { SUPPORT_EMAIL: 'support@example.test' },
      '../services/stripeService': { createCustomerPortalSession: (...args) => { const request = deferred(); requests.push({ ...request, args }); return request.promise; } },
    },
    globals: { window: { location: { origin: 'https://resumeats.cv', href: 'https://resumeats.cv/#/subscription/manage', assign: (url) => redirects.push(url) } } },
  });
  const billingButton = () => find(app.render(), (node) => node.type === 'Button' && /Stripe|billing again/.test(textContent(node)));
  app.render();
  return { ...app, requests, redirects, navigations, billingButton, setUser: (next) => { user = next; app.render(); } };
}

test('subscription management opens the actual billing portal without locally changing entitlement', async () => {
  const app = setup();
  assert.match(textContent(app.render()), /Premium \(Yearly\)/);
  const click = app.billingButton().props.onClick();
  await app.billingButton().props.onClick();
  assert.equal(app.requests.length, 1);
  assert.equal(app.requests[0].args[1], false);
  assert.equal(app.billingButton().props.disabled, true);
  assert.equal(app.billingButton().props['aria-busy'], true);
  app.requests[0].resolve('https://billing.stripe.com/p/session/test_session');
  await click;
  assert.deepEqual(app.redirects, ['https://billing.stripe.com/p/session/test_session']);
});

test('billing failures have an accessible unchanged-subscription message and retry', async () => {
  const app = setup();
  const click = app.billingButton().props.onClick();
  app.requests[0].reject(new Error('Provider unavailable'));
  await click;
  const alert = find(app.render(), (node) => node.props?.role === 'alert');
  assert.match(textContent(alert), /subscription has not been changed/);
  assert.equal(app.billingButton().props.disabled, false);
  assert.equal(app.billingButton().props['aria-describedby'], 'billing-portal-error');
  const retry = app.billingButton().props.onClick();
  app.requests[1].resolve('https://billing.stripe.com/p/session/retry');
  await retry;
  assert.deepEqual(app.redirects, ['https://billing.stripe.com/p/session/retry']);
});

test('local fallback and unsafe URLs do not loop back or pretend cancellation succeeded', async () => {
  for (const url of ['https://resumeats.cv/#/subscription/manage', 'javascript:alert(1)', 'http://billing.stripe.com/session']) {
    const app = setup();
    const click = app.billingButton().props.onClick();
    app.requests[0].resolve(url);
    await click;
    assert.equal(app.redirects.length, 0);
    assert.ok(find(app.render(), (node) => node.props?.role === 'alert'));
  }
});

test('account changes and unmount prevent an old billing response from redirecting', async () => {
  for (const abandon of [(app) => app.setUser({ id: 'user-b' }), (app) => app.unmount()]) {
    const app = setup();
    const click = app.billingButton().props.onClick();
    abandon(app);
    app.requests[0].resolve('https://billing.stripe.com/p/session/old-user');
    await click;
    assert.equal(app.redirects.length, 0);
  }
});

test('existing billing customers keep portal access after premium expires; new free users see plans', () => {
  assert.ok(setup({ isPremium: false }).billingButton());
  const free = setup({ isPremium: false, stripeCustomerId: null });
  assert.equal(free.billingButton(), undefined);
  assert.match(textContent(free.render()), /No Active Subscription/);
  const pending = setup({ subscriptionLoading: true });
  assert.equal(pending.billingButton(), undefined);
  assert.ok(find(pending.render(), (node) => node.props?.role === 'status'));
});
