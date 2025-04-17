// middleware/roleMiddleware.js

const isAdmin = (req, res, next) => {
  if (req.session.user && req.session.user.role === 'admin') {
    next();
  } else {
    req.flash('error_msg', 'Access Denied: Admin privileges required.');
    res.status(403).redirect('/');
  }
};

module.exports = { isAdmin }; 