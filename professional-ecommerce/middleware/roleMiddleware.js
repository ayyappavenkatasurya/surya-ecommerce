const isAdmin = (req, res, next) => {
  if (req.session.user && req.session.user.role === 'admin') {
    next();
  } else {
    req.flash('error_msg', 'Access Denied: Admin privileges required.');
    res.status(403).redirect('/');
  }
};

const isDeliveryAdmin = (req, res, next) => {
  if (req.session.user && req.session.user.role === 'delivery_admin') {
    next();
  } else {
    req.flash('error_msg', 'Access Denied: Delivery Admin privileges required.');
    res.status(403).redirect('/');
  }
};

const isAdminOrDeliveryAdmin = (req, res, next) => {
    if (req.session.user && (req.session.user.role === 'admin' || req.session.user.role === 'delivery_admin')) {
      next();
    } else {
      req.flash('error_msg', 'Access Denied: Admin or Delivery Admin privileges required.');
      res.status(403).redirect('/');
    }
}

module.exports = { isAdmin, isDeliveryAdmin, isAdminOrDeliveryAdmin };
