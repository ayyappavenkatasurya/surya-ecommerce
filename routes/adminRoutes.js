// routes/adminRoutes.js
const express = require('express');
const adminController = require('../controllers/adminController');
const { isAuthenticated } = require('../middleware/authMiddleware');
const { isAdmin } = require('../middleware/roleMiddleware'); // Use specific admin check

const router = express.Router();

// Apply authentication and admin check to ALL routes in this file
router.use(isAuthenticated, isAdmin);

// Dashboard
router.get('/dashboard', adminController.getAdminDashboard);

// --- Product Management (Admin) ---
// *** ADDED BACK Admin Product Upload Routes ***
router.get('/upload-product', adminController.getUploadProductPage); // Page for admin upload form
router.post('/upload-product', adminController.uploadProduct);       // Handle admin product upload

// Manage All Products (Existing Routes)
router.get('/manage-products', adminController.getManageProductsPage);       // Admin sees all
router.get('/manage-products/edit/:id', adminController.getEditProductPage); // Admin edits any
router.post('/manage-products/update/:id', adminController.updateProduct);   // Admin updates any
router.post('/manage-products/remove/:id', adminController.removeProduct);   // Admin removes any

// Order Management (Admin View/Manage ALL - Existing Routes)
router.get('/manage-orders', adminController.getManageOrdersPage); // Admin sees all
router.post('/orders/:orderId/send-direct-delivery-otp', adminController.sendDirectDeliveryOtpByAdmin); // Admin OTP send
router.post('/orders/:orderId/confirm-direct-delivery', adminController.confirmDirectDeliveryByAdmin); // Admin OTP confirm
router.post('/orders/:orderId/cancel', adminController.cancelOrderByAdmin);                           // Admin cancel

// User Management (Existing Routes)
router.get('/manage-users', adminController.getManageUsersPage);     // List users
router.post('/users/:id/update-role', adminController.updateUserRole); // Update role (incl. seller)
router.post('/users/:id/remove', adminController.removeUser);         // Remove user

module.exports = router;