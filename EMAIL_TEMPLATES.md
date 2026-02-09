### Cấu hình Supabase Email Templates

Để tính năng gửi mã OTP hoạt động đúng, bạn cần vào **Supabase Dashboard > Authentication > Email Templates** và cập nhật nội dung các mẫu email sau:

1.  **Confirm Your Signup (Xác nhận đăng ký)**
    *   **Subject:** `Mã xác thực đăng ký tài khoản Xpiano`
    *   **Message Body:**
        ```html
        <h2>Xin chào,</h2>
        <p>Mã xác thực đăng ký tài khoản Xpiano của bạn là:</p>
        <h1 style="color: #F0C058; font-size: 32px;">{{ .Token }}</h1>
        <p>Mã này sẽ hết hạn trong 5 phút.</p>
        ```

2.  **Reset Password (Đặt lại mật khẩu)**
    *   **Subject:** `Mã xác thực đặt lại mật khẩu`
    *   **Message Body:**
        ```html
        <h2>Xin chào,</h2>
        <p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.</p>
        <p>Mã xác thực của bạn là:</p>
        <h1 style="color: #F0C058; font-size: 32px;">{{ .Token }}</h1>
        <p>Nếu bạn không yêu cầu điều này, xin vui lòng bỏ qua email này.</p>
        ```

**Lưu ý:** Nếu bạn không cập nhật template, người dùng có thể sẽ nhận được một đường link (Magic Link) thay vì mã số, và ứng dụng sẽ không thể xác thực được.
