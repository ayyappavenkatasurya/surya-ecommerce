const User = require('../models/User');

const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.user) {
        User.findById(req.session.user._id).then(user => {
            if (!user) {
                req.session.destroy(err => {
                    if (err) {
                        console.error('Session destruction error:', err);
                        return next(err);
                    }
                    req.flash('error_msg', 'Session expired or user not found. Please login again.');
                    res.redirect('/auth/login');
                });
            } else {
                req.user = user;
                res.locals.currentUser = user;
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

module.exports = { isAuthenticated };
