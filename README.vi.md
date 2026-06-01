# OpenClaw Smart Search & Browser Automation Plugin 🌐

Plugin tích hợp Tìm kiếm mạng thông minh (chống chặn Cloudflare, không cần API Key, hoàn toàn miễn phí) và tự động hóa trình duyệt (Chrome CDP) dành cho OpenClaw.

## 🚀 Tính năng nổi bật

1. **Tìm kiếm thông minh (`search-tool.js`)**: 
   - Miễn phí hoàn toàn, không yêu cầu API Key.
   - Vượt qua các lớp chống bot của Cloudflare bằng trình duyệt Chromium ngầm đã giả lập chế độ ẩn danh (Stealth Mode).
   - Sử dụng công cụ tổng hợp tin tức DuckDuckGo / Google cực kỳ tối ưu.
2. **Tự động hóa trình duyệt (`browser-tool.js`)**:
   - Kết nối trực tiếp qua giao thức Chrome DevTools Protocol (CDP).
   - Điều khiển trình duyệt Chrome thật trên máy tính hoặc chạy ngầm hoàn toàn độc lập trong Docker container.
   - Hỗ trợ các lệnh: chụp ảnh màn hình, điền form, click chuột, cuộn trang, trích xuất text sạch, cào bài viết/feed mạng xã hội.
3. **Đồng bộ tự động (Automated Provisioning)**:
   - Tự động sao chép các tệp công cụ (`search-tool.js`, `browser-tool.js`), file chạy Chrome debug (`start-chrome-debug`), và tài liệu hướng dẫn (`SKILL.md`, `BROWSER.md`) vào thư mục workspace của **tất cả các bot** đang hoạt động trong dự án khi khởi động.
   - Tự động vá hướng dẫn `TOOLS.md` của từng bot một cách đồng bộ.

## 📦 Hướng dẫn cài đặt

Cài đặt trực tiếp qua ClawHub:

```bash
openclaw plugins install clawhub:openclaw-browser-automation
```

Hoặc tải mã nguồn về thư mục `.openclaw/extensions/`:

```bash
git clone https://github.com/tuanminhhole/openclaw-browser-automation.git .openclaw/extensions/browser-automation
```

## 🛠️ Sử dụng

Sau khi kích hoạt, bot sẽ tự động nhận diện và có thể gọi các lệnh thông qua terminal (`exec`):

```bash
# 🔍 Tìm kiếm mạng
node search-tool.js "giá vàng hôm nay" 5

# 🌐 Điều khiển trình duyệt
node browser-tool.js open "https://vnexpress.net"
node browser-tool.js get_text
node browser-tool.js screenshot
```

## 📄 Bản quyền

MIT
