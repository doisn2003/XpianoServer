const express = require('express');
const router = express.Router();
const SocialController = require('../controllers/socialController');
const PostController = require('../controllers/postController');
const { authenticate, optionalAuthenticate } = require('../middlewares/authMiddleware');

// ============================================================================
// FOLLOW / UNFOLLOW  (mounted under /api/social)
// ============================================================================
router.post('/users/:id/follow', authenticate, SocialController.followUser);
router.delete('/users/:id/follow', authenticate, SocialController.unfollowUser);
router.get('/users/search', authenticate, SocialController.searchUsers);  // MUST be before :id routes
router.get('/users/:id/followers', optionalAuthenticate, SocialController.getFollowers);
router.get('/users/:id/following', optionalAuthenticate, SocialController.getFollowing);
router.get('/users/:id/public', optionalAuthenticate, SocialController.getUserPublicProfile);

// ============================================================================
// TEACHER PUBLIC PROFILE
// ============================================================================
router.get('/teachers', SocialController.getTeachersList);   // List for suggestions
router.get('/teachers/:id/public', optionalAuthenticate, SocialController.getTeacherPublicProfile);
router.get('/teachers/:id/courses', SocialController.getTeacherCourses);
router.get('/teachers/:id/reviews', SocialController.getTeacherReviews);

// ============================================================================
// COMMENT REPLIES (global route for nested replies)
// ============================================================================
router.get('/comments/:id/replies', PostController.getReplies);
router.delete('/comments/:id', authenticate, PostController.deleteComment);

module.exports = router;
