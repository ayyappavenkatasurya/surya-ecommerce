// middleware.js
const mongoose = require('mongoose');
const { User, Product, Order } = require('./models'); // Import from consolidated models

// --- From middleware/authMiddleware.js ---
const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.user) {
        User.findById(req.session.user._id).then(user => {
            if (!user) {
                req.session.destroy(err => {
                    if (err) { console.error('Session destruction error:', err); return next(err); }
                    req.flash('error_msg', 'Session expired or user not found. Please login again.');
                    res.redirect('/auth/login');
                });
            } else {
                req.user = user; // Attach full user object if needed
                res.locals.currentUser = user; // Ensure locals are updated (redundant if set in server.js)
                next();
            }
        }).catch(err => {
            console.error("Error checking user authentication:", err);
            req.flash('error_msg', 'An error occurred during authentication.');
            res.redirect('/auth/login');
        });
    } else {
        req.flash('error_msg', 'You must be logged in to view this page.');
        req.session.returnTo = req.originalUrl;
        res.redirect('/auth/login');
    }
};

// --- From middleware/errorMiddleware.js ---
const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

const errorHandler = (err, req, res, next) => {
  let statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  let message = err.message;

  if (err.name === 'CastError' && err.kind === 'ObjectId') { statusCode = 404; message = 'Resource not found (Invalid ID format)'; }
  if (err.name === 'ValidationError') { statusCode = 400; message = `Validation Error: ${Object.values(err.errors).map(el => el.message).join(', ')}`; }
  if (err.code === 11000) { statusCode = 400; message = `Duplicate field value: ${Object.keys(err.keyValue)} already exists.`; }

  console.error("ERROR STACK: ", err.stack);

  if (req.accepts('html')) {
      res.status(statusCode).render('error', { // Assuming error.ejs exists
          title: 'Error', message: message,
          stack: process.env.NODE_ENV === 'development' ? err.stack : null,
          statusCode: statusCode
      });
  } else {
      res.status(statusCode).json({
          message: message, stack: process.env.NODE_ENV === 'development' ? err.stack : null
      });
  }
};

// --- From middleware/roleMiddleware.js ---
const isAdmin = (req, res, next) => {
  if (req.session.user?.role === 'admin') {
    return next();
  }
  req.flash('error_msg', 'Access Denied: Admin privileges required.');
  return res.status(403).redirect('/');
};

const isSeller = (req, res, next) => {
  if (req.session.user?.role === 'seller') {
    return next();
  }
  req.flash('error_msg', 'Access Denied: Seller privileges required.');
  return res.status(403).redirect('/');
};

const isAdminOrSeller = (req, res, next) => {
   if (req.session.user && (req.session.user.role === 'admin' || req.session.user.role === 'seller')) {
     return next();
   }
   req.flash('error_msg', 'Access Denied: Admin or Seller privileges required.');
   return res.status(403).redirect('/');
};

const isProductOwner = async (req, res, next) => {
    const productId = req.params.id || req.params.productId;
    const sellerId = req.session.user._id;
    if (!mongoose.Types.ObjectId.isValid(productId)) {
         req.flash('error_msg', 'Invalid Product ID format.');
         return res.status(400).redirect('back');
    }
    try {
        const product = await Product.findById(productId).select('sellerId').lean();
        if (!product) { req.flash('error_msg', 'Product not found.'); return res.status(404).redirect('back'); }
        if (product.sellerId.toString() !== sellerId.toString()) {
            req.flash('error_msg', 'Access Denied: You do not own this product.');
            return res.status(403).redirect('/seller/products');
        }
        next();
    } catch (error) {
         console.error("Error in isProductOwner middleware:", error);
         if (error.name === 'CastError') { req.flash('error_msg', 'Invalid Product ID format.'); return res.status(400).redirect('back'); }
         req.flash('error_msg', 'Error verifying product ownership.');
         return res.status(500).redirect('back');
    }
};

const isOrderRelevantToSeller = async (req, res, next) => {
    const orderId = req.params.orderId || req.params.id;
    const sellerId = req.session.user._id;
     if (!mongoose.Types.ObjectId.isValid(orderId)) {
         req.flash('error_msg', 'Invalid Order ID format.');
         return res.status(400).redirect('back');
    }
    try {
        const sellerProductIds = await Product.find({ sellerId: sellerId }, '_id').lean();
        const sellerProductIdStrings = sellerProductIds.map(p => p._id.toString());
        if (sellerProductIdStrings.length === 0) {
             req.flash('error_msg', 'Access Denied: You have no products listed.');
             return res.status(403).redirect('/seller/orders');
        }
        const order = await Order.findOne({
            _id: orderId,
            'products.productId': { $in: sellerProductIdStrings.map(id => new mongoose.Types.ObjectId(id)) }
        }).select('_id').lean();
        if (!order) {
            req.flash('error_msg', 'Order not found or does not contain your products.');
            return res.status(404).redirect('/seller/orders');
        }
        next();
    } catch (error) {
        console.error("Error in isOrderRelevantToSeller middleware:", error);
        if (error.name === 'CastError') { req.flash('error_msg', 'Invalid ID format.'); return res.status(400).redirect('back'); }
        req.flash('error_msg', 'Error verifying order relevance.');
        return res.status(500).redirect('back');
    }
};


// --- Consolidated Exports ---
module.exports = {
    // Auth
    isAuthenticated,
    // Error
    notFound,
    errorHandler,
    // Roles
    isAdmin,
    isSeller,
    isAdminOrSeller,
    isProductOwner,
    isOrderRelevantToSeller
};