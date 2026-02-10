# Hướng dẫn Cấu hình Dịch vụ Email (Nodemailer)

Vì bạn đã chuyển sang dùng dịch vụ email tùy chỉnh (không dùng Supabase Email), bạn cần cấu hình một tài khoản email gửi đi.

## 1. Sử dụng Gmail (Khuyên dùng và Dễ nhất)

Để gửi email từ Gmail, bạn cần tạo một **App Password** (Mật khẩu ứng dụng).

### Các bước thực hiện:
1.  Truy cập [Google Account Security](https://myaccount.google.com/security).
2.  Bật **2-Step Verification** (Xác minh 2 bước) nếu chưa bật.
3.  Tìm mục **App passwords** (Mật khẩu ứng dụng). 
    *   *Mẹo: Bạn có thể gõ "App passwords" vào thanh tìm kiếm của trang cài đặt Google Account.*
4.  Tạo một App Password mới:
    *   **App name:** Nhập "Xpiano Server" hoặc tên bất kỳ.
    *   Nhấn **Create**.
5.  Google sẽ cấp cho bạn một chuỗi ký tự 16 chữ cái (ví dụ: `abcd efgh ijkl mnop`). **Hãy copy chuỗi này.**

## 2. Cập nhật file `.env`

Mở file `.env` trong thư mục `XpianoServer` và thêm/sửa các dòng sau:

```env
EMAIL_USER=dia_chi_email_cua_ban@gmail.com
EMAIL_PASS=mat_khau_ung_dung_vua_lay
```

*(Lưu ý: `EMAIL_PASS` là mật khẩu ứng dụng 16 ký tự, KHÔNG PHẢI mật khẩu đăng nhập Gmail thường)*

---

## 3. Nếu dùng dịch vụ khác (SendGrid, Mailgun...)

Nếu bạn muốn dùng SendGrid, bạn chỉ cần thay đổi cấu hình `host` và `auth` trong file `utils/emailService.js`.

Ví dụ với SendGrid:
1.  Đăng ký tài khoản SendGrid.
2.  Tạo API Key.
3.  Cập nhật `.env`:
    ```env
    EMAIL_USER=apikey
    EMAIL_PASS=SG.xxxxxxxxxxxxxxxxxxxxxx
    ```
4.  Sửa `emailService.js` để dùng SMTP host của SendGrid (`smtp.sendgrid.net`).

---
Sau khi cấu hình xong, hãy khởi động lại server (`npm run dev`) để áp dụng thay đổi.
