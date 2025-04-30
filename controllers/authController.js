// controllers/authController.js
const User = require('../models/User');
const Product = require('../models/Product');
const BannerConfig = require('../models/BannerConfig');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { generateOTP, setOTPExpiration } = require('../services/otpService');
const { sendEmail } = require('../config/mailer');
// *** Import categories and names ***
const categories = require('../config/categories');
const { categoryNames } = require('../config/categories');

// --- Password Complexity Regex ---
const uppercaseRegex = /[A-Z]/;
const lowercaseRegex = /[a-z]/;
const numberRegex = /[0-9]/;
// Define allowed special characters (escape regex special chars like - \ [ ] /)
const specialCharRegex = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/;
const minPasswordLength = 8; // INCREASED MINIMUM LENGTH

// Generic Password Format Error Message
const passwordFormatErrorMsg = "password doesn't match requested format";


// --- getLoginPage, getRegisterPage, getVerifyOtpPage, etc. ---
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
   // Pass back potential form data from failed validation
    res.render('auth/register', {
        title: 'Register',
        name: req.flash('form_name')[0] || '', // Get flashed data if exists
        email: req.flash('form_email')[0] || ''
    });
};

exports.getVerifyOtpPage = (req, res) => {
    const email = req.query.email;
    if (!email) {
        req.flash('error_msg', 'Email required for OTP verification.');
        return res.redirect('/auth/register');
    }
     if (req.session.user) { // Redirect if already logged in
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
     if (req.session.user) {
         req.flash('info_msg', 'You are already logged in.');
         return res.redirect('/');
    }
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

// --- UPDATED registerUser ---
exports.registerUser = async (req, res, next) => {
     if (req.session.user) {
        return res.redirect('/');
    }
    const { name, email, password, confirmPassword } = req.body;

    let errors = [];
    if (!name || !email || !password || !confirmPassword) { errors.push('Please fill in all fields.'); }
    if (password !== confirmPassword) { errors.push('Passwords do not match.'); }
    if (email && !/^\S+@\S+\.\S+$/.test(email)) { errors.push('Please enter a valid email address.'); }

    // --- MODIFIED Password Complexity Validation ---
    let passwordComplexityFailed = false; // Flag to track if any complexity rule failed
    if (password) {
        if (
            password.length < minPasswordLength ||
            !uppercaseRegex.test(password) ||
            !lowercaseRegex.test(password) ||
            !numberRegex.test(password) ||
            !specialCharRegex.test(password)
        ) {
            passwordComplexityFailed = true; // Set flag if any rule fails
        }
    } else {
        // If password field itself is empty, it's caught by the initial check above
    }

    // Add the generic error message ONCE if any complexity rule failed
    if (passwordComplexityFailed) {
        // Check if the generic message is already added to avoid duplicates
        if (!errors.includes(passwordFormatErrorMsg)) {
             errors.push(passwordFormatErrorMsg);
        }
    }
    // --- END MODIFIED Password Complexity Validation ---

    if (errors.length > 0) {
        req.flash('error_msg', errors.join(' '));
        // Flash form data to repopulate
        req.flash('form_name', name);
        req.flash('form_email', email);
        return res.redirect('/auth/register'); // Redirect back to GET route
    }

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
            // Update existing unverified user
            user.name = name;
            if (password) { user.password = password; } // Hashing happens in pre-save
            user.otp = otp;
            user.otpExpires = otpExpires;
            user.isVerified = false;
            await user.save({ validateBeforeSave: true }); // Let Mongoose run its validators too
            console.log(`Updating existing unverified user: ${user.email}`);
        } else {
            // Create new user
            user = new User({ name, email: lowerCaseEmail, password, otp, otpExpires, isVerified: false });
            await user.save();
            console.log(`New user created: ${user.email}`);
        }

        // Send OTP Email (keep existing logic)
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
                } catch (deleteError) { console.error(`Error cleaning up unverified user ${user.email}:`, deleteError); }
             }
            req.flash('error_msg', 'Could not send OTP email. Please try registering again or contact support.');
            res.redirect('/auth/register');
        }
    } catch (error) {
        if (error.code === 11000) { // Duplicate email
            req.flash('error_msg', 'Email already exists. Please login or use a different email.');
             req.flash('form_name', name); // Flash values back
             req.flash('form_email', email);
            return res.redirect('/auth/register');
        }
        if (error.name === 'ValidationError') {
           // Mongoose validation errors
           let validationErrors = Object.values(error.errors).map(el => el.message);
            // If Mongoose minlength error exists, ensure our generic format message is shown instead or alongside
            if (validationErrors.some(msg => msg.includes('Password must be at least'))) {
                 if (!errors.includes(passwordFormatErrorMsg)) {
                    errors.push(passwordFormatErrorMsg);
                 }
                 // Filter out the specific mongoose length error if we added the generic one
                 validationErrors = validationErrors.filter(msg => !msg.includes('Password must be at least'));
            }
            // Combine remaining Mongoose errors with our custom ones
            const finalErrors = [...new Set([...errors, ...validationErrors])]; // Use Set to avoid duplicates
            req.flash('error_msg', finalErrors.join(' '));
            req.flash('form_name', name);
            req.flash('form_email', email);
            return res.redirect('/auth/register');
       }
        // Catch other errors
        console.error("Registration Error:", error);
        next(error); // Pass to global error handler
    }
};


exports.verifyOtp = async (req, res, next) => {
    const { email, otp } = req.body;
     if (req.session.user) { return res.redirect('/'); }
    if (!email || !otp) {
        req.flash('error_msg', 'Email and OTP are required.');
         return res.redirect(`/auth/verify-otp?email=${encodeURIComponent(email || '')}`);
    }
    try {
        const lowerCaseEmail = email.toLowerCase();
        const user = await User.findOne({ email: lowerCaseEmail, otp: otp.trim(), otpExpires: { $gt: Date.now() }, }).select('+password');

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
             await user.save({ validateBeforeSave: false }); // Skip validation on OTP verify for reset
             req.flash('success_msg', 'OTP Verified. Please set your new password.');
             return res.redirect(`/auth/reset-password/${user.resetPasswordToken}`);
         }
         else {
            await user.save({ validateBeforeSave: false }); // Skip validation on OTP verify for registration
             req.session.regenerate(err => {
                if (err) {
                     console.error("Session regeneration error after OTP verify:", err);
                     req.flash('error_msg', 'Verification successful, but auto-login failed. Please login manually.');
                     return res.redirect('/auth/login');
                 }
                req.session.user = { _id: user._id, name: user.name, email: user.email, role: user.role, address: user.address, cart: user.cart || [] };
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
     if (req.session.user) { return res.redirect('/'); }
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
        await user.save({ validateBeforeSave: false }); // Skip validation for OTP resend

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
     if (req.session.user) { return res.redirect('/'); }
    const { email, password } = req.body;
    if (!email || !password) {
        req.flash('error_msg', 'Please provide both email and password.');
        return res.render('auth/login', { title: 'Login', email: email });
    }
    try {
        const lowerCaseEmail = email.toLowerCase();
        // Select password explicitly for comparison
        const user = await User.findOne({ email: lowerCaseEmail }).select('+password').populate('cart.productId', 'name price imageUrl');

        if (!user) {
            req.flash('error_msg', 'Invalid credentials. Please check your email and password.');
            return res.render('auth/login', { title: 'Login', email: email });
        }
         if (!user.isVerified) {
            req.flash('error_msg', 'Your email is not verified. Please check your inbox for the verification OTP or request a new one.');
            return res.redirect(`/auth/verify-otp?email=${encodeURIComponent(user.email)}`);
         }
        // Match password using the instance method
        const isMatch = await user.matchPassword(password);
        if (!isMatch) {
            req.flash('error_msg', 'Invalid credentials. Please check your email and password.');
            return res.render('auth/login', { title: 'Login', email: email });
        }

         // Regenerate session upon successful login
         req.session.regenerate(err => {
            if (err) {
                 console.error("Session regeneration error during login:", err);
                 req.flash('error_msg', 'Login failed due to a session error. Please try again.');
                 return res.render('auth/login', { title: 'Login', email: email });
             }
            // Set user data in the new session
            req.session.user = {
                _id: user._id, name: user.name, email: user.email, role: user.role,
                address: user.address ? user.address.toObject() : undefined,
                // Ensure cart items are properly mapped for session storage
                cart: user.cart ? user.cart.map(item => ({ productId: item.productId?._id, quantity: item.quantity })) : []
             };
             // Save the session before redirecting
             req.session.save(err => {
                 if (err) {
                     console.error("Session save error after login:", err);
                     req.flash('error_msg', 'Login successful, but session could not be saved. Please try again.');
                      return res.render('auth/login', { title: 'Login', email: email });
                 }
                 req.flash('success_msg', 'You are now logged in successfully.');
                 const returnTo = req.session.returnTo || '/';
                 delete req.session.returnTo; // Clear the returnTo path
                 res.redirect(returnTo);
            });
        });
    } catch (error) {
        next(error);
    }
};

// --- REFINED logoutUser ---
exports.logoutUser = (req, res, next) => {
    const sessionUserEmail = req.session?.user?.email || 'User'; // Safely get email before potential destruction

    // 1. Set the flash message BEFORE destroying the session
    req.flash('success_msg', 'You have been logged out successfully.');

    // 2. Clear the user data from the current session object
    if (req.session) {
        req.session.user = null;
    }

    // 3. Clear the session cookie on the client side
    const cookieName = req.app.get('session cookie name') || 'connect.sid';
    res.clearCookie(cookieName);
    console.log(`${sessionUserEmail} - Cleared session cookie: ${cookieName}`);

    // 4. Initiate the session destruction in the store (asynchronously)
    // Log any errors but don't wait for it to complete before redirecting
    if (req.session) {
        req.session.destroy(err => {
            if (err) {
                console.error(`${sessionUserEmail} - Session destruction error (may be ignorable):`, err);
            } else {
                console.log(`${sessionUserEmail} - Session destroyed successfully in store.`);
            }
            // **DO NOT redirect inside this callback**
        });
    } else {
        console.log(`${sessionUserEmail} - No active session found to destroy.`);
    }

    // 5. Redirect the user immediately after clearing the cookie and initiating destruction
    return res.redirect('/auth/login');
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
        req.flash('info_msg', genericMessage); // Use info_msg for neutral feedback

        // Send generic message even if user not found or not verified for security
        if (!user || !user.isVerified) {
            console.log(`Password reset request for ${lowerCaseEmail}: User ${!user ? 'not found' : 'found but not verified'}. Sending generic response.`);
            return res.redirect('/auth/forgot-password');
        }

         // Generate OTP and Reset Token
         const otp = generateOTP();
         const resetToken = crypto.randomBytes(20).toString('hex');
        const otpExpires = setOTPExpiration(10); // OTP expiry (short)
        const resetExpires = setOTPExpiration(60); // Token expiry (longer)

        // Update user document
        user.otp = otp;
        user.otpExpires = otpExpires;
        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = resetExpires;
        await user.save({ validateBeforeSave: false }); // Skip validation for setting tokens/OTP

        // Send Email
        const subject = 'Password Reset Request - Verify OTP';
        const text = `You requested a password reset.\n\nPlease use the following OTP to verify your request: ${otp}\n\nThis OTP will expire in 10 minutes.\n\nIf you did not request this, please ignore this email.`;
        const html = `<p>You requested a password reset.</p><p>Please use the following OTP to verify your request: <strong>${otp}</strong></p><p>This OTP will expire in 10 minutes.</p><p>If you did not request this, please ignore this email.</p>`;
         const emailSent = await sendEmail(user.email, subject, text, html);

        // Redirect user to OTP verification page
        if (emailSent) {
             console.log(`Password reset OTP sent to verified user: ${user.email}`);
             // Redirect to verify OTP page, indicating it's for reset
             res.redirect(`/auth/verify-otp?email=${encodeURIComponent(user.email)}&reason=reset`);
        } else {
            // Handle email failure (keep generic message flashed)
            console.error(`Failed to send password reset OTP email to ${user.email}`);
            // Don't reveal email failure to user, redirect back
            res.redirect('/auth/forgot-password');
        }
    } catch (error) {
        console.error("Error in forgotPassword:", error);
        req.flash('error_msg', 'An error occurred while processing your request. Please try again later.');
        res.redirect('/auth/forgot-password');
    }
};

// --- UPDATED resetPassword ---
exports.resetPassword = async (req, res, next) => {
    const { password, confirmPassword } = req.body;
    const token = req.params.token;

    let errors = [];
    if (!password || !confirmPassword) { errors.push('Please enter and confirm your new password.'); }
    if (password !== confirmPassword) { errors.push('Passwords do not match.'); }

    // --- MODIFIED Password Complexity Validation ---
    let passwordComplexityFailed = false; // Flag
    if (password) {
        if (
            password.length < minPasswordLength ||
            !uppercaseRegex.test(password) ||
            !lowercaseRegex.test(password) ||
            !numberRegex.test(password) ||
            !specialCharRegex.test(password)
        ) {
            passwordComplexityFailed = true; // Set flag
        }
    }

    // Add the generic error message ONCE if needed
    if (passwordComplexityFailed) {
         if (!errors.includes(passwordFormatErrorMsg)) {
            errors.push(passwordFormatErrorMsg);
         }
    }
    // --- END MODIFIED Password Complexity Validation ---

    if (errors.length > 0) {
         req.flash('error_msg', errors.join(' '));
         return res.redirect(`/auth/reset-password/${token}`); // Redirect back to the form
    }

    try {
        // Find user by valid token and expiry, select password for pre-save hook
        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() },
        }).select('+password');

        if (!user) {
            req.flash('error_msg', 'Password reset token is invalid or has expired. Please request a new reset link.');
            return res.redirect('/auth/forgot-password');
        }

        // Assign the new password (bcrypt hashing is handled by the pre-save hook in User model)
        user.password = password;

        // Clear reset and OTP fields
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        user.otp = undefined;
        user.otpExpires = undefined;
        user.isVerified = true; // Ensure user is marked as verified

        // Save the user (will trigger pre-save hook for hashing)
        await user.save();

        // Log the user in after successful password reset
        req.session.regenerate(err => {
             if (err) {
                console.error("Session regeneration error after password reset:", err);
                req.flash('success_msg', 'Password reset successful. Please log in with your new password.');
                return res.redirect('/auth/login');
             }
              // Populate session data
              req.session.user = {
                  _id: user._id, name: user.name, email: user.email, role: user.role,
                  address: user.address ? user.address.toObject() : undefined,
                  // Initialize cart as empty after reset login.
                  cart: []
              };
            // Save session before redirecting
            req.session.save(err => {
                if(err) {
                    console.error("Session save error after password reset login:", err);
                     req.flash('success_msg', 'Password reset successful. Please log in with your new password.');
                    return res.redirect('/auth/login');
                 }
                 req.flash('success_msg', 'Password has been reset successfully. You are now logged in.');
                res.redirect('/'); // Redirect to homepage
             });
         });
    } catch (error) {
        if (error.name === 'ValidationError') {
           // Handle Mongoose validation errors during save (e.g., if minlength check fails again)
           let validationErrors = Object.values(error.errors).map(el => el.message);
            // Similar logic to handle Mongoose length error vs our generic one
             if (validationErrors.some(msg => msg.includes('Password must be at least'))) {
                 if (!errors.includes(passwordFormatErrorMsg)) {
                    errors.push(passwordFormatErrorMsg);
                 }
                 validationErrors = validationErrors.filter(msg => !msg.includes('Password must be at least'));
            }
            const finalErrors = [...new Set([...errors, ...validationErrors])];
            req.flash('error_msg', finalErrors.join(' '));
            return res.redirect(`/auth/reset-password/${token}`);
       }
        // Handle other errors
        console.error("Reset Password Error:", error);
        next(error); // Pass to global error handler
    }
};


// --- getHomePage ---
exports.getHomePage = async (req, res, next) => {
  try {
    const searchTerm = req.query.search || '';
    const categoryFilter = req.query.category || '';

    let query = {
        reviewStatus: 'approved',
        stock: { $gt: 0 }
    };

    if (searchTerm) {
         // Using MongoDB's text index for searching
         query.$text = { $search: searchTerm };
    }
    if (categoryFilter && categoryNames.includes(categoryFilter)) {
        query.category = categoryFilter;
    } else if (categoryFilter) {
        console.warn(`Invalid category filter attempted: ${categoryFilter}`);
    }

     // Define projection and sort based on whether a search term is present
     const projection = searchTerm ? { score: { $meta: "textScore" } } : {};
     const sort = searchTerm ? { score: { $meta: "textScore" } } : { createdAt: -1 };

    // Fetch Products, Banners concurrently
    const [products, bannerConfig] = await Promise.all([
        Product.find(query, projection).sort(sort).lean(),
        BannerConfig.findOne({ configKey: 'mainBanners' }).lean()
    ]);

    // Extract banner URLs
    const banners = bannerConfig?.banners || [];
    const validBanners = banners.filter(banner => banner.imageUrl);

    // Determine page title based on filters
    let pageTitle = 'Home';
    if (searchTerm) {
        pageTitle = `Search Results for "${searchTerm}"`;
    } else if (categoryFilter && categoryNames.includes(categoryFilter)) {
        pageTitle = `Category: ${categoryFilter}`;
    }

    res.render('products/index', {
      title: pageTitle,
      products: products,
      searchTerm: searchTerm,
      selectedCategory: categoryFilter && categoryNames.includes(categoryFilter) ? categoryFilter : null,
      homepageBanners: validBanners,
      displayCategories: categories
    });
  } catch (error) {
    console.error("Error fetching products/banners/categories for home page:", error);
    next(error);
  }
};