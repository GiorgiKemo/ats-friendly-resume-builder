import test from 'node:test';
import assert from 'node:assert/strict';
import { componentHarness, find } from './helpers/componentHarness.js';

const render = (subscription) => componentHarness('src/components/premium/SubscriptionStatus.jsx', {
  imports: {
    '../../context/SubscriptionContext': { useSubscription: () => subscription },
    '../ui/Button': { default: 'Button' },
    './SubscriptionManager': { default: 'SubscriptionManager' },
    '../../config/stripePlans': { getPremiumPlanLabel: () => 'Monthly' },
  },
}).render();

test('subscription allowance bar represents remaining, not used, generations', () => {
  for (const [remaining, expected] of [[20, '100%'], [15, '75%'], [0, '0%']]) {
    const tree = render({ isPremium: true, subscriptionData: { remainingGenerations: remaining, aiGenerationsUsed: 20 - remaining, aiGenerationsLimit: 20 } });
    assert.equal(find(tree, (node) => node.props?.style?.width).props.style.width, expected);
  }
});

test('free-plan upgrade uses a single link control', () => {
  const button = find(render({ isPremium: false }), (node) => node.type === 'Button');
  assert.equal(button.props.as, 'link');
  assert.equal(button.props.to, '/pricing');
});
