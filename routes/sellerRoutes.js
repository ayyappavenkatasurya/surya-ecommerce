// routes/sellerRoutes.js
const express = require('express');
const sellerController = require('../controllers/sellerController');
const { isAuthenticated } = require('../middleware/authMiddleware');
const { isSeller } = require('../middleware/roleMiddleware'); // Use isSeller middleware

const router = express.Router();

// Apply authentication and seller role check to all routes in this file
router.use(isAuthenticated, isSeller);

// --- Seller Dashboard ---
router.get('/dashboard', sellerController.getSellerDashboard);

// --- Product Management (Seller - Own Products) ---
router.get('/upload-product', sellerController.getUploadProductPage);    // Page to upload new product (pending approval)
router.post('/upload-product', sellerController.uploadProduct);         // Action to upload
router.get('/manage-products', sellerController.getManageProductsPage); // Page to manage OWN products
router.get('/manage-products/edit/:id', sellerController.getEditProductPage); // Page to edit OWN product
router.post('/manage-products/update/:id', sellerController.updateProduct); // Action to update OWN product (triggers re-approval)
router.post('/manage-products/remove/:id', sellerController.removeProduct); // Action to remove OWN product

// --- Order Management (Seller - View Orders with Own Products) ---
router.get('/manage-orders', sellerController.getManageOrdersPage);     // Page to view orders containing seller's products

module.exports = router;