// routes/adminRoutes.js
const express = require('express');
const adminController = require('../controllers/adminController');
const { isAuthenticated } = require('../middleware/authMiddleware');
const { isAdmin } = require('../middleware/roleMiddleware');

const router = express.Router();

// Apply authentication and admin role check to all routes in this file
router.use(isAuthenticated, isAdmin);

// Dashboard
router.get('/dashboard', adminController.getAdminDashboard);

// Products
router.get('/upload-product', adminController.getUploadProductPage);
router.post('/upload-product', adminController.uploadProduct);
router.get('/manage-products', adminController.getManageProductsPage);
router.get('/manage-products/edit/:id', adminController.getEditProductPage);
router.post('/manage-products/update/:id', adminController.updateProduct);
router.post('/manage-products/remove/:id', adminController.removeProduct);


// Orders
router.get('/manage-orders', adminController.getManageOrdersPage);
// Direct delivery by Admin actions
router.post('/orders/:orderId/send-direct-delivery-otp', adminController.sendDirectDeliveryOtpByAdmin);
router.post('/orders/:orderId/confirm-direct-delivery', adminController.confirmDirectDeliveryByAdmin);
// Cancel action
router.post('/orders/:orderId/cancel', adminController.cancelOrderByAdmin);
// --- REMOVED Assign/Unassign/Bulk Routes ---


// Users
router.get('/manage-users', adminController.getManageUsersPage);
router.post('/users/:id/update-role', adminController.updateUserRole);
router.post('/users/:id/remove', adminController.removeUser);


// --- REMOVED Assigned Orders Routes ---
// router.get('/manage-assigned-orders', adminController.getManageAssignedOrdersPage);
// router.get('/manage-assigned-orders/details/:deliveryAdminId/:type', adminController.getAssignedOrdersDetailForAdmin);
// router.post('/manage-assigned-orders/remove/:id', adminController.removeDeliveryAdminAssignment);


module.exports = router;