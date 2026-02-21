const express = require('express');
const router = express.Router();
const CourseController = require('../controllers/courseController');
const { authenticate, optionalAuthenticate } = require('../middlewares/authMiddleware');

// Public endpoints
router.get('/', optionalAuthenticate, CourseController.getPublicCourses);
router.get('/:id', optionalAuthenticate, CourseController.getCourseDetails);
router.get('/teacher/:teacherId', optionalAuthenticate, CourseController.getTeacherCourses);

// User endpoints (learner)
router.get('/me/enrolled', authenticate, CourseController.getMyEnrolledCourses);

// Teacher endpoints
router.get('/me/teaching', authenticate, CourseController.getMyTeachingCourses);
router.get('/:id/enrollments', authenticate, CourseController.getCourseEnrollments);
router.post('/', authenticate, CourseController.createCourse);
router.put('/:id', authenticate, CourseController.updateCourse);
router.post('/:id/publish', authenticate, CourseController.publishCourse);
// Admin endpoints
router.get('/admin/stats', authenticate, CourseController.getAdminStats);

module.exports = router;
