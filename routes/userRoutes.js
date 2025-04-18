// routes/userRoutes.js
const express = require('express');
const userController = require('../controllers/userController');
const { isAuthenticated } = require('../middleware/authMiddleware'); // Protect user-specific routes

const router = express.Router();

// Apply isAuthenticated middleware to all routes in this file
router.use(isAuthenticated);

// User Profile
router.get('/profile', userController.getUserProfilePage);

// User Cart Management
router.get('/cart', userController.getCart);                // View cart (controller filters unapproved)
router.post('/cart/add', userController.addToCart);         // Add to cart (controller checks approval)
router.post('/cart/update', userController.updateCartQuantity); // Update quantity (controller checks approval/stock)
router.post('/cart/remove/:productId', userController.removeFromCart); // Remove from cart

// Address Management
router.post('/address/save', userController.saveAddress); // Save shipping address

// Checkout Process
router.get('/checkout', userController.getCheckoutPage);  // View checkout page (controller validates cart)

module.exports = router;