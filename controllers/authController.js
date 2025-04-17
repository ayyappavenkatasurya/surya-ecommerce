// controllers/authController.js
const User = require('../models/User');
const Product = require('../models/Product'); // Needed for getHomePage
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { generateOTP, setOTPExpiration } = require('../services/otpService');
const { sendEmail } = require('../config/mailer');

// --- Page Rendering Functions ---

exports.getLoginPage = (req, res) => {
    // Redirect logged-in users away from login page
    if (req.session.user) {
         return res.redirect('/');
    }
    res.render('auth/login', { title: 'Login' });
};

exports.getRegisterPage = (req, res) => {
    // Redirect logged-in users away from register page
    if (req.session.user) {
        return res.redirect('/');
   }
    res.render('auth/register', { title: 'Register' });
};

exports.getVerifyOtpPage = (req, res) => {
    const email = req.query.email;
    // Require email in query params for OTP page
    if (!email) {
        req.flash('error_msg', 'Email required for OTP verification.');
        return res.redirect('/auth/register'); // Or login? Register makes sense if coming from there.
    }
    // Redirect logged-in users away
     if (req.session.user) {
        return res.redirect('/');
   }
    res.render('auth/verify-otp', {
        title: req.query.reason === 'reset' ? 'Verify Password Reset OTP' : 'Verify Email',
        email: email,
        reason: req.query.reason // Pass reason for potential UI changes
    });
};

exports.getForgotPasswordPage = (req, res) => {
    // Redirect logged-in users away
     if (req.session.user) {
         return res.redirect('/');
    }
    res.render('auth/forgot-password', { title: 'Forgot Password' });
};

exports.getResetPasswordPage = async (req, res, next) => {
    try {
        // Find user by valid reset token
        const user = await User.findOne({
            resetPasswordToken: req.params.token,
            resetPasswordExpires: { $gt: Date.now() }, // Ensure token is not expired
        });

        // If token invalid or expired
        if (!user) {
            req.flash('error_msg', 'Password reset token is invalid or has expired.');
            return res.redirect('/auth/forgot-password');
        }
        // Render the reset password form, passing the token
        res.render('auth/reset-password', { title: 'Reset Password', token: req.params.token });
    } catch (error) {
        next(error); // Pass errors to handler
    }
};

// --- Authentication Logic Functions ---

exports.registerUser = async (req, res, next) => {
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
    // Basic email format check
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
        errors.push('Please enter a valid email address.');
    }

    if (errors.length > 0) {
        req.flash('error_msg', errors.join(' '));
        // Re-render form with errors and submitted values (except passwords)
        return res.render('auth/register', {
            title: 'Register',
            name: name,
            email: email,
            // error_msg is handled by res.locals
        });
    }
    // --- End Validation ---

    try {
        const lowerCaseEmail = email.toLowerCase();
        let user = await User.findOne({ email: lowerCaseEmail });

        // If user exists and is already verified, redirect to login
        if (user && user.isVerified) {
            req.flash('error_msg', 'Email is already registered and verified. Please login.');
            return res.redirect('/auth/login');
        }

        // Generate OTP and expiry
        const otp = generateOTP();
        const otpExpires = setOTPExpiration(10); // 10 minutes validity

        if (user && !user.isVerified) {
            // Update existing unverified user (e.g., if they abandoned previous registration)
            user.name = name;
            // Only update password if provided during this registration attempt
            if (password) { user.password = password; } // Hashing handled by pre-save hook
            user.otp = otp;
            user.otpExpires = otpExpires;
            user.isVerified = false; // Ensure it remains false until OTP verification
            // Avoid validating unchanged fields if only updating OTP/password
            await user.save({ validateBeforeSave: false });
        } else {
            // Create a new user instance
            user = new User({
                name,
                email: lowerCaseEmail,
                password, // Hashing handled by pre-save hook
                otp,
                otpExpires,
                isVerified: false, // Starts unverified
                role: 'user' // Default role
            });
            await user.save(); // Save the new user
        }

        // --- Send OTP Email ---
        const subject = 'Verify Your Email Address';
        const text = `Your verification OTP is: ${otp}\nIt will expire in 10 minutes.`;
        const html = `<p>Welcome to our store!</p><p>Your verification OTP is: <strong>${otp}</strong></p><p>It will expire in 10 minutes.</p>`;

        const emailSent = await sendEmail(user.email, subject, text, html);

        if (emailSent) {
            req.flash('success_msg', `An OTP has been sent to ${user.email}. Please check your inbox and verify.`);
            // Redirect to OTP verification page
            res.redirect(`/auth/verify-otp?email=${encodeURIComponent(user.email)}`);
        } else {
             // If email sending failed immediately after creation, attempt cleanup
             if(!user.createdAt || (Date.now() - user.createdAt.getTime()) < 5000) { // Check if created within last 5 seconds
                try {
                    // Only delete if still unverified
                    await User.deleteOne({ _id: user._id, isVerified: false });
                    console.log(`Cleaned up unverified user ${user.email} due to failed initial email send.`);
                } catch (deleteError) {
                    console.error(`Error cleaning up user ${user.email}:`, deleteError);
                }
             }
            req.flash('error_msg', 'Could not send OTP email. Please try registering again or contact support.');
            res.redirect('/auth/register');
        }
        // --- End Send OTP Email ---

    } catch (error) {
        // Handle specific database errors
        if (error.code === 11000) { // Duplicate key error (likely email)
            req.flash('error_msg', 'Email already exists. Please login or use a different email.');
            return res.render('auth/register', { title: 'Register', name: name, email: email });
        }
        if (error.name === 'ValidationError') { // Mongoose validation errors
           let validationErrors = Object.values(error.errors).map(el => el.message);
            req.flash('error_msg', validationErrors.join(' '));
            return res.render('auth/register', { title: 'Register', name: name, email: email });
       }
        // Pass other unexpected errors to the central error handler
        next(error);
    }
};

exports.verifyOtp = async (req, res, next) => {
    const { email, otp } = req.body;
    const reason = req.query.reason; // Check if 'reset'

    if (!email || !otp) {
        req.flash('error_msg', 'Email and OTP are required.');
         return res.redirect(`/auth/verify-otp?email=${encodeURIComponent(email || '')}${reason ? '&reason='+reason : ''}`);
    }

    try {
        const lowerCaseEmail = email.toLowerCase();
        // Find user matching email, OTP, and ensure OTP is not expired
        const user = await User.findOne({
            email: lowerCaseEmail,
            otp: otp.trim(),
            otpExpires: { $gt: Date.now() },
        }).select('+password +resetPasswordToken +resetPasswordExpires'); // Select fields needed for logic

        if (!user) {
            // Provide more specific error messages based on user state
            const existingUser = await User.findOne({ email: lowerCaseEmail });
            if (existingUser && !existingUser.isVerified && existingUser.otpExpires <= Date.now()) {
                 req.flash('error_msg', 'Expired OTP. Please request a new one.');
            } else if (existingUser && !existingUser.isVerified) {
                 req.flash('error_msg', 'Invalid OTP. Please check the code and try again.');
            } else if (existingUser && existingUser.isVerified && reason !== 'reset') { // Already verified, not for reset
                 req.flash('error_msg', 'This account is already verified. Please login.');
                 return res.redirect('/auth/login');
            } else if (!existingUser) {
                 req.flash('error_msg', 'Verification failed. User not found.');
                 return res.redirect('/auth/register');
            } else {
                 // Generic fallback (e.g., verified user trying reset OTP page without valid token)
                  req.flash('error_msg', 'Invalid or expired OTP.');
            }
            return res.redirect(`/auth/verify-otp?email=${encodeURIComponent(email)}${reason ? '&reason='+reason : ''}`);
        }

        // --- OTP is valid ---

         // Check if this verification is part of a password reset flow
         const isPasswordReset = reason === 'reset' && user.resetPasswordToken && user.resetPasswordExpires && user.resetPasswordExpires > Date.now();

         // Update user state: mark verified, clear OTP
         user.isVerified = true;
         user.otp = undefined;
         user.otpExpires = undefined;

         if(isPasswordReset){
             // If password reset: Save state, redirect to password setting form.
             // Don't clear the reset token yet.
             await user.save({ validateBeforeSave: false });

             req.flash('success_msg', 'OTP Verified. Please set your new password.');
             res.redirect(`/auth/reset-password/${user.resetPasswordToken}`);
         } else {
             // If registration verification: Save state and log user in.
            await user.save();

             // Regenerate session for security
             req.session.regenerate(err => {
                if (err) {
                     console.error("Session regeneration error after OTP verify:", err);
                     req.flash('error_msg', 'Verification successful, but auto-login failed. Please login manually.');
                     return res.redirect('/auth/login');
                 }

                // Store user data in session
                req.session.user = {
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    address: user.address,
                    cart: user.cart ? user.cart.map(item => ({ productId: item.productId, quantity: item.quantity })) : [] // Store lean cart
                 };

                // Save session before redirecting
                req.session.save(err => {
                   if (err) {
                        console.error("Session save error after OTP verify login:", err);
                        req.flash('error_msg', 'Verification successful, but auto-login failed. Please login manually.');
                        return res.redirect('/auth/login');
                    }
                    // Redirect after successful login
                    req.flash('success_msg', 'Email verified successfully! You are now logged in.');
                    const returnTo = req.session.returnTo || '/'; // Redirect to intended page or home
                    delete req.session.returnTo;
                    res.redirect(returnTo);
                 });
             });
         }

    } catch (error) {
        next(error); // Pass errors to handler
    }
};

exports.resendOtp = async (req, res, next) => {
    const { email } = req.body;
    const reason = req.query.reason; // Check if 'reset'

    if (!email) {
        req.flash('error_msg', 'Email is required to resend OTP.');
         return res.redirect(`/auth/verify-otp?email=${encodeURIComponent(req.query.email || '')}${reason ? '&reason='+reason : ''}`);
    }

    try {
        const lowerCaseEmail = email.toLowerCase();
        // Find user by email
        const user = await User.findOne({ email: lowerCaseEmail }).select('+resetPasswordToken +resetPasswordExpires +isVerified');

        if (!user) {
            // Security: Don't reveal if email exists. Send generic message.
            req.flash('error_msg', 'If your email is registered, a new OTP will be sent. Please check your inbox.');
             return res.redirect(`/auth/verify-otp?email=${encodeURIComponent(email)}${reason ? '&reason='+reason : ''}`);
        }

        // Determine context: reset or verification
         const isForReset = reason === 'reset' || (user.resetPasswordToken && user.resetPasswordExpires && user.resetPasswordExpires > Date.now());

        // Prevent resend if already verified and not for password reset
        if(user.isVerified && !isForReset) {
             req.flash('error_msg', 'This account is already verified. Please login.');
            return res.redirect('/auth/login');
        }

        // Generate new OTP and expiry
        const otp = generateOTP();
        const otpExpires = setOTPExpiration(10); // 10 minutes

        user.otp = otp;
        user.otpExpires = otpExpires;
        // Don't modify reset tokens here, only OTP fields
        await user.save();

        // Prepare email content based on context
        let subject, text, html;
        if (isForReset) {
            subject = 'Your New Password Reset OTP';
             text = `Your new password reset OTP is: ${otp}\nIt will expire in 10 minutes.\nIf you did not request this, please ignore this email.`;
            html = `<p>Your new password reset OTP is: <strong>${otp}</strong></p><p>It will expire in 10 minutes.</p><p>If you did not request this, please ignore this email.</p>`;
        } else { // For initial verification
             subject = 'Your New Verification OTP';
             text = `Your new verification OTP is: ${otp}\nIt will expire in 10 minutes.`;
            html = `<p>Your new verification OTP is: <strong>${otp}</strong></p><p>It will expire in 10 minutes.</p>`;
        }

        // Send the new OTP email
        const emailSent = await sendEmail(user.email, subject, text, html);

        // Redirect back to the verify OTP page
        const redirectUrl = `/auth/verify-otp?email=${encodeURIComponent(user.email)}${isForReset ? '&reason=reset' : ''}`;

        if (emailSent) {
            req.flash('success_msg', `A new OTP has been sent to ${user.email}. Please check your inbox.`);
        } else {
            req.flash('error_msg', 'Could not resend OTP email. Please try again or contact support.');
        }
        res.redirect(redirectUrl);

    } catch (error) {
        next(error); // Pass errors to handler
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
        // Find user and select password for comparison
        const user = await User.findOne({ email: lowerCaseEmail })
                             .select('+password +isVerified +cart +address +role +name'); // Select all needed fields

        if (!user) {
            req.flash('error_msg', 'Invalid credentials. Please check your email and password.');
            return res.render('auth/login', { title: 'Login', email: email });
        }

         // --- Check if user's email is verified ---
         if (!user.isVerified) {
            req.flash('error_msg', 'Your email is not verified. Please check your inbox for the verification OTP or request a new one.');
            return res.redirect(`/auth/verify-otp?email=${encodeURIComponent(user.email)}`);
         }

        // --- Verify password ---
        const isMatch = await user.matchPassword(password);
        if (!isMatch) {
            req.flash('error_msg', 'Invalid credentials. Please check your email and password.');
            return res.render('auth/login', { title: 'Login', email: email });
        }

        // --- Credentials correct, proceed with login ---
         req.session.regenerate(err => { // Regenerate session ID
            if (err) {
                 console.error("Session regeneration error during login:", err);
                 req.flash('error_msg', 'Login failed due to a session error. Please try again.');
                 return res.redirect('/auth/login');
             }

            // Store user info in session
            req.session.user = {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                address: user.address, // Store address object
                cart: user.cart ? user.cart.map(item => ({ productId: item.productId, quantity: item.quantity })) : [] // Store lean cart
            };

             // Save session before redirecting
             req.session.save(err => {
                 if (err) {
                     console.error("Session save error after login:", err);
                     req.flash('error_msg', 'Login failed due to a session save error. Please try again.');
                     return res.redirect('/auth/login');
                 }
                 // Login successful
                 req.flash('success_msg', 'You are now logged in successfully.');
                 const returnTo = req.session.returnTo || '/'; // Redirect to intended page or home
                 delete req.session.returnTo;
                 res.redirect(returnTo);
            });
        });

    } catch (error) {
        next(error); // Pass errors to handler
    }
};

// --- UPDATED Logout Function ---
exports.logoutUser = (req, res, next) => {
    // 1. Set flash message BEFORE destroying (it won't show, but prevents crash)
    req.flash('success_msg', 'You have been logged out successfully.');

    // 2. Destroy the session
    req.session.destroy(err => {
        if (err) {
            console.error('Session destruction error:', err);
            // Avoid flash in error callback, just redirect
            return res.redirect('/'); // Redirect home on error
        }

        // 3. Clear the session cookie
        res.clearCookie(process.env.SESSION_COOKIE_NAME || 'connect.sid');

        // 4. Redirect to login page
        // Note: The flash message set earlier won't be available here.
        // If you NEED a logout message, consider setting it differently,
        // maybe via query parameter, but standard practice is just redirect.
        res.redirect('/auth/login');
    });
};
// --- End UPDATED Logout Function ---

exports.forgotPassword = async (req, res, next) => {
    const { email } = req.body;
    if (!email) {
        req.flash('error_msg', 'Please provide an email address.');
        return res.redirect('/auth/forgot-password');
    }

    try {
        const lowerCaseEmail = email.toLowerCase();
        // Find user, select verification status
        const user = await User.findOne({ email: lowerCaseEmail }).select('+isVerified');

        // Flash generic message regardless of user status
        const genericMessage = 'If an account with that email exists and is verified, a password reset OTP will be sent. Please check your inbox.';
        req.flash('success_msg', genericMessage);

        // Only proceed if user exists AND is verified
        if (!user || !user.isVerified) {
            console.log(`Password reset request for ${lowerCaseEmail}: User ${!user ? 'not found' : 'found but not verified'}. Sending generic response.`);
            return res.redirect('/auth/forgot-password');
        }

         // --- User valid, generate OTP and Reset Token ---
         const otp = generateOTP();
         const resetToken = crypto.randomBytes(20).toString('hex');
        const otpExpires = setOTPExpiration(10); // OTP valid 10 mins
        const resetExpires = setOTPExpiration(60); // Reset process valid 60 mins

        // Save OTP, token, and expiry times
        user.otp = otp;
        user.otpExpires = otpExpires;
        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = resetExpires;
        await user.save();

        // Send OTP email for password reset verification
        const subject = 'Password Reset Request - Verify OTP';
        const text = `You requested a password reset.\n\nPlease use the following OTP to verify your request: ${otp}\n\nThis OTP will expire in 10 minutes.\n\nIf you did not request this, please ignore this email.`;
        const html = `<p>You requested a password reset.</p><p>Please use the following OTP to verify your request: <strong>${otp}</strong></p><p>This OTP will expire in 10 minutes.</p><p>If you did not request this, please ignore this email.</p>`;

         const emailSent = await sendEmail(user.email, subject, text, html);

        if (emailSent) {
             console.log(`Password reset OTP sent to verified user: ${user.email}`);
             // Redirect to OTP verification page, indicating it's for reset
             res.redirect(`/auth/verify-otp?email=${encodeURIComponent(user.email)}&reason=reset`);
        } else {
            // Rollback token/OTP fields if email fails
            user.otp = undefined;
            user.otpExpires = undefined;
            user.resetPasswordToken = undefined;
            user.resetPasswordExpires = undefined;
            await user.save({ validateBeforeSave: false });

            console.error(`Failed to send password reset OTP email to ${user.email}.`);
            // Still redirect after flashing the generic message earlier
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

    // --- Validation ---
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
    // --- End Validation ---

    try {
        // Find user by valid reset token
        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() },
         }).select('+cart +address +role +name +email'); // Select fields needed for login

        if (!user) {
            req.flash('error_msg', 'Password reset token is invalid or has expired. Please request a new reset link.');
            return res.redirect('/auth/forgot-password');
        }

        // --- Token valid, update password and clear reset fields ---
        user.password = password; // Hashing handled by pre-save
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        user.otp = undefined;
        user.otpExpires = undefined;

        await user.save(); // Save the changes

        // --- Log the user in automatically ---
        req.session.regenerate(err => {
             if (err) {
                console.error("Session regeneration error after password reset:", err);
                req.flash('error_msg', 'Password reset successfully, but auto-login failed. Please log in with your new password.');
                return res.redirect('/auth/login');
             }
             // Store user info in session
             req.session.user = {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                address: user.address,
                cart: user.cart ? user.cart.map(item => ({ productId: item.productId, quantity: item.quantity })) : [] // Lean cart
            };
            // Save session before redirecting
            req.session.save(err => {
                if(err) {
                    console.error("Session save error after password reset login:", err);
                    req.flash('error_msg', 'Password reset successfully, but auto-login failed. Please log in with your new password.');
                    return res.redirect('/auth/login');
                 }
                 // Redirect to home page after success
                 req.flash('success_msg', 'Password has been reset successfully. You are now logged in.');
                res.redirect('/');
             });
         });

    } catch (error) {
        // Handle Mongoose validation errors on save
        if (error.name === 'ValidationError') {
           let validationErrors = Object.values(error.errors).map(el => el.message);
            req.flash('error_msg', validationErrors.join(' '));
            return res.redirect(`/auth/reset-password/${token}`);
       }
        next(error); // Pass other errors to handler
    }
};

// --- Home Page Function (Displays Approved Products) ---
exports.getHomePage = async (req, res, next) => {
  try {
    const searchTerm = req.query.search || '';
    // Base query: Only find products with 'Approved' status
    let query = { status: 'Approved' };

    if (searchTerm) {
      const escapedSearchTerm = searchTerm.replace(/[-\[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
      const regex = new RegExp(escapedSearchTerm, 'i');
      // Add search conditions to the base query
      query.$or = [
         { name: regex },
         { category: regex },
         { specifications: regex }
      ];
    }

    // Fetch approved products matching the query
    const products = await Product.find(query)
                                   .sort({ createdAt: -1 }) // Sort newest first
                                   .lean(); // Use lean for rendering performance

    // Render the main product listing view
    res.render('products/index', {
      title: searchTerm ? `Search Results for "${searchTerm}"` : 'Home',
      products: products,
      searchTerm: searchTerm
    });
  } catch (error) {
    console.error("Error fetching products for home page:", error);
    next(error); // Pass error to the handler
  }
};