import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadEdgeFunction } from './helpers/loadEdgeFunction.js';

const workerEnv = {
  SUPABASE_URL: 'https://supabase.example.test',
  SB_SECRET_KEY: 'service-role-test-key',
  SUPPORT_ATTACHMENT_SCANNER_SECRET: 'worker-secret',
  ATTACHMENT_SCANNER_URL: 'https://scanner.example.test/scan',
  ATTACHMENT_SCANNER_TOKEN: 'scanner-test-token',
};

const pdfBytes = new TextEncoder().encode('%PDF-1.7\nfixture');
const attachment = (overrides = {}) => ({
  attachmentId: '30000000-0000-4000-8000-000000000003',
  storagePath: 'conversation/attachment.pdf',
  originalName: 'attachment.pdf',
  declaredMime: 'application/pdf',
  byteSize: pdfBytes.byteLength,
  scanAttempts: 1,
  ...overrides,
});

function createWorker({
  env = {},
  claimed = [attachment()],
  bytes = pdfBytes,
  scannerResponse = new Response(JSON.stringify({ clean: true }), { status: 200 }),
  downloadError = null,
  claimError = null,
  completeError = null,
  createClient,
} = {}) {
  const calls = [];
  const requests = [];
  const client = {
    storage: {
      from: (bucket) => ({
        download: async (path) => {
          calls.push(['download', bucket, path]);
          return { data: downloadError ? null : new Blob([bytes]), error: downloadError };
        },
      }),
    },
    rpc: async (name, payload) => {
      calls.push([name, payload]);
      if (name === 'support_claim_attachment_scan') return { data: claimed, error: claimError };
      if (name === 'support_complete_attachment_scan') return { data: {}, error: completeError };
      if (name === 'support_release_attachment_scan') return { data: {}, error: null };
      throw new Error(`Unexpected RPC ${name}`);
    },
  };
  const { handler } = loadEdgeFunction('supabase/functions/support-attachment-scan/index.ts', {
    env: { ...workerEnv, ...env },
    imports: { supabase: { createClient: (...args) => (createClient || (() => client))(...args) } },
    fetch: async (url, options) => {
      requests.push({ url, options });
      return scannerResponse;
    },
  });
  return { handler, calls, requests };
}

const request = (secret = 'worker-secret') => new Request('https://edge.example.test/scan', {
  method: 'POST',
  headers: { 'x-support-attachment-scanner-secret': secret, 'content-type': 'application/json' },
  body: JSON.stringify({ limit: 1 }),
});

test('attachment scanner rejects unauthorized calls before creating a service client', async () => {
  let created = false;
  const worker = createWorker({ createClient: () => { created = true; throw new Error('unexpected client'); } });
  const response = await worker.handler(request('wrong-secret'));

  assert.equal(response.status, 401);
  assert.equal(created, false);
});

test('attachment scanner requires an HTTPS endpoint without embedded credentials before claiming work', async () => {
  for (const scannerUrl of ['http://scanner.example.test/scan', 'https://user:pass@scanner.example.test/scan']) {
    let created = false;
    const worker = createWorker({
      env: { ATTACHMENT_SCANNER_URL: scannerUrl },
      createClient: () => { created = true; throw new Error('must not claim work'); },
    });
    const response = await worker.handler(request());

    assert.equal(response.status, 503, scannerUrl);
    assert.equal(created, false, scannerUrl);
  }
});

test('size and magic-byte mismatches are blocked without sending file bytes to the scanner', async () => {
  const invalidPdfBytes = new TextEncoder().encode('not a PDF');
  const cases = [
    { item: attachment({ byteSize: pdfBytes.byteLength + 1 }), bytes: pdfBytes, code: 'size_mismatch' },
    { item: attachment({ byteSize: invalidPdfBytes.byteLength }), bytes: invalidPdfBytes, code: 'magic_mismatch' },
  ];

  for (const scenario of cases) {
    const worker = createWorker({ claimed: [scenario.item], bytes: scenario.bytes });
    const response = await worker.handler(request());
    const body = await response.json();
    const completion = worker.calls.find(([name]) => name === 'support_complete_attachment_scan');

    assert.equal(response.status, 200);
    assert.deepEqual(body, { ok: true, claimed: 1, clean: 0, blocked: 1, failed: 0 });
    assert.equal(completion[1].p_status, 'blocked');
    assert.equal(completion[1].p_scan_code, scenario.code);
    assert.equal(worker.requests.length, 0);
  }
});

test('scanner receives exact bytes and a clean verdict is persisted only after scanning succeeds', async () => {
  const worker = createWorker({
    claimed: [attachment({ originalName: 'attachment\r\nX-Forged: value.pdf' })],
    scannerResponse: new Response(JSON.stringify({ clean: true, code: 'clean:verified' }), { status: 200 }),
  });
  const response = await worker.handler(request());
  const body = await response.json();
  const completion = worker.calls.find(([name]) => name === 'support_complete_attachment_scan');
  const scanRequest = worker.requests[0];

  assert.equal(response.status, 200);
  assert.deepEqual(body, { ok: true, claimed: 1, clean: 1, blocked: 0, failed: 0 });
  assert.equal(scanRequest.url, workerEnv.ATTACHMENT_SCANNER_URL);
  assert.equal(scanRequest.options.headers.Authorization, 'Bearer scanner-test-token');
  assert.equal(scanRequest.options.headers['Content-Type'], 'application/pdf');
  assert.equal(scanRequest.options.headers['X-Attachment-Name'], 'attachment  X-Forged: value.pdf');
  assert.equal([...scanRequest.options.headers['X-Attachment-Name']].some((character) => {
    const code = character.charCodeAt(0);
    return code < 0x20 || code === 0x7f;
  }), false);
  assert.deepEqual([...new Uint8Array(scanRequest.options.body)], [...pdfBytes]);
  assert.equal(completion[1].p_status, 'clean');
  assert.equal(completion[1].p_scan_code, 'clean:verified');
});

test('malware verdicts are blocked and scanner codes are sanitized', async () => {
  const worker = createWorker({
    scannerResponse: new Response(JSON.stringify({ clean: false, code: 'virus:bad/name' }), { status: 200 }),
  });
  const response = await worker.handler(request());
  const body = await response.json();
  const completion = worker.calls.find(([name]) => name === 'support_complete_attachment_scan');

  assert.equal(response.status, 200);
  assert.deepEqual(body, { ok: true, claimed: 1, clean: 0, blocked: 1, failed: 0 });
  assert.equal(completion[1].p_status, 'blocked');
  assert.equal(completion[1].p_scan_code, 'virus:bad_name');
});

test('malformed, missing-verdict and failed scanner responses stay quarantined and retry safely', async () => {
  const cases = [
    { response: new Response('not JSON', { status: 200 }), code: 'scanner_invalid_response' },
    { response: new Response(JSON.stringify({ clean: true, code: 'x'.repeat(5000) }), { status: 200 }), code: 'scanner_invalid_response' },
    { response: new Response(JSON.stringify({ clean: 'true' }), { status: 200 }), code: 'scanner_missing_verdict' },
    { response: new Response('unavailable', { status: 502 }), code: 'scanner_http_502' },
  ];

  for (const scenario of cases) {
    const worker = createWorker({ scannerResponse: scenario.response });
    const response = await worker.handler(request());
    const body = await response.json();
    const release = worker.calls.find(([name]) => name === 'support_release_attachment_scan');

    assert.equal(response.status, 200);
    assert.deepEqual(body, { ok: true, claimed: 1, clean: 0, blocked: 0, failed: 1 });
    assert.equal(release[1].p_retry, true);
    assert.equal(release[1].p_scan_code, scenario.code);
  }
});

test('scanner failure on the fifth attempt is terminal and does not request another retry', async () => {
  const worker = createWorker({
    claimed: [attachment({ scanAttempts: 5 })],
    scannerResponse: new Response('unavailable', { status: 502 }),
  });
  const response = await worker.handler(request());
  const release = worker.calls.find(([name]) => name === 'support_release_attachment_scan');

  assert.equal(response.status, 200);
  assert.equal(release[1].p_retry, false);
  assert.equal(release[1].p_scan_code, 'scanner_http_502');
});

test('storage or scan-result persistence failures never grant clean status', async () => {
  const failedDownload = createWorker({ downloadError: new Error('storage unavailable') });
  const downloadResponse = await failedDownload.handler(request());
  const downloadRelease = failedDownload.calls.find(([name]) => name === 'support_release_attachment_scan');
  assert.equal(downloadResponse.status, 200);
  assert.equal(downloadRelease[1].p_scan_code, 'storage_download_failed');
  assert.equal(failedDownload.requests.length, 0);

  const failedCompletion = createWorker({ completeError: new Error('database unavailable') });
  const completionResponse = await failedCompletion.handler(request());
  const completionBody = await completionResponse.json();
  const completionRelease = failedCompletion.calls.find(([name]) => name === 'support_release_attachment_scan');
  assert.equal(completionResponse.status, 200);
  assert.equal(completionBody.clean, 0);
  assert.equal(completionBody.failed, 1);
  assert.equal(completionRelease[1].p_retry, true);
});
