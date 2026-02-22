const express = require('express');
const router = express.Router();
const MessageController = require('../controllers/messageController');
const { authenticate } = require('../middlewares/authMiddleware');

// All message routes require authentication
router.use(authenticate);

// Conversations
router.post('/conversations', MessageController.createConversation);
router.get('/conversations', MessageController.getConversations);

// Messages within a conversation
router.get('/conversations/:id/messages', MessageController.getMessages);
router.post('/conversations/:id/messages', MessageController.sendMessage);

// Single message actions
router.delete('/:id', MessageController.deleteMessage);

module.exports = router;
