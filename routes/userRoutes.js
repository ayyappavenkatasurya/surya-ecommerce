const express = require('express');
const userController = require('../controllers/userController');
const { isAuthenticated } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(isAuthenticated);

router.get('/cart', userController.getCart);
router.post('/cart/add', userController.addToCart);
 router.post('/cart/update', userController.updateCartQuantity);
 router.post('/cart/remove/:productId', userController.removeFromCart);

 router.post('/address/save', userController.saveAddress);

 router.get('/checkout', userController.getCheckoutPage);

module.exports = router;
