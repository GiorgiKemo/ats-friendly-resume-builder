import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { canvasTexture, createStudioEnvironment, mountScene } from './runtime';
import { drawTileLabel } from './resumeArt';
import { CAMERA_DISTANCE, HERO_PAGES, PAGE_EMS, PAGE_HEIGHT, PAGE_WIDTH, STACK_ROTATION, restingTransform } from '../brand/heroLayout';
import { clamp, easeInOutCubic, easeOutBack, easeOutCubic, segment, springStep } from '../../utils/sceneMotion';

// The hero: three HTML resume pages placed in 3D with CSS (so their text is
// drawn natively and stays sharp), plus a transparent WebGL layer on top for
// the check mark, the PDF/DOCX tiles, a sparkle and soft light motes. Both are
// driven from the same three.js objects, so they always line up. Invisible
// stand-ins for the pages give the WebGL layer correct depth and let the tiles
// cast real shadows onto the HTML pages.
//
// On load the front page prints, a light scans it and highlights keywords,
// then the check mark and the files pop out. Drag turns the stack; a click
// or Enter replays the scan.

const TIMELINE = { print: 0.15, printLength: 1.1, scan: 1.45, scanLength: 1.55, badge: 2.85, files: 3, settled: 4.2 };
const REPLAY = { fade: 0.35, scan: 0.3, badge: 1.65, files: 1.75, length: 2.8 };
const AUTO_REPLAY_EVERY = 11;

function checkPath() {
  const path = new THREE.CurvePath();
  const a = new THREE.Vector3(-0.34, 0.03, 0);
  const corner = new THREE.Vector3(-0.1, -0.21, 0);
  const b = new THREE.Vector3(0.36, 0.28, 0);
  const before = corner.clone().lerp(a, 0.2);
  const after = corner.clone().lerp(b, 0.13);
  path.add(new THREE.LineCurve3(a, before));
  path.add(new THREE.QuadraticBezierCurve3(before, corner, after));
  path.add(new THREE.LineCurve3(after, b));
  return { path, ends: [a, b] };
}

function starGeometry() {
  const shape = new THREE.Shape();
  const outer = 0.4;
  const inner = 0.07;
  for (let point = 0; point < 4; point += 1) {
    const angle = (point / 4) * Math.PI * 2 + Math.PI / 2;
    const next = angle + Math.PI / 2;
    const tip = [Math.cos(angle) * outer, Math.sin(angle) * outer];
    const valley = [Math.cos(angle + Math.PI / 4) * inner, Math.sin(angle + Math.PI / 4) * inner];
    if (point === 0) shape.moveTo(...tip);
    shape.quadraticCurveTo(valley[0], valley[1], Math.cos(next) * outer, Math.sin(next) * outer);
  }
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.035, bevelSegments: 4, curveSegments: 24 });
  geometry.center();
  return geometry;
}

/** CSS matrix3d for an object: three.js is y-up in units, CSS is y-down in px. */
const cssMatrix = new THREE.Matrix4();
function toCss(object, unitsPerPixel) {
  const e = cssMatrix.copy(object.matrixWorld).elements;
  e[12] /= unitsPerPixel;
  e[13] /= unitsPerPixel;
  e[14] /= unitsPerPixel;
  for (const index of [1, 4, 6, 7, 9, 13]) e[index] = -e[index];
  return `matrix3d(${e.map((value) => Number(value.toFixed(6))).join(',')})`;
}

export function createHeroScene(elements, { reducedMotion, skipIntro, signal, onUnavailable, onScan }) {
  return mountScene(elements.host, {
    signal,
    reducedMotion,
    alpha: true,
    shadows: true,
    onUnavailable,
    setup: ({ renderer, dark, wake, listen }) => setupHero({ renderer, dark, wake, listen, ...elements, reducedMotion, skipIntro, onScan }),
  });
}

function setupHero({ renderer, dark, wake, listen, host, scene: sceneElement, pages: pagesElement, stage, reducedMotion, skipIntro, onScan }) {
  const root = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(18, 1, 8, 40);
  camera.position.set(0, 0, CAMERA_DISTANCE);
  const environment = createStudioEnvironment(renderer);
  root.environment = environment.texture;
  root.environmentIntensity = 0.9;
  const hemisphere = new THREE.HemisphereLight(0xffffff, 0xdbeafe, 0.9);
  root.add(hemisphere);
  const key = new THREE.DirectionalLight(0xffffff, 3.2);
  key.position.set(-2.5, 4, 14);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 4, far: 30 });
  key.shadow.radius = 14;
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.02;
  root.add(key);

  // ── Pages: HTML in 3D, with invisible stand-ins for depth and shadows ──
  const rig = new THREE.Group();
  root.add(rig);
  const stack = new THREE.Group();
  stack.rotation.set(...STACK_ROTATION);
  rig.add(stack);
  const pageElements = HERO_PAGES.map((page) => pagesElement.querySelector(`[data-page="${page.id}"]`));
  const front = pageElements[HERO_PAGES.length - 1];
  const paper = front.querySelector('.hero-paper');
  const marks = [...front.querySelectorAll('.hero-kw')];
  const spot = sceneElement.querySelector('.home-hero-spot');

  const proxyGeometry = new THREE.PlaneGeometry(PAGE_WIDTH, PAGE_HEIGHT);
  const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false });
  const shade = new THREE.ShadowMaterial({ color: 0x0f172a, opacity: 0.12 });
  const nodes = HERO_PAGES.map((page) => {
    const node = new THREE.Group();
    node.position.fromArray(page.rest);
    node.rotation.z = page.tilt;
    const depth = new THREE.Mesh(proxyGeometry, depthOnly);
    depth.castShadow = true;
    depth.renderOrder = -1;
    const shadow = new THREE.Mesh(proxyGeometry, shade);
    shadow.position.z = 0.012;
    shadow.receiveShadow = true;
    node.add(depth, shadow);
    stack.add(node);
    return node;
  });
  const frontNode = nodes[nodes.length - 1];

  // ── Check mark ──────────────────────────────────────────────────────────
  const emerald = new THREE.MeshPhysicalMaterial({ color: 0x10b981, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08, emissive: 0x047857, emissiveIntensity: 0.28 });
  const badge = new THREE.Group();
  const { path, ends } = checkPath();
  const stroke = 0.12;
  badge.add(new THREE.Mesh(new THREE.TubeGeometry(path, 96, stroke, 24, false), emerald));
  for (const end of ends) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(stroke, 32, 20), emerald);
    cap.position.copy(end);
    badge.add(cap);
  }
  badge.traverse((object) => { object.castShadow = true; });
  const ripple = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.6, 96),
    new THREE.MeshBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
  );
  badge.add(ripple);
  badge.userData.rest = new THREE.Vector3(1.5, 1.02, 1.05);
  rig.add(badge);

  // ── File tiles ──────────────────────────────────────────────────────────
  const tileGeometry = new RoundedBoxGeometry(1, 1, 0.26, 6, 0.16);
  const labelGeometry = new THREE.PlaneGeometry(0.86, 0.86);
  const makeTile = (label, color, rest, rotation, scale) => {
    const group = new THREE.Group();
    const tile = new THREE.Mesh(tileGeometry, new THREE.MeshPhysicalMaterial({ color, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.06, sheen: 0.4, sheenColor: 0xffffff }));
    tile.castShadow = true;
    const text = new THREE.Mesh(labelGeometry, new THREE.MeshStandardMaterial({
      map: canvasTexture(renderer, drawTileLabel(label, 512)), transparent: true, roughness: 0.4, emissive: 0xffffff, emissiveIntensity: 0.25, polygonOffset: true, polygonOffsetFactor: -2,
    }));
    text.position.z = 0.131;
    group.add(tile, text);
    Object.assign(group.userData, { rest, rotation, scale });
    rig.add(group);
    return group;
  };
  const tiles = [
    makeTile('PDF', 0xe11d48, new THREE.Vector3(-1.9, -1.02, 0.85), new THREE.Euler(0.12, 0.42, -0.14), 0.78),
    makeTile('DOCX', 0x1d4ed8, new THREE.Vector3(-1.62, -2.14, 1.3), new THREE.Euler(-0.1, 0.32, 0.1), 0.68),
  ];

  // ── Sparkle and light motes ─────────────────────────────────────────────
  const star = new THREE.Mesh(starGeometry(), new THREE.MeshPhysicalMaterial({
    color: 0x8b5cf6, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05, iridescence: 0.6, iridescenceIOR: 1.4, emissive: 0x6d28d9, emissiveIntensity: 0.35,
  }));
  star.castShadow = true;
  star.userData.rest = new THREE.Vector3(-1.78, 1.5, 0.7);
  rig.add(star);

  const MOTES = 60;
  const motePositions = new Float32Array(MOTES * 3);
  const moteSeeds = new Float32Array(MOTES);
  for (let index = 0; index < MOTES; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 1.9 + Math.random() * 2;
    motePositions.set([Math.cos(angle) * radius * 1.1, Math.sin(angle) * radius * 0.9, -1.2 + Math.random() * 2.6], index * 3);
    moteSeeds[index] = Math.random();
  }
  const moteGeometry = new THREE.BufferGeometry();
  moteGeometry.setAttribute('position', new THREE.BufferAttribute(motePositions, 3));
  moteGeometry.setAttribute('seed', new THREE.BufferAttribute(moteSeeds, 1));
  const moteUniforms = { uTime: { value: 0 }, uDark: { value: dark ? 1 : 0 }, uScale: { value: 1 }, uFade: { value: 0 } };
  const motes = new THREE.Points(moteGeometry, new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: moteUniforms,
    vertexShader: /* glsl */ `
      attribute float seed;
      uniform float uTime;
      uniform float uScale;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        float t = uTime * (0.15 + seed * 0.2) + seed * 40.0;
        p += vec3(sin(t) * 0.25, mod(uTime * 0.12 * (0.5 + seed) + seed * 6.0, 6.0) - 3.0, cos(t * 0.8) * 0.2);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (2.0 + seed * 5.0) * uScale * (18.0 / -mv.z);
        vAlpha = (0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * (1.0 + seed * 2.0) + seed * 30.0))) * smoothstep(3.0, 1.8, abs(p.y));
      }`,
    fragmentShader: /* glsl */ `
      uniform float uDark;
      uniform float uFade;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.0, d);
        vec3 color = mix(vec3(0.23, 0.45, 0.95), vec3(0.75, 0.88, 1.0), uDark);
        gl_FragColor = vec4(color, a * a * vAlpha * mix(0.4, 0.8, uDark) * uFade);
      }`,
  }));
  motes.frustumCulled = false;
  rig.add(motes);

  // ── Framing: shared with the CSS layout (see heroLayout.js) ────────────
  let unitsPerPixel = 0.01;
  let focus = { x: 0, y: 0 };
  let markHeights = [];
  function measureMarks() {
    const height = paper.offsetHeight || 1;
    markHeights = marks.map((mark) => {
      let top = mark.offsetHeight / 2;
      for (let node = mark; node && node !== paper; node = node.offsetParent) top += node.offsetTop;
      return top / height;
    });
  }
  function frame() {
    const area = host.getBoundingClientRect();
    const box = stage.getBoundingClientRect();
    const em = parseFloat(getComputedStyle(pagesElement).fontSize);
    if (!area.width || !box.width || !em) return;
    unitsPerPixel = PAGE_WIDTH / (PAGE_EMS.width * em);
    const centerX = box.left + box.width / 2 - area.left;
    const centerY = box.top + box.height / 2 - area.top;
    const fullWidth = 2 * Math.max(centerX, area.width - centerX);
    const fullHeight = 2 * Math.max(centerY, area.height - centerY);
    camera.aspect = fullWidth / fullHeight;
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan((unitsPerPixel * fullHeight) / 2 / CAMERA_DISTANCE));
    camera.setViewOffset(fullWidth, fullHeight, fullWidth / 2 - centerX, fullHeight / 2 - centerY, area.width, area.height);
    camera.updateProjectionMatrix();
    focus = { x: centerX, y: centerY };
    measureMarks();
  }
  document.fonts?.ready.then(() => { measureMarks(); wake(); });

  // ── Pointer ─────────────────────────────────────────────────────────────
  const tiltX = { value: 0, velocity: 0 };
  const tiltY = { value: 0, velocity: 0 };
  const glow = { value: 0, velocity: 0 };
  const target = { x: 0, y: 0, glow: 0 };
  let pointer = null;
  let drag = null;
  let clock = 0;
  let lastInteractionAt = performance.now();
  let autoReplayTimer = 0;
  if (!reducedMotion) {
    listen(window, 'pointermove', (event) => {
      if (event.pointerType === 'touch' && !drag) return;
      const area = host.getBoundingClientRect();
      const x = event.clientX - area.left;
      const y = event.clientY - area.top;
      pointer = { x, y };
      target.glow = y >= 0 && y <= area.height ? 1 : 0;
      target.x = clamp((x - focus.x) / (area.width * 0.5), -1, 1);
      target.y = clamp((y - focus.y) / (area.height * 0.6), -1, 1);
      if (drag) {
        drag.dx = (event.clientX - drag.x) / Math.max(1, area.width * 0.3);
        drag.dy = (event.clientY - drag.y) / Math.max(1, area.height * 0.5);
      }
      lastInteractionAt = performance.now();
      wake();
    }, { passive: true });
    listen(document, 'pointerleave', () => {
      target.x = 0;
      target.y = 0;
      target.glow = 0;
      lastInteractionAt = performance.now();
      wake();
    });
  }

  // ── Timeline ────────────────────────────────────────────────────────────
  let started = false;
  let replayAt = -Infinity;
  let announcedAt = -Infinity;
  const scheduleAutoReplay = (delay = AUTO_REPLAY_EVERY * 1000) => {
    if (reducedMotion || autoReplayTimer) return;
    autoReplayTimer = window.setTimeout(() => {
      autoReplayTimer = 0;
      if (document.hidden) {
        scheduleAutoReplay(5000);
        return;
      }
      const quietFor = performance.now() - lastInteractionAt;
      if (quietFor < 5000) {
        scheduleAutoReplay(Math.max(100, 5000 - quietFor));
        return;
      }
      replayAt = clock;
      lastInteractionAt = performance.now();
      wake();
    }, delay);
  };
  const written = new Map();
  const found = marks.map(() => false);
  const spin = new THREE.Euler();
  const badgeFrom = new THREE.Vector3(1.0, 0.5, 0.05);
  const tileFrom = new THREE.Vector3(-1.1, -1.3, -1.1);
  const starFrom = star.userData.rest.clone().multiplyScalar(0.6);
  let shadowOpacity = dark ? 0.3 : 0.12;

  const setVar = (name, value) => {
    const rounded = Math.round(value * 10000) / 10000;
    if (written.get(name) === rounded) return;
    written.set(name, rounded);
    front.style.setProperty(name, `${rounded}`);
  };
  const settle = (object, progress, from, rest) => {
    object.position.lerpVectors(from, rest, progress);
    object.visible = progress > 0.001;
  };
  const springIsActive = (spring, targetValue) => Math.abs(spring.value - targetValue) > 0.001 || Math.abs(spring.velocity) > 0.001;

  function update(dt) {
    if (!started) {
      started = true;
      clock = reducedMotion || skipIntro ? 60 : 0;
    } else if (!reducedMotion) {
      clock += dt;
    }
    const t = clock;
    const idle = reducedMotion ? 0 : t;

    // Pointer tilt and drag, on springs.
    const dragX = drag ? clamp(drag.dx, -1.6, 1.6) : 0;
    const dragY = drag ? clamp(drag.dy, -1, 1) : 0;
    const targetTiltY = target.x * 0.18 + dragX * 0.5;
    const targetTiltX = target.y * 0.1 + dragY * 0.3;
    springStep(tiltY, targetTiltY, dt, 70, 11);
    springStep(tiltX, targetTiltX, dt, 70, 11);
    springStep(glow, target.glow, dt, 40, 12);
    rig.rotation.set(tiltX.value, tiltY.value, 0);
    rig.position.y = Math.sin(idle * 0.6) * 0.05;
    key.position.x = -2.5 + tiltY.value * 6;
    if (spot && pointer) {
      spot.style.transform = `translate3d(${pointer.x.toFixed(1)}px, ${pointer.y.toFixed(1)}px, 0)`;
      spot.style.opacity = glow.value.toFixed(3);
    }

    const replay = t - replayAt;
    const replaying = replay >= 0 && replay < REPLAY.length;
    if (replaying && announcedAt !== replayAt) {
      announcedAt = replayAt;
      onScan?.();
    }

    // Pages float a little; the front page lifts while it is being scanned.
    nodes.forEach((node, index) => {
      node.position.fromArray(HERO_PAGES[index].rest);
      node.position.y += Math.sin(idle * 0.7 + index * 1.9) * 0.025 * (1 - index / 3);
    });
    frontNode.position.z += replaying ? Math.sin(segment(replay, 0, REPLAY.length) * Math.PI) * 0.16 : 0;
    root.updateMatrixWorld();
    nodes.forEach((node, index) => { pageElements[index].style.transform = toCss(node, unitsPerPixel); });

    // Print, then scan: the scan line and keyword highlights are HTML too.
    let scan;
    let glowLine;
    if (replaying) {
      const progress = segment(replay, REPLAY.scan, TIMELINE.scanLength);
      scan = easeInOutCubic(progress);
      glowLine = progress > 0 && progress < 1 ? Math.sin(progress * Math.PI) ** 0.5 : 0;
    } else {
      const progress = segment(t, TIMELINE.scan, TIMELINE.scanLength);
      scan = easeInOutCubic(progress);
      glowLine = progress > 0 && progress < 1 ? Math.sin(progress * Math.PI) ** 0.5 : 0;
    }
    setVar('--reveal', easeInOutCubic(segment(t, TIMELINE.print, TIMELINE.printLength)));
    setVar('--scan', scan);
    setVar('--scan-glow', glowLine);
    const clearing = replaying && replay < REPLAY.scan;
    marks.forEach((mark, index) => {
      const next = !clearing && scan >= (markHeights[index] ?? 1) && (replaying || t >= TIMELINE.scan);
      if (next === found[index]) return;
      found[index] = next;
      mark.dataset.found = String(next);
    });

    // The check mark springs out of the page corner and spins into place.
    const badgeIn = segment(t, TIMELINE.badge, 0.95);
    const pulse = replaying ? Math.sin(segment(replay, REPLAY.badge, 0.7) * Math.PI) : 0;
    const badgeSpin = replaying ? easeInOutCubic(segment(replay, REPLAY.badge - 0.1, 0.9)) * Math.PI * 2 : 0;
    settle(badge, easeOutBack(badgeIn, 1.6), badgeFrom, badge.userData.rest);
    badge.scale.setScalar(Math.max(0.0001, easeOutBack(badgeIn, 2.2) * (1 + pulse * 0.2) * 0.78));
    badge.position.y += Math.sin(idle * 1.1) * 0.07;
    badge.rotation.set(0.12 + Math.sin(idle * 0.8) * 0.06, -0.3 + (1 - easeOutCubic(badgeIn)) * -Math.PI * 1.5 + Math.sin(idle * 0.5) * 0.2 + badgeSpin, -0.04);
    const ring = replaying && replay > REPLAY.badge ? segment(replay, REPLAY.badge + 0.15, 0.9) : segment(t, TIMELINE.badge + 0.35, 0.9);
    ripple.scale.setScalar(1 + easeOutCubic(ring) * 0.8);
    ripple.material.opacity = ring > 0 && ring < 1 ? (1 - ring) ** 2 * 0.5 : 0;
    ripple.visible = ripple.material.opacity > 0.001;

    // Files fly out from behind the page.
    tiles.forEach((tile, index) => {
      const progress = segment(t, TIMELINE.files + index * 0.14, 0.9);
      const hop = replaying ? Math.sin(segment(replay, REPLAY.files + index * 0.12, 0.6) * Math.PI) : 0;
      settle(tile, easeOutBack(progress, 1.4), tileFrom, tile.userData.rest);
      tile.position.y += Math.sin(idle * 0.9 + index * 2.1) * 0.08 + hop * 0.35;
      tile.scale.setScalar(Math.max(0.0001, easeOutCubic(progress)) * tile.userData.scale);
      const rest = tile.userData.rotation;
      spin.set(rest.x + Math.sin(idle * 0.7 + index) * 0.08, rest.y + Math.sin(idle * 0.5 + index * 3) * 0.12 + (1 - easeOutCubic(progress)) * 2.4 + hop * Math.PI * (index ? -1 : 1), rest.z);
      tile.quaternion.setFromEuler(spin);
    });

    const starIn = segment(t, TIMELINE.files + 0.3, 0.8);
    settle(star, easeOutCubic(starIn), starFrom, star.userData.rest);
    star.position.y += Math.sin(idle * 0.8 + 1.7) * 0.09;
    star.scale.setScalar(Math.max(0.0001, easeOutBack(starIn, 2)) * (1 + Math.sin(idle * 2.4) * 0.06) * 0.66);
    star.rotation.set(0.25, -0.4, idle * 0.35);

    moteUniforms.uTime.value = 20 + idle;
    moteUniforms.uScale.value = renderer.getPixelRatio() * Math.max(0.6, 0.01 / unitsPerPixel) * 1.2;
    moteUniforms.uFade.value = segment(t, 1, 2);
    const darkness = moteUniforms.uDark.value;
    shade.opacity = shadowOpacity;
    hemisphere.intensity = 0.9 - darkness * 0.3;

    renderer.render(root, camera);
    const animating = !reducedMotion && (
      t < TIMELINE.settled
      || replaying
      || springIsActive(tiltX, targetTiltX)
      || springIsActive(tiltY, targetTiltY)
      || springIsActive(glow, target.glow)
    );
    if (!animating) scheduleAutoReplay();
    return animating;
  }

  function restorePages() {
    HERO_PAGES.forEach((page, index) => { pageElements[index].style.transform = restingTransform(page); });
    for (const name of ['--reveal', '--scan', '--scan-glow']) front.style.removeProperty(name);
    marks.forEach((mark) => mark.removeAttribute('data-found'));
    if (spot) spot.removeAttribute('style');
  }

  return {
    root,
    update,
    resize: () => frame(),
    compile: () => renderer.compileAsync(root, camera),
    setTheme(isDark) {
      moteUniforms.uDark.value = isDark ? 1 : 0;
      shadowOpacity = isDark ? 0.3 : 0.12;
    },
    dispose() {
      window.clearTimeout(autoReplayTimer);
      restorePages();
      environment.dispose();
    },
    api: {
      resize() {
        frame();
        wake();
      },
      replay() {
        if (reducedMotion || clock < TIMELINE.settled) return false;
        if (clock - replayAt < REPLAY.length * 0.8) return true;
        replayAt = clock;
        lastInteractionAt = performance.now();
        window.clearTimeout(autoReplayTimer);
        autoReplayTimer = 0;
        wake();
        return true;
      },
      startDrag(x, y) {
        if (reducedMotion) return false;
        drag = { x, y, dx: 0, dy: 0 };
        lastInteractionAt = performance.now();
        wake();
        return true;
      },
      endDrag() {
        drag = null;
        wake();
      },
    },
  };
}
