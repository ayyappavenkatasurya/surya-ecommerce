const express = require('express');
const deliveryController = require('../controllers/deliveryController');
const { isAuthenticated } = require('../middleware/authMiddleware');
const { isDeliveryAdmin } = require('../middleware/roleMiddleware');

const router = express.Router();

router.use(isAuthenticated, isDeliveryAdmin);

router.get('/dashboard', deliveryController.getDeliveryDashboard);

router.get('/orders/:type', deliveryController.getAssignedOrdersDetail);

router.post('/orders/mark-delivered/:orderId', deliveryController.markAsDelivered);

module.exports = router;
