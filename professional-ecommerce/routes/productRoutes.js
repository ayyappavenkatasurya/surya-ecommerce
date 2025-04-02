const express = require('express');
const productController = require('../controllers/productController');
 const { isAuthenticated } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', productController.getProducts);
router.get('/:id', productController.getProductDetails);

 router.post('/:id/rate', isAuthenticated, productController.rateProduct);

module.exports = router;
