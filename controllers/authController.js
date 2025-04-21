// controllers/authController.js
const User = require('../models/User');
const Product = require('../models/Product');
const BannerConfig = require('../models/BannerConfig');
const Category = require('../models/Category'); // *** IMPORT Category Model ***
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { generateOTP, setOTPExpiration } = require('../services/otpService');
const { sendEmail } = require('../config/mailer');

// --- Helper function for escaping Regex characters ---
function escapeRegex(string) {
  return string.replace(/[-\[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

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
    res.render('auth/register', { title: 'Register' });
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
     if (req.session.user) { // Should logged-in users be able to reset password this way? Redirect.
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

// --- registerUser, verifyOtp, resendOtp, loginUser ---
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
            // Update existing unverified user
            user.name = name;
            // Only update password if provided, respecting previous state otherwise
            if (password) { user.password = password; }
            user.otp = otp;
            user.otpExpires = otpExpires;
            user.isVerified = false;
            await user.save({ validateBeforeSave: false }); // Save without re-validating password if not changed
            console.log(`Updating existing unverified user: ${user.email}`);
        } else {
            // Create new user
            user = new User({
                name,
                email: lowerCaseEmail,
                password,
                otp,
                otpExpires,
                isVerified: false, // Starts as unverified
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
            // Attempt cleanup only for very recently created users where email failed immediately
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
        if (error.code === 11000) { // Duplicate email error
            req.flash('error_msg', 'Email already exists. Please login or use a different email.');
            return res.render('auth/register', { title: 'Register', name: name, email: email });
        }
        if (error.name === 'ValidationError') {
           let validationErrors = Object.values(error.errors).map(el => el.message);
            req.flash('error_msg', validationErrors.join(' '));
            return res.render('auth/register', { title: 'Register', name: name, email: email });
       }
        // Pass other errors to the main error handler
        next(error);
    }
};

exports.verifyOtp = async (req, res, next) => {
    const { email, otp } = req.body;

     if (req.session.user) { // Already logged in
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
        }).select('+password'); // Need password if logging in immediately after verification

        if (!user) {
            const existingUser = await User.findOne({ email: lowerCaseEmail });
            let errorMessage = 'Invalid or expired OTP. Please try again or resend.';

            // Handle specific cases
            if (existingUser && existingUser.isVerified) {
                 errorMessage = 'This account is already verified. Please login.';
                 req.flash('error_msg', errorMessage);
                 return res.redirect('/auth/login');
            } else if (!existingUser) {
                 // This case might indicate a registration issue or typo
                 errorMessage = 'Verification failed. Account not found. Please register again.';
                 req.flash('error_msg', errorMessage);
                 return res.redirect('/auth/register');
            }
             // Default: OTP incorrect/expired for an unverified account
             req.flash('error_msg', errorMessage);
            return res.redirect(`/auth/verify-otp?email=${encodeURIComponent(email)}`);
        }

         // Check if this OTP verification is part of password reset flow
         const isPasswordReset = user.resetPasswordToken && user.resetPasswordExpires && user.resetPasswordExpires > Date.now();

         // Mark user as verified (always do this on successful OTP match)
         user.isVerified = true;
         user.otp = undefined;
         user.otpExpires = undefined;

         if (isPasswordReset) {
             // Don't clear reset tokens yet, redirect to password setting page
             await user.save({ validateBeforeSave: false }); // Save without full validation
             req.flash('success_msg', 'OTP Verified. Please set your new password.');
             return res.redirect(`/auth/reset-password/${user.resetPasswordToken}`);
         }
         else {
             // Normal email verification: clear reset tokens if they exist, save, log in
            user.resetPasswordToken = undefined; // Clear any potentially stale reset tokens
            user.resetPasswordExpires = undefined;
            await user.save({ validateBeforeSave: false });

             // --- Auto-Login Logic ---
             req.session.regenerate(err => { // Regenerate session for security
                if (err) {
                     console.error("Session regeneration error after OTP verify:", err);
                     // Still verified, but login failed.
                     req.flash('error_msg', 'Verification successful, but auto-login failed. Please login manually.');
                     return res.redirect('/auth/login');
                 }

                 // Store necessary user info in session
                 req.session.user = {
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    // Convert mongoose subdoc to plain JS object if exists
                    address: user.address ? user.address.toObject() : undefined,
                    // Map cart items to basic info, handle missing productId gracefully
                     cart: user.cart ? user.cart.map(item => ({
                        productId: item.productId?._id, // Use optional chaining
                        quantity: item.quantity
                    })) : []
                 };

                // Ensure session is saved before redirecting
                 req.session.save(err => {
                   if (err) {
                        console.error("Session save error after OTP verify login:", err);
                         req.flash('error_msg', 'Verification successful, but auto-login failed. Please login manually.');
                        return res.redirect('/auth/login');
                    }
                    req.flash('success_msg', 'Email verified successfully! You are now logged in.');
                    const returnTo = req.session.returnTo || '/'; // Handle redirect after login
                    delete req.session.returnTo;
                    res.redirect(returnTo);
                 });
             });
             // --- End Auto-Login Logic ---
         }

    } catch (error) {
        next(error);
    }
};

exports.resendOtp = async (req, res, next) => {
    const { email } = req.body;

     if (req.session.user) { // Already logged in
        return res.redirect('/');
    }

    if (!email) {
        req.flash('error_msg', 'Email is required to resend OTP.');
        // Attempt to preserve email in query string if available
         return res.redirect(`/auth/verify-otp?email=${encodeURIComponent(req.query.email || '')}`);
    }

    try {
        const lowerCaseEmail = email.toLowerCase();
        const user = await User.findOne({ email: lowerCaseEmail });

        if (!user) {
            // Don't reveal if email exists or not, generic message
            console.log(`Resend OTP attempt for non-existent email: ${lowerCaseEmail}`);
            req.flash('info_msg', 'If your email is registered, a new OTP will be sent. Please check your inbox.');
            return res.redirect(`/auth/verify-otp?email=${encodeURIComponent(email)}`);
        }

        // Determine if OTP is for password reset or email verification
        const isForReset = user.resetPasswordToken && user.resetPasswordExpires && user.resetPasswordExpires > Date.now();

        // Prevent resending for already verified accounts (unless it's for password reset)
        if(user.isVerified && !isForReset) {
             req.flash('error_msg', 'This account is already verified. Please login.');
            return res.redirect('/auth/login');
        }

        const otp = generateOTP();
        const otpExpires = setOTPExpiration(10);

        // Update OTP and expiry on the user document
        user.otp = otp;
        user.otpExpires = otpExpires;
        await user.save({ validateBeforeSave: false }); // Save without full validation

        let subject, text, html;
        // Customize email content based on purpose
        if (isForReset) {
            subject = 'Your New Password Reset OTP';
             text = `Your new password reset OTP is: ${otp}\nIt will expire in 10 minutes.\nIf you did not request this, please ignore this email.`;
            html = `<p>Your new password reset OTP is: <strong>${otp}</strong></p><p>It will expire in 10 minutes.</p><p>If you did not request this, please ignore this email.</p>`;
        } else {
             subject = 'Your New Verification OTP';
             text = `Your new verification OTP is: ${otp}\nIt will expire in 10 minutes.`;
            html = `<p>Your new verification OTP is: <strong>${otp}</strong></p><p>It will expire in 10 minutes.</p>`;
        }

        // Send the new OTP email
        const emailSent = await sendEmail(user.email, subject, text, html);

        // Redirect back to OTP verification page, indicating reason if it's for reset
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
     if (req.session.user) { // Already logged in
        return res.redirect('/');
    }
    const { email, password } = req.body;

    if (!email || !password) {
        req.flash('error_msg', 'Please provide both email and password.');
        return res.render('auth/login', { title: 'Login', email: email });
    }

    try {
        const lowerCaseEmail = email.toLowerCase();
        // Find user and explicitly select password, populate cart details needed for session
        const user = await User.findOne({ email: lowerCaseEmail })
                             .select('+password') // Include password for comparison
                              .populate('cart.productId', 'name price imageUrl stock reviewStatus sellerId'); // Populate required product details from cart


        if (!user) {
            // User not found
            req.flash('error_msg', 'Invalid credentials. Please check your email and password.');
            return res.render('auth/login', { title: 'Login', email: email });
        }

        // Check if email is verified
         if (!user.isVerified) {
            req.flash('error_msg', 'Your email is not verified. Please check your inbox for the verification OTP or request a new one.');
            return res.redirect(`/auth/verify-otp?email=${encodeURIComponent(user.email)}`);
         }

        // Compare password using the method on the user model
        const isMatch = await user.matchPassword(password);

        if (!isMatch) {
            // Password does not match
            req.flash('error_msg', 'Invalid credentials. Please check your email and password.');
            return res.render('auth/login', { title: 'Login', email: email });
        }

         // --- Successful Login: Set up session ---
         req.session.regenerate(err => {
            if (err) {
                 console.error("Session regeneration error during login:", err);
                 req.flash('error_msg', 'Login failed due to a session error. Please try again.');
                 return res.render('auth/login', { title: 'Login', email: email });
             }

             // Store relevant user data in the session
             req.session.user = {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                 address: user.address ? user.address.toObject() : undefined,
                 // Process cart: filter out invalid/removed products before storing in session
                  cart: user.cart ? user.cart.filter(item => item.productId && item.productId._id) // Ensure product exists
                                          .map(item => ({
                                                productId: item.productId._id,
                                                quantity: item.quantity
                                             })) : []
             };

            // Save the session before redirecting
             req.session.save(err => {
                 if (err) {
                     console.error("Session save error after login:", err);
                     req.flash('error_msg', 'Login successful, but session could not be saved. Please try again.');
                      return res.render('auth/login', { title: 'Login', email: email });
                 }
                 req.flash('success_msg', 'You are now logged in successfully.');
                 const returnTo = req.session.returnTo || '/'; // Handle redirect URL
                 delete req.session.returnTo;
                 res.redirect(returnTo);
            });
        });
         // --- End Session Setup ---

    } catch (error) {
        next(error);
    }
};


exports.logoutUser = (req, res, next) => {
    req.flash('success_msg', 'You have been logged out successfully.');
    // Destroy the session
    req.session.destroy(err => {
        if (err) {
            // Log error but proceed with logout flow
            console.error('Session destruction error:', err);
             req.flash('error_msg', 'Error during logout. Please try again.'); // Inform user
             // Redirect even on error to complete logout flow
            return res.redirect('/auth/login');
        }
        // Clear the session cookie
        res.clearCookie(req.app.get('session cookie name') || 'connect.sid'); // Use configured name or default
        // Redirect to login page
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

        // Always show generic message regardless of user existence or status for security
        const genericMessage = 'If an account with that email exists and is verified, a password reset OTP will be sent. Please check your inbox.';
        req.flash('info_msg', genericMessage);

        // Only proceed if user exists AND is verified
        if (!user || !user.isVerified) {
            console.log(`Password reset request for ${lowerCaseEmail}: User ${!user ? 'not found' : 'found but not verified'}. Sending generic response.`);
            return res.redirect('/auth/forgot-password'); // Redirect immediately after flashing message
        }

        // Generate OTP and reset token (reset token used to link OTP verification to password setting)
        const otp = generateOTP();
        const resetToken = crypto.randomBytes(20).toString('hex');
        const otpExpires = setOTPExpiration(10); // OTP valid for 10 mins
        const resetExpires = setOTPExpiration(60); // Link/token valid for 60 mins (allows time to receive/enter OTP and set new password)

        // Save tokens and expiry dates to the user document
        user.otp = otp;
        user.otpExpires = otpExpires;
        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = resetExpires;
        await user.save({ validateBeforeSave: false }); // Save without validation

        // Send email with OTP
        const subject = 'Password Reset Request - Verify OTP';
        const text = `You requested a password reset.\n\nPlease use the following OTP to verify your request: ${otp}\n\nThis OTP will expire in 10 minutes.\n\nIf you did not request this, please ignore this email.`;
        const html = `<p>You requested a password reset.</p><p>Please use the following OTP to verify your request: <strong>${otp}</strong></p><p>This OTP will expire in 10 minutes.</p><p>If you did not request this, please ignore this email.</p>`;

         const emailSent = await sendEmail(user.email, subject, text, html);

        // Redirect to OTP verification page, passing email and reason=reset
        if (emailSent) {
             console.log(`Password reset OTP sent to verified user: ${user.email}`);
             // Don't redirect immediately after flashing if sending email fails
        } else {
            console.error(`Failed to send password reset OTP email to ${user.email}`);
             // Keep the generic info message, maybe add error? No, stick to generic.
             return res.redirect('/auth/forgot-password'); // Redirect after email failure
         }

         // Redirect AFTER successful email send and flash message set
         res.redirect(`/auth/verify-otp?email=${encodeURIComponent(user.email)}&reason=reset`);

    } catch (error) {
        console.error("Error in forgotPassword:", error);
        req.flash('error_msg', 'An error occurred while processing your request. Please try again later.');
        res.redirect('/auth/forgot-password');
    }
};

exports.resetPassword = async (req, res, next) => {
    const { password, confirmPassword } = req.body;
    const token = req.params.token; // The token from the URL, linking back to forgotPassword request

    // --- Input Validation ---
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
         // Redirect back to the same reset password page
         return res.redirect(`/auth/reset-password/${token}`);
    }
    // --- End Validation ---

    try {
        // Find the user using the reset token and ensure it hasn't expired
        // Also, ensure OTP was verified (implied by reaching this route, but user.otp check could be added)
        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() },
             // isVerified should be true if they completed OTP step
             // otp: undefined // Ensure OTP was cleared after verification
         }).select('+password'); // Need password field to update it

        if (!user) {
            req.flash('error_msg', 'Password reset token is invalid or has expired. Please request a new reset link.');
            return res.redirect('/auth/forgot-password');
        }

        // Update password and clear all reset/OTP related fields
        user.password = password; // Pre-save hook will hash it
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        user.otp = undefined; // Ensure OTP is cleared
        user.otpExpires = undefined;
        user.isVerified = true; // Ensure account is marked verified

        await user.save(); // Save the user with the new password

        // --- Auto-Login after successful password reset ---
        req.session.regenerate(err => {
             if (err) {
                console.error("Session regeneration error after password reset:", err);
                // Even if session fails, password reset was successful
                req.flash('success_msg', 'Password reset successful. Please log in with your new password.');
                return res.redirect('/auth/login');
             }
              // Store necessary user info in session
              req.session.user = {
                  _id: user._id, name: user.name, email: user.email, role: user.role,
                  address: user.address ? user.address.toObject() : undefined,
                   cart: user.cart ? user.cart.filter(item => item.productId) // Basic cart structure
                                          .map(item => ({ productId: item.productId, quantity: item.quantity })) : []
              };

             // Save session before redirect
             req.session.save(err => {
                 if(err) {
                    console.error("Session save error after password reset login:", err);
                     // Password reset success, but auto-login failed
                     req.flash('success_msg', 'Password reset successful. Please log in with your new password.');
                    return res.redirect('/auth/login');
                 }
                  // Auto-login and redirect successful
                 req.flash('success_msg', 'Password has been reset successfully. You are now logged in.');
                res.redirect('/'); // Redirect to homepage or dashboard
             });
         });
         // --- End Auto-Login ---

    } catch (error) {
        if (error.name === 'ValidationError') {
            // Handle Mongoose validation errors (e.g., if password has model constraints)
           let validationErrors = Object.values(error.errors).map(el => el.message);
            req.flash('error_msg', validationErrors.join(' '));
            return res.redirect(`/auth/reset-password/${token}`);
       }
        // Pass other errors to the main error handler
        next(error);
    }
};


// --- UPDATED getHomePage (includes category handling) ---
exports.getHomePage = async (req, res, next) => {
  try {
    const searchTerm = req.query.search || '';
    const categoryFilterName = req.query.categoryName || ''; // Get category filter from query

    let query = {
        reviewStatus: 'approved',
        stock: { $gt: 0 }
    };
    let sort = { createdAt: -1 }; // Default: newest first

    // Filter by Category if provided
    if (categoryFilterName) {
        // Use the denormalized categoryName for filtering
        query.categoryName = categoryFilterName;
        console.log(`Homepage/Products Filtered by Category: ${categoryFilterName}`);
    }

    // Apply Search Term (Sequential Match)
    if (searchTerm) {
      const escapedSearchTerm = escapeRegex(searchTerm);
      const regex = new RegExp(escapedSearchTerm, 'i');
      // Search name, categoryName, and description
      query.$or = [
        { name: regex },
        { categoryName: regex }, // Search by category name
        { description: regex }
        // { specifications: regex } // Add if needed
      ];
      // Decide if search overrides category: current query combines them.
      console.log(`Homepage Regex Search Query: ${JSON.stringify(query)}`);
    }

    // Fetch Products, Banners, and Categories concurrently
    const [products, bannerConfig, categories] = await Promise.all([
        Product.find(query)
               .sort(sort)
               .lean(),
        BannerConfig.findOne({ configKey: 'mainBanners' }).lean(), // Fetch banners config
        Category.find().sort('name').lean() // Fetch all categories, sorted by name
    ]);

    const banners = bannerConfig?.banners || [];
    const validBanners = banners.filter(banner => banner.imageUrl); // Filter out banners without images


    res.render('products/index', { // Render the main product listing view
      title: categoryFilterName
          ? `Products in ${categoryFilterName}` // Title when category is filtered
          : (searchTerm ? `Search Results for "${searchTerm}"` : 'Home'), // Titles for search/home
      products: products,
      searchTerm: searchTerm, // Pass search term back to view
      homepageBanners: validBanners, // Pass valid banners
      homepageCategories: categories, // *** Pass fetched categories to the view ***
      selectedCategoryName: categoryFilterName // Pass the filtered category name for highlighting etc.
    });
  } catch (error) {
    console.error("Error fetching data for home page:", error);
    next(error);
  }
};