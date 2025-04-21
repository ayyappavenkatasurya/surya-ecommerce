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

// --- Category Management (Admin - NEW) ---
router.get('/manage-categories', adminController.getManageCategoriesPage); // List categories
router.get('/categories/new', adminController.getAddCategoryPage);         // Show add form
router.post('/categories/new', adminController.addCategory);               // Handle add form submission
router.get('/categories/edit/:id', adminController.getEditCategoryPage);    // Show edit form
router.post('/categories/update/:id', adminController.updateCategory);      // Handle edit form submission
router.post('/categories/delete/:id', adminController.deleteCategory);      // Handle delete category

// --- Product Management (Admin) ---
router.get('/upload-product', adminController.getUploadProductPage);
router.post('/upload-product', adminController.uploadProduct);
router.get('/manage-products', adminController.getManageProductsPage);
router.get('/manage-products/edit/:id', adminController.getEditProductPage);
router.post('/manage-products/update/:id', adminController.updateProduct);
router.post('/manage-products/remove/:id', adminController.removeProduct);

// --- Order Management (Admin) ---
router.get('/manage-orders', adminController.getManageOrdersPage);
router.post('/orders/:orderId/send-direct-delivery-otp', adminController.sendDirectDeliveryOtpByAdmin);
router.post('/orders/:orderId/confirm-direct-delivery', adminController.confirmDirectDeliveryByAdmin);
router.post('/orders/:orderId/cancel', adminController.cancelOrderByAdmin);

// --- User Management ---
router.get('/manage-users', adminController.getManageUsersPage);
router.post('/users/:id/update-role', adminController.updateUserRole);
router.post('/users/:id/remove', adminController.removeUser);

// --- Banner Management ---
router.get('/manage-banners', adminController.getManageBannersPage);
router.post('/manage-banners', adminController.updateBanners);


module.exports = router;