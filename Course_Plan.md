# Kế hoạch Tái cấu trúc Hệ thống Quản lý Khóa học (Course & Class Redesign)

> **Ngữ cảnh:** Phân tích từ database thực tế (Supabase project: `xpiano`, ID: `nzjiumofgtdnvnzmltls`)

---

## 1. Mô hình mới: 3 tầng

```
Course (Khóa học - Template)
  └── CourseSchedule (Lịch học - Slot tuyển sinh)
        └── CourseClass (Lớp học - Instance thực tế)
              ├── class_enrollments (Danh sách học viên)
              ├── live_sessions   (Các buổi học)
              ├── class_assignments (Bài tập)
              └── class_announcements (Thông báo)
```

### So sánh với mô hình cũ

| Khía cạnh | Cũ | Mới |
|---|---|---|
| `courses` | = 1 Lớp học cụ thể | = Template khóa học thuần túy |
| Lịch học | Gắn chặt vào `courses.schedule` & `start_date` | Bảng riêng `course_schedules` |
| Lớp học | Không tồn tại | Bảng riêng `course_classes` |
| Enrollments | FK → `course_id` | FK → `class_id` |
| Sessions | Tạo hàng loạt lúc Publish | Tạo khi "đóng gói" lớp học |
| Sửa sau khi Publish | ❌ Bị khoá | ✅ Luôn cho phép |

---

## 2. Schema Database Thực Tế Hiện Tại

### Bảng `courses` (HIỆN TẠI - sẽ bị refactor)
```sql
id               uuid         PK
teacher_id       uuid         FK → auth.users.id
title            varchar
description      text
price            numeric      DEFAULT 0
duration_weeks   int4         DEFAULT 8
sessions_per_week int4        DEFAULT 2
max_students     int4         DEFAULT 10
current_students int4         DEFAULT 0
start_date       date         -- SẼ Xoá, chuyển sang course_schedules
end_date         date         -- SẼ XÓA
is_online        boolean      -- SẼ XÓA, chuyển sang course_schedules
location         varchar      -- SẼ XÓA
status           varchar      CHECK: draft|published|active|completed|cancelled
schedule         jsonb        -- SẼ XÓA, chuyển sang course_schedules
cover_url        text
demo_video_url   text
created_at       timestamptz
updated_at       timestamptz
```

### Bảng `live_sessions` (HIỆN TẠI - sẽ thêm FK mới)
```sql
id               uuid         PK
course_id        uuid         FK → courses.id   -- GIỮ NGUYÊN
teacher_id       uuid         FK → auth.users.id
title            varchar
description      text
scheduled_at     timestamptz
started_at       timestamptz  nullable
ended_at         timestamptz  nullable
duration_minutes int4         DEFAULT 60
room_id          varchar      nullable
status           varchar      CHECK: scheduled|live|ended|cancelled
max_participants int4         DEFAULT 50
recording_url    text         nullable
settings         jsonb        DEFAULT {}
created_at       timestamptz
updated_at       timestamptz
-- Sẽ THÊM: class_id uuid FK → course_classes.id
```

### Bảng `course_enrollments` (HIỆN TẠI - sẽ refactor)
```sql
id        uuid    PK
course_id uuid    FK → courses.id   -- SẼ ĐỔI sang class_id
user_id   uuid    FK → profiles.id
order_id  int4    FK → orders.id
status    text    DEFAULT 'active'
created_at timestamptz
```

### Các bảng liên quan đến `live_sessions` (GIỮ NGUYÊN HOÀN TOÀN)
- `session_participants` — Người tham gia buổi học
- `session_chat` — Chat trong buổi học
- `session_tracks` — Quản lý track camera/audio
- `session_room_config` — Config phòng học (teacher/student permissions)
- `session_analytics` — Analytics buổi học
- `session_recordings` — Bản ghi lại

---

## 3. Schema Database Mới Cần Tạo

### 3.1 Refactor bảng `courses` (Thuần là Template)
Xoá các cột gắn với lịch học cụ thể, thêm các cột về nội dung khóa học:

```sql
-- Xóa cột: start_date, end_date, is_online, location, schedule,
--           max_students, current_students, sessions_per_week
-- Thêm cột:
thumbnail_url    text         -- Ảnh đại diện
level            varchar      CHECK: beginner|intermediate|advanced
category         varchar      -- Ví dụ: 'classic', 'jazz', 'pop'
objectives       text[]       -- Mục tiêu khóa học (mảng chuỗi)
requirements     text[]       -- Yêu cầu đầu vào
syllabus         jsonb        -- Giáo trình (mảng chương/bài)
musicxml_files   jsonb        -- Bộ bài tập: [{title, file_url, description}]
status           varchar      CHECK: draft|active|archived
                              -- active = giáo viên có thể mở lớp từ khóa này
                              -- KHÔNG CÒN 'published' theo nghĩa cũ
```

### 3.2 Bảng `course_schedules` (MỚI - Lịch học / Slot tuyển sinh)
```sql
CREATE TABLE course_schedules (
  id               uuid         PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id        uuid         NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  teacher_id       uuid         NOT NULL REFERENCES auth.users(id),

  -- Thông tin lịch
  name             varchar      NOT NULL,  -- Ví dụ: "Lớp sáng thứ 2-4, khai giảng 5/4"
  start_date       date         NOT NULL,
  duration_weeks   int4         NOT NULL DEFAULT 8,
  sessions_per_week int4        NOT NULL DEFAULT 2,
  schedule         jsonb        NOT NULL,
  -- schedule format: [{"day_of_week": 2, "time": "09:00", "duration_minutes": 60}, ...]

  -- Hình thức học
  is_online        boolean      NOT NULL DEFAULT true,
  location         varchar,     -- NULL nếu is_online = true

  -- Sĩ số & Tuyển sinh
  max_students     int4         NOT NULL DEFAULT 10,
  enrolled_count   int4         NOT NULL DEFAULT 0,  -- Counter dùng để kiểm tra đầy/chưa

  -- Thanh toán
  price            numeric      NOT NULL DEFAULT 0,  -- Có thể khác giá Course mặc định
  requires_payment boolean      NOT NULL DEFAULT true,

  -- Trạng thái
  status           varchar      NOT NULL DEFAULT 'enrolling'
                   CHECK (status IN ('enrolling', 'closed', 'converted')),
  -- enrolling  = đang mở tuyển sinh
  -- closed     = giáo viên đóng tuyển sinh thủ công
  -- converted  = đã được "đóng gói" thành 1 lớp học (course_class)

  created_at       timestamptz  NOT NULL DEFAULT now(),
  updated_at       timestamptz  NOT NULL DEFAULT now()
);
```

### 3.3 Bảng `course_classes` (MỚI - Lớp học thực sự)
```sql
CREATE TABLE course_classes (
  id               uuid         PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id        uuid         NOT NULL REFERENCES courses(id),
  schedule_id      uuid         REFERENCES course_schedules(id),
  -- schedule_id có thể NULL nếu giáo viên tạo lớp thẳng mà không qua schedule
  teacher_id       uuid         NOT NULL REFERENCES auth.users(id),

  name             varchar      NOT NULL,  -- Tên lớp, kế thừa từ schedule hoặc tự đặt
  
  -- Thông tin lịch (sao chép từ schedule lúc tạo lớp, để lớp độc lập)
  start_date       date         NOT NULL,
  end_date         date,        -- Tính tự động từ start_date + duration_weeks
  schedule_snapshot jsonb       NOT NULL,  -- Copy lịch học để lưu trữ cứng
  is_online        boolean      NOT NULL DEFAULT true,
  location         varchar,

  -- Conversation (chat lớp học)
  conversation_id  uuid         REFERENCES conversations(id),
  -- Khi tạo lớp, hệ thống tự tạo 1 group conversation cho lớp

  -- Trạng thái lớp
  status           varchar      NOT NULL DEFAULT 'upcoming'
                   CHECK (status IN ('upcoming', 'ongoing', 'completed', 'cancelled')),
  -- upcoming   = chưa đến ngày khai giảng
  -- ongoing    = đang trong quá trình học
  -- completed  = đã kết thúc
  -- cancelled  = bị hủy

  created_at       timestamptz  NOT NULL DEFAULT now(),
  updated_at       timestamptz  NOT NULL DEFAULT now()
);
```

### 3.4 Refactor bảng `course_enrollments` (Đổi FK từ course sang class)
```sql
-- Đổi tên thành class_enrollments để rõ nghĩa hơn

ALTER TABLE course_enrollments
  ADD COLUMN class_id uuid REFERENCES course_classes(id),
  ADD COLUMN payment_verified boolean DEFAULT false;
  -- course_id sẽ deprecated, giữ lại để migration không mất dữ liệu cũ
```

### 3.5 Cập nhật bảng `live_sessions` (Thêm FK class)
```sql
ALTER TABLE live_sessions
  ADD COLUMN class_id uuid REFERENCES course_classes(id);
-- course_id vẫn giữ để backward compatible
```

### 3.6 Bảng `class_assignments` (MỚI - Bài tập)
```sql
CREATE TABLE class_assignments (
  id               uuid         PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_id         uuid         NOT NULL REFERENCES course_classes(id) ON DELETE CASCADE,
  teacher_id       uuid         NOT NULL REFERENCES auth.users(id),
  session_id       uuid         REFERENCES live_sessions(id),  -- Gắn với buổi học nào (tuỳ chọn)

  title            varchar      NOT NULL,
  description      text,
  musicxml_url     text,        -- File bài tập nhạc (.musicxml)
  attachment_urls  text[],      -- Các file đính kèm khác
  due_date         timestamptz,

  created_at       timestamptz  NOT NULL DEFAULT now(),
  updated_at       timestamptz  NOT NULL DEFAULT now()
);
```

### 3.7 Bảng `class_assignment_submissions` (MỚI - Nộp bài)
```sql
CREATE TABLE class_assignment_submissions (
  id               uuid         PRIMARY KEY DEFAULT uuid_generate_v4(),
  assignment_id    uuid         NOT NULL REFERENCES class_assignments(id) ON DELETE CASCADE,
  student_id       uuid         NOT NULL REFERENCES auth.users(id),
  
  musicxml_url     text,        -- File bài nộp
  attachment_urls  text[],
  note             text,        -- Ghi chú của học viên
  
  -- Phản hồi từ giáo viên
  teacher_feedback text,
  grade            varchar,     -- Ví dụ: 'A', 'B+', 'pass', 'needs_work'
  reviewed_at      timestamptz,

  created_at       timestamptz  NOT NULL DEFAULT now(),
  updated_at       timestamptz  NOT NULL DEFAULT now()
);
```

### 3.8 Bảng `class_announcements` (MỚI - Thông báo lớp học)
```sql
CREATE TABLE class_announcements (
  id               uuid         PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_id         uuid         NOT NULL REFERENCES course_classes(id) ON DELETE CASCADE,
  teacher_id       uuid         NOT NULL REFERENCES auth.users(id),

  title            varchar      NOT NULL,
  content          text         NOT NULL,
  attachment_urls  text[],
  is_pinned        boolean      NOT NULL DEFAULT false,

  created_at       timestamptz  NOT NULL DEFAULT now(),
  updated_at       timestamptz  NOT NULL DEFAULT now()
);
```

---

## 4. Sơ đồ quan hệ (ERD Summary)

```
profiles (teacher) ──────────────────────────────────────┐
                                                          ▼
                    courses ─────────── course_schedules ──► course_classes
                      │                      │                     │
                 (template)            (tuyển sinh)           (lớp học)
                      │                      │                     │
                 musicxml_files        max_students         class_enrollments
                 objectives            enrolled_count             │
                 syllabus              price                  (học viên đã đăng ký)
                 level/category        requires_payment           │
                                                            live_sessions
                                                            class_assignments
                                                            class_announcements
                                                            conversation_id → conversations
```

---

## 5. Lộ trình thực hiện (Step-by-step)

### ✅ Bước 0: Chuẩn bị — Kiểm tra dữ liệu hiện có
- Hiện có **10 bản ghi** trong `courses`
- Hiện có **62 bản ghi** trong `live_sessions` (gắn với `course_id`)
- Hiện có **1 bản ghi** trong `course_enrollments`
- Hiện có **38 bản ghi** trong `orders` (một số có `course_id`)
> Cần migration script để map dữ liệu cũ sang cấu trúc mới, không được mất dữ liệu.

---

### 🛠️ Bước 1: Migration Database
**1a.** Thêm các cột mới vào bảng `courses` (objectives, requirements, syllabus, musicxml_files, level, category, thumbnail_url).

**1b.** Xóa ràng buộc `status` cũ của `courses`, thêm CHECK mới: `draft|active|archived`.

**1c.** Tạo bảng `course_schedules`.

**1d.** Tạo bảng `course_classes`.

**1e.** Thêm cột `class_id` vào `live_sessions` và `course_enrollments`.

**1f.** Tạo bảng `class_assignments`, `class_assignment_submissions`, `class_announcements`.

**1g.** Script migrate dữ liệu cũ:
  - Mỗi `course` cũ có `start_date` → tạo 1 `course_schedule` tương ứng.
  - Sau đó "convert" schedule đó thành 1 `course_class`.
  - Gán `class_id` vào tất cả `live_sessions` thuộc course đó.
  - Gán `class_id` vào `course_enrollments` tương ứng.

**1h.** Xóa các cột cũ không dùng: `courses.start_date`, `end_date`, `is_online`, `location`, `schedule`, `max_students`, `current_students`, `sessions_per_week`.

---

### 🛠️ Bước 2: Xây dựng lại API (courseController.js)
Tách thành 3 controller riêng biệt:

**`courseController.js`** — CRUD Template:
- `POST /courses` — Tạo template khóa học (không cần start_date)
- `GET /courses/:id` — Chi tiết khóa học
- `PUT /courses/:id` — Cập nhật tự do, kể cả khi đã `active`
- `DELETE /courses/:id` — Chỉ xóa được nếu chưa có class nào đang `ongoing`

**`scheduleController.js`** — CRUD Lịch học:
- `POST /courses/:courseId/schedules` — Tạo lịch tuyển sinh mới
- `GET /courses/:courseId/schedules` — Danh sách các lịch của khóa
- `PUT /schedules/:id` — Sửa lịch (chỉ khi status = `enrolling`)
- `DELETE /schedules/:id` — Xóa lịch (chỉ khi chưa có enrollment nào)
- `POST /schedules/:id/convert` — **Đóng gói → tạo lớp học**, reset trạng thái

**`classController.js`** — Quản lý lớp học:
- `GET /classes/:id` — Chi tiết lớp học
- `GET /classes/:id/students` — Danh sách học viên
- `POST /classes/:id/announcements` — Tạo thông báo
- `POST /classes/:id/assignments` — Giao bài tập
- `GET /classes/:id/assignments` — Danh sách bài tập
- `POST /assignments/:id/submit` — Học viên nộp bài
- `PUT /submissions/:id/review` — Giáo viên chấm bài

---

### 🛠️ Bước 3: Cập nhật API Enrollment & Payment
- Học viên đăng ký vào `class_id` (thay vì `course_id`).
- Bảng `orders` cần thêm cột `class_id` (thay vì chỉ `course_id`).
- Khi đăng ký và thanh toán xong → tạo bản ghi `course_enrollments` với `class_id`, `payment_verified = true`.
- Khi `enrolled_count` = `max_students` → hệ thống tự động chuyển `schedule.status = 'closed'` hoặc gợi ý giáo viên convert.

---

### 🛠️ Bước 4: Cập nhật Live Session Logic
- `live_sessions` sẽ được tạo **khi convert schedule thành class** (không phải lúc publish course như cũ).
- Thêm `class_id` vào mỗi session được tạo.
- API kiểm tra quyền tham gia session: phải có `class_enrollment` hợp lệ với `class_id` của session đó.

---

### 🛠️ Bước 5: Tích hợp với Conversation (Chat lớp học)
- Khi tạo `course_class`, tự động tạo 1 `Conversation` loại `group`.
- Thêm giáo viên và tất cả học viên đã enrolled vào `conversation_members`.
- Khi học viên mới đăng ký (enrollment mới) → thêm vào `conversation_members`.
- `class.conversation_id` giữ FK để truy xuất nhanh.

---

### 🛠️ Bước 6: Cập nhật RLS Policies
Áp dụng RLS cho các bảng mới:
- `course_schedules`: Teacher chỉ CRUD schedule của mình.
- `course_classes`: Teacher chỉ xem/sửa class của mình; Student chỉ xem class mình enrolled.
- `class_assignments`: Teacher tạo/sửa/xóa; Student chỉ xem (nếu enrolled).
- `class_announcements`: Teacher tạo/sửa/xóa; Student chỉ xem (nếu enrolled).

---

### 🛠️ Bước 7: Cập nhật Mobile App (Flutter)
- Mọi màn hình hiện đang gọi `course.start_date`, `course.schedule`, `course.max_students` cần cập nhật để lấy từ `CourseSchedule` hoặc `CourseClass`.
- Thêm màn hình "Quản lý lịch tuyển sinh" cho giáo viên.
- Thêm màn hình "Lớp học của tôi" hiển thị `course_classes` đang tham gia.
- Cập nhật Enrollment flow: chọn `schedule_id` khi đăng ký thay vì chỉ `course_id`.

---

## 6. Lịch tuyển sinh và vòng đời

```
[GV tạo Course Template]
         ↓
[GV tạo CourseSchedule] ← "Lịch khai giảng ngày X, giờ Y, tối đa N học viên"
         ↓
[Học viên tìm thấy & Đăng ký vào Schedule]
         ↓
     ┌──────────┐
     │ Đầy chỗ │ → Tự động hoặc GV bấm "Đóng & Mở lớp"
     └──────────┘
[Hệ thống tạo CourseClass từ Schedule]
  - Tạo group conversation cho lớp
  - Sinh danh sách live_sessions
  - enrolled_count reset về 0 (schedule đã converted)
         ↓
[GV có thể mở lại Schedule mới từ cùng Course để tuyển sinh lớp tiếp]
         ↓
[CourseClass diễn ra: ongoing → completed]
```

---

---

### 🛠️ Bước 8: Thống kê & Doanh thu (Analytics & Revenue)

> Mục tiêu: Giáo viên tự phân tích hiệu quả giảng dạy, Admin giám sát toàn hệ thống, hai bên đối chiếu doanh thu minh bạch.

---

#### 8.1 Thiết kế dữ liệu — Bảng mới

##### Bảng `course_revenue_snapshots` (Snapshot doanh thu theo lớp)
Thay vì tính toán real-time (tốn queries), hệ thống chụp lại revenue mỗi khi có sự kiện quan trọng (enrollment, refund, class completed).

```sql
CREATE TABLE course_revenue_snapshots (
  id               uuid         PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_id         uuid         NOT NULL REFERENCES course_classes(id),
  course_id        uuid         NOT NULL REFERENCES courses(id),
  teacher_id       uuid         NOT NULL REFERENCES auth.users(id),

  -- Doanh thu
  gross_revenue    numeric      NOT NULL DEFAULT 0,  -- Tổng thu trước phí
  platform_fee     numeric      NOT NULL DEFAULT 0,  -- Phí nền tảng (VD: 10%)
  net_revenue      numeric      NOT NULL DEFAULT 0,  -- Thực nhận = gross - platform_fee
  refunded_amount  numeric      NOT NULL DEFAULT 0,  -- Đã hoàn tiền

  -- Sĩ số
  enrolled_count   int4         NOT NULL DEFAULT 0,
  completed_count  int4         NOT NULL DEFAULT 0,  -- Số HV học đến cuối
  dropped_count    int4         NOT NULL DEFAULT 0,  -- Số HV bỏ giữa chừng

  -- Đánh giá (tổng hợp từ course_reviews)
  avg_rating       numeric,
  reviews_count    int4         DEFAULT 0,

  -- Thời điểm snapshot
  snapshot_type    varchar      NOT NULL
                   CHECK (snapshot_type IN ('enrollment', 'refund', 'class_completed', 'manual')),
  snapshot_at      timestamptz  NOT NULL DEFAULT now()
);
```

##### Bảng `course_reviews` (MỚI — Đánh giá khóa học/lớp học)
```sql
CREATE TABLE course_reviews (
  id               uuid         PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_id         uuid         NOT NULL REFERENCES course_classes(id),
  course_id        uuid         NOT NULL REFERENCES courses(id),
  student_id       uuid         NOT NULL REFERENCES auth.users(id),

  rating           int2         NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment          text,
  is_anonymous     boolean      NOT NULL DEFAULT false,

  -- Các chiều đánh giá chi tiết (tuỳ chọn)
  rating_content       int2     CHECK (rating_content BETWEEN 1 AND 5),  -- Nội dung hay không?
  rating_teacher       int2     CHECK (rating_teacher BETWEEN 1 AND 5),  -- GV dạy tốt không?
  rating_interaction   int2     CHECK (rating_interaction BETWEEN 1 AND 5),  -- Tương tác tốt không?

  -- Trạng thái (admin kiểm duyệt nếu cần)
  status           varchar      NOT NULL DEFAULT 'published'
                   CHECK (status IN ('published', 'hidden', 'flagged')),

  created_at       timestamptz  NOT NULL DEFAULT now(),
  updated_at       timestamptz  NOT NULL DEFAULT now(),

  UNIQUE (class_id, student_id)  -- Mỗi HV chỉ review 1 lần / 1 lớp
);
```

##### Bảng `teacher_revenue_summary` (Tổng hợp doanh thu theo tháng — dùng cho báo cáo nhanh)
```sql
CREATE TABLE teacher_revenue_summary (
  id               uuid         PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id       uuid         NOT NULL REFERENCES auth.users(id),
  period_year      int4         NOT NULL,  -- Năm: 2025, 2026...
  period_month     int4         NOT NULL CHECK (period_month BETWEEN 1 AND 12),

  -- Thống kê lớp học
  total_classes    int4         NOT NULL DEFAULT 0,  -- Số lớp đã dạy trong tháng
  completed_classes int4        NOT NULL DEFAULT 0,
  cancelled_classes int4        NOT NULL DEFAULT 0,

  -- Thống kê học viên
  new_enrollments  int4         NOT NULL DEFAULT 0,
  total_students   int4         NOT NULL DEFAULT 0,  -- Tổng HV duy nhất trong tháng

  -- Doanh thu
  gross_revenue    numeric      NOT NULL DEFAULT 0,
  platform_fee     numeric      NOT NULL DEFAULT 0,
  net_revenue      numeric      NOT NULL DEFAULT 0,
  refunded_amount  numeric      NOT NULL DEFAULT 0,

  -- Tỷ lệ hoàn thành & đánh giá
  avg_completion_rate numeric   DEFAULT 0,  -- % học viên hoàn thành lớp
  avg_rating          numeric   DEFAULT 0,

  calculated_at    timestamptz  NOT NULL DEFAULT now(),

  UNIQUE (teacher_id, period_year, period_month)
);
```

##### Bảng `student_learning_progress` (MỚI — Tiến độ học tập từng học viên)
Hỗ trợ giáo viên theo dõi từng học viên chi tiết hơn `user_learning_stats` hiện có (chỉ là tổng aggregate).

```sql
CREATE TABLE student_learning_progress (
  id                uuid         PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_id          uuid         NOT NULL REFERENCES course_classes(id),
  student_id        uuid         NOT NULL REFERENCES auth.users(id),

  -- Điểm danh
  sessions_total    int4         NOT NULL DEFAULT 0,   -- Tổng buổi học của lớp
  sessions_attended int4         NOT NULL DEFAULT 0,   -- Số buổi đã tham gia
  attendance_rate   numeric      GENERATED ALWAYS AS   -- Tự tính
                    (CASE WHEN sessions_total > 0
                     THEN ROUND(sessions_attended::numeric / sessions_total * 100, 1)
                     ELSE 0 END) STORED,

  -- Bài tập
  assignments_total     int4     NOT NULL DEFAULT 0,
  assignments_submitted int4     NOT NULL DEFAULT 0,
  assignments_passed    int4     NOT NULL DEFAULT 0,
  avg_grade             numeric  DEFAULT 0,

  -- Tổng thời gian học (tính từ session_analytics)
  total_learning_minutes int4    NOT NULL DEFAULT 0,

  -- Trạng thái tổng thể của HV trong lớp này
  progress_status   varchar      NOT NULL DEFAULT 'on_track'
                    CHECK (progress_status IN ('on_track', 'at_risk', 'completed', 'dropped')),
  -- at_risk: điểm danh < 70% hoặc bài tập nộp < 50%

  updated_at        timestamptz  NOT NULL DEFAULT now(),

  UNIQUE (class_id, student_id)
);
```

---

#### 8.2 Postgres Functions & Triggers (Tự động hoá)

```sql
-- Trigger: Sau mỗi enrollment mới → cập nhật teacher_revenue_summary và tạo snapshot
CREATE OR REPLACE FUNCTION fn_after_enrollment_insert()
RETURNS TRIGGER AS $$
BEGIN
  -- Tạo snapshot doanh thu
  INSERT INTO course_revenue_snapshots (class_id, course_id, teacher_id, ...)
  SELECT cc.id, cc.course_id, cc.teacher_id, ...
  FROM course_classes cc WHERE cc.id = NEW.class_id;

  -- Cập nhật bảng tổng hợp tháng
  INSERT INTO teacher_revenue_summary (teacher_id, period_year, period_month, ...)
  ON CONFLICT (teacher_id, period_year, period_month) DO UPDATE SET ...;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Sau mỗi buổi học kết thúc → cập nhật student_learning_progress
CREATE OR REPLACE FUNCTION fn_after_session_ended()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'ended' AND OLD.status != 'ended' THEN
    UPDATE student_learning_progress
    SET sessions_attended = sessions_attended + 1, updated_at = now()
    WHERE class_id = NEW.class_id
      AND student_id IN (SELECT user_id FROM session_participants WHERE session_id = NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

#### 8.3 Postgres Views (truy vấn nhanh, không cần JOIN phức tạp)

```sql
-- View: Tổng quan một khóa học cho giáo viên
CREATE VIEW v_course_overview AS
SELECT
  c.id AS course_id, c.title, c.teacher_id,
  COUNT(DISTINCT cc.id) AS total_classes,
  COUNT(DISTINCT cc.id) FILTER (WHERE cc.status = 'completed') AS completed_classes,
  COUNT(DISTINCT ce.id) AS total_enrollments,
  SUM(crs.gross_revenue) AS lifetime_gross_revenue,
  SUM(crs.net_revenue) AS lifetime_net_revenue,
  ROUND(AVG(cr.rating), 1) AS avg_rating,
  COUNT(DISTINCT cr.id) AS total_reviews
FROM courses c
LEFT JOIN course_classes cc ON cc.course_id = c.id
LEFT JOIN course_enrollments ce ON ce.class_id = cc.id
LEFT JOIN course_revenue_snapshots crs ON crs.class_id = cc.id AND crs.snapshot_type = 'class_completed'
LEFT JOIN course_reviews cr ON cr.course_id = c.id
GROUP BY c.id, c.title, c.teacher_id;

-- View: Dashboard tháng của giáo viên
CREATE VIEW v_teacher_monthly_dashboard AS
SELECT
  trs.*,
  ROUND(net_revenue / NULLIF(total_students, 0), 0) AS revenue_per_student,
  ROUND(completed_classes::numeric / NULLIF(total_classes, 0) * 100, 1) AS class_completion_rate
FROM teacher_revenue_summary trs;
```

---

#### 8.4 API Endpoints — `analyticsController.js` (MỚI)

**Dành cho Giáo viên (phân tích cá nhân):**
```
GET /teacher/analytics/overview
  → Tổng overview: tổng khóa học, tổng lớp, tổng học viên, tổng doanh thu lifetime

GET /teacher/analytics/revenue?year=2026&month=4
  → Doanh thu tháng cụ thể (từ teacher_revenue_summary)
  → Breakdown theo từng class

GET /teacher/analytics/revenue/chart?range=12months
  → Mảng 12 tháng gần nhất để vẽ biểu đồ doanh thu

GET /teacher/analytics/courses
  → Danh sách khóa học kèm: tổng lớp, tổng học viên, avg_rating, total_revenue
  → Sort được: by revenue, by rating, by enrollments

GET /teacher/analytics/classes/:classId
  → Chi tiết phân tích 1 lớp: điểm danh, bài tập, rating, doanh thu lớp đó

GET /teacher/analytics/students/:classId
  → Bảng tiến độ từng học viên trong lớp (từ student_learning_progress)
  → Highlight học viên "at_risk"

GET /teacher/analytics/reviews
  → Danh sách đánh giá học viên, có thể lọc by course/class/rating
```

**Dành cho Admin (giám sát toàn hệ thống):**
```
GET /admin/analytics/revenue/overview
  → Tổng doanh thu hệ thống: gross, platform_fee thu được, net đã trả GV
  → Filter: by period (month/quarter/year)

GET /admin/analytics/revenue/teachers?period=2026-04
  → Bảng xếp hạng giáo viên theo doanh thu tháng
  → Cột: teacher_name | total_classes | total_students | gross | platform_fee | net_paid

GET /admin/analytics/revenue/breakdown/:teacherId?year=2026
  → Doanh thu chi tiết theo từng tháng của 1 GV cụ thể (để đối chiếu với GV)

GET /admin/analytics/courses/top
  → Top khóa học: by revenue, by enrollment, by rating

GET /admin/analytics/platform/summary
  → KPIs tổng: MAU (monthly active users), new teachers, new students,
    gross_revenue, churn_rate, avg_class_size
```

---

#### 8.5 Chiều phân tích chính (Analytics Dimensions)

| Chiều | Giáo viên | Admin |
|---|---|---|
| **Doanh thu** | Thu nhập theo tháng/quý/năm | Tổng platform fee, tổng thanh toán cho GV |
| **Hiệu quả lớp học** | % học viên hoàn thành, tỷ lệ bỏ học | So sánh giữa các GV |
| **Học viên** | Học viên at-risk, top performers | Retention rate toàn hệ thống |
| **Đánh giá** | Rating trung bình, comments, xu hướng | GV có rating thấp cần hỗ trợ |
| **Khóa học** | Khóa nào chạy tốt nhất, khóa nào ế | Khóa học nào phổ biến nhất hệ thống |
| **Lịch tuyển sinh** | Schedule nào fill nhanh nhất | Xu hướng thời gian học trong tuần |

---

#### 8.6 Chiến lược tính phí nền tảng (Platform Fee)

```
Khi học viên thanh toán → orders.total_price = X
  platform_fee = X * platform_fee_rate    (VD: 10%, lưu trong config bảng settings)
  teacher_net  = X * (1 - platform_fee_rate)

Ghi vào:
  transactions (wallet giáo viên) → type=IN, amount=teacher_net
  course_revenue_snapshots → gross=X, platform_fee=fee, net=teacher_net
  teacher_revenue_summary → cộng dồn vào tháng tương ứng
```

---

> [!IMPORTANT]
> **Điểm quan trọng về backward compatibility:** Trong giai đoạn chuyển đổi, API cũ vẫn cần hoạt động song song. Không được xóa `courses.course_id` và `live_sessions.course_id` cho đến khi Mobile App đã được cập nhật toàn bộ.

> [!NOTE]
> **Về `orders` table:** Hiện tại `orders` có cột `course_id` (uuid). Sau khi refactor, sẽ cần thêm cột `class_id` để đơn hàng chính xác ghi nhận học viên đăng ký vào lớp nào, không chỉ khóa nào.
