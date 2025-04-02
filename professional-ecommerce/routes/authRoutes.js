const express = require('express');
const authController = require('../controllers/authController');
const { isAuthenticated } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/login', authController.getLoginPage);
router.get('/register', authController.getRegisterPage);
router.get('/verify-otp', authController.getVerifyOtpPage);
router.get('/forgot-password', authController.getForgotPasswordPage);
router.get('/reset-password/:token', authController.getResetPasswordPage);

router.post('/register', authController.registerUser);
router.post('/login', authController.loginUser);
 router.post('/logout', isAuthenticated, authController.logoutUser);
router.post('/verify-otp', authController.verifyOtp);
 router.post('/resend-otp', authController.resendOtp);

router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password/:token', authController.resetPassword);


module.exports = router;
