const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/authMiddleware');
const AdminController = require('../controllers/adminController');

// Platform overview
router.get('/dashboard', authenticate, AdminController.getDashboard);

// User management
router.get('/users', authenticate, AdminController.getUsers);
router.get('/users/:id', authenticate, AdminController.getUserDetail);

// Content management
router.get('/posts', authenticate, AdminController.getPosts);
router.delete('/posts/:id', authenticate, AdminController.deletePost);
router.delete('/comments/:id', authenticate, AdminController.deleteComment);

// Session management
router.get('/sessions', authenticate, AdminController.getSessions);
router.delete('/sessions/:id', authenticate, AdminController.forceEndSession);

module.exports = router;
