export const topic = room => `san-nha/tennis/v1/${room}/input`;
const defaultBroker = 'wss://myoupip.com/mqtt';
export const validRoom = room => /^[1-9]{6}$/.test(room);
export const normalizeRoom = value => value.trim();

export const defaultRoom = '123456';

export function connectBroker(status) {
  if (!globalThis.mqtt) throw new Error('Không tải được thư viện MQTT. Kiểm tra kết nối mạng.');
  const client = globalThis.mqtt.connect(defaultBroker, {
    protocolVersion: 4,
    clean: true,
    reconnectPeriod: 3000,
    connectTimeout: 8000,
    queueQoSZero: false
  });
  client.on('error', error => status(`Lỗi MQTT: ${error.message}`));
  client.on('reconnect', () => status('Đang kết nối lại với broker…'));
  client.on('offline', () => status('Đã mất kết nối với broker.'));
  return client;
}
