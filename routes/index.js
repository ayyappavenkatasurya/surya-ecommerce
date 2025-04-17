// routes/index.js
const express = require('express');
const authRoutes = require('./authRoutes');
const productRoutes = require('./productRoutes');
const userRoutes = require('./userRoutes');
const orderRoutes = require('./orderRoutes');
const adminRoutes = require('./adminRoutes');
const { getHomePage } = require('../controllers/authController');

const router = express.Router();

router.get('/', getHomePage);
router.use('/auth', authRoutes);
router.use('/products', productRoutes);

router.use('/user', userRoutes);
router.use('/orders', orderRoutes);

router.use('/admin', adminRoutes);

module.exports = router;