import * as THREE from 'three';
import { createDartFold } from '../../utils/paperFold';
import { easeInOutCubic } from '../../utils/sceneMotion';

// Building blocks for the paper-plane scenes: a resume that folds itself
// into a dart, camera-facing contrail ribbons, and tumbling confetti.

/**
 * A printed sheet that folds into a paper plane. `setFold(progress)` takes
 * 0 (flat page) to `stages` (finished plane). The mesh is re-centred as it
 * folds so the plane spins around its own middle.
 */
export function createFoldingSheet(texture, { size = 1 } = {}) {
  const fold = createDartFold();
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(fold.flat);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('uv', new THREE.BufferAttribute(fold.uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(fold.indices, 1));
  geometry.computeVertexNormals();

  const front = new THREE.Mesh(geometry, new THREE.MeshPhysicalMaterial({
    map: texture, roughness: 0.62, sheen: 0.25, sheenColor: 0xdbeafe, emissive: 0xffffff, emissiveMap: texture, emissiveIntensity: 0.12,
  }));
  const back = new THREE.Mesh(geometry, new THREE.MeshPhysicalMaterial({
    color: 0xe8eefc, side: THREE.BackSide, roughness: 0.7, sheen: 0.4, sheenColor: 0xc7d2fe, emissive: 0xffffff, emissiveIntensity: 0.05,
  }));
  const holder = new THREE.Group();
  holder.add(front, back);
  const object = new THREE.Group();
  object.scale.setScalar(size);
  object.add(holder);

  // Centre of the finished plane, so flight rotates around the plane's middle.
  const box = new THREE.Box3().setFromArray(fold.finished);
  const planeCenter = box.getCenter(new THREE.Vector3());
  const wingtips = fold.wingtips.map((index) => new THREE.Vector3().fromArray(fold.finished, index * 3).sub(planeCenter));

  let current = -1;
  return {
    object,
    stages: fold.stageCount,
    /** Wingtip positions in the object's local space (finished plane). */
    wingtips,
    setFold(progress) {
      const clamped = THREE.MathUtils.clamp(progress, 0, fold.stageCount);
      if (clamped === current) return;
      current = clamped;
      const stage = Math.min(Math.floor(clamped), fold.stageCount - 1);
      const fraction = easeInOutCubic(clamped - stage);
      fold.pose(stage, clamped >= fold.stageCount ? 1 : fraction, positions);
      geometry.attributes.position.needsUpdate = true;
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      holder.position.copy(planeCenter).multiplyScalar(-clamped / fold.stageCount);
    },
  };
}

/**
 * A ribbon that always faces the camera, drawn through `points` with a
 * width and opacity per point. Used for the wingtip contrails.
 */
export function createRibbon(capacity, { head = 0x60a5fa, tail = 0xa78bfa, opacity = 0.9 } = {}) {
  const geometry = new THREE.BufferGeometry();
  const position = new Float32Array(capacity * 2 * 3);
  const fade = new Float32Array(capacity * 2);
  const along = new Float32Array(capacity * 2);
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('fade', new THREE.BufferAttribute(fade, 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('along', new THREE.BufferAttribute(along, 1).setUsage(THREE.DynamicDrawUsage));
  const index = [];
  for (let point = 0; point < capacity - 1; point += 1) {
    const a = point * 2;
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  geometry.setIndex(index);
  const uniforms = { uHead: { value: new THREE.Color(head) }, uTail: { value: new THREE.Color(tail) }, uOpacity: { value: opacity } };
  const mesh = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms,
    vertexShader: /* glsl */ `
      attribute float fade;
      attribute float along;
      varying float vFade;
      varying float vAlong;
      void main() {
        vFade = fade;
        vAlong = along;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uHead;
      uniform vec3 uTail;
      uniform float uOpacity;
      varying float vFade;
      varying float vAlong;
      void main() {
        gl_FragColor = vec4(mix(uHead, uTail, vAlong), vFade * uOpacity);
        #include <colorspace_fragment>
      }`,
  }));
  mesh.frustumCulled = false;
  const tangent = new THREE.Vector3();
  const toCamera = new THREE.Vector3();
  const side = new THREE.Vector3();

  return {
    mesh,
    uniforms,
    /** points: Vector3[] head first; width(t) and alpha(t) take 0 (head) to 1 (tail). */
    update(points, camera, width, alpha) {
      const count = Math.min(points.length, capacity);
      for (let point = 0; point < count; point += 1) {
        const previous = points[Math.max(0, point - 1)];
        const next = points[Math.min(count - 1, point + 1)];
        tangent.subVectors(next, previous);
        if (tangent.lengthSq() < 1e-10) tangent.set(1, 0, 0);
        toCamera.subVectors(camera.position, points[point]);
        side.crossVectors(tangent, toCamera).normalize();
        const t = count > 1 ? point / (count - 1) : 0;
        side.multiplyScalar(width(t) / 2);
        const offset = point * 6;
        position[offset] = points[point].x + side.x;
        position[offset + 1] = points[point].y + side.y;
        position[offset + 2] = points[point].z + side.z;
        position[offset + 3] = points[point].x - side.x;
        position[offset + 4] = points[point].y - side.y;
        position[offset + 5] = points[point].z - side.z;
        fade[point * 2] = fade[point * 2 + 1] = alpha(t);
        along[point * 2] = along[point * 2 + 1] = t;
      }
      geometry.setDrawRange(0, Math.max(0, count - 1) * 6);
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.fade.needsUpdate = true;
      geometry.attributes.along.needsUpdate = true;
      mesh.visible = count > 1;
    },
  };
}

const CONFETTI_COLORS = [0x2563eb, 0x60a5fa, 0xf43f5e, 0x10b981, 0xf59e0b, 0x8b5cf6, 0x38bdf8];

/** Paper confetti with gravity, air drag and flutter. */
export function createConfetti(count = 160) {
  const geometry = new THREE.PlaneGeometry(0.075, 0.12);
  const material = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.5, metalness: 0.1, emissive: 0xffffff, emissiveIntensity: 0.08 });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  const color = new THREE.Color();
  const pieces = Array.from({ length: count }, (_, index) => {
    mesh.setColorAt(index, color.setHex(CONFETTI_COLORS[index % CONFETTI_COLORS.length]));
    return {
      position: new THREE.Vector3(), velocity: new THREE.Vector3(), axis: new THREE.Vector3(1, 0, 0),
      rotation: new THREE.Quaternion(), spin: 0, life: 0, age: Infinity, phase: Math.random() * 10, scale: 0.7 + Math.random() * 0.6,
    };
  });
  const matrix = new THREE.Matrix4();
  const turn = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let index = 0; index < count; index += 1) mesh.setMatrixAt(index, hidden);
  let next = 0;
  let active = 0;

  return {
    mesh,
    burst(origin, amount = count, power = 3.2) {
      for (let spawn = 0; spawn < amount; spawn += 1) {
        const piece = pieces[next];
        next = (next + 1) % count;
        const angle = Math.random() * Math.PI * 2;
        const lift = 0.35 + Math.random() * 0.65;
        const speed = power * (0.45 + Math.random() * 0.75);
        piece.position.copy(origin);
        piece.velocity.set(Math.cos(angle) * (1 - lift * 0.5), lift * 1.25, Math.sin(angle) * (1 - lift * 0.5)).multiplyScalar(speed);
        piece.axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
        piece.rotation.setFromAxisAngle(piece.axis, Math.random() * Math.PI);
        piece.spin = 6 + Math.random() * 10;
        piece.life = 2.2 + Math.random() * 1.2;
        piece.age = 0;
      }
      active = count;
    },
    /** Returns true while any piece is still in the air. */
    update(dt) {
      if (!active) return false;
      let alive = 0;
      pieces.forEach((piece, index) => {
        if (piece.age >= piece.life) return;
        piece.age += dt;
        const drag = Math.exp(-dt * 1.6);
        piece.velocity.multiplyScalar(drag);
        piece.velocity.y -= 4.2 * dt;
        piece.velocity.x += Math.sin(piece.age * 7 + piece.phase) * dt * 1.4;
        piece.position.addScaledVector(piece.velocity, dt);
        turn.setFromAxisAngle(piece.axis, piece.spin * dt);
        piece.rotation.multiply(turn);
        const remaining = Math.min(1, (piece.life - piece.age) / 0.5);
        if (piece.age >= piece.life) {
          mesh.setMatrixAt(index, hidden);
          return;
        }
        alive += 1;
        scale.setScalar(piece.scale * Math.max(0, remaining));
        matrix.compose(piece.position, piece.rotation, scale);
        mesh.setMatrixAt(index, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      active = alive;
      return alive > 0;
    },
  };
}

/** Orientation for a plane flying along `forward` with lift along `up`. */
export function flightQuaternion(forward, up, out = new THREE.Quaternion()) {
  const right = new THREE.Vector3().crossVectors(forward, up).normalize();
  const trueUp = new THREE.Vector3().crossVectors(right, forward).normalize();
  const basis = new THREE.Matrix4().makeBasis(right, forward, trueUp);
  return out.setFromRotationMatrix(basis);
}
