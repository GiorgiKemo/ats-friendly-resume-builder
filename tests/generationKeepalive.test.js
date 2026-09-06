import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/components/resume/EnhancedAIGenerator.jsx', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('EnhancedAIGenerator.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
let effectSource;
const visit = node => {
  if (ts.isCallExpression(node) && node.expression.getText(parsed) === 'useEffect') {
    const callback = node.arguments[0]?.getText(parsed) || '';
    if (callback.includes('const workerCode') && callback.includes('keepAliveWorkerRef')) effectSource = callback;
  }
  ts.forEachChild(node, visit);
};
visit(parsed);
assert.ok(effectSource, 'The actual hidden-generation worker effect is tested');

function setup({ generating = true, visible = false, workerFailure = false } = {}) {
  const queue = [];
  const intervals = new Map();
  const fallbackIntervals = new Map();
  const blobs = new Map();
  const workers = [];
  const revoked = [];
  const messages = [];
  const context = {
    isGenerating: generating, isPageVisible: visible,
    keepAliveWorkerRef: { current: null }, keepAliveIntervalRef: { current: null },
    console: { error() {} },
    Blob: class { constructor(parts) { this.source = parts.join(''); } },
    URL: {
      createObjectURL(blob) { const url = `blob:synthetic-${blobs.size}`; blobs.set(url, blob); return url; },
      revokeObjectURL(url) { revoked.push(url); blobs.delete(url); },
    },
    setInterval(callback, period) { const id = Symbol(); fallbackIntervals.set(id, { callback, period }); return id; },
    clearInterval(id) { fallbackIntervals.delete(id); },
    Worker: class {
      constructor(url) {
        if (workerFailure) throw new Error('Synthetic workers unavailable');
        this.terminated = false;
        const self = { postMessage: data => {
          messages.push(['worker', data]);
          queue.push(() => { if (!this.terminated) this.onmessage?.({ data }); });
        } };
        vm.runInNewContext(blobs.get(url).source, {
          self, setInterval: (callback, period) => { intervals.set(this, { callback, period }); },
        });
        this.postMessage = data => {
          messages.push(['main', data]);
          queue.push(() => { if (!this.terminated) self.onmessage?.({ data }); });
        };
        workers.push(this);
      }
      terminate() { this.terminated = true; intervals.delete(this); }
    },
  };
  const runEffect = vm.runInNewContext(`(${effectSource})`, context);
  const cleanup = runEffect();
  const drain = () => {
    let delivered = 0;
    while (queue.length && delivered < 64) { queue.shift()(); delivered += 1; }
    assert.equal(queue.length, 0, 'Worker messages must quiesce without requiring another timer tick');
    return delivered;
  };
  return { context, cleanup, runEffect, drain, workers, revoked, messages, intervals, fallbackIntervals, blobs };
}

test('actual worker handshake is bounded at startup and on every one-second heartbeat', () => {
  const h = setup();
  assert.equal(h.workers.length, 1);
  assert.ok(h.drain() <= 2, 'One startup ping and one acknowledgment at most');
  assert.deepEqual([...h.intervals.values()].map(item => item.period), [1000]);
  const start = h.messages.length;
  for (let tick = 0; tick < 5; tick += 1) {
    [...h.intervals.values()][0].callback();
    assert.ok(h.drain() <= 3, 'A heartbeat may elicit one ping and one acknowledgment, not another ping');
  }
  assert.ok(h.messages.length - start <= 15);
  h.cleanup();
});

test('cleanup stops the worker, revokes its URL, and ignores already-queued or captured callbacks', () => {
  const h = setup();
  const worker = h.workers[0];
  const lateMessage = worker.onmessage;
  h.cleanup();
  const count = h.messages.length;
  lateMessage?.({ data: 'keepAlive' });
  h.drain();
  assert.equal(h.messages.length, count);
  assert.equal(worker.terminated, true);
  assert.equal(h.intervals.size, 0);
  assert.equal(h.context.keepAliveWorkerRef.current, null);
  assert.equal(h.blobs.size, 0);
  assert.deepEqual(h.revoked, ['blob:synthetic-0']);
});

test('worker failure cleans its allocated URL and uses only a cleanup-bound one-second fallback', () => {
  const h = setup({ workerFailure: true });
  assert.equal(h.workers.length, 0);
  assert.deepEqual([...h.fallbackIntervals.values()].map(item => item.period), [1000]);
  assert.equal(h.blobs.size, 0);
  h.cleanup();
  assert.equal(h.fallbackIntervals.size, 0);
  assert.equal(h.context.keepAliveIntervalRef.current, null);
  assert.deepEqual(h.revoked, ['blob:synthetic-0']);
});

test('visible pages and completed or cancelled generation do not start a worker or fallback timer', () => {
  for (const state of [{ visible: true }, { generating: false }, { visible: true, generating: false }]) {
    const h = setup(state);
    assert.equal(h.workers.length, 0);
    assert.equal(h.intervals.size, 0);
    assert.equal(h.fallbackIntervals.size, 0);
    h.cleanup();
  }
});

test('visibility and cancellation effect transitions keep only the active worker and reject the old callback', () => {
  const h = setup();
  h.drain();
  const oldMessage = h.workers[0].onmessage;
  h.cleanup();
  h.context.isPageVisible = true;
  const visibleCleanup = h.runEffect();
  assert.equal(h.workers.length, 1);
  assert.equal(h.intervals.size, 0);
  visibleCleanup();
  h.context.isPageVisible = false;
  const hiddenCleanup = h.runEffect();
  h.drain();
  assert.equal(h.workers.length, 2);
  assert.equal(h.intervals.size, 1);
  const count = h.messages.length;
  oldMessage({ data: 'keepAlive' });
  assert.equal(h.messages.length, count);
  hiddenCleanup();
  h.context.isGenerating = false;
  const cancelledCleanup = h.runEffect();
  assert.equal(h.intervals.size, 0);
  assert.equal(h.blobs.size, 0);
  cancelledCleanup();
});
