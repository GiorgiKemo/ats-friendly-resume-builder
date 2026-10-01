// Folds a sheet of paper into a classic dart paper plane, one crease at a time.
//
// The sheet is a dense grid. Each stage rotates the vertices on one side of a
// crease about that crease (Rodrigues' rotation). A narrow band around each
// crease rotates partially, which reads as a soft, rounded paper fold instead
// of a tear. Stages run in order, so every stage starts from the fully
// completed previous one and folds stay consistent through all paper layers.
//
// Sheet space: x across the page, y up the page (the nose is the top edge
// centre), z out of the printed side. In the finished plane, +y is forward
// (the nose), +z is up and +x is the right wing.

import { smoothstep } from './sceneMotion.js';

const ROOT_HALF = Math.SQRT1_2;

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const normalize = (v) => {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
};

/** Rotates point (x, y, z) about the axis through `origin` along unit `axis`. */
export function rotateAboutAxis(out, offset, x, y, z, origin, axis, angle) {
  const px = x - origin[0];
  const py = y - origin[1];
  const pz = z - origin[2];
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const along = (axis[0] * px + axis[1] * py + axis[2] * pz) * (1 - cos);
  out[offset] = origin[0] + px * cos + (axis[1] * pz - axis[2] * py) * sin + axis[0] * along;
  out[offset + 1] = origin[1] + py * cos + (axis[2] * px - axis[0] * pz) * sin + axis[1] * along;
  out[offset + 2] = origin[2] + pz * cos + (axis[0] * py - axis[1] * px) * sin + axis[2] * along;
  return out;
}

const rotateVector = (vector, axis, angle) => {
  const out = [0, 0, 0];
  rotateAboutAxis(out, 0, vector[0], vector[1], vector[2], [0, 0, 0], axis, angle);
  return out;
};

const maxDepth = (positions) => {
  let max = -Infinity;
  for (let index = 2; index < positions.length; index += 3) max = Math.max(max, positions[index]);
  return max;
};

/**
 * A hinge rotates the vertices on the `side` of a crease in a flat state.
 * `from`/`to` are 2D crease endpoints; `side` is any 2D point on the moving
 * side; `toward` is where the moving side should swing (decides the sign).
 */
function planarHinge(state, { from, to, side, angle, toward, depth, band }) {
  const direction = normalize([to[0] - from[0], to[1] - from[1], 0]);
  let normal = [-direction[1], direction[0], 0];
  if ((side[0] - from[0]) * normal[0] + (side[1] - from[1]) * normal[1] < 0) normal = normal.map((value) => -value);
  const count = state.length / 3;
  const weights = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    const distance = (state[index * 3] - from[0]) * normal[0] + (state[index * 3 + 1] - from[1]) * normal[1];
    weights[index] = smoothstep(-band / 2, band / 2, distance);
  }
  const sign = dot(cross(direction, normal), toward) < 0 ? -1 : 1;
  return { origin: [from[0], from[1], depth], axis: direction, normal, angle: angle * sign, weights };
}

function applyHinges(out, start, hinges, fraction) {
  out.set(start);
  if (fraction <= 0) return out;
  const count = start.length / 3;
  for (const hinge of hinges) {
    const angle = hinge.angle * fraction;
    for (let index = 0; index < count; index += 1) {
      const weight = hinge.weights[index];
      if (weight <= 0) continue;
      const offset = index * 3;
      rotateAboutAxis(out, offset, out[offset], out[offset + 1], out[offset + 2], hinge.origin, hinge.axis, angle * weight);
    }
  }
  return out;
}

/**
 * Builds the grid and the four fold stages. Returns the flat sheet, the UVs
 * and triangle indices, and `pose(stage, fraction, out)`, which writes the
 * vertex positions for a moment in the folding sequence.
 */
export function createDartFold({
  columns = 96,
  rows = 136,
  width = 1,
  height = 2 * ROOT_HALF,
  band = 0.014,
  layer = 0.0035,
  keelAngle = (80 * Math.PI) / 180,
  wingAngle = (74 * Math.PI) / 180,
  keelDepth = 0.13,
} = {}) {
  const count = (columns + 1) * (rows + 1);
  const flat = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  for (let row = 0; row <= rows; row += 1) {
    for (let column = 0; column <= columns; column += 1) {
      const index = row * (columns + 1) + column;
      flat[index * 3] = (column / columns - 0.5) * width;
      flat[index * 3 + 1] = (row / rows - 0.5) * height;
      uvs[index * 2] = column / columns;
      uvs[index * 2 + 1] = row / rows;
    }
  }
  const indices = new Uint32Array(columns * rows * 6);
  let cursor = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const a = row * (columns + 1) + column;
      const b = a + 1;
      const c = a + columns + 1;
      const d = c + 1;
      indices.set([a, b, d, a, d, c], cursor);
      cursor += 6;
    }
  }

  const nose = [0, halfHeight];
  const up = [0, 0, 1];
  const stages = [];
  const states = [flat];
  const nextState = (hinges) => {
    const start = states[states.length - 1];
    stages.push({ start, hinges });
    states.push(applyHinges(new Float32Array(start.length), start, hinges, 1));
  };

  // 1. Top corners down to the centre line.
  let depth = maxDepth(flat) + layer / 2;
  nextState([-1, 1].map((side) => planarHinge(flat, {
    from: nose, to: [side * halfWidth, halfHeight - halfWidth], side: [side * halfWidth, halfHeight],
    angle: Math.PI, toward: up, depth, band,
  })));

  // 2. The new slanted edges down to the centre line again (22.5° creases).
  const slant = Math.tan(Math.PI / 8);
  depth = maxDepth(states[1]) + layer / 2;
  nextState([-1, 1].map((side) => planarHinge(states[1], {
    from: nose, to: [side * halfWidth, halfHeight - halfWidth / slant], side: [side * halfWidth, 0],
    angle: Math.PI, toward: up, depth, band,
  })));

  // 3. Fold in half along the centre: both halves swing up into a keel.
  const flatFolded = states[2];
  depth = maxDepth(flatFolded) / 2;
  const keel = [-1, 1].map((side) => planarHinge(flatFolded, {
    from: [0, -halfHeight], to: [0, halfHeight], side: [side, 0],
    angle: keelAngle, toward: up, depth, band: band * 1.4,
  }));
  nextState(keel);

  // 4. Wings fold back out along creases from the nose to the tail, measured
  // on the flat-folded sheet, then carried along with their keel half.
  const wings = keel.map((hinge, index) => {
    const side = index === 0 ? -1 : 1;
    const planar = planarHinge(flatFolded, {
      from: nose, to: [side * keelDepth, -halfHeight], side: [side * halfWidth, 0],
      angle: 1, toward: up, depth: maxDepth(flatFolded) / 2, band,
    });
    const origin = [0, 0, 0];
    rotateAboutAxis(origin, 0, planar.origin[0], planar.origin[1], planar.origin[2], hinge.origin, hinge.axis, hinge.angle);
    const axis = rotateVector(planar.axis, hinge.axis, hinge.angle);
    const normal = rotateVector(planar.normal, hinge.axis, hinge.angle);
    const sign = dot(cross(axis, normal), [side, 0, 0]) < 0 ? -1 : 1;
    return { origin, axis, normal, angle: wingAngle * sign, weights: planar.weights };
  });
  nextState(wings);

  const wingtips = [0, columns];
  const finished = states[states.length - 1];
  return {
    columns,
    rows,
    count,
    flat,
    uvs,
    indices,
    stageCount: stages.length,
    finished,
    /** Index of the rear wingtip vertices (left, right), for contrails. */
    wingtips,
    /** Writes positions for `stage` (0-based) at `fraction` (0–1) into `out`. */
    pose(stage, fraction, out = new Float32Array(count * 3)) {
      if (stage < 0) {
        out.set(flat);
        return out;
      }
      if (stage >= stages.length) {
        out.set(finished);
        return out;
      }
      return applyHinges(out, stages[stage].start, stages[stage].hinges, fraction);
    },
  };
}
