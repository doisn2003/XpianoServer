const express = require('express');
const router = express.Router();
const PianoController = require('../controllers/pianoController');

// Statistics endpoint (must come before /:id to avoid conflict)
const { authenticate, authorize } = require('../middlewares/authMiddleware');

// Statistics endpoint (must come before /:id to avoid conflict)
router.get('/stats', PianoController.getStats);

// CRUD routes
router.get('/', PianoController.getAllPianos);
router.get('/:id', PianoController.getPianoById);

// Protected routes (Admin/Teacher only for modifications - assumed)
// For now just Authenticated users can modify, or strict Admin?
// Let's assume Admin only for strict control as per likely business rules, or at least Authenticated.
// User didn't specify, but safer to Authenticate.
router.post('/', authenticate, PianoController.createPiano);
router.put('/:id', authenticate, PianoController.updatePiano);
router.delete('/:id', authenticate, PianoController.deletePiano);

module.exports = router;
