// middleware/roleMiddleware.js

const isAdmin = (req, res, next) => {
  if (req.session.user && req.session.user.role === 'admin') {
    next();
  } else {
    req.flash('error_msg', 'Access Denied: Admin privileges required.');
    res.status(403).redirect('/'); // Redirect to home page
  }
};

// --- NEW: Middleware to check if user is a Seller ---
const isSeller = (req, res, next) => {
  if (req.session.user && req.session.user.role === 'seller') {
    next();
  } else {
    req.flash('error_msg', 'Access Denied: Seller privileges required.');
    res.status(403).redirect('/');
  }
};

// --- NEW: Middleware to check if user is Seller OR Admin ---
const isSellerOrAdmin = (req, res, next) => {
  if (req.session.user && (req.session.user.role === 'admin' || req.session.user.role === 'seller')) {
    next();
  } else {
    req.flash('error_msg', 'Access Denied: Admin or Seller privileges required.');
    res.status(403).redirect('/');
  }
};


module.exports = { isAdmin, isSeller, isSellerOrAdmin };