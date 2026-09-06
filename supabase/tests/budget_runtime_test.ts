import { syncAiQuotaForSubscription } from '../functions/_shared/aiQuotaBilling.ts';
import { isPublicAddress, parsePublicWebUrl } from '../functions/_shared/publicWebFetch.ts';

const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };

Deno.test('quota sync uses the real Deno runtime and passes only the trusted billing period', async () => {
  const calls: Array<{ name: string; payload: Record<string, unknown> }> = [];
  await syncAiQuotaForSubscription({ rpc: async (name, payload) => { calls.push({ name, payload }); return { error: null }; } }, 'user-1', { current_period_start: 1706745600 });
  assert(calls[0].name === 'sync_ai_quota_period_for_user', 'wrong RPC');
  assert(calls[0].payload.p_period_start === '2024-02-01T00:00:00.000Z', 'wrong period');
});

Deno.test('quota sync fails on missing provider periods and transient database errors', async () => {
  let rejected = 0;
  const client = { rpc: async () => ({ error: { message: 'offline' } }) };
  for (const subscription of [{}, { current_period_start: 1706745600 }]) {
    try { await syncAiQuotaForSubscription(client, 'user-1', subscription); } catch { rejected++; }
  }
  assert(rejected === 2, 'billing failure must remain retryable');
});

Deno.test('Deno URL parsing rejects encoded loopback and mapped IPv6 targets', () => {
  let rejected = 0;
  for (const url of ['http://2130706433/', 'http://0x7f000001/', 'http://[::ffff:127.0.0.1]/']) {
    try { parsePublicWebUrl(url); } catch { rejected++; }
  }
  assert(rejected === 3, 'unsafe URL accepted');
  assert(!isPublicAddress('169.254.169.254') && isPublicAddress('8.8.8.8'), 'address policy failed');
});
