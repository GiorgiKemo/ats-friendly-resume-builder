import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { loadEdgeFunction } from './helpers/loadEdgeFunction.js';

const supabaseImport = 'https://esm.sh/@supabase/supabase-js@2';

const preferences = (defaultResumeId = null) => ({
  id: 'prefs-1',
  user_id: 'user-1',
  job_titles: ['Engineer'],
  skills: ['JavaScript'],
  locations: [],
  remote_preference: 'remote',
  experience_level: 'mid',
  salary_min: null,
  salary_max: null,
  industries: [],
  excluded_companies: [],
  is_active: true,
  daily_limit: 1,
  speed: 'normal',
  sender_name: 'Candidate',
  reply_to_email: 'candidate@example.com',
  default_resume_id: defaultResumeId,
});

function loadRun({ defaultResumeId = null } = {}) {
  const calls = [];
  const outbound = [];
  const attachmentCalls = [];
  const client = {
    rpc: async (name, payload) => {
      calls.push([name, payload]);
      if (name === 'claim_auto_apply_run') return { data: [{ allowed: true, run_id: 'run-1', remaining: 1 }], error: null };
      if (name === 'reserve_auto_apply_job_slot') return { data: true, error: null };
      return { data: true, error: null };
    },
    from: (table) => {
      calls.push(['from', table]);
      let result = table === 'job_preferences'
        ? { data: preferences(defaultResumeId), error: null }
        : table === 'auto_apply_jobs'
          ? { data: [], error: null }
          : { data: null, error: null };
      const query = {
        select: (...args) => { calls.push(['select', ...args]); return query; },
        eq: (...args) => { calls.push(['eq', ...args]); return query; },
        update: (payload) => { calls.push(['update', payload]); result = { data: null, error: null }; return query; },
        insert: (payload) => {
          calls.push(['insert', payload]);
          result = { data: { id: 'job-1' }, error: null };
          return query;
        },
        single: () => Promise.resolve(result),
        maybeSingle: () => Promise.resolve(result),
        then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
      };
      return query;
    },
  };

  const loaded = loadEdgeFunction('supabase/functions/auto-apply-run/index.ts', {
    env: { JSEARCH_API_KEY: 'test-key', SUPABASE_ANON_KEY: 'public-key', SUPABASE_URL: 'https://project.supabase.co', NODE_ENV: 'production' },
    imports: {
      [supabaseImport]: { createClient: () => client },
      '../_shared/cors.ts': { getCorsHeaders: () => ({}), isOriginAllowed: () => true, authenticateUser: async () => ({ userId: 'user-1' }) },
      '../_shared/aiAccess.ts': { resolveAllowedModel: () => 'test-model' },
      '../_shared/publicWebFetch.ts': { fetchPublicWebpage: async () => ({ status: 200 }), UnsafeWebDestinationError: class extends Error {} },
      './resumeAttachment.ts': {
        getPublicKey: () => 'public-key',
        loadOwnedResumeSnapshot: async () => { attachmentCalls.push('snapshot'); throw new Error('unexpected resume read'); },
        loadResumeFontData: async () => { attachmentCalls.push('font'); throw new Error('unexpected font read'); },
        createResumeAttachmentPackage: async () => { attachmentCalls.push('package'); throw new Error('unexpected package'); },
        assertResumePackageCurrent: () => { attachmentCalls.push('revalidate'); },
      },
    },
    fetch: async (url) => {
      outbound.push(String(url));
      return new Response(JSON.stringify({ data: [{ job_id: 'external-1', job_title: 'Engineer', employer_name: 'Example', job_apply_link: 'https://example.org/job' }] }));
    },
  });
  return { ...loaded, calls, outbound, attachmentCalls };
}

test('outreach without a selected resume fails before discovery, paid work or email', async () => {
  const app = loadRun();
  const response = await app.handler(new Request('https://edge.test/auto-apply', {
    method: 'POST',
    headers: { Authorization: 'Bearer verified-token' },
    body: JSON.stringify({ discover_only: false }),
  }));
  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), {
    error: 'Select and save a resume before sending outreach.',
    code: 'RESUME_REQUIRED',
    run_id: 'run-1',
  });
  assert.deepEqual(app.outbound, []);
  assert.deepEqual(app.attachmentCalls, []);
  assert.equal(app.calls.some(([method, table]) => method === 'from' && table === 'auto_apply_jobs'), false);
  assert.equal(app.calls.some(([method, table]) => method === 'from' && table === 'gmail_connections'), false);
  assert.equal(app.calls.at(-1)[0], 'release_auto_apply_run');
});

test('outreach fails closed before discovery when matching and cover-letter AI is unavailable', async () => {
  const app = loadRun({ defaultResumeId: 'resume-1' });
  const response = await app.handler(new Request('https://edge.test/auto-apply', {
    method: 'POST',
    headers: { Authorization: 'Bearer verified-token' },
    body: JSON.stringify({ discover_only: false }),
  }));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: 'AI matching and cover-letter generation are unavailable. Use discovery-only mode or try again later.',
    code: 'AI_PROVIDER_UNAVAILABLE',
    run_id: 'run-1',
  });
  assert.deepEqual(app.outbound, []);
  assert.deepEqual(app.attachmentCalls, []);
  assert.equal(app.calls.some(([method, table]) => method === 'from' && table === 'auto_apply_jobs'), false);
  assert.equal(app.calls.at(-1)[0], 'release_auto_apply_run');
});

test('discovery-only remains available without a resume and never prepares an attachment', async () => {
  const app = loadRun();
  const response = await app.handler(new Request('https://edge.test/auto-apply', {
    method: 'POST',
    headers: { Authorization: 'Bearer verified-token' },
    body: JSON.stringify({ discover_only: true }),
  }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.jobs_queued, 1);
  assert.equal(app.outbound.length, 1);
  assert.deepEqual(app.attachmentCalls, []);
});

test('auto-apply handler contains no mutable Storage reader or legacy one-page fallback', () => {
  const source = readFileSync('supabase/functions/auto-apply-run/index.ts', 'utf8');
  assert.doesNotMatch(source, /\.storage\b|\.download\s*\(/i);
  assert.doesNotMatch(source, /generateResumePdfFromData|loadResumeSnapshot|resumeToText/);
  assert.match(source, /loadOwnedResumeSnapshot/);
  assert.match(source, /assertResumePackageCurrent/);
});

test('Edge attachment packaging pins the shared font and dependency', () => {
  const appFont = readFileSync('src/assets/fonts/DejaVuSans.ttf');
  const edgeFont = readFileSync('supabase/functions/auto-apply-run/assets/DejaVuSans.ttf');
  assert.deepEqual(edgeFont, appFont);
  assert.ok(readFileSync('supabase/functions/auto-apply-run/assets/LICENSE-DejaVu.txt').length > 0);
  assert.match(readFileSync('supabase/functions/import_map.json', 'utf8'), /npm:jspdf@4\.2\.1/);
  const config = readFileSync('supabase/config.toml', 'utf8');
  assert.match(config, /static_files\s*=\s*\[[^\]]*auto-apply-run\/assets\/DejaVuSans\.ttf/);
});
