const express = require('express');
const router = express.Router();
const TeacherController = require('../controllers/teacherController');
const { authenticate, authorize } = require('../middlewares/authMiddleware');

// All routes require authentication and teacher role
router.use(authenticate);
router.use(authorize('teacher', 'admin'));

// Profile management
router.get('/profile', TeacherController.getMyProfile);
router.post('/profile', TeacherController.submitProfile);

// Course management
router.get('/courses', TeacherController.getMyCourses);
router.post('/courses', TeacherController.createCourse);

// Statistics
router.get('/stats', TeacherController.getStats);

module.exports = router;
