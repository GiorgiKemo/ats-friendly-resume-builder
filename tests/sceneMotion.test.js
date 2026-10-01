import test from 'node:test';
import assert from 'node:assert/strict';
import { bankedUp, easeOutBack, figureEight, segment, springStep } from '../src/utils/sceneMotion.js';
import { createDartFold, rotateAboutAxis } from '../src/utils/paperFold.js';

const close = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≉ ${expected}`);

test('springs settle on their target and stay stable through long frames', () => {
  const state = { value: 0, velocity: 0 };
  for (let frame = 0; frame < 240; frame += 1) springStep(state, 1, 1 / 60, 70, 11);
  close(state.value, 1, 1e-3);
  const slow = { value: 0, velocity: 0 };
  for (let frame = 0; frame < 20; frame += 1) springStep(slow, 1, 0.5, 120, 14);
  assert.ok(Number.isFinite(slow.value) && Math.abs(slow.value - 1) < 0.05);
});

test('timeline helpers clamp and the pop easing overshoots before landing', () => {
  assert.equal(segment(-1, 0, 2), 0);
  assert.equal(segment(1, 0, 2), 0.5);
  assert.equal(segment(5, 0, 2), 1);
  close(easeOutBack(0), 0);
  close(easeOutBack(1), 1);
  assert.ok(Math.max(...[0.6, 0.7, 0.8].map((t) => easeOutBack(t))) > 1);
});

test('the glide path is a bounded, symmetric figure eight', () => {
  for (let step = 0; step < 64; step += 1) {
    const phase = (step / 64) * Math.PI * 2;
    const [x, y, z] = figureEight(phase, 2, 1, 1);
    const [mx, my, mz] = figureEight(phase + Math.PI, 2, 1, 1);
    assert.ok(Math.abs(x) <= 2 && Math.abs(y) <= 0.5 && Math.abs(z) <= 1);
    close(mx, -x);
    close(my, y);
    close(mz, -z);
  }
});

test('the plane banks into turns and rolls upside down at the top of a loop', () => {
  const forward = [1, 0, 0];
  assert.deepEqual(bankedUp(forward, [0, 0, 0]), [0, 1, 0]);
  const turning = bankedUp(forward, [0, 0, 6], 6);
  close(turning[1], Math.SQRT1_2);
  close(turning[2], Math.SQRT1_2);
  close(turning[0], 0);
  const inverted = bankedUp(forward, [0, -15, 0], 6);
  assert.ok(inverted[1] < -0.99);
  const braking = bankedUp(forward, [-30, 0, 0], 6);
  assert.deepEqual(braking.map((v) => Math.round(v * 1e6) / 1e6), [0, 1, 0]);
});

test('rotating about a crease keeps distances and a half turn reflects across it', () => {
  const out = [0, 0, 0];
  rotateAboutAxis(out, 0, 1, 1, 0, [0, 0, 0], [1, 0, 0], Math.PI);
  close(out[0], 1);
  close(out[1], -1);
  close(out[2], 0);
  const diagonal = [Math.SQRT1_2, Math.SQRT1_2, 0];
  rotateAboutAxis(out, 0, -0.5, 0.2, 0, [0, 0, 0], diagonal, 1.1);
  close(Math.hypot(...out), Math.hypot(-0.5, 0.2));
});

test('the sheet folds into a symmetric dart without losing paper', () => {
  const fold = createDartFold({ columns: 32, rows: 46 });
  const area = (positions) => {
    let total = 0;
    for (let index = 0; index < fold.indices.length; index += 3) {
      const [a, b, c] = [0, 1, 2].map((corner) => fold.indices[index + corner] * 3);
      const u = [0, 1, 2].map((axis) => positions[b + axis] - positions[a + axis]);
      const v = [0, 1, 2].map((axis) => positions[c + axis] - positions[a + axis]);
      total += Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
    }
    return total;
  };
  const flatArea = area(fold.flat);
  close(flatArea, Math.SQRT2, 1e-6);
  assert.ok(Math.abs(area(fold.finished) - flatArea) / flatArea < 0.05);

  // Every stage picks up exactly where the previous one finished.
  for (let stage = 0; stage < fold.stageCount - 1; stage += 1) {
    const end = fold.pose(stage, 1);
    const start = fold.pose(stage + 1, 0);
    for (let index = 0; index < end.length; index += 1) close(end[index], start[index], 1e-5);
  }
  assert.deepEqual([...fold.pose(-1, 0)], [...fold.flat]);
  assert.deepEqual([...fold.pose(fold.stageCount, 0)], [...fold.finished]);

  // Left and right halves mirror each other, and the wings sit above the keel.
  const columns = fold.columns + 1;
  for (let row = 0; row <= fold.rows; row += 5) {
    for (let column = 0; column <= fold.columns; column += 4) {
      const left = (row * columns + column) * 3;
      const right = (row * columns + fold.columns - column) * 3;
      close(fold.finished[left], -fold.finished[right], 1e-4);
      close(fold.finished[left + 1], fold.finished[right + 1], 1e-4);
      close(fold.finished[left + 2], fold.finished[right + 2], 1e-4);
    }
  }
  const [leftTip, rightTip] = fold.wingtips.map((index) => fold.finished[index * 3 + 2]);
  const keel = fold.finished[(fold.columns / 2) * 3 + 2];
  assert.ok(leftTip > keel + 0.1 && rightTip > keel + 0.1);
});
