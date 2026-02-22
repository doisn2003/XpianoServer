const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/authController');
const { authenticate } = require('../middlewares/authMiddleware');

const { authLimiter } = require('../middlewares/rateLimiter');

// Public routes
// Public routes
router.post('/register', authLimiter, AuthController.register); // Deprecated but kept?
router.post('/login', authLimiter, AuthController.login);
router.post('/send-otp', authLimiter, AuthController.sendOtp);
router.post('/register-verify', authLimiter, AuthController.registerWithOtp);
router.post('/login-otp', authLimiter, AuthController.loginWithOtpVerify); // Optional for login flow
router.post('/forgot-password', authLimiter, AuthController.forgotPassword);
router.post('/reset-password', authLimiter, AuthController.resetPassword); // Now acts as OTP verify + Reset
router.post('/admin-login', authLimiter, AuthController.adminLogin);
router.post('/admin-register', authLimiter, AuthController.adminRegister);
router.post('/refresh', AuthController.refreshToken); // Refresh access token

// Protected routes (require authentication)
router.get('/me', authenticate, AuthController.getProfile);
router.put('/profile', authenticate, AuthController.updateProfile);
router.put('/change-password', authenticate, AuthController.changePassword);
router.post('/logout', authenticate, AuthController.logout);

module.exports = router;
