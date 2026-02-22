# Tài liệu API (API Documentation) cho Đội ngũ Flutter
Phiên bản: 2.1.0
Ngày cập nhật: 22/02/2026

Tài liệu này tổng hợp toàn bộ các API Backend của dự án Xpiano, được nhóm theo các tính năng logic để đội ngũ Frontend (Flutter Mobile App) dễ dàng theo dõi và tích hợp.

**Tổng số API endpoints: 140**

## Thông tin chung
- **Base URL (Local):** `http://<YOUR_LOCAL_IP>:3000/api` (Dùng IP của máy tính thay vì localhost cho Mobile Device)
- **Base URL (Production):** Sẽ được cấp khi deploy.
- **Xác thực (Authentication):** Đa số các API yêu cầu gửi Token trên Header:
  ```http
  Authorization: Bearer <access_token>
  ```
- Các API đánh dấu `(Tùy chọn Auth)` có thể mở tự do, nhưng nếu gửi kèm Token sẽ trả thêm quyền lợi (ví dụ: xem trạng thái đã thích học piano chưa).
- Các API đánh dấu `(Yêu cầu Auth)` bắt buộc phải có Token, nếu không sẽ trả về lỗi `401 Unauthorized`.

---

## Danh mục các nhóm API (API Groups)
1. Xác thực & Tài khoản người dùng (Authentication & User Profile)
2. Cửa hàng Piano & Yêu thích (Pianos & Favorites)
3. Khóa học & Phiên học Livestream (Courses & Sessions)
4. Thanh toán, Đơn hàng & Ví (Orders, Payments & Wallet)
5. Mạng xã hội, Bài viết & Tin nhắn (Social, Posts & Messages)
6. Giáo viên & Tiếp thị liên kết (Teacher Profile & Affiliate)
7. Tệp đính kèm & Thông báo (Uploads & Notifications)
8. Quản trị, Phân tích, Kiểm duyệt & Báo cáo (Admin, Analytics & Moderation)

**Tổng số API trong hệ thống: 140 endpoints**

---

## 1. Xác thực & Tài khoản người dùng (Authentication & User Profile)
**Base Path:** `/api/auth` và `/api/users`

### Xác thực chung (Public)
- `POST /api/auth/register` : Đăng ký tài khoản (Deprecated, thay bằng OTP).
- `POST /api/auth/login` : Đăng nhập bằng Email/Password.
- `POST /api/auth/send-otp` : Gửi mã OTP về email.
- `POST /api/auth/register-verify` : Xác thực đăng ký mới qua mã OTP.
- `POST /api/auth/login-otp` : Đăng nhập không mật khẩu bằng OTP.
- `POST /api/auth/forgot-password` : Yêu cầu lấy lại mật khẩu (gửi OTP).
- `POST /api/auth/reset-password` : Xác nhận OTP đổi mật khẩu mới.
- `POST /api/auth/refresh` : Làm mới Access Token bằng Refresh Token.

### Dành cho Admin Đăng nhập (Public)
- `POST /api/auth/admin-login` : Đăng nhập tài khoản hệ thống cho Admin.
- `POST /api/auth/admin-register` : Đăng ký tài khoản Admin (tùy cài đặt).

### Quản lý Hồ sơ đang đăng nhập (Yêu cầu Auth)
- `GET /api/auth/me` : Trả về thông tin Profile cá nhân hiện tại.
- `PUT /api/auth/profile` : Cập nhật thông tin Profile cá nhân.
- `PUT /api/auth/change-password` : Đổi mật khẩu.
- `POST /api/auth/logout` : Đăng xuất.

---

## 2. Cửa hàng Piano & Yêu thích (Pianos & Favorites)
**Base Path:** `/api/pianos` và `/api/favorites`

### Piano Catalog
- `GET /api/pianos` : Danh sách các sản phẩm Piano. (Public)
- `GET /api/pianos/:id` : Chi tiết một cây Piano. (Public)
- `GET /api/pianos/stats` : Lấy số liệu thống kê chung. (Public)
- `POST /api/pianos` : Tạo mới sản phẩm Piano (Yêu cầu Auth, role Admin).
- `PUT /api/pianos/:id` : Cập nhật thông tin Piano (Yêu cầu Auth).
- `DELETE /api/pianos/:id` : Xóa Piano (Yêu cầu Auth).

### Yêu thích (Favorites)
- `GET /api/favorites/count/:pianoId` : Xem số lượt thích của 1 Piano (Public).
- `GET /api/favorites/check/:pianoId` : Kiểm tra xem user hiện tại đã thích Piano này chưa (Yêu cầu Auth).
- `GET /api/favorites` : Xem danh sách các Piano đã lưu yêu thích của user (Yêu cầu Auth).
- `POST /api/favorites/:pianoId` : Thích một Piano (Yêu cầu Auth).
- `DELETE /api/favorites/:pianoId` : Bỏ thích (Yêu cầu Auth).

---

## 3. Khóa học & Phiên học Livestream (Courses & Sessions)
**Base Path:** `/api/courses` và `/api/sessions`

### Khóa học (Courses)
- `GET /api/courses` : Danh sách khóa học có trên hệ thống (Tùy chọn Auth).
- `GET /api/courses/:id` : Xem chi tiết nội dung khoa học (Tùy chọn Auth).
- `GET /api/courses/teacher/:teacherId` : Xem danh sách khóa dạy của một giáo viên cụ thể (Tùy chọn Auth).

*Các tính năng cá nhân trong khóa học (Yêu cầu Auth):*
- `GET /api/courses/me/enrolled` : Danh sách các khóa học Learner đã tham gia (đã mua).
- `GET /api/courses/me/teaching` : Danh sách các khóa học mình đang dạy (Dành cho Teacher).
- `GET /api/courses/:id/enrollments` : Xem các thành viên đã tham gia lớp của mình.
- `POST /api/courses` : Tạo khóa học mới.
- `PUT /api/courses/:id` : Chỉnh sửa nội dung khóa học.
- `POST /api/courses/:id/publish` : Phát hành (xuất bản) khóa học sau khi soạn xong.
- `GET /api/courses/admin/stats` : Thống kê tổng quan khóa học (Yêu cầu Auth, Admin only).

### Phiên học Livestream (Sessions)
- `GET /api/sessions` : Danh sách toàn bộ lịch Live Sessions (Tùy chọn Auth).
- `GET /api/sessions/:id` : Thông tin chi tiết một Session (Tùy chọn Auth).

*Điều khiển Phiên học & Phòng Livestream (Yêu cầu Auth):*
- `POST /api/sessions` : Lên lịch một Session.
- `PUT /api/sessions/:id` : Cập nhật Session.
- `DELETE /api/sessions/:id` : Xóa lịch Session.
- `POST /api/sessions/:id/start` : Bắt đầu Livestream Session (Host/Teacher).
- `POST /api/sessions/:id/join` : Diễn ra khi User bấm vào xem/tham gia.
- `POST /api/sessions/:id/leave` : Khi người dùng rời khỏi phiên.
- `POST /api/sessions/:id/end` : Kết thúc Live Session.
- `GET /api/sessions/:id/participants` : Xem những ai đang tham gia.

*Chat & Livestream Multi-camera (Yêu cầu Auth):*
- `GET /api/sessions/:id/chat` : Lịch sử tin nhắn Chat trực tiếp.
- `POST /api/sessions/:id/chat` : Gửi một tin nhắn vào phòng chat.
- `GET` & `PUT /api/sessions/:id/room-config` : Cấu hình room multi-cam.
- `GET`, `POST`, `PUT /api/sessions/:id/tracks` : Quản lý track Video streaming.

---

## 4. Thanh toán, Đơn hàng & Ví (Orders, Payments & Wallet)
**Base Path:** `/api/orders`, `/api/wallet` và `/api/sepay-webhook`

### Đơn hàng (Orders - Yêu cầu Auth)
- `GET /api/orders/my-orders` : Lịch sử giao dịch, đơn mua hàng/khóa học cá nhân.
- `GET /api/orders/active-rentals` : Những đơn thuê Piano đang kích hoạt.
- `POST /api/orders` : Tạo đơn hàng mới (mua khóa học, mua piano, thuê đàn).
- `POST /api/orders/:id/cancel` : Hủy đơn hàng.
- `GET /api/orders/:id/status` : Kiểm tra trạng thái thanh toán đơn hàng.

*Admin endpoints (Yêu cầu Admin Role):*
- `GET /api/orders/stats` : Thống kê tổng quan đơn hàng.
- `GET /api/orders` : Danh sách tất cả đơn hàng (Admin).
- `PUT /api/orders/:id/status` : Cập nhật trạng thái đơn hàng thủ công (Admin).

### Webhook tự động nhận tiền (No Auth)
- `POST /api/sepay-webhook` : Dùng cho SePay Webhook tự động cập nhật Status Đơn hàng & nạp tiền hệ thống, Client không cần gọi.

### Ví nội bộ (Wallet - Yêu cầu Auth)
- `GET /api/wallet/my-wallet` : Lấy số dư ví của tài khoản thực dùng & lịch sử giao dịch.
- `POST /api/wallet/withdraw` : Tạo yêu cầu Rút Số dư ví ra ngân hàng cá nhân.

*Admin endpoints (Yêu cầu Admin Role):*
- `GET /api/wallet/admin/requests` : Lấy danh sách yêu cầu rút tiền đang pending.
- `POST /api/wallet/admin/process-request` : Xử lý yêu cầu rút tiền (approve/reject).
- `POST /api/wallet/admin/add-funds` : Nạp tiền thủ công vào ví user.

---

## 5. Mạng xã hội, Bài viết & Tin nhắn (Social, Posts & Messages)
**Base Path:** `/api/social`, `/api/posts`, `/api/messages`

### Mạng xã hội (Social Connections)
- `POST /api/social/users/:id/follow` : Follow một người dùng (Yêu cầu Auth).
- `DELETE /api/social/users/:id/follow` : Hủy follow (Yêu cầu Auth).
- `GET /api/social/users/search` : Tìm kiếm người dùng (tên, thông tin). (Yêu cầu Auth).
- `GET /api/social/users/:id/followers` : Xem danh sách người theo dõi. (Tùy chọn Auth).
- `GET /api/social/users/:id/following` : Xem danh sách đang theo dõi. (Tùy chọn Auth).
- `GET /api/social/users/:id/public` : Xem thông tin trang cá nhân public của một người dùng.

- `GET /api/social/teachers` : Danh sách thầy cô giáo (gợi ý/public).
- `GET /api/social/teachers/:id/public` : Trang cá nhân (profile giáo viên) chi tiết của teacher. (Tùy chọn Auth).
- `GET /api/social/teachers/:id/courses` : Khóa học giáo viên quản lý.
- `GET /api/social/teachers/:id/reviews` : Đánh giá review từ người học cũ.

### Bài viết, Dòng thời gian & Tương tác (Posts)
- `GET /api/posts/feed` : Nhận nội dung dòng thời gian (Bản tin). (Tùy chọn Auth).
- `GET /api/posts/user/:userId` : Nhận list danh sách bài đăng của một người định. (Tùy chọn Auth).
- `GET /api/posts/:id` : Nội dung chi tiết một bài viết. (Tùy chọn Auth).
- `POST /api/posts` : Đăng bài mới (Yêu cầu Auth).
- `PUT /api/posts/:id` : Sửa/Cập nhật thông tin bài đăng (Yêu cầu Auth).
- `DELETE /api/posts/:id` : Xóa bài đăng (Yêu cầu Auth).

*Like & Bình luận (Yêu cầu Auth để thực hiện lệnh):*
- `POST /api/posts/:id/like` : Thích bài viết.
- `DELETE /api/posts/:id/like` : Bỏ thích (Unlike).
- `GET /api/posts/:id/comments` : Lấy danh sách Comments (Public).
- `POST /api/posts/:id/comments` : Viết Comment vào bài viết.
- `GET /api/social/comments/:id/replies` : Lấy trả lời của 1 comment cụ thể.
- `DELETE /api/social/comments/:id` : Xóa một comment cá nhân (Auth).

### Chat trực tiếp cá nhân (Messages - Yêu cầu Auth hoàn toàn)
- `POST /api/messages/conversations` : Bắt đầu/Tạo cuộc trò chuyện 1-1.
- `GET /api/messages/conversations` : Xem hòm thư nhắn tin và danh sách bạn chat.
- `GET /api/messages/conversations/:id/messages` : Tải tin nhắn của một khung hộp thoại.
- `POST /api/messages/conversations/:id/messages` : Gửi một dòng text/ảnh.
- `DELETE /api/messages/:id` : Xóa/Thu hồi tin nhắn.

---

## 6. Giáo viên & Tiếp thị liên kết (Teacher Profile & Affiliate)
**Base Path:** `/api/teacher`, `/api/affiliate`

### Tính năng Giáo viên (Role: Teacher - Yêu cầu Auth)
- `GET /api/teacher/profile` : Lấy hồ sơ nội bộ.
- `POST /api/teacher/profile` : Gửi hồ sơ đăng ký tham gia làm giáo viên.
- `GET /api/teacher/courses` : Truy cập vào CMS khóa học do teacher đảm trách.
- `POST /api/teacher/courses` : Khởi tạo khóa dạy.
- `GET /api/teacher/stats` : Bảng thống kê thu nhập và sinh viên theo dõi.

### Tính năng Affiliate (Yêu cầu Auth)
- `POST /api/affiliate/register` : Yêu cầu cấp mã tiếp thị cho bản thân.
- `GET /api/affiliate/me` : Điểm thưởng kiếm được, % hoa hồng, thống kê số lượng mời.

*Admin endpoints (Yêu cầu Admin Role):*
- `GET /api/affiliate/admin/commissions` : Lấy danh sách commissions toàn hệ thống.
- `POST /api/affiliate/admin/approve-commission` : Duyệt hoa hồng và chuyển tiền tự động.
- `POST /api/affiliate/admin/create-commission` : Tạo hoa hồng thủ công cho referral code.

---

## 7. Các tiện ích khác (Uploads & Notifications)
**Base Path:** `/api/upload`, `/api/notifications`

### Thông báo App (Notifications - Yêu cầu Auth)
- `GET /api/notifications` : Danh sách chuông thông báo.
- `GET /api/notifications/unread-count` : Đếm số Notify đỏ chưa đọc tính bằng số nguyên.
- `PUT /api/notifications/:id/read` : Đánh dấu 1 notify là đã xem.
- `PUT /api/notifications/read-all` : Đánh dấu Toàn bộ là đã xem.
- `DELETE /api/notifications/:id` : Xóa bỏ notification.

### Media Upload (Yêu cầu Auth)
- `POST /api/upload/sign` : Sinh PreSigned URL an toàn để Mobile gửi file ảnh lên các Storage Server mà không qua backend.
- `DELETE /api/upload/file` : Yêu cầu loại bỏ file Media cá nhân thừa.

---

## 8. Quản trị & Hệ thống (Admin Only) (Chủ yếu dành cho web Dashboard, nhưng app có thể tích hợp nếu cần)

### Quản lý User (User Management - Admin only)
**Base Path:** `/api/users`
**Yêu cầu Auth & Role: Admin**
- `GET /api/users/stats` : Thống kê tổng quan về users.
- `GET /api/users` : Danh sách tất cả users.
- `GET /api/users/:id` : Chi tiết một user.
- `POST /api/users` : Tạo user mới (Admin).
- `PUT /api/users/:id` : Cập nhật thông tin user.
- `DELETE /api/users/:id` : Xóa user.

*Quản lý Teacher Profiles:*
- `GET /api/users/teacher-profiles` : Danh sách hồ sơ giáo viên đang chờ duyệt.
- `PUT /api/users/teacher-profiles/:id/approve` : Phê duyệt giáo viên.
- `PUT /api/users/teacher-profiles/:id/reject` : Từ chối hồ sơ.
- `PUT /api/users/teacher-profiles/:id/revoke` : Thu hồi quyền giáo viên.

### Admin Dashboard & Content Moderation
**Base Path:** `/api/admin`
**Yêu cầu Auth & Role: Admin**
- `GET /api/admin/dashboard` : Trang tổng quan, dashboard thống kê toàn hệ thống.
- `GET /api/admin/users` : Danh sách users để quản lý.
- `GET /api/admin/users/:id` : Chi tiết user.
- `GET /api/admin/posts` : Danh sách bài viết để kiểm duyệt.
- `DELETE /api/admin/posts/:id` : Xóa bài viết vi phạm.
- `DELETE /api/admin/comments/:id` : Xóa comment vi phạm.
- `GET /api/admin/sessions` : Danh sách các phiên livestream.
- `DELETE /api/admin/sessions/:id` : Chấm dứt phiên livestream (nếu có nội dung không phù hợp).

### Analytics & Reporting
**Base Path:** `/api/analytics`
**Yêu cầu Auth**

*Theo dõi phiên học (Session Analytics):*
- `POST /api/analytics/sessions/:sessionId/join` : Ghi nhận user join session.
- `PUT /api/analytics/sessions/:sessionId/leave` : Ghi nhận user leave session.
- `GET /api/analytics/sessions/:sessionId` : Xem phân tích của một session (thời gian, attendance, etc).

*Session Recordings:*
- `POST /api/analytics/sessions/:sessionId/recordings` : Lưu thông tin recording.
- `GET /api/analytics/sessions/:sessionId/recordings` : Lấy danh sách recordings của session.

*User Learning Statistics:*
- `GET /api/analytics/users/me` : Thống kê học tập của bản thân.
- `GET /api/analytics/users/:userId` : Xem thống kê học tập của user khác (Teacher/Admin).

### Moderation & Reports
**Base Path:** `/api/moderation`

*User-facing (Yêu cầu Auth):*
- `POST /api/moderation/reports` : Gửi báo cáo vi phạm (report user/post/comment).
- `GET /api/moderation/reports/mine` : Xem các báo cáo mình đã gửi.

*Admin-only (Yêu cầu Auth & Admin Role):*
- `GET /api/moderation/admin/reports` : Danh sách tất cả báo cáo đang chờ xử lý.
- `PUT /api/moderation/admin/reports/:id` : Xem xét và xử lý báo cáo.
- `GET /api/moderation/admin/stats` : Thống kê về moderation.

---
**Hướng dẫn Dành cho AI Agent Phát Triển Flutter:**
1. Hãy đóng gói tất cả thành một RestClient Service thống nhất, sử dụng `dio` package hỗ trợ cấu hình Base-URL và interceptors truyền Token dễ nhất.
2. Tại các Endpoint "Yêu cầu Auth", khi request status Code trả logic HTTP 401 thì hãy Force User Logout và push Navigation trở lại giao diện `LoginScreen`.
3. Có xử lý Loading Error, Dialog thông báo khi API lỗi Timeout/500/No Internet.
