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
router.get('/upload-product', adminController.getUploadProductPage);
router.post('/upload-product', adminController.uploadProduct);
router.get('/manage-products', adminController.getManageProductsPage);
router.get('/manage-products/edit/:id', adminController.getEditProductPage);
router.post('/manage-products/update/:id', adminController.updateProduct);
router.post('/manage-products/remove/:id', adminController.removeProduct);

// Order Management (Admin View/Manage ALL - Existing Routes)
router.get('/manage-orders', adminController.getManageOrdersPage);
router.post('/orders/:orderId/send-direct-delivery-otp', adminController.sendDirectDeliveryOtpByAdmin);
router.post('/orders/:orderId/confirm-direct-delivery', adminController.confirmDirectDeliveryByAdmin);
router.post('/orders/:orderId/cancel', adminController.cancelOrderByAdmin);

// User Management (Existing Routes)
router.get('/manage-users', adminController.getManageUsersPage);
router.post('/users/:id/update-role', adminController.updateUserRole);
router.post('/users/:id/remove', adminController.removeUser);

// --- NEW: Banner Management ---
router.get('/manage-banners', adminController.getManageBannersPage); // Page to manage banners
router.post('/manage-banners', adminController.updateBanners);       // Action to save banners

module.exports = router;