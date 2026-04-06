# Course & Class Redesign — Tiến độ & Kế hoạch Backend

> **Trạng thái:** ✅ Database migration HOÀN TẤT (2026-03-31)
> **Supabase project:** `xpiano` — ID: `nzjiumofgtdnvnzmltls`

---

## ✅ Phần 1: Tổng kết Schema Database

### Kiến trúc 3 tầng

```
courses (Template)
  └── course_schedules (Lịch tuyển sinh)
        └── course_classes (Lớp học thực sự)
              ├── course_enrollments  (Ghi danh học viên)
              ├── live_sessions       (Buổi học)
              ├── class_assignments   (Giao bài tập)
              │     └── class_assignment_submissions (Nộp bài)
              ├── class_announcements (Thông báo lớp)
              ├── student_learning_progress (Tiến độ học viên)
              ├── course_reviews      (Đánh giá)
              └── course_revenue_snapshots (Snapshot doanh thu)
```

---

### 1.1 Bảng `courses` ✅ REBUILT CLEAN (2026-03-31)

> ⚡ **Drop & Recreate hoàn toàn** — Xóa sạch 10 bản test cũ + tất cả cột rác. Đế chế mới bắt đầu từ đây.

| # | Cột | Kiểu | Default | Ghi chú |
|---|---|---|---|---|
| 1 | `id` | uuid PK | `uuid_generate_v4()` | |
| 2 | `teacher_id` | uuid FK → auth.users | | CASCADE delete |
| 3 | `title` | varchar(255) NOT NULL | | |
| 4 | `description` | text | NULL | |
| 5 | `price` | numeric NOT NULL | `0` | Giá tham khảo |
| 6 | `duration_weeks` | int4 NOT NULL | `8` | Schedule kế thừa |
| 7 | `level` | varchar(20) | NULL | beginner / intermediate / advanced |
| 8 | `category` | varchar(100) | NULL | classic, jazz, pop... |
| 9 | `thumbnail_url` | text | NULL | Ảnh đại diện |
| 10 | `cover_url` | text | NULL | Ảnh bìa |
| 11 | `demo_video_url` | text | NULL | Video giới thiệu |
| 12 | `objectives` | text[] NOT NULL | `'{}'` | Mục tiêu khóa học |
| 13 | `requirements` | text[] NOT NULL | `'{}'` | Yêu cầu đầu vào |
| 14 | `syllabus` | jsonb NOT NULL | `'[]'` | `[{week, topic, description}]` |
| 15 | `musicxml_files` | jsonb NOT NULL | `'[]'` | `[{title, file_url, description}]` |
| 16 | `status` | varchar(20) NOT NULL | `'draft'` | **draft** \| **active** \| **archived** |
| 17 | `created_at` | timestamptz NOT NULL | `now()` | |
| 18 | `updated_at` | timestamptz NOT NULL | `now()` | Auto-trigger |

**Đã xóa vĩnh viễn:** `sessions_per_week`, `max_students`, `current_students`, `start_date`, `end_date`, `is_online`, `location`, `schedule` — tất cả đã chuyển sang `course_schedules`.

---

### 1.2 Bảng `course_schedules` (MỚI — Lịch tuyển sinh)

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid PK | |
| `course_id` | uuid FK → courses | |
| `teacher_id` | uuid FK → auth.users | |
| `name` | varchar | Tên lịch học, VD: "Lớp sáng T2-T4 khai giảng 5/4" |
| `start_date` | date | Ngày khai giảng |
| `duration_weeks` | int4 DEFAULT 8 | Số tuần học |
| `sessions_per_week` | int4 DEFAULT 2 | Số buổi/tuần |
| `schedule` | jsonb | `[{"day_of_week":2,"time":"09:00","duration_minutes":60}]` |
| `is_online` | boolean DEFAULT true | |
| `location` | varchar nullable | NULL nếu online |
| `max_students` | int4 DEFAULT 10 | Sĩ số tối đa |
| `enrolled_count` | int4 DEFAULT 0 | **Auto-update via trigger** |
| `price` | numeric DEFAULT 0 | Có thể override giá của Course |
| `requires_payment` | boolean DEFAULT true | |
| `status` | varchar | enrolling \| closed \| converted |
| `created_at` / `updated_at` | timestamptz | |

**Vòng đời trạng thái:** `enrolling` → (đầy hoặc GV chủ động) → `closed` → (convert) → `converted`

---

### 1.3 Bảng `course_classes` (MỚI — Lớp học thực sự)

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid PK | |
| `course_id` | uuid FK → courses | |
| `schedule_id` | uuid FK → course_schedules nullable | NULL nếu tạo thẳng |
| `teacher_id` | uuid FK → auth.users | |
| `name` | varchar | Tên lớp |
| `start_date` | date | Copy từ schedule |
| `end_date` | date nullable | Tính từ start_date + duration_weeks |
| `schedule_snapshot` | jsonb | Copy cứng lịch học (lớp độc lập với schedule) |
| `is_online` | boolean | |
| `location` | varchar nullable | |
| `conversation_id` | uuid FK → conversations nullable | Group chat của lớp |
| `status` | varchar | upcoming \| ongoing \| completed \| cancelled |
| `created_at` / `updated_at` | timestamptz | |

---

### 1.4 Bảng `course_enrollments` (Đã cập nhật)

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid PK | |
| `course_id` | uuid FK → courses | Giữ lại (backward compat) |
| `class_id` | uuid FK → course_classes | **MỚI** — FK chính |
| `user_id` | uuid FK → profiles | |
| `order_id` | int4 FK → orders | |
| `payment_verified` | boolean DEFAULT false | **MỚI** |
| `status` | text DEFAULT 'active' | |
| `created_at` | timestamptz | |

---

### 1.5 Bảng `live_sessions` (Đã cập nhật)

Thêm cột: `class_id uuid FK → course_classes` (nullable, backward compat)

Các bảng con vẫn nguyên vẹn: `session_participants`, `session_chat`, `session_tracks`, `session_room_config`, `session_analytics`, `session_recordings`.

---

### 1.6 Bảng `orders` (Đã cập nhật)

Thêm cột: `class_id uuid FK → course_classes` (nullable)

---

### 1.7 Bảng `class_assignments` (MỚI)

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid PK | |
| `class_id` | uuid FK → course_classes CASCADE | |
| `teacher_id` | uuid FK → auth.users | |
| `session_id` | uuid FK → live_sessions nullable | Gắn với buổi học nào |
| `title` | varchar | |
| `description` | text nullable | |
| `musicxml_url` | text nullable | File nhạc bài tập |
| `attachment_urls` | text[] | |
| `due_date` | timestamptz nullable | |
| `created_at` / `updated_at` | timestamptz | |

---

### 1.8 Bảng `class_assignment_submissions` (MỚI)

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid PK | |
| `assignment_id` | uuid FK → class_assignments CASCADE | |
| `student_id` | uuid FK → auth.users | |
| `musicxml_url` | text nullable | Bài nộp |
| `attachment_urls` | text[] | |
| `note` | text nullable | Ghi chú của học viên |
| `teacher_feedback` | text nullable | Phản hồi GV |
| `grade` | varchar nullable | A, B+, pass, needs_work... |
| `reviewed_at` | timestamptz nullable | |
| `created_at` / `updated_at` | timestamptz | |
| UNIQUE | (assignment_id, student_id) | Mỗi HV nộp 1 lần |

---

### 1.9 Bảng `class_announcements` (MỚI)

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid PK | |
| `class_id` | uuid FK → course_classes CASCADE | |
| `teacher_id` | uuid FK → auth.users | |
| `title` | varchar | |
| `content` | text | |
| `attachment_urls` | text[] | |
| `is_pinned` | boolean DEFAULT false | |
| `created_at` / `updated_at` | timestamptz | |

---

### 1.10 Bảng `course_revenue_snapshots` (MỚI)

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid PK | |
| `class_id` | uuid FK → course_classes CASCADE | |
| `course_id` | uuid FK → courses | |
| `teacher_id` | uuid FK → auth.users | |
| `gross_revenue` | numeric DEFAULT 0 | Tổng thu |
| `platform_fee` | numeric DEFAULT 0 | Phí nền tảng |
| `net_revenue` | numeric DEFAULT 0 | Thực nhận |
| `refunded_amount` | numeric DEFAULT 0 | Đã hoàn |
| `enrolled_count` | int4 | Sĩ số lúc snapshot |
| `completed_count` | int4 | Số HV hoàn thành |
| `dropped_count` | int4 | Số HV bỏ học |
| `avg_rating` | numeric nullable | |
| `reviews_count` | int4 DEFAULT 0 | |
| `snapshot_type` | varchar | enrollment \| refund \| class_completed \| manual |
| `snapshot_at` | timestamptz | |

---

### 1.11 Bảng `course_reviews` (MỚI)

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid PK | |
| `class_id` | uuid FK → course_classes CASCADE | |
| `course_id` | uuid FK → courses | |
| `student_id` | uuid FK → auth.users | |
| `rating` | int2 (1-5) | Đánh giá tổng |
| `comment` | text nullable | |
| `is_anonymous` | boolean DEFAULT false | |
| `rating_content` | int2 (1-5) nullable | Nội dung học |
| `rating_teacher` | int2 (1-5) nullable | Chất lượng GV |
| `rating_interaction` | int2 (1-5) nullable | Tương tác |
| `status` | varchar | published \| hidden \| flagged |
| `created_at` / `updated_at` | timestamptz | |
| UNIQUE | (class_id, student_id) | Mỗi HV review 1 lần/lớp |

---

### 1.12 Bảng `teacher_revenue_summary` (MỚI)

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid PK | |
| `teacher_id` | uuid FK → auth.users | |
| `period_year` | int4 | Năm |
| `period_month` | int4 (1-12) | Tháng |
| `total_classes` | int4 | Tổng số lớp trong tháng |
| `completed_classes` | int4 | |
| `cancelled_classes` | int4 | |
| `new_enrollments` | int4 | Số đăng ký mới |
| `total_students` | int4 | Tổng HV duy nhất |
| `gross_revenue` | numeric | |
| `platform_fee` | numeric | |
| `net_revenue` | numeric | |
| `refunded_amount` | numeric | |
| `avg_completion_rate` | numeric | % HV hoàn thành |
| `avg_rating` | numeric | |
| `calculated_at` | timestamptz | |
| UNIQUE | (teacher_id, period_year, period_month) | |

---

### 1.13 Bảng `student_learning_progress` (MỚI)

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid PK | |
| `class_id` | uuid FK → course_classes CASCADE | |
| `student_id` | uuid FK → auth.users | |
| `sessions_total` | int4 DEFAULT 0 | Tổng buổi học của lớp |
| `sessions_attended` | int4 DEFAULT 0 | Số buổi đã tham gia |
| `assignments_total` | int4 DEFAULT 0 | |
| `assignments_submitted` | int4 DEFAULT 0 | |
| `assignments_passed` | int4 DEFAULT 0 | |
| `avg_grade` | numeric DEFAULT 0 | |
| `total_learning_minutes` | int4 DEFAULT 0 | Từ session_analytics |
| `progress_status` | varchar | on_track \| at_risk \| completed \| dropped |
| `updated_at` | timestamptz | |
| UNIQUE | (class_id, student_id) | |

---

### 1.14 Views & Triggers đã tạo

| Tên | Loại | Mục đích |
|---|---|---|
| `v_course_overview` | VIEW | Tổng quan từng khóa học (classes, enrollments, revenue, rating) |
| `v_teacher_monthly_dashboard` | VIEW | Dashboard tháng (kèm revenue_per_student, completion_rate) |
| `v_class_student_progress` | VIEW | Tiến độ học viên kèm profile |
| `fn_set_updated_at` | TRIGGER FN | Tự cập nhật updated_at cho mọi bảng mới |
| `fn_sync_schedule_enrolled_count` | TRIGGER FN | Tự cập nhật enrolled_count khi có enrollment mới |

---

## 🗂️ Phần 2: Kế hoạch Backend API

### Cấu trúc File Controller

```
controllers/
├── courseController.js           -- Hiện có, cần REWRITE
├── scheduleController.js         -- TẠO MỚI
├── classController.js            -- TẠO MỚI
├── assignmentController.js       -- TẠO MỚI
├── analyticsController.js        -- TẠO MỚI
└── courseReviewController.js     -- TẠO MỚI
```

---

### API Group 1: Course Template — `courseController.js`

| Method | Endpoint | Mô tả | Auth |
|---|---|---|---|
| POST | `/courses` | Tạo khóa học mới | Teacher |
| GET | `/courses` | Danh sách khóa học public (có filter level, category, price) | Public |
| GET | `/courses/:id` | Chi tiết khóa học (kèm schedules đang enrolling) | Public |
| PUT | `/courses/:id` | Cập nhật khóa học (luôn cho phép kể cả active) | Teacher (owner) |
| DELETE | `/courses/:id` | Xóa (chỉ khi không có class ongoing) | Teacher (owner) |
| PUT | `/courses/:id/archive` | Đưa về archived (không mở lớp mới được nữa) | Teacher (owner) |
| GET | `/courses/:id/schedules` | Danh sách lịch tuyển sinh của khóa | Public |
| GET | `/courses/:id/reviews` | Danh sách đánh giá của khóa | Public |
| GET | `/teacher/courses` | Danh sách khóa học của GV đang đăng nhập | Teacher |

---

### API Group 2: Schedule — `scheduleController.js`

| Method | Endpoint | Mô tả | Auth |
|---|---|---|---|
| POST | `/courses/:courseId/schedules` | Tạo lịch tuyển sinh mới cho khóa | Teacher |
| GET | `/schedules/:id` | Chi tiết lịch | Public |
| PUT | `/schedules/:id` | Cập nhật lịch (chỉ khi enrolling, chưa có enrollment) | Teacher (owner) |
| DELETE | `/schedules/:id` | Xóa lịch (chỉ khi enrolled_count = 0) | Teacher (owner) |
| POST | `/schedules/:id/close` | Đóng tuyển sinh (chủ động) | Teacher (owner) |
| POST | `/schedules/:id/convert` | Đóng gói → tạo lớp học (CourseClass) | Teacher (owner) |

**Logic `convert`:**
1. Validate: schedule.status = enrolling hoặc closed
2. Tính `end_date` = `start_date` + `duration_weeks`
3. Tạo bản ghi `course_classes` với `schedule_snapshot`
4. Tạo group `Conversation` cho lớp → lưu `conversation_id`
5. Gán tất cả enrollments của schedule này sang `class_id`
6. Add học viên + giáo viên vào `conversation_members`
7. Auto-sinh `live_sessions` dựa trên `schedule.schedule`
8. Set `schedule.status = 'converted'`

---

### API Group 3: Class — `classController.js`

| Method | Endpoint | Mô tả | Auth |
|---|---|---|---|
| GET | `/classes/:id` | Chi tiết lớp học | Teacher / Enrolled Student |
| GET | `/classes/:id/students` | Danh sách học viên (kèm tiến độ) | Teacher |
| PUT | `/classes/:id/status` | Cập nhật trạng thái (ongoing/completed/cancelled) | Teacher |
| GET | `/teacher/classes` | Danh sách lớp của GV (filter by status) | Teacher |
| GET | `/student/classes` | Lớp học đang tham gia của học viên | Student |
| POST | `/classes/:id/announcements` | Tạo thông báo | Teacher |
| GET | `/classes/:id/announcements` | Danh sách thông báo (pinned trước) | Teacher / Student |
| PUT | `/announcements/:id` | Sửa thông báo | Teacher (owner) |
| DELETE | `/announcements/:id` | Xóa thông báo | Teacher (owner) |
| POST | `/classes/:id/enroll` | Học viên ghi danh vào lớp (trigger từ payment) | Student |

---

### API Group 4: Assignment — `assignmentController.js`

| Method | Endpoint | Mô tả | Auth |
|---|---|---|---|
| POST | `/classes/:classId/assignments` | Tạo bài tập | Teacher |
| GET | `/classes/:classId/assignments` | Danh sách bài tập (kèm submission status) | Teacher / Student |
| GET | `/assignments/:id` | Chi tiết bài tập | Teacher / Enrolled Student |
| PUT | `/assignments/:id` | Sửa bài tập | Teacher (owner) |
| DELETE | `/assignments/:id` | Xóa bài tập | Teacher (owner) |
| POST | `/assignments/:id/submit` | Học viên nộp bài | Student |
| PUT | `/submissions/:id` | Học viên chỉnh sửa bài đã nộp | Student (owner, trước due_date) |
| GET | `/assignments/:id/submissions` | Tất cả bài nộp của 1 bài tập | Teacher |
| PUT | `/submissions/:id/grade` | Chấm bài (grade + feedback) | Teacher |

---

### API Group 5: Review — `courseReviewController.js`

| Method | Endpoint | Mô tả | Auth |
|---|---|---|---|
| POST | `/classes/:classId/reviews` | Tạo đánh giá (chỉ khi class completed) | Enrolled Student |
| PUT | `/reviews/:id` | Sửa đánh giá | Student (owner) |
| GET | `/courses/:courseId/reviews` | Tất cả reviews của khóa học | Public |
| GET | `/classes/:classId/reviews` | Reviews của 1 lớp | Public |
| PUT | `/admin/reviews/:id/status` | Admin ẩn/flag review | Admin |

---

### API Group 6: Analytics & Revenue — `analyticsController.js`

#### Dành cho Giáo viên

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/teacher/analytics/overview` | Tổng overview: courses, classes, students, lifetime revenue |
| GET | `/teacher/analytics/revenue` | Doanh thu tháng cụ thể `?year=&month=` (từ teacher_revenue_summary) |
| GET | `/teacher/analytics/revenue/chart` | Biểu đồ 12 tháng gần nhất `?range=12months` |
| GET | `/teacher/analytics/courses` | Ranking khóa học (sort: revenue, rating, enrollments) |
| GET | `/teacher/analytics/classes/:classId` | Phân tích 1 lớp: điểm danh, bài tập, doanh thu |
| GET | `/teacher/analytics/students/:classId` | Tiến độ từng HV, highlight at_risk |
| GET | `/teacher/analytics/reviews` | Danh sách đánh giá từ học viên `?courseId=&rating=` |

#### Dành cho Admin

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/admin/analytics/revenue/overview` | Tổng doanh thu nền tảng `?year=&month=` |
| GET | `/admin/analytics/revenue/teachers` | Bảng xếp hạng GV theo doanh thu `?period=2026-04` |
| GET | `/admin/analytics/revenue/breakdown/:teacherId` | Doanh thu theo tháng của 1 GV |
| GET | `/admin/analytics/courses/top` | Top khóa học (by revenue / enrollment / rating) |
| GET | `/admin/analytics/platform/summary` | KPIs: MAU, new_teachers, new_students, gross_revenue |

---

## 🚀 Phần 3: Thứ tự Code Backend

```
Ưu tiên thực hiện:

[1] courseController.js      — Rewrite, bỏ logic publish cũ
[2] scheduleController.js    — Tạo mới, đặc biệt là action /convert
[3] classController.js       — Tạo mới, quản lý lớp + thông báo
[4] assignmentController.js  — Tạo mới, CRUD bài tập + chấm bài
[5] courseReviewController.js — Tạo mới, đơn giản
[6] analyticsController.js   — Tạo mới, query views + summary tables
```

---

> [!NOTE]
> Các controller hiện tại (`sessionController.js`, `orderController.js`) cần được cập nhật nhỏ để nhận thêm tham số `class_id` khi tạo session và xử lý đơn hàng khóa học.
