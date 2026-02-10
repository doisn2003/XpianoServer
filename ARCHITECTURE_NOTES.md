# Kiến trúc Hệ thống & Xác thực Xpiano

## 1. Cơ chế Lưu trữ User đồng bộ

Để đảm bảo tính nhất quán giữa Web App và Mobile App, thông tin người dùng được lưu trữ song song tại 3 vị trí, với `auth.users` của Supabase là nguồn gốc (Source of Truth) cho Authentication.

### Cấu trúc bảng
1.  **`auth.users` (Supabase System)**: 
    *   Lưu thông tin đăng nhập (email, encrypted password, phone).
    *   ID là UUID, được sinh ra khi tạo user.
    *   **QUAN TRỌNG:** Đây là bảng chính để xác thực.

2.  **`public.profiles`**:
    *   Bảng mở rộng thông tin người dùng (Avatar, Full Name, Role...).
    *   Liên kết 1-1 với `auth.users` qua `id`.
    *   Được sử dụng bởi Web App để hiển thị thông tin.

3.  **`public.users` (Legacy/Mobile Sync)**:
    *   Một số hệ thống cũ hoặc Mobile App có thể query bảng này.
    *   **YÊU CẦU BẮT BUỘC:** Mọi user mới tạo PHẢI được insert/sync vào bảng này để app mobile hoạt động đúng.
    *   ID của bảng này PHẢI GIỐNG với ID của `auth.users`.

### Luồng Đăng ký (Register Flow)
Khi người dùng đăng ký qua API `/api/auth/register-verify`:
1.  Xác thực OTP từ local DB.
2.  Tạo user trong `auth.users` bằng `supabaseAdmin`.
3.  **Sync ngay lập tức** sang `public.profiles`.
4.  **Sync ngay lập tức** sang `public.users`.
5.  Xóa OTP và tự động đăng nhập.

---

## 2. Phân quyền & Supabase Admin

### Vấn đề Permission
Lỗi `permission denied` hoặc `violates row-level security policy` thường xảy ra khi Backend (Node.js) cố gắng thao tác dữ liệu của người dùng mà không có quyền đầy đủ, hoặc RLS (Row Level Security) của Supabase chặn lại.

### Nguyên tắc Vàng (Golden Rule)
> **Backend Serivce (Node.js) LUÔN LUÔN sử dụng `supabaseAdmin` (Service Role Key) cho các tác vụ ghi (Create/Update/Delete) liên quan đến User khác.**

*   **KHÔNG** dùng `supabase` client thường (Anon key) để tạo user hay sửa đổi dữ liệu nhạy cảm.
*   **KHÔNG** phụ thuộc vào RLS policy ở phía Client khi code Backend. Backend có quyền tối cao (God Mode) thông qua `supabaseAdmin`.

### Các tác vụ cần dùng `supabaseAdmin`:
1.  **Tạo User mới:** `supabaseAdmin.auth.admin.createUser(...)`
2.  **Duyệt đơn hàng/Thanh toán:** Khi admin thay đổi trạng thái đơn hàng của user khác.
3.  **Sync dữ liệu User:** Khi ghi vào `public.users` hoặc `public.profiles` mà không phải chính user đó đang logged in.

## 3. Checklist cho AI Agent
Khi code tính năng mới, hãy kiểm tra:
- [ ] Nếu tạo User: Có sync sang `public.users` chưa?
- [ ] Nếu sửa User: Có dùng `supabaseAdmin` không?
- [ ] Nếu Data không hiện: Có phải do RLS chặn `anon` client không? -> Chuyển sang `supabaseAdmin` ở Controller.
