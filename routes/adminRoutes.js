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
// Assign/Unassign/Cancel actions
router.post('/orders/:orderId/assign', adminController.assignOrder);
// --- ADDED Unassign Route ---
router.post('/orders/:orderId/unassign', adminController.unassignOrderFromAdmin);
// --- END ---
router.post('/orders/:orderId/cancel', adminController.cancelOrderByAdmin);


// Users
router.get('/manage-users', adminController.getManageUsersPage);
router.post('/users/:id/update-role', adminController.updateUserRole);
router.post('/users/:id/remove', adminController.removeUser);


// Assigned Orders / Delivery Admins
router.get('/manage-assigned-orders', adminController.getManageAssignedOrdersPage);
// View details of orders assigned to a specific delivery admin (by type: total, pending, delivered)
router.get('/manage-assigned-orders/details/:deliveryAdminId/:type', adminController.getAssignedOrdersDetailForAdmin);
// Remove delivery admin (and unassign their orders) - linked from manage-assigned-orders page
router.post('/manage-assigned-orders/remove/:id', adminController.removeDeliveryAdminAssignment);


module.exports = router;