# Sân Nhà

Web HTML tĩnh cho GitHub Pages. Trong phần **Settings → Pages** của repository,
chọn nhánh chứa các tệp và thư mục gốc làm nguồn xuất bản. Mở trang Pages để
vào sảnh từ `index.html`.

## Chơi tennis

1. Trên máy tính, mở **Vào sân**. Mã phòng hiện ngay và sân tự kết nối MQTT.
2. Trên điện thoại, mở riêng trang `control.html` bằng HTTPS và bấm
   **Vào phòng**. Mã phòng thử nghiệm `123456` được điền sẵn.
   Có thể đặt trang tay cầm trên một GitHub Pages riêng bằng cách đăng
   `control.html`, `control.js`, `mqtt-link.js` và `style.css` lên đó
   (đổi `control.html` thành `index.html` nếu muốn mở từ URL gốc).
3. Bật cảm biến và cấp quyền nếu được hỏi. Vung cổ tay để bắt đầu trận.
   Nhân vật tự chạy đón bóng. Vung khi vòng đón bóng hiện trên sân,
   và vung theo hướng muốn đánh. Tay cầm cũng có nút **Trái**, **Thẳng** và **Phải**.
4. Có thể dùng Space để bắt đầu hoặc đánh thẳng, phím mũi tên để đánh sang hai bên. Ai đạt 7
   điểm trước sẽ thắng.

## MQTT

Hai trang dùng cố định `wss://myoupip.com/mqtt`, khai báo chung trong
`mqtt-link.js`. GitHub Pages dùng HTTPS nên trình duyệt cần listener MQTT
qua WebSocket TLS. Cổng TCP `mqtt://myoupip.com:1883` dành cho client TCP.

Hai trang dùng MQTT 3.1.1 và MQTT.js từ jsDelivr. Sân đăng ký topic
`san-nha/tennis/v1/<mã-phòng>/input`, tay cầm gửi lực vung
vào topic đó ở QoS 0. Mã phòng thử nghiệm dùng chung là `123456` và hiển thị trên sân.
Cấu hình này dùng kết nối MQTT không kèm thông tin xác thực. Broker cần
cho phép publish và subscribe trên topic đó.

Đã xác minh gửi và nhận MQTT qua WSS, đồng thời xác minh gói gửi từ cổng
TCP 1883 được nhận qua WSS trên cùng topic. ESP32 có thể dùng đúng mã phòng
đang hiện trên sân rồi publish `{"swing":0.65,"direction":-0.6}` để đánh.
`swing` lớn hơn 0 và tối đa 1. `direction` từ −1 (trái) qua 0 (thẳng)
đến 1 (phải). Gói chỉ có `swing` mặc định đánh thẳng. Gửi ở QoS 0 và tắt retain.

Khi vợt chạm bóng, sân gửi `{"hit":true}` vào
`san-nha/tennis/v1/<mã-phòng>/feedback` ở QoS 0, không retain. Tay cầm web
rung ngắn nếu trình duyệt hỗ trợ Vibration API. ESP32 cũng có thể đăng ký
topic này để điều khiển mô-tơ rung.

Cơ chế đấu tennis với máy và đánh bằng chuyển động lấy cảm hứng từ
[Wibbly](https://vulos.org/projects/wibbly/). Sân, hình ảnh và mã game được
viết riêng. Tay cầm dùng `DeviceMotionEvent.rotationRate` để nhận cú vung và gia tốc ngang
để ước lượng hướng khi giữ điện thoại dọc.

Sân 3D dùng Three.js qua jsDelivr. Máy cần WebGL 2 để hiển thị sân 3D.
Nếu thư viện không tải hoặc thiết bị mất WebGL, trang chuyển sang sân 2D.
