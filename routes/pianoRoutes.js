const express = require('express');
const router = express.Router();
const PianoController = require('../controllers/pianoController');

// Statistics endpoint (must come before /:id to avoid conflict)
router.get('/stats', PianoController.getStats);

// CRUD routes
router.get('/', PianoController.getAllPianos);
router.get('/:id', PianoController.getPianoById);
router.post('/', PianoController.createPiano);
router.put('/:id', PianoController.updatePiano);
router.delete('/:id', PianoController.deletePiano);

module.exports = router;
