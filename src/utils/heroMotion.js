const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const pointerGaze = (clientX, clientY, bounds) => {
  if (!bounds.width || !bounds.height) return { x: 0, y: 0 };
  return {
    x: clamp((clientX - bounds.left - bounds.width * .82) / (bounds.width * .65), -1, 1),
    y: clamp(-(clientY - bounds.top - bounds.height * .75) / (bounds.height * .6), -1, 1) || 0,
  };
};

export const paperReaction = (elapsed) => {
  const active = elapsed >= 0 && elapsed < 2400;
  const smooth = (value) => { const p = clamp(value, 0, 1); return p * p * (3 - 2 * p); };
  const lift = active ? smooth(elapsed / 300) * (1 - smooth((elapsed - 1750) / 650)) : 0;
  const jumpProgress = clamp((elapsed - 180) / 800, 0, 1);
  return {
    active,
    lift,
    wave: active ? Math.sin((elapsed - 300) / 250 * Math.PI) * lift : 0,
    hop: active ? Math.sin(jumpProgress * Math.PI) ** 2 : 0,
    fold: active ? Math.sin(elapsed / 220 * Math.PI) * lift : 0,
    scan: clamp(elapsed / 1100, 0, 1),
  };
};

// A two-joint arm with fixed upper/forearm lengths, measured from the Blender rig.
// Wrist rotation compensates for these angles so the glove never twists backwards.
export const solvePaperArm = (handX, handY, side) => {
  const dx = handX - side * .48;
  const dy = handY - 1.06;
  const upperLength = .31, lowerLength = .29;
  const distance = clamp(Math.hypot(dx, dy), .021, .599);
  const spread = Math.acos(clamp((upperLength ** 2 + distance ** 2 - lowerLength ** 2) / (2 * upperLength * distance), -1, 1));
  const bend = Math.acos(clamp((upperLength ** 2 + lowerLength ** 2 - distance ** 2) / (2 * upperLength * lowerLength), -1, 1));
  return {
    shoulder: Math.atan2(-dx, dy) - side * spread,
    elbow: side * (Math.PI - bend),
  };
};
