import { connectBroker, defaultRoom, feedbackTopic, topic } from './mqtt-link.js';

const canvas = document.querySelector('#fruit-court');
const start = document.querySelector('#fruit-start');
const title = document.querySelector('#fruit-title');
const message = document.querySelector('#fruit-message');
const connection = document.querySelector('#fruit-connection');

import('https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js')
  .then(THREE => createGame(THREE))
  .catch(() => {
    title.textContent = 'Không mở được sân 3D';
    message.textContent = 'Hãy tải lại trang hoặc dùng trình duyệt hỗ trợ WebGL 2.';
    connection.textContent = 'Tay cầm sẽ kết nối khi sân 3D sẵn sàng.';
  });

function createGame(THREE) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-8, 8, 5, -5, 0.1, 30);
  camera.position.z = 15;
  scene.add(new THREE.HemisphereLight('#ecfff1', '#46636b', 1.75));
  const key = new THREE.DirectionalLight('#fff2cd', 2.9);
  key.position.set(-4, 7, 8);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#99f2cd', 1.75);
  rim.position.set(6, 4, -4);
  scene.add(rim);

  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), new THREE.ShaderMaterial({
    vertexShader: `varying vec2 field;
      void main() {
        field = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `varying vec2 field;
      void main() {
        float light = exp(-length(field * vec2(0.14, 0.22)));
        vec3 shade = mix(vec3(0.027, 0.085, 0.123), vec3(0.105, 0.33, 0.29), light);
        vec2 tile = abs(fract(field / 1.18 + 0.5) - 0.5);
        float grid = smoothstep(0.476, 0.5, max(tile.x, tile.y));
        float dotLight = pow(max(0.0, sin(field.x * 3.3) * sin(field.y * 4.8)), 24.0);
        gl_FragColor = vec4(shade + grid * 0.022 + dotLight * 0.09, 1.0);
      }`
  }));
  backdrop.position.z = -4;
  scene.add(backdrop);

  const skinGeometry = new THREE.SphereGeometry(1, 24, 16);
  const peelGeometry = new THREE.SphereGeometry(1, 24, 16, 0, Math.PI);
  const cutGeometry = new THREE.CircleGeometry(1, 28);
  const leafGeometry = new THREE.SphereGeometry(1, 12, 8);
  const stemGeometry = new THREE.CylinderGeometry(0.055, 0.085, 0.34, 8);
  const dropGeometry = new THREE.IcosahedronGeometry(1, 0);

  const surface = color => new THREE.MeshStandardMaterial({ color, roughness: 0.48 });
  const stem = surface('#634222');
  const leaf = surface('#65aa4f');
  const seedMaterial = surface('#815037');
  const fruitTypes = [
    ['#ef5a54', '#fff0ab', '#ffe3ad', 0.93, 1.03],
    ['#8cbf48', '#e6f68d', '#d8f879', 1.07, 0.91],
    ['#f5a241', '#ffd46b', '#ffd583', 1, 1.03],
    ['#bd5fa9', '#ffc0c4', '#ffc4e4', 0.87, 1.03]
  ].map(([peel, flesh, juice, width, height]) => ({
    peel: surface(peel), flesh: new THREE.MeshStandardMaterial({
      color: flesh, roughness: 0.68, side: THREE.DoubleSide
    }),
    juice: new THREE.MeshBasicMaterial({ color: juice }), width, height
  }));

  function fruitModel(type, half) {
    const group = new THREE.Group();
    const peel = new THREE.Mesh(half ? peelGeometry : skinGeometry, type.peel);
    group.add(peel);
    if (half) {
      const face = new THREE.Mesh(cutGeometry, type.flesh);
      group.add(face);
      for (const sign of [-1, 1]) {
        const seed = new THREE.Mesh(leafGeometry, seedMaterial);
        seed.position.set(sign * 0.14, -0.06, -0.02);
        seed.scale.set(0.052, 0.13, 0.025);
        seed.rotation.z = -sign * 0.34;
        group.add(seed);
      }
    } else {
      const stalk = new THREE.Mesh(stemGeometry, stem);
      stalk.position.y = 1;
      stalk.rotation.z = 0.17;
      group.add(stalk);
      const foliage = new THREE.Mesh(leafGeometry, leaf);
      foliage.position.set(0.27, 1.13, 0.02);
      foliage.scale.set(0.31, 0.068, 0.14);
      foliage.rotation.z = 0.42;
      group.add(foliage);
    }
    return group;
  }

  const displayFruit = new THREE.Group();
  for (let index = 0; index < fruitTypes.length; index++) {
    const type = fruitTypes[index];
    const decoration = fruitModel(type, false);
    const size = 0.8 + index * 0.095;
    decoration.scale.set(size * type.width, size * type.height, size);
    decoration.rotation.set(-0.22, index * 0.75, index % 2 ? 0.48 : -0.4);
    displayFruit.add(decoration);
  }
  scene.add(displayFruit);

  const trailMaterial = new THREE.MeshBasicMaterial({
    color: '#f5ffd2', transparent: true, opacity: 0.86,
    side: THREE.DoubleSide, depthWrite: false
  });
  const trailCoordinates = new Float32Array(18 * 6 * 3);
  const trailGeometry = new THREE.BufferGeometry();
  trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailCoordinates, 3).setUsage(THREE.DynamicDrawUsage));
  trailGeometry.setDrawRange(0, 0);
  const slashRibbon = new THREE.Mesh(trailGeometry, trailMaterial);
  slashRibbon.frustumCulled = false;
  slashRibbon.renderOrder = 2;
  scene.add(slashRibbon);

  const sword = new THREE.Group();
  const outline = new THREE.Shape();
  outline.moveTo(0, 0);
  outline.lineTo(-0.25, 0.115);
  outline.lineTo(-0.92, 0.095);
  outline.lineTo(-0.92, -0.095);
  outline.lineTo(-0.25, -0.115);
  outline.closePath();
  const steel = new THREE.MeshStandardMaterial({
    color: '#e3ffff', roughness: 0.27, metalness: 0.34
  });
  const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(outline, {
    depth: 0.045, bevelSize: 0.022, bevelThickness: 0.018, bevelSegments: 1
  }), steel);
  sword.add(blade);

  const brass = surface('#e9ad58');
  const grip = surface('#204b52');
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.38, 0.105), brass);
  guard.position.set(-0.94, 0, 0.023);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.105, 0.095), grip);
  handle.position.set(-1.13, 0, 0.023);
  const pommel = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.15, 0.11), brass);
  pommel.position.set(-1.32, 0, 0.023);
  sword.add(guard, handle, pommel);
  sword.visible = false;
  scene.add(sword);

  const overlay = document.querySelector('#fruit-overlay');
  const scoreView = document.querySelector('#fruit-score');
  const livesView = document.querySelector('#fruit-lives');
  const comboView = document.querySelector('#fruit-combo');
  const fruits = [];
  const debris = [];
  const trail = [];
  let halfWidth = 8;
  let running = false;
  let score = 0;
  let lives = 3;
  let waves = 0;
  let nextWave = 0;
  let comboUntil = 0;
  let previousTime = 0;
  let pointer = null;
  let lastRemoteSlash = -Infinity;
  let client;
  let best = 0;
  try { best = Number(localStorage.getItem('san-nha-fruit-best')) || 0; } catch {}

  function resize() {
    const width = Math.max(canvas.clientWidth, 1);
    const height = Math.max(canvas.clientHeight, 1);
    halfWidth = 5 * width / height;
    camera.left = -halfWidth;
    camera.right = halfWidth;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    displayFruit.children.forEach((fruit, index) => {
      fruit.position.set(halfWidth * [-0.75, 0.71, -0.57, 0.64][index], [-1.1, -1.45, 2.2, 2.05][index], -0.7);
    });
    if (!running) renderer.render(scene, camera);
  }
  new ResizeObserver(resize).observe(canvas);

  function updateHud() {
    scoreView.textContent = score;
    livesView.textContent = lives + ' / 3';
  }

  function launchWave() {
    const count = Math.min(5, 2 + Math.floor(waves / 4));
    const spread = Math.min(halfWidth * 1.45, 11.5);
    for (let index = 0; index < count; index++) {
      const type = fruitTypes[Math.floor(Math.random() * fruitTypes.length)];
      const radius = 0.45 + Math.random() * 0.18;
      const object = fruitModel(type, false);
      const x = (index / (count - 1) - 0.5) * spread + (Math.random() - 0.5) * 0.48;
      object.position.set(x, -5.9 - Math.random() * 0.9, 0);
      object.scale.set(radius * type.width, radius * type.height, radius);
      scene.add(object);
      fruits.push({
        object, type, radius,
        vx: -x * 0.3 + (Math.random() - 0.5) * 2.1,
        vy: 14.2 + Math.random() * 3.1,
        spin: (Math.random() - 0.5) * 5
      });
    }
    waves++;
  }

  function addDebris(object, x, y, z, vx, vy, spin, life) {
    object.position.set(x, y, z);
    scene.add(object);
    debris.push({ object, vx, vy, spin, life });
  }

  function splitFruit(fruit, dx, dy) {
    const { object, type, radius } = fruit;
    const { x, y, z } = object.position;
    const length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length;
    const ny = dx / length;
    scene.remove(object);
    for (const sign of [-1, 1]) {
      const half = fruitModel(type, true);
      half.scale.copy(object.scale);
      half.rotation.set(0.3, sign * 2.05, Math.atan2(dy, dx));
      addDebris(half, x + nx * sign * 0.15, y + ny * sign * 0.15, z,
        fruit.vx + nx * sign * 3.2, fruit.vy * 0.45 + ny * sign * 2.7, sign * 4, 0.85);
    }
    for (let index = 0; index < 7; index++) {
      const drop = new THREE.Mesh(dropGeometry, type.juice);
      drop.scale.setScalar(radius * (0.055 + Math.random() * 0.115));
      addDebris(drop, x, y, z + 0.2, (Math.random() - 0.5) * 9, Math.random() * 7 - 2, 0, 0.46);
    }
  }

  function addTrail(from, to, now) {
    trail.push({ from, to, now });
    if (trail.length > 18) trail.shift();
  }

  function slash(from, to, now) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const squaredLength = dx * dx + dy * dy;
    if (squaredLength < 0.0025) return 0;
    addTrail(from, to, now);
    let hits = 0;
    for (let index = fruits.length - 1; index >= 0; index--) {
      const fruit = fruits[index];
      const { x, y } = fruit.object.position;
      if (Math.abs(y) > 5.45) continue;
      const progress = THREE.MathUtils.clamp(((x - from.x) * dx + (y - from.y) * dy) / squaredLength, 0, 1);
      if ((x - from.x - progress * dx) ** 2 + (y - from.y - progress * dy) ** 2 > (fruit.radius + 0.09) ** 2) continue;
      splitFruit(fruit, dx, dy);
      fruits.splice(index, 1);
      hits++;
    }
    if (hits) {
      score += hits * 10;
      updateHud();
    }
    return hits;
  }

  function finishStroke(hits, now) {
    if (hits < 2) return;
    score += (hits - 1) * 5;
    comboView.textContent = `Combo ×${hits} · +${(hits - 1) * 5}`;
    comboView.hidden = false;
    comboUntil = now + 850;
    updateHud();
  }

  function point(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.max(-1, Math.min(1, (event.clientX - rect.left) / rect.width * 2 - 1)) * halfWidth,
      y: Math.max(-1, Math.min(1, 1 - (event.clientY - rect.top) / rect.height * 2)) * 5
    };
  }

  canvas.addEventListener('pointerdown', event => {
    if (!running || pointer || event.button !== 0) return;
    canvas.setPointerCapture(event.pointerId);
    pointer = { id: event.pointerId, previous: point(event), hits: 0, last: performance.now() };
  });
  canvas.addEventListener('pointermove', event => {
    if (!pointer || event.pointerId !== pointer.id) return;
    const now = performance.now();
    if (now - pointer.last > 180) {
      finishStroke(pointer.hits, now);
      pointer.hits = 0;
    }
    const next = point(event);
    pointer.hits += slash(pointer.previous, next, now);
    pointer.last = now;
    pointer.previous = next;
  });
  function endPointer(event) {
    if (pointer?.id !== event.pointerId) return;
    finishStroke(pointer.hits, performance.now());
    pointer = null;
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('lostpointercapture', endPointer);

  function remoteSlash(strength, direction) {
    const now = performance.now();
    if (!running) {
      startGame();
      lastRemoteSlash = now;
      return;
    }
    if (now - lastRemoteSlash < 250) return;
    lastRemoteSlash = now;
    const visible = fruits.filter(fruit => Math.abs(fruit.object.position.y) < 4.5);
    const aim = direction * halfWidth * 0.48;
    const target = visible.reduce((closest, fruit) => {
      const distance = item => Math.abs(item.object.position.x - aim) + Math.abs(item.object.position.y) * 0.4;
      return !closest || distance(fruit) < distance(closest) ? fruit : closest;
    }, null);
    const y = target?.object.position.y ?? 0;
    const side = direction < 0 ? -1 : 1;
    const reach = halfWidth * (0.34 + strength * 0.38);
    const hits = slash({ x: aim - side * reach, y: y - 0.22 }, { x: aim + side * reach, y: y + 0.22 }, now);
    finishStroke(hits, now);
    if (hits && client?.connected) client.publish(feedbackTopic(defaultRoom, 'fruit'), '{"hit":true}');
  }

  function drawTrail(now) {
    while (trail.length && now - trail[0].now > 420) trail.shift();
    const latest = trail.at(-1);
    sword.visible = Boolean(latest);
    if (latest) {
      const { from, to, now: timestamp } = latest;
      sword.position.set(to.x, to.y, 2.2);
      sword.rotation.z = Math.atan2(to.y - from.y, to.x - from.x);
      sword.scale.setScalar(Math.min(1, (420 - (now - timestamp)) / 145));
    }
    let offset = 0;
    for (const { from, to, now: timestamp } of trail) {
      if (now - timestamp >= 150) continue;
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const length = Math.hypot(dx, dy);
      const thickness = (1 - (now - timestamp) / 150) * 0.075;
      const nx = -dy / length * thickness;
      const ny = dx / length * thickness;
      trailCoordinates.set([
        from.x + nx, from.y + ny, 2, from.x - nx, from.y - ny, 2, to.x + nx, to.y + ny, 2,
        from.x - nx, from.y - ny, 2, to.x - nx, to.y - ny, 2, to.x + nx, to.y + ny, 2
      ], offset);
      offset += 18;
    }
    trailGeometry.attributes.position.needsUpdate = true;
    trailGeometry.setDrawRange(0, offset / 3);
  }

  function finishGame(now) {
    if (pointer) finishStroke(pointer.hits, now);
    pointer = null;
    running = false;
    best = Math.max(best, score);
    try { localStorage.setItem('san-nha-fruit-best', String(best)); } catch {}
    title.textContent = 'Hết lượt';
    message.textContent = `Điểm ${score} · Kỷ lục ${best}`;
    start.textContent = 'Chơi lại';
    overlay.hidden = false;
  }

  function frame(now) {
    const dt = Math.min(0.04, Math.max(0, (now - previousTime) / 1000));
    previousTime = now;
    if (now >= nextWave) {
      launchWave();
      nextWave = now + Math.max(1050, 2540 - waves * 72);
    }
    for (let index = fruits.length - 1; index >= 0; index--) {
      const fruit = fruits[index];
      fruit.vy -= 15.1 * dt;
      fruit.object.position.x += fruit.vx * dt;
      fruit.object.position.y += fruit.vy * dt;
      fruit.object.rotation.x += fruit.spin * dt;
      fruit.object.rotation.z -= fruit.spin * dt * 0.6;
      if (fruit.vy < 0 && fruit.object.position.y < -6) {
        scene.remove(fruit.object);
        fruits.splice(index, 1);
        lives = Math.max(0, lives - 1);
        updateHud();
      }
    }
    for (let index = debris.length - 1; index >= 0; index--) {
      const piece = debris[index];
      piece.life -= dt;
      piece.vy -= 14 * dt;
      piece.object.position.x += piece.vx * dt;
      piece.object.position.y += piece.vy * dt;
      piece.object.rotation.y += piece.spin * dt;
      if (piece.life <= 0) {
        scene.remove(piece.object);
        debris.splice(index, 1);
      }
    }
    if (now > comboUntil) comboView.hidden = true;
    drawTrail(now);
    renderer.render(scene, camera);
    if (lives === 0) finishGame(now);
    if (running) requestAnimationFrame(frame);
  }

  function startGame() {
    for (const fruit of fruits) scene.remove(fruit.object);
    for (const piece of debris) scene.remove(piece.object);
    fruits.length = debris.length = trail.length = 0;
    sword.visible = false;
    score = waves = 0;
    lives = 3;
    comboUntil = 0;
    updateHud();
    overlay.hidden = true;
    displayFruit.visible = false;
    running = true;
    nextWave = performance.now() + 220;
    previousTime = performance.now();
    requestAnimationFrame(frame);
  }

  canvas.addEventListener('webglcontextlost', () => {
    running = false;
    overlay.hidden = false;
    title.textContent = 'Sân 3D bị gián đoạn';
    message.textContent = 'Tải lại trang để tiếp tục chơi.';
    start.disabled = true;
  });
  start.disabled = false;
  start.onclick = startGame;
  try {
    const input = topic(defaultRoom, 'fruit');
    client = connectBroker(status => { connection.textContent = status; });
    client.on('connect', () => client.subscribe(input, (error, granted) => {
      connection.textContent = error || granted?.[0]?.qos === 128
        ? 'Broker từ chối phòng.' : 'Sẵn sàng ghép tay cầm.';
    }));
    client.on('message', (name, payload, packet) => {
      if (start.disabled || name !== input || packet.retain || payload.length > 100) return;
      let inputData;
      try { inputData = JSON.parse(payload.toString()); } catch { return; }
      const { swing, direction } = inputData ?? {};
      if (!Number.isFinite(swing) || swing <= 0 || swing > 1) return;
      remoteSlash(swing, Number.isFinite(direction) ? THREE.MathUtils.clamp(direction, -1, 1) : 0);
    });
  } catch (error) {
    connection.textContent = error.message;
  }
  resize();
}
