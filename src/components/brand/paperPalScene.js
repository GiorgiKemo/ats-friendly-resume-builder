import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { pointerGaze, paperReaction, solvePaperArm } from '../../utils/heroMotion';

// Loaded after the hero's first paint, not in the initial bundle.
export async function createPaperPalScene(host, { reducedMotion, signal, onUnavailable }) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  host.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-2.45, 2.45, 2.45, -2.45, .1, 30);
  camera.position.set(0, 3.3, 10);
  camera.lookAt(0, 2.7, 0);
  const environment = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environmentMap = pmrem.fromScene(environment);
  scene.environment = environmentMap.texture;
  scene.environmentIntensity = .3;
  environment.dispose();
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xc0d4f4, 1.4));
  const light = new THREE.DirectionalLight(0xffffff, 2);
  light.position.set(-3, 7, 6);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  Object.assign(light.shadow.camera, { left: -4, right: 4, top: 6, bottom: -2, near: .1, far: 20 });
  light.shadow.normalBias = .025;
  light.shadow.radius = 4;
  light.shadow.blurSamples = 8;
  scene.add(light);

  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.ShadowMaterial({ opacity: .08 }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = .32;
  shadow.receiveShadow = true;
  scene.add(shadow);

  let frame = 0;
  let blinkTimer = 0;
  let disposed = false;
  let observer;
  let resizeObserver;
  let visible = true;
  let lastFrame = 0;
  let reactionStart = -Infinity;
  let reactionKind = 'wave';
  let blinkStart = -Infinity;
  let bounds = host.getBoundingClientRect();
  const target = { x: 0, y: 0 };
  const gaze = { x: 0, y: 0 };
  const tiltTarget = { x: 0, y: 0 };
  const tilt = { x: 0, y: 0 };
  let drag = null;
  let hovered = null;
  let attention = 0;
  let pointAt = () => null;
  let pal;
  let resumeTexture;
  let wake = () => {};

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    clearTimeout(blinkTimer);
    observer?.disconnect();
    resizeObserver?.disconnect();
    window.removeEventListener('pointermove', pointerMove);
    window.removeEventListener('pointerout', pointerOut);
    window.removeEventListener('scroll', syncBounds);
    document.removeEventListener('visibilitychange', visibilityChange);
    canvas.removeEventListener('webglcontextlost', contextLost);
    signal.removeEventListener('abort', dispose);
    const geometries = new Set();
    const materials = new Set();
    scene.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) for (const material of [].concat(object.material)) materials.add(material);
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    resumeTexture?.dispose();
    environmentMap.dispose();
    renderer.dispose();
    canvas.remove();
    delete host.parentElement.dataset.dragging;
  }
  function contextLost(event) {
    event.preventDefault();
    dispose();
    onUnavailable();
  }
  canvas.addEventListener('webglcontextlost', contextLost);
  signal.addEventListener('abort', dispose, { once: true });

  try {
    const results = await Promise.allSettled([
      new GLTFLoader().loadAsync('/characters/paper-pal.glb'),
      new THREE.TextureLoader().loadAsync('/characters/hero-resume-texture.webp'),
    ]);
    pal = results[0].status === 'fulfilled' ? results[0].value.scene : null;
    resumeTexture = results[1].status === 'fulfilled' ? results[1].value : null;
    // Attach loaded resources even on failure/unmount so disposal owns them.
    if (pal) scene.add(pal);
    if (disposed || signal.aborted || !pal || !resumeTexture) {
      disposed = false;
      dispose();
      if (signal.aborted) return null;
      throw new Error('Hero assets unavailable');
    }

    pal.position.set(1.18, .36, .3);
    pal.scale.set(.87, 1.05, 1);
    pal.rotation.z = -.065;
    pal.rotation.y = -.12;
    pal.traverse((object) => {
      if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; }
    });
    const body = pal.getObjectByName('PaperBody');
    const fold = pal.getObjectByName('PaperFold');
    const eyes = ['EyeLeft', 'EyeRight'].map((name) => pal.getObjectByName(name));
    const eyePositions = eyes.map((eye) => eye.position.clone());
    const eyeScale = eyes[0].scale.y;
    const brows = ['BrowLeft', 'BrowRight'].map((name) => pal.getObjectByName(name));
    const browPositions = brows.map((brow) => brow.position.y);
    const bodyY = body.position.y;
    const arms = ['Left', 'Right'].map((side, index) => ({
      side: index ? 1 : -1,
      shoulder: pal.getObjectByName(side + 'Shoulder'),
      elbow: pal.getObjectByName(side + 'Elbow'),
      wrist: pal.getObjectByName(side + 'Wrist'),
      glove: pal.getObjectByName(side + 'Glove'),
    }));
    function poseArm(arm, x, y, angle, grip, point) {
      const pose = solvePaperArm(x, y, arm.side);
      arm.shoulder.rotation.z = pose.shoulder;
      arm.elbow.rotation.z = pose.elbow;
      arm.wrist.rotation.z = angle - pose.shoulder - pose.elbow;
      const morphs = arm.glove.morphTargetDictionary;
      arm.glove.morphTargetInfluences[morphs.Grip] = grip;
      arm.glove.morphTargetInfluences[morphs.Point] = point;
    }

    const resume = new THREE.Group();
    resume.position.set(-.57, 2.78, 0);
    resume.rotation.set(0, -.045, -.014);
    resumeTexture.colorSpace = THREE.SRGBColorSpace;
    resumeTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const outline = new THREE.Shape();
    const x = 1.555, y = 2.2, radius = .12;
    outline.moveTo(-x + radius, -y);
    outline.lineTo(x - radius, -y);
    outline.quadraticCurveTo(x, -y, x, -y + radius);
    outline.lineTo(x, y - radius);
    outline.quadraticCurveTo(x, y, x - radius, y);
    outline.lineTo(-x + radius, y);
    outline.quadraticCurveTo(-x, y, -x, y - radius);
    outline.lineTo(-x, -y + radius);
    outline.quadraticCurveTo(-x, -y, -x + radius, -y);
    const sheet = new THREE.Mesh(
      new THREE.ExtrudeGeometry(outline, { depth: .045, bevelEnabled: false, curveSegments: 16 }),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .85 }),
    );
    sheet.position.z = -.0225;
    resume.add(sheet);
    const printedGeometry = new THREE.ShapeGeometry(outline, 16);
    const positions = printedGeometry.attributes.position;
    const uv = printedGeometry.attributes.uv;
    for (let index = 0; index < positions.count; index++) {
      uv.setXY(index, (positions.getX(index) + x) / (x * 2), (positions.getY(index) + y) / (y * 2));
    }
    const printedPage = new THREE.Mesh(
      printedGeometry,
      new THREE.MeshBasicMaterial({ map: resumeTexture, toneMapped: false }),
    );
    printedPage.position.z = .025;
    resume.add(printedPage);
    const scan = new THREE.Mesh(
      new THREE.PlaneGeometry(3.1, .024),
      new THREE.MeshBasicMaterial({ color: 0x2563eb, transparent: true, opacity: .65, depthWrite: false }),
    );
    scan.position.z = .032;
    scan.visible = false;
    resume.add(scan);
    scene.add(resume);
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    pointAt = (clientX, clientY) => {
      if (disposed || clientX < bounds.left || clientX > bounds.right || clientY < bounds.top || clientY > bounds.bottom) return null;
      pointer.set((clientX - bounds.left) / bounds.width * 2 - 1, -(clientY - bounds.top) / bounds.height * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects([pal, resume], true)[0];
      if (!hit) return null;
      let object = hit.object;
      while (object) {
        if (object === pal) return 'companion';
        if (object === resume) return 'resume';
        object = object.parent;
      }
      return null;
    };

    function render(now) {
      frame = 0;
      if (disposed || !visible || document.hidden) return;
      const ease = 1 - Math.exp(-Math.min(now - lastFrame || 16, 50) / 100);
      lastFrame = now;
      gaze.x += (target.x - gaze.x) * ease;
      gaze.y += (target.y - gaze.y) * ease;
      tilt.x += (tiltTarget.x - tilt.x) * ease;
      tilt.y += (tiltTarget.y - tilt.y) * ease;
      const attentionTarget = hovered === 'companion' ? 1 : 0;
      attention += (attentionTarget - attention) * ease;
      const reaction = paperReaction(now - reactionStart);
      const waving = reactionKind === 'wave' ? reaction.lift : 0;
      const pointing = reactionKind === 'scan' ? reaction.lift : 0;
      const celebrating = reactionKind === 'celebrate' ? reaction.lift : 0;
      const blinking = !reducedMotion && now - blinkStart < 190;
      const blink = blinking ? Math.max(.1, 1 - Math.sin((now - blinkStart) / 190 * Math.PI) ** 2) : 1;
      eyes.forEach((eye, index) => {
        eye.position.x = eyePositions[index].x + gaze.x * .06;
        eye.position.y = eyePositions[index].y + gaze.y * .055;
        eye.scale.y = eyeScale * blink;
      });
      body.rotation.y = gaze.x * .18;
      body.rotation.z = gaze.x * -.075 + celebrating * reaction.wave * .04;
      body.position.y = bodyY + (waving + celebrating) * .025;
      brows.forEach((brow, index) => { brow.position.y = browPositions[index] + (waving + celebrating) * .025 + (hovered === 'companion' ? .012 : 0); });
      pal.position.y = .36 + reaction.hop * (celebrating ? .42 : waving ? .08 : 0);
      pal.scale.y = 1.05 - reaction.hop * (celebrating ? .055 : 0);
      pal.rotation.z = -.065 + celebrating * reaction.wave * .035;
      const raised = Math.max(waving, celebrating);
      const handX = .73 + gaze.x * .07;
      const handY = THREE.MathUtils.lerp(.77, 1.27 + gaze.y * .13, attention);
      const handAngle = THREE.MathUtils.lerp(Math.PI - .18, -.12 + gaze.x * -.14, Math.max(attention, raised));
      poseArm(arms[1], THREE.MathUtils.lerp(handX, .66, raised), THREE.MathUtils.lerp(handY, 1.57, raised), handAngle + raised * reaction.wave * .42, .4 * (1 - raised) * (1 - attention), 0);
      poseArm(arms[0], -.63 - pointing * .1, 1.15 + pointing * .23 + celebrating * .39, .15 + pointing * 1.2 - celebrating * reaction.wave * .36, .95 * (1 - pointing) * (1 - celebrating), pointing);
      fold.rotation.x = reaction.fold * .14;
      resume.rotation.y = -.045 + gaze.x * .075 + tilt.x;
      resume.rotation.x = gaze.y * -.03 + tilt.y;
      resume.rotation.z = -.014 + pointing * reaction.wave * .018;
      scan.visible = reactionKind === 'scan' && reaction.active && reaction.scan < 1;
      scan.position.y = 2.1 - reaction.scan * 4.2;
      renderer.render(scene, camera);
      host.dataset.gazeX = gaze.x.toFixed(3);
      host.dataset.gazeY = gaze.y.toFixed(3);
      host.dataset.reaction = reaction.active ? 'active' : 'idle';
      host.dataset.gesture = reaction.active ? reactionKind : 'idle';
      host.dataset.documentTilt = (Math.abs(tilt.x) + Math.abs(tilt.y)).toFixed(3);
      if (reaction.active || blinking || Math.abs(attentionTarget - attention) + Math.abs(target.x - gaze.x) + Math.abs(target.y - gaze.y) + Math.abs(tiltTarget.x - tilt.x) + Math.abs(tiltTarget.y - tilt.y) > .002) requestRender();
    }
    function requestRender() {
      if (!frame && !disposed && visible && !document.hidden) frame = requestAnimationFrame(render);
    }
    function scheduleBlink() {
      if (reducedMotion || disposed) return;
      blinkTimer = window.setTimeout(() => {
        blinkStart = performance.now();
        requestRender();
        scheduleBlink();
      }, 4600);
    }
    function resize() {
      syncBounds();
      if (!bounds.width || !bounds.height) return;
      renderer.setSize(bounds.width, bounds.height);
      const halfWidth = 2.45 * bounds.width / bounds.height;
      camera.left = -halfWidth;
      camera.right = halfWidth;
      camera.updateProjectionMatrix();
      requestRender();
    }
    wake = requestRender;
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) requestRender();
      else { cancelAnimationFrame(frame); frame = 0; }
    });
    observer.observe(host);
    if (!reducedMotion) {
      window.addEventListener('pointermove', pointerMove, { passive: true });
      window.addEventListener('pointerout', pointerOut, { passive: true });
      scheduleBlink();
    }
    window.addEventListener('scroll', syncBounds, { passive: true });
    document.addEventListener('visibilitychange', visibilityChange);
    resize();
    await renderer.compileAsync(scene, camera);
    if (disposed) return null;
    cancelAnimationFrame(frame);
    render(performance.now());
    return {
      react({ x = 0, y = 0, keyboard = false, celebrate = false } = {}) {
        reactionKind = celebrate ? 'celebrate' : !keyboard && pointAt(x, y) === 'resume' ? 'scan' : 'wave';
        if (disposed || reducedMotion) return reactionKind;
        reactionStart = performance.now();
        requestRender();
        return reactionKind;
      },
      startDrag(x, y) {
        if (disposed || reducedMotion || pointAt(x, y) !== 'resume') return false;
        drag = { x, y };
        host.parentElement.dataset.dragging = 'true';
        return true;
      },
      endDrag() {
        drag = null;
        tiltTarget.x = 0;
        tiltTarget.y = 0;
        host.parentElement.dataset.dragging = 'false';
        requestRender();
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }

  function syncBounds() { bounds = host.getBoundingClientRect(); }
  function pointerMove(event) {
    if (event.pointerType === 'touch') return;
    Object.assign(target, pointerGaze(event.clientX, event.clientY, bounds));
    hovered = pointAt(event.clientX, event.clientY);
    host.parentElement.dataset.pointerMode = hovered === 'resume' ? 'cv' : 'companion';
    if (drag) {
      tiltTarget.x = THREE.MathUtils.clamp((event.clientX - drag.x) / bounds.width * 1.5, -.35, .35);
      tiltTarget.y = THREE.MathUtils.clamp((event.clientY - drag.y) / bounds.height * 1.1, -.25, .25);
    }
    wake();
  }
  function pointerOut(event) {
    if (event.relatedTarget) return;
    Object.assign(target, { x: 0, y: 0 });
    hovered = null;
    wake();
  }
  function visibilityChange() {
    if (document.hidden) { cancelAnimationFrame(frame); frame = 0; }
    else wake();
  }
}
