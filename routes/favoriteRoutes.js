const express = require('express');
const router = express.Router();
const FavoriteController = require('../controllers/favoriteController');
const { authenticate } = require('../middlewares/authMiddleware');

// Check count (public?) - maybe authenticate optional? 
// Frontend service calls getFavoriteCount(pianoId). It didn't user user before.
// But mostly these are user-specific actions.
// Let's make count public, others protected.

router.get('/count/:pianoId', FavoriteController.getFavoriteCount);

// Verify specific user favorite status
router.get('/check/:pianoId', authenticate, FavoriteController.checkFavorite);

// CRUD
router.get('/', authenticate, FavoriteController.getMyFavorites);
router.post('/:pianoId', authenticate, FavoriteController.addFavorite);
router.delete('/:pianoId', authenticate, FavoriteController.removeFavorite);

module.exports = router;
