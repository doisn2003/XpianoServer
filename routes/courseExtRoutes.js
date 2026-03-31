const express = require('express');
const router = express.Router();
const ScheduleController = require('../controllers/scheduleController');
const CourseReviewController = require('../controllers/courseReviewController');
const CourseAnalyticsController = require('../controllers/courseAnalyticsController');
const { authenticate, optionalAuthenticate } = require('../middlewares/authMiddleware');

// ─── SCHEDULE — Standalone routes ────────────────────────────────────────────
// GET    /api/schedules/:id            — Chi tiết 1 lịch học
router.get('/schedules/:id', optionalAuthenticate, ScheduleController.getSchedule);

// PUT    /api/schedules/:id            — Cập nhật lịch (enrolling only)
router.put('/schedules/:id', authenticate, ScheduleController.updateSchedule);

// DELETE /api/schedules/:id            — Xóa lịch (enrolled_count=0)
router.delete('/schedules/:id', authenticate, ScheduleController.deleteSchedule);

// POST   /api/schedules/:id/close      — Đóng tuyển sinh
router.post('/schedules/:id/close', authenticate, ScheduleController.closeSchedule);

// POST   /api/schedules/:id/convert    — Đóng gói → tạo lớp học
router.post('/schedules/:id/convert', authenticate, ScheduleController.convertToClass);

// ─── REVIEWS — Course & Class ──────────────────────────────────────────────────
// POST   /api/reviews/classes/:classId/reviews  — Học viên đánh giá
router.post('/reviews/classes/:classId', authenticate, CourseReviewController.createReview);

// PUT    /api/reviews/:id                        — Sửa đánh giá (chủ nhân)
router.put('/reviews/:id', authenticate, CourseReviewController.updateReview);

// GET    /api/reviews/courses/:courseId          — Reviews của 1 khóa
router.get('/reviews/courses/:courseId', optionalAuthenticate, CourseReviewController.getCourseReviews);

// GET    /api/reviews/classes/:classId           — Reviews của 1 lớp
router.get('/reviews/classes/:classId', optionalAuthenticate, CourseReviewController.getClassReviews);

// PUT    /api/admin/reviews/:id/status           — Admin moderation
router.put('/admin/reviews/:id/status', authenticate, CourseReviewController.moderateReview);

// ─── TEACHER ANALYTICS ───────────────────────────────────────────────────────
// GET    /api/analytics/teacher/overview
router.get('/teacher/overview', authenticate, CourseAnalyticsController.teacherOverview);

// GET    /api/analytics/teacher/revenue?year=&month=
router.get('/teacher/revenue', authenticate, CourseAnalyticsController.teacherMonthlyRevenue);

// GET    /api/analytics/teacher/revenue/chart?range=12
router.get('/teacher/revenue/chart', authenticate, CourseAnalyticsController.teacherRevenueChart);

// GET    /api/analytics/teacher/courses?sort=revenue|rating|enrollments
router.get('/teacher/courses', authenticate, CourseAnalyticsController.teacherCourseRanking);

// GET    /api/analytics/teacher/classes/:classId
router.get('/teacher/classes/:classId', authenticate, CourseAnalyticsController.teacherClassAnalytics);

// GET    /api/analytics/teacher/students/:classId
router.get('/teacher/students/:classId', authenticate, CourseAnalyticsController.teacherStudentProgress);

// GET    /api/analytics/teacher/reviews?courseId=&rating=
router.get('/teacher/reviews', authenticate, CourseAnalyticsController.teacherReviews);

// ─── ADMIN ANALYTICS ──────────────────────────────────────────────────────────
// GET    /api/analytics/admin/revenue?year=&month=
router.get('/admin/revenue', authenticate, CourseAnalyticsController.adminRevenueOverview);

// GET    /api/analytics/admin/teachers?year=&month=
router.get('/admin/teachers', authenticate, CourseAnalyticsController.adminTeacherRanking);

// GET    /api/analytics/admin/teachers/:teacherId?year=
router.get('/admin/teachers/:teacherId', authenticate, CourseAnalyticsController.adminTeacherBreakdown);

// GET    /api/analytics/admin/courses/top?sort=revenue|rating|enrollments&limit=10
router.get('/admin/courses/top', authenticate, CourseAnalyticsController.adminTopCourses);

// GET    /api/analytics/admin/platform
router.get('/admin/platform', authenticate, CourseAnalyticsController.adminPlatformSummary);

module.exports = router;
