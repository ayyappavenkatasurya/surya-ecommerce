// controllers/authController.js
const User = require('../models/User');
const Product = require('../models/Product');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { generateOTP, setOTPExpiration } = require('../services/otpService');
const { sendEmail } = require('../config/mailer');

exports.getLoginPage = (req, res) => {
    if (req.session.user) {
         return res.redirect('/');
    }
    res.render('auth/login', { title: 'Login' });
};

exports.getRegisterPage = (req, res) => {
    if (req.session.user) {
        return res.redirect('/');
   }
    res.render('auth/register', { title: 'Register' });
};

exports.getVerifyOtpPage = (req, res) => {
    const email = req.query.email;
    if (!email) {
        req.flash('error_msg', 'Email required for OTP verification.');
        return res.redirect('/auth/register');
    }
     if (req.session.user) {
        return res.redirect('/');
   }
    res.render('auth/verify-otp', { title: 'Verify Email', email });
};

exports.getForgotPasswordPage = (req, res) => {
     if (req.session.user) {
         return res.redirect('/');
    }
    res.render('auth/forgot-password', { title: 'Forgot Password' });
};

exports.getResetPasswordPage = async (req, res, next) => {
    try {
        const user = await User.findOne({
            resetPasswordToken: req.params.token,
            resetPasswordExpires: { $gt: Date.now() },
        });

        if (!user) {
            req.flash('error_msg', 'Password reset token is invalid or has expired.');
            return res.redirect('/auth/forgot-password');
        }
        res.render('auth/reset-password', { title: 'Reset Password', token: req.params.token });
    } catch (error) {
        next(error);
    }
};

exports.registerUser = async (req, res, next) => {
    const { name, email, password, confirmPassword } = req.body;

    let errors = [];
    if (!name || !email || !password || !confirmPassword) {
        errors.push('Please fill in all fields.');
    }
    if (password !== confirmPassword) {
        errors.push('Passwords do not match.');
    }
    if (password && password.length < 6) {
        errors.push('Password must be at least 6 characters.');
    }
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
        errors.push('Please enter a valid email address.');
    }

    if (errors.length > 0) {
        req.flash('error_msg', errors.join(' '));
        return res.render('auth/register', {
            title: 'Register',
            name: name,
            email: email,
        });
    }

    try {
        const lowerCaseEmail = email.toLowerCase();
        let user = await User.findOne({ email: lowerCaseEmail });

        if (user && user.isVerified) {
            req.flash('error_msg', 'Email is already registered and verified.');
            return res.redirect('/auth/login');
        }

        const otp = generateOTP();
        const otpExpires = setOTPExpiration(10);

        if (user && !user.isVerified) {
            user.name = name;
            if (password) { user.password = password; }
            user.otp = otp;
            user.otpExpires = otpExpires;
            user.isVerified = false;
            await user.save({ validateBeforeSave: false });
        } else {
            user = new User({
                name,
                email: lowerCaseEmail,
                password,
                otp,
                otpExpires,
                isVerified: false,
            });
            await user.save();
        }

        const subject = 'Verify Your Email Address';
        const text = `Your verification OTP is: ${otp}\nIt will expire in 10 minutes.`;
        const html = `<p>Welcome to our store!</p><p>Your verification OTP is: <strong>${otp}</strong></p><p>It will expire in 10 minutes.</p>`;

        const emailSent = await sendEmail(user.email, subject, text, html);

        if (emailSent) {
            req.flash('success_msg', `An OTP has been sent to ${user.email}. Please check your inbox and verify.`);
            res.redirect(`/auth/verify-otp?email=${encodeURIComponent(user.email)}`);
        } else {
             if(!user.createdAt || (Date.now() - user.createdAt.getTime()) < 5000) {
                try {
                    await User.deleteOne({ _id: user._id, isVerified: false });
                    console.log(`Cleaned up unverified user ${user.email} due to failed email send.`);
                } catch (deleteError) {
                    console.error(`Error cleaning up user ${user.email}:`, deleteError);
                }
             }
            req.flash('error_msg', 'Could not send OTP email. Please try registering again or contact support.');
            res.redirect('/auth/register');
        }

    } catch (error) {
        if (error.code === 11000) {
            req.flash('error_msg', 'Email already exists. Please login or use a different email.');
            return res.render('auth/register', { title: 'Register', name: name, email: email });
        }
        if (error.name === 'ValidationError') {
           let validationErrors = Object.values(error.errors).map(el => el.message);
            req.flash('error_msg', validationErrors.join(' '));
            return res.render('auth/register', { title: 'Register', name: name, email: email });
       }
        next(error);
    }
};

exports.verifyOtp = async (req, res, next) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        req.flash('error_msg', 'Email and OTP are required.');
         return res.redirect(`/auth/verify-otp?email=${encodeURIComponent(email || '')}`);
    }

    try {
        const lowerCaseEmail = email.toLowerCase();
        const user = await User.findOne({
            email: lowerCaseEmail,
            otp: otp,
            otpExpires: { $gt: Date.now() },
        }).select('+password');

        if (!user) {
            const existingUser = await User.findOne({ email: lowerCaseEmail });
            if (existingUser && !existingUser.isVerified) {
                req.flash('error_msg', 'Invalid or expired OTP. Please try again or resend.');
            } else if (existingUser && existingUser.isVerified) {
                 req.flash('error_msg', 'This account is already verified. Please login.');
                 return res.redirect('/auth/login');
            } else {
                 req.flash('error_msg', 'Verification failed. Please try registering again.');
                 return res.redirect('/auth/register');
            }
            return res.redirect(`/auth/verify-otp?email=${encodeURIComponent(email)}`);
        }

         const isPasswordReset = user.resetPasswordToken && user.resetPasswordExpires && user.resetPasswordExpires > Date.now();

         user.isVerified = true;
         user.otp = undefined;
         user.otpExpires = undefined;

         if(isPasswordReset){
             await user.save({ validateBeforeSave: false });

             req.flash('success_msg', 'OTP Verified. Please set your new password.');
             res.redirect(`/auth/reset-password/${user.resetPasswordToken}`);
         } else {
            await user.save();

             req.session.regenerate(err => {
                if (err) {
                     console.error("Session regeneration error after OTP verify:", err);
                     return next(err);
                 }

                req.session.user = {
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    address: user.address,
                    cart: user.cart || []
                 };

                req.session.save(err => {
                   if (err) {
                        console.error("Session save error after OTP verify login:", err);
                        return next(err);
                    }
                    req.flash('success_msg', 'Email verified successfully! You are now logged in.');
                    const returnTo = req.session.returnTo || '/';
                    delete req.session.returnTo;
                    res.redirect(returnTo);
                 });
             });
         }

    } catch (error) {
        next(error);
    }
};

exports.resendOtp = async (req, res, next) => {
    const { email } = req.body;

    if (!email) {
        req.flash('error_msg', 'Email is required to resend OTP.');
         return res.redirect(`/auth/verify-otp?email=${encodeURIComponent(req.query.email || '')}`);
    }

    try {
        const lowerCaseEmail = email.toLowerCase();
        const user = await User.findOne({ email: lowerCaseEmail });

        if (!user) {
            req.flash('error_msg', 'If your email is registered, an OTP will be sent. Please check your inbox.');
            return res.redirect('/auth/register');
        }

        const isForReset = user.resetPasswordToken && user.resetPasswordExpires && user.resetPasswordExpires > Date.now();

        if(user.isVerified && !isForReset) {
             req.flash('error_msg', 'This account is already verified. Please login.');
            return res.redirect('/auth/login');
        }

        const otp = generateOTP();
        const otpExpires = setOTPExpiration(10);

        user.otp = otp;
        user.otpExpires = otpExpires;
        await user.save();

        let subject, text, html;
        if (isForReset) {
            subject = 'Your New Password Reset OTP';
             text = `Your new password reset OTP is: ${otp}\nIt will expire in 10 minutes.\nIf you did not request this, please ignore this email.`;
            html = `<p>Your new password reset OTP is: <strong>${otp}</strong></p><p>It will expire in 10 minutes.</p><p>If you did not request this, please ignore this email.</p>`;
        } else {
             subject = 'Your New Verification OTP';
             text = `Your new verification OTP is: ${otp}\nIt will expire in 10 minutes.`;
            html = `<p>Your new verification OTP is: <strong>${otp}</strong></p><p>It will expire in 10 minutes.</p>`;
        }

        const emailSent = await sendEmail(user.email, subject, text, html);

        const redirectUrl = `/auth/verify-otp?email=${encodeURIComponent(user.email)}${isForReset ? '&reason=reset' : ''}`;

        if (emailSent) {
            req.flash('success_msg', `A new OTP has been sent to ${user.email}. Please check your inbox.`);
        } else {
            req.flash('error_msg', 'Could not resend OTP email. Please try again or contact support.');
        }
        res.redirect(redirectUrl);

    } catch (error) {
        next(error);
    }
};

exports.loginUser = async (req, res, next) => {
    const { email, password } = req.body;

    if (!email || !password) {
        req.flash('error_msg', 'Please provide both email and password.');
        return res.render('auth/login', { title: 'Login', email: email });
    }

    try {
        const lowerCaseEmail = email.toLowerCase();
        const user = await User.findOne({ email: lowerCaseEmail })
                             .select('+password')
                             .populate('cart.productId');

        if (!user) {
            req.flash('error_msg', 'Invalid credentials. Please check your email and password.');
            return res.render('auth/login', { title: 'Login', email: email });
        }

         if (!user.isVerified) {
            req.flash('error_msg', 'Your email is not verified. Please check your inbox for the verification OTP or request a new one.');
            return res.redirect(`/auth/verify-otp?email=${encodeURIComponent(user.email)}`);
         }

        const isMatch = await user.matchPassword(password);

        if (!isMatch) {
            req.flash('error_msg', 'Invalid credentials. Please check your email and password.');
            return res.render('auth/login', { title: 'Login', email: email });
        }

         req.session.regenerate(err => {
            if (err) {
                 console.error("Session regeneration error during login:", err);
                 return next(err);
             }

            req.session.user = {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                address: user.address,
                cart: user.cart
            };

             req.session.save(err => {
                 if (err) {
                     console.error("Session save error after login:", err);
                     return next(err);
                 }
                 req.flash('success_msg', 'You are now logged in successfully.');
                 const returnTo = req.session.returnTo || '/';
                 delete req.session.returnTo;
                 res.redirect(returnTo);
            });
        });

    } catch (error) {
        next(error);
    }
};

exports.logoutUser = (req, res, next) => {
    req.flash('success_msg', 'You have been logged out successfully.');

    req.session.destroy(err => {
        if (err) {
            console.error('Session destruction error:', err);
            req.flash('error_msg', 'Could not fully logout. Please clear your browser cookies.');
            return res.redirect('/auth/login');
        }
        res.clearCookie('connect.sid');
        res.redirect('/auth/login');
    });
};

exports.forgotPassword = async (req, res, next) => {
    const { email } = req.body;
    if (!email) {
        req.flash('error_msg', 'Please provide an email address.');
        return res.redirect('/auth/forgot-password');
    }

    try {
        const lowerCaseEmail = email.toLowerCase();
        const user = await User.findOne({ email: lowerCaseEmail });

        const genericMessage = 'If an account with that email exists and is verified, a password reset OTP will be sent. Please check your inbox.';
        req.flash('success_msg', genericMessage);

        if (!user || !user.isVerified) {
            console.log(`Password reset request for ${lowerCaseEmail}: User ${!user ? 'not found' : 'found but not verified'}. Sending generic response.`);
            return res.redirect('/auth/forgot-password');
        }

         const otp = generateOTP();
         const resetToken = crypto.randomBytes(20).toString('hex');
        const otpExpires = setOTPExpiration(10);
        const resetExpires = setOTPExpiration(60);

        user.otp = otp;
        user.otpExpires = otpExpires;
        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = resetExpires;
        await user.save();

        const subject = 'Password Reset Request - Verify OTP';
        const text = `You requested a password reset.\n\nPlease use the following OTP to verify your request: ${otp}\n\nThis OTP will expire in 10 minutes.\n\nIf you did not request this, please ignore this email.`;
        const html = `<p>You requested a password reset.</p><p>Please use the following OTP to verify your request: <strong>${otp}</strong></p><p>This OTP will expire in 10 minutes.</p><p>If you did not request this, please ignore this email.</p>`;

         const emailSent = await sendEmail(user.email, subject, text, html);

        if (emailSent) {
             console.log(`Password reset OTP sent to verified user: ${user.email}`);
             res.redirect(`/auth/verify-otp?email=${encodeURIComponent(user.email)}&reason=reset`);
        } else {
            user.otp = undefined;
            user.otpExpires = undefined;
            user.resetPasswordToken = undefined;
            user.resetPasswordExpires = undefined;
            await user.save();

            console.error(`Failed to send password reset OTP email to ${user.email}`);
            res.redirect('/auth/forgot-password');
        }

    } catch (error) {
        console.error("Error in forgotPassword:", error);
        req.flash('error_msg', 'An error occurred while processing your request. Please try again later.');
        res.redirect('/auth/forgot-password');
    }
};

exports.resetPassword = async (req, res, next) => {
    const { password, confirmPassword } = req.body;
    const token = req.params.token;

    let errors = [];
    if (!password || !confirmPassword) {
        errors.push('Please enter and confirm your new password.');
    }
    if (password !== confirmPassword) {
        errors.push('Passwords do not match.');
    }
     if (password && password.length < 6) {
         errors.push('Password must be at least 6 characters.');
    }
    if (errors.length > 0) {
         req.flash('error_msg', errors.join(' '));
         return res.redirect(`/auth/reset-password/${token}`);
    }

    try {
        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() },
         });

        if (!user) {
            req.flash('error_msg', 'Password reset token is invalid or has expired. Please request a new reset link.');
            return res.redirect('/auth/forgot-password');
        }

        user.password = password;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        user.otp = undefined;
        user.otpExpires = undefined;

        await user.save();

        req.session.regenerate(err => {
             if (err) {
                console.error("Session regeneration error after password reset:", err);
                req.flash('error_msg', 'Password reset but failed to log you in automatically. Please log in with your new password.');
                return res.redirect('/auth/login');
             }
             req.session.user = {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                address: user.address,
                cart: user.cart
            };
            req.session.save(err => {
                if(err) {
                    console.error("Session save error after password reset login:", err);
                    req.flash('error_msg', 'Password reset but failed to log you in automatically. Please log in with your new password.');
                    return res.redirect('/auth/login');
                 }
                 req.flash('success_msg', 'Password has been reset successfully. You are now logged in.');
                res.redirect('/');
             });
         });

    } catch (error) {
        if (error.name === 'ValidationError') {
           let validationErrors = Object.values(error.errors).map(el => el.message);
            req.flash('error_msg', validationErrors.join(' '));
            return res.redirect(`/auth/reset-password/${token}`);
       }
        next(error);
    }
};

exports.getHomePage = async (req, res, next) => {
  try {
    const searchTerm = req.query.search || '';
    let query = {};

    if (searchTerm) {
      const escapedSearchTerm = searchTerm.replace(/[-\[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
      const regex = new RegExp(escapedSearchTerm, 'i');
      query.$or = [
         { name: regex },
         { category: regex },
         { specifications: regex }
      ];
    }

    const products = await Product.find(query).sort({ createdAt: -1 }).lean();

    res.render('products/index', {
      title: searchTerm ? `Search Results for "${searchTerm}"` : 'Home',
      products: products,
      searchTerm: searchTerm
    });
  } catch (error) {
    console.error("Error fetching products for home page:", error);
    next(error);
  }
};