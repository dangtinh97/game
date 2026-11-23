import { connectBroker, defaultRoom, feedbackTopic, normalizeRoom, topic, validRoom } from './mqtt-link.js';

const game = new URLSearchParams(location.search).get('game') === 'fruit' ? 'fruit' : 'tennis';
if (game === 'fruit') {
  document.querySelector('h1').textContent = 'Tay cầm chém hoa quả';
  document.querySelector('#controller-help').textContent =
    'Giữ điện thoại dọc và vung sang trái hoặc phải để chém. Có thể dùng các nút bên dưới.';
}
const join = document.querySelector('#join');
const roomInput = document.querySelector('#room');
roomInput.value = defaultRoom;
let room;
const connection = document.querySelector('#connection');
const sensor = document.querySelector('#sensor');
const enable = document.querySelector('#enable');
const swingButtons = document.querySelectorAll('[data-direction]');
let client;
let sensorsEnabled = false;
let lastSwing = -Infinity;
let lastVibration = -Infinity;
const supportsVibration = typeof navigator.vibrate === 'function';
const vibrationNotice = document.querySelector('#vibration-notice');
vibrationNotice.hidden = supportsVibration;

function publish(input) {
  if (client?.connected) client.publish(topic(room, game), JSON.stringify(input));
}

function hit(strength, direction) {
  const now = performance.now();
  if (now - lastSwing < 420) return;
  lastSwing = now;
  publish({ swing: strength, direction });
}

join.onsubmit = event => {
  event.preventDefault();
  const code = normalizeRoom(roomInput.value);
  if (!validRoom(code)) {
    connection.textContent = 'Nhập đúng 6 chữ số từ 1 đến 9.';
    return;
  }
  const previous = client;
  client = null;
  previous?.end(true);
  room = code;
  swingButtons.forEach(button => { button.disabled = true; });
  enable.disabled = true;
  connection.textContent = 'Đang kết nối với broker…';
  try {
    const active = connectBroker(message => {
      if (client !== active) return;
      connection.textContent = message;
      swingButtons.forEach(button => { button.disabled = true; });
    });
    client = active;
    const feedback = feedbackTopic(code, game);
    if (supportsVibration) {
      active.on('message', (receivedTopic, payload, packet) => {
        if (client !== active || receivedTopic !== feedback || packet.retain || payload.length > 64) return;
        const now = performance.now();
        if (now - lastVibration < 300) return;
        try {
          if (JSON.parse(payload.toString())?.hit !== true) return;
        } catch {
          return;
        }
        lastVibration = now;
        navigator.vibrate(35);
      });
    }
    active.on('connect', () => {
      if (client !== active) return;
      connection.textContent = 'Đã kết nối MQTT cho phòng ' + room + '.';
      enable.disabled = sensorsEnabled;
      swingButtons.forEach(button => { button.disabled = false; });
      if (supportsVibration) active.subscribe(feedback);
    });
  } catch (error) {
    connection.textContent = error.message;
  }
};

swingButtons.forEach(button => {
  button.onclick = () => hit(0.65, Number(button.dataset.direction));
});
enable.onclick = async () => {
  if (!isSecureContext) {
    sensor.textContent = 'Cảm biến cần một trang HTTPS.';
    return;
  }
  if (!window.DeviceMotionEvent) {
    sensor.textContent = 'Trình duyệt này không cung cấp cảm biến chuyển động.';
    return;
  }

  enable.disabled = true;
  try {
    if (typeof DeviceMotionEvent.requestPermission === 'function' &&
        await DeviceMotionEvent.requestPermission() !== 'granted') {
      throw new Error('Hãy cấp quyền chuyển động trong trình duyệt.');
    }
    sensorsEnabled = true;
    let receivedMotion = false;
    let readyToSwing = true;
    let lateral = 0;
    window.addEventListener('devicemotion', event => {
      const rate = event.rotationRate;
      if (!rate || ![rate.alpha, rate.beta, rate.gamma].some(Number.isFinite)) return;
      if (!receivedMotion) sensor.textContent = 'Cảm biến vung vợt đang hoạt động.';
      receivedMotion = true;
      const speed = Math.hypot(rate.alpha || 0, rate.beta || 0, rate.gamma || 0);
      const acceleration = event.acceleration?.x;
      // Screen-right is positive X when holding the phone upright facing the player.
      lateral = lateral * 0.6 + (Number.isFinite(acceleration) ? acceleration : 0) * 0.4;
      if (speed < 105) readyToSwing = true;
      if (speed >= 175 && readyToSwing && client?.connected) {
        readyToSwing = false;
        const direction = Math.sign(lateral) * Math.min(1, Math.max(0, Math.abs(lateral) - 0.6) / 3.2);
        hit(Math.min(1, speed / 480), direction);
        lateral = 0;
      }
    });
    sensor.textContent = 'Đang chờ dữ liệu cảm biến…';
    setTimeout(() => {
      if (!receivedMotion) sensor.textContent = 'Chưa nhận dữ liệu con quay. Bạn vẫn có thể dùng các nút chọn hướng.';
    }, 2500);
  } catch (error) {
    sensor.textContent = error.message;
    enable.disabled = false;
  }
};
