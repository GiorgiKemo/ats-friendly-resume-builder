import assert from 'node:assert/strict';
import test from 'node:test';
import { componentHarness, deferred } from './helpers/componentHarness.js';

const subscriptionRow = (overrides = {}) => ({
  is_premium: false,
  premium_until: null,
  premium_plan: null,
  premium_updated_at: null,
  ai_generations_used: 0,
  ai_generations_limit: 0,
  stripe_customer_id: null,
  ...overrides,
});

test('a late subscription response cannot replace the current account entitlement', async () => {
  let user = { id: 'account-a' };
  const requests = [];
  const supabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => {
            const request = deferred();
            requests.push(request);
            return request.promise;
          },
        }),
      }),
    }),
  };
  const app = componentHarness('src/context/SubscriptionContext.jsx', {
    exportName: 'SubscriptionProvider',
    imports: {
      './AuthContext': { useAuth: () => ({ user }) },
      '../services/supabase': { supabase },
    },
  });

  app.render();
  assert.equal(requests.length, 1);

  user = { id: 'account-b' };
  app.render();
  assert.equal(requests.length, 2);

  requests[0].resolve({ data: subscriptionRow({ is_premium: true, ai_generations_limit: 30 }), error: null });
  await app.flush();
  assert.equal(app.render().props.value.isPremium, false);

  requests[1].resolve({ data: subscriptionRow(), error: null });
  await app.flush();
  assert.equal(app.render().props.value.isPremium, false);
  assert.equal(app.render().props.value.subscriptionData.isPremium, false);
});

test('unmount invalidates a pending subscription response', async () => {
  const request = deferred();
  const supabase = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => request.promise }) }) }),
  };
  const app = componentHarness('src/context/SubscriptionContext.jsx', {
    exportName: 'SubscriptionProvider',
    imports: {
      './AuthContext': { useAuth: () => ({ user: { id: 'account-a' } }) },
      '../services/supabase': { supabase },
    },
  });

  const before = app.render();
  app.unmount();
  request.resolve({ data: subscriptionRow({ is_premium: true }), error: null });
  await app.flush();
  assert.equal(app.render().props.value.isPremium, before.props.value.isPremium);
});
