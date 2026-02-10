const express = require('express');
const router = express.Router();
const UserController = require('../controllers/userController');
const { authenticate, authorize } = require('../middlewares/authMiddleware');

// All routes require authentication and admin role
router.use(authenticate);
router.use(authorize('admin'));

// Statistics endpoint (must come first)
router.get('/stats', UserController.getStats);

// Teacher profiles management
router.get('/teacher-profiles', UserController.getAllTeacherProfiles);
router.put('/teacher-profiles/:id/approve', UserController.approveTeacher);
router.put('/teacher-profiles/:id/reject', UserController.rejectTeacher);
router.put('/teacher-profiles/:id/revoke', UserController.revokeTeacherApproval);

// CRUD routes
router.get('/', UserController.getAllUsers);
router.get('/:id', UserController.getUserById);
router.post('/', UserController.createUser);
router.put('/:id', UserController.updateUser);
router.delete('/:id', UserController.deleteUser);

module.exports = router;
