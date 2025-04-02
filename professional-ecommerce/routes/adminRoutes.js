const express = require('express');
const adminController = require('../controllers/adminController');
const { isAuthenticated } = require('../middleware/authMiddleware');
const { isAdmin } = require('../middleware/roleMiddleware');

const router = express.Router();

router.use(isAuthenticated, isAdmin);

router.get('/dashboard', adminController.getAdminDashboard);

router.get('/upload-product', adminController.getUploadProductPage);
router.post('/upload-product', adminController.uploadProduct);

router.get('/manage-products', adminController.getManageProductsPage);
router.get('/manage-products/edit/:id', adminController.getEditProductPage);
router.post('/manage-products/update/:id', adminController.updateProduct);
router.post('/manage-products/remove/:id', adminController.removeProduct);

router.get('/manage-orders', adminController.getManageOrdersPage);

router.post('/orders/:orderId/send-otp', adminController.sendVerificationOtp);
router.post('/orders/:orderId/verify-otp', adminController.verifyOrderOtp);

 router.post('/orders/:orderId/assign', adminController.assignOrder);

router.get('/manage-users', adminController.getManageUsersPage);
 router.post('/users/:id/update-role', adminController.updateUserRole);
router.post('/users/:id/remove', adminController.removeUser);

router.get('/manage-assigned-orders', adminController.getManageAssignedOrdersPage);
 router.get('/manage-assigned-orders/details/:deliveryAdminId/:type', adminController.getAssignedOrdersDetailForAdmin);
 router.post('/manage-assigned-orders/remove/:id', adminController.removeDeliveryAdminAssignment);

module.exports = router;
