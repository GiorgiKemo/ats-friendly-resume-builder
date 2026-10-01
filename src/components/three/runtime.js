import * as THREE from 'three';

// Shared lifecycle for the homepage WebGL scenes: one renderer per scene,
// rendering only while on screen and the tab is visible, following the site
// theme, lowering resolution on slow devices and cleaning up after itself.

const isDarkTheme = () => document.documentElement.classList.contains('dark');

export function mountScene(host, {
  signal,
  reducedMotion = false,
  alpha = true,
  maxPixelRatio = 2,
  exposure = 1,
  shadows = false,
  onUnavailable = () => {},
  setup,
}) {
  const renderer = new THREE.WebGLRenderer({ alpha, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = exposure;
  renderer.setClearColor(0x000000, 0);
  if (shadows) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
  }
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.opacity = '0';
  host.appendChild(canvas);

  const cap = Math.min(window.devicePixelRatio || 1, maxPixelRatio);
  let pixelRatio = cap;
  let width = 0;
  let height = 0;
  let frame = 0;
  let last = 0;
  let disposed = false;
  let visible = true;
  let shown = false;
  let slowFrames = 0;
  let sampledFrames = 0;
  let scene = null;
  const cleanups = [];

  const listen = (target, type, handler, options) => {
    target.addEventListener(type, handler, options);
    cleanups.push(() => target.removeEventListener(type, handler, options));
  };

  function render(now) {
    frame = 0;
    if (disposed || !scene || !visible || document.hidden || !width) return;
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 1 / 60;
    last = now;
    const keepGoing = scene.update(dt, now / 1000) && !reducedMotion;
    if (!shown) {
      shown = true;
      canvas.style.opacity = '1';
    }
    // Drop resolution a step when frames run long, down to 1x.
    if (keepGoing && pixelRatio > 1) {
      sampledFrames += 1;
      if (dt > 1 / 40) slowFrames += 1;
      if (sampledFrames >= 90) {
        if (slowFrames > 45) {
          pixelRatio = Math.max(1, pixelRatio - 0.25);
          renderer.setPixelRatio(pixelRatio);
          renderer.setSize(width, height, false);
        }
        sampledFrames = 0;
        slowFrames = 0;
      }
    }
    if (keepGoing) wake();
  }

  function wake() {
    if (!frame && !disposed && visible && !document.hidden) frame = requestAnimationFrame(render);
  }

  function resize() {
    const rect = host.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    width = rect.width;
    height = rect.height;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    scene?.resize?.(width, height);
    last = 0;
    wake();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    for (const cleanup of cleanups.splice(0)) cleanup();
    scene?.dispose?.();
    if (scene?.root) disposeTree(scene.root);
    renderer.dispose();
    canvas.remove();
  }

  listen(canvas, 'webglcontextlost', (event) => {
    event.preventDefault();
    dispose();
    onUnavailable();
  });
  listen(signal, 'abort', dispose, { once: true });
  listen(document, 'visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else {
      last = 0;
      wake();
    }
  });

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  cleanups.push(() => resizeObserver.disconnect());
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) {
      last = 0;
      wake();
    } else {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  });
  intersection.observe(host);
  cleanups.push(() => intersection.disconnect());
  const themeObserver = new MutationObserver(() => {
    scene?.setTheme?.(isDarkTheme());
    wake();
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  cleanups.push(() => themeObserver.disconnect());

  const context = { renderer, canvas, host, reducedMotion, dark: isDarkTheme(), wake, listen };
  return Promise.resolve(setup(context)).then(async (created) => {
    if (disposed) {
      created?.dispose?.();
      if (created?.root) disposeTree(created.root);
      return null;
    }
    scene = created;
    resize();
    if (scene.compile) await scene.compile();
    if (disposed) return null;
    wake();
    return { ...scene.api, wake, dispose };
  }).catch((error) => {
    dispose();
    throw error;
  });
}

/** Frees every geometry, material and texture under `root`. */
export function disposeTree(root) {
  const textures = new Set();
  root.traverse((object) => {
    object.geometry?.dispose();
    for (const material of [].concat(object.material || [])) {
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      if (material.uniforms) {
        for (const uniform of Object.values(material.uniforms)) if (uniform.value?.isTexture) textures.add(uniform.value);
      }
      material.dispose();
    }
  });
  for (const texture of textures) texture.dispose();
}

/**
 * A soft photo-studio environment for reflections: a gradient room with a
 * large key softbox, a top strip, a cool rim light and a violet accent.
 * Glass, gloss and paper sheen all pick their highlights up from this.
 */
export function createStudioEnvironment(renderer, { warmth = 0 } = {}) {
  const room = new THREE.Scene();
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(30, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(0.95, 0.97, 1) },
        horizon: { value: new THREE.Color(0.62, 0.68, 0.82) },
        bottom: { value: new THREE.Color(0.16 + warmth, 0.18, 0.26) },
      },
      vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; varying vec3 vDir;
        void main() {
          float h = vDir.y;
          vec3 color = h > 0.0 ? mix(horizon, top, pow(h, 0.6)) : mix(horizon, bottom, pow(-h, 0.5));
          gl_FragColor = vec4(color, 1.0);
        }`,
    }),
  );
  room.add(sphere);
  const panel = (w, h, color, intensity, position) => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }),
    );
    mesh.position.set(...position);
    mesh.lookAt(0, 0, 0);
    room.add(mesh);
  };
  panel(10, 6, 0xffffff, 6, [-8, 9, 8]);
  panel(18, 1.4, 0xffffff, 4, [0, 12, -1]);
  panel(2.2, 14, 0x7dd3fc, 5, [12, 1, -3]);
  panel(7, 7, 0xa78bfa, 2.4, [-12, -1, -7]);
  panel(12, 6, 0xffffff, 1.3, [2, 2, 14]);
  panel(3, 3, 0xffffff, 10, [6, 7, 9]);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(room, 0.035);
  pmrem.dispose();
  disposeTree(room);
  return target;
}

/** Canvas-backed texture with sensible defaults for printed artwork. */
export function canvasTexture(renderer, canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return texture;
}

/** Rounded rectangle outline centred on the origin. */
export function roundedRectShape(width, height, radius) {
  const x = width / 2;
  const y = height / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-x + radius, -y);
  shape.lineTo(x - radius, -y);
  shape.quadraticCurveTo(x, -y, x, -y + radius);
  shape.lineTo(x, y - radius);
  shape.quadraticCurveTo(x, y, x - radius, y);
  shape.lineTo(-x + radius, y);
  shape.quadraticCurveTo(-x, y, -x, y - radius);
  shape.lineTo(-x, -y + radius);
  shape.quadraticCurveTo(-x, -y, -x + radius, -y);
  return shape;
}

/** Soft radial blob used for contact shadows and glows. */
export function radialTexture(size = 128, stops = [[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
