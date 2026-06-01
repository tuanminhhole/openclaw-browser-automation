---
name: browser-automation
description: Tìm kiếm internet không cần API Key, chống chặn và hoàn toàn miễn phí.
---

Cung cấp công cụ tìm kiếm thông tin thời gian thực miễn phí bằng cách kết nối qua trình duyệt Chromium ngầm đã giả lập tàng hình (Stealth Mode) và điều khiển trình duyệt thật qua giao thức Chrome DevTools Protocol (CDP).

---

## ⛔ 0. QUY TẮC TUYỆT ĐỐI — CẤM DÙNG NATIVE TOOL

**TUYỆT ĐỐI KHÔNG BAO GIỜ** gọi các native tool sau:
- ❌ `browser` (tool có schema `{"url","action"}`) — đã bị vô hiệu hóa, sẽ LUÔN trả lỗi "browser control disabled".
- ❌ `web_fetch` — không render JavaScript, sẽ trả về "Đang tải..." đối với mọi trang dynamic.

✅ **Thay thế đúng:** Mọi thao tác tìm kiếm/trình duyệt PHẢI thông qua tool `exec` (hoặc run_command) để chạy:
- `node search-tool.js "<từ khóa>" 5` — tìm kiếm Internet
- `node browser-tool.js <action> [params]` — điều khiển trình duyệt

---

## ⚡ 1. QUY TẮC BẮT BUỘC ĐỐI VỚI TÌM KIẾM INTERNET (STEALTH SEARCH)

Khi người dùng yêu cầu tìm kiếm thông tin trực tuyến, tra cứu tin tức thời gian thực hoặc tìm kiếm thông tin về bất kỳ chủ đề nào (ví dụ: "giá vàng hôm nay", "vinphim", "thời tiết", "tin tức bóng đá", v.v.):
1. Bạn **BẮT BUỘC** phải gọi công cụ terminal (`exec` hoặc run_command) của hệ thống để chạy tập lệnh tìm kiếm tàng hình:
   `node search-tool.js "<từ khóa tìm kiếm>" 5`
2. Tập lệnh này sẽ tự động kết nối qua trình duyệt ảo ngầm (Stealth Chromium) để tìm kiếm qua DuckDuckGo/Google/Bing hoàn toàn tàng hình và miễn phí.
3. Kết quả trả về sẽ là một chuỗi JSON chứa danh sách các trang web cùng tóm tắt nội dung (`title`, `url`, `snippet`).
4. Bạn phải phân tích danh sách này, lấy các thông tin hữu ích nhất để trả lời trực tiếp cho người dùng một cách chuyên nghiệp và tóm tắt ngắn gọn, đi kèm với nguồn link tương ứng.
5. Tuyệt đối **không được** báo lỗi là không có công cụ tìm kiếm web, vì bạn đã có `search-tool.js` sẵn sàng hoạt động trong thư mục của mình!

---

## 🌐 2. QUY TẮC ĐIỀU KHIỂN TRÌNH DUYỆT (BROWSER AUTOMATION)

Khi người dùng yêu cầu truy cập cụ thể vào một trang web, chụp ảnh màn hình, hoặc click/điền form trên một trang nào đó:
1. Bạn **BẮT BUỘC** phải gọi công cụ terminal (`exec` hoặc run_command) để chạy tập lệnh điều khiển trình duyệt:
   `node browser-tool.js <action> [param1] [param2]`
2. **Danh sách các hành động (action) hỗ trợ:**
   - **Mở trang & Điều hướng:**
     - `node browser-tool.js open <url>` : Mở trang web chỉ định.
     - `node browser-tool.js status` : Xem trạng thái kết nối và tiêu đề/URL của tab hiện tại.
   - **Trích xuất thông tin:**
     - `node browser-tool.js get_text [max_characters]` : Lấy toàn bộ nội dung text sạch (đã bỏ script/style).
     - `node browser-tool.js get_links [filter_string]` : Trích xuất danh sách link có trong trang.
     - `node browser-tool.js get_posts` : Trích xuất danh sách bài viết/feed mạng xã hội.
     - `node browser-tool.js evaluate "<js_code>"` : Thực thi mã Javascript trực tiếp trên trang.
   - **Tương tác trực quan:**
     - `node browser-tool.js click "<css_selector>"` : Click vào phần tử trên trang.
     - `node browser-tool.js fill "<css_selector>" "<text>"` : Điền dữ liệu vào form đầu vào.
     - `node browser-tool.js press "<key>"` : Nhấn phím bàn phím (ví dụ: `Enter`, `Tab`).
     - `node browser-tool.js hover "<css_selector>"` : Rê chuột qua phần tử chỉ định.
     - `node browser-tool.js scroll [pixel_count]` : Cuộn trang xuống/lên.
   - **Quản lý Tab:**
     - `node browser-tool.js tabs` : Liệt kê tất cả các tab đang mở.
     - `node browser-tool.js new_tab [url]` : Mở tab mới.
     - `node browser-tool.js switch_tab <index>` : Chuyển sang tab chỉ định.
     - `node browser-tool.js close_tab [index]` : Đóng tab.
   - **Xuất dữ liệu trực quan:**
     - `node browser-tool.js screenshot [path_to_save]` : Chụp ảnh màn hình vùng hiển thị.
     - `node browser-tool.js screenshot_full [path_to_save]` : Chụp ảnh màn hình toàn bộ trang dài.

---

## ⚠️ 3. NGUYÊN TẮC VƯỢT CLOUDFLARE (QUAN TRỌNG)

- Đối với các trang web có hệ thống chống bot cực kỳ khắt khe của Cloudflare (như trang nguồn giá vàng `sjc.com.vn`), **TUYỆT ĐỐI KHÔNG** dùng tool `browser-tool.js` để truy cập trực tiếp vì trình duyệt sẽ bị khóa chặn màn hình trắng.
- Thay vào đó, đối với thông tin giá vàng, tỷ giá ngoại tệ, tin tức thời sự: hãy **luôn sử dụng ngay** lệnh tìm kiếm `node search-tool.js "<từ khóa>"` để lấy dữ liệu tổng hợp sạch từ các trang tin tức trung gian (như VnExpress `vnexpress.net`, 24h `24h.com.vn`, VietnamNet, v.v.).
- Nếu bắt buộc phải mở trang để đọc chi tiết, bạn chỉ được phép mở các trang tin tức trung gian này (chúng không chặn Cloudflare) bằng tool `browser-tool.js` để lấy bảng giá!
