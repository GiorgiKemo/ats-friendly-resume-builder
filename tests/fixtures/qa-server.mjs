import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { pathToFileURL, URL } from 'node:url';
import console from 'node:console';
import process from 'node:process';
import { Buffer } from 'node:buffer';

// Local-only UI fixtures. This is not a database emulator or an RLS/security test.
// Nothing here connects to a real backend; all writes disappear when stopped.
export const QA_EMAIL = 'alex.morgan@example.com';
export const QA_PASSWORD = 'LocalQaOnly123!';
export const QA_USER_ID = '11111111-1111-4111-8111-111111111111';
export const QA_RESUME_ID = '22222222-2222-4222-8222-222222222222';

const now = () => new Date().toISOString();
const daysAgo = (days) => new Date(Date.now() - days * 86400000).toISOString();

export function createQaState({ premium = false, empty = false } = {}) {
  const personal = {
    fullName: 'Alex Morgan', email: QA_EMAIL, phone: '+1 202 555 0142',
    location: 'Austin, TX', jobTitle: 'Product Designer',
    website: 'https://example.com', linkedin: 'https://linkedin.com/in/example',
    summary: 'Product designer creating accessible, research-led experiences for business software. Collaborates with engineers and product teams from discovery through delivery.',
  };
  const work = [{
    id: 'qa-work-1', company: 'Northstar Studio', position: 'Product Designer',
    location: 'Austin, TX', startDate: '2021-06', endDate: '', current: true,
    description: 'Led discovery and interaction design for the customer onboarding experience.\nPartnered with engineering to ship accessible components and validate usability with customers.',
  }];
  const education = [{
    id: 'qa-education-1', institution: 'State University', degree: 'Bachelor of Arts',
    fieldOfStudy: 'Design', location: 'Austin, TX', startDate: '2015-09', endDate: '2019-05',
  }];
  const skills = ['Product Design', 'User Research', 'Figma', 'Accessibility', 'Prototyping'];
  const resume = {
    id: QA_RESUME_ID, user_id: QA_USER_ID, title: 'Product Designer', description: '',
    revision: 1,
    selected_template: 'ats-friendly', selected_font: 'Arial', is_public: false,
    personal_info: personal, work_experience: work, education, skills,
    certifications: [], projects: [], additional_sections: [],
    created_at: daysAgo(12), updated_at: daysAgo(1), last_accessed_at: now(),
  };
  return {
    user: {
      id: QA_USER_ID, aud: 'authenticated', role: 'authenticated', email: QA_EMAIL,
      email_confirmed_at: daysAgo(30), created_at: daysAgo(30), updated_at: now(),
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: { full_name: 'Alex Morgan' }, identities: [],
    },
    users: [{ id: QA_USER_ID, email: QA_EMAIL, is_premium: premium,
      premium_plan: premium ? 'premium_monthly' : null,
      premium_until: premium ? new Date(Date.now() + 30 * 86400000).toISOString() : null,
      ai_generations_used: 3, ai_generations_limit: premium ? 50 : 0, stripe_customer_id: null }],
    profile: { id: QA_USER_ID, user_id: QA_USER_ID, personal, work_experience: work,
      education, skills, certifications: [], projects: [], languages: [], interests: [], reference_list: [],
      revision: 1, created_at: daysAgo(12), updated_at: daysAgo(1) },
    resumes: empty ? [] : [resume],
    job_applications: empty ? [] : [
      { id: '33333333-3333-4333-8333-333333333333', user_id: QA_USER_ID,
        company: 'Northstar Labs', position: 'Senior Product Designer', status: 'applied',
        location: 'Remote', job_url: 'https://example.com/jobs/designer',
        resume_id: QA_RESUME_ID, notes: 'Follow up with the hiring team next week.',
        applied_at: daysAgo(8), created_at: daysAgo(8), updated_at: daysAgo(8), response_at: null },
      { id: '44444444-4444-4444-8444-444444444444', user_id: QA_USER_ID,
        company: 'Fieldwork', position: 'Product Designer', status: 'interview',
        location: 'Austin, TX', resume_id: QA_RESUME_ID, notes: 'Portfolio conversation with the design lead.',
        applied_at: daysAgo(14), created_at: daysAgo(14), updated_at: daysAgo(2), response_at: daysAgo(2) },
    ],
    job_preferences: [], auto_apply_jobs: [], auto_apply_stats: [], auto_apply_runs: [], gmail_connections: [],
    requestLog: [],
  };
}

function tokenFor(user) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, role: 'authenticated', email: user.email, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 })}.local-fixture-only`;
}

function filterRows(rows, query) {
  return rows.filter((row) => [...query].every(([key, expression]) => {
    if (['select', 'order', 'limit', 'offset', 'on_conflict'].includes(key)) return true;
    const [operator, ...parts] = expression.split('.');
    const value = parts.join('.');
    if (operator === 'eq') return String(row[key]) === value;
    if (operator === 'gte') return row[key] >= value;
    if (operator === 'lte') return row[key] <= value;
    if (operator === 'in') return value.slice(1, -1).split(',').map((item) => item.replaceAll('"', '')).includes(String(row[key]));
    if (key === 'or') {
      const term = expression.match(/ilike\.%([^%]+)%/)?.[1]?.toLowerCase();
      return !term || [row.company, row.position, row.title].some((text) => text?.toLowerCase().includes(term));
    }
    return true;
  }));
}

export function createQaServer(options = {}) {
  const state = createQaState(options);
  const server = http.createServer(async (request, response) => {
    const origin = request.headers.origin;
    if (origin && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(origin)) {
      response.writeHead(403).end('Local QA origins only');
      return;
    }
    response.setHeader('Access-Control-Allow-Origin', origin || 'http://127.0.0.1:5174');
    response.setHeader('Vary', 'Origin');
    response.setHeader('Access-Control-Allow-Headers', 'authorization, apikey, content-type, accept-profile, content-profile, x-client-info, prefer, range, x-supabase-api-version, x-retry-count, x-request-type, x-request-timeout');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
    response.setHeader('Access-Control-Expose-Headers', 'content-range');
    const send = (data, status = 200) => {
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(data));
    };
    if (request.method === 'OPTIONS') { response.writeHead(204).end(); return; }
    const url = new URL(request.url, 'http://127.0.0.1');
    const route = url.pathname;
    state.requestLog.push({ method: request.method, path: route, at: now() });
    try {
      let raw = '';
      for await (const chunk of request) {
        raw += chunk;
        if (raw.length > 2_000_000) { send({ message: 'QA request too large' }, 413); return; }
      }
      const body = raw ? JSON.parse(raw) : {};
      if (route === '/__qa/health') { send({ fixture: true, premium: options.premium || false, aiReview: options.aiReview === true }); return; }
      if (route === '/__qa/state') { send(state); return; }
      if (route === '/auth/v1/token') {
        if (url.searchParams.get('grant_type') !== 'refresh_token' && (body.email !== QA_EMAIL || body.password !== QA_PASSWORD)) {
          send({ error: 'invalid_grant', error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400); return;
        }
        send({ access_token: tokenFor(state.user), refresh_token: 'local-fixture-refresh', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: state.user }); return;
      }
      if (route === '/auth/v1/logout') { send({}); return; }
      if (route === '/auth/v1/recover' || route === '/auth/v1/resend') { send({}); return; }
      if (!request.headers.authorization?.startsWith('Bearer ') || request.headers.authorization === 'Bearer qa-local-anon-key') {
        send({ message: 'Sign in with the synthetic QA account first' }, 401); return;
      }
      if (route === '/auth/v1/user') { send(state.user); return; }
      if (route === '/functions/v1/report-client-error') { send({ ok: true }); return; }
      // Explicitly opt-in, synthetic provider-shaped responses only. No URL or
      // request body can select another provider or cause an outbound request.
      if (options.aiReview === true && request.method === 'POST'
        && ['/functions/v1/openrouter-proxy', '/functions/v1/groq-proxy'].includes(route)) {
        const candidate = {
          personalInfo: { summary: 'Product designer focused on accessible customer journeys, research and collaboration with engineering teams.' },
          workExperience: (state.profile?.work_experience || []).map((entry) => ({
            ...entry, title: entry.title || entry.jobTitle || entry.position,
            description: 'Shaped onboarding experiences through discovery, accessible interaction design and collaboration with engineering.',
          })),
          education: [], projects: [], certifications: [], skills: [],
        };
        send({ choices: [{ message: { content: JSON.stringify(candidate) } }], fixture: true }); return;
      }
      if (route.startsWith('/functions/v1/')) {
        send({ error: 'External AI, email, billing, and job actions are intentionally disabled in local QA.' }, 403); return;
      }
      if (route.startsWith('/rest/v1/rpc/')) {
        const rpc = route.split('/').at(-1);
        if (rpc === 'get_user_profile' || rpc === 'get_user_profile_versioned') {
          if (body.p_user_id !== state.user.id) { send({ code: '42501', message: 'Profile ownership denied' }, 403); return; }
          send(state.profile ? [state.profile] : []); return;
        }
        if (rpc === 'save_user_profile' || rpc === 'save_user_profile_versioned') {
          const fail = (code, message, status = 400) => send({ code, message, details: null, hint: null }, status);
          const fields = ['user_id', 'personal', 'work_experience', 'education', 'skills', 'certifications', 'projects', 'languages', 'interests', 'reference_list'];
          if (fields.some((field) => !Object.hasOwn(body, `p_${field}`))) { fail('PGRST202', 'QA profile save requires every full-snapshot argument', 404); return; }
          if (body.p_user_id !== state.user.id) { fail('42501', 'Profile ownership denied', 403); return; }
          const { p_expected_profile_id: id, p_expected_revision: revision } = body;
          if ((id == null && revision != null) || (id != null && (!Number.isInteger(revision) || revision < 1 || revision > 2147483647))) {
            fail('22023', 'PROFILE_VERSION_REQUIRED'); return;
          }
          if (state.profile) {
            if (rpc === 'save_user_profile') { fail('22023', 'PROFILE_VERSION_REQUIRED'); return; }
            if (id !== state.profile.id || revision !== state.profile.revision) { fail('PT409', 'PROFILE_CONFLICT', 409); return; }
          } else {
            if (id != null) { fail('PT409', 'PROFILE_CONFLICT', 409); return; }
            state.profile = { id: randomUUID(), revision: 0, created_at: now() };
          }
          for (const field of fields) state.profile[field] = body[`p_${field}`];
          state.profile.revision += 1;
          state.profile.updated_at = now();
          send(rpc === 'save_user_profile' ? state.profile.id : { profile_id: state.profile.id, revision: state.profile.revision, updated_at: state.profile.updated_at }); return;
        }
        if (rpc === 'get_resume_with_content' || rpc === 'get_resume_versioned') {
          send(state.resumes.filter((resume) => resume.id === body.p_resume_id && resume.user_id === state.user.id)); return;
        }
        if (rpc === 'save_resume' || rpc === 'save_resume_versioned') {
          const fail = (code, message, status = 400) => send({ code, message, details: null, hint: null }, status);
          const snapshotFields = ['user_id', 'title', 'description', 'selected_template', 'selected_font', 'is_public',
            'personal_info', 'work_experience', 'education', 'skills', 'certifications', 'projects', 'additional_sections'];
          if (snapshotFields.some((field) => !Object.hasOwn(body, `p_${field}`))) {
            fail('PGRST202', 'QA save RPC requires every full-snapshot argument', 404); return;
          }
          if (body.p_user_id !== state.user.id) { fail('42501', 'Resume ownership denied', 403); return; }
          const id = body.p_resume_id || randomUUID();
          let resume = state.resumes.find((item) => item.id === id);
          if (body.p_resume_id) {
            if (rpc === 'save_resume' || !Number.isInteger(body.p_expected_revision) || body.p_expected_revision < 1) {
              fail('22023', 'RESUME_VERSION_REQUIRED'); return;
            }
            if (!resume || resume.user_id !== state.user.id) { fail('42501', 'Resume ownership denied', 403); return; }
            if (body.p_expected_revision !== resume.revision) { fail('PT409', 'RESUME_CONFLICT', 409); return; }
          } else {
            if (rpc === 'save_resume_versioned' && body.p_expected_revision != null) {
              fail('22023', 'RESUME_VERSION_REQUIRED'); return;
            }
            resume = { id, created_at: now(), revision: 0 };
            state.resumes.push(resume);
          }
          for (const [key, value] of Object.entries(body)) {
            if (!['p_resume_id', 'p_expected_revision'].includes(key)) resume[key.replace(/^p_/, '')] = value;
          }
          resume.revision += 1;
          resume.updated_at = now(); resume.last_accessed_at = now();
          send(rpc === 'save_resume' ? id : { resume_id: id, revision: resume.revision, updated_at: resume.updated_at }); return;
        }
        if (rpc === 'delete_resume') { state.resumes = state.resumes.filter((resume) => resume.id !== body.p_resume_id); send(true); return; }
        if (rpc === 'get_remaining_ai_generations') { send(Math.max(0, state.users[0].ai_generations_limit - state.users[0].ai_generations_used)); return; }
        if (rpc === 'get_gmail_connection_status') { send(null); return; }
        send({ message: `Unimplemented QA RPC: ${rpc}` }, 501); return;
      }
      if (route.startsWith('/rest/v1/')) {
        const table = route.split('/').at(-1);
        const source = table === 'user_resumes' ? 'resumes' : table;
        if (source === 'application_analytics') { send([]); return; }
        if (!Array.isArray(state[source]) || source === 'requestLog') { send({ message: `Unimplemented QA table: ${table}` }, 501); return; }
        let rows = filterRows(state[source], url.searchParams);
        if (request.method === 'POST') {
          rows = (Array.isArray(body) ? body : [body]).map((item) => ({ id: randomUUID(), created_at: now(), updated_at: now(), applied_at: now(), ...item }));
          const conflict = url.searchParams.get('on_conflict');
          for (const row of rows) {
            const existing = conflict && state[source].find((item) => item[conflict] === row[conflict]);
            if (existing) Object.assign(existing, row); else state[source].push(row);
          }
        } else if (request.method === 'PATCH') rows.forEach((row) => Object.assign(row, body));
        else if (request.method === 'DELETE') state[source] = state[source].filter((row) => !rows.includes(row));
        const order = url.searchParams.get('order');
        if (order) {
          const [key, direction] = order.split('.');
          rows = [...rows].sort((a, b) => String(a[key] || '').localeCompare(String(b[key] || '')) * (direction === 'desc' ? -1 : 1));
        }
        const offset = Number(url.searchParams.get('offset') || 0);
        rows = rows.slice(offset, url.searchParams.has('limit') ? offset + Number(url.searchParams.get('limit')) : undefined);
        if (source === 'job_applications') rows = rows.map((row) => ({ ...row, resumes: state.resumes.find((resume) => resume.id === row.resume_id) || null }));
        response.setHeader('Content-Range', `0-${Math.max(0, rows.length - 1)}/${rows.length}`);
        if (request.headers.accept?.includes('application/vnd.pgrst.object+json')) {
          if (rows.length !== 1) { send({ code: 'PGRST116', message: 'Expected a single fixture row' }, 406); return; }
          send(rows[0]); return;
        }
        send(rows); return;
      }
      send({ message: `Unimplemented QA route: ${route}` }, 404);
    } catch (error) {
      send({ message: error.message }, 400);
    }
  });
  return { server, state };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.env.QA_LOCAL_FIXTURES !== '1') throw new Error('Set QA_LOCAL_FIXTURES=1 to start the local-only fixture server.');
  const port = Number(process.env.QA_FIXTURE_PORT || 54329);
  const { server } = createQaServer({ premium: process.env.QA_PREMIUM === '1', empty: process.env.QA_EMPTY === '1', aiReview: process.env.QA_AI_REVIEW === '1' });
  server.listen(port, '127.0.0.1', () => {
    console.log(`Local-only QA fixtures: http://127.0.0.1:${port}. No real backend connections. Sign in: ${QA_EMAIL} / ${QA_PASSWORD}`);
  });
}
