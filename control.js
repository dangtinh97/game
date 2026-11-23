import { connectBroker, defaultRoom, normalizeRoom, topic, validRoom } from './mqtt-link.js';

const join = document.querySelector('#join');
const roomInput = document.querySelector('#room');
roomInput.value = defaultRoom;
let room;
const connection = document.querySelector('#connection');
const sensor = document.querySelector('#sensor');
const enable = document.querySelector('#enable');
const swing = document.querySelector('#swing');
let client;
let sensorsEnabled = false;
let lastSwing = -Infinity;

function publish(input) {
  if (client?.connected) client.publish(topic(room), JSON.stringify(input));
}

function hit(strength = 0.65) {
  const now = performance.now();
  if (now - lastSwing < 420) return;
  lastSwing = now;
  publish({ swing: strength });
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
  swing.disabled = true;
  enable.disabled = true;
  connection.textContent = 'Đang kết nối với broker…';
  try {
    const active = connectBroker(message => {
      if (client !== active) return;
      connection.textContent = message;
      swing.disabled = true;
    });
    client = active;
    active.on('connect', () => {
      if (client !== active) return;
      connection.textContent = 'Đã kết nối MQTT cho phòng ' + room + '.';
      enable.disabled = sensorsEnabled;
      swing.disabled = false;
    });
  } catch (error) {
    connection.textContent = error.message;
  }
};

swing.onclick = () => hit();
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
    window.addEventListener('devicemotion', event => {
      const rate = event.rotationRate;
      if (!rate || ![rate.alpha, rate.beta, rate.gamma].some(Number.isFinite)) return;
      if (!receivedMotion) sensor.textContent = 'Cảm biến vung vợt đang hoạt động.';
      receivedMotion = true;
      const speed = Math.hypot(rate.alpha || 0, rate.beta || 0, rate.gamma || 0);
      if (speed < 105) readyToSwing = true;
      if (speed >= 175 && readyToSwing && client?.connected) {
        readyToSwing = false;
        hit(Math.min(1, speed / 480));
      }
    });
    sensor.textContent = 'Đang chờ dữ liệu cảm biến…';
    setTimeout(() => {
      if (!receivedMotion) sensor.textContent = 'Chưa nhận dữ liệu con quay. Bạn vẫn có thể dùng nút đánh bóng.';
    }, 2500);
  } catch (error) {
    sensor.textContent = error.message;
    enable.disabled = false;
  }
};
