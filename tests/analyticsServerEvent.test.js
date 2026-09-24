import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadEdgeFunction } from './helpers/loadEdgeFunction.js';

const { exports: { recordServerAnalyticsEvent } } = loadEdgeFunction('supabase/functions/_shared/analytics.ts');

function fixture({ insertResult, existingResult } = {}) {
  const calls = [];
  const db = {
    from(table) {
      assert.equal(table, 'analytics_events');
      return {
        insert(values) {
          calls.push(['insert', values]);
          return {
            select(columns) {
              calls.push(['insert-select', columns]);
              return { maybeSingle: async () => insertResult || { data: { id: 'event-uuid' }, error: null } };
            },
          };
        },
        select(columns) {
          calls.push(['select', columns]);
          return {
            eq(column, value) {
              calls.push(['eq', column, value]);
              return { maybeSingle: async () => existingResult || { data: { id: 'event-uuid' }, error: null } };
            },
          };
        },
      };
    },
  };
  return { calls, db };
}

test('server analytics insert returns its opaque row UUID', async () => {
  const { calls, db } = fixture();
  const id = await recordServerAnalyticsEvent(db, {
    eventKey: 'stripe:purchase:in_fixture', eventName: 'purchase_confirmed', provider: 'stripe',
  });
  assert.equal(id, 'event-uuid');
  assert.deepEqual(calls.map(([kind]) => kind), ['insert', 'insert-select']);
});

test('server analytics duplicate returns the existing opaque UUID by idempotency key', async () => {
  const { calls, db } = fixture({ insertResult: { data: null, error: { code: '23505' } } });
  const id = await recordServerAnalyticsEvent(db, {
    eventKey: 'paypal:purchase:txn_fixture', eventName: 'purchase_confirmed', provider: 'paypal',
  });
  assert.equal(id, 'event-uuid');
  assert.deepEqual(calls.slice(1), [
    ['insert-select', 'id'], ['select', 'id'], ['eq', 'event_key', 'paypal:purchase:txn_fixture'],
  ]);
});

test('server analytics persistence errors remain explicit', async () => {
  const { db } = fixture({ insertResult: { data: null, error: { code: '42501' } } });
  await assert.rejects(
    recordServerAnalyticsEvent(db, { eventKey: 'event', eventName: 'purchase_confirmed' }),
    /Could not record first-party analytics event/,
  );
});
