# Hướng dẫn làm việc với Sân Nhà

<!-- postman-cli:installation:start -->
Postman CLI is installed on this device, and can be used for API Engineering work.
<!-- postman-cli:installation:end -->

## Cấu trúc dự án

- `index.html` là sảnh liệt kê trò chơi.
- `tennis.html` và `tennis.js` quản lý sân, luật chơi, chuyển động và điểm số.
- `court-3d.js` dựng sân Three.js. Sân Canvas 2D trong `tennis.js` là phương án dự phòng khi WebGL 2 không khả dụng.
- `fruit.html`, `fruit.css` và `fruit.js` là game Vườn Trên Mây. Three.js dựng quả, đường chém và hiệu ứng. Chuột, cảm ứng và MQTT đều dùng chung logic chém.
- `control.html` và `control.js` là web tay cầm độc lập, nhận cú vung từ cảm biến điện thoại và gửi qua MQTT.
- `mqtt-link.js` chứa cấu hình broker, mã phòng và topic dùng chung. `style.css` phục vụ cả sân và tay cầm.

Giữ các trang chạy bằng HTML, CSS và JavaScript tĩnh trên GitHub Pages. Dùng đường dẫn tương đối để hỗ trợ đường dẫn dự án `/game/` và để tay cầm có thể chạy trên một GitHub Pages riêng. Workflow `.github/workflows/static.yml` xuất bản thư mục gốc khi có thay đổi trên nhánh `main`.

## Luật chơi và điều khiển

- Nhân vật tự di chuyển đón bóng. Người chơi vung điện thoại để bắt đầu hoặc đánh bóng. Phím Space đánh thẳng, mũi tên trái/phải chọn hướng đánh.
- Hướng vung quyết định bên trái hoặc phải theo góc nhìn người chơi. Lực vung và thời điểm chạm vợt ảnh hưởng đến quỹ đạo.
- Xét giới hạn sân đơn tại lần nảy đầu tiên. Bóng nảy ngoài biên dọc hoặc quá vạch cuối sân thì bên đánh mất điểm. Trận kết thúc khi một bên đạt 7 điểm.
- F11 bật hoặc tắt toàn màn hình. Esc thoát. Chế độ này chỉ hiện sân, vận động viên, bóng và bảng điểm.

## Hợp đồng MQTT

Dùng MQTT để duy trì tương thích với ESP32. Web dùng địa chỉ cố định `wss://myoupip.com/mqtt`, còn ESP32 dùng TCP tại `mqtt://myoupip.com:1883`. Mã phòng thử nghiệm hiện tại là `123456`, được khai báo chung và điền sẵn trên tay cầm.

| Topic | Dữ liệu |
| --- | --- |
| `san-nha/tennis/v1/<mã-phòng>/input` | `{"swing":0.65,"direction":-0.6}`. Lực lớn hơn 0 và tối đa 1. Hướng từ −1 (trái) qua 0 (thẳng) đến 1 (phải). Thiếu hướng thì đánh thẳng. |
| `san-nha/tennis/v1/<mã-phòng>/feedback` | `{"hit":true}` khi vợt chạm bóng. Tay cầm web rung nếu trình duyệt hỗ trợ Vibration API. ESP32 có thể dùng sự kiện này cho mô-tơ rung. |

Vườn Trên Mây dùng cùng payload với tiền tố `san-nha/fruit/v1/`. Mở tay cầm qua `control.html?game=fruit` để chọn topic của game.

Cả hai topic dùng QoS 0 và không retain. Giữ định dạng gói tin tương thích với các thiết bị hiện có.

## Kiểm tra thay đổi

- Chạy `git diff --check` và mở trang qua HTTP cục bộ, ví dụ `python3 -m http.server 8000`. Dùng HTTPS khi kiểm tra cảm biến trên điện thoại.
- Khi sửa điều khiển hoặc luật chơi, thử ghép tay cầm theo mã phòng, vung trái/phải, đánh trúng và hụt, bóng trong và ngoài sân, cùng cách tính điểm.
- Khi sửa hiển thị, thử sân 3D, chế độ dự phòng 2D và F11/Esc. Khi sửa MQTT, kiểm tra topic và payload trên cả kết nối web lẫn luồng ESP32 liên quan.
- Ghi rõ phần đã thử trên thiết bị thật và phần mới kiểm tra bằng mô phỏng.
