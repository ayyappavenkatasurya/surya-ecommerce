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
router.get('/products/upload', sellerController.getUploadProductPage); // Page to show upload form
router.post('/products/upload', sellerController.uploadProduct); // Handle product submission (triggers review)
router.get('/products', sellerController.getManageProductsPage); // List *only* this seller's products (incl. status)

// Actions requiring ownership of the specific product ID
// isProductOwner middleware runs AFTER isAuthenticated and isSeller
router.get('/products/edit/:id', isProductOwner, sellerController.getEditProductPage); // Get edit form for OWN product
router.post('/products/update/:id', isProductOwner, sellerController.updateProduct); // Handle update of OWN product (triggers re-review)
router.post('/products/remove/:id', isProductOwner, sellerController.removeProduct); // Handle removal of OWN product

// Seller Order Management
router.get('/orders', sellerController.getManageOrdersPage); // List orders containing *any* of this seller's products

// Actions requiring relevance to the specific order ID
// isOrderRelevantToSeller middleware runs AFTER isAuthenticated and isSeller
router.post('/orders/:orderId/send-otp', isOrderRelevantToSeller, sellerController.sendDirectDeliveryOtpBySeller); // Seller sends OTP for relevant orders
router.post('/orders/:orderId/confirm-delivery', isOrderRelevantToSeller, sellerController.confirmDirectDeliveryBySeller); // Seller confirms delivery for relevant orders
// Note: Seller cancellation logic is not included by default.

module.exports = router;