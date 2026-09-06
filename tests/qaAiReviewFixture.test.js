import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createQaServer } from './fixtures/qa-server.mjs';

async function fixture(t, options) {
  const { server, state } = createQaServer(options);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (route, init = {}) => fetch(`${base}${route}`, {
    method: 'POST', headers: { authorization: 'Bearer synthetic-local-test', 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'SYNTHETIC SOURCE ONLY' }] }), ...init,
  });
  return { request, state };
}

test('synthetic AI remains disabled unless explicitly opted in', async (t) => {
  const app = await fixture(t, {});
  assert.equal((await app.request('/functions/v1/openrouter-proxy')).status, 403);
  assert.equal((await app.request('/functions/v1/groq-proxy')).status, 403);
});

test('opt-in AI fixture returns reviewable synthetic prose only on two allowlisted routes', async (t) => {
  const app = await fixture(t, { aiReview: true });
  for (const route of ['openrouter-proxy', 'groq-proxy']) {
    const response = await app.request(`/functions/v1/${route}`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.fixture, true);
    const candidate = JSON.parse(payload.choices[0].message.content);
    assert.notEqual(candidate.personalInfo.summary, app.state.profile.personal.summary);
    assert.equal(candidate.workExperience[0].company, app.state.profile.work_experience[0].company);
  }
  for (const route of ['auto-apply-run', 'stripe-create-checkout', 'send-email', 'openrouter-proxy/other']) {
    assert.equal((await app.request(`/functions/v1/${route}`)).status, 403);
  }
  assert.equal((await app.request('/functions/v1/openrouter-proxy', { method: 'GET', body: undefined })).status, 403);
  assert.equal((await app.request('/functions/v1/openrouter-proxy', { headers: {} })).status, 401);
});

test('AI fixture CORS permits the real SDK request headers only from local origins', async (t) => {
  const app = await fixture(t, { aiReview: true });
  const preflight = await app.request('/functions/v1/openrouter-proxy', {
    method: 'OPTIONS', body: undefined, headers: { origin: 'http://127.0.0.1:5174' },
  });
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('access-control-allow-headers'), /x-request-type/);
  assert.match(preflight.headers.get('access-control-allow-headers'), /x-request-timeout/);
  assert.equal((await app.request('/functions/v1/openrouter-proxy', { headers: { origin: 'https://external.example' } })).status, 403);
});
