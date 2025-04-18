// routes/index.js
const express = require('express');
const authRoutes = require('./authRoutes');
const productRoutes = require('./productRoutes');
const userRoutes = require('./userRoutes');
const orderRoutes = require('./orderRoutes');
const adminRoutes = require('./adminRoutes');
const sellerRoutes = require('./sellerRoutes'); // *** IMPORT Seller Routes ***
const { getHomePage } = require('../controllers/authController'); // Home page controller

const router = express.Router();

// --- Public Routes ---
router.get('/', getHomePage);           // Home page (shows approved products)
router.use('/auth', authRoutes);        // Login, Register, Forgot Pwd, OTP Verify, etc.
router.use('/products', productRoutes); // Public product list (approved) & details (permission checked)

// --- Authenticated User Routes ---
// Middleware inside these route files ensure user is logged in
router.use('/user', userRoutes);        // Profile, Cart, Checkout, Address
router.use('/orders', orderRoutes);     // Place Order, My Orders

// --- Role-Specific Routes ---
// Middleware inside these files ensures correct role (and authentication)
router.use('/admin', adminRoutes);      // Admin actions
router.use('/seller', sellerRoutes);    // *** USE Seller Routes ***

module.exports = router;