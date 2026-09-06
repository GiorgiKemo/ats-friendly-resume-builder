import { loadEdgeFunction } from './loadEdgeFunction.js';

export const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

export const record = (id = 'resume-1', revision = 1) => ({
  id, revision, updated_at: '2026-09-04T12:00:00Z',
  title: 'Engineer', personal_info: { fullName: 'Candidate', email: 'candidate@example.com', summary: 'Original summary' },
  work_experience: [{ position: 'Engineer', company: 'Example', responsibilities: 'Built apps.', extra: 'Preserve' }],
  education: [{ institution: 'University', degree: 'BSc', current: true }],
  projects: [{ title: 'Portfolio', technologies: ['React'], description: 'Built a portfolio.' }],
});

export const saved = (id = 'resume-1', revision = 2) => ({ resume_id: id, revision, updated_at: '2026-09-04T13:00:00Z' });

export const storageApi = (storage) => ({
  get length() { return storage.size; },
  key: (index) => [...storage.keys()][index] ?? null,
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, item) => storage.set(key, item),
  removeItem: (key) => storage.delete(key),
});

// Executes the actual context and local draft store with persistent React hook
// state. Services are replaceable, outbound requests stay isolated, and each
// provider has its own timers/sessionStorage but may share browser localStorage.
export function setup({ load = async (id) => record(id), service, storage = new Map(), session = new Map(), storageUnavailable = false } = {}) {
  let user = { id: 'user-1' };
  let cursor = 0;
  let dirty = false;
  let pendingEffects = [];
  let value;
  const hooks = [];
  const saveCalls = [];
  const timers = new Map();
  let nextTimer = 1;
  const setTimer = (callback) => { const id = nextTimer++; timers.set(id, callback); return id; };
  const clearTimer = (id) => timers.delete(id);
  const sameDeps = (a, b) => a && b && a.length === b.length && a.every((entry, index) => Object.is(entry, b[index]));
  const react = {
    createContext: () => ({ Provider: 'provider' }),
    createElement: (_type, props) => props,
    useState: (initial) => {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = { state: typeof initial === 'function' ? initial() : initial };
      return [hooks[index].state, (update) => {
        const next = typeof update === 'function' ? update(hooks[index].state) : update;
        if (!Object.is(next, hooks[index].state)) { hooks[index].state = next; dirty = true; }
      }];
    },
    useRef: (initial) => {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = { current: initial };
      return hooks[index];
    },
    useCallback: (callback, deps) => {
      const index = cursor++;
      if (!sameDeps(hooks[index]?.deps, deps)) hooks[index] = { callback, deps };
      return hooks[index].callback;
    },
    useEffect: (callback, deps) => {
      const index = cursor++;
      if (!sameDeps(hooks[index]?.deps, deps)) {
        const cleanup = hooks[index]?.cleanup;
        hooks[index] = { deps };
        pendingEffects.push(() => { cleanup?.(); hooks[index].cleanup = callback(); });
      }
    },
  };
  react.default = react;
  const localStorage = storageApi(storage);
  if (storageUnavailable) localStorage.setItem = () => { throw new Error('Storage disabled'); };
  const sessionStorage = storageApi(session);
  const { exports: { ResumeProvider } } = loadEdgeFunction('src/context/ResumeContext.tsx', {
    globals: { window: { localStorage, sessionStorage }, localStorage, sessionStorage, setTimeout: setTimer, clearTimeout: clearTimer },
    imports: {
      react,
      './AuthContext.jsx': { useAuth: () => ({ user }) },
      './SubscriptionContext.jsx': { useSubscription: () => ({ isPremium: true }) },
      '../services/monitoringService.js': { logError: async () => {} },
      '../services/supabaseService.js': service || {
        getUserResumes: async () => [], getResumeById: load, deleteResume: async () => {},
        saveResume: (resume, id, expectedUserId, expectedRevision) => {
          const request = deferred();
          saveCalls.push({ ...request, resume, id, expectedUserId, expectedRevision });
          return request.promise;
        },
      },
      '../services/supabase.js': { supabase: {} },
      '../utils/security.js': { safeSetTimeout: setTimer },
      '../types/atsTypes.js': {},
      '../services/atsRulesEngine.js': {},
    },
  });
  const render = () => {
    let count = 0;
    do {
      if (++count > 30) throw new Error('Unexpected render loop');
      dirty = false;
      cursor = 0;
      value = ResumeProvider({ children: null }).value;
      const effects = pendingEffects;
      pendingEffects = [];
      effects.forEach((effect) => effect());
    } while (dirty);
    return value;
  };
  const flush = async () => { await new Promise((resolve) => setImmediate(resolve)); return render(); };
  render();
  return {
    render, flush, saveCalls, storage, session, timers,
    get value() { return render(); },
    drafts: (id = 'resume-1') => [...storage.entries()].filter(([key]) => key.startsWith(`resume_draft_v2_user-1_${id || 'new'}_`))
      .map(([key, item]) => ({ ...JSON.parse(item), key })),
    setUser: (next) => { user = next; render(); },
    runTimers: () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach((callback) => callback()); },
    unmount: () => { hooks.forEach((hook) => hook?.cleanup?.()); },
  };
}
