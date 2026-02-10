# Hướng dẫn Xử lý Lỗi Server Crash (EADDRINUSE)

Nếu bạn gặp lỗi `EADDRINUSE :::5000` (cổng 5000 đã bị chiếm dụng) khi chạy `npm run dev`, hãy làm theo các bước sau:

## Bước 1: Tìm PID tiến trình đang chiếm cổng
Mở Terminal và chạy lệnh:
```powershell
netstat -ano | findstr :5000
```
Kết quả sẽ có dạng:
```
  TCP    0.0.0.0:5000           0.0.0.0:0              LISTENING       17252
```
Số ở cột cuối cùng (ví dụ: `17252`) chính là **PID** cần tìm.

## Bước 2: Tắt tiến trình
Chạy lệnh sau với PID vừa tìm được:
```powershell
taskkill /F /PID 17252
```
*(Thay `17252` bằng số PID thực tế của bạn)*

## Bước 3: Khởi động lại Server
Chạy lại lệnh:
```powershell
npm run dev
```

---

## Kiểm tra hệ thống (Backend Health Check)
Các module sau đã được kiểm tra và sửa lỗi phân quyền (RLS):
- ✅ **OrderController**: Đã dùng `supabaseAdmin`.
- ✅ **FavoriteController**: Đã dùng `supabaseAdmin`.
- ✅ **PianoController**: An toàn (SQL trực tiếp).
- ✅ **UserController**: An toàn (SQL trực tiếp).
- ✅ **AuthController**: An toàn (Auth API + SQL trực tiếp).
