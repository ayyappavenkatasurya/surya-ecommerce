// controllers/authController.js
const User = require('../models/User');
const Product = require('../models/Product'); // Keep for getHomePage
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { generateOTP, setOTPExpiration } = require('../services/otpService');
const { sendEmail } = require('../config/mailer');

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
    // Basic email format check (consider using a library for more robust validation)
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
        errors.push('Please enter a valid email address.');
    }

    if (errors.length > 0) {
        req.flash('error_msg', errors.join(' '));
        // Render the form again with entered values (except passwords)
        return res.render('auth/register', {
            title: 'Register',
            name: name,
            email: email, // Pass back email and name
            error_msg: req.flash('error_msg') // Ensure message is passed to view context
        });
    }

    // --- Registration Logic ---
    try {
        const lowerCaseEmail = email.toLowerCase();
        let user = await User.findOne({ email: lowerCaseEmail });

        // Handle existing users (verified or not)
        if (user && user.isVerified) {
            req.flash('error_msg', 'Email is already registered and verified. Please login.');
            return res.redirect('/auth/login');
        }

        // Generate OTP and Expiration
        const otp = generateOTP();
        const otpExpires = setOTPExpiration(10); // 10 minutes expiry

        // Update unverified existing user or create new one
        if (user && !user.isVerified) {
            // Update existing unverified user record
            user.name = name;
            if (password) { user.password = password; } // Hash happens on save via pre-hook
            user.otp = otp;
            user.otpExpires = otpExpires;
            user.isVerified = false; // Ensure it's false
            // Skip validation if just updating OTP fields on existing unverified doc
            await user.save({ validateBeforeSave: false });
            console.log(`Updating existing unverified user: ${user.email}`);
        } else {
            // Create a new user instance
            user = new User({
                name,
                email: lowerCaseEmail,
                password, // Hash happens on save via pre-hook
                otp,
                otpExpires,
                isVerified: false,
                // Role defaults to 'user' as defined in schema
            });
            await user.save(); // This will trigger pre-save hooks (password hashing)
            console.log(`New user created: ${user.email}`);
        }

        // --- Send Verification Email ---
        const subject = 'Verify Your Email Address';
        const text = `Your verification OTP is: ${otp}\nIt will expire in 10 minutes.`;
        const html = `<p>Welcome to our store!</p><p>Your verification OTP is: <strong>${otp}</strong></p><p>It will expire in 10 minutes.</p>`;

        const emailSent = await sendEmail(user.email, subject, text, html);

        if (emailSent) {
            req.flash('success_msg', `An OTP has been sent to ${user.email}. Please check your inbox and verify.`);
            // Redirect to OTP verification page with email pre-filled
            res.redirect(`/auth/verify-otp?email=${encodeURIComponent(user.email)}`);
        } else {
             // If email fails, consider cleanup for newly created, unverified users to prevent orphans
             if(!user.createdAt || (Date.now() - user.createdAt.getTime()) < 5000) { // Basic check for very new user
                try {
                    // Only delete if not verified AND potentially newly created
                    await User.deleteOne({ _id: user._id, isVerified: false });
                    console.log(`Cleaned up unverified user ${user.email} due to failed email send.`);
                } catch (deleteError) {
                    console.error(`Error cleaning up unverified user ${user.email}:`, deleteError);
                }
             }
            req.flash('error_msg', 'Could not send OTP email. Please try registering again or contact support.');
            // Redirect back to registration page
            res.redirect('/auth/register');
        }

    } catch (error) {
        // Handle potential database errors
        if (error.code === 11000) { // Duplicate key error (email)
            req.flash('error_msg', 'Email already exists. Please login or use a different email.');
            // Render form again with entered values
            return res.render('auth/register', { title: 'Register', name: name, email: email });
        }
        if (error.name === 'ValidationError') { // Mongoose validation errors
           let validationErrors = Object.values(error.errors).map(el => el.message);
            req.flash('error_msg', validationErrors.join(' '));
            // Render form again with entered values
            return res.render('auth/register', { title: 'Register', name: name, email: email });
       }
        // For other errors, pass to the central error handler
        next(error);
    }
};

exports.verifyOtp = async (req, res, next) => {
    const { email, otp } = req.body;

     // Redirect logged-in users
     if (req.session.user) {
        return res.redirect('/');
    }

    if (!email || !otp) {
        req.flash('error_msg', 'Email and OTP are required.');
         // Redirect back to verify page, keeping email in query param if possible
         return res.redirect(`/auth/verify-otp?email=${encodeURIComponent(email || '')}`);
    }

    try {
        const lowerCaseEmail = email.toLowerCase();
        // Find user matching email, OTP, and non-expired OTP
        const user = await User.findOne({
            email: lowerCaseEmail,
            otp: otp.trim(), // Trim OTP input
            otpExpires: { $gt: Date.now() }, // Check expiry
        }).select('+password'); // Include password for potential immediate login

        // --- Handle User Not Found or Invalid OTP ---
        if (!user) {
            const existingUser = await User.findOne({ email: lowerCaseEmail });
            let errorMessage = 'Invalid or expired OTP. Please try again or resend.'; // Default message

            if (existingUser && existingUser.isVerified) {
                 errorMessage = 'This account is already verified. Please login.';
                 req.flash('error_msg', errorMessage);
                 return res.redirect('/auth/login');
            } else if (!existingUser) {
                 // If user doesn't exist at all (perhaps deleted during retry?)
                 errorMessage = 'Verification failed. Account not found. Please register again.';
                 req.flash('error_msg', errorMessage);
                 return res.redirect('/auth/register');
            }
            // If user exists but OTP is wrong/expired
             req.flash('error_msg', errorMessage);
            return res.redirect(`/auth/verify-otp?email=${encodeURIComponent(email)}`); // Keep email in query
        }

        // --- Handle Successful OTP Verification ---

         // Check if this OTP verification is part of a password reset flow
         const isPasswordReset = user.resetPasswordToken && user.resetPasswordExpires && user.resetPasswordExpires > Date.now();

         // Update user status
         user.isVerified = true;
         user.otp = undefined; // Clear OTP fields
         user.otpExpires = undefined;

         // --- Password Reset Flow ---
         if (isPasswordReset) {
             // Save user without validating (password not being changed here)
             await user.save({ validateBeforeSave: false });

             req.flash('success_msg', 'OTP Verified. Please set your new password.');
             // Redirect to the reset password form using the token
             return res.redirect(`/auth/reset-password/${user.resetPasswordToken}`);
         }
         // --- Standard Registration Flow ---
         else {
            // Save updated user (password validation not needed here either)
            await user.save({ validateBeforeSave: false });

            // --- Log the user in automatically ---
             req.session.regenerate(err => { // Regenerate session to prevent fixation
                if (err) {
                     console.error("Session regeneration error after OTP verify:", err);
                     req.flash('error_msg', 'Verification successful, but auto-login failed. Please login manually.');
                     return res.redirect('/auth/login'); // Redirect to login on session error
                 }

                // Populate session with user data (excluding sensitive fields)
                req.session.user = {
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    address: user.address, // Include address if available
                    cart: user.cart || []   // Include cart if available
                 };

                // Save the session before redirecting
                req.session.save(err => {
                   if (err) {
                        console.error("Session save error after OTP verify login:", err);
                         req.flash('error_msg', 'Verification successful, but auto-login failed. Please login manually.');
                        return res.redirect('/auth/login');
                    }
                    // Redirect to intended page or home
                    req.flash('success_msg', 'Email verified successfully! You are now logged in.');
                    const returnTo = req.session.returnTo || '/'; // Use stored return path or default to home
                    delete req.session.returnTo; // Clear stored path
                    res.redirect(returnTo);
                 });
             });
         }

    } catch (error) {
        next(error); // Pass errors to central handler
    }
};

exports.resendOtp = async (req, res, next) => {
    const { email } = req.body;

    // Redirect logged-in users
     if (req.session.user) {
        return res.redirect('/');
    }

    if (!email) {
        req.flash('error_msg', 'Email is required to resend OTP.');
        // Try to redirect back to verify page with email if possible from query
         return res.redirect(`/auth/verify-otp?email=${encodeURIComponent(req.query.email || '')}`);
    }

    try {
        const lowerCaseEmail = email.toLowerCase();
        const user = await User.findOne({ email: lowerCaseEmail });

        // User not found case - send generic message to avoid user enumeration
        if (!user) {
            // Log the attempt for monitoring if needed
            console.log(`Resend OTP attempt for non-existent email: ${lowerCaseEmail}`);
            req.flash('info_msg', 'If your email is registered, a new OTP will be sent. Please check your inbox.'); // Use info message
            return res.redirect(`/auth/verify-otp?email=${encodeURIComponent(email)}`); // Redirect back to OTP page
        }

        // Determine context: Password Reset or Initial Verification
        const isForReset = user.resetPasswordToken && user.resetPasswordExpires && user.resetPasswordExpires > Date.now();

        // Account already verified (and not for password reset)
        if(user.isVerified && !isForReset) {
             req.flash('error_msg', 'This account is already verified. Please login.');
            return res.redirect('/auth/login');
        }

        // Generate new OTP and expiry
        const otp = generateOTP();
        const otpExpires = setOTPExpiration(10); // 10 minutes

        user.otp = otp;
        user.otpExpires = otpExpires;
        // If it's a reset request, maybe don't save immediately if email fails?
        // But for verification, saving first is generally fine.
        await user.save({ validateBeforeSave: false }); // Save new OTP

        // Prepare email content based on context
        let subject, text, html;
        if (isForReset) {
            subject = 'Your New Password Reset OTP';
             text = `Your new password reset OTP is: ${otp}\nIt will expire in 10 minutes.\nIf you did not request this, please ignore this email.`;
            html = `<p>Your new password reset OTP is: <strong>${otp}</strong></p><p>It will expire in 10 minutes.</p><p>If you did not request this, please ignore this email.</p>`;
        } else { // Initial verification
             subject = 'Your New Verification OTP';
             text = `Your new verification OTP is: ${otp}\nIt will expire in 10 minutes.`;
            html = `<p>Your new verification OTP is: <strong>${otp}</strong></p><p>It will expire in 10 minutes.</p>`;
        }

        // Send the email
        const emailSent = await sendEmail(user.email, subject, text, html);

        // Redirect back to the verify OTP page, potentially adding reason query param
        const redirectUrl = `/auth/verify-otp?email=${encodeURIComponent(user.email)}${isForReset ? '&reason=reset' : ''}`;

        if (emailSent) {
            req.flash('success_msg', `A new OTP has been sent to ${user.email}. Please check your inbox.`);
        } else {
            // Consider if OTP should be rolled back if email fails, complex. Let's just inform user.
            console.error(`Failed to resend OTP email to ${user.email}`);
            req.flash('error_msg', 'Could not resend OTP email. Please try again later or contact support.');
        }
        res.redirect(redirectUrl);

    } catch (error) {
        next(error); // Pass errors to central handler
    }
};

exports.loginUser = async (req, res, next) => {
     if (req.session.user) {
        return res.redirect('/'); // Redirect if already logged in
    }
    const { email, password } = req.body;

    if (!email || !password) {
        req.flash('error_msg', 'Please provide both email and password.');
        // Render login page again, passing back email
        return res.render('auth/login', { title: 'Login', email: email });
    }

    try {
        const lowerCaseEmail = email.toLowerCase();
        // Find user by email, include password, and populate cart for session
        const user = await User.findOne({ email: lowerCaseEmail })
                             .select('+password') // Explicitly select password
                             .populate('cart.productId', 'name price imageUrl'); // Populate basic cart details needed for session/badge

        // User not found
        if (!user) {
            req.flash('error_msg', 'Invalid credentials. Please check your email and password.');
            return res.render('auth/login', { title: 'Login', email: email });
        }

        // User found but not verified
         if (!user.isVerified) {
            // Guide user to verify
            req.flash('error_msg', 'Your email is not verified. Please check your inbox for the verification OTP or request a new one.');
            // Redirect to verify page with email pre-filled
            return res.redirect(`/auth/verify-otp?email=${encodeURIComponent(user.email)}`);
         }

        // Check password match
        const isMatch = await user.matchPassword(password);

        if (!isMatch) {
            req.flash('error_msg', 'Invalid credentials. Please check your email and password.');
            return res.render('auth/login', { title: 'Login', email: email });
        }

        // --- Password is Correct - Login User ---
         req.session.regenerate(err => { // Prevent session fixation
            if (err) {
                 console.error("Session regeneration error during login:", err);
                 req.flash('error_msg', 'Login failed due to a session error. Please try again.');
                 return res.render('auth/login', { title: 'Login', email: email });
             }

            // Populate session (exclude password!)
            req.session.user = {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                address: user.address ? user.address.toObject() : undefined, // Store plain address object
                // Store only essential cart info (productId, quantity) in session
                cart: user.cart ? user.cart.map(item => ({
                    productId: item.productId?._id, // Store only ID
                    quantity: item.quantity
                })) : []
             };


            // Save session before redirect
             req.session.save(err => {
                 if (err) {
                     console.error("Session save error after login:", err);
                     req.flash('error_msg', 'Login successful, but session could not be saved. Please try again.');
                      return res.render('auth/login', { title: 'Login', email: email });
                 }
                 req.flash('success_msg', 'You are now logged in successfully.');
                 // Redirect to originally requested URL or home
                 const returnTo = req.session.returnTo || '/';
                 delete req.session.returnTo; // Clean up returnTo
                 res.redirect(returnTo);
            });
        });

    } catch (error) {
        next(error); // Pass to error handler
    }
};


// --- UPDATED logoutUser ---
exports.logoutUser = (req, res, next) => {
    // --- Step 1: Set the flash message BEFORE destroying the session ---
    // This message will persist in the session until the *next* request reads it.
    req.flash('success_msg', 'You have been logged out successfully.');

    // --- Step 2: Destroy the session ---
    req.session.destroy(err => {
        if (err) {
            // Log the error, but don't try to flash another message.
            console.error('Session destruction error:', err);
            // Redirecting to login is still appropriate. The original success_msg
            // might technically survive if destruction failed partially, but that's
            // less harmful than crashing.
            // Consider adding a more specific error log/monitoring here.
             return res.redirect('/auth/login');
        }

        // --- Step 3: Clear the session cookie from the browser ---
        // Use the same name configured in your session middleware ('connect.sid' is common default)
        res.clearCookie(req.app.get('session cookie name') || 'connect.sid'); // Safely get name or use default

        // --- Step 4: Redirect ---
        // The flash message set in Step 1 will be available on this next request (/auth/login).
        res.redirect('/auth/login');
    });
};


// --- forgotPassword, resetPassword, getHomePage (No changes needed from previous version) ---
exports.forgotPassword = async (req, res, next) => {
    const { email } = req.body;
    if (!email) {
        req.flash('error_msg', 'Please provide an email address.');
        return res.redirect('/auth/forgot-password');
    }

    try {
        const lowerCaseEmail = email.toLowerCase();
        // Find user by email
        const user = await User.findOne({ email: lowerCaseEmail });

        // Generic message to prevent user enumeration attacks
        const genericMessage = 'If an account with that email exists and is verified, a password reset OTP will be sent. Please check your inbox.';
        req.flash('info_msg', genericMessage); // Use info or success flash

        // Only proceed if user exists AND is verified
        if (!user || !user.isVerified) {
            console.log(`Password reset request for ${lowerCaseEmail}: User ${!user ? 'not found' : 'found but not verified'}. Sending generic response.`);
            return res.redirect('/auth/forgot-password'); // Redirect back
        }

        // Generate OTP and Reset Token with Expirations
         const otp = generateOTP();
         const resetToken = crypto.randomBytes(20).toString('hex'); // For the actual reset link/form later
        const otpExpires = setOTPExpiration(10); // OTP expires in 10 minutes
        const resetExpires = setOTPExpiration(60); // Reset capability expires in 60 minutes

        // Set fields on user document
        user.otp = otp;
        user.otpExpires = otpExpires;
        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = resetExpires;
        await user.save({ validateBeforeSave: false }); // Save OTP and token info

        // Send OTP email
        const subject = 'Password Reset Request - Verify OTP';
        const text = `You requested a password reset.\n\nPlease use the following OTP to verify your request: ${otp}\n\nThis OTP will expire in 10 minutes.\n\nIf you did not request this, please ignore this email.`;
        const html = `<p>You requested a password reset.</p><p>Please use the following OTP to verify your request: <strong>${otp}</strong></p><p>This OTP will expire in 10 minutes.</p><p>If you did not request this, please ignore this email.</p>`;

         const emailSent = await sendEmail(user.email, subject, text, html);

        // Handle Email Sending Result
        if (emailSent) {
             console.log(`Password reset OTP sent to verified user: ${user.email}`);
             // Redirect to OTP verification page, marking it as reset context
             res.redirect(`/auth/verify-otp?email=${encodeURIComponent(user.email)}&reason=reset`);
        } else {
            // If email failed, consider rolling back the OTP/token? Or just log and rely on expiry?
            // Let's log and rely on expiry for simplicity now. User gets generic message anyway.
            console.error(`Failed to send password reset OTP email to ${user.email}`);
             // User already got the generic message, just redirect back.
            res.redirect('/auth/forgot-password');
        }

    } catch (error) {
        console.error("Error in forgotPassword:", error);
        // Don't reveal specific errors to the user
        req.flash('error_msg', 'An error occurred while processing your request. Please try again later.');
        res.redirect('/auth/forgot-password');
    }
};

exports.resetPassword = async (req, res, next) => {
    const { password, confirmPassword } = req.body;
    const token = req.params.token;

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
         // Redirect back to the same reset form
         return res.redirect(`/auth/reset-password/${token}`);
    }

    // --- Password Reset Logic ---
    try {
        // Find user by token and ensure it's still valid (not expired)
        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() },
         }).select('+password'); // Select password field to update it

        if (!user) {
            req.flash('error_msg', 'Password reset token is invalid or has expired. Please request a new reset link.');
            return res.redirect('/auth/forgot-password'); // Redirect to start the process again
        }

        // Update password and clear reset/OTP fields
        user.password = password; // Pre-save hook will hash it
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        user.otp = undefined; // Also clear OTP fields used for verification step
        user.otpExpires = undefined;
        user.isVerified = true; // Ensure user is marked verified

        await user.save(); // This triggers password hashing

        // --- Log the user in automatically after successful reset ---
        req.session.regenerate(err => {
             if (err) {
                console.error("Session regeneration error after password reset:", err);
                // Inform user password reset worked but login failed
                req.flash('success_msg', 'Password reset successful. Please log in with your new password.');
                return res.redirect('/auth/login');
             }
             // Populate session
              req.session.user = {
                  _id: user._id, name: user.name, email: user.email, role: user.role,
                  address: user.address ? user.address.toObject() : undefined,
                  cart: user.cart ? user.cart.map(item => ({ productId: item.productId, quantity: item.quantity })) : []
              };

            // Save session
            req.session.save(err => {
                if(err) {
                    console.error("Session save error after password reset login:", err);
                     req.flash('success_msg', 'Password reset successful. Please log in with your new password.');
                    return res.redirect('/auth/login');
                 }
                 // Success: Password reset and logged in
                 req.flash('success_msg', 'Password has been reset successfully. You are now logged in.');
                // Redirect to home page
                res.redirect('/');
             });
         });

    } catch (error) {
        // Handle validation errors during save (e.g., if password fails schema rules unexpectedly)
        if (error.name === 'ValidationError') {
           let validationErrors = Object.values(error.errors).map(el => el.message);
            req.flash('error_msg', validationErrors.join(' '));
            return res.redirect(`/auth/reset-password/${token}`); // Redirect back to reset form
       }
        next(error); // Pass other errors to handler
    }
};

exports.getHomePage = async (req, res, next) => {
  try {
    const searchTerm = req.query.search || '';
    let query = {
        reviewStatus: 'approved', // *** Filter by approved status ***
        stock: { $gt: 0 }         // *** Filter by stock > 0 ***
    };

    if (searchTerm) {
         query.$text = { $search: searchTerm }; // Use text index
         // Regex fallback:
         // const escapedSearchTerm = searchTerm.replace(/[-\[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
         // const regex = new RegExp(escapedSearchTerm, 'i');
         // query.$or = [ { name: regex }, { category: regex }, { specifications: regex } ];
    }

     const projection = searchTerm ? { score: { $meta: "textScore" } } : {};
     const sort = searchTerm ? { score: { $meta: "textScore" } } : { createdAt: -1 };

    const products = await Product.find(query, projection)
                                    .sort(sort)
                                    .lean(); // Use lean for read-only

    res.render('products/index', { // Render the standard product listing page
      title: searchTerm ? `Search Results for "${searchTerm}"` : 'Home',
      products: products,
      searchTerm: searchTerm
      // currentUser is available via res.locals
    });
  } catch (error) {
    console.error("Error fetching products for home page:", error);
    next(error);
  }
};