import test from 'node:test';
import assert from 'node:assert/strict';
import { pointerGaze, paperReaction, solvePaperArm } from '../src/utils/heroMotion.js';

const bounds = { left: 600, top: 100, width: 600, height: 600 };

test('paper companion follows the pointer in both directions and stays bounded', () => {
  const neutral = pointerGaze(1092, 550, bounds);
  assert.ok(Math.abs(neutral.x) < 1e-12 && Math.abs(neutral.y) < 1e-12);
  assert.deepEqual(pointerGaze(-1000, -1000, bounds), { x: -1, y: 1 });
  assert.deepEqual(pointerGaze(5000, 5000, bounds), { x: 1, y: -1 });
  assert.deepEqual(pointerGaze(50, 50, { width: 0, height: 0 }), { x: 0, y: 0 });
});

test('click reaction settles exactly into the neutral pose without a permanent loop', () => {
  assert.equal(paperReaction(0).active, true);
  assert.ok(paperReaction(600).hop > 0);
  assert.ok(Math.abs(paperReaction(450).wave) > .8);
  assert.equal(paperReaction(2400).active, false);
  for (const elapsed of [2400, 100000]) {
    const pose = paperReaction(elapsed);
    for (const key of ['hop', 'wave', 'fold', 'lift']) assert.equal(pose[key], 0);
    assert.equal(pose.scan, 1);
  }
});

test('both articulated arms reach their targets without detached wrists', () => {
  for (const side of [-1, 1]) {
    for (const [x, y] of [[.72, 1.35], [.69, 1.58], [.78, 1.08], [.63, 1.54]]) {
      const pose = solvePaperArm(x * side, y, side);
      const reachedX = side * .48 - Math.sin(pose.shoulder) * .31 - Math.sin(pose.shoulder + pose.elbow) * .29;
      const reachedY = 1.06 + Math.cos(pose.shoulder) * .31 + Math.cos(pose.shoulder + pose.elbow) * .29;
      assert.ok(Math.abs(reachedX - x * side) < 1e-10);
      assert.ok(Math.abs(reachedY - y) < 1e-10);
    }
  }
});

test('arm solver clamps unreachable targets and remains finite at the shoulder', () => {
  for (const side of [-1, 1]) {
    for (const [x, y] of [[side * .48, 1.06], [100, 100], [-100, -100]]) {
      const pose = solvePaperArm(x, y, side);
      assert.ok(Number.isFinite(pose.shoulder) && Number.isFinite(pose.elbow));
      const wristDistance = Math.hypot(-Math.sin(pose.shoulder) * .31 - Math.sin(pose.shoulder + pose.elbow) * .29, Math.cos(pose.shoulder) * .31 + Math.cos(pose.shoulder + pose.elbow) * .29);
      assert.ok(wristDistance >= .02 && wristDistance < .6);
    }
  }
});
