import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearGenerationState,
  getGenerationState,
  storeGenerationState,
} from '../src/utils/serviceWorkerRegistration.js';

const createStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    keys: () => [...values.keys()],
  };
};

const withWindow = async (storage, callback) => {
  const previousWindow = globalThis.window;
  globalThis.window = { localStorage: storage };
  try {
    return await callback();
  } finally {
    globalThis.window = previousWindow;
  }
};

test('generation state is isolated by owner in the localStorage fallback', async () => {
  const storage = createStorage();
  await withWindow(storage, async () => {
    await storeGenerationState({ userId: 'account/a', runId: 'run-a', progress: 40, isGenerating: true });
    await storeGenerationState({ userId: 'account-b', runId: 'run-b', progress: 70, isGenerating: true });

    assert.equal((await getGenerationState('account/a')).runId, 'run-a');
    assert.equal((await getGenerationState('account-b')).runId, 'run-b');
    assert.equal(storage.keys().filter((key) => key.startsWith('resume_generation_state_')).length, 2);

    await clearGenerationState('account/a');
    assert.equal(await getGenerationState('account/a'), null);
    assert.equal((await getGenerationState('account-b')).progress, 70);
  });
});

test('missing owner context cannot read, write, or clear generation state', async () => {
  const storage = createStorage();
  await withWindow(storage, async () => {
    await storeGenerationState({ userId: 'account-a', jobDescription: 'Private posting', progress: 20, isGenerating: true });
    assert.equal(await getGenerationState(), null);
    await clearGenerationState();
    assert.equal((await getGenerationState('account-a')).jobDescription, 'Private posting');
    assert.equal(storage.keys().some((key) => key.endsWith('_null')), false);
  });
});
