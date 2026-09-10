import assert from 'node:assert/strict';
import test from 'node:test';
import { componentHarness, textContent } from './helpers/componentHarness.js';

const subscriptionRow = (overrides = {}) => ({
  is_premium: false,
  premium_plan: null,
  premium_until: null,
  stripe_customer_id: null,
  ...overrides,
});

function setup(row) {
  const navigations = [];
  const app = componentHarness('src/pages/SubscriptionSuccess.jsx', {
    imports: {
      'react-router-dom': {
        Link: 'Link',
        useSearchParams: () => [new URLSearchParams()],
        useNavigate: () => (route, options) => navigations.push({ route, options }),
      },
      '../context/AuthContext': { useAuth: () => ({ user: { id: 'account-a' } }) },
      '../context/SubscriptionContext': { useSubscription: () => ({ refreshSubscriptionStatus: async () => {} }) },
      '../components/ui/Button': { default: 'Button' },
      'react-hot-toast': { default: { error() {}, loading() {}, success() {} } },
      '../services/supabase': {
        supabase: {
          from: () => ({
            select: () => ({
              eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }),
            }),
          }),
        },
      },
      '../services/stripeService': { verifyCheckoutSession: async () => { throw new Error('not expected'); } },
    },
  });
  return { app, navigations };
}

test('subscription success does not claim an inactive account was upgraded', async () => {
  const { app, navigations } = setup(subscriptionRow());
  app.render();
  await app.flush();
  await app.flush();
  const text = textContent(app.render());

  assert.ok(text.includes('Subscription status pending'));
  assert.ok(!text.includes('Subscription Successful!'));
  assert.ok(text.includes('Check Subscription Status'));
  assert.ok(text.includes('Return to Pricing'));
  assert.deepEqual(navigations, []);
});

test('subscription success confirms an active account before showing premium next steps', async () => {
  const { app } = setup(subscriptionRow({
    is_premium: true,
    premium_plan: 'premium_monthly',
    premium_until: '2027-01-01T00:00:00.000Z',
    stripe_customer_id: 'cus_test',
  }));
  app.render();
  await app.flush();
  await app.flush();
  const text = textContent(app.render());

  assert.ok(text.includes('Subscription Successful!'));
  assert.ok(text.includes('Your account has been upgraded'));
  assert.ok(text.includes('Go to Dashboard'));
  assert.ok(!text.includes('Subscription status pending'));
});
