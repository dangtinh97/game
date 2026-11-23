import { connectBroker, defaultRoom, feedbackTopic, topic } from './mqtt-link.js';

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
let roomClient;
roomCode.textContent = room;

function connectRoom() {
  connection.textContent = 'Đang kết nối MQTT…';
  try {
    const active = connectBroker(message => { connection.textContent = message; });
    roomClient = active;
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
        if (Number.isFinite(data?.swing) && data.swing > 0 && data.swing <= 1) {
          const direction = Number.isFinite(data.direction) ? clamp(data.direction, -1, 1) : 0;
          hit(data.swing, direction);
        }
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
const contactProgress = 0.91;
const bounceProgress = 0.67;
const singlesSideline = 0.91;
const hitWindowStart = 0.84;
const hitWindowEnd = 1.02;
const swingDuration = 360;
const swingWindup = 100;
let player = 0;
let playerSpeed = 0;
let playerDepth = 0.03;
let racketSide = 1;
let opponent = 0;
let opponentDepth = 0.98;
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

function sendBall(from, to, direction, duration, contact, landing) {
  ball = { from, to, direction, duration, elapsed: 0 };
  ball.startDepth = contact?.depth ?? (direction > 0 ? 0.98 : 0.03);
  ball.startHeight = contact?.height ?? 42;
  ball.endDepth = direction > 0 ? 0.03 : 0.98;
  if (landing) {
    ball.to = from + (landing.x - from) / bounceProgress;
    ball.endDepth = ball.startDepth + (landing.depth - ball.startDepth) / bounceProgress;
  }
  if (direction > 0) {
    const intercept = from + (to - from) * contactProgress;
    racketSide = intercept < player - 0.08 ? -1 : 1;
  }
}

function ballPosition(progress = ball.elapsed / ball.duration) {
  const bounceAt = bounceProgress;
  const beforeBounce = progress < bounceAt;
  const phase = beforeBounce ? progress / bounceAt : (progress - bounceAt) / (1 - bounceAt);
  const height = beforeBounce
    ? ball.startHeight * (1 - phase) + 295 * phase * (1 - phase)
    : 166 * phase * (1 - phase) + 25 * phase;

  return {
    x: ball.from + (ball.to - ball.from) * progress,
    depth: ball.startDepth + (ball.endDepth - ball.startDepth) * progress,
    height: Math.max(0, height)
  };
}

function serve() {
  cpuSwingUntil = performance.now() + swingDuration - swingWindup;
  rallies = 0;
  sendBall(opponent, Math.random() * 1.5 - 0.75, 1, 1.65, { depth: opponentDepth, height: 42 });
  hint.textContent = 'Máy đưa bóng sang sân bạn.';
}

function score(side, reason) {
  points[side]++;
  updateScore();
  ball = queuedSwing = null;
  if (points[side] === 7) {
    running = false;
    start.hidden = false;
    start.textContent = 'Chơi lại';
    const result = side === 0 ? 'Bạn thắng!' : 'Máy thắng.';
    hint.textContent = [reason, result, 'Vung vợt để chơi lại.'].filter(Boolean).join(' ');
    return;
  }
  hint.textContent = reason || (side === 0 ? 'Bạn ghi điểm.' : 'Máy ghi điểm.');
  serveAt = performance.now() + 1050;
}

function hit(strength, direction = 0) {
  if (!running) {
    startMatch();
    return;
  }

  const now = performance.now();
  if (now < swingUntil || queuedSwing) return;
  const incoming = ball?.direction === 1;
  const untilWindow = incoming ? ball.duration * hitWindowStart - ball.elapsed : 0;
  const delay = Math.max(swingWindup, Math.min(170, untilWindow * 1000));
  swingUntil = now + delay + swingDuration - swingWindup;
  if (incoming) queuedSwing = { strength, direction, contactAt: now + delay };
}

function swingRacket(strength, direction) {
  const progress = ball.elapsed / ball.duration;
  if (progress < hitWindowStart || progress > hitWindowEnd) {
    hint.textContent = progress < hitWindowStart ? 'Hơi sớm.' : 'Hơi muộn.';
    return;
  }

  const contact = ballPosition();
  const reach = (contact.x - player) * racketSide;
  if (reach < -0.04 || reach > 0.31 || Math.abs(contact.depth - playerDepth) > 0.075) {
    hint.textContent = 'Bóng ngoài tầm vợt.';
    return;
  }
  const timing = clamp(1 - Math.abs(progress - contactProgress) / 0.13, 0, 1);
  const power = strength * (0.52 + timing * 0.48);
  const landing = {
    x: direction * (0.67 + power * 0.37),
    depth: 0.62 + strength * 0.26 + strength * (1 - timing) * 0.18
  };
  sendBall(contact.x, landing.x, -1, 1.28 - power * 0.58, contact, landing);
  rallies++;
  if (roomClient?.connected) {
    roomClient.publish(feedbackTopic(room), JSON.stringify({ hit: true }));
  }
  hint.textContent = timing >= 0.78 ? 'Đánh đúng nhịp!' : 'Đã trả bóng.';
}

function startMatch() {
  points = [0, 0];
  updateScore();
  player = opponent = playerSpeed = 0;
  playerDepth = 0.03;
  opponentDepth = 0.98;
  queuedSwing = null;
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
  const aim = { ArrowLeft: -0.65, Space: 0, ArrowRight: 0.65 }[event.code];
  if (aim === undefined || event.target.closest('input, button, a')) return;
  event.preventDefault();
  if (!event.repeat) hit(0.8, aim);
});

function moveToward(current, target, maxStep) {
  return current + clamp(target - current, -maxStep, maxStep);
}

function update(now, dt) {
  const incoming = ball?.direction === 1;
  const intercept = incoming ? ball.from + (ball.to - ball.from) * contactProgress : 0;
  const target = incoming ? intercept - racketSide * 0.145 : 0;
  const depth = incoming ? ball.startDepth + (ball.endDepth - ball.startDepth) * contactProgress : 0.03;
  playerDepth = moveToward(playerDepth, depth - (incoming ? 0.022 : 0), dt * 0.23);
  const difference = target - player;
  const acceleration = 7.5;
  const limit = incoming ? 1.85 : 0.8;
  const desiredSpeed = Math.sign(difference) * Math.min(limit, Math.sqrt(2 * acceleration * Math.abs(difference)));
  playerSpeed = moveToward(playerSpeed, desiredSpeed, acceleration * dt);
  const nextPosition = player + playerSpeed * dt;
  if (Math.sign(target - nextPosition) !== Math.sign(difference)) {
    player = target;
    playerSpeed = 0;
  } else {
    player = nextPosition;
  }

  if (!ball) {
    if (now >= serveAt) serve();
    return;
  }
  const previousProgress = ball.elapsed / ball.duration;
  ball.elapsed += dt;
  const progress = ball.elapsed / ball.duration;
  const cpuTarget = ball.direction < 0 && progress > 0.23 ? clamp(ball.to, -1.05, 1.05) : 0;
  opponent = moveToward(opponent, cpuTarget, dt * 1.14);
  const cpuDepth = ball.direction < 0 && progress > 0.23 ? clamp(ball.endDepth, 0.58, 1.13) : 0.98;
  opponentDepth = moveToward(opponentDepth, cpuDepth, dt * 0.24);

  if (previousProgress < bounceProgress && progress >= bounceProgress) {
    const bounce = ballPosition(bounceProgress);
    const outsideCourt = Math.abs(bounce.x) > singlesSideline ||
      (ball.direction < 0 ? bounce.depth < 0.5 || bounce.depth > 1 : bounce.depth < 0 || bounce.depth > 0.5);
    if (outsideCourt) {
      if (ball.direction < 0) score(1, 'Bóng ngoài sân. Máy ghi điểm.');
      else score(0, 'Máy đánh ra ngoài. Bạn ghi điểm.');
      return;
    }
  }

  if (ball.direction > 0) {
    if (queuedSwing && now >= queuedSwing.contactAt) {
      const { strength, direction } = queuedSwing;
      queuedSwing = null;
      swingRacket(strength, direction);
    }
    if (ball.direction === 1 && progress > 1.13) score(1);
  } else if (progress >= 1) {
    if (Math.abs(opponent - ball.to) > 0.26 || Math.abs(opponentDepth - ball.endDepth) > 0.085) score(0);
    else {
      const contact = ballPosition();
      cpuSwingUntil = now + swingDuration - swingWindup;
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

  avatar(opponent, opponentDepth, '#f6a476', false);

  polygon([project(-1.18, 0.5), project(1.18, 0.5), project(1.18, 0.5, 32), project(-1.18, 0.5, 32)], '#183541af');
  for (let x = -14; x <= 14; x++) line(project(x * 0.08, 0.5), project(x * 0.08, 0.5, 32), '#c1e7dc43', 1);
  for (const height of [8, 16, 24]) line(project(-1.18, 0.5, height), project(1.18, 0.5, height), '#c1e7dc43', 1);
  line(project(-1.18, 0.5, 32), project(1.18, 0.5, 32), '#eef4e7', 3);
  for (const x of [-1.18, 1.18]) line(project(x, 0.5), project(x, 0.5, 34), '#eef4e7', 4);

  avatar(player, playerDepth, '#daf77c', now < swingUntil);
  if (ball) {
    const progress = ball.elapsed / ball.duration;
    const { x, depth, height } = ballPosition();
    if (ball.direction > 0 && progress >= 0.74) {
      const [targetX, targetY] = project(ball.from + (ball.to - ball.from) * contactProgress, playerDepth + 0.022);
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
      now, dt, player, playerDepth, opponent, opponentDepth, swingUntil, cpuSwingUntil, swingDuration, racketSide,
      ball: ball ? ballPosition() : null,
      target: ball?.direction === 1 && ball.elapsed / ball.duration >= 0.74 ? ball.from + (ball.to - ball.from) * contactProgress : null
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
