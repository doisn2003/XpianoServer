const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/authMiddleware');
const AnalyticsController = require('../controllers/analyticsController');

// Session analytics
router.post('/sessions/:sessionId/join', authenticate, AnalyticsController.recordJoin);
router.put('/sessions/:sessionId/leave', authenticate, AnalyticsController.recordLeave);
router.get('/sessions/:sessionId', authenticate, AnalyticsController.getSessionAnalytics);

// Session recordings
router.post('/sessions/:sessionId/recordings', authenticate, AnalyticsController.saveRecording);
router.get('/sessions/:sessionId/recordings', authenticate, AnalyticsController.getRecordings);

// User learning stats
router.get('/users/me', authenticate, AnalyticsController.getMyStats);
router.get('/users/:userId', authenticate, AnalyticsController.getUserStats);

module.exports = router;
