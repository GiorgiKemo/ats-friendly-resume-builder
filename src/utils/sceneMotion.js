// Small, dependency-free motion helpers shared by the homepage 3D scenes.
// Kept free of three.js so they can be unit tested in Node.

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const lerp = (from, to, amount) => from + (to - from) * amount;

export const smoothstep = (edge0, edge1, value) => {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

export const easeOutCubic = (t) => 1 - (1 - clamp(t, 0, 1)) ** 3;
export const easeInOutCubic = (t) => {
  const p = clamp(t, 0, 1);
  return p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
};
// Overshoots a little before settling: a "pop" for badges and tiles.
export const easeOutBack = (t, overshoot = 1.70158) => {
  const p = clamp(t, 0, 1) - 1;
  return 1 + (overshoot + 1) * p * p * p + overshoot * p * p;
};

/** Progress (0–1) of a segment that starts at `start` and lasts `duration`. */
export const segment = (time, start, duration) => clamp((time - start) / duration, 0, 1);

/**
 * Advances a damped spring towards `target`. Sub-steps keep it stable when a
 * frame takes long (tab switch, slow device). Mutates and returns `state`.
 */
export const springStep = (state, target, dt, stiffness = 120, damping = 14) => {
  const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
  const h = Math.min(dt, 0.1) / steps;
  for (let index = 0; index < steps; index += 1) {
    const force = (target - state.value) * stiffness - state.velocity * damping;
    state.velocity += force * h;
    state.value += state.velocity * h;
  }
  return state;
};

/** Figure-eight flight path with depth, used for the paper plane's glide. */
export const figureEight = (phase, width = 1, height = 1, depth = 1) => [
  Math.sin(phase) * width,
  Math.sin(phase * 2) * 0.5 * height,
  Math.cos(phase) * depth,
];

/**
 * Up vector for a coordinated turn: lift points against gravity plus the
 * centripetal pull, so the plane banks into curves and rolls through loops.
 */
export const bankedUp = (forward, acceleration, gravity = 9.8) => {
  const along = acceleration[0] * forward[0] + acceleration[1] * forward[1] + acceleration[2] * forward[2];
  const up = [
    acceleration[0] - forward[0] * along,
    acceleration[1] - forward[1] * along + gravity,
    acceleration[2] - forward[2] * along,
  ];
  // Remove whatever still points along the direction of travel.
  const drift = up[0] * forward[0] + up[1] * forward[1] + up[2] * forward[2];
  up[0] -= forward[0] * drift;
  up[1] -= forward[1] * drift;
  up[2] -= forward[2] * drift;
  const length = Math.hypot(up[0], up[1], up[2]);
  return length < 1e-6 ? [0, 1, 0] : [up[0] / length, up[1] / length, up[2] / length];
};
