const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/authController');
const { authenticate } = require('../middlewares/authMiddleware');

// Public routes
// Public routes
router.post('/register', AuthController.register); // Deprecated but kept?
router.post('/login', AuthController.login);
router.post('/send-otp', AuthController.sendOtp);
router.post('/register-verify', AuthController.registerWithOtp);
router.post('/login-otp', AuthController.loginWithOtpVerify); // Optional for login flow
router.post('/forgot-password', AuthController.forgotPassword);
router.post('/reset-password', AuthController.resetPassword); // Now acts as OTP verify + Reset
router.post('/admin-login', AuthController.adminLogin);
router.post('/admin-register', AuthController.adminRegister);

// Protected routes (require authentication)
router.get('/me', authenticate, AuthController.getProfile);
router.put('/profile', authenticate, AuthController.updateProfile);
router.put('/change-password', authenticate, AuthController.changePassword);
router.post('/logout', authenticate, AuthController.logout);

module.exports = router;
