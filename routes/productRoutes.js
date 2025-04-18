// routes/productRoutes.js
const express = require('express');
const productController = require('../controllers/productController');
 const { isAuthenticated } = require('../middleware/authMiddleware'); // Needed only for rating

const router = express.Router();

// Public routes - controllers ensure visibility rules (e.g., only 'approved')
router.get('/', productController.getProducts);         // List approved, in-stock products
router.get('/:id', productController.getProductDetails); // Show product details (controller checks status/permissions)

// Rating requires user to be logged in
router.post('/:id/rate', isAuthenticated, productController.rateProduct);

module.exports = router;