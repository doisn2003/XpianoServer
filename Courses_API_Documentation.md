# Courses API Documentation

> **Version:** 2.0 | **Base URL:** `{{baseUrl}}` (e.g. `http://localhost:3000`)
> **Auth:** Bearer token — đính kèm header `Authorization: Bearer <jwt_token>`
>
> Hệ thống áp dụng kiến trúc **3 tầng**:
> `Course (Template)` → `CourseSchedule (Lịch tuyển sinh)` → `CourseClass (Lớp học thực sự)`
>
> **Database relationships:**
> - `courses` ← 1:N → `course_schedules` ← 1:1 → `course_classes`
> - `course_classes` ← 1:N → `course_enrollments` (học viên)
> - `course_classes` ← 1:N → `live_sessions` (buổi học)
> - `course_classes` ← 1:N → `class_assignments` ← 1:N → `class_assignment_submissions`
> - `course_classes` ← 1:N → `class_announcements`
> - `course_classes` ← 1:N → `student_learning_progress`
> - `courses` / `course_classes` ← 1:N → `course_reviews`
> - `course_classes` ← 1:N → `course_revenue_snapshots`
> - `teacher_revenue_summary` (aggregated monthly, per teacher)

---

## 📁 Collection 1: Courses (Template)

**Route:** `/api/courses`
**Controller:** `courseController.js`

> Course là **template nội dung** — luôn có thể CRUD kể cả sau khi active.
> Không chứa lịch học hay sĩ số, những thứ đó thuộc về `CourseSchedule`.

---

### 1.1 GET — Danh sách khóa học (Public)

**Endpoint:** `GET /api/courses`
**Auth:** Optional

| Query | Type | Mô tả |
|---|---|---|
| `level` | string | `beginner` \| `intermediate` \| `advanced` |
| `category` | string | Thể loại (classic, jazz, pop...) |
| `search` | string | Tìm kiếm theo tiêu đề |
| `cursor` | ISO string | Cursor-based pagination |
| `limit` | int | Số lượng (default: 20, max: 50) |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "title": "Piano cơ bản",
      "level": "beginner",
      "category": "classic",
      "price": 1500000,
      "thumbnail_url": "...",
      "teacher": { "id": "uuid", "full_name": "Nguyen Van A", "avatar_url": "..." }
    }
  ],
  "pagination": { "has_more": true, "next_cursor": "ISO_timestamp", "count": 20 }
}
```

---

### 1.2 GET — Chi tiết khóa học (Public)

**Endpoint:** `GET /api/courses/:id`
**Auth:** Optional

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "Piano cơ bản",
    "description": "...",
    "level": "beginner",
    "category": "classic",
    "price": 1500000,
    "duration_weeks": 8,
    "objectives": ["Mục tiêu 1", "Mục tiêu 2"],
    "requirements": ["Biết đọc nốt nhạc"],
    "syllabus": [{"week": 1, "topic": "Tư thế tay"}],
    "musicxml_files": [{"title": "Bài 1", "file_url": "..."}],
    "teacher": { "id": "uuid", "full_name": "...", "avatar_url": "..." },
    "open_schedules": [
      {
        "id": "uuid",
        "name": "Lịch sáng T2-T4",
        "start_date": "2026-04-15",
        "max_students": 10,
        "enrolled_count": 3,
        "price": 1500000,
        "status": "enrolling"
      }
    ],
    "review_summary": { "avg_rating": 4.7, "total_reviews": 23 }
  }
}
```

---

### 1.3 GET — Khóa học của 1 giáo viên (Public)

**Endpoint:** `GET /api/courses/teacher/:teacherId`
**Auth:** Optional

---

### 1.4 GET — Khóa học đang học của tôi (Student)

**Endpoint:** `GET /api/courses/me/enrolled`
**Auth:** Required

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "enrollment_id": "uuid",
      "payment_verified": true,
      "enrolled_at": "2026-03-01T...",
      "course": { "id": "...", "title": "Piano cơ bản", "teacher": {...} },
      "class":  { "id": "...", "name": "Lớp T2-T4 tháng 4", "start_date": "2026-04-15", "status": "upcoming" }
    }
  ]
}
```

---

### 1.5 GET — Khóa học đang dạy của tôi (Teacher)

**Endpoint:** `GET /api/courses/me/teaching`
**Auth:** Required

| Query | Mô tả |
|---|---|
| `status` | `draft` \| `active` \| `archived` |

---

### 1.6 POST — Tạo khóa học mới (Teacher)

**Endpoint:** `POST /api/courses`
**Auth:** Required (teacher/admin)

**Body:**
```json
{
  "title": "Piano nâng cao",
  "description": "Mô tả...",
  "price": 2000000,
  "duration_weeks": 12,
  "level": "advanced",
  "category": "classic",
  "thumbnail_url": "https://...",
  "cover_url": "https://...",
  "demo_video_url": "https://...",
  "objectives": ["Có thể chơi Beethoven"],
  "requirements": ["Hoàn thành khóa cơ bản"],
  "syllabus": [{"week": 1, "topic": "Bản nhạc khó"}],
  "musicxml_files": [{"title": "Sonata No.1", "file_url": "https://..."}]
}
```

**Response:** `201 Created` — trả về `data` là bản ghi mới với `status: "draft"`.

---

### 1.7 PUT — Cập nhật khóa học (Teacher)

**Endpoint:** `PUT /api/courses/:id`
**Auth:** Required (owner/admin)
> ⚡ Có thể sửa BẤT KỲ LÚC NÀO, kể cả khi đang `active`.

**Body:** Bất kỳ trường nào trong danh sách: `title, description, price, duration_weeks, level, category, thumbnail_url, cover_url, demo_video_url, objectives, requirements, syllabus, musicxml_files`

---

### 1.8 PUT — Kích hoạt khóa học (Teacher)

**Endpoint:** `PUT /api/courses/:id/activate`
**Auth:** Required (owner/admin)

> Chuyển `draft` → `active`. Sau đó mới có thể tạo lịch tuyển sinh.

---

### 1.9 PUT — Lưu trữ khóa học (Teacher)

**Endpoint:** `PUT /api/courses/:id/archive`
**Auth:** Required (owner/admin)

> Chuyển sang `archived`. Không thể tạo lịch mới. Kiểm tra không có lớp `ongoing`.

---

### 1.10 DELETE — Xóa khóa học (Teacher)

**Endpoint:** `DELETE /api/courses/:id`
**Auth:** Required (owner/admin)

> Chỉ xóa được khi chưa có lớp học nào (`course_classes`). Nếu đã có → dùng `/archive`.

---

### 1.11 GET — Danh sách học viên của khóa (Teacher)

**Endpoint:** `GET /api/courses/:id/enrollments`
**Auth:** Required (owner/admin)

---

### 1.12 GET — Thống kê (Admin)

**Endpoint:** `GET /api/courses/admin/stats`
**Auth:** Required (admin)

---

## 📁 Collection 2: Course Schedules (Lịch tuyển sinh)

**Route:** `/api/courses/:courseId/schedules` và `/api/schedules`
**Controller:** `scheduleController.js`

> Lịch tuyển sinh = Đợt mở lớp. Sau khi đóng gói (`/convert`), sinh ra 1 `CourseClass` thực sự.

---

### 2.1 GET — Danh sách lịch tuyển sinh của khóa

**Endpoint:** `GET /api/courses/:courseId/schedules`
**Auth:** Optional (public chỉ thấy `enrolling`, GV thấy tất cả)

| Query | Mô tả |
|---|---|
| `status` | `enrolling` \| `closed` \| `converted` (GV sử dụng) |

---

### 2.2 POST — Tạo lịch tuyển sinh mới (Teacher)

**Endpoint:** `POST /api/courses/:courseId/schedules`
**Auth:** Required (owner/admin)

> Course phải đang `active`. Không được tạo lịch cho course `archived` hoặc `draft`.

**Body:**
```json
{
  "name": "Lịch học sáng T2-T4 tháng 4",
  "start_date": "2026-04-15",
  "duration_weeks": 8,
  "sessions_per_week": 2,
  "schedule": [
    { "day_of_week": 2, "time": "09:00", "duration_minutes": 90 },
    { "day_of_week": 4, "time": "09:00", "duration_minutes": 90 }
  ],
  "is_online": true,
  "location": null,
  "max_students": 8,
  "price": 1500000,
  "requires_payment": true
}
```

> `day_of_week`: 0=Chủ nhật, 1=Thứ 2, ..., 6=Thứ 7

---

### 2.3 GET — Chi tiết lịch

**Endpoint:** `GET /api/schedules/:id`
**Auth:** Optional

---

### 2.4 PUT — Cập nhật lịch (Teacher)

**Endpoint:** `PUT /api/schedules/:id`
**Auth:** Required (owner/admin)

> Chỉ sửa được khi `status = enrolling`.

---

### 2.5 DELETE — Xóa lịch (Teacher)

**Endpoint:** `DELETE /api/schedules/:id`
**Auth:** Required (owner/admin)

> Chỉ xóa được khi `enrolled_count = 0` và chưa `converted`.

---

### 2.6 POST — Đóng tuyển sinh

**Endpoint:** `POST /api/schedules/:id/close`
**Auth:** Required (owner/admin)

> Chuyển `enrolling` → `closed` thủ công.

---

### 2.7 ⚡ POST — Đóng gói → Tạo Lớp học (Teacher)

**Endpoint:** `POST /api/schedules/:id/convert`
**Auth:** Required (owner/admin)

> **Công việc thực hiện tự động:**
> 1. Auto-close lịch nếu đang `enrolling`
> 2. Tính `end_date` = `start_date` + `duration_weeks * 7 ngày`
> 3. Tạo bản ghi `course_classes` với `schedule_snapshot`
> 4. Tạo `Conversation` nhóm cho lớp học
> 5. Thêm GV + học viên đã enrolled vào conversation
> 6. Sinh tất cả `live_sessions` theo lịch học
> 7. Cập nhật `course_enrollments.class_id`
> 8. Khởi tạo `student_learning_progress` cho từng học viên
> 9. Đánh dấu schedule → `converted`

**Body (optional):**
```json
{ "class_name": "Lớp Piano cơ bản - T4/2026" }
```

**Response:**
```json
{
  "success": true,
  "message": "Đã tạo lớp học thành công với 16 buổi học",
  "data": {
    "class": { "id": "uuid", "name": "Lớp Piano cơ bản - T4/2026", "start_date": "2026-04-15" },
    "sessions_generated": 16,
    "students_enrolled": 5
  }
}
```

---

## 📁 Collection 3: Course Classes (Lớp học)

**Route:** `/api/classes`
**Controller:** `classController.js`

> Lớp học thực sự sau khi schedule đã được `/convert`. Chứa sessions, assignments, announcements, chat.

---

### 3.1 GET — Chi tiết lớp học

**Endpoint:** `GET /api/classes/:id`
**Auth:** Required (teacher hoặc enrolled student)

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Lớp Piano cơ bản - T4/2026",
    "start_date": "2026-04-15",
    "end_date": "2026-06-15",
    "is_online": true,
    "status": "ongoing",
    "conversation_id": "uuid",
    "course": { "id": "...", "title": "...", "syllabus": [...], "musicxml_files": [...] },
    "stats": { "totalStudents": 5, "totalSessions": 16, "completedSessions": 4 },
    "is_teacher": true
  }
}
```

---

### 3.2 GET — Danh sách học viên + tiến độ (Teacher)

**Endpoint:** `GET /api/classes/:id/students`
**Auth:** Required (teacher/admin)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "enrollment_id": "uuid",
      "payment_verified": true,
      "enrolled_at": "...",
      "student": { "id": "...", "full_name": "Tran Thi B", "avatar_url": "..." },
      "progress": {
        "sessions_attended": 3,
        "sessions_total": 16,
        "assignments_submitted": 2,
        "assignments_total": 4,
        "total_learning_minutes": 270,
        "progress_status": "on_track"
      }
    }
  ]
}
```

---

### 3.3 PUT — Cập nhật trạng thái lớp (Teacher)

**Endpoint:** `PUT /api/classes/:id/status`
**Auth:** Required (teacher/admin)

**Body:**
```json
{ "status": "ongoing" }
```

> Vòng đời: `upcoming` → `ongoing` → `completed` | `cancelled`

---

### 3.4 GET — Lớp học đang dạy của GV

**Endpoint:** `GET /api/classes/teacher/my`
**Auth:** Required (teacher)

| Query | Mô tả |
|---|---|
| `status` | Filter theo trạng thái lớp |

---

### 3.5 GET — Lớp học đang tham gia của học viên

**Endpoint:** `GET /api/classes/student/my`
**Auth:** Required (student)

---

## 📁 Collection 4: Announcements (Thông báo lớp)

**Route:** `/api/classes/:classId/announcements` và `/api/classes/announcements/:id`

---

### 4.1 POST — Tạo thông báo (Teacher)

**Endpoint:** `POST /api/classes/:classId/announcements`
**Auth:** Required (teacher/admin)

**Body:**
```json
{
  "title": "Lịch học thay đổi tuần tới",
  "content": "Buổi học thứ 5 sẽ dời sang thứ 6...",
  "attachment_urls": ["https://..."],
  "is_pinned": true
}
```

---

### 4.2 GET — Danh sách thông báo

**Endpoint:** `GET /api/classes/:classId/announcements`
**Auth:** Required (teacher hoặc enrolled student)

> Thông báo pinned xuất hiện trước. Sắp xếp: `is_pinned DESC`, `created_at DESC`.

---

### 4.3 PUT — Sửa thông báo (Teacher)

**Endpoint:** `PUT /api/classes/announcements/:id`
**Auth:** Required (owner/admin)

---

### 4.4 DELETE — Xóa thông báo (Teacher)

**Endpoint:** `DELETE /api/classes/announcements/:id`
**Auth:** Required (owner/admin)

---

## 📁 Collection 5: Assignments (Bài tập)

**Route:** `/api/classes/:classId/assignments` và `/api/classes/assignments/:id`

---

### 5.1 POST — Giao bài tập (Teacher)

**Endpoint:** `POST /api/classes/:classId/assignments`
**Auth:** Required (teacher/admin)

**Body:**
```json
{
  "title": "Luyện gam C trưởng",
  "description": "Chơi cả tay trong 2 quãng tám...",
  "musicxml_url": "https://storage.../bai1.musicxml",
  "attachment_urls": [],
  "due_date": "2026-04-30T23:59:59Z",
  "session_id": "uuid_session"
}
```

---

### 5.2 GET — Danh sách bài tập

**Endpoint:** `GET /api/classes/:classId/assignments`
**Auth:** Required (teacher/student)

> Student nhận thêm `my_submission` cho mỗi bài (trạng thái nộp bài của họ).

---

### 5.3 GET — Chi tiết bài tập

**Endpoint:** `GET /api/classes/assignments/:id`
**Auth:** Required

---

### 5.4 PUT — Sửa bài tập (Teacher)

**Endpoint:** `PUT /api/classes/assignments/:id`
**Auth:** Required (teacher/admin)

---

### 5.5 DELETE — Xóa bài tập (Teacher)

**Endpoint:** `DELETE /api/classes/assignments/:id`
**Auth:** Required (teacher/admin)

---

### 5.6 POST — Nộp bài (Student)

**Endpoint:** `POST /api/classes/assignments/:id/submit`
**Auth:** Required (enrolled student)

> Kiểm tra: chưa quá `due_date`, chưa nộp trước đó.

**Body:**
```json
{
  "musicxml_url": "https://storage.../bai_nop.musicxml",
  "attachment_urls": ["https://..."],
  "note": "Em chơi ở tốc độ 80 BPM thay vì 100 vì chưa thuần thục"
}
```

---

### 5.7 PUT — Sửa bài đã nộp (Student)

**Endpoint:** `PUT /api/classes/submissions/:id`
**Auth:** Required (owner)

> Chỉ sửa được khi: chưa được chấm (`reviewed_at = null`) và chưa quá `due_date`.

---

### 5.8 GET — Tất cả bài nộp (Teacher)

**Endpoint:** `GET /api/classes/assignments/:id/submissions`
**Auth:** Required (teacher/admin)

**Response:**
```json
{
  "success": true,
  "assignment_title": "Luyện gam C trưởng",
  "data": [
    {
      "id": "uuid",
      "musicxml_url": "...",
      "note": "...",
      "teacher_feedback": null,
      "grade": null,
      "reviewed_at": null,
      "student": { "full_name": "Tran Thi B", "avatar_url": "..." }
    }
  ]
}
```

---

### 5.9 PUT — Chấm bài (Teacher)

**Endpoint:** `PUT /api/classes/submissions/:id/grade`
**Auth:** Required (teacher/admin)

**Body:**
```json
{
  "teacher_feedback": "Tốt! Tay phải chuẩn, tay trái cần luyện thêm...",
  "grade": "B+"
}
```

> `grade` có thể là: `A+`, `A`, `B+`, `B`, `C`, `pass`, `needs_work`, `F`

---

## 📁 Collection 6: Reviews (Đánh giá)

**Route:** `/api/reviews/*`

---

### 6.1 POST — Đánh giá lớp học (Student)

**Endpoint:** `POST /api/reviews/classes/:classId`
**Auth:** Required (enrolled student)

**Body:**
```json
{
  "rating": 5,
  "comment": "Giáo viên nhiệt tình, nội dung bài học rõ ràng...",
  "is_anonymous": false,
  "rating_content": 5,
  "rating_teacher": 5,
  "rating_interaction": 4
}
```

---

### 6.2 PUT — Sửa đánh giá (Student)

**Endpoint:** `PUT /api/reviews/:id`
**Auth:** Required (owner)

---

### 6.3 GET — Reviews của 1 khóa học

**Endpoint:** `GET /api/reviews/courses/:courseId`
**Auth:** Optional

> Anonymous reviews không hiển thị `student` info.

---

### 6.4 GET — Reviews của 1 lớp học

**Endpoint:** `GET /api/reviews/classes/:classId`
**Auth:** Optional

---

### 6.5 PUT — Admin kiểm duyệt review

**Endpoint:** `PUT /api/admin/reviews/:id/status`
**Auth:** Required (admin)

**Body:**
```json
{ "status": "hidden" }
```

> `status`: `published` | `hidden` | `flagged`

---

## 📁 Collection 7: Analytics & Revenue (Thống kê)

**Route:** `/api/analytics/*`

### 7.1 Teacher Analytics

---

#### 7.1.1 GET — Tổng overview của GV

**Endpoint:** `GET /api/analytics/teacher/overview`
**Auth:** Required (teacher)

**Response:**
```json
{
  "success": true,
  "data": {
    "courses":   { "total": 5, "active": 3 },
    "classes":   { "total": 12, "ongoing": 2 },
    "students":  { "total": 48 },
    "revenue":   { "lifetime_gross": 72000000, "lifetime_net": 61200000 },
    "rating":    { "avg_rating": 4.7, "total_reviews": 34 }
  }
}
```

---

#### 7.1.2 GET — Doanh thu tháng cụ thể

**Endpoint:** `GET /api/analytics/teacher/revenue?year=2026&month=3`
**Auth:** Required (teacher)

**Response:**
```json
{
  "data": {
    "summary": {
      "gross_revenue": 9000000,
      "net_revenue": 7650000,
      "platform_fee": 1350000,
      "total_classes": 2,
      "total_students": 12,
      "avg_rating": 4.8
    },
    "classes_this_month": [...]
  }
}
```

---

#### 7.1.3 GET — Biểu đồ doanh thu 12 tháng

**Endpoint:** `GET /api/analytics/teacher/revenue/chart?range=12`
**Auth:** Required (teacher)

> Trả về mảng theo thứ tự thời gian, mỗi phần tử là 1 tháng. Frontend vẽ line/bar chart.

---

#### 7.1.4 GET — Ranking khóa học của GV

**Endpoint:** `GET /api/analytics/teacher/courses?sort=revenue`
**Auth:** Required (teacher)

| Query | Mô tả |
|---|---|
| `sort` | `revenue` \| `rating` \| `enrollments` |

---

#### 7.1.5 GET — Phân tích 1 lớp học

**Endpoint:** `GET /api/analytics/teacher/classes/:classId`
**Auth:** Required (teacher/admin)

**Response:**
```json
{
  "data": {
    "students":    { "total": 8, "at_risk": 1 },
    "sessions":    { "total": 16, "completed": 6, "completion_rate": 38 },
    "assignments": { "total": 4, "submissions": 22, "submission_rate": 69 },
    "rating":      { "avg_rating": 4.5, "total_reviews": 3 },
    "revenue":     { "gross_revenue": 12000000, "net_revenue": 10200000, "platform_fee": 1800000 }
  }
}
```

---

#### 7.1.6 GET — Tiến độ từng học viên trong lớp

**Endpoint:** `GET /api/analytics/teacher/students/:classId`
**Auth:** Required (teacher/admin)

> Đọc từ view `v_class_student_progress`, kèm `attendance_rate` tính sẵn.

| progress_status | Ý nghĩa |
|---|---|
| `on_track` | Học bình thường |
| `at_risk` | Vắng nhiều hoặc không nộp bài |
| `completed` | Hoàn thành khóa |
| `dropped` | Bỏ học |

---

#### 7.1.7 GET — Danh sách reviews nhận được

**Endpoint:** `GET /api/analytics/teacher/reviews?courseId=xxx&rating=5`
**Auth:** Required (teacher)

---

### 7.2 Admin Analytics

---

#### 7.2.1 GET — Tổng doanh thu nền tảng

**Endpoint:** `GET /api/analytics/admin/revenue?year=2026&month=3`
**Auth:** Required (admin)

**Response:**
```json
{
  "data": {
    "total_gross": 180000000,
    "total_net":   153000000,
    "total_fee":    27000000,
    "total_refunded": 3000000,
    "period": { "year": 2026, "month": 3 }
  }
}
```

---

#### 7.2.2 GET — Bảng xếp hạng giáo viên (doanh thu)

**Endpoint:** `GET /api/analytics/admin/teachers?year=2026&month=3`
**Auth:** Required (admin)

> Đọc từ view `v_teacher_monthly_dashboard`, kèm `revenue_per_student` và `class_completion_rate`.

---

#### 7.2.3 GET — Doanh thu chi tiết 1 giáo viên theo tháng

**Endpoint:** `GET /api/analytics/admin/teachers/:teacherId?year=2026`
**Auth:** Required (admin)

---

#### 7.2.4 GET — Top khóa học

**Endpoint:** `GET /api/analytics/admin/courses/top?sort=revenue&limit=10`
**Auth:** Required (admin)

---

#### 7.2.5 GET — KPIs nền tảng

**Endpoint:** `GET /api/analytics/admin/platform`
**Auth:** Required (admin)

**Response:**
```json
{
  "data": {
    "totalCourses": 42,
    "totalClasses": 105,
    "ongoingClasses": 8,
    "totalTeachers": 12,
    "totalStudents": 380,
    "totalEnrollments": 620
  }
}
```

---

## 🗂️ Database Schema Map

```
courses (Template)
├── id, teacher_id, title, description, price, duration_weeks
├── level [beginner|intermediate|advanced]
├── category
├── thumbnail_url, cover_url, demo_video_url
├── objectives[], requirements[], syllabus JSONB, musicxml_files JSONB
└── status [draft|active|archived]

course_schedules (Lịch tuyển sinh)
├── id, course_id, teacher_id
├── name, start_date, duration_weeks, sessions_per_week
├── schedule JSONB [{day_of_week, time, duration_minutes}]
├── is_online, location
├── max_students, enrolled_count (auto-trigger)
├── price, requires_payment
└── status [enrolling|closed|converted]

course_classes (Lớp học thực sự)
├── id, course_id, schedule_id (nullable), teacher_id
├── name, start_date, end_date
├── schedule_snapshot JSONB (copy cứng từ schedule)
├── is_online, location
├── conversation_id → conversations
└── status [upcoming|ongoing|completed|cancelled]

course_enrollments
├── id, course_id (backward compat), class_id, user_id, order_id
├── payment_verified
└── status

live_sessions
├── (existing columns...)
└── class_id (NEW) → course_classes

class_assignments
├── id, class_id, teacher_id, session_id (nullable)
├── title, description, musicxml_url, attachment_urls, due_date

class_assignment_submissions
├── id, assignment_id, student_id
├── musicxml_url, attachment_urls, note
├── teacher_feedback, grade, reviewed_at
└── UNIQUE(assignment_id, student_id)

class_announcements
├── id, class_id, teacher_id
├── title, content, attachment_urls, is_pinned

course_reviews
├── id, class_id, course_id, student_id
├── rating (1-5), comment, is_anonymous
├── rating_content, rating_teacher, rating_interaction
├── status [published|hidden|flagged]
└── UNIQUE(class_id, student_id)

course_revenue_snapshots
├── id, class_id, course_id, teacher_id
├── gross_revenue, platform_fee, net_revenue, refunded_amount
├── enrolled_count, completed_count, dropped_count
├── avg_rating, reviews_count
└── snapshot_type [enrollment|refund|class_completed|manual]

teacher_revenue_summary (aggregated)
├── teacher_id, period_year, period_month
├── total_classes, completed_classes, cancelled_classes
├── new_enrollments, total_students
├── gross_revenue, platform_fee, net_revenue, refunded_amount
├── avg_completion_rate, avg_rating
└── UNIQUE(teacher_id, period_year, period_month)

student_learning_progress
├── class_id, student_id
├── sessions_total, sessions_attended
├── assignments_total, assignments_submitted, assignments_passed
├── avg_grade, total_learning_minutes
├── progress_status [on_track|at_risk|completed|dropped]
└── UNIQUE(class_id, student_id)
```

---

## ⚡ Error Codes

| HTTP | Ý nghĩa |
|---|---|
| 400 | Bad Request — thiếu field, sai giá trị, vi phạm business logic |
| 401 | Unauthorized — thiếu hoặc sai JWT |
| 403 | Forbidden — đúng token nhưng không đủ quyền |
| 404 | Not Found |
| 409 | Conflict — duplicate (ví dụ: review 2 lần) |
| 500 | Internal Server Error |

**Response format chuẩn:**
```json
{ "success": false, "message": "Mô tả lỗi cho người dùng", "error": "Technical error string" }
```

---

## 📋 Route Summary Table

| Method | Endpoint | Controller | Auth |
|---|---|---|---|
| GET | `/api/courses` | courseController | Optional |
| GET | `/api/courses/me/enrolled` | courseController | Student |
| GET | `/api/courses/me/teaching` | courseController | Teacher |
| GET | `/api/courses/admin/stats` | courseController | Admin |
| GET | `/api/courses/teacher/:teacherId` | courseController | Optional |
| GET | `/api/courses/:id` | courseController | Optional |
| GET | `/api/courses/:id/enrollments` | courseController | Teacher |
| POST | `/api/courses` | courseController | Teacher |
| PUT | `/api/courses/:id` | courseController | Teacher |
| PUT | `/api/courses/:id/activate` | courseController | Teacher |
| PUT | `/api/courses/:id/archive` | courseController | Teacher |
| DELETE | `/api/courses/:id` | courseController | Teacher |
| GET | `/api/courses/:courseId/schedules` | scheduleController | Optional |
| POST | `/api/courses/:courseId/schedules` | scheduleController | Teacher |
| GET | `/api/schedules/:id` | scheduleController | Optional |
| PUT | `/api/schedules/:id` | scheduleController | Teacher |
| DELETE | `/api/schedules/:id` | scheduleController | Teacher |
| POST | `/api/schedules/:id/close` | scheduleController | Teacher |
| POST | `/api/schedules/:id/convert` | scheduleController | Teacher |
| GET | `/api/classes/teacher/my` | classController | Teacher |
| GET | `/api/classes/student/my` | classController | Student |
| GET | `/api/classes/:id` | classController | Enrolled |
| GET | `/api/classes/:id/students` | classController | Teacher |
| PUT | `/api/classes/:id/status` | classController | Teacher |
| POST | `/api/classes/:classId/announcements` | classController | Teacher |
| GET | `/api/classes/:classId/announcements` | classController | Enrolled |
| PUT | `/api/classes/announcements/:id` | classController | Teacher |
| DELETE | `/api/classes/announcements/:id` | classController | Teacher |
| POST | `/api/classes/:classId/assignments` | assignmentController | Teacher |
| GET | `/api/classes/:classId/assignments` | assignmentController | Enrolled |
| GET | `/api/classes/assignments/:id` | assignmentController | Enrolled |
| PUT | `/api/classes/assignments/:id` | assignmentController | Teacher |
| DELETE | `/api/classes/assignments/:id` | assignmentController | Teacher |
| POST | `/api/classes/assignments/:id/submit` | assignmentController | Student |
| PUT | `/api/classes/submissions/:id` | assignmentController | Student |
| GET | `/api/classes/assignments/:id/submissions` | assignmentController | Teacher |
| PUT | `/api/classes/submissions/:id/grade` | assignmentController | Teacher |
| POST | `/api/reviews/classes/:classId` | courseReviewController | Student |
| PUT | `/api/reviews/:id` | courseReviewController | Owner |
| GET | `/api/reviews/courses/:courseId` | courseReviewController | Optional |
| GET | `/api/reviews/classes/:classId` | courseReviewController | Optional |
| PUT | `/api/admin/reviews/:id/status` | courseReviewController | Admin |
| GET | `/api/analytics/teacher/overview` | courseAnalyticsController | Teacher |
| GET | `/api/analytics/teacher/revenue` | courseAnalyticsController | Teacher |
| GET | `/api/analytics/teacher/revenue/chart` | courseAnalyticsController | Teacher |
| GET | `/api/analytics/teacher/courses` | courseAnalyticsController | Teacher |
| GET | `/api/analytics/teacher/classes/:classId` | courseAnalyticsController | Teacher |
| GET | `/api/analytics/teacher/students/:classId` | courseAnalyticsController | Teacher |
| GET | `/api/analytics/teacher/reviews` | courseAnalyticsController | Teacher |
| GET | `/api/analytics/admin/revenue` | courseAnalyticsController | Admin |
| GET | `/api/analytics/admin/teachers` | courseAnalyticsController | Admin |
| GET | `/api/analytics/admin/teachers/:teacherId` | courseAnalyticsController | Admin |
| GET | `/api/analytics/admin/courses/top` | courseAnalyticsController | Admin |
| GET | `/api/analytics/admin/platform` | courseAnalyticsController | Admin |
