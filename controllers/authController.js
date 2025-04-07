// controllers/authController.js
const User = require('../models/User');
const Product = require('../models/Product');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { generateOTP, setOTPExpiration } = require('../services/otpService');
const { sendEmail } = require('../config/mailer');

// --- Login/Register Page Getters ---
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

// --- OTP Page Getters ---
exports.getVerifyOtpPage = (req, res) => {
    const email = req.query.email;
    if (!email) {
        req.flash('error_msg', 'Email required for OTP verification.');
        return res.redirect('/auth/register'); // Or login? Register makes more sense if they lack email.
    }
     if (req.session.user) {
        // Already logged in, shouldn't be verifying OTP typically
        return res.redirect('/');
   }
    res.render('auth/verify-otp', { title: 'Verify Email', email });
};

// --- Password Reset Page Getters ---
exports.getForgotPasswordPage = (req, res) => {
     if (req.session.user) {
         // Don't show forgot password if logged in
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
        // Token is valid, render the reset page
        res.render('auth/reset-password', { title: 'Reset Password', token: req.params.token });
    } catch (error) {
        next(error); // Pass errors to the handler
    }
};

// --- Registration Logic ---
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
    // Basic email format check (more robust check in schema)
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
        errors.push('Please enter a valid email address.');
    }

    if (errors.length > 0) {
        req.flash('error_msg', errors.join(' '));
        // Persist input values (except passwords) back to the form
        return res.render('auth/register', {
            title: 'Register',
            name: name,
            email: email,
            // Don't send back passwords
        });
    }
    // --- End Validation ---

    try {
        const lowerCaseEmail = email.toLowerCase();
        let user = await User.findOne({ email: lowerCaseEmail });

        if (user && user.isVerified) {
            req.flash('error_msg', 'Email is already registered and verified.');
            return res.redirect('/auth/login');
        }

        const otp = generateOTP();
        const otpExpires = setOTPExpiration(10); // OTP expires in 10 minutes

        if (user && !user.isVerified) {
            // Found unverified user - update details and resend OTP
            user.name = name;
            // Re-hash password if provided (pre-save hook handles hashing)
            if (password) { user.password = password; }
            user.otp = otp;
            user.otpExpires = otpExpires;
            user.isVerified = false;
            // Save without full validation if only updating OTP/password on unverified doc
            await user.save({ validateBeforeSave: false });
        } else {
            // Create a brand new user instance
            user = new User({
                name,
                email: lowerCaseEmail,
                password, // Will be hashed by pre-save hook
                otp,
                otpExpires,
                isVerified: false, // Start as unverified
            });
            await user.save(); // Full validation runs here
        }

        // Send Verification Email
        const subject = 'Verify Your Email Address';
        const text = `Your verification OTP is: ${otp}\nIt will expire in 10 minutes.`;
        const html = `<p>Welcome to our store!</p><p>Your verification OTP is: <strong>${otp}</strong></p><p>It will expire in 10 minutes.</p>`;

        const emailSent = await sendEmail(user.email, subject, text, html);

        if (emailSent) {
            req.flash('success_msg', `An OTP has been sent to ${user.email}. Please check your inbox and verify.`);
            res.redirect(`/auth/verify-otp?email=${encodeURIComponent(user.email)}`);
        } else {
            // Optional: Clean up newly created unverified user if email fails
            // This check is heuristic: if created within the last few seconds.
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
        if (error.code === 11000) { // Handle MongoDB duplicate key error (email unique)
            req.flash('error_msg', 'Email already exists. Please login or use a different email.');
            return res.render('auth/register', { title: 'Register', name: name, email: email });
        }
        if (error.name === 'ValidationError') {
           let validationErrors = Object.values(error.errors).map(el => el.message);
            req.flash('error_msg', validationErrors.join(' '));
            return res.render('auth/register', { title: 'Register', name: name, email: email });
       }
        // Pass other unexpected errors to the global error handler
        next(error);
    }
};

// --- OTP Verification Logic ---
exports.verifyOtp = async (req, res, next) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        req.flash('error_msg', 'Email and OTP are required.');
         // Ensure email is passed back even on error
         return res.redirect(`/auth/verify-otp?email=${encodeURIComponent(email || '')}`);
    }

    try {
        const lowerCaseEmail = email.toLowerCase();
        const user = await User.findOne({
            email: lowerCaseEmail,
            otp: otp,
            otpExpires: { $gt: Date.now() }, // Check if OTP is still valid
        }).select('+password'); // Include password for potential immediate login

        if (!user) {
            // Check if user exists but OTP is wrong/expired
            const existingUser = await User.findOne({ email: lowerCaseEmail });
            if (existingUser && !existingUser.isVerified) {
                req.flash('error_msg', 'Invalid or expired OTP. Please try again or resend.');
            } else if (existingUser && existingUser.isVerified) {
                 req.flash('error_msg', 'This account is already verified. Please login.');
                 return res.redirect('/auth/login');
            } else {
                 // Should not happen if register flow is correct, but handle defensively
                 req.flash('error_msg', 'Verification failed. Please try registering again.');
                 return res.redirect('/auth/register');
            }
            return res.redirect(`/auth/verify-otp?email=${encodeURIComponent(email)}`);
        }

         // OTP is valid. Determine if it's for registration or password reset.
         const isPasswordReset = user.resetPasswordToken && user.resetPasswordExpires && user.resetPasswordExpires > Date.now();

         // Mark user as verified (if not already) and clear OTP fields in both cases
         user.isVerified = true;
         user.otp = undefined;
         user.otpExpires = undefined;

         if(isPasswordReset){
             // OTP was for password reset verification. Proceed to reset page.
             // Don't clear the reset token yet, it's needed for the next step.
             await user.save({ validateBeforeSave: false }); // Save quickly without full validation if needed

             req.flash('success_msg', 'OTP Verified. Please set your new password.');
             res.redirect(`/auth/reset-password/${user.resetPasswordToken}`);
         } else {
            // OTP was for registration verification. Log the user in.
            await user.save(); // Save changes (isVerified=true, cleared OTP)

            // --- Login User Immediately ---
            // Regenerate session ID for security
             req.session.regenerate(err => {
                if (err) {
                     console.error("Session regeneration error after OTP verify:", err);
                     return next(err); // Pass error to handler
                 }

                // Store essential user data in the new session
                req.session.user = {
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    address: user.address, // Include address if available
                    cart: user.cart || [] // Initialize cart if necessary
                 };

                // Save the session before redirecting
                req.session.save(err => {
                   if (err) {
                        console.error("Session save error after OTP verify login:", err);
                        return next(err); // Pass error to handler
                    }
                    // Successful login after verification
                    req.flash('success_msg', 'Email verified successfully! You are now logged in.');
                    const returnTo = req.session.returnTo || '/'; // Redirect to intended page or home
                    delete req.session.returnTo; // Clean up returnTo URL
                    res.redirect(returnTo);
                 });
             });
            // --- End Immediate Login ---
         }

    } catch (error) {
        next(error); // Pass errors to the global error handler
    }
};

// --- Resend OTP Logic ---
exports.resendOtp = async (req, res, next) => {
    const { email } = req.body;

    if (!email) {
        req.flash('error_msg', 'Email is required to resend OTP.');
         // Try to get email from query if available for redirect back to verify page
         return res.redirect(`/auth/verify-otp?email=${encodeURIComponent(req.query.email || '')}`);
    }

    try {
        const lowerCaseEmail = email.toLowerCase();
        const user = await User.findOne({ email: lowerCaseEmail });

        if (!user) {
            // Don't reveal if user exists or not for security.
            // Redirect to register page as a neutral action.
            req.flash('error_msg', 'If your email is registered, an OTP will be sent. Please check your inbox.');
            return res.redirect('/auth/register');
        }

        // Determine context: is it for registration verification or password reset?
        const isForReset = user.resetPasswordToken && user.resetPasswordExpires && user.resetPasswordExpires > Date.now();

        // If already verified AND it's not a password reset request, redirect to login
        if(user.isVerified && !isForReset) {
             req.flash('error_msg', 'This account is already verified. Please login.');
            return res.redirect('/auth/login');
        }
        // If not verified OR it IS for a password reset, proceed to send new OTP

        // Generate new OTP and expiry time
        const otp = generateOTP();
        const otpExpires = setOTPExpiration(10); // New OTP valid for 10 minutes

        user.otp = otp;
        user.otpExpires = otpExpires;
        // We don't need validateBeforeSave: false here usually, unless hitting issues
        await user.save(); // Save the new OTP details

        // Prepare email content based on context
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

        // Send the email with the new OTP
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
        next(error); // Pass errors to the global error handler
    }
};

// --- Login Logic ---
exports.loginUser = async (req, res, next) => {
    const { email, password } = req.body;

    if (!email || !password) {
        req.flash('error_msg', 'Please provide both email and password.');
        return res.render('auth/login', { title: 'Login', email: email }); // Render with email filled
    }

    try {
        const lowerCaseEmail = email.toLowerCase();
        // Find user, ensure password field is selected, and populate cart details
        const user = await User.findOne({ email: lowerCaseEmail })
                             .select('+password') // Explicitly request the password field
                             .populate('cart.productId'); // Populate cart for session

        if (!user) {
            req.flash('error_msg', 'Invalid credentials. Please check your email and password.');
            return res.render('auth/login', { title: 'Login', email: email });
        }

         // Check if user's email is verified
         if (!user.isVerified) {
            req.flash('error_msg', 'Your email is not verified. Please check your inbox for the verification OTP or request a new one.');
            // Redirect to OTP page, passing email
            return res.redirect(`/auth/verify-otp?email=${encodeURIComponent(user.email)}`);
         }

        // Compare submitted password with the stored hash using the method on the user model
        const isMatch = await user.matchPassword(password);

        if (!isMatch) {
            req.flash('error_msg', 'Invalid credentials. Please check your email and password.');
            return res.render('auth/login', { title: 'Login', email: email });
        }

        // Password matched, credentials valid, proceed with session setup
        // Regenerate session ID to prevent session fixation attacks
         req.session.regenerate(err => {
            if (err) {
                 console.error("Session regeneration error during login:", err);
                 return next(err); // Pass error to handler
             }

            // Store essential, non-sensitive user data in the new session
            req.session.user = {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                address: user.address, // Include address if available
                cart: user.cart // Include populated cart details
            };

             // Save the newly regenerated session
             req.session.save(err => {
                 if (err) {
                     console.error("Session save error after login:", err);
                     return next(err); // Pass error to handler
                 }
                 // Successful login
                 req.flash('success_msg', 'You are now logged in successfully.');
                 const returnTo = req.session.returnTo || '/'; // Redirect to intended page or home
                 delete req.session.returnTo; // Clean up returnTo URL
                 res.redirect(returnTo);
            });
        });

    } catch (error) {
        next(error); // Pass errors to the global error handler
    }
};

// --- Logout Logic ---
exports.logoutUser = (req, res, next) => {
    // Set the flash message *before* destroying the session
    req.flash('success_msg', 'You have been logged out successfully.');

    req.session.destroy(err => {
        if (err) {
            console.error('Session destruction error:', err);
            // Attempt to redirect even if destroy fails, but log the error
            req.flash('error_msg', 'Could not fully logout. Please clear your browser cookies.'); // Inform user
            return res.redirect('/auth/login');
            // Alternatively, pass to error handler: return next(err);
        }
        // Clear the session cookie on the client side
        // Use the default 'connect.sid' or your configured cookie name
        res.clearCookie('connect.sid');

        // Redirect to login page after successful destruction and cookie clearing
        res.redirect('/auth/login');
    });
};

// --- Forgot Password Logic ---
exports.forgotPassword = async (req, res, next) => {
    const { email } = req.body;
    if (!email) {
        req.flash('error_msg', 'Please provide an email address.');
        return res.redirect('/auth/forgot-password');
    }

    try {
        const lowerCaseEmail = email.toLowerCase();
        const user = await User.findOne({ email: lowerCaseEmail });

        // Security: Always show a generic success message regardless of whether the user exists or is verified.
        // This prevents attackers from enumerating registered/verified emails.
        const genericMessage = 'If an account with that email exists and is verified, a password reset OTP will be sent. Please check your inbox.';
        req.flash('success_msg', genericMessage); // Flash the message immediately

        if (!user || !user.isVerified) {
            // If user doesn't exist, or exists but isn't verified, we still show the generic message.
            // Log internally for debugging if needed, but don't reveal status to the client.
            console.log(`Password reset request for ${lowerCaseEmail}: User ${!user ? 'not found' : 'found but not verified'}. Sending generic response.`);
            return res.redirect('/auth/forgot-password'); // Redirect back
        }

         // User exists and is verified, proceed with OTP generation
         const otp = generateOTP();
         const resetToken = crypto.randomBytes(20).toString('hex'); // Token for the reset link itself (after OTP verify)
        const otpExpires = setOTPExpiration(10); // OTP valid for 10 mins
        const resetExpires = setOTPExpiration(60); // Link valid for 60 mins after OTP verification

        // Store OTP, token, and expiry times on the user document
        user.otp = otp;
        user.otpExpires = otpExpires;
        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = resetExpires;
        await user.save();

        // Prepare email content for OTP verification step
        const subject = 'Password Reset Request - Verify OTP';
        const text = `You requested a password reset.\n\nPlease use the following OTP to verify your request: ${otp}\n\nThis OTP will expire in 10 minutes.\n\nIf you did not request this, please ignore this email.`;
        const html = `<p>You requested a password reset.</p><p>Please use the following OTP to verify your request: <strong>${otp}</strong></p><p>This OTP will expire in 10 minutes.</p><p>If you did not request this, please ignore this email.</p>`;

         // Send the email containing the OTP
         const emailSent = await sendEmail(user.email, subject, text, html);

        if (emailSent) {
            // The generic success message is already flashed. Redirect to OTP page.
             console.log(`Password reset OTP sent to verified user: ${user.email}`);
             // Redirect to OTP verification page, indicating it's for reset
             res.redirect(`/auth/verify-otp?email=${encodeURIComponent(user.email)}&reason=reset`);
        } else {
            // If email fails, clear the OTP/token fields to prevent misuse
            user.otp = undefined;
            user.otpExpires = undefined;
            user.resetPasswordToken = undefined;
            user.resetPasswordExpires = undefined;
            await user.save(); // Save the cleared fields

            console.error(`Failed to send password reset OTP email to ${user.email}`);
            // Keep the generic success message flashed earlier, but maybe add an error log or specific admin alert.
            // Don't flash an error_msg here as it contradicts the generic success message.
            res.redirect('/auth/forgot-password'); // Redirect back
        }

    } catch (error) {
        console.error("Error in forgotPassword:", error);
        // Show a generic error message in case of unexpected issues
        req.flash('error_msg', 'An error occurred while processing your request. Please try again later.');
        res.redirect('/auth/forgot-password');
        // Or pass to global handler: next(error);
    }
};

// --- Reset Password Logic ---
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
         return res.redirect(`/auth/reset-password/${token}`); // Redirect back to the form
    }
    // --- End Validation ---

    try {
        // Find user by the valid reset token and ensure it hasn't expired
        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() }, // Check expiry
         });

        if (!user) {
            // Token is invalid or expired
            req.flash('error_msg', 'Password reset token is invalid or has expired. Please request a new reset link.');
            return res.redirect('/auth/forgot-password'); // Send back to start of process
        }

        // Token is valid, update the password
        user.password = password; // Pre-save hook in User.js will hash it
        // Clear reset token and OTP fields after successful reset
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        user.otp = undefined; // Ensure OTP used for verification is also cleared
        user.otpExpires = undefined;

        await user.save(); // Save the user with new password and cleared tokens

        // --- Log the user in automatically after successful password reset ---
        req.session.regenerate(err => {
             if (err) {
                console.error("Session regeneration error after password reset:", err);
                // Try to proceed even if regeneration fails, but flash a message?
                req.flash('error_msg', 'Password reset but failed to log you in automatically. Please log in with your new password.');
                return res.redirect('/auth/login');
                // Or pass to handler: return next(err);
             }
            // Store essential user data in the new session
             req.session.user = {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                address: user.address,
                cart: user.cart // Assuming cart might be needed immediately
            };
            // Save the session
            req.session.save(err => {
                if(err) {
                    console.error("Session save error after password reset login:", err);
                    req.flash('error_msg', 'Password reset but failed to log you in automatically. Please log in with your new password.');
                    return res.redirect('/auth/login');
                    // Or pass to handler: return next(err);
                 }
                 // Success: Password reset and logged in
                 req.flash('success_msg', 'Password has been reset successfully. You are now logged in.');
                res.redirect('/'); // Redirect to homepage or dashboard
             });
         });
        // --- End Automatic Login ---

    } catch (error) {
        if (error.name === 'ValidationError') {
           let validationErrors = Object.values(error.errors).map(el => el.message);
            req.flash('error_msg', validationErrors.join(' '));
            return res.redirect(`/auth/reset-password/${token}`);
       }
        next(error); // Pass other errors to the global error handler
    }
};


// ======================================
// Home Page Controller Action
// ======================================
exports.getHomePage = async (req, res, next) => {
  try {
    const searchTerm = req.query.search || '';
    // --- REMOVED STOCK FILTER ---
    let query = {}; // Initialize query object - show ALL products by default

    // Apply search filter if searchTerm exists
    if (searchTerm) {
      // Build search query using regex (case-insensitive)
      // Escape special regex characters in the search term for safety
      const escapedSearchTerm = searchTerm.replace(/[-\[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
      const regex = new RegExp(escapedSearchTerm, 'i');
      query.$or = [
         { name: regex },
         { category: regex },
         { specifications: regex }
         // Add more fields to search if needed (e.g., description, sellerEmail)
      ];
    }

    // Fetch products based on the query (either empty or with search terms)
    // Sort by newest first
    const products = await Product.find(query).sort({ createdAt: -1 }).lean(); // Use lean()

    // Render the main product listing page (index.ejs)
    res.render('products/index', {
      title: searchTerm ? `Search Results for "${searchTerm}"` : 'Home', // Dynamic title
      products: products, // Pass the fetched products (including out-of-stock)
      searchTerm: searchTerm // Pass searchTerm back to view for the search input field
    });
  } catch (error) {
    console.error("Error fetching products for home page:", error);
    next(error); // Pass errors to the global error handler
  }
};