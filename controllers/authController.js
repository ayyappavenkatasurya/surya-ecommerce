// controllers/authController.js
const User = require('../models/User');
const Product = require('../models/Product');
const BannerConfig = require('../models/BannerConfig'); // *** Keep this line ***
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { generateOTP, setOTPExpiration } = require('../services/otpService');
const { sendEmail } = require('../config/mailer');

// --- Helper function for escaping Regex characters ---
function escapeRegex(string) {
  return string.replace(/[-\[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

// --- getLoginPage, getRegisterPage, getVerifyOtpPage, etc. (No changes needed) ---
exports.getLoginPage = (req, res) => {
    if (req.session.user) {
         return res.redirect('/'); // Redirect if already logged in
    }
    res.render('auth/login', { title: 'Login' });
};

exports.getRegisterPage = (req, res) => {
    if (req.session.user) {
        return res.redirect('/'); // Redirect if already logged in
   }
    res.render('auth/register', { title: 'Register' });
};

exports.getVerifyOtpPage = (req, res) => {
    const email = req.query.email;
    if (!email) {
        req.flash('error_msg', 'Email required for OTP verification.');
        return res.redirect('/auth/register');
    }
     if (req.session.user) { // Redirect if already logged in, even on OTP page? Controversial but prevents odd states.
        return res.redirect('/');
   }
    res.render('auth/verify-otp', { title: 'Verify Email', email });
};

exports.getForgotPasswordPage = (req, res) => {
     if (req.session.user) {
         return res.redirect('/'); // Redirect if already logged in
    }
    res.render('auth/forgot-password', { title: 'Forgot Password' });
};

exports.getResetPasswordPage = async (req, res, next) => {
     if (req.session.user) { // Should logged-in users be able to reset password this way? Probably redirect.
         req.flash('info_msg', 'You are already logged in.');
         return res.redirect('/');
    }
    try {
        // Find user by token and check expiration
        const user = await User.findOne({
            resetPasswordToken: req.params.token,
            resetPasswordExpires: { $gt: Date.now() }, // Ensure token is not expired
        });

        if (!user) {
            req.flash('error_msg', 'Password reset token is invalid or has expired.');
            return res.redirect('/auth/forgot-password');
        }
        // Token is valid, render the reset form
        res.render('auth/reset-password', { title: 'Reset Password', token: req.params.token });
    } catch (error) {
        next(error); // Pass errors to the error handler
    }
};

// --- registerUser, verifyOtp, resendOtp, loginUser (No changes needed from previous version) ---
exports.registerUser = async (req, res, next) => {
     if (req.session.user) {
        return res.redirect('/'); // Redirect if already logged in
    }
    const { name, email, password, confirmPassword } = req.body;

    // --- Input Validation ---
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
            error_msg: req.flash('error_msg')
        });
    }

    // --- Registration Logic ---
    try {
        const lowerCaseEmail = email.toLowerCase();
        let user = await User.findOne({ email: lowerCaseEmail });

        if (user && user.isVerified) {
            req.flash('error_msg', 'Email is already registered and verified. Please login.');
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
            console.log(`Updating existing unverified user: ${user.email}`);
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
            console.log(`New user created: ${user.email}`);
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
                    console.error(`Error cleaning up unverified user ${user.email}:`, deleteError);
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

     if (req.session.user) {
        return res.redirect('/');
    }

    if (!email || !otp) {
        req.flash('error_msg', 'Email and OTP are required.');
         return res.redirect(`/auth/verify-otp?email=${encodeURIComponent(email || '')}`);
    }

    try {
        const lowerCaseEmail = email.toLowerCase();
        const user = await User.findOne({
            email: lowerCaseEmail,
            otp: otp.trim(),
            otpExpires: { $gt: Date.now() },
        }).select('+password');

        if (!user) {
            const existingUser = await User.findOne({ email: lowerCaseEmail });
            let errorMessage = 'Invalid or expired OTP. Please try again or resend.';

            if (existingUser && existingUser.isVerified) {
                 errorMessage = 'This account is already verified. Please login.';
                 req.flash('error_msg', errorMessage);
                 return res.redirect('/auth/login');
            } else if (!existingUser) {
                 errorMessage = 'Verification failed. Account not found. Please register again.';
                 req.flash('error_msg', errorMessage);
                 return res.redirect('/auth/register');
            }
             req.flash('error_msg', errorMessage);
            return res.redirect(`/auth/verify-otp?email=${encodeURIComponent(email)}`);
        }

         const isPasswordReset = user.resetPasswordToken && user.resetPasswordExpires && user.resetPasswordExpires > Date.now();

         user.isVerified = true;
         user.otp = undefined;
         user.otpExpires = undefined;

         if (isPasswordReset) {
             await user.save({ validateBeforeSave: false });
             req.flash('success_msg', 'OTP Verified. Please set your new password.');
             return res.redirect(`/auth/reset-password/${user.resetPasswordToken}`);
         }
         else {
            await user.save({ validateBeforeSave: false });

             req.session.regenerate(err => {
                if (err) {
                     console.error("Session regeneration error after OTP verify:", err);
                     req.flash('error_msg', 'Verification successful, but auto-login failed. Please login manually.');
                     return res.redirect('/auth/login');
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
                         req.flash('error_msg', 'Verification successful, but auto-login failed. Please login manually.');
                        return res.redirect('/auth/login');
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

     if (req.session.user) {
        return res.redirect('/');
    }

    if (!email) {
        req.flash('error_msg', 'Email is required to resend OTP.');
         return res.redirect(`/auth/verify-otp?email=${encodeURIComponent(req.query.email || '')}`);
    }

    try {
        const lowerCaseEmail = email.toLowerCase();
        const user = await User.findOne({ email: lowerCaseEmail });

        if (!user) {
            console.log(`Resend OTP attempt for non-existent email: ${lowerCaseEmail}`);
            req.flash('info_msg', 'If your email is registered, a new OTP will be sent. Please check your inbox.');
            return res.redirect(`/auth/verify-otp?email=${encodeURIComponent(email)}`);
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
        await user.save({ validateBeforeSave: false });

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
            console.error(`Failed to resend OTP email to ${user.email}`);
            req.flash('error_msg', 'Could not resend OTP email. Please try again later or contact support.');
        }
        res.redirect(redirectUrl);

    } catch (error) {
        next(error);
    }
};

exports.loginUser = async (req, res, next) => {
     if (req.session.user) {
        return res.redirect('/');
    }
    const { email, password } = req.body;

    if (!email || !password) {
        req.flash('error_msg', 'Please provide both email and password.');
        return res.render('auth/login', { title: 'Login', email: email });
    }

    try {
        const lowerCaseEmail = email.toLowerCase();
        const user = await User.findOne({ email: lowerCaseEmail })
                             .select('+password')
                             .populate('cart.productId', 'name price imageUrl');

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
                 req.flash('error_msg', 'Login failed due to a session error. Please try again.');
                 return res.render('auth/login', { title: 'Login', email: email });
             }

            req.session.user = {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                address: user.address ? user.address.toObject() : undefined,
                cart: user.cart ? user.cart.map(item => ({
                    productId: item.productId?._id,
                    quantity: item.quantity
                })) : []
             };

             req.session.save(err => {
                 if (err) {
                     console.error("Session save error after login:", err);
                     req.flash('error_msg', 'Login successful, but session could not be saved. Please try again.');
                      return res.render('auth/login', { title: 'Login', email: email });
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
             return res.redirect('/auth/login');
        }
        res.clearCookie(req.app.get('session cookie name') || 'connect.sid');
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
        req.flash('info_msg', genericMessage);

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
        await user.save({ validateBeforeSave: false });

        const subject = 'Password Reset Request - Verify OTP';
        const text = `You requested a password reset.\n\nPlease use the following OTP to verify your request: ${otp}\n\nThis OTP will expire in 10 minutes.\n\nIf you did not request this, please ignore this email.`;
        const html = `<p>You requested a password reset.</p><p>Please use the following OTP to verify your request: <strong>${otp}</strong></p><p>This OTP will expire in 10 minutes.</p><p>If you did not request this, please ignore this email.</p>`;

         const emailSent = await sendEmail(user.email, subject, text, html);

        if (emailSent) {
             console.log(`Password reset OTP sent to verified user: ${user.email}`);
             res.redirect(`/auth/verify-otp?email=${encodeURIComponent(user.email)}&reason=reset`);
        } else {
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
         }).select('+password');

        if (!user) {
            req.flash('error_msg', 'Password reset token is invalid or has expired. Please request a new reset link.');
            return res.redirect('/auth/forgot-password');
        }

        user.password = password;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        user.otp = undefined;
        user.otpExpires = undefined;
        user.isVerified = true;

        await user.save();

        req.session.regenerate(err => {
             if (err) {
                console.error("Session regeneration error after password reset:", err);
                req.flash('success_msg', 'Password reset successful. Please log in with your new password.');
                return res.redirect('/auth/login');
             }
              req.session.user = {
                  _id: user._id, name: user.name, email: user.email, role: user.role,
                  address: user.address ? user.address.toObject() : undefined,
                  cart: user.cart ? user.cart.map(item => ({ productId: item.productId, quantity: item.quantity })) : []
              };

            req.session.save(err => {
                if(err) {
                    console.error("Session save error after password reset login:", err);
                     req.flash('success_msg', 'Password reset successful. Please log in with your new password.');
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


// --- UPDATED getHomePage ---
exports.getHomePage = async (req, res, next) => {
  try {
    const searchTerm = req.query.search || '';
    let query = {
        reviewStatus: 'approved',
        stock: { $gt: 0 }
    };
    let sort = { createdAt: -1 }; // Default sort: newest first

    // --- Use Regex for sequential matching if searchTerm exists ---
    if (searchTerm) {
      const escapedSearchTerm = escapeRegex(searchTerm); // Escape special characters
      const regex = new RegExp(escapedSearchTerm, 'i'); // 'i' for case-insensitive sequential match

      // *** INCLUDE description in the $or query ***
      query.$or = [
        { name: regex },
        { category: regex },
        { description: regex } // Search description field
        // Consider adding { specifications: regex } if needed
      ];
      // Optional: Change sort for search results if needed, e.g., alphabetical
      // sort = { name: 1 };
      console.log(`Homepage Regex Search Query: ${JSON.stringify(query)}`);
    }
    // --- End Regex modification ---

    // Fetch Products and Banners concurrently
    const [products, bannerConfig] = await Promise.all([
        Product.find(query) // Removed projection as text score is not used
               .sort(sort)  // Apply sort
               .lean(),
        BannerConfig.findOne({ configKey: 'mainBanners' }).lean()
    ]);

    // Extract banner URLs (provide empty array if none found)
    const banners = bannerConfig?.banners || [];
    const validBanners = banners.filter(banner => banner.imageUrl);


    res.render('products/index', {
      title: searchTerm ? `Search Results for "${searchTerm}"` : 'Home',
      products: products,
      searchTerm: searchTerm,
      homepageBanners: validBanners
    });
  } catch (error) {
    console.error("Error fetching products/banners for home page:", error);
    next(error);
  }
};