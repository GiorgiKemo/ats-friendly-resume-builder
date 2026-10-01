import * as THREE from 'three';
import { canvasTexture, createStudioEnvironment, mountScene, radialTexture } from './runtime';
import { drawExampleResume, loadResumeFonts } from './resumeArt';
import { createConfetti, createFoldingSheet, createRibbon, flightQuaternion } from './paperPlane';
import { bankedUp, clamp, easeInOutCubic, easeOutBack, easeOutCubic, figureEight, segment, springStep } from '../../utils/sceneMotion';

// "That feeling when you hit send": the example resume folds itself into a
// paper plane, launches into a loop with contrails and confetti, then glides
// on a lazy figure-eight. The CTA reuses the plane, hovering in place.

const SHEET_SIZE = 1.45;
const GRAVITY = 6;
const OMEGA = 0.8;
const LOOP_LENGTH = 1.5;
const LOOP_RADIUS = 0.42;
const TRAIL_SECONDS = 0.9;
const TRAIL_POINTS = 48;
const SEND = { fold: 1.2, foldLength: 2.5, turn: 3.8, launch: 4.4 };
const HOVER = new THREE.Vector3(0, 0.15, 0.45);
const SEND_SIZE = 1.8;
const FLIGHT_SCALE = 0.56;

function addLights(root, renderer) {
  const environment = createStudioEnvironment(renderer);
  root.environment = environment.texture;
  root.environmentIntensity = 0.9;
  root.add(new THREE.HemisphereLight(0xffffff, 0xc7d2fe, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 2.8);
  key.position.set(-2, 7, 4);
  root.add(key);
  const rim = new THREE.DirectionalLight(0x93c5fd, 1.4);
  rim.position.set(4, 1, -4);
  root.add(rim);
  return environment;
}

const trailWidth = (fadeIn) => (t) => 0.07 * (1 - t) ** 0.7 * fadeIn;
const trailAlpha = (fadeIn) => (t) => (1 - t) ** 1.6 * fadeIn;

export function createSendScene(host, { reducedMotion, signal, onUnavailable, onLaunch }) {
  return mountScene(host, {
    signal,
    reducedMotion,
    onUnavailable,
    setup: async ({ renderer, dark, listen }) => {
      await loadResumeFonts();
      return setupSend({ renderer, dark, listen, reducedMotion, onLaunch });
    },
  });
}

function setupSend({ renderer, dark, listen, reducedMotion, onLaunch }) {
  const root = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
  camera.position.set(0, 0.35, 6);
  camera.lookAt(0, 0, 0);
  const environment = addLights(root, renderer);

  // Soft shadow on an imagined floor, so the plane reads against white.
  const shadowMaterial = new THREE.MeshBasicMaterial({ map: radialTexture(128, [[0, 'rgba(15,23,42,0.55)'], [0.5, 'rgba(15,23,42,0.18)'], [1, 'rgba(15,23,42,0)']]), transparent: true, depthWrite: false });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadowMaterial);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -1.75;
  root.add(shadow);

  const texture = canvasTexture(renderer, drawExampleResume(1280).canvas);
  const sheet = createFoldingSheet(texture, { size: SEND_SIZE });
  const rig = new THREE.Group();
  rig.add(sheet.object);
  root.add(rig);
  const trailColors = (isDark) => (isDark ? { head: 0x93c5fd, tail: 0xc4b5fd } : { head: 0x3b82f6, tail: 0xa78bfa });
  const trails = [0, 1].map(() => createRibbon(TRAIL_POINTS, trailColors(dark)));
  trails.forEach((trail) => root.add(trail.mesh));
  const confetti = createConfetti(180);
  root.add(confetti.mesh);

  // ── Flight path ─────────────────────────────────────────────────────────
  const loops = [];
  const scheduleLoop = (start) => {
    const forward = new THREE.Vector3();
    const ahead = new THREE.Vector3();
    basePath(start - SEND.launch, forward);
    basePath(start - SEND.launch + 0.02, ahead);
    forward.subVectors(ahead, forward).normalize();
    const up = new THREE.Vector3(0, 1, 0).addScaledVector(forward, -forward.y).normalize();
    loops.push({ start, forward, up, burst: false });
  };
  scheduleLoop(SEND.launch + 1.25);

  function basePath(local, out) {
    if (local <= 0) return out.copy(HOVER);
    // Eases from rest into full speed, so the launch has real acceleration.
    const ramp = local - 0.55 * (1 - Math.exp(-local / 0.55));
    const [x, y, z] = figureEight(ramp * OMEGA, 1.45, 0.95, 0.9);
    return out.set(x, y + 0.15, z - 0.45);
  }

  function pathAt(time, out) {
    basePath(time - SEND.launch, out);
    for (const loop of loops) {
      const progress = segment(time, loop.start, LOOP_LENGTH);
      if (progress <= 0 || progress >= 1) continue;
      const turn = easeInOutCubic(progress) * Math.PI * 2;
      out.addScaledVector(loop.forward, Math.sin(turn) * LOOP_RADIUS);
      out.addScaledVector(loop.up, (1 - Math.cos(turn)) * LOOP_RADIUS);
    }
    return out;
  }

  const before = new THREE.Vector3();
  const after = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const acceleration = new THREE.Vector3();
  const lift = new THREE.Vector3();
  function flightPose(time, position, quaternion) {
    const delta = 1 / 90;
    pathAt(time, position);
    pathAt(time - delta, before);
    pathAt(time + delta, after);
    forward.subVectors(after, before);
    if (forward.lengthSq() < 1e-10) basePath(0.05, forward).sub(HOVER);
    forward.normalize();
    acceleration.copy(after).add(before).addScaledVector(position, -2).divideScalar(delta * delta);
    lift.fromArray(bankedUp(forward.toArray(), acceleration.toArray(), GRAVITY));
    return flightQuaternion(forward, lift, quaternion);
  }

  // ── Timeline ────────────────────────────────────────────────────────────
  const foldQuaternion = new THREE.Quaternion();
  const launchQuaternion = new THREE.Quaternion();
  const scratchPosition = new THREE.Vector3();
  const scratchQuaternion = new THREE.Quaternion();
  const wingtip = new THREE.Vector3();
  const trailPoints = [0, 1].map(() => Array.from({ length: TRAIL_POINTS }, () => new THREE.Vector3()));
  flightPose(SEND.launch + 0.02, scratchPosition, launchQuaternion);
  const euler = new THREE.Euler();
  const look = { value: 0, velocity: 0 };
  let lookTarget = 0;
  let clock = reducedMotion ? SEND.launch + 3.4 : 0;
  let launched = false;
  let lastLoop = SEND.launch + 1.25;
  let isDark = dark;

  if (!reducedMotion) {
    listen(window, 'pointermove', (event) => {
      lookTarget = clamp(event.clientX / window.innerWidth - 0.5, -0.5, 0.5);
    }, { passive: true });
  }

  function update(dt) {
    if (!reducedMotion) clock += dt;
    const t = clock;
    springStep(look, lookTarget, dt, 30, 9);
    camera.position.x = look.value * 0.8;
    camera.lookAt(0, 0, 0);

    const scale = 1 - (1 - FLIGHT_SCALE) * easeInOutCubic(segment(t, SEND.turn, SEND.launch - SEND.turn));
    if (t < SEND.launch) {
      // Appear, fold, then turn to face the direction of flight.
      const appear = easeOutBack(segment(t, 0, 0.8), 1.3);
      const folding = segment(t, SEND.fold, SEND.foldLength);
      sheet.setFold(folding * sheet.stages);
      // Starts nearly face-on so the resume reads, then tilts to show the folds.
      const tilt = easeInOutCubic(segment(t, SEND.fold - 0.2, 0.9));
      euler.set(-0.08 - tilt * 0.4 - folding * 0.12 + (1 - appear) * -0.8, 0.08 + tilt * 0.2 - folding * 0.55 + (1 - appear) * 1.1, 0.02);
      foldQuaternion.setFromEuler(euler);
      const turn = easeInOutCubic(segment(t, SEND.turn, SEND.launch - SEND.turn));
      rig.quaternion.slerpQuaternions(foldQuaternion, launchQuaternion, turn);
      rig.position.set(0, 0.05 + Math.sin(t * 2) * 0.03, 0).lerp(HOVER, turn);
      rig.scale.setScalar(Math.max(0.0001, appear) * scale);
    } else {
      sheet.setFold(sheet.stages);
      flightPose(t, rig.position, rig.quaternion);
      rig.scale.setScalar(scale);
      if (!launched) {
        launched = true;
        if (!reducedMotion) confetti.burst(HOVER, 70, 2.4);
        onLaunch?.();
      }
    }

    // Loops: one right after launch, then every so often, or on request.
    if (!reducedMotion && t - lastLoop > 9.5 && t > SEND.launch) {
      lastLoop = t;
      scheduleLoop(t);
    }
    for (const loop of loops) {
      if (!loop.burst && t >= loop.start + LOOP_LENGTH * 0.5) {
        loop.burst = true;
        if (!reducedMotion) confetti.burst(rig.position, 110, 3);
      }
    }
    while (loops.length > 4) loops.shift();

    // Contrails, sampled from the analytic flight path so they stay smooth.
    const flown = t - SEND.launch;
    const fadeIn = clamp(flown / 0.4, 0, 1);
    trails.forEach((trail, side) => {
      const points = trailPoints[side];
      if (flown <= 0) {
        trail.update([], camera, trailWidth(0), trailAlpha(0));
        return;
      }
      const span = Math.min(TRAIL_SECONDS, flown);
      for (let index = 0; index < TRAIL_POINTS; index += 1) {
        const time = t - (index / (TRAIL_POINTS - 1)) * span;
        flightPose(time, scratchPosition, scratchQuaternion);
        wingtip.copy(sheet.wingtips[side]).multiplyScalar(SEND_SIZE * scale).applyQuaternion(scratchQuaternion);
        points[index].copy(scratchPosition).add(wingtip);
      }
      trail.update(points, camera, trailWidth(fadeIn), trailAlpha(fadeIn));
    });

    const height = rig.position.y - shadow.position.y;
    shadow.position.x = rig.position.x;
    shadow.position.z = rig.position.z;
    shadow.scale.set(1.6 + height * 0.35, 1, 0.8 + height * 0.2).multiplyScalar(rig.scale.x);
    shadowMaterial.opacity = (isDark ? 0.55 : 0.32) * clamp(1.4 / height, 0.3, 1);

    confetti.update(reducedMotion ? 0 : dt);
    renderer.render(root, camera);
    return true;
  }

  return {
    root,
    update,
    resize(width, height) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },
    compile: () => renderer.compileAsync(root, camera),
    setTheme(next) {
      isDark = next;
      const colors = trailColors(isDark);
      trails.forEach((trail) => {
        trail.uniforms.uHead.value.setHex(colors.head);
        trail.uniforms.uTail.value.setHex(colors.tail);
      });
    },
    dispose() { environment.dispose(); },
    api: {
      celebrate() {
        if (reducedMotion || clock < SEND.launch + 0.4) return false;
        const busy = loops.some((loop) => clock < loop.start + LOOP_LENGTH);
        if (!busy) {
          lastLoop = clock;
          scheduleLoop(clock + 0.05);
        }
        return true;
      },
    },
  };
}

// ── CTA: the plane hovers, banks towards the cursor and rolls now and then ──

export function createCtaScene(host, { reducedMotion, signal, onUnavailable }) {
  return mountScene(host, {
    signal,
    reducedMotion,
    onUnavailable,
    setup: async ({ renderer, listen }) => {
      await loadResumeFonts();
      return setupCta({ renderer, listen, host, reducedMotion });
    },
  });
}

function setupCta({ renderer, listen, host, reducedMotion }) {
  const root = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 50);
  camera.position.set(0, 0, 6.4);
  const environment = addLights(root, renderer);
  root.environmentIntensity = 1.1;

  const texture = canvasTexture(renderer, drawExampleResume(1024).canvas);
  const sheet = createFoldingSheet(texture, { size: SHEET_SIZE });
  sheet.setFold(sheet.stages);
  const rig = new THREE.Group();
  rig.add(sheet.object);
  root.add(rig);
  const trails = [0, 1].map(() => createRibbon(TRAIL_POINTS, { head: 0xffffff, tail: 0x7dd3fc, opacity: 0.85 }));
  trails.forEach((trail) => root.add(trail.mesh));

  const aim = { x: { value: 0, velocity: 0 }, y: { value: 0, velocity: 0 } };
  const target = { x: 0, y: 0 };
  if (!reducedMotion) {
    listen(window, 'pointermove', (event) => {
      const box = host.getBoundingClientRect();
      target.x = clamp((event.clientX - (box.left + box.width / 2)) / 500, -1, 1);
      target.y = clamp((event.clientY - (box.top + box.height / 2)) / 400, -1, 1);
    }, { passive: true });
  }

  const forward = new THREE.Vector3();
  const up = new THREE.Vector3();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const roll = new THREE.Quaternion();
  const wingtip = new THREE.Vector3();
  const points = [0, 1].map(() => Array.from({ length: TRAIL_POINTS }, () => new THREE.Vector3()));
  const SPEED = 2.6;
  const ROLL_EVERY = 7;
  const CTA_SCALE = 1;

  function pose(time, outPosition, outQuaternion) {
    forward.set(0.85 + aim.x.value * 0.25, 0.28 - aim.y.value * 0.4, 0.55).normalize();
    up.set(Math.sin(time * 0.9) * 0.22 - aim.x.value * 0.35 - 0.15, 1, 0.65).normalize();
    outPosition.set(Math.sin(time * 0.7) * 0.1 - 0.15, Math.sin(time * 1.3) * 0.13, 0);
    flightQuaternion(forward, up, outQuaternion);
    const cycle = (time % ROLL_EVERY) / 1.2;
    if (cycle < 1) {
      roll.setFromAxisAngle(forward, easeInOutCubic(cycle) * Math.PI * 2);
      outQuaternion.premultiply(roll);
    }
    return outQuaternion;
  }

  let clock = reducedMotion ? 3 : 1.5;
  function update(dt) {
    if (!reducedMotion) clock += dt;
    springStep(aim.x, target.x, dt, 25, 8);
    springStep(aim.y, target.y, dt, 25, 8);
    const entrance = reducedMotion ? 1 : easeOutCubic(segment(clock, 1.5, 1));
    pose(clock, rig.position, rig.quaternion);
    rig.position.x -= (1 - entrance) * 3;
    rig.scale.setScalar(CTA_SCALE);
    trails.forEach((trail, side) => {
      for (let index = 0; index < TRAIL_POINTS; index += 1) {
        const age = (index / (TRAIL_POINTS - 1)) * TRAIL_SECONDS;
        pose(clock - age, position, quaternion);
        wingtip.copy(sheet.wingtips[side]).multiplyScalar(SHEET_SIZE * CTA_SCALE).applyQuaternion(quaternion);
        points[side][index].copy(position).add(wingtip).addScaledVector(forward, -SPEED * age);
        points[side][index].x -= (1 - entrance) * 3;
      }
      trail.update(points[side], camera, trailWidth(1), trailAlpha(entrance));
    });
    renderer.render(root, camera);
    return true;
  }

  return {
    root,
    update,
    resize(width, height) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },
    compile: () => renderer.compileAsync(root, camera),
    dispose() { environment.dispose(); },
    api: {},
  };
}
