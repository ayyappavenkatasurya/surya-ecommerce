// routes/userRoutes.js
const express = require('express');
const userController = require('../controllers/userController');
const { isAuthenticated } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(isAuthenticated); // Apply to all user routes

// --- ADD NEW PROFILE ROUTE ---
router.get('/profile', userController.getUserProfilePage);
// --- END NEW ROUTE ---

router.get('/cart', userController.getCart);
router.post('/cart/add', userController.addToCart);
router.post('/cart/update', userController.updateCartQuantity);
router.post('/cart/remove/:productId', userController.removeFromCart);

router.post('/address/save', userController.saveAddress); // Keep existing save route

router.get('/checkout', userController.getCheckoutPage);

module.exports = router;