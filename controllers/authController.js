// controllers/authController.js
const User = require('../models/User');
const Product = require('../models/Product');
const BannerConfig = require('../models/BannerConfig');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { generateOTP, setOTPExpiration } = require('../services/otpService');
const { sendEmail } = require('../config/mailer');
// *** IMPORT NEW SERVICE ***
const { generateEmailHtml } = require('../services/emailTemplateService');
const categories = require('../config/categories');
const { categoryNames } = require('../config/categories');

// --- Password Complexity Regex ---
const uppercaseRegex = /[A-Z]/;
const lowercaseRegex = /[a-z]/;
const numberRegex = /[0-9]/;
const specialCharRegex = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/;
const minPasswordLength = 8;

const passwordFormatErrorMsg = "password doesn't match requested format";


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
    res.render('auth/register', {
        title: 'Register',
        name: req.flash('form_name')[0] || '',
        email: req.flash('form_email')[0] || ''
    });
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

exports.registerUser = async (req, res, next) => {
     if (req.session.user) {
        return res.redirect('/');
    }
    const { name, email, password, confirmPassword } = req.body;

    let errors = [];
    if (!name || !email || !password || !confirmPassword) { errors.push('Please fill in all fields.'); }
    if (password !== confirmPassword) { errors.push('Passwords do not match.'); }
    if (email && !/^\S+@\S+\.\S+$/.test(email)) { errors.push('Please enter a valid email address.'); }

    let passwordComplexityFailed = false;
    if (password) {
        if (
            password.length < minPasswordLength ||
            !uppercaseRegex.test(password) ||
            !lowercaseRegex.test(password) ||
            !numberRegex.test(password) ||
            !specialCharRegex.test(password)
        ) {
            passwordComplexityFailed = true;
        }
    } else {
        // Caught by initial check
    }

    if (passwordComplexityFailed) {
        if (!errors.includes(passwordFormatErrorMsg)) {
             errors.push(passwordFormatErrorMsg);
        }
    }

    if (errors.length > 0) {
        req.flash('error_msg', errors.join(' '));
        req.flash('form_name', name);
        req.flash('form_email', email);
        return res.redirect('/auth/register');
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
            user.name = name;
            if (password) { user.password = password; }
            user.otp = otp;
            user.otpExpires = otpExpires;
            user.isVerified = false;
            await user.save({ validateBeforeSave: true });
            console.log(`Updating existing unverified user: ${user.email}`);
        } else {
            user = new User({ name, email: lowerCaseEmail, password, otp, otpExpires, isVerified: false });
            await user.save();
            console.log(`New user created: ${user.email}`);
        }

        // *** UPDATED: Send OTP Email using template ***
        const subject = 'Email Verify - miniapp';
        const text = `Your verification OTP is: ${otp}. It will expire in 10 minutes.`; // Simple text version
        const html = generateEmailHtml({
            recipientName: user.name,
            subject: subject,
            greeting: `Welcome to miniapp, ${user.name}!`,
            bodyLines: [
                `Thank you for registering. Please use the following One-Time Password (OTP) to verify your email address:`,
                // Use inline styles for better compatibility
                `<strong style="font-size: 20px; display: block; text-align: center; margin: 15px 0; letter-spacing: 2px; background-color: #f0f0f0; padding: 5px 10px; border-radius: 4px;">${otp}</strong>`,
                `This OTP will expire in 10 minutes.`
            ],
            companyName: 'miniapp' // Pass your app name
            // No button needed for OTP verification usually
        });
        const emailSent = await sendEmail(user.email, subject, text, html);
        // *** END UPDATE ***

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
        if (error.code === 11000) {
            req.flash('error_msg', 'Email already exists. Please login or use a different email.');
             req.flash('form_name', name);
             req.flash('form_email', email);
            return res.redirect('/auth/register');
        }
        if (error.name === 'ValidationError') {
           let validationErrors = Object.values(error.errors).map(el => el.message);
            if (validationErrors.some(msg => msg.includes('Password must be at least'))) {
                 if (!errors.includes(passwordFormatErrorMsg)) {
                    errors.push(passwordFormatErrorMsg);
                 }
                 validationErrors = validationErrors.filter(msg => !msg.includes('Password must be at least'));
            }
            const finalErrors = [...new Set([...errors, ...validationErrors])];
            req.flash('error_msg', finalErrors.join(' '));
            req.flash('form_name', name);
            req.flash('form_email', email);
            return res.redirect('/auth/register');
       }
        console.error("Registration Error:", error);
        next(error);
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
             // Don't clear reset token here, clear it in resetPassword controller
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
        await user.save({ validateBeforeSave: false });

        // *** UPDATED: Send OTP Email using template ***
        let subject, greeting, bodyLines;
        const textOtpLine = `Your OTP is: ${otp}. It will expire in 10 minutes.`;

        if (isForReset) {
            subject = 'Your New Password Reset OTP';
            greeting = `Password Reset Request`;
            bodyLines = [
                `Here is your new One-Time Password (OTP) for your password reset request:`,
                `<strong style="font-size: 20px; display: block; text-align: center; margin: 15px 0; letter-spacing: 2px; background-color: #f0f0f0; padding: 5px 10px; border-radius: 4px;">${otp}</strong>`,
                `This OTP will expire in 10 minutes.`,
                `If you didn't request a password reset, please ignore this email.`
            ];
        } else {
             subject = 'Your New Verification OTP';
             greeting = `Verify Your Email`;
             bodyLines = [
                 `Here is your new One-Time Password (OTP) to verify your email address:`,
                 `<strong style="font-size: 20px; display: block; text-align: center; margin: 15px 0; letter-spacing: 2px; background-color: #f0f0f0; padding: 5px 10px; border-radius: 4px;">${otp}</strong>`,
                 `This OTP will expire in 10 minutes.`,
                 `If you didn't request this, please ignore this email.`
             ];
        }

        const text = `${subject}\n${textOtpLine}\nIf you didn't request this, please ignore this email.`;
        const html = generateEmailHtml({
             recipientName: user.name,
             subject: subject,
             greeting: greeting,
             bodyLines: bodyLines,
             companyName: 'miniapp'
        });
        // *** END UPDATE ***

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
        const user = await User.findOne({ email: lowerCaseEmail }).select('+password').populate('cart.productId', 'name price imageUrl');

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
                _id: user._id, name: user.name, email: user.email, role: user.role,
                address: user.address ? user.address.toObject() : undefined,
                cart: user.cart ? user.cart.map(item => ({ productId: item.productId?._id, quantity: item.quantity })) : []
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
    const sessionUserEmail = req.session?.user?.email || 'User';

    req.flash('success_msg', 'You have been logged out successfully.');

    if (req.session) {
        req.session.user = null;
    }

    const cookieName = req.app.get('session cookie name') || 'connect.sid';
    res.clearCookie(cookieName);
    console.log(`${sessionUserEmail} - Cleared session cookie: ${cookieName}`);

    if (req.session) {
        req.session.destroy(err => {
            if (err) {
                console.error(`${sessionUserEmail} - Session destruction error (may be ignorable):`, err);
            } else {
                console.log(`${sessionUserEmail} - Session destroyed successfully in store.`);
            }
        });
    } else {
        console.log(`${sessionUserEmail} - No active session found to destroy.`);
    }
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

        // *** UPDATED: Send Email using template ***
        const subject = 'Password Reset - miniapp';
        const text = `You requested a password reset. Your OTP is: ${otp}. It expires in 10 minutes. If you did not request this, ignore this email.`;
        const html = generateEmailHtml({
            recipientName: user.name,
            subject: subject,
            greeting: `Password Reset Request`,
            bodyLines: [
                 `We received a request to reset the password for your account ${user.email}.`,
                 `Please use the following One-Time Password (OTP) to verify your identity:`,
                 `<strong style="font-size: 20px; display: block; text-align: center; margin: 15px 0; letter-spacing: 2px; background-color: #f0f0f0; padding: 5px 10px; border-radius: 4px;">${otp}</strong>`,
                 `This OTP is valid for 10 minutes.`,
                 `If you did not request a password reset, please ignore this email. Your password will remain unchanged.`
            ],
            companyName: 'miniapp'
            // No button needed here, user enters OTP on site
        });
        const emailSent = await sendEmail(user.email, subject, text, html);
        // *** END UPDATE ***

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
    if (!password || !confirmPassword) { errors.push('Please enter and confirm your new password.'); }
    if (password !== confirmPassword) { errors.push('Passwords do not match.'); }

    let passwordComplexityFailed = false;
    if (password) {
        if (
            password.length < minPasswordLength ||
            !uppercaseRegex.test(password) ||
            !lowercaseRegex.test(password) ||
            !numberRegex.test(password) ||
            !specialCharRegex.test(password)
        ) {
            passwordComplexityFailed = true;
        }
    }

    if (passwordComplexityFailed) {
         if (!errors.includes(passwordFormatErrorMsg)) {
            errors.push(passwordFormatErrorMsg);
         }
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

        // Optional: Send password change confirmation email
        try {
             const subject = 'Password Reset Success - miniapp';
             const text = `Your account associated with ${user.email}  password was successfully changed. If you did not make this change, please contact support immediately.`;
             const html = generateEmailHtml({
                 recipientName: user.name,
                 subject: subject,
                 greeting: 'Password Successfully Reset',
                 bodyLines: [
                     `This email confirms that the password for your miniapp account has been successfully changed.`,
                     `If you did not initiate this password reset, please contact our support team immediately.`
                 ],
                 companyName: 'miniapp',
                 // Optional button to login
                 buttonUrl: `${req.protocol}://${req.get('host')}/auth/login`,
                 buttonText: 'Login to Your Account'
             });
             await sendEmail(user.email, subject, text, html);
        } catch (emailError) {
             console.error("Error sending password change confirmation email:", emailError);
        }


        req.session.regenerate(err => {
             if (err) {
                console.error("Session regeneration error after password reset:", err);
                req.flash('success_msg', 'Password reset successful. Please log in with your new password.');
                return res.redirect('/auth/login');
             }
              req.session.user = {
                  _id: user._id, name: user.name, email: user.email, role: user.role,
                  address: user.address ? user.address.toObject() : undefined,
                  cart: []
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
        console.error("Reset Password Error:", error);
        next(error);
    }
};


exports.getHomePage = async (req, res, next) => {
  try {
    const searchTerm = req.query.search || '';
    const categoryFilter = req.query.category || '';

    let query = {
        reviewStatus: 'approved',
        stock: { $gt: 0 }
    };

    if (searchTerm) {
         query.$text = { $search: searchTerm };
    }
    if (categoryFilter && categoryNames.includes(categoryFilter)) {
        query.category = categoryFilter;
    } else if (categoryFilter) {
        console.warn(`Invalid category filter attempted: ${categoryFilter}`);
    }

     const projection = searchTerm ? { score: { $meta: "textScore" } } : {};
     const sort = searchTerm ? { score: { $meta: "textScore" } } : { createdAt: -1 };

    const [products, bannerConfig] = await Promise.all([
        Product.find(query, projection).sort(sort).lean(),
        BannerConfig.findOne({ configKey: 'mainBanners' }).lean()
    ]);

    const banners = bannerConfig?.banners || [];
    const validBanners = banners.filter(banner => banner.imageUrl);

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