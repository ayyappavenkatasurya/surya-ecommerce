// routes/deliveryRoutes.js
const express = require('express');
const deliveryController = require('../controllers/deliveryController');
const { isAuthenticated } = require('../middleware/authMiddleware');
const { isDeliveryAdmin } = require('../middleware/roleMiddleware');
const { hasPhoneNumber } = require('../middleware/deliveryMiddleware'); // Import the new middleware

const router = express.Router();

// Apply base authentication and role check first
router.use(isAuthenticated, isDeliveryAdmin);

// --- Contact Page Routes (Accessible WITHOUT phone number) ---
router.get('/contact', deliveryController.getContactPage);
router.post('/contact', deliveryController.updateContactInfo);

// --- Routes requiring a phone number (Apply hasPhoneNumber middleware) ---
// Apply the check *after* auth/role but *before* the specific route handlers
router.use(hasPhoneNumber);

// Dashboard
router.get('/dashboard', deliveryController.getDeliveryDashboard);

// View Orders
router.get('/orders/:type', deliveryController.getAssignedOrdersDetail); // type = total, pending, delivered

// Order Actions
router.post('/orders/:orderId/send-delivery-otp', deliveryController.sendDeliveryOtp);
router.post('/orders/:orderId/verify-delivery-otp', deliveryController.verifyDeliveryOtp);
router.post('/orders/:orderId/cancel-delivery', deliveryController.cancelAssignedOrder);
router.post('/orders/:orderId/unassign', deliveryController.unassignOrder);

module.exports = router;