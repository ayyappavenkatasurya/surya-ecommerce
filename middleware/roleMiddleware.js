// middleware/roleMiddleware.js
const Product = require('../models/Product');
const Order = require('../models/Order');
const mongoose = require('mongoose');

const isAdmin = (req, res, next) => {
  // Ensure user exists and has the 'admin' role
  if (req.session.user && req.session.user.role === 'admin') {
    return next(); // Use return to avoid executing further code
  } else {
    req.flash('error_msg', 'Access Denied: Admin privileges required.');
    return res.status(403).redirect('/'); // Use return
  }
};

// *** NEW: Middleware to check if user is a seller ***
const isSeller = (req, res, next) => {
  if (req.session.user && req.session.user.role === 'seller') {
    return next();
  } else {
    req.flash('error_msg', 'Access Denied: Seller privileges required.');
    return res.status(403).redirect('/');
  }
};

// *** NEW: Middleware to check if user is admin OR seller ***
const isAdminOrSeller = (req, res, next) => {
   if (req.session.user && (req.session.user.role === 'admin' || req.session.user.role === 'seller')) {
     return next();
   } else {
     req.flash('error_msg', 'Access Denied: Admin or Seller privileges required.');
     return res.status(403).redirect('/');
   }
};


// *** NEW: Middleware to check if the product belongs to the logged-in seller ***
// Apply this AFTER isAuthenticated and isSeller
const isProductOwner = async (req, res, next) => {
    const productId = req.params.id || req.params.productId; // Check common param names
    const sellerId = req.session.user._id;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
         req.flash('error_msg', 'Invalid Product ID format.');
         return res.status(400).redirect('back'); // Redirect back if possible
    }

    try {
        const product = await Product.findById(productId).select('sellerId').lean(); // Only fetch sellerId

        if (!product) {
            req.flash('error_msg', 'Product not found.');
            return res.status(404).redirect('back');
        }

        if (product.sellerId.toString() !== sellerId.toString()) {
            req.flash('error_msg', 'Access Denied: You do not own this product.');
            return res.status(403).redirect('/seller/products'); // Redirect to their products page
        }

        // Attach product briefly for potential use later? Maybe not necessary.
        // req.product = product;
        next();
    } catch (error) {
         console.error("Error in isProductOwner middleware:", error);
         // Handle CastError specifically if lean() is removed or select changes
         if (error.name === 'CastError') {
             req.flash('error_msg', 'Invalid Product ID format.');
             return res.status(400).redirect('back');
         }
         req.flash('error_msg', 'An error occurred while verifying product ownership.');
         return res.status(500).redirect('back');
    }
};


// *** NEW: Middleware to check if an order contains products relevant to the logged-in seller ***
// Apply this AFTER isAuthenticated and isSeller
const isOrderRelevantToSeller = async (req, res, next) => {
    const orderId = req.params.orderId || req.params.id;
    const sellerId = req.session.user._id;

     if (!mongoose.Types.ObjectId.isValid(orderId)) {
         req.flash('error_msg', 'Invalid Order ID format.');
         return res.status(400).redirect('back');
    }

    try {
        // 1. Find products sold by this seller
        const sellerProductIds = await Product.find({ sellerId: sellerId }, '_id').lean();
        const sellerProductIdStrings = sellerProductIds.map(p => p._id.toString());

        if (sellerProductIdStrings.length === 0) {
             req.flash('error_msg', 'Access Denied: You have no products listed.');
             return res.status(403).redirect('/seller/orders');
        }

        // 2. Find the order and check if any product matches the seller's products
        // We only need to know IF there's a match, not the full order details yet
        const order = await Order.findOne({
            _id: orderId,
            'products.productId': { $in: sellerProductIdStrings.map(id => new mongoose.Types.ObjectId(id)) } // Convert back to ObjectId for query
        }).select('_id').lean(); // Select minimal field

        if (!order) {
            req.flash('error_msg', 'Order not found or does not contain your products.');
            return res.status(404).redirect('/seller/orders');
        }

        // Order is relevant
        next();

    } catch (error) {
        console.error("Error in isOrderRelevantToSeller middleware:", error);
         if (error.name === 'CastError') {
             req.flash('error_msg', 'Invalid ID format encountered.');
             return res.status(400).redirect('back');
         }
        req.flash('error_msg', 'An error occurred while verifying order relevance.');
        return res.status(500).redirect('back');
    }
};

module.exports = {
    isAdmin,
    isSeller,         // Export new middleware
    isAdminOrSeller,  // Export new middleware
    isProductOwner,   // Export new middleware
    isOrderRelevantToSeller // Export new middleware
};