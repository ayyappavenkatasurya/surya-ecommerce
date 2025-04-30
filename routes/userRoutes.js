// routes/userRoutes.js
const express = require('express');
const userController = require('../controllers/userController');
const { isAuthenticated } = require('../middleware/authMiddleware'); // Protect user-specific routes

const router = express.Router();

// --- Pincode Lookup Route (No changes needed here) ---
router.get('/pincode-lookup/:pincode', userController.lookupPincode);
// --- End Pincode Lookup Route ---

// Apply isAuthenticated middleware to the remaining routes in this file
router.use(isAuthenticated);

// User Profile
router.get('/profile', userController.getUserProfilePage);
router.post('/profile/update-name', userController.updateUserName);

// User Cart Management
router.get('/cart', userController.getCart);                // View cart (controller filters unapproved)
router.post('/cart/add', userController.addToCart);         // Add to cart (controller checks approval) - FOR FORMS (e.g., Product Detail)
// --- ADDED: AJAX Add to Cart Route ---
router.post('/cart/add-ajax', userController.addToCartAjax); // AJAX add to cart (e.g., from Product Index)
// --- END: AJAX Add to Cart Route ---
router.post('/cart/update', userController.updateCartQuantity); // Update quantity (controller checks approval/stock)
router.post('/cart/remove/:productId', userController.removeFromCart); // Remove from cart

// Address Management
router.post('/address/save', userController.saveAddress); // Save shipping address

// Checkout Process
router.get('/checkout', userController.getCheckoutPage);  // View checkout page (controller validates cart)

module.exports = router;