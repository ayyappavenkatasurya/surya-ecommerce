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
            // Found unverified user - update details and OTP
            user.name = name;
            user.password = password; // Will be re-hashed by pre-save hook
            user.otp = otp;
            user.otpExpires = otpExpires;
            user.isVerified = false;
             // We need to save without full validation if only updating OTP/password on unverified doc
             await user.save({ validateBeforeSave: false });
        } else {
            // Create brand new user
            user = new User({
                name,
                email: email.toLowerCase(),
                password, // Will be hashed by pre-save hook
                otp,
                otpExpires,
                isVerified: false,
            });
            await user.save(); // Full validation runs here
        }

        const subject = 'Verify Your Email Address';
        const text = `Your verification OTP is: ${otp}\nIt will expire in 10 minutes.`;
        const html = `<p>Your verification OTP is: <strong>${otp}</strong></p><p>It will expire in 10 minutes.</p>`;

        const emailSent = await sendEmail(user.email, subject, text, html);

        if (emailSent) {
            req.flash('success_msg', `An OTP has been sent to ${user.email}. Please verify.`);
            res.redirect(`/auth/verify-otp?email=${encodeURIComponent(user.email)}`);
        } else {
             // Clean up user if email failed ONLY IF IT WAS A NEW USER attempt
             if(!user.createdAt || (Date.now() - user.createdAt.getTime()) < 2000) { // Heuristic: If created within last 2s
                await User.deleteOne({ _id: user._id, isVerified: false });
             }
            req.flash('error_msg', 'Could not send OTP email. Please try registering again or contact support.');
            res.redirect('/auth/register');
        }

    } catch (error) {
        if (error.code === 11000) { // Handle duplicate key error specifically
            req.flash('error_msg', 'Email already exists.');
             return res.redirect('/auth/register');
        }
        if (error.name === 'ValidationError') {
           let errors = Object.values(error.errors).map(el => el.message);
            req.flash('error_msg', errors.join(' '));
            return res.redirect('/auth/register');
       }
        next(error); // Pass other errors to the error handler
    }
};

exports.verifyOtp = async (req, res, next) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        req.flash('error_msg', 'Email and OTP are required.');
         // Ensure email is passed back even on error
         return res.redirect(`/auth/verify-otp?email=${encodeURIComponent(email || '')}`);
    }

    try {
        const user = await User.findOne({
            email: email.toLowerCase(),
            otp: otp,
            otpExpires: { $gt: Date.now() },
        }).select('+password'); // Include password if needed later (e.g., for immediate login)

        if (!user) {
            req.flash('error_msg', 'Invalid or expired OTP.');
            return res.redirect(`/auth/verify-otp?email=${encodeURIComponent(email)}`);
        }

         // Check if this OTP verification is part of a password reset flow
         let wasPasswordReset = user.resetPasswordToken && user.resetPasswordExpires > Date.now();

         // Mark user as verified and clear OTP fields
         user.isVerified = true;
         user.otp = undefined;
         user.otpExpires = undefined;

         if(wasPasswordReset){
             // OTP was for password reset verification, proceed to reset page
             req.flash('success_msg', 'OTP Verified. Please set your new password.');
             // Don't clear reset token yet, needed for next step
             await user.save({ validateBeforeSave: false }); // Save without full validation if needed
             res.redirect(`/auth/reset-password/${user.resetPasswordToken}`);
         } else {
            // OTP was for registration verification, log the user in
            await user.save(); // Save changes (isVerified, cleared OTP)

            // Log the user in by setting up the session
            req.session.user = {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                address: user.address,
                cart: user.cart // Make sure cart is loaded or initialized if needed
             };

            // Save the session before redirecting
            req.session.save(err => {
               if (err) {
                    console.error("Session save error after OTP verify:", err);
                    return next(err); // Pass error to handler
                }
                // Successful login after verification
                req.flash('success_msg', 'Email verified successfully! You are now logged in.');
                const returnTo = req.session.returnTo || '/';
                delete req.session.returnTo; // Clean up returnTo URL
                res.redirect(returnTo);
             });
         }

    } catch (error) {
        next(error); // Pass errors to the error handler
    }
};

exports.resendOtp = async (req, res, next) => {
    const { email } = req.body;

    if (!email) {
        req.flash('error_msg', 'Email is required to resend OTP.');
         // Try to get email from query if available for redirect
         return res.redirect(`/auth/verify-otp?email=${encodeURIComponent(req.query.email || '')}`);
    }

    try {
        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            // Don't reveal if user exists, redirect to register for consistency
            req.flash('error_msg', 'If your email is registered but not verified, an OTP will be sent.');
            return res.redirect('/auth/register');
        }

        // Determine if OTP resend is for registration or password reset
        const isForReset = user.resetPasswordToken && user.resetPasswordExpires > Date.now();

        if(user.isVerified && !isForReset) {
             // Already verified, not a password reset case
             req.flash('error_msg', 'This account is already verified.');
            return res.redirect('/auth/login');
        }

        // Generate new OTP and expiry
        const otp = generateOTP();
        const otpExpires = setOTPExpiration(10); // 10 minutes

        user.otp = otp;
        user.otpExpires = otpExpires;
        await user.save(); // Save the new OTP

        // Prepare email content
        let subject = isForReset ? 'Your New Password Reset OTP' : 'Your New Verification OTP';
         let text = `Your new OTP is: ${otp}\nIt will expire in 10 minutes.`;
        let html = `<p>Your new OTP is: <strong>${otp}</strong></p><p>It will expire in 10 minutes.</p>`;
        if (isForReset) {
            text = `Your new password reset OTP is: ${otp}\nIt will expire in 10 minutes.\nIf you did not request this, please ignore this email.`;
            html = `<p>Your new password reset OTP is: <strong>${otp}</strong></p><p>It will expire in 10 minutes.</p><p>If you did not request this, please ignore this email.</p>`;
        }


        // Send the email
        const emailSent = await sendEmail(user.email, subject, text, html);

        if (emailSent) {
            req.flash('success_msg', `A new OTP has been sent to ${user.email}.`);
            // Redirect back to OTP entry page, indicating purpose if reset
            const redirectUrl = `/auth/verify-otp?email=${encodeURIComponent(user.email)}${isForReset ? '&reason=reset' : ''}`;
            res.redirect(redirectUrl);
        } else {
            req.flash('error_msg', 'Could not resend OTP email. Please try again.');
             // Redirect back to OTP entry page even on failure
             res.redirect(`/auth/verify-otp?email=${encodeURIComponent(user.email)}${isForReset ? '&reason=reset' : ''}`);
        }
    } catch (error) {
        next(error); // Pass errors to the error handler
    }
};


exports.loginUser = async (req, res, next) => {
    const { email, password } = req.body;

    if (!email || !password) {
        req.flash('error_msg', 'Please provide email and password.');
        return res.redirect('/auth/login');
    }

    try {
        // Find user and include password field for comparison
        const user = await User.findOne({ email: email.toLowerCase() })
                             .select('+password')
                             .populate('cart.productId'); // Populate cart details for session

        if (!user) {
            req.flash('error_msg', 'Invalid credentials.');
            return res.redirect('/auth/login');
        }

         // Check if user's email is verified
         if (!user.isVerified) {
            req.flash('error_msg', 'Please verify your email first. Check your inbox for the OTP.');
            // Redirect to OTP page, passing email
            return res.redirect(`/auth/verify-otp?email=${encodeURIComponent(user.email)}`);
         }

        // Compare submitted password with stored hash
        const isMatch = await user.matchPassword(password);

        if (!isMatch) {
            req.flash('error_msg', 'Invalid credentials.');
            return res.redirect('/auth/login');
        }

        // Password matched, setup session
        // Regenerate session ID to prevent fixation attacks
         req.session.regenerate(err => {
            if (err) {
                 console.error("Session regeneration error:", err);
                 return next(err); // Pass error to handler
             }

            // Store essential, non-sensitive user data in session
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
                 req.flash('success_msg', 'You are now logged in.');
                 const returnTo = req.session.returnTo || '/'; // Redirect to intended page or home
                 delete req.session.returnTo; // Clean up returnTo URL
                 res.redirect(returnTo);
            });
        });

    } catch (error) {
        next(error); // Pass errors to the error handler
    }
};

exports.logoutUser = (req, res, next) => {
    // Set the flash message *BEFORE* destroying the session
    req.flash('success_msg', 'You have been logged out.');

    req.session.destroy(err => {
        if (err) {
            console.error('Session destruction error:', err);
            // Pass the error to the main error handler instead of trying to flash again
            return next(err);
        }
        // Clear the session cookie after successful destruction
        res.clearCookie('connect.sid'); // Use the default cookie name or your configured name

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
        const user = await User.findOne({ email: email.toLowerCase() });

        // Security: Always show a generic success message regardless of whether the user exists
        // This prevents attackers from enumerating registered emails.
        const genericSuccessMessage = 'If an account with that email exists and is verified, a password reset OTP will be sent.';

        if (!user) {
            req.flash('success_msg', genericSuccessMessage);
            return res.redirect('/auth/forgot-password');
        }

        // Check if the found user is verified
        if (!user.isVerified) {
            req.flash('error_msg', 'This account is not verified. Please complete registration verification first.');
             // Redirect to OTP verification page for registration
             return res.redirect(`/auth/verify-otp?email=${encodeURIComponent(user.email)}`);
         }

         // Generate OTP and reset token with expiry dates
         const otp = generateOTP();
         const resetToken = crypto.randomBytes(20).toString('hex');
        const otpExpires = setOTPExpiration(10); // OTP valid for 10 mins
        const resetExpires = setOTPExpiration(60); // Reset token valid for 60 mins

        // Store OTP, token, and expiry times on the user document
        user.otp = otp;
        user.otpExpires = otpExpires;
        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = resetExpires;
        await user.save();

        // Prepare email content
        const subject = 'Password Reset Request - Verify OTP';
         const text = `You requested a password reset.\n\nPlease use the following OTP to verify your request: ${otp}\n\nIt will expire in 10 minutes.\n\nIf you did not request this, please ignore this email.`;
         const html = `<p>You requested a password reset.</p><p>Please use the following OTP to verify your request: <strong>${otp}</strong></p><p>It will expire in 10 minutes.</p><p>If you did not request this, please ignore this email.</p>`;

         // Send the email containing the OTP
         const emailSent = await sendEmail(user.email, subject, text, html);

        if (emailSent) {
            req.flash('success_msg', `An OTP has been sent to ${user.email} to verify your password reset request.`);
             // Redirect to OTP verification page, indicating it's for reset
             res.redirect(`/auth/verify-otp?email=${encodeURIComponent(user.email)}&reason=reset`);
        } else {
            // If email fails, clear the OTP/token fields to prevent misuse
            user.otp = undefined;
            user.otpExpires = undefined;
             user.resetPasswordToken = undefined;
            user.resetPasswordExpires = undefined;
             await user.save(); // Save the cleared fields
            req.flash('error_msg', 'Could not send password reset OTP. Please try again.');
            res.redirect('/auth/forgot-password');
        }

    } catch (error) {
        next(error); // Pass errors to the error handler
    }
};


exports.resetPassword = async (req, res, next) => {
    const { password, confirmPassword } = req.body;
    const token = req.params.token;

    // Validation checks
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
        // Find user by valid reset token and expiry
        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() }, // Ensure token hasn't expired
         });


        if (!user) {
            req.flash('error_msg', 'Password reset token is invalid or has expired.');
            return res.redirect('/auth/forgot-password');
        }

        // Update password (pre-save hook will hash it)
        user.password = password;
        // Clear reset token and OTP fields after successful reset
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
         user.otp = undefined; // Ensure OTP used for verification is cleared too
         user.otpExpires = undefined;

        await user.save(); // Save the user with new password and cleared tokens

        // Log the user in after successful password reset
        req.session.regenerate(err => {
             if (err) {
                console.error("Session regeneration error after reset:", err);
                return next(err);
             }
             req.session.user = {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                address: user.address,
                cart: user.cart // Assuming cart might be needed immediately
            };
            req.session.save(err => {
                if(err) {
                    console.error("Session save error after reset:", err);
                    return next(err);
                 }
                 req.flash('success_msg', 'Password has been reset successfully. You are now logged in.');
                res.redirect('/'); // Redirect to homepage
             });
         });


    } catch (error) {
        next(error); // Pass errors to the error handler
    }
};

// Combined Controller Action for Home Page and Product Listing
exports.getHomePage = async (req, res, next) => {
  try {
    // This now handles both '/' and '/products' with potential search
    const searchTerm = req.query.search || '';
    let query = { stock: { $gt: 0 } }; // Always filter for products in stock

    if (searchTerm) {
      // Build search query if searchTerm exists
      const regex = new RegExp(searchTerm.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'), 'i'); // Escape special chars, case-insensitive
      query.$or = [
         { name: regex },
         { category: regex },
         { specifications: regex }
         // Add more fields to search if needed (e.g., description)
      ];
    }

    // Fetch products based on query, sort by newest first
    const products = await Product.find(query).sort({ createdAt: -1 });

    // Render the main product listing page
    res.render('products/index', {
      title: searchTerm ? `Search Results for "${searchTerm}"` : 'Home', // Dynamic title
      products: products,
      searchTerm: searchTerm // Pass searchTerm back to view for input field
    });
  } catch (error) {
    next(error); // Pass errors to the error handler
  }
};