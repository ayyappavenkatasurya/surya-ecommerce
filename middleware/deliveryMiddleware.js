// middleware/deliveryMiddleware.js

const hasPhoneNumber = (req, res, next) => {
    // Check if the user is a delivery_admin and if they have a phone number saved
    if (req.session.user && req.session.user.role === 'delivery_admin') {
      // Access phone number safely using optional chaining
      const phoneNumber = req.session.user.address?.phone;
  
      if (phoneNumber && phoneNumber.trim() !== '') {
        // Phone number exists, allow access
        return next();
      } else {
        // No phone number, redirect to contact page
        // Check if already on the contact page to prevent redirect loop
        if (req.originalUrl !== '/delivery/contact') {
             req.flash('error_msg', 'Please add your phone number before accessing delivery features.');
             return res.redirect('/delivery/contact');
         } else {
             // Already on contact page, just proceed
              return next();
         }
      }
    } else {
      // Not a delivery admin or no session user (should be caught by earlier middleware, but handle defensively)
      req.flash('error_msg', 'Access Denied.');
      res.redirect('/');
    }
  };
  
  module.exports = { hasPhoneNumber };