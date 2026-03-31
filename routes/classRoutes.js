const express = require('express');
const router = express.Router();
const ClassController = require('../controllers/classController');
const AssignmentController = require('../controllers/assignmentController');
const { authenticate, optionalAuthenticate } = require('../middlewares/authMiddleware');

// ─── TEACHER / STUDENT OVERVIEW ──────────────────────────────────────────────
// GET /api/classes/teacher/my        — Lớp học do GV đang dạy
router.get('/teacher/my', authenticate, ClassController.getMyTeachingClasses);

// GET /api/classes/student/my        — Lớp học học viên đang tham gia
router.get('/student/my', authenticate, ClassController.getMyEnrolledClasses);

// ─── CLASS CRUD ───────────────────────────────────────────────────────────────
// GET  /api/classes/:id              — Chi tiết lớp học
router.get('/:id', authenticate, ClassController.getClass);

// GET  /api/classes/:id/students     — Danh sách học viên (teacher)
router.get('/:id/students', authenticate, ClassController.getClassStudents);

// PUT  /api/classes/:id/status       — Cập nhật trạng thái lớp (teacher)
router.put('/:id/status', authenticate, ClassController.updateClassStatus);

// ─── ANNOUNCEMENTS ───────────────────────────────────────────────────────────
// POST /api/classes/:classId/announcements   — Tạo thông báo (teacher)
router.post('/:classId/announcements', authenticate, ClassController.createAnnouncement);

// GET  /api/classes/:classId/announcements   — Danh sách thông báo (teacher/student)
router.get('/:classId/announcements', authenticate, ClassController.getAnnouncements);

// PUT  /api/announcements/:id                — Sửa thông báo (teacher)
router.put('/announcements/:id', authenticate, ClassController.updateAnnouncement);

// DELETE /api/announcements/:id              — Xóa thông báo (teacher)
router.delete('/announcements/:id', authenticate, ClassController.deleteAnnouncement);

// ─── ASSIGNMENTS ──────────────────────────────────────────────────────────────
// POST /api/classes/:classId/assignments     — Giao bài tập (teacher)
router.post('/:classId/assignments', authenticate, AssignmentController.createAssignment);

// GET  /api/classes/:classId/assignments     — Danh sách bài tập
router.get('/:classId/assignments', authenticate, AssignmentController.getAssignments);

// GET  /api/assignments/:id                  — Chi tiết bài tập
router.get('/assignments/:id', authenticate, AssignmentController.getAssignment);

// PUT  /api/assignments/:id                  — Sửa bài tập (teacher)
router.put('/assignments/:id', authenticate, AssignmentController.updateAssignment);

// DELETE /api/assignments/:id                — Xóa bài tập (teacher)
router.delete('/assignments/:id', authenticate, AssignmentController.deleteAssignment);

// ─── SUBMISSIONS ──────────────────────────────────────────────────────────────
// POST /api/assignments/:id/submit           — Học viên nộp bài
router.post('/assignments/:id/submit', authenticate, AssignmentController.submitAssignment);

// PUT  /api/submissions/:id                  — Học viên sửa bài (trước due_date)
router.put('/submissions/:id', authenticate, AssignmentController.updateSubmission);

// GET  /api/assignments/:id/submissions      — Tất cả bài nộp (teacher)
router.get('/assignments/:id/submissions', authenticate, AssignmentController.getSubmissions);

// PUT  /api/submissions/:id/grade            — Chấm bài (teacher)
router.put('/submissions/:id/grade', authenticate, AssignmentController.gradeSubmission);

module.exports = router;
