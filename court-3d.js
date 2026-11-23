import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';

const halfWidth = 4.65;
const halfLength = 9.65;
const netHeight = 0.96;
const positionZ = depth => halfLength * (1 - 2 * depth);
const standard = (color, roughness = 0.84) => new THREE.MeshStandardMaterial({ color, roughness });
const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const sphereGeometry = new THREE.SphereGeometry(1, 16, 12);
const segmentGeometry = new THREE.CylinderGeometry(1, 1, 1, 10);
const up = new THREE.Vector3(0, 1, 0);

function mesh(parent, geometry, material, x, y, z, sx, sy, sz) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(x, y, z);
  object.scale.set(sx, sy, sz);
  parent.add(object);
  return object;
}

function box(parent, material, x, y, z, width, height, length) {
  return mesh(parent, boxGeometry, material, x, y, z, width, height, length);
}

function sphere(parent, material, x, y, z, sx, sy, sz) {
  return mesh(parent, sphereGeometry, material, x, y, z, sx, sy, sz);
}

function courtTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const pixels = ctx.createImageData(128, 128);
  for (let index = 0; index < pixels.data.length; index += 4) {
    const shade = 211 + Math.floor(Math.random() * 45);
    pixels.data.set([shade, shade, shade, 255], index);
  }
  ctx.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(8, 16);
  texture.anisotropy = 4;
  return texture;
}

function lineSegments(parent, coordinates, color, opacity = 1) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(coordinates, 3));
  const material = new THREE.LineBasicMaterial({ color, opacity, transparent: opacity < 1 });
  parent.add(new THREE.LineSegments(geometry, material));
}

function buildCourt(scene) {
  const chalk = standard('#f2f4e6');
  const base = standard('#39675d');
  const court = standard('#4e8779');
  court.map = courtTexture();
  box(scene, base, 0, -0.13, 0, 19, 0.22, 28).receiveShadow = true;
  box(scene, court, 0, -0.022, 0, 10.55, 0.044, 19.3).receiveShadow = true;

  const stripe = (x, z, width, length) => box(scene, chalk, x, 0.005, z, width, 0.01, length);
  for (const z of [-halfLength, halfLength]) {
    stripe(0, z, 10.55, 0.052);
    stripe(0, z * 0.978, 0.052, 0.33);
  }
  for (const x of [-5.275, -4.25, 4.25, 5.275]) stripe(x, 0, 0.052, 19.3);
  for (const z of [-5.4, 5.4]) stripe(0, z, 8.5, 0.052);
  stripe(0, 0, 0.052, 10.8);

  const net = [];
  const span = 5.55;
  for (let index = -55; index <= 55; index++) {
    const x = index * span / 55;
    net.push(x, 0.06, 0, x, netHeight, 0);
  }
  for (let y = 0.06; y < netHeight; y += 0.065) net.push(-span, y, 0, span, y, 0);
  lineSegments(scene, net, '#112b29', 0.78);
  box(scene, chalk, 0, netHeight, 0, span * 2, 0.052, 0.038);
  const post = standard('#e2e7d9');
  for (const x of [-span, span]) {
    box(scene, post, x, 0.51, 0, 0.095, 1.02, 0.095).castShadow = true;
    box(scene, base, x, 0.025, 0, 0.35, 0.05, 0.35);
  }
}

function buildStands(scene) {
  const walkway = standard('#344858');
  const wall = standard('#28404b');
  for (const side of [-1, 1]) {
    box(scene, wall, side * 9.35, 0.52, 0, 0.26, 1.08, 27);
    for (let tier = 0; tier < 4; tier++) {
      box(scene, walkway, side * (10 + tier * 0.68), tier * 0.34, -2, 0.69, 0.34, 20);
    }
  }
  box(scene, wall, 0, 0.48, -13.7, 19.3, 0.96, 0.42);
  const colors = ['#466276', '#577689', '#758a95', '#3d5b70'];
  const sections = new THREE.InstancedMesh(boxGeometry, standard('#ffffff'), 4 * 44);
  const transform = new THREE.Object3D();
  for (let tier = 0; tier < 4; tier++) {
    box(scene, walkway, 0, tier * 0.44, -14.45 - tier * 0.77, 23, 0.44, 0.8);
    for (let seat = 0; seat < 44; seat++) {
      transform.position.set((seat - 21.5) * 0.48, 0.36 + tier * 0.44, -14.7 - tier * 0.77);
      transform.scale.set(0.38, 0.28, 0.29);
      transform.updateMatrix();
      const index = tier * 44 + seat;
      sections.setMatrixAt(index, transform.matrix);
      sections.setColorAt(index, new THREE.Color(colors[(seat + tier * 3) % colors.length]));
    }
  }
  scene.add(sections);
}

function buildRacket(parent, accent) {
  const racket = new THREE.Group();
  parent.add(racket);
  const graphite = standard('#202c32', 0.58);
  box(racket, graphite, 0, 0.15, 0, 0.065, 0.36, 0.07);
  const hoop = mesh(racket, new THREE.TorusGeometry(0.205, 0.021, 8, 28), accent,
    0, 0.46, 0, 0.83, 1.24, 1);
  hoop.castShadow = true;
  const strings = [];
  for (let i = -3; i <= 3; i++) {
    const offset = i * 0.24;
    const reach = Math.sqrt(1 - offset * offset);
    strings.push(offset * 0.167, 0.46 - 0.25 * reach, 0, offset * 0.167, 0.46 + 0.25 * reach, 0);
    strings.push(-0.167 * reach, 0.46 + 0.25 * offset, 0, 0.167 * reach, 0.46 + 0.25 * offset, 0);
  }
  lineSegments(racket, strings, '#ecf1dd', 0.78);
  return racket;
}

function buildPlayer(scene, colors, facing) {
  const group = new THREE.Group();
  scene.add(group);
  const jersey = standard(colors.jersey);
  const skin = standard(colors.skin);
  const shorts = standard(colors.shorts);
  const shoe = standard('#f1f1e8');
  const hair = standard(colors.hair);

  const torso = sphere(group, jersey, 0, 1.1, 0, 0.255, 0.305, 0.135);
  const pelvis = sphere(group, shorts, 0, 0.84, 0, 0.213, 0.17, 0.129);
  const neck = sphere(group, skin, 0, 1.365, 0, 0.075, 0.11, 0.071);
  const head = sphere(group, skin, 0, 1.51, -0.018, 0.118, 0.151, 0.109);
  const cap = sphere(group, hair, 0, 1.58, -0.021, 0.123, 0.097, 0.114);
  const brim = sphere(group, jersey, 0, 1.58, -0.11, 0.116, 0.018, 0.102);

  const limbs = [-1, 1].map(() => ({
    upperArm: mesh(group, segmentGeometry, jersey, 0, 0, 0, 1, 1, 1),
    forearm: mesh(group, segmentGeometry, skin, 0, 0, 0, 1, 1, 1),
    thigh: mesh(group, segmentGeometry, shorts, 0, 0, 0, 1, 1, 1),
    calf: mesh(group, segmentGeometry, skin, 0, 0, 0, 1, 1, 1),
    hand: sphere(group, skin, 0, 0, 0, 0.047, 0.054, 0.038),
    foot: sphere(group, shoe, 0, 0, 0, 0.073, 0.054, 0.139)
  }));

  group.traverse(child => { if (child.isMesh) child.castShadow = true; });
  const racket = buildRacket(group, jersey);
  const shadow = mesh(scene, new THREE.CircleGeometry(1, 24),
    new THREE.MeshBasicMaterial({ color: '#142b26', opacity: 0.2, transparent: true, depthWrite: false }),
    0, 0.018, 0, 0.48, 0.25, 1);
  shadow.rotation.x = -Math.PI / 2;
  const delta = new THREE.Vector3();
  let previousX = 0;
  let previousZ = null;
  let step = 0;
  let stride = 0;

  function segment(part, a, b, radius) {
    delta.subVectors(b, a);
    part.position.copy(a).lerp(b, 0.5);
    part.scale.set(radius, delta.length(), radius);
    part.quaternion.setFromUnitVectors(up, delta.normalize());
  }

  return (x, z, now, dt, swingUntil, swingDuration, racketSide) => {
    const movement = x - previousX;
    previousX = x;
    const distance = Math.hypot(movement, z - (previousZ ?? z));
    previousZ = z;
    step += distance * 5.7;
    stride = THREE.MathUtils.damp(stride, dt > 0 ? Math.min(1, distance / dt / 5) : 0, 14, dt);
    const swingProgress = THREE.MathUtils.clamp(1 - (swingUntil - now) / swingDuration, 0, 1);
    const preparation = Math.max(0, 1 - Math.abs(swingProgress - 0.13) / 0.13);
    const followThrough = Math.sin(Math.PI * THREE.MathUtils.clamp((swingProgress - 0.13) / 0.87, 0, 1));
    const swing = (followThrough - preparation * 0.54) * racketSide;
    const bounce = Math.abs(Math.sin(step)) * 0.068 * stride;
    group.position.set(x, 0.005, z);
    group.rotation.y = facing - 0.7 * swing;
    group.rotation.z = -THREE.MathUtils.clamp(movement / Math.max(dt, 0.001) * 0.019, -0.13, 0.13) * Math.cos(facing);
    shadow.position.set(x, 0.018, z);
    torso.position.y = 1.1 + bounce;
    pelvis.position.y = 0.84 + bounce;
    neck.position.y = 1.365 + bounce;
    head.position.y = 1.51 + bounce;
    cap.position.y = brim.position.y = 1.58 + bounce;

    limbs.forEach((limb, index) => {
      const side = index === 0 ? -1 : 1;
      const cycle = Math.sin(step + index * Math.PI) * stride;
      const foot = new THREE.Vector3(side * (0.19 + cycle * 0.12), 0.055 + Math.max(0, cycle) * 0.17, -0.065 - cycle * 0.22);
      const knee = new THREE.Vector3(side * 0.157 + cycle * 0.08, 0.44 + bounce * 0.25, -0.12 + cycle * 0.11);
      segment(limb.thigh, new THREE.Vector3(side * 0.115, 0.82 + bounce, 0), knee, 0.09);
      segment(limb.calf, knee, foot, 0.055);
      limb.foot.position.copy(foot);

      const reach = index === 1 ? swing : 0;
      const elbow = new THREE.Vector3(side * (0.32 + reach * 0.08), 0.99 + bounce + Math.abs(reach) * 0.14, -0.055 - Math.abs(reach) * 0.12);
      const hand = new THREE.Vector3(side * (0.29 - reach * 0.49), 1.02 + bounce + Math.abs(reach) * 0.28, -0.25 - Math.abs(reach) * 0.29 + cycle * 0.1);
      segment(limb.upperArm, new THREE.Vector3(side * 0.214, 1.23 + bounce, 0), elbow, 0.064);
      segment(limb.forearm, elbow, hand, 0.045);
      limb.hand.position.copy(hand);
      if (index === 1) {
        racket.position.copy(hand);
        racket.rotation.set(-0.38 - reach * 0.85, 0.36 + reach * 0.65, -0.8 + reach * 1.84);
      }
    });
  };
}

export function createCourt(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#577485');
  scene.fog = new THREE.Fog('#577485', 32, 70);
  const camera = new THREE.PerspectiveCamera(43, 960 / 560, 0.1, 100);
  camera.position.set(0, 7.6, 20.7);
  camera.lookAt(0, 0.7, -1.9);

  scene.add(new THREE.HemisphereLight('#d9efff', '#838c6c', 2.0));
  const sun = new THREE.DirectionalLight('#fff1d6', 2.35);
  sun.position.set(-8, 16, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 14, bottom: -14, near: 1, far: 44 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.normalBias = 0.032;
  scene.add(sun);

  buildCourt(scene);
  buildStands(scene);
  const animatePlayer = buildPlayer(scene, { jersey: '#c9ed67', shorts: '#283c4c', skin: '#bf8b62', hair: '#283c4c' }, 0);
  const animateCpu = buildPlayer(scene, { jersey: '#f18a6e', shorts: '#374d65', skin: '#9f694d', hair: '#384051' }, Math.PI);
  const felt = standard('#dafa47');
  felt.emissive.set('#758e16');
  felt.emissiveIntensity = 0.36;
  const ball = sphere(scene, felt, 0, 0, 0, 0.145, 0.145, 0.145);
  const target = mesh(scene, new THREE.RingGeometry(0.36, 0.42, 32),
    new THREE.MeshBasicMaterial({ color: '#deff80', transparent: true, opacity: 0.8 }),
    0, 0.023, positionZ(0.03), 1, 1, 1);
  target.rotation.x = -Math.PI / 2;
  const shadow = mesh(scene, new THREE.CircleGeometry(0.18, 24),
    new THREE.MeshBasicMaterial({ color: '#172e2a', transparent: true, opacity: 0.5, depthWrite: false }),
    0, 0.019, 0, 1, 1, 1);
  shadow.rotation.x = -Math.PI / 2;

  let width = 0;
  return state => {
    const nextWidth = Math.max(1, canvas.clientWidth);
    if (width !== nextWidth) {
      width = nextWidth;
      renderer.setSize(width, Math.round(width * 560 / 960), false);
    }

    animatePlayer(state.player * halfWidth, positionZ(state.playerDepth), state.now, state.dt, state.swingUntil, state.swingDuration, state.racketSide);
    animateCpu(state.opponent * halfWidth, positionZ(state.opponentDepth), state.now, state.dt, state.cpuSwingUntil, state.swingDuration, 1);
    ball.visible = shadow.visible = Boolean(state.ball);
    if (state.ball) {
      const { x, depth, height } = state.ball;
      ball.position.set(x * halfWidth, Math.max(0.145, height * 0.027), positionZ(depth));
      shadow.position.set(ball.position.x, 0.019, ball.position.z);
      shadow.scale.setScalar(1 + height * 0.012);
      shadow.material.opacity = 0.5 / (1 + height * 0.022);
    }
    target.visible = state.target !== null;
    if (target.visible) target.position.set(state.target * halfWidth, 0.023, positionZ(state.playerDepth + 0.022));
    renderer.render(scene, camera);
  };
}
