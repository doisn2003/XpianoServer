const express = require('express');
const router = express.Router();
const SessionController = require('../controllers/sessionController');
const { authenticate } = require('../middlewares/authMiddleware');
const { optionalAuthenticate } = require('../middlewares/authMiddleware');

// Public: list & view sessions
router.get('/', optionalAuthenticate, SessionController.getSessions);
router.get('/:id', optionalAuthenticate, SessionController.getSession);

// Authenticated: CRUD & lifecycle
router.post('/', authenticate, SessionController.createSession);
router.put('/:id', authenticate, SessionController.updateSession);
router.delete('/:id', authenticate, SessionController.deleteSession);

// Session lifecycle
router.post('/:id/start', authenticate, SessionController.startSession);
router.post('/:id/join', authenticate, SessionController.joinSession);
router.post('/:id/leave', authenticate, SessionController.leaveSession);
router.post('/:id/end', authenticate, SessionController.endSession);

// Participants
router.get('/:id/participants', authenticate, SessionController.getParticipants);

// In-session chat
router.get('/:id/chat', authenticate, SessionController.getChatHistory);
router.post('/:id/chat', authenticate, SessionController.sendChatMessage);

// Room config (multi-camera permissions)
router.get('/:id/room-config', authenticate, SessionController.getRoomConfig);
router.put('/:id/room-config', authenticate, SessionController.configureRoom);

// Track metadata (multi-camera tracks)
router.get('/:id/tracks', authenticate, SessionController.getTracks);
router.post('/:id/tracks', authenticate, SessionController.registerTrack);
router.put('/:id/tracks/:trackId', authenticate, SessionController.updateTrack);

module.exports = router;
