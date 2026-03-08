const express = require('express');
const router = express.Router();
const PostController = require('../controllers/postController');
const { authenticate, optionalAuthenticate } = require('../middlewares/authMiddleware');

// ============================================================================
// HASHTAGS (Must be before /:id routes to avoid 'hashtags' matching as :id)
// ============================================================================
router.get('/hashtags/trending', PostController.trendingHashtags);
router.get('/hashtags/search', PostController.searchHashtags);

// ============================================================================
// POSTS
// ============================================================================

// Public/Optional auth
router.get('/feed', optionalAuthenticate, PostController.getFeed);
router.get('/user/:userId', optionalAuthenticate, PostController.getUserPosts);
router.get('/:id', optionalAuthenticate, PostController.getPost);

// Requires auth
router.post('/', authenticate, PostController.createPost);
router.put('/:id', authenticate, PostController.updatePost);
router.delete('/:id', authenticate, PostController.deletePost);

// ============================================================================
// LIKES
// ============================================================================
router.post('/:id/like', authenticate, PostController.likePost);
router.delete('/:id/like', authenticate, PostController.unlikePost);

// ============================================================================
// VIEWS & SHARES
// ============================================================================
router.post('/:id/view', optionalAuthenticate, PostController.trackView);
router.post('/:id/share', authenticate, PostController.sharePost);

// ============================================================================
// COMMENTS
// ============================================================================
router.get('/:id/comments', PostController.getComments);
router.post('/:id/comments', authenticate, PostController.addComment);

module.exports = router;
