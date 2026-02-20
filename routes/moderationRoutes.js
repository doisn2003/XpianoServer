const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/authMiddleware');
const ModerationController = require('../controllers/moderationController');

// User-facing
router.post('/reports', authenticate, ModerationController.createReport);
router.get('/reports/mine', authenticate, ModerationController.getMyReports);

// Admin-only
router.get('/admin/reports', authenticate, ModerationController.getReports);
router.put('/admin/reports/:id', authenticate, ModerationController.reviewReport);
router.get('/admin/stats', authenticate, ModerationController.getStats);

module.exports = router;
