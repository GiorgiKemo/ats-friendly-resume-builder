import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadEdgeFunction } from './helpers/loadEdgeFunction.js';

const supabaseImport = 'https://esm.sh/@supabase/supabase-js@2';
const corsStub = {
  getCorsHeaders: () => ({}),
  isOriginAllowed: () => true,
  authenticateUser: async () => ({ userId: 'user-1' }),
};

const loadScoring = ({ env = {}, fetch = async () => new Response('{}') } = {}) => loadEdgeFunction(
  'supabase/functions/auto-apply-run/index.ts',
  {
    env: { NODE_ENV: 'production', ...env },
    fetch,
    imports: {
      [supabaseImport]: { createClient: () => ({}) },
      jspdf: {},
      '../_shared/cors.ts': corsStub,
      '../_shared/aiAccess.ts': { resolveAllowedModel: () => 'test-model' },
      '../_shared/publicWebFetch.ts': { fetchPublicWebpage: async () => ({ status: 200 }), UnsafeWebDestinationError: class extends Error {} },
    },
    expose: ['deterministicJobScore', 'parseAiJobScore', 'scoreJob', 'hunterSearch', 'capPreferenceStrings', 'parseAnnualSalaryRange', 'salaryMatchesPreferences', '_getScoreThreshold'],
  },
);

const preferences = {
  job_titles: ['Software Engineer'],
  skills: ['React', 'TypeScript'],
  locations: ['New York'],
  remote_preference: 'any',
  experience_level: 'mid',
  industries: [],
};

const matchingJob = {
  title: 'Software Engineer',
  company: 'Cedar Labs',
  location: 'New York, NY',
  salary_range: '',
  job_url: 'https://jobs.example/1',
  contact_email: '',
  job_description: 'Mid-level product engineer building React and TypeScript applications.',
  source: 'fixture',
  external_job_id: 'job-1',
  employer_website: '',
};

test('auto-apply uses a conservative local score when AI providers are unavailable', () => {
  const { exports } = loadScoring();
  assert.equal(exports.deterministicJobScore(matchingJob, preferences), 96);
  assert.ok(exports.deterministicJobScore({ ...matchingJob, title: 'Marketing Manager', job_description: 'Brand campaigns.' }, preferences) < 75);
});

test('AI job score parsing takes the first bounded number and rejects invalid ranges', () => {
  const { exports } = loadScoring();
  assert.equal(exports.parseAiJobScore('80/100'), 80);
  assert.equal(exports.parseAiJobScore('Score: 100'), 100);
  assert.equal(exports.parseAiJobScore('Score: 101'), null);
  assert.equal(exports.parseAiJobScore('Score: -5'), null);
  assert.equal(exports.parseAiJobScore('No numeric answer'), null);
});

test('AI scoring does not inflate a malformed multi-number response', async () => {
  const { exports } = loadScoring({
    env: { OPENROUTER_API_KEY: 'test-key' },
    fetch: async () => new Response(JSON.stringify({ choices: [{ message: { content: 'Score: 80/100' } }] })),
  });
  assert.equal(await exports.scoreJob(matchingJob, preferences, ''), 80);
});

test('Hunter credentials stay in a request header instead of the provider URL', async () => {
  let request;
  const { exports } = loadScoring({
    env: { HUNTER_API_KEY: 'hunter-secret' },
    fetch: async (url, options) => {
      request = { url: String(url), options };
      return new Response(JSON.stringify({ data: { emails: [] } }), { status: 200 });
    },
  });

  assert.equal(await exports.hunterSearch('example.com'), null);
  assert.doesNotMatch(request.url, /api_key|hunter-secret/i);
  assert.equal(request.options.headers['X-API-KEY'], 'hunter-secret');
});

test('provider-facing preference lists are bounded before prompts and discovery', () => {
  const { exports } = loadScoring();
  assert.deepEqual(exports.capPreferenceStrings(['  React  ', 42, '', 'TypeScript'], 2, 6), ['React', 'TypeSc']);
});

test('salary preferences compare only clear non-hourly annual ranges and keep unknown compensation reviewable', () => {
  const { exports } = loadScoring();
  assert.deepEqual({ ...exports.parseAnnualSalaryRange('$80,000 - $120,000 per year') }, { min: 80000, max: 120000 });
  assert.deepEqual({ ...exports.parseAnnualSalaryRange('80k–120k annual') }, { min: 80000, max: 120000 });
  assert.deepEqual({ ...exports.parseAnnualSalaryRange('$6,000 monthly') }, { min: 72000, max: 72000 });
  assert.equal(exports.parseAnnualSalaryRange('$40–$50 per hour'), null);
  assert.equal(exports.salaryMatchesPreferences('$80,000 - $120,000 per year', 100000, 150000), true);
  assert.equal(exports.salaryMatchesPreferences('$80,000 - $95,000 per year', 100000, null), false);
  assert.equal(exports.salaryMatchesPreferences('$180k–$220k', null, 150000), false);
  assert.equal(exports.salaryMatchesPreferences('Competitive salary', 100000, 150000), true);
  assert.equal(exports.salaryMatchesPreferences('$80k–$120k', 150000, 100000), false);
});

test('matching speed maps to an explicit threshold', () => {
  const { exports } = loadScoring();
  assert.equal(exports._getScoreThreshold('conservative'), 75);
  assert.equal(exports._getScoreThreshold('moderate'), 55);
  assert.equal(exports._getScoreThreshold('aggressive'), 35);
});
