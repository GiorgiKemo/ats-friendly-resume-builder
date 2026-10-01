import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { canvasTexture, createStudioEnvironment, mountScene, roundedRectShape } from './runtime';
import { PAGE_RATIO, drawExampleResume, drawKeywordMask, drawTemplate, drawTileLabel } from './resumeArt';
import { clamp, easeInOutCubic, easeOutBack, easeOutCubic, lerp, segment, springStep } from '../../utils/sceneMotion';

// The homepage hero: a stack of resume pages under studio light. On load the
// pages deal themselves in, the front page prints, a light scans it and
// highlights its keywords, then a glass check and the PDF/DOCX files pop out.
// The canvas fills the whole hero; the composition is framed on `stage`.

const PAGE_WIDTH = 3;
const PAGE_HEIGHT = PAGE_WIDTH * PAGE_RATIO;
const VIEW = { width: 5.5, height: 6 };
const DISTANCE = 18;

const TIMELINE = {
  deal: 0,
  print: 0.45,
  printLength: 1.1,
  scan: 1.75,
  scanLength: 1.5,
  badge: 3.0,
  files: 3.15,
  settled: 4.4,
};
const REPLAY = { fade: 0.3, scan: 0.25, badge: 1.55, files: 1.65, length: 2.6 };
const AUTO_REPLAY_EVERY = 11;

const BACKGROUND = {
  light: { top: '#eef4ff', bottom: '#ffffff', grid: '#2563eb', gridAlpha: 0.07, glow: ['#93c5fd', '#a5b4fc', '#a5f3fc', '#f5d0fe'], glowAlpha: [0.6, 0.5, 0.45, 0.4] },
  dark: { top: '#06080d', bottom: '#070a10', grid: '#60a5fa', gridAlpha: 0.06, glow: ['#1d4ed8', '#4338ca', '#0e7490', '#86198f'], glowAlpha: [0.42, 0.36, 0.22, 0.16] },
};

const backgroundShader = {
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform vec2 uResolution;
    uniform float uPixelRatio;
    uniform vec3 uFocus;
    uniform vec2 uPointer;
    uniform float uPointerGlow;
    uniform float uTime;
    uniform float uDark;
    uniform float uIntro;
    uniform float uScan;
    uniform vec3 uTop[2];
    uniform vec3 uBottom[2];
    uniform vec3 uGrid[2];
    uniform float uGridAlpha[2];
    uniform vec3 uGlow[8];
    uniform float uGlowAlpha[8];
    varying vec2 vUv;

    float blob(vec2 p, vec2 c, float r) { vec2 d = (p - c) / r; return exp(-dot(d, d)); }
    vec3 pick3(vec3 a, vec3 b) { return mix(a, b, uDark); }
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

    void main() {
      vec2 p = gl_FragCoord.xy;
      float t = uTime;
      vec3 color = mix(pick3(uBottom[0], uBottom[1]), pick3(uTop[0], uTop[1]), smoothstep(0.45, 1.0, vUv.y));

      // Brand grid, masked like the original CSS: ellipse 70% x 60% at 50% 30%.
      vec2 css = vec2(p.x, uResolution.y - p.y) / uPixelRatio;
      vec2 size = uResolution / uPixelRatio;
      vec2 cell = mod(css, 44.0);
      float line = max(1.0 - step(1.0, cell.x), 1.0 - step(1.0, cell.y));
      vec2 m = (css - vec2(0.5, 0.3) * size) / (vec2(0.7, 0.6) * size);
      float mask = 1.0 - clamp(length(m), 0.0, 1.0);
      color = mix(color, pick3(uGrid[0], uGrid[1]), line * mask * mix(uGridAlpha[0], uGridAlpha[1], uDark));

      // Slow aurora around the composition.
      vec2 f = uFocus.xy;
      float r = uFocus.z;
      vec2 o0 = f + r * vec2(0.28 * sin(t * 0.19), 0.18 + 0.16 * cos(t * 0.23));
      vec2 o1 = f + r * vec2(0.42 + 0.18 * cos(t * 0.17), -0.12 + 0.2 * sin(t * 0.21));
      vec2 o2 = f + r * vec2(-0.45 + 0.16 * sin(t * 0.13), -0.32 + 0.14 * cos(t * 0.19));
      vec2 o3 = f + r * vec2(0.5 + 0.12 * cos(t * 0.11), 0.55 + 0.1 * sin(t * 0.15));
      float g0 = blob(p, o0, r * 0.95);
      float g1 = blob(p, o1, r * 0.7);
      float g2 = blob(p, o2, r * 0.62);
      float g3 = blob(p, o3, r * 0.45);
      float boost = uIntro * (1.0 + uScan * 0.35);
      color = mix(color, pick3(uGlow[0], uGlow[4]), clamp(g0 * mix(uGlowAlpha[0], uGlowAlpha[4], uDark) * boost, 0.0, 1.0));
      color = mix(color, pick3(uGlow[1], uGlow[5]), clamp(g1 * mix(uGlowAlpha[1], uGlowAlpha[5], uDark) * boost, 0.0, 1.0));
      color = mix(color, pick3(uGlow[2], uGlow[6]), clamp(g2 * mix(uGlowAlpha[2], uGlowAlpha[6], uDark) * boost, 0.0, 1.0));
      color = mix(color, pick3(uGlow[3], uGlow[7]), clamp(g3 * mix(uGlowAlpha[3], uGlowAlpha[7], uDark) * boost, 0.0, 1.0));

      // Soft light that follows the cursor.
      float spot = blob(p, uPointer, 300.0 * uPixelRatio) * uPointerGlow;
      color = mix(color, pick3(vec3(1.0), vec3(0.24, 0.4, 0.95)), spot * mix(0.35, 0.12, uDark));

      color += (hash(p + fract(t)) - 0.5) / 255.0;
      gl_FragColor = vec4(color, 1.0);
      #include <colorspace_fragment>
    }`,
};

const PAGE_CHUNK = /* glsl */ `
  // Ink settles onto the page in a soft diagonal wipe.
  float fromTop = 1.0 - vMapUv.y;
  float wipe = fromTop * 0.75 + vMapUv.x * 0.25;
  float printed = 1.0 - smoothstep(uReveal * 1.3 - 0.3, uReveal * 1.3, wipe);
  diffuseColor.rgb = mix(vec3(1.0), diffuseColor.rgb, printed);
  totalEmissiveRadiance = mix(emissive, totalEmissiveRadiance, printed);

  // The scan: a bright line, a faint wake, and keywords lighting up green.
  float ahead = uScan - fromTop;
  float scanLine = exp(-pow(ahead * 150.0, 2.0)) * uScanGlow;
  float wake = step(0.0, ahead) * exp(-ahead * 10.0) * uScanGlow;
  float mark = texture2D(uMask, vMapUv).r;
  float found = mark * max(smoothstep(-0.006, 0.006, ahead) * uHighlight, uKeep);
  vec3 marker = mix(vec3(1.0), vec3(0.72, 0.95, 0.82), found);
  vec3 tint = mix(vec3(1.0), vec3(0.86, 0.92, 1.0), wake * 0.7);
  diffuseColor.rgb *= marker * tint;
  totalEmissiveRadiance *= marker * tint;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.15, 0.39, 0.92), scanLine * 0.9);
  totalEmissiveRadiance += vec3(0.2, 0.5, 1.0) * scanLine * 0.8;
  totalEmissiveRadiance += vec3(0.05, 0.45, 0.22) * mark * exp(-pow(ahead * 22.0, 2.0)) * uScanGlow * 0.5;
`;

function pageGeometry() {
  const shape = roundedRectShape(PAGE_WIDTH, PAGE_HEIGHT, 0.07);
  const body = new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2, curveSegments: 10 });
  body.translate(0, 0, -0.026);
  const face = new THREE.ShapeGeometry(shape, 10);
  const position = face.attributes.position;
  const uv = face.attributes.uv;
  for (let index = 0; index < position.count; index += 1) {
    uv.setXY(index, position.getX(index) / PAGE_WIDTH + 0.5, position.getY(index) / PAGE_HEIGHT + 0.5);
  }
  face.translate(0, 0, 0.0015);
  return { body, face };
}

/** A blurred rounded rectangle: soft drop shadow for the floating pages. */
function softShadowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 340;
  const context = canvas.getContext('2d');
  context.shadowColor = '#000';
  context.shadowBlur = 34;
  context.shadowOffsetX = 1000;
  context.fillRect(-1000 + 128 - 82, 170 - 120, 164, 240);
  return new THREE.CanvasTexture(canvas);
}

function checkPath() {
  const path = new THREE.CurvePath();
  const a = new THREE.Vector3(-0.27, 0.02, 0);
  const corner = new THREE.Vector3(-0.08, -0.17, 0);
  const b = new THREE.Vector3(0.29, 0.22, 0);
  const before = corner.clone().lerp(a, 0.22);
  const after = corner.clone().lerp(b, 0.14);
  path.add(new THREE.LineCurve3(a, before));
  path.add(new THREE.QuadraticBezierCurve3(before, corner, after));
  path.add(new THREE.LineCurve3(after, b));
  return { path, ends: [a, b] };
}

function discGeometry(radius, thickness, round) {
  const points = [];
  const half = thickness / 2;
  points.push(new THREE.Vector2(0, half));
  for (let step = 0; step <= 8; step += 1) {
    const angle = (step / 8) * (Math.PI / 2);
    points.push(new THREE.Vector2(radius - round + Math.sin(angle) * round, half - round + Math.cos(angle) * round));
  }
  for (let step = 0; step <= 8; step += 1) {
    const angle = (step / 8) * (Math.PI / 2);
    points.push(new THREE.Vector2(radius - round + Math.cos(angle) * round, -half + round - Math.sin(angle) * round));
  }
  points.push(new THREE.Vector2(0, -half));
  const geometry = new THREE.LatheGeometry(points, 72);
  geometry.rotateX(Math.PI / 2);
  return geometry;
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
    const nextTip = [Math.cos(next) * outer, Math.sin(next) * outer];
    if (point === 0) shape.moveTo(...tip);
    shape.quadraticCurveTo(valley[0], valley[1], nextTip[0], nextTip[1]);
  }
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.035, bevelSegments: 4, curveSegments: 24 });
  geometry.center();
  return geometry;
}

export function createHeroScene(host, { stage, reducedMotion, signal, onUnavailable, onScan }) {
  return mountScene(host, {
    signal,
    reducedMotion,
    alpha: false,
    shadows: true,
    onUnavailable,
    setup: ({ renderer, dark, wake, listen }) => setupHero({ renderer, dark, wake, listen, host, stage, reducedMotion, onScan }),
  });
}

function setupHero({ renderer, dark, wake, listen, host, stage, reducedMotion, onScan }) {
  renderer.transmissionResolutionScale = 0.75;
  const root = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(18, 1, 8, 40);
  camera.position.set(0, 0, DISTANCE);
  const environment = createStudioEnvironment(renderer);
  root.environment = environment.texture;
  root.environmentIntensity = 0.85;

  // ── Background ──────────────────────────────────────────────────────────
  const linear = (hex) => new THREE.Color(hex);
  const theme = { dark: dark ? 1 : 0, target: dark ? 1 : 0 };
  const bg = {
    uResolution: { value: new THREE.Vector2(1, 1) },
    uPixelRatio: { value: 1 },
    uFocus: { value: new THREE.Vector3(0, 0, 400) },
    uPointer: { value: new THREE.Vector2(-9999, -9999) },
    uPointerGlow: { value: 0 },
    uTime: { value: 0 },
    uDark: { value: theme.dark },
    uIntro: { value: reducedMotion ? 1 : 0 },
    uScan: { value: 0 },
    uTop: { value: [linear(BACKGROUND.light.top), linear(BACKGROUND.dark.top)] },
    uBottom: { value: [linear(BACKGROUND.light.bottom), linear(BACKGROUND.dark.bottom)] },
    uGrid: { value: [linear(BACKGROUND.light.grid), linear(BACKGROUND.dark.grid)] },
    uGridAlpha: { value: [BACKGROUND.light.gridAlpha, BACKGROUND.dark.gridAlpha] },
    uGlow: { value: [...BACKGROUND.light.glow, ...BACKGROUND.dark.glow].map(linear) },
    uGlowAlpha: { value: [...BACKGROUND.light.glowAlpha, ...BACKGROUND.dark.glowAlpha] },
  };
  const background = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({ uniforms: bg, ...backgroundShader, depthTest: false, depthWrite: false }),
  );
  background.frustumCulled = false;
  background.renderOrder = -10;
  root.add(background);

  // ── Light ───────────────────────────────────────────────────────────────
  const hemisphere = new THREE.HemisphereLight(0xffffff, 0xdbeafe, 0.9);
  root.add(hemisphere);
  const key = new THREE.DirectionalLight(0xffffff, 3.4);
  key.position.set(-3, 5, 12);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 2, far: 30 });
  key.shadow.radius = 10;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  root.add(key);

  // ── Pages ───────────────────────────────────────────────────────────────
  const rig = new THREE.Group();
  root.add(rig);
  const stack = new THREE.Group();
  stack.rotation.set(-0.04, -0.2, 0.012);
  rig.add(stack);

  const { body: bodyGeometry, face: faceGeometry } = pageGeometry();
  const paper = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.7, sheen: 0.3, sheenRoughness: 0.6, sheenColor: 0xdbeafe, emissive: 0xffffff, emissiveIntensity: 0.22 });
  const dropShadow = new THREE.MeshBasicMaterial({ map: softShadowTexture(), color: 0x1e3a8a, transparent: true, depthWrite: false, opacity: 0.2 });
  const dropGeometry = new THREE.PlaneGeometry(PAGE_WIDTH * 1.5, PAGE_HEIGHT * 1.36);
  const resume = drawExampleResume(1400);
  const mask = drawKeywordMask(resume.marks, resume.canvas.width, resume.canvas.height);
  const pageUniforms = {
    uReveal: { value: reducedMotion ? 1 : 0 },
    uScan: { value: reducedMotion ? 1 : 0 },
    uScanGlow: { value: 0 },
    uHighlight: { value: reducedMotion ? 1 : 0 },
    uKeep: { value: reducedMotion ? 1 : 0 },
    uMask: { value: new THREE.CanvasTexture(mask) },
  };
  const resumeTexture = canvasTexture(renderer, resume.canvas);
  const printedMaterial = new THREE.MeshPhysicalMaterial({
    map: resumeTexture,
    roughness: 0.66,
    clearcoat: 0.08,
    clearcoatRoughness: 0.5,
    emissive: 0xffffff,
    emissiveMap: resumeTexture,
    emissiveIntensity: 0.32,
  });
  printedMaterial.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, pageUniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uReveal;\nuniform float uScan;\nuniform float uScanGlow;\nuniform float uHighlight;\nuniform float uKeep;\nuniform sampler2D uMask;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${PAGE_CHUNK}`);
  };
  printedMaterial.customProgramCacheKey = () => 'hero-printed-page';

  const makePage = (faceMaterial) => {
    const group = new THREE.Group();
    const body = new THREE.Mesh(bodyGeometry, paper);
    body.castShadow = true;
    body.receiveShadow = true;
    const face = new THREE.Mesh(faceGeometry, faceMaterial);
    face.receiveShadow = true;
    const shade = new THREE.Mesh(dropGeometry, dropShadow);
    shade.position.set(0.16, -0.26, -0.32);
    shade.renderOrder = -1;
    group.add(shade, body, face);
    stack.add(group);
    return group;
  };
  const templateMaterial = (kind) => {
    const texture = canvasTexture(renderer, drawTemplate(kind));
    return new THREE.MeshPhysicalMaterial({ map: texture, roughness: 0.66, clearcoat: 0.08, clearcoatRoughness: 0.5, emissive: 0xffffff, emissiveMap: texture, emissiveIntensity: 0.26 });
  };
  const pages = [
    { group: makePage(templateMaterial('serif')), rest: new THREE.Vector3(1.05, 0.42, -0.9), tilt: -0.13, start: 0 },
    { group: makePage(templateMaterial('banner')), rest: new THREE.Vector3(0.55, 0.22, -0.45), tilt: -0.065, start: 0.1 },
    { group: makePage(printedMaterial), rest: new THREE.Vector3(0, 0, 0), tilt: 0, start: 0.2 },
  ];
  const front = pages[2].group;

  // The scan light: a glowing bar that slides down the front page.
  const scanBar = new THREE.Mesh(
    new THREE.PlaneGeometry(PAGE_WIDTH * 1.14, 0.6),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uOpacity: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform float uOpacity; varying vec2 vUv;
        void main() {
          float y = (vUv.y - 0.5) * 2.0;
          float x = abs(vUv.x - 0.5) * 2.0;
          float core = exp(-pow(y * 22.0, 2.0));
          float glow = exp(-pow(y * 4.0, 2.0)) * 0.35;
          float ends = 1.0 - smoothstep(0.82, 1.0, x);
          vec3 color = mix(vec3(0.35, 0.62, 1.0), vec3(0.85, 0.95, 1.0), core);
          gl_FragColor = vec4(color, (core + glow) * ends * uOpacity);
        }`,
    }),
  );
  scanBar.position.z = 0.09;
  scanBar.visible = false;
  front.add(scanBar);

  // ── Glass check badge ───────────────────────────────────────────────────
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    transmission: 1,
    thickness: 0.55,
    roughness: 0.03,
    ior: 1.5,
    dispersion: 4,
    iridescence: 0.55,
    iridescenceIOR: 1.3,
    iridescenceThicknessRange: [120, 420],
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    attenuationColor: new THREE.Color(0xd1fae5),
    attenuationDistance: 1.6,
    specularIntensity: 1,
  });
  const badge = new THREE.Group();
  const frosted = glass.clone();
  frosted.roughness = 0.3;
  frosted.dispersion = 2;
  const disc = new THREE.Mesh(discGeometry(0.66, 0.24, 0.11), frosted);
  badge.add(disc);
  const { path, ends } = checkPath();
  const emerald = new THREE.MeshPhysicalMaterial({ color: 0x10b981, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08, emissive: 0x047857, emissiveIntensity: 0.4 });
  const check = new THREE.Group();
  check.add(new THREE.Mesh(new THREE.TubeGeometry(path, 80, 0.085, 20, false), emerald));
  for (const end of ends) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.085, 24, 16), emerald);
    cap.position.copy(end);
    check.add(cap);
  }
  check.position.z = 0.06;
  check.traverse((object) => { object.castShadow = true; });
  badge.add(check);
  badge.userData.rest = new THREE.Vector3(1.72, 1.2, 1.05);
  rig.add(badge);

  // ── File tiles ──────────────────────────────────────────────────────────
  const tileGeometry = new RoundedBoxGeometry(1, 1, 0.26, 6, 0.16);
  const labelGeometry = new THREE.PlaneGeometry(0.86, 0.86);
  const makeTile = (label, color, rest, rotation) => {
    const group = new THREE.Group();
    const tile = new THREE.Mesh(tileGeometry, new THREE.MeshPhysicalMaterial({ color, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.06, sheen: 0.4, sheenColor: 0xffffff }));
    tile.castShadow = true;
    const text = new THREE.Mesh(labelGeometry, new THREE.MeshStandardMaterial({
      map: canvasTexture(renderer, drawTileLabel(label)), transparent: true, roughness: 0.4, emissive: 0xffffff, emissiveIntensity: 0.25, polygonOffset: true, polygonOffsetFactor: -2,
    }));
    text.position.z = 0.131;
    group.add(tile, text);
    group.userData.rest = rest;
    group.userData.rotation = rotation;
    rig.add(group);
    return group;
  };
  const pdf = makeTile('PDF', 0xe11d48, new THREE.Vector3(-1.95, -1.05, 0.85), new THREE.Euler(0.12, 0.42, -0.14));
  const docx = makeTile('DOCX', 0x1d4ed8, new THREE.Vector3(-1.3, -2.15, 1.3), new THREE.Euler(-0.1, 0.32, 0.1));
  pdf.scale.setScalar(0.92);
  docx.scale.setScalar(0.82);

  // ── Sparkle and glass droplets ─────────────────────────────────────────
  const star = new THREE.Mesh(starGeometry(), new THREE.MeshPhysicalMaterial({
    color: 0x8b5cf6, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05, iridescence: 0.6, iridescenceIOR: 1.4, emissive: 0x6d28d9, emissiveIntensity: 0.35,
  }));
  star.castShadow = true;
  star.userData.rest = new THREE.Vector3(-1.85, 2.05, 0.7);
  rig.add(star);
  const bubble = glass.clone();
  bubble.attenuationColor = new THREE.Color(0xe0f2fe);
  bubble.thickness = 0.3;
  bubble.iridescence = 0.9;
  const droplets = [
    [new THREE.Vector3(2.05, -0.75, 1.05), 0.24],
    [new THREE.Vector3(-2.35, 0.55, -0.4), 0.14],
    [new THREE.Vector3(1.25, -2.45, 0.6), 0.17],
    [new THREE.Vector3(0.35, 2.75, -0.2), 0.11],
  ].map(([rest, radius]) => {
    const drop = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32), bubble);
    drop.userData.rest = rest;
    rig.add(drop);
    return drop;
  });
  const extras = [star, ...droplets];

  // A ring of light that ripples out when the badge lands.
  const ripple = new THREE.Mesh(
    new THREE.RingGeometry(0.62, 0.7, 96),
    new THREE.MeshBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
  );
  badge.add(ripple);

  // Drifting motes of light around the composition.
  const MOTES = 70;
  const motePositions = new Float32Array(MOTES * 3);
  const moteSeeds = new Float32Array(MOTES);
  for (let index = 0; index < MOTES; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 1.8 + Math.random() * 2.2;
    motePositions.set([Math.cos(angle) * radius * 1.1, Math.sin(angle) * radius * 0.9, -1.5 + Math.random() * 3], index * 3);
    moteSeeds[index] = Math.random();
  }
  const moteGeometry = new THREE.BufferGeometry();
  moteGeometry.setAttribute('position', new THREE.BufferAttribute(motePositions, 3));
  moteGeometry.setAttribute('seed', new THREE.BufferAttribute(moteSeeds, 1));
  const moteUniforms = { uTime: { value: 0 }, uDark: bg.uDark, uScale: { value: 1 }, uFade: { value: 0 } };
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
        a *= a;
        vec3 color = mix(vec3(0.23, 0.45, 0.95), vec3(0.75, 0.88, 1.0), uDark);
        gl_FragColor = vec4(color, a * vAlpha * mix(0.45, 0.85, uDark) * uFade);
      }`,
  }));
  motes.frustumCulled = false;
  rig.add(motes);

  // ── Framing ─────────────────────────────────────────────────────────────
  let size = { width: 1, height: 1 };
  let focus = { x: 0, y: 0, radius: 300 };
  function frame() {
    const area = host.getBoundingClientRect();
    const box = stage.getBoundingClientRect();
    if (!area.width || !box.width) return;
    const centerX = box.left + box.width / 2 - area.left;
    const centerY = box.top + box.height / 2 - area.top;
    const fullWidth = 2 * Math.max(centerX, area.width - centerX);
    const fullHeight = 2 * Math.max(centerY, area.height - centerY);
    const unitsPerPixel = Math.max(VIEW.height / box.height, VIEW.width / box.width);
    camera.aspect = fullWidth / fullHeight;
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan((unitsPerPixel * fullHeight) / 2 / DISTANCE));
    camera.setViewOffset(fullWidth, fullHeight, fullWidth / 2 - centerX, fullHeight / 2 - centerY, area.width, area.height);
    camera.updateProjectionMatrix();
    focus = { x: centerX, y: centerY, radius: Math.max(box.width, box.height) * 0.62 };
    size = { width: area.width, height: area.height };
    const ratio = renderer.getPixelRatio();
    bg.uResolution.value.set(area.width * ratio, area.height * ratio);
    bg.uPixelRatio.value = ratio;
    bg.uFocus.value.set(centerX * ratio, (area.height - centerY) * ratio, focus.radius * ratio);
  }
  const stageObserver = new ResizeObserver(() => { frame(); wake(); });
  stageObserver.observe(stage);

  // ── Pointer ─────────────────────────────────────────────────────────────
  const tiltX = { value: 0, velocity: 0 };
  const tiltY = { value: 0, velocity: 0 };
  const glow = { value: 0, velocity: 0 };
  const target = { x: 0, y: 0, glow: 0 };
  let drag = null;
  let clock = 0;
  let lastInteraction = -Infinity;
  let pointerPixels = null;
  if (!reducedMotion) {
    listen(window, 'pointermove', (event) => {
      if (event.pointerType === 'touch' && !drag) return;
      const area = host.getBoundingClientRect();
      const x = event.clientX - area.left;
      const y = event.clientY - area.top;
      const inside = y >= 0 && y <= area.height;
      pointerPixels = { x, y };
      target.glow = inside ? 1 : 0;
      target.x = clamp((x - focus.x) / (area.width * 0.5), -1, 1);
      target.y = clamp((y - focus.y) / (area.height * 0.6), -1, 1);
      if (drag) {
        drag.dx = (event.clientX - drag.x) / Math.max(1, area.width * 0.3);
        drag.dy = (event.clientY - drag.y) / Math.max(1, area.height * 0.5);
      }
      lastInteraction = clock;
      wake();
    }, { passive: true });
    listen(document, 'pointerleave', () => { target.x = 0; target.y = 0; target.glow = 0; wake(); });
  }

  // ── Timeline ────────────────────────────────────────────────────────────
  let started = false;
  let replayAt = -Infinity;
  let replayAnnounced = -Infinity;
  const spin = new THREE.Euler();
  const dealOffset = new THREE.Vector3(1.2, -5.5, -1.2);
  const dealFrom = pages.map((page) => page.rest.clone().add(dealOffset));
  const badgeFrom = new THREE.Vector3(1.0, 0.9, 0.05);
  const tileFrom = new THREE.Vector3(-1.1, -0.9, -1.1);
  const extraFrom = extras.map((object) => object.userData.rest.clone().multiplyScalar(0.6));

  function settle(object, progress, from, rest) {
    object.position.lerpVectors(from, rest, progress);
    object.visible = progress > 0.001;
  }

  function update(dt) {
    if (!started) {
      started = true;
      clock = reducedMotion ? 60 : 0;
    } else if (!reducedMotion) {
      clock += dt;
    }
    const t = clock;
    const idle = reducedMotion ? 0 : t;
    theme.dark = reducedMotion ? theme.target : lerp(theme.dark, theme.target, 1 - Math.exp(-dt * 5));
    bg.uDark.value = theme.dark;
    bg.uTime.value = 40 + idle;
    bg.uIntro.value = reducedMotion ? 1 : easeOutCubic(segment(t, 0, 1.4));
    dropShadow.opacity = lerp(0.2, 0.55, theme.dark);
    dropShadow.color.setHex(theme.dark > 0.5 ? 0x000000 : 0x1e3a8a);
    hemisphere.intensity = lerp(0.55, 0.35, theme.dark);
    root.environmentIntensity = lerp(0.85, 0.7, theme.dark);

    // Pointer tilt and drag, on springs.
    const dragX = drag ? clamp(drag.dx, -1.6, 1.6) : 0;
    const dragY = drag ? clamp(drag.dy, -1, 1) : 0;
    springStep(tiltY, target.x * 0.2 + dragX * 0.55, dt, 70, 11);
    springStep(tiltX, target.y * 0.12 + dragY * 0.35, dt, 70, 11);
    springStep(glow, target.glow, dt, 40, 12);
    rig.rotation.set(tiltX.value, tiltY.value, 0);
    rig.position.y = Math.sin(idle * 0.6) * 0.06;
    key.position.x = -5 + tiltY.value * 6;
    bg.uPointerGlow.value = glow.value;
    if (pointerPixels) {
      const ratio = renderer.getPixelRatio();
      bg.uPointer.value.set(pointerPixels.x * ratio, (size.height - pointerPixels.y) * ratio);
    }

    // Auto replay keeps the scene alive while nobody is interacting.
    if (!reducedMotion && t > TIMELINE.settled + 4 && t - Math.max(replayAt, TIMELINE.settled) > AUTO_REPLAY_EVERY && t - lastInteraction > 5) {
      replayAt = t;
    }
    const replay = t - replayAt;
    const replaying = replay >= 0 && replay < REPLAY.length;

    // Pages deal in from below, each landing with a little overshoot.
    pages.forEach((page, index) => {
      const progress = reducedMotion ? 1 : segment(t, TIMELINE.deal + page.start, 1.15);
      const eased = easeOutBack(progress, 1.1);
      page.group.position.lerpVectors(dealFrom[index], page.rest, eased);
      page.group.position.y += Math.sin(idle * 0.7 + page.start * 9) * 0.03 * (1 - index / 3);
      page.group.rotation.set((1 - eased) * -0.9, (1 - eased) * 0.5, page.tilt + (1 - eased) * 0.5);
      page.group.visible = progress > 0;
    });
    const hover = replaying ? Math.sin(segment(replay, 0, REPLAY.length) * Math.PI) * 0.18 : 0;
    front.position.z += hover;

    // Print, then scan.
    let scan;
    let scanGlow;
    let highlight = pageUniforms.uHighlight.value;
    let keep = pageUniforms.uKeep.value;
    if (replaying) {
      keep = 1 - segment(replay, 0, REPLAY.fade);
      scan = easeInOutCubic(segment(replay, REPLAY.scan, TIMELINE.scanLength));
      scanGlow = Math.sin(segment(replay, REPLAY.scan, TIMELINE.scanLength) * Math.PI) ** 0.5;
      highlight = 1;
    } else {
      pageUniforms.uReveal.value = reducedMotion ? 1 : easeInOutCubic(segment(t, TIMELINE.print, TIMELINE.printLength));
      const scanProgress = segment(t, TIMELINE.scan, TIMELINE.scanLength);
      scan = reducedMotion ? 1 : easeInOutCubic(scanProgress);
      scanGlow = reducedMotion ? 0 : Math.sin(scanProgress * Math.PI) ** 0.5;
      highlight = t >= TIMELINE.scan ? 1 : 0;
      keep = t >= TIMELINE.scan + TIMELINE.scanLength ? 1 : 0;
    }
    pageUniforms.uScan.value = scan;
    pageUniforms.uScanGlow.value = scanGlow;
    pageUniforms.uHighlight.value = highlight;
    pageUniforms.uKeep.value = keep;
    scanBar.visible = scanGlow > 0.01;
    scanBar.material.uniforms.uOpacity.value = scanGlow;
    scanBar.position.y = PAGE_HEIGHT / 2 - scan * PAGE_HEIGHT;
    bg.uScan.value = scanGlow;
    if (replaying && replayAnnounced !== replayAt) {
      replayAnnounced = replayAt;
      onScan?.();
    }

    // Badge springs out of the page corner and spins into place.
    const badgeIn = reducedMotion ? 1 : segment(t, TIMELINE.badge, 0.95);
    const badgePulse = replaying ? Math.sin(segment(replay, REPLAY.badge, 0.7) * Math.PI) : 0;
    const badgeSpin = replaying ? easeInOutCubic(segment(replay, REPLAY.badge - 0.1, 0.9)) * Math.PI * 2 : 0;
    settle(badge, easeOutBack(badgeIn, 1.6), badgeFrom, badge.userData.rest);
    badge.scale.setScalar(Math.max(0.0001, easeOutBack(badgeIn, 2.2) * (1 + badgePulse * 0.18)));
    badge.position.y += Math.sin(idle * 1.1) * 0.07;
    badge.rotation.set(0.1 + Math.sin(idle * 0.8) * 0.06, -0.35 + (1 - easeOutCubic(badgeIn)) * -Math.PI * 1.5 + Math.sin(idle * 0.5) * 0.18 + badgeSpin, -0.05);

    // Files fly out from behind the page.
    [pdf, docx].forEach((tile, index) => {
      const progress = reducedMotion ? 1 : segment(t, TIMELINE.files + index * 0.14, 0.9);
      const hop = replaying ? Math.sin(segment(replay, REPLAY.files + index * 0.12, 0.6) * Math.PI) : 0;
      settle(tile, easeOutBack(progress, 1.4), tileFrom, tile.userData.rest);
      tile.position.y += Math.sin(idle * 0.9 + index * 2.1) * 0.08 + hop * 0.35;
      tile.scale.setScalar(Math.max(0.0001, easeOutCubic(progress)) * (index ? 0.82 : 0.92));
      const rest = tile.userData.rotation;
      spin.set(rest.x + Math.sin(idle * 0.7 + index) * 0.08, rest.y + Math.sin(idle * 0.5 + index * 3) * 0.12 + (1 - easeOutCubic(progress)) * 2.4 + hop * Math.PI * 2 * (index ? -1 : 1) * 0.5, rest.z);
      tile.quaternion.setFromEuler(spin);
    });

    extras.forEach((object, index) => {
      const progress = reducedMotion ? 1 : segment(t, TIMELINE.files + 0.25 + index * 0.1, 0.8);
      settle(object, easeOutCubic(progress), extraFrom[index], object.userData.rest);
      object.position.y += Math.sin(idle * (0.8 + index * 0.13) + index * 1.7) * 0.09;
      object.scale.setScalar(Math.max(0.0001, easeOutBack(progress, 2)));
    });
    const landed = reducedMotion ? 1 : segment(t, TIMELINE.badge + 0.35, 0.9);
    const replayRing = replaying ? segment(replay, REPLAY.badge + 0.15, 0.9) : 0;
    const ring = replayRing > 0 ? replayRing : landed;
    ripple.scale.setScalar(1 + easeOutCubic(ring) * 0.75);
    ripple.material.opacity = ring > 0 && ring < 1 ? (1 - ring) ** 2 * 0.5 : 0;
    ripple.visible = ripple.material.opacity > 0.001;
    moteUniforms.uTime.value = 20 + idle;
    moteUniforms.uScale.value = renderer.getPixelRatio() * (size.height / 900) * 1.6;
    moteUniforms.uFade.value = reducedMotion ? 1 : segment(t, 1, 2);

    star.rotation.set(0.25, -0.4, idle * 0.35);
    star.scale.multiplyScalar(1 + Math.sin(idle * 2.4) * 0.06);

    renderer.render(root, camera);
    return true;
  }

  return {
    root,
    update,
    resize: () => frame(),
    compile: () => renderer.compileAsync(root, camera),
    setTheme(isDark) { theme.target = isDark ? 1 : 0; },
    dispose() {
      stageObserver.disconnect();
      environment.dispose();
    },
    api: {
      replay() {
        if (reducedMotion || clock < TIMELINE.settled) return false;
        if (clock - replayAt < REPLAY.length * 0.8) return true;
        replayAt = clock;
        lastInteraction = clock;
        wake();
        return true;
      },
      startDrag(x, y) {
        if (reducedMotion) return false;
        drag = { x, y, dx: 0, dy: 0 };
        lastInteraction = clock;
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
