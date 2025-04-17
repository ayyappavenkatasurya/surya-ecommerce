// routes/adminRoutes.js
const express = require('express');
const adminController = require('../controllers/adminController');
const { isAuthenticated } = require('../middleware/authMiddleware');
// --- Use specific role middleware ---
const { isAdmin, isSellerOrAdmin } = require('../middleware/roleMiddleware');

const router = express.Router();

// All admin/seller routes require login first
router.use(isAuthenticated);

// --- Dashboard (Accessible to Admin & Seller) ---
router.get('/dashboard', isSellerOrAdmin, adminController.getAdminDashboard);

// --- Product Management (Accessible to Admin & Seller, logic inside controller handles ownership) ---
router.get('/upload-product', isSellerOrAdmin, adminController.getUploadProductPage);
router.post('/upload-product', isSellerOrAdmin, adminController.uploadProduct);
router.get('/manage-products', isSellerOrAdmin, adminController.getManageProductsPage);
router.get('/manage-products/edit/:id', isSellerOrAdmin, adminController.getEditProductPage);
router.post('/manage-products/update/:id', isSellerOrAdmin, adminController.updateProduct);
router.post('/manage-products/remove/:id', isSellerOrAdmin, adminController.removeProduct);

// --- Product Review (Admin Only) ---
router.get('/review-products', isAdmin, adminController.getReviewProductsPage);
router.post('/products/:id/approve', isAdmin, adminController.approveProduct);
router.post('/products/:id/reject', isAdmin, adminController.rejectProduct);

// --- Order Management (Viewable by Admin & Seller, Actions restricted by role in controller) ---
router.get('/manage-orders', isSellerOrAdmin, adminController.getManageOrdersPage);

// --- Order Actions (Explicitly Admin Only Routes) ---
router.post('/orders/:orderId/send-direct-delivery-otp', isAdmin, adminController.sendDirectDeliveryOtpByAdmin);
router.post('/orders/:orderId/confirm-direct-delivery', isAdmin, adminController.confirmDirectDeliveryByAdmin);
router.post('/orders/:orderId/cancel', isAdmin, adminController.cancelOrderByAdmin); // Kept admin only for now

// --- User Management (Admin Only) ---
router.get('/manage-users', isAdmin, adminController.getManageUsersPage);
router.post('/users/:id/update-role', isAdmin, adminController.updateUserRole);
router.post('/users/:id/remove', isAdmin, adminController.removeUser);

module.exports = router;