const express = require('express');
const orderController = require('../controllers/orderController');
const { isAuthenticated } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(isAuthenticated);

router.post('/place', orderController.placeOrder);

router.get('/my-orders', orderController.getMyOrders);

 router.post('/cancel/:id', orderController.cancelOrder);

module.exports = router;
