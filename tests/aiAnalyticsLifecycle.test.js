import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadEdgeFunction } from './helpers/loadEdgeFunction.js';

function loadAiAccess() {
  const inserts = [];
  const client = {
    rpc: async () => ({ data: null, error: null }),
    from(table) {
      assert.equal(table, 'analytics_events');
      return {
        insert(values) {
          inserts.push(values);
          return { select: () => ({ maybeSingle: async () => ({ data: { id: 'opaque-event-id' }, error: null }) }) };
        },
      };
    },
  };
  const { exports } = loadEdgeFunction('supabase/functions/_shared/aiAccess.ts', {
    env: {
      NODE_ENV: 'production',
      SUPABASE_URL: 'https://project.supabase.co',
      SB_SECRET_KEY: 'server-only-test-key',
    },
    imports: { 'https://esm.sh/@supabase/supabase-js@2': { createClient: () => client } },
  });
  return { exports, inserts };
}

test('AI analytics requires explicit consent from a production customer origin', () => {
  const { exports } = loadAiAccess();
  const createRequest = (origin, consent) => new Request('https://project.supabase.co/functions/v1/openrouter-proxy', {
    headers: { Origin: origin, ...(consent ? { 'X-Analytics-Consent': consent } : {}) },
  });

  assert.equal(exports.hasAnalyticsConsent(createRequest('https://www.resumeats.cv', 'granted')), true);
  assert.equal(exports.hasAnalyticsConsent(createRequest('https://www.resumeats.cv', 'denied')), false);
  assert.equal(exports.hasAnalyticsConsent(createRequest('http://localhost:5173', 'granted')), false);
  assert.equal(exports.hasAnalyticsConsent(createRequest('https://preview.resumeats.cv', 'granted')), false);
  assert.equal(exports.hasAnalyticsConsent(createRequest('https://www.resumeats.cv', undefined)), false);
});

test('AI analytics stores only allowlisted lifecycle metadata and never stores content', async () => {
  const { exports, inserts } = loadAiAccess();
  const common = {
    consented: true,
    attemptId: '019ced31-b481-7d61-8115-69e389246dda',
    userId: 'verified-user-id',
    feature: 'application_answer',
    provider: 'openrouter',
    model: 'allowed-model',
  };

  await exports.recordAiGenerationEvent({ ...common, eventName: 'ai_generation_started' });
  await exports.recordAiGenerationEvent({
    ...common,
    eventName: 'ai_generation_completed',
    durationMs: 1250.9,
  });
  await exports.recordAiGenerationEvent({
    ...common,
    eventName: 'ai_generation_failed',
    durationMs: -1,
    failureCode: 'provider_http_error',
    prompt: 'private prompt content',
    result: 'private generated content',
  });

  assert.deepEqual(inserts.map(({ event_name: name }) => name), [
    'ai_generation_started', 'ai_generation_completed', 'ai_generation_failed',
  ]);
  assert.equal(inserts[0].event_key, `ai:${common.attemptId}:ai_generation_started`);
  assert.equal(inserts[1].properties.duration_ms, 1250);
  assert.equal(inserts[2].properties.duration_ms, 0);
  assert.equal(inserts[2].properties.failure_code, 'provider_http_error');
  for (const { properties } of inserts) {
    assert.equal(properties.feature, 'application_answer');
    assert.equal(properties.model, 'allowed-model');
    assert.equal(properties.cost_version, 'unpriced');
    assert.equal('prompt' in properties, false);
    assert.equal('result' in properties, false);
  }
});

test('AI analytics does not write without consent or with an invalid attempt ID', async () => {
  const { exports, inserts } = loadAiAccess();
  const event = {
    consented: false,
    attemptId: '019ced31-b481-7d61-8115-69e389246dda',
    userId: 'verified-user-id',
    eventName: 'ai_generation_started',
    feature: 'resume_generation',
  };

  assert.equal(await exports.recordAiGenerationEvent(event), false);
  assert.equal(await exports.recordAiGenerationEvent({ ...event, consented: true, attemptId: 'not-a-uuid' }), false);
  assert.equal(inserts.length, 0);
});
