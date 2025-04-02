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

    if (!name || !email || !password || !confirmPassword) {
        req.flash('error_msg', 'Please fill in all fields.');
        return res.redirect('/auth/register');
    }
    if (password !== confirmPassword) {
        req.flash('error_msg', 'Passwords do not match.');
        return res.redirect('/auth/register');
    }
    if (password.length < 6) {
        req.flash('error_msg', 'Password must be at least 6 characters.');
        return res.redirect('/auth/register');
    }

    try {
        let user = await User.findOne({ email: email.toLowerCase() });

        if (user && user.isVerified) {
            req.flash('error_msg', 'Email is already registered and verified.');
            return res.redirect('/auth/login');
        }

        const otp = generateOTP();
        const otpExpires = setOTPExpiration(10);

        if (user && !user.isVerified) {
            user.name = name;
            user.password = password;
            user.otp = otp;
            user.otpExpires = otpExpires;
            user.isVerified = false;
             await user.save({ validateBeforeSave: false });
        } else {
            user = new User({
                name,
                email: email.toLowerCase(),
                password,
                otp,
                otpExpires,
                isVerified: false,
            });
            await user.save();
        }

        const subject = 'Verify Your Email Address';
        const text = `Your verification OTP is: ${otp}\nIt will expire in 10 minutes.`;
        const html = `<p>Your verification OTP is: <strong>${otp}</strong></p><p>It will expire in 10 minutes.</p>`;

        const emailSent = await sendEmail(user.email, subject, text, html);

        if (emailSent) {
            req.flash('success_msg', `An OTP has been sent to ${user.email}. Please verify.`);
            res.redirect(`/auth/verify-otp?email=${encodeURIComponent(user.email)}`);
        } else {
             await User.deleteOne({ _id: user._id, isVerified: false });
            req.flash('error_msg', 'Could not send OTP email. Please try registering again or contact support.');
            res.redirect('/auth/register');
        }

    } catch (error) {
        if (error.code === 11000) {
            req.flash('error_msg', 'Email already exists.');
             return res.redirect('/auth/register');
        }
        if (error.name === 'ValidationError') {
           let errors = Object.values(error.errors).map(el => el.message);
            req.flash('error_msg', errors.join(' '));
            return res.redirect('/auth/register');
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
        const user = await User.findOne({
            email: email.toLowerCase(),
            otp: otp,
            otpExpires: { $gt: Date.now() },
        }).select('+password');

        if (!user) {
            req.flash('error_msg', 'Invalid or expired OTP.');
            return res.redirect(`/auth/verify-otp?email=${encodeURIComponent(email)}`);
        }

         let wasPasswordReset = user.resetPasswordToken && user.resetPasswordExpires > Date.now();

         user.isVerified = true;
         user.otp = undefined;
         user.otpExpires = undefined;

         if(wasPasswordReset){
             req.flash('success_msg', 'OTP Verified. Please set your new password.');
             await user.save({ validateBeforeSave: false });
             res.redirect(`/auth/reset-password/${user.resetPasswordToken}`);
         } else {
            await user.save();

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
                    return next(err);
                }
                req.flash('success_msg', 'Email verified successfully! You are now logged in.');
                const returnTo = req.session.returnTo || '/';
                delete req.session.returnTo;
                res.redirect(returnTo);
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
        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            req.flash('error_msg', 'User not found.');
            return res.redirect('/auth/register');
        }

        if(user.isVerified && !(user.resetPasswordToken && user.resetPasswordExpires > Date.now())) {
             req.flash('error_msg', 'This account is already verified.');
            return res.redirect('/auth/login');
        }

        const otp = generateOTP();
        const otpExpires = setOTPExpiration(10);

        user.otp = otp;
        user.otpExpires = otpExpires;
        await user.save();

        let subject = 'Your New Verification OTP';
         let text = `Your new verification OTP is: ${otp}\nIt will expire in 10 minutes.`;
        let html = `<p>Your new verification OTP is: <strong>${otp}</strong></p><p>It will expire in 10 minutes.</p>`;


        const emailSent = await sendEmail(user.email, subject, text, html);

        if (emailSent) {
            req.flash('success_msg', `A new OTP has been sent to ${user.email}.`);
            res.redirect(`/auth/verify-otp?email=${encodeURIComponent(user.email)}`);
        } else {
            req.flash('error_msg', 'Could not resend OTP email. Please try again.');
             res.redirect(`/auth/verify-otp?email=${encodeURIComponent(user.email)}`);
        }
    } catch (error) {
        next(error);
    }
};


exports.loginUser = async (req, res, next) => {
    const { email, password } = req.body;

    if (!email || !password) {
        req.flash('error_msg', 'Please provide email and password.');
        return res.redirect('/auth/login');
    }

    try {
        const user = await User.findOne({ email: email.toLowerCase() }).select('+password').populate('cart.productId');

        if (!user) {
            req.flash('error_msg', 'Invalid credentials.');
            return res.redirect('/auth/login');
        }

         if (!user.isVerified) {
            req.flash('error_msg', 'Please verify your email first. An OTP was sent during registration.');
            return res.redirect(`/auth/verify-otp?email=${encodeURIComponent(user.email)}`);
         }

        const isMatch = await user.matchPassword(password);

        if (!isMatch) {
            req.flash('error_msg', 'Invalid credentials.');
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

         req.session.regenerate(err => {
            if (err) {
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
                     return next(err);
                 }
                 req.flash('success_msg', 'You are now logged in.');
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
    req.session.destroy(err => {
        if (err) {
            console.error('Session destruction error:', err);
            return next(err);
        }
        res.clearCookie('connect.sid');
        req.flash('success_msg', 'You have been logged out.');
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
        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            req.flash('success_msg', 'If an account with that email exists, a password reset OTP will be sent.');
            return res.redirect('/auth/forgot-password');
        }
        if (!user.isVerified) {
            req.flash('error_msg', 'This account is not verified. Please complete registration verification first.');
             return res.redirect(`/auth/verify-otp?email=${encodeURIComponent(user.email)}`);
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
         const text = `You requested a password reset.\n\nPlease use the following OTP to verify your request: ${otp}\n\nIt will expire in 10 minutes.\n\nIf you did not request this, please ignore this email.`;
         const html = `<p>You requested a password reset.</p><p>Please use the following OTP to verify your request: <strong>${otp}</strong></p><p>It will expire in 10 minutes.</p><p>If you did not request this, please ignore this email.</p>`;

         const emailSent = await sendEmail(user.email, subject, text, html);

        if (emailSent) {
            req.flash('success_msg', `An OTP has been sent to ${user.email} to verify your password reset request.`);
             res.redirect(`/auth/verify-otp?email=${encodeURIComponent(user.email)}&reason=reset`);
        } else {
            user.otp = undefined;
            user.otpExpires = undefined;
             user.resetPasswordToken = undefined;
            user.resetPasswordExpires = undefined;
             await user.save();
            req.flash('error_msg', 'Could not send password reset OTP. Please try again.');
            res.redirect('/auth/forgot-password');
        }

    } catch (error) {
        next(error);
    }
};


exports.resetPassword = async (req, res, next) => {
    const { password, confirmPassword } = req.body;
    const token = req.params.token;

    if (!password || !confirmPassword) {
        req.flash('error_msg', 'Please enter and confirm your new password.');
         return res.redirect(`/auth/reset-password/${token}`);
    }

    if (password !== confirmPassword) {
        req.flash('error_msg', 'Passwords do not match.');
         return res.redirect(`/auth/reset-password/${token}`);
    }
     if (password.length < 6) {
         req.flash('error_msg', 'Password must be at least 6 characters.');
        return res.redirect(`/auth/reset-password/${token}`);
    }

    try {
        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() },
         });


        if (!user) {
            req.flash('error_msg', 'Password reset token is invalid or has expired.');
            return res.redirect('/auth/forgot-password');
        }

        user.password = password;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
         user.otp = undefined;
         user.otpExpires = undefined;

        await user.save();

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
                console.error("Session save error after reset:", err)
             }
             req.flash('success_msg', 'Password has been reset successfully. You are now logged in.');
            res.redirect('/');
        });


    } catch (error) {
        next(error);
    }
};

exports.getHomePage = async (req, res, next) => {
  try {
    const products = await Product.find({ stock: { $gt: 0 } }).sort({ createdAt: -1 });
    res.render('products/index', {
      title: 'Home',
      products: products,
       searchTerm: ''
    });
  } catch (error) {
    next(error);
  }
};

