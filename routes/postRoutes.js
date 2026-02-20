const express = require('express');
const router = express.Router();
const PostController = require('../controllers/postController');
const { authenticate, optionalAuthenticate } = require('../middlewares/authMiddleware');

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
// COMMENTS
// ============================================================================
router.get('/:id/comments', PostController.getComments);
router.post('/:id/comments', authenticate, PostController.addComment);

module.exports = router;
