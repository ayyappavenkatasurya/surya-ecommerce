// routes/sellerRoutes.js
const express = require('express');
const sellerController = require('../controllers/sellerController');
const { isAuthenticated } = require('../middleware/authMiddleware');
// Import relevant role/ownership middleware
const { isSeller, isProductOwner, isOrderRelevantToSeller } = require('../middleware/roleMiddleware');

const router = express.Router();

// Apply authentication and seller check to ALL routes in this file
router.use(isAuthenticated, isSeller);

// Seller Dashboard
router.get('/dashboard', sellerController.getSellerDashboard);

// Seller Product Management
router.get('/products/upload', sellerController.getUploadProductPage);
router.post('/products/upload', sellerController.uploadProduct);
router.get('/products', sellerController.getManageProductsPage);

// Actions requiring ownership of the specific product ID
router.get('/products/edit/:id', isProductOwner, sellerController.getEditProductPage);
router.post('/products/update/:id', isProductOwner, sellerController.updateProduct);
router.post('/products/remove/:id', isProductOwner, sellerController.removeProduct);

// Seller Order Management
router.get('/orders', sellerController.getManageOrdersPage);

// Actions requiring relevance to the specific order ID
router.post('/orders/:orderId/send-otp', isOrderRelevantToSeller, sellerController.sendDirectDeliveryOtpBySeller);
router.post('/orders/:orderId/confirm-delivery', isOrderRelevantToSeller, sellerController.confirmDirectDeliveryBySeller);

// --- NEW: Seller Cancel Order Route ---
router.post('/orders/:orderId/cancel', isOrderRelevantToSeller, sellerController.cancelOrderBySeller); // Add this line

module.exports = router;