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

---

## 4. Teacher Profile & Courses Architecture

### Bảng dữ liệu và quan hệ

#### 4.1. `public.teacher_profiles`
Bảng này chứa thông tin hồ sơ giáo viên, được chia sẻ giữa Web App (Node.js) và Mobile App (Flutter).

**Cấu trúc chính:**
- `id` (UUID): Foreign key tới `auth.users.id`, đồng thời là Primary key
- `full_name`, `email`, `phone`: Thông tin cơ bản
- `bio`: Giới thiệu bản thân
- `specializations`: Các chuyên môn (ví dụ: "Classical Piano, Jazz")
- `years_experience`: Số năm kinh nghiệm
- `certificates`: JSONB array chứa các chứng chỉ `[{name, year, issuer}]`
- `verification_status`: Trạng thái duyệt (`pending`, `approved`, `rejected`)
- `approved_at`: Timestamp khi admin phê duyệt
- `rejected_reason`: Lý do từ chối (nếu có)
- `created_at`, `updated_at`: Timestamps

**RLS Policies:**
- Teachers có thể đọc và cập nhật profile của chính mình
- Students có thể đọc profiles đã được approved
- Admins có full quyền đọc/ghi tất cả profiles

**Sync với Mobile:**
- Bảng này được tạo bởi Mobile App (Flutter) trước
- Backend Node.js PHẢI dùng `supabaseAdmin` để modify profiles vì RLS
- Mobile và Web chia sẻ cùng database schema và RLS policies

#### 4.2. `public.courses`
Bảng chứa thông tin khóa học do giáo viên tạo.

**Cấu trúc chính:**
- `id` (UUID): Primary key, auto-generated
- `teacher_id` (UUID): Foreign key tới `auth.users.id`
- `title`: Tên khóa học
- `description`: Mô tả chi tiết
- `price`: Giá khóa học (VND)
- `duration_weeks`: Thời lượng (tuần)
- `level`: Trình độ (`beginner`, `intermediate`, `advanced`)
- `max_students`: Số lượng học viên tối đa
- `current_students`: Số học viên hiện tại (auto-update bằng trigger)
- `is_active`: Trạng thái hoạt động
- `created_at`, `updated_at`: Timestamps

**RLS Policies:**
- Teachers chỉ có thể CRUD courses của chính mình
- Students có thể đọc courses đang active
- Admins có full quyền

**Triggers:**
- Trigger `update_course_student_count` tự động cập nhật `current_students` khi có enrollment mới

#### 4.3. `public.course_enrollments`
Bảng ghi nhận học viên đăng ký khóa học.

**Cấu trúc chính:**
- `id` (UUID): Primary key
- `course_id` (UUID): Foreign key tới `courses.id`
- `student_id` (UUID): Foreign key tới `auth.users.id`
- `enrolled_at`: Timestamp đăng ký
- `status`: Trạng thái (`active`, `completed`, `cancelled`)
- `progress`: Tiến độ học (0-100%)
- `created_at`, `updated_at`: Timestamps

**RLS Policies:**
- Students chỉ có thể đọc enrollments của chính mình
- Teachers có thể đọc enrollments của courses mình dạy
- Admins có full quyền

**Unique Constraint:**
- `(course_id, student_id)` để tránh đăng ký trùng

### Luồng Teacher Profile Workflow

#### 1. Teacher đăng ký (Submission)
1. User với role `teacher` điền form hồ sơ trong TeacherDashboard
2. Frontend gọi `POST /api/teachers/profile` với validation đầy đủ
3. Backend (teacherController) sử dụng `supabaseAdmin` để upsert vào `teacher_profiles`
4. `verification_status` mặc định là `pending`
5. User nhận thông báo "Hồ sơ đã được gửi, đang chờ phê duyệt"

#### 2. Admin duyệt/từ chối (Approval/Rejection)
1. Admin đăng nhập và mở AdminDashboard, tab "Teachers"
2. Hệ thống gọi `GET /api/users/teacher-profiles?verification_status=pending`
3. Admin xem chi tiết từng hồ sơ: chuyên môn, kinh nghiệm, chứng chỉ
4. **Phê duyệt:**
   - Click button "Phê duyệt" → `PUT /api/users/teacher-profiles/:id/approve`
   - Backend update: `verification_status = 'approved'`, `approved_at = NOW()`
   - Teacher nhận thông báo "Hồ sơ đã được phê duyệt!"
5. **Từ chối:**
   - Click button "Từ chối" → Hiện prompt nhập lý do
   - `PUT /api/users/teacher-profiles/:id/reject` với `rejected_reason`
   - Backend update: `verification_status = 'rejected'`, `rejected_reason = ...`
   - Teacher nhận thông báo kèm lý do

#### 3. Teacher tạo khóa học (Course Creation)
1. Sau khi `verification_status = 'approved'`, Teacher mở TeacherDashboard
2. Tab "My Courses" → Click "Create Course"
3. Điền thông tin: title, description, price, duration, level, max_students
4. Frontend gọi `POST /api/teachers/courses`
5. Backend (teacherController) insert vào `courses` với `teacher_id = user.id`
6. RLS policy đảm bảo teacher chỉ tạo được course cho chính mình

#### 4. Student đăng ký khóa học (Enrollment)
1. Student browse danh sách courses (`GET /api/courses?is_active=true`)
2. Click "Enroll" → `POST /api/courses/:id/enroll`
3. Backend kiểm tra:
   - Course còn chỗ không? (`current_students < max_students`)
   - Student đã enroll chưa? (unique constraint check)
4. Insert vào `course_enrollments` với `status = 'active'`
5. Trigger tự động tăng `courses.current_students`
6. Student nhận confirmation và có thể truy cập course materials

### API Endpoints Tổng hợp

**Teacher Profile:**
- `GET /api/teachers/profile` - Get profile của teacher hiện tại
- `POST /api/teachers/profile` - Submit/Update profile (pending approval nếu chưa approved)
- `GET /api/users/teacher-profiles` - [Admin] Danh sách tất cả teacher profiles với filter
- `PUT /api/users/teacher-profiles/:id/approve` - [Admin] Phê duyệt
- `PUT /api/users/teacher-profiles/:id/reject` - [Admin] Từ chối với lý do

**Courses:**
- `GET /api/teachers/courses` - Get courses của teacher hiện tại
- `POST /api/teachers/courses` - Tạo course mới
- `PUT /api/teachers/courses/:id` - Update course
- `DELETE /api/teachers/courses/:id` - Xóa course
- `GET /api/courses` - Public: Browse active courses
- `GET /api/courses/:id` - Public: Chi tiết course
- `POST /api/courses/:id/enroll` - Student đăng ký course

**Enrollments:**
- `GET /api/enrollments` - Student xem enrollments của mình
- `GET /api/teachers/courses/:id/students` - Teacher xem students trong course

### Best Practices

1. **Backend LUÔN dùng `supabaseAdmin`** khi thao tác với `teacher_profiles`, `courses`, `course_enrollments` để bypass RLS trong server-side logic.

2. **Frontend validation** phải trim() và kiểm tra empty strings trước khi gửi. Backend cũng phải validate lại.

3. **Mobile/Web Sync:** Mọi thay đổi schema phải được test ở cả hai platforms. Coordinate với Mobile team trước khi alter tables.

4. **Admin notifications:** Khi teacher submit profile mới hoặc update, có thể gửi notification/email cho admin để duyệt nhanh.

5. **Teacher badges:** Sau khi approved, frontend phải hiển thị badge ✓ "Verified Teacher" ở profile và course listings.

6. **Payment Integration (Future):** Khi integrate payment gateway, thêm fields `payment_status`, `payment_method` vào `course_enrollments`.

---

## 5. Migration Notes

### SQL Files cần chạy:
- `sql/create_courses_tables.sql` - Tạo tables `courses` và `course_enrollments` với RLS policies và triggers

### Kiểm tra sau Migration:
- [ ] Verify RLS policies hoạt động đúng: teacher chỉ đọc/ghi courses của mình
- [ ] Verify trigger `update_course_student_count` chạy khi insert/delete enrollments
- [ ] Test admin approval/rejection workflow end-to-end
- [ ] Test Mobile app vẫn đọc được `teacher_profiles` sau khi backend update
