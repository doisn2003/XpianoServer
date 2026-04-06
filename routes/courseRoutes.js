const express = require('express');
const router = express.Router();
const CourseController = require('../controllers/courseController');
const { authenticate, optionalAuthenticate } = require('../middlewares/authMiddleware');

// ─── PUBLIC ──────────────────────────────────────────────
// GET /api/courses                  — Danh sách khóa học (filter: level, category, search)
router.get('/', optionalAuthenticate, CourseController.getPublicCourses);

// GET /api/courses/me/enrolled      — Khóa học đang học (student)
router.get('/me/enrolled', authenticate, CourseController.getMyEnrolledCourses);

// GET /api/courses/me/teaching      — Khóa học đang dạy (teacher)
router.get('/me/teaching', authenticate, CourseController.getMyTeachingCourses);

// GET /api/courses/admin/stats      — Thống kê (admin)
router.get('/admin/stats', authenticate, CourseController.getAdminStats);

// GET /api/courses/teacher/:teacherId — Khóa học public của 1 GV
router.get('/teacher/:teacherId', optionalAuthenticate, CourseController.getTeacherCourses);

// GET /api/courses/:id              — Chi tiết khóa học + open schedules
router.get('/:id', optionalAuthenticate, CourseController.getCourseDetails);

// GET /api/courses/:id/enrollments  — Danh sách học viên enrolled (teacher/admin)
router.get('/:id/enrollments', authenticate, CourseController.getCourseEnrollments);

// ─── TEACHER ─────────────────────────────────────────────
// POST   /api/courses               — Tạo khóa học mới
router.post('/', authenticate, CourseController.createCourse);

// PUT    /api/courses/:id           — Cập nhật nội dung khóa học (luôn sửa được)
router.put('/:id', authenticate, CourseController.updateCourse);

// PUT    /api/courses/:id/activate  — Kích hoạt khóa học (draft → active)
router.put('/:id/activate', authenticate, CourseController.activateCourse);

// PUT    /api/courses/:id/archive   — Lưu trữ khóa học (active → archived)
router.put('/:id/archive', authenticate, CourseController.archiveCourse);

// DELETE /api/courses/:id           — Xóa khóa học (chỉ khi chưa có lớp nào)
router.delete('/:id', authenticate, CourseController.deleteCourse);

module.exports = router;
