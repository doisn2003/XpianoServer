const express = require('express');
const router = express.Router({ mergeParams: true }); // mergeParams để nhận courseId từ parent
const ScheduleController = require('../controllers/scheduleController');
const { authenticate, optionalAuthenticate } = require('../middlewares/authMiddleware');

// ─── SCHEDULE ROUTES (mounted tại /api/schedules và /api/courses/:courseId/schedules) ───

// GET    /api/courses/:courseId/schedules         — Danh sách lịch của 1 khóa
router.get('/', optionalAuthenticate, ScheduleController.getCourseSchedules);

// POST   /api/courses/:courseId/schedules         — Tạo lịch tuyển sinh mới
router.post('/', authenticate, ScheduleController.createSchedule);

// GET    /api/schedules/:id                        — Chi tiết 1 lịch
router.get('/:id', optionalAuthenticate, ScheduleController.getSchedule);

// PUT    /api/schedules/:id                        — Cập nhật lịch (chỉ khi enrolling)
router.put('/:id', authenticate, ScheduleController.updateSchedule);

// DELETE /api/schedules/:id                        — Xóa lịch (chỉ khi enrolled_count=0)
router.delete('/:id', authenticate, ScheduleController.deleteSchedule);

// POST   /api/schedules/:id/close                  — Đóng tuyển sinh
router.post('/:id/close', authenticate, ScheduleController.closeSchedule);

// POST   /api/schedules/:id/convert                — Đóng gói → tạo lớp học
router.post('/:id/convert', authenticate, ScheduleController.convertToClass);

module.exports = router;
