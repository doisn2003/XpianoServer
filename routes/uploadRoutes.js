const express = require('express');
const router = express.Router();
const UploadController = require('../controllers/uploadController');
const { authenticate } = require('../middlewares/authMiddleware');

// All upload routes require authentication
router.use(authenticate);

// POST /api/upload/sign - Get signed upload URL (RBAC checked inside controller)
router.post('/sign', UploadController.getSignedUploadUrl);

// DELETE /api/upload/file - Delete a file from storage
router.delete('/file', UploadController.deleteFile);

module.exports = router;
