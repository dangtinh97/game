import { connectBroker, defaultRoom, topic } from './mqtt-link.js';

const court = document.querySelector('#court');
const ctx = court.getContext('2d');
const court3d = document.querySelector('#court-3d');
let render3d;
const hint = document.querySelector('#hint');
const start = document.querySelector('#start');
const stage = document.querySelector('#court-stage');
const fullscreen = document.querySelector('#fullscreen');
let fullscreenPending = false;

function isFullscreen() {
  return document.fullscreenElement === stage || stage.classList.contains('court-stage-expanded');
}

async function toggleFullscreen() {
  if (fullscreenPending) return;
  if (stage.classList.contains('court-stage-expanded')) {
    stage.classList.remove('court-stage-expanded');
    fullscreen.focus();
    return;
  }
  fullscreenPending = true;
  try {
    if (document.fullscreenElement === stage) {
      await document.exitFullscreen();
    } else {
      if (!stage.requestFullscreen) throw new Error('Fullscreen API unavailable');
      await stage.requestFullscreen();
      stage.focus();
    }
  } catch {
    if (document.fullscreenElement !== stage) {
      stage.classList.add('court-stage-expanded');
      stage.focus();
    }
  } finally {
    fullscreenPending = false;
  }
}

fullscreen.onclick = toggleFullscreen;
document.addEventListener('fullscreenchange', () => {
  if (!isFullscreen()) fullscreen.focus();
});
const connection = document.querySelector('#connection');
const roomCode = document.querySelector('#room-code');
const copy = document.querySelector('#copy');

const room = defaultRoom;
roomCode.textContent = room;

function connectRoom() {
  connection.textContent = 'Đang kết nối MQTT…';
  try {
    const active = connectBroker(message => { connection.textContent = message; });
    active.on('connect', () => {
      active.subscribe(topic(room), (error, granted) => {
        if (error || granted?.[0]?.qos === 128) {
          connection.textContent = 'Broker từ chối đăng ký phòng.';
          return;
        }
        connection.textContent = 'MQTT đã kết nối. Nhập mã phòng trên trang tay cầm.';
      });
    });
    active.on('message', (receivedTopic, payload, packet) => {
      if (receivedTopic !== topic(room) || packet.retain || payload.length > 100) return;
      try {
        const data = JSON.parse(payload.toString());
        if (Number.isFinite(data?.swing) && data.swing > 0 && data.swing <= 1) hit(data.swing);
      } catch {}
    });
  } catch (error) {
    connection.textContent = error.message;
  }
}

copy.onclick = async () => {
  try {
    await navigator.clipboard.writeText(room);
    copy.textContent = 'Đã sao chép';
  } catch {
    copy.textContent = 'Không sao chép được';
  }
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const hitWindowStart = 0.78;
let player = 0;
let opponent = 0;
let queuedSwing = null;
let swingUntil = 0;
let cpuSwingUntil = 0;
let ball = null;
let serveAt = 0;
let running = false;
let lastTime = performance.now();
let points = [0, 0];
let rallies = 0;

function updateScore() {
  document.querySelector('#player-score').textContent = points[0];
  document.querySelector('#cpu-score').textContent = points[1];
}

function sendBall(from, to, direction, duration, contact) {
  ball = { from, to, direction, duration, elapsed: 0 };
  ball.startDepth = contact?.depth ?? (direction > 0 ? 0.98 : 0.03);
  ball.startHeight = contact?.height ?? 42;
  ball.endDepth = direction > 0 ? 0.03 : 0.98;
}

function ballPosition() {
  const progress = clamp(ball.elapsed / ball.duration, 0, 1);
  const bounceAt = 0.67;
  const beforeBounce = progress < bounceAt;
  const phase = beforeBounce ? progress / bounceAt : (progress - bounceAt) / (1 - bounceAt);
  const height = beforeBounce
    ? ball.startHeight * (1 - phase) + 295 * phase * (1 - phase)
    : 166 * phase * (1 - phase) + 25 * phase;

  return {
    x: ball.from + (ball.to - ball.from) * progress,
    depth: ball.startDepth + (ball.endDepth - ball.startDepth) * progress,
    height
  };
}

function serve() {
  cpuSwingUntil = performance.now() + 210;
  rallies = 0;
  sendBall(opponent, Math.random() * 1.5 - 0.75, 1, 1.65);
  hint.textContent = 'Máy đưa bóng sang sân bạn.';
}

function score(side) {
  points[side]++;
  updateScore();
  ball = queuedSwing = null;
  if (points[side] === 7) {
    running = false;
    start.hidden = false;
    start.textContent = 'Chơi lại';
    hint.textContent = side === 0 ? 'Bạn thắng! Vung vợt để chơi lại.' : 'Máy thắng. Vung vợt để chơi lại.';
    return;
  }
  hint.textContent = side === 0 ? 'Bạn ghi điểm.' : 'Máy ghi điểm.';
  serveAt = performance.now() + 1050;
}

function hit(strength) {
  if (!running) {
    startMatch();
    return;
  }

  const now = performance.now();
  if (now < swingUntil || queuedSwing) return;
  if (ball?.direction === 1) {
    const untilReach = ball.duration * hitWindowStart - ball.elapsed;
    if (untilReach > 0 && untilReach <= 0.16) {
      queuedSwing = { strength, until: now + 200 };
      return;
    }
  }
  swingRacket(strength, now);
}

function swingRacket(strength, now) {
  swingUntil = now + 210;
  if (ball?.direction !== 1) return;

  const progress = ball.elapsed / ball.duration;
  if (progress < hitWindowStart) {
    hint.textContent = 'Hơi sớm. Vung khi vòng đón bóng hiện trên sân.';
    return;
  }

  const contact = ballPosition();
  if (progress > 1.06 || Math.abs(player - contact.x) > 0.32) return;
  const aim = opponent >= 0 ? -1 : 1;
  const target = aim * (0.68 + strength * 0.29);
  sendBall(contact.x, target, -1, 1.18 - strength * 0.46, contact);
  rallies++;
  hint.textContent = 'Đã trả bóng.';
}

function startMatch() {
  points = [0, 0];
  updateScore();
  player = opponent = 0;
  swingUntil = 0;
  running = true;
  start.blur();
  start.hidden = true;
  serve();
}

start.onclick = startMatch;

window.addEventListener('keydown', event => {
  if (event.code === 'F11' || (event.code === 'Escape' && isFullscreen())) {
    event.preventDefault();
    if (!event.repeat) void toggleFullscreen();
    return;
  }
  if (event.code !== 'Space' || event.target.closest('input, button, a')) return;
  event.preventDefault();
  if (!event.repeat) hit(0.8);
});

function moveToward(current, target, maxStep) {
  return current + clamp(target - current, -maxStep, maxStep);
}

function update(now, dt) {
  const incoming = ball?.direction === 1;
  const target = incoming ? ball.from + (ball.to - ball.from) * 0.91 : 0;
  player = moveToward(player, target, dt * (incoming ? 2.3 : 0.82));

  if (!ball) {
    if (now >= serveAt) serve();
    return;
  }
  ball.elapsed += dt;
  const progress = ball.elapsed / ball.duration;
  const cpuTarget = ball.direction < 0 && progress > 0.23 ? ball.to : 0;
  opponent = moveToward(opponent, cpuTarget, dt * 1.14);

  if (ball.direction > 0) {
    if (progress > 1.06) {
      score(1);
    } else if (queuedSwing && progress >= hitWindowStart) {
      const { strength, until } = queuedSwing;
      queuedSwing = null;
      if (now <= until) swingRacket(strength, now);
    }
  } else if (progress >= 1) {
    if (Math.abs(opponent - ball.to) > 0.26) score(0);
    else {
      const contact = ballPosition();
      cpuSwingUntil = now + 210;
      const reply = clamp(-player * 0.65 + (Math.random() - 0.5) * 0.95, -0.87, 0.87);
      sendBall(contact.x, reply, 1, Math.max(1.03, 1.62 - rallies * 0.08), contact);
    }
  }
}

function project(x, depth, height = 0) {
  return [480 + x * (308 - depth * 149), 495 - depth * 343 - height * (1 - depth * 0.45)];
}

function polygon(points, fill, stroke) {
  ctx.beginPath();
  points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2.5; ctx.stroke(); }
}

function line(a, b, color, width = 2.5) {
  ctx.beginPath();
  ctx.moveTo(...a);
  ctx.lineTo(...b);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function dot(x, y, radius, fill) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

function avatar(position, depth, color, swinging) {
  const [x, y] = project(position, depth);
  const size = 1 - depth * 0.43;
  ctx.beginPath();
  ctx.ellipse(x, y + 2, 22 * size, 7 * size, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#102b3299';
  ctx.fill();
  line([x, y - 26 * size], [x - 9 * size, y], '#15232b', 7 * size);
  line([x, y - 26 * size], [x + 9 * size, y], '#15232b', 7 * size);
  ctx.fillStyle = color;
  ctx.fillRect(x - 12 * size, y - 51 * size, 24 * size, 27 * size);
  dot(x, y - 60 * size, 9 * size, '#f2c7a8');
  const grip = [x + 15 * size, y - 37 * size];
  const racket = [x + (swinging ? -29 : 30) * size, y - (swinging ? 56 : 35) * size];
  line(grip, racket, '#f1f4ee', 3 * size);
  dot(...racket, 7 * size, '#f1f4ee');
  dot(...racket, 4 * size, '#557480');
}

function draw(now) {
  const sky = ctx.createLinearGradient(0, 0, 0, 560);
  sky.addColorStop(0, '#122734');
  sky.addColorStop(1, '#2b5660');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 960, 560);

  const field = (width, near, far, fill, stroke) => polygon([
    project(-width, near), project(width, near), project(width, far), project(-width, far)
  ], fill, stroke);

  field(1.29, -0.14, 1.16, '#328175');
  field(1.13, 0, 1, '#398d7e', '#e0f2e6');
  field(0.91, 0, 1, null, '#e0f2e6');
  for (const depth of [0.27, 0.73]) line(project(-0.91, depth), project(0.91, depth), '#e0f2e6');
  line(project(0, 0.27), project(0, 0.73), '#e0f2e6');

  avatar(opponent, 1, '#f6a476', false);

  polygon([project(-1.18, 0.5), project(1.18, 0.5), project(1.18, 0.5, 32), project(-1.18, 0.5, 32)], '#183541af');
  for (let x = -14; x <= 14; x++) line(project(x * 0.08, 0.5), project(x * 0.08, 0.5, 32), '#c1e7dc43', 1);
  for (const height of [8, 16, 24]) line(project(-1.18, 0.5, height), project(1.18, 0.5, height), '#c1e7dc43', 1);
  line(project(-1.18, 0.5, 32), project(1.18, 0.5, 32), '#eef4e7', 3);
  for (const x of [-1.18, 1.18]) line(project(x, 0.5), project(x, 0.5, 34), '#eef4e7', 4);

  avatar(player, 0.03, '#daf77c', now < swingUntil);
  if (ball) {
    const progress = clamp(ball.elapsed / ball.duration, 0, 1);
    const { x, depth, height } = ballPosition();
    if (ball.direction > 0 && progress >= hitWindowStart) {
      const [targetX, targetY] = project(ball.to, 0.03);
      ctx.beginPath();
      ctx.ellipse(targetX, targetY, 30, 9, 0, 0, Math.PI * 2);
      ctx.strokeStyle = '#daf77c';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    dot(...project(x, depth), 4, '#142f3880');
    dot(...project(x, depth, height), 8 - depth * 3, '#e7ff7e');
  }
}

function frame(now) {
  const dt = Math.min(0.04, (now - lastTime) / 1000);
  lastTime = now;
  if (running) update(now, dt);
  if (render3d) {
    render3d({
      now, dt, player, opponent, swingUntil, cpuSwingUntil,
      ball: ball ? ballPosition() : null,
      target: ball?.direction === 1 && ball.elapsed / ball.duration >= hitWindowStart ? ball.to : null
    });
  } else {
    draw(now);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
connectRoom();

court3d.addEventListener('webglcontextlost', () => {
  render3d = null;
  court3d.hidden = true;
  court.hidden = false;
});

import('./court-3d.js').then(({ createCourt }) => {
  render3d = createCourt(court3d);
  court3d.hidden = false;
  court.hidden = true;
}).catch(error => console.info('Sân 2D đang được sử dụng.', error));
