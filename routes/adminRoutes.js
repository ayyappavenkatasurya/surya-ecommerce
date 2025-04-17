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
router.post('/orders/:orderId/send-direct-delivery-otp', adminController.sendDirectDeliveryOtpByAdmin);
router.post('/orders/:orderId/confirm-direct-delivery', adminController.confirmDirectDeliveryByAdmin);
router.post('/orders/:orderId/cancel', adminController.cancelOrderByAdmin);

router.get('/manage-users', adminController.getManageUsersPage);
router.post('/users/:id/update-role', adminController.updateUserRole);
router.post('/users/:id/remove', adminController.removeUser);

module.exports = router;