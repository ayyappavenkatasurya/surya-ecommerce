// controllers.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const axios = require('axios');

// Import consolidated modules
const Models = require('./models');
const Config = require('./config');
const Services = require('./services');

const { User, Product, Order, BannerConfig } = Models;
const { sendEmail, categories, categoryNames } = Config;
const { generateOTP, setOTPExpiration, reviewProductWithGemini, generateEmailHtml } = Services;

// Shared Constants (moved here from individual controllers for consolidation)
const passwordFormatErrorMsg = "Password must be at least 8 characters and include uppercase, lowercase, number, and special character.";
const minPasswordLength = 8;
const uppercaseRegex = /[A-Z]/;
const lowercaseRegex = /[a-z]/;
const numberRegex = /[0-9]/;
const specialCharRegex = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/;

const adminCancellationReasons = [
    "📞 Unable to contact the customer", "❗ Out of stock/unavailable item", "🗺️ Address incorrect/incomplete",
    "🚫 Customer requested cancellation", "❓ Other (Admin)",
];
const sellerCancellationReasons = [
    "❗ Item Out of Stock", "🚚 Unable to Fulfill/Ship", "👤 Technical Issue", "❓ Other Reason",
];


// ============================
// Auth Controller Functions
// ============================
exports.auth_getLoginPage = (req, res) => {
    if (req.session.user) { return res.redirect('/'); }
    res.render('auth/login', { title: 'Login' });
};

exports.auth_getRegisterPage = (req, res) => {
    if (req.session.user) { return res.redirect('/'); }
    res.render('auth/register', {
        title: 'Register', name: req.flash('form_name')[0] || '', email: req.flash('form_email')[0] || ''
    });
};

exports.auth_getVerifyOtpPage = (req, res) => {
    const email = req.query.email;
    if (!email) { req.flash('error_msg', 'Email required for OTP verification.'); return res.redirect('/auth/register'); }
    if (req.session.user) { return res.redirect('/'); }
    res.render('auth/verify-otp', { title: 'Verify Email', email });
};

exports.auth_getForgotPasswordPage = (req, res) => {
    if (req.session.user) { return res.redirect('/'); }
    res.render('auth/forgot-password', { title: 'Forgot Password' });
};

exports.auth_getResetPasswordPage = async (req, res, next) => {
    if (req.session.user) { req.flash('info_msg', 'You are already logged in.'); return res.redirect('/'); }
    try {
        const user = await User.findOne({ resetPasswordToken: req.params.token, resetPasswordExpires: { $gt: Date.now() } });
        if (!user) { req.flash('error_msg', 'Password reset token is invalid or has expired.'); return res.redirect('/auth/forgot-password'); }
        res.render('auth/reset-password', { title: 'Reset Password', token: req.params.token });
    } catch (error) { next(error); }
};

exports.auth_getHomePage = async (req, res, next) => { // Keep name generic for potential reuse
  try {
    const searchTerm = req.query.search || '';
    const categoryFilter = req.query.category || '';
    let query = { reviewStatus: 'approved', stock: { $gt: 0 } };
    if (searchTerm) { query.$text = { $search: searchTerm }; }
    if (categoryFilter && categoryNames.includes(categoryFilter)) { query.category = categoryFilter; }
    else if (categoryFilter) { console.warn(`Invalid category filter: ${categoryFilter}`); }
    const projection = searchTerm ? { score: { $meta: "textScore" } } : {};
    const sort = searchTerm ? { score: { $meta: "textScore" } } : { createdAt: -1 };
    const [products, bannerConfig] = await Promise.all([
        Product.find(query, projection).sort(sort).lean(),
        BannerConfig.findOne({ configKey: 'mainBanners' }).lean()
    ]);
    const banners = bannerConfig?.banners || [];
    const validBanners = banners.filter(banner => banner.imageUrl);
    let pageTitle = 'Home';
    if (searchTerm) pageTitle = `Search: "${searchTerm}"`;
    else if (categoryFilter && categoryNames.includes(categoryFilter)) pageTitle = `Category: ${categoryFilter}`;
    res.render('products/index', {
      title: pageTitle, products, searchTerm, selectedCategory: categoryFilter,
      homepageBanners: validBanners, displayCategories: categories
    });
  } catch (error) { console.error("Error fetching homepage data:", error); next(error); }
};

exports.auth_registerUser = async (req, res, next) => {
     if (req.session.user) { return res.redirect('/'); }
     const { name, email, password, confirmPassword } = req.body;
     let errors = [];
     if (!name || !email || !password || !confirmPassword) errors.push('Please fill in all fields.');
     if (password !== confirmPassword) errors.push('Passwords do not match.');
     if (email && !/^\S+@\S+\.\S+$/.test(email)) errors.push('Valid email required.');
     if (password && (password.length < minPasswordLength || !uppercaseRegex.test(password) || !lowercaseRegex.test(password) || !numberRegex.test(password) || !specialCharRegex.test(password))) {
         if (!errors.includes(passwordFormatErrorMsg)) errors.push(passwordFormatErrorMsg);
     }
     if (errors.length > 0) {
         req.flash('error_msg', errors.join(' ')); req.flash('form_name', name); req.flash('form_email', email);
         return res.redirect('/auth/register');
     }
     try {
         const lowerCaseEmail = email.toLowerCase();
         let user = await User.findOne({ email: lowerCaseEmail });
         if (user?.isVerified) { req.flash('error_msg', 'Email registered & verified. Please login.'); return res.redirect('/auth/login'); }
         const otp = generateOTP(); const otpExpires = setOTPExpiration(10);
         if (user && !user.isVerified) {
             user.name = name; if (password) user.password = password;
             user.otp = otp; user.otpExpires = otpExpires; user.isVerified = false;
             await user.save({ validateBeforeSave: true }); console.log(`Updating unverified user: ${user.email}`);
         } else {
             user = new User({ name, email: lowerCaseEmail, password, otp, otpExpires, isVerified: false });
             await user.save(); console.log(`New user created: ${user.email}`);
         }
         const subject = 'Verify Your Email - miniapp';
         const text = `Your OTP is: ${otp}. Expires in 10 minutes.`;
         const html = generateEmailHtml({ recipientName: user.name, subject: subject, greeting: `Welcome, ${user.name}!`,
             bodyLines: [`Use this OTP to verify your email: <strong style="font-size: 20px;">${otp}</strong>`, `Expires in 10 minutes.` ],
             companyName: 'miniapp' });
         const emailSent = await sendEmail(user.email, subject, text, html);
         if (emailSent) {
             req.flash('success_msg', `OTP sent to ${user.email}. Please verify.`);
             res.redirect(`/auth/verify-otp?email=${encodeURIComponent(user.email)}`);
         } else {
             if(!user.createdAt || (Date.now() - user.createdAt.getTime()) < 5000) { // Cleanup recent failures
                try { await User.deleteOne({ _id: user._id, isVerified: false }); console.log(`Cleaned up ${user.email} due to failed email.`); }
                catch (deleteError) { console.error(`Error cleaning up unverified user ${user.email}:`, deleteError); }
             }
             req.flash('error_msg', 'Could not send OTP email. Try again or contact support.'); res.redirect('/auth/register');
         }
     } catch (error) {
        if (error.code === 11000) { req.flash('error_msg', 'Email exists. Login or use another email.'); req.flash('form_name', name); req.flash('form_email', email); return res.redirect('/auth/register'); }
        if (error.name === 'ValidationError') {
            let validationErrors = Object.values(error.errors).map(el => el.message);
             if (validationErrors.some(msg => msg.includes('Password must be at least'))) { if (!errors.includes(passwordFormatErrorMsg)) errors.push(passwordFormatErrorMsg); validationErrors = validationErrors.filter(msg => !msg.includes('Password must be at least')); }
             req.flash('error_msg', [...new Set([...errors, ...validationErrors])].join(' ')); req.flash('form_name', name); req.flash('form_email', email); return res.redirect('/auth/register');
        } console.error("Registration Error:", error); next(error);
     }
 };

exports.auth_verifyOtp = async (req, res, next) => {
     const { email, otp } = req.body;
     if (req.session.user) { return res.redirect('/'); }
     if (!email || !otp) { req.flash('error_msg', 'Email and OTP required.'); return res.redirect(`/auth/verify-otp?email=${encodeURIComponent(email || '')}`); }
     try {
         const lowerCaseEmail = email.toLowerCase();
         const user = await User.findOne({ email: lowerCaseEmail, otp: otp.trim(), otpExpires: { $gt: Date.now() }, }).select('+password');
         if (!user) {
             const existingUser = await User.findOne({ email: lowerCaseEmail });
             let errorMessage = 'Invalid/expired OTP. Try again or resend.';
             if (existingUser?.isVerified) { errorMessage = 'Account verified. Please login.'; req.flash('error_msg', errorMessage); return res.redirect('/auth/login'); }
             if (!existingUser) { errorMessage = 'Verification failed. Account not found. Register again.'; req.flash('error_msg', errorMessage); return res.redirect('/auth/register'); }
             req.flash('error_msg', errorMessage); return res.redirect(`/auth/verify-otp?email=${encodeURIComponent(email)}`);
         }
         const isPasswordReset = user.resetPasswordToken && user.resetPasswordExpires > Date.now();
         user.isVerified = true; user.otp = undefined; user.otpExpires = undefined;
         if (isPasswordReset) {
             await user.save({ validateBeforeSave: false }); req.flash('success_msg', 'OTP Verified. Set your new password.');
             return res.redirect(`/auth/reset-password/${user.resetPasswordToken}`);
         } else {
             await user.save({ validateBeforeSave: false });
             req.session.regenerate(err => {
                 if (err) { console.error("Session regeneration error after OTP verify:", err); req.flash('error_msg', 'Verify success, auto-login fail. Login manually.'); return res.redirect('/auth/login'); }
                 req.session.user = { _id: user._id, name: user.name, email: user.email, role: user.role, address: user.address, cart: user.cart || [] };
                 req.session.save(err => {
                    if (err) { console.error("Session save error after OTP verify login:", err); req.flash('error_msg', 'Verify success, auto-login fail. Login manually.'); return res.redirect('/auth/login'); }
                    req.flash('success_msg', 'Email verified! Logged in.');
                    const returnTo = req.session.returnTo || '/'; delete req.session.returnTo; res.redirect(returnTo);
                  });
              });
          }
     } catch (error) { next(error); }
 };

exports.auth_resendOtp = async (req, res, next) => {
     const { email } = req.body;
     if (req.session.user) { return res.redirect('/'); }
     if (!email) { req.flash('error_msg', 'Email required.'); return res.redirect(`/auth/verify-otp?email=${encodeURIComponent(req.query.email || '')}`); }
     try {
         const lowerCaseEmail = email.toLowerCase();
         const user = await User.findOne({ email: lowerCaseEmail });
         if (!user) { console.log(`Resend OTP attempt non-existent email: ${lowerCaseEmail}`); req.flash('info_msg', 'If registered, new OTP sent.'); return res.redirect(`/auth/verify-otp?email=${encodeURIComponent(email)}`); }
         const isForReset = user.resetPasswordToken && user.resetPasswordExpires > Date.now();
         if(user.isVerified && !isForReset) { req.flash('error_msg', 'Account verified. Please login.'); return res.redirect('/auth/login'); }
         const otp = generateOTP(); const otpExpires = setOTPExpiration(10);
         user.otp = otp; user.otpExpires = otpExpires; await user.save({ validateBeforeSave: false });
         let subject, greeting, bodyLines; const textOtpLine = `Your OTP is: ${otp}. Expires in 10 minutes.`;
         if (isForReset) { subject = 'New Password Reset OTP'; greeting = 'Password Reset Request'; bodyLines = [`New OTP: <strong style="font-size:20px;">${otp}</strong>`, `Expires in 10 minutes.`]; }
         else { subject = 'New Verification OTP'; greeting = 'Verify Your Email'; bodyLines = [`New OTP: <strong style="font-size:20px;">${otp}</strong>`, `Expires in 10 minutes.`]; }
         const text = `${subject}\n${textOtpLine}\nIgnore if not requested.`;
         const html = generateEmailHtml({ recipientName: user.name, subject: subject, greeting: greeting, bodyLines: bodyLines, companyName: 'miniapp' });
         const emailSent = await sendEmail(user.email, subject, text, html);
         const redirectUrl = `/auth/verify-otp?email=${encodeURIComponent(user.email)}${isForReset ? '&reason=reset' : ''}`;
         if (emailSent) { req.flash('success_msg', `New OTP sent to ${user.email}.`); }
         else { console.error(`Failed to resend OTP email to ${user.email}`); req.flash('error_msg', 'Could not resend OTP email.'); }
         res.redirect(redirectUrl);
     } catch (error) { next(error); }
 };

exports.auth_loginUser = async (req, res, next) => {
      if (req.session.user) { return res.redirect('/'); }
      const { email, password } = req.body;
      if (!email || !password) { req.flash('error_msg', 'Email and password required.'); return res.render('auth/login', { title: 'Login', email: email }); }
      try {
          const lowerCaseEmail = email.toLowerCase();
          const user = await User.findOne({ email: lowerCaseEmail }).select('+password').populate('cart.productId', 'name price imageUrl');
          if (!user) { req.flash('error_msg', 'Invalid credentials.'); return res.render('auth/login', { title: 'Login', email: email }); }
          if (!user.isVerified) { req.flash('error_msg', 'Email not verified. Check inbox for OTP.'); return res.redirect(`/auth/verify-otp?email=${encodeURIComponent(user.email)}`); }
          const isMatch = await user.matchPassword(password);
          if (!isMatch) { req.flash('error_msg', 'Invalid credentials.'); return res.render('auth/login', { title: 'Login', email: email }); }
          req.session.regenerate(err => {
             if (err) { console.error("Session regeneration error during login:", err); req.flash('error_msg', 'Login failed: session error.'); return res.render('auth/login', { title: 'Login', email: email }); }
             req.session.user = { _id: user._id, name: user.name, email: user.email, role: user.role, address: user.address?.toObject(), cart: user.cart ? user.cart.map(item => ({ productId: item.productId?._id, quantity: item.quantity })) : [] };
             req.session.save(err => {
                  if (err) { console.error("Session save error after login:", err); req.flash('error_msg', 'Login ok, session save fail.'); return res.render('auth/login', { title: 'Login', email: email }); }
                  req.flash('success_msg', 'Login successful.');
                  const returnTo = req.session.returnTo || '/'; delete req.session.returnTo; res.redirect(returnTo);
             });
         });
     } catch (error) { next(error); }
 };

exports.auth_logoutUser = (req, res, next) => {
     const sessionUserEmail = req.session?.user?.email || 'User';
     req.flash('success_msg', 'Logout successful.');
     if (req.session) req.session.user = null;
     const cookieName = req.app.get('session cookie name') || 'connect.sid'; res.clearCookie(cookieName);
     console.log(`${sessionUserEmail} - Cleared session cookie: ${cookieName}`);
     if (req.session) {
         req.session.destroy(err => { console.log(`${sessionUserEmail} - Session destroyed ${err ? 'with error: ' + err : 'ok'}.`); });
     } else console.log(`${sessionUserEmail} - No active session found to destroy.`);
     res.redirect('/auth/login');
 };

exports.auth_forgotPassword = async (req, res, next) => {
      const { email } = req.body;
      if (!email) { req.flash('error_msg', 'Email required.'); return res.redirect('/auth/forgot-password'); }
      try {
          const lowerCaseEmail = email.toLowerCase(); const user = await User.findOne({ email: lowerCaseEmail });
          req.flash('info_msg', 'If account exists & verified, OTP sent.');
          if (!user || !user.isVerified) { console.log(`Pwd reset req for ${lowerCaseEmail}: User ${!user ? 'not found' : 'not verified'}.`); return res.redirect('/auth/forgot-password'); }
          const otp = generateOTP(); const resetToken = crypto.randomBytes(20).toString('hex');
          const otpExpires = setOTPExpiration(10); const resetExpires = setOTPExpiration(60);
          user.otp = otp; user.otpExpires = otpExpires; user.resetPasswordToken = resetToken; user.resetPasswordExpires = resetExpires;
          await user.save({ validateBeforeSave: false });
          const subject = 'Password Reset OTP - miniapp';
          const text = `Your password reset OTP is: ${otp}. Expires in 10 mins.`;
          const html = generateEmailHtml({ recipientName: user.name, subject: subject, greeting: 'Password Reset Request',
               bodyLines: [ `OTP to verify identity: <strong style="font-size: 20px;">${otp}</strong>`, `Valid for 10 minutes. Ignore if not requested.` ],
               companyName: 'miniapp' });
          const emailSent = await sendEmail(user.email, subject, text, html);
          if (emailSent) { console.log(`Password reset OTP sent to ${user.email}`); res.redirect(`/auth/verify-otp?email=${encodeURIComponent(user.email)}&reason=reset`); }
          else { console.error(`Failed sending reset OTP email to ${user.email}`); res.redirect('/auth/forgot-password'); }
      } catch (error) { console.error("Error in forgotPassword:", error); req.flash('error_msg', 'Request error. Try again.'); res.redirect('/auth/forgot-password'); }
 };

exports.auth_resetPassword = async (req, res, next) => {
     const { password, confirmPassword } = req.body; const token = req.params.token; let errors = [];
     if (!password || !confirmPassword) errors.push('Enter & confirm new password.');
     if (password !== confirmPassword) errors.push('Passwords do not match.');
     if (password && (password.length < minPasswordLength || !uppercaseRegex.test(password) || !lowercaseRegex.test(password) || !numberRegex.test(password) || !specialCharRegex.test(password))) {
          if (!errors.includes(passwordFormatErrorMsg)) errors.push(passwordFormatErrorMsg);
     }
     if (errors.length > 0) { req.flash('error_msg', errors.join(' ')); return res.redirect(`/auth/reset-password/${token}`); }
     try {
         const user = await User.findOne({ resetPasswordToken: token, resetPasswordExpires: { $gt: Date.now() } }).select('+password');
         if (!user) { req.flash('error_msg', 'Token invalid/expired. Request new link.'); return res.redirect('/auth/forgot-password'); }
         user.password = password; user.resetPasswordToken = undefined; user.resetPasswordExpires = undefined; user.otp = undefined; user.otpExpires = undefined; user.isVerified = true;
         await user.save();
         try { // Send confirmation email (optional)
              const subject = 'Password Reset Success - miniapp'; const text = `Your account password for ${user.email} changed. Contact support if not you.`;
              const html = generateEmailHtml({ recipientName: user.name, subject: subject, greeting: 'Password Reset Successful', bodyLines: [`Password changed for miniapp account.`, `Contact support if not you.`], companyName: 'miniapp', buttonUrl: `${req.protocol}://${req.get('host')}/auth/login`, buttonText: 'Login' });
              await sendEmail(user.email, subject, text, html);
         } catch (emailError) { console.error("Error sending password change email:", emailError); }
         req.session.regenerate(err => {
              if (err) { console.error("Session regen error after pwd reset:", err); req.flash('success_msg', 'Reset success. Login manually.'); return res.redirect('/auth/login'); }
              req.session.user = { _id: user._id, name: user.name, email: user.email, role: user.role, address: user.address?.toObject(), cart: [] };
              req.session.save(err => {
                  if(err) { console.error("Session save error after pwd reset:", err); req.flash('success_msg', 'Reset success. Login manually.'); return res.redirect('/auth/login'); }
                  req.flash('success_msg', 'Password reset. Logged in.'); res.redirect('/');
              });
          });
     } catch (error) {
          if (error.name === 'ValidationError') {
             let validationErrors = Object.values(error.errors).map(el => el.message);
             if (validationErrors.some(msg => msg.includes('Password must be at least'))) { if (!errors.includes(passwordFormatErrorMsg)) errors.push(passwordFormatErrorMsg); validationErrors = validationErrors.filter(msg => !msg.includes('Password must be at least')); }
             req.flash('error_msg', [...new Set([...errors, ...validationErrors])].join(' ')); return res.redirect(`/auth/reset-password/${token}`);
          } console.error("Reset Password Error:", error); next(error);
     }
 };

// ============================
// Admin Controller Functions
// ============================

exports.admin_getDashboard = (req, res) => {
    res.render('admin/dashboard', { title: 'Admin Dashboard' });
};

exports.admin_getUploadProductPage = (req, res) => {
    res.render('admin/upload-product', { title: 'Admin: Upload New Product', product: {}, categories: categories });
};

exports.admin_uploadProduct = async (req, res, next) => {
     const { name, category, price, stock, imageUrl, imageUrl2, specifications, shortDescription } = req.body;
     const adminUserId = req.session.user._id, adminUserEmail = req.session.user.email;
     const renderOptions = { title: 'Admin: Upload New Product', product: req.body, categories: categories };
     if (!name || !category || price === undefined || stock === undefined || !imageUrl) { req.flash('error_msg', 'Required: Name, Cat, Price, Stock, Image1.'); return res.render('admin/upload-product', renderOptions); }
     if (isNaN(Number(price)) || Number(price) < 0 || isNaN(Number(stock)) || Number(stock) < 0) { req.flash('error_msg', 'Price/Stock must be >= 0.'); return res.render('admin/upload-product', renderOptions); }
     if (!categoryNames.includes(category)) { req.flash('error_msg', 'Invalid category.'); return res.render('admin/upload-product', renderOptions); }
     try {
         const newProduct = new Product({ name: name.trim(), category: category.trim(), shortDescription: shortDescription?.trim(), price: Number(price), stock: Number(stock), imageUrl: imageUrl.trim(), imageUrl2: imageUrl2?.trim(), specifications: specifications?.trim(), sellerId: adminUserId, sellerEmail: adminUserEmail, reviewStatus: 'pending' });
         await newProduct.save(); console.log(`Product ${newProduct._id} saved initially by ADMIN ${adminUserEmail}.`);
         reviewProductWithGemini(newProduct).then(async reviewResult => {
             try {
                 const ptu = await Product.findById(newProduct._id); if (!ptu) return;
                 ptu.reviewStatus = reviewResult.status; ptu.rejectionReason = reviewResult.reason; await ptu.save();
                 console.log(`Product ${newProduct._id} (Admin Upload) review updated: ${reviewResult.status}.`);
             } catch (updateError) { console.error(`Error updating P.ID ${newProduct._id} (Admin) after Gemini review:`, updateError); }
         }).catch(reviewError => {
             console.error(`Error in Gemini chain for P.ID ${newProduct._id} (Admin):`, reviewError);
             Product.findByIdAndUpdate(newProduct._id, { reviewStatus: 'pending', rejectionReason: 'AI review process failed.' }, { new: false }).catch(err => console.error("Failed recovery mark admin-prod as pending:", err));
         });
         req.flash('success_msg', `Product "${newProduct.name}" uploaded, review pending.`); res.redirect('/admin/manage-products');
     } catch (error) {
        if (error.name === 'ValidationError') { req.flash('error_msg', `Validation Error: ${Object.values(error.errors).map(el => el.message).join(' ')}`); return res.render('admin/upload-product', renderOptions); }
        console.error("Error uploading product by Admin:", error); next(error);
     }
 };

exports.admin_getManageProductsPage = async (req, res, next) => {
    try {
        const products = await Product.find({}).populate('sellerId', 'name email').sort({ createdAt: -1 }).lean();
        res.render('admin/manage-products', { title: 'Manage All Products', products: products });
    } catch (error) { next(error); }
};

exports.admin_getEditProductPage = async (req, res, next) => {
    try {
        const product = await Product.findById(req.params.id).populate('sellerId', 'name email').lean();
        if (!product) { req.flash('error_msg', 'Product not found.'); return res.redirect('/admin/manage-products'); }
        res.render('admin/edit-product', { title: `Admin Edit: ${product.name}`, product: product, isAdminView: true, categories: categories });
    } catch (error) {
        if (error.name === 'CastError') { req.flash('error_msg', 'Invalid product ID.'); return res.redirect('/admin/manage-products'); }
        next(error);
    }
};

exports.admin_updateProduct = async (req, res, next) => {
     const productId = req.params.id;
     const { name, category, price, stock, imageUrl, imageUrl2, specifications, shortDescription, reviewStatus, rejectionReason } = req.body;
     let productDataForRender = { _id: productId, ...req.body }; // Default if product fetch fails
     const renderOptions = { title: 'Admin Edit Error', product: productDataForRender, isAdminView: true, categories: categories };
     if (!name || !category || price === undefined || stock === undefined || !imageUrl) { req.flash('error_msg', 'Required: Name, Cat, Price, Stock, Image1.'); return res.render('admin/edit-product', renderOptions); }
     if (isNaN(Number(price)) || Number(price) < 0 || isNaN(Number(stock)) || Number(stock) < 0) { req.flash('error_msg', 'Price/Stock must be >= 0.'); return res.render('admin/edit-product', renderOptions); }
     if (!categoryNames.includes(category)) { req.flash('error_msg', 'Invalid category.'); return res.render('admin/edit-product', renderOptions); }
     const allowedStatus = ['pending', 'approved', 'rejected'];
     if (reviewStatus && !allowedStatus.includes(reviewStatus)) { req.flash('error_msg', 'Invalid review status.'); return res.render('admin/edit-product', renderOptions); }
     if (reviewStatus === 'rejected' && !rejectionReason?.trim()) { req.flash('error_msg', 'Rejection reason required for status Rejected.'); return res.render('admin/edit-product', renderOptions); }
     try {
         const product = await Product.findById(productId);
         if (!product) { req.flash('error_msg', 'Product not found.'); return res.status(404).redirect('/admin/manage-products'); }
         product.name = name.trim(); product.category = category.trim(); product.shortDescription = shortDescription?.trim(); product.price = Number(price); product.stock = Number(stock); product.imageUrl = imageUrl.trim(); product.imageUrl2 = imageUrl2?.trim(); product.specifications = specifications?.trim();
         if (reviewStatus) { product.reviewStatus = reviewStatus; product.rejectionReason = (reviewStatus === 'rejected') ? rejectionReason.trim() : undefined; }
         await product.save(); req.flash('success_msg', `Product "${product.name}" updated by admin.`); res.redirect('/admin/manage-products');
     } catch (error) {
          productDataForRender = await Product.findById(productId).lean() || productDataForRender; // Try refetching on error
          renderOptions.product = { ...productDataForRender, ...req.body }; // Merge old + new attempts
          if (error.name === 'ValidationError') { req.flash('error_msg', `Validation Error: ${Object.values(error.errors).map(el => el.message).join(' ')}`); return res.render('admin/edit-product', renderOptions); }
          if (error.name === 'CastError') { req.flash('error_msg', 'Invalid product ID.'); return res.status(400).redirect('/admin/manage-products'); }
          console.error("Error updating product by Admin:", error); next(error);
     }
 };

exports.admin_removeProduct = async (req, res, next) => {
     const productId = req.params.id;
     try {
         const product = await Product.findByIdAndDelete(productId);
         if (!product) { req.flash('error_msg', 'Product not found.'); return res.status(404).redirect('/admin/manage-products'); }
         req.flash('success_msg', `Product "${product.name}" removed by admin.`); res.redirect('/admin/manage-products');
     } catch (error) {
         if (error.name === 'CastError') { req.flash('error_msg', 'Invalid product ID.'); return res.status(400).redirect('/admin/manage-products'); }
         console.error("Error removing product by Admin:", error); next(error);
     }
 };

exports.admin_getManageOrdersPage = async (req, res, next) => {
     try {
         const orders = await Order.find({}) .sort({ orderDate: -1 }).select('-__v -products.__v -shippingAddress._id').populate('products.productId', 'name imageUrl _id price sellerId').populate('userId', 'name email').lean();
         const now = Date.now();
         orders.forEach(order => {
             order.canBeCancelledByAdmin = order.status === 'Pending'; order.canBeDirectlyDeliveredByAdmin = order.status === 'Pending';
             order.showDeliveryOtp = order.status === 'Pending' && !!order.orderOTP && !!order.orderOTPExpires && new Date(order.orderOTPExpires).getTime() > now;
             if (order.products?.length > 0) {
                 order.itemsSummary = order.products.map(p => `${p.productId?.name || p.name || '[?Name?]'} (Qty: ${p.quantity}) @ ₹${p.priceAtOrder?.toFixed(2) || '?.??'}`).join('<br>');
             } else order.itemsSummary = 'No items found';
         });
         res.render('admin/manage-orders', { title: 'Manage All Orders', orders: orders, cancellationReasons: adminCancellationReasons });
     } catch (error) { next(error); }
 };

exports.admin_sendDirectDeliveryOtpByAdmin = async (req, res, next) => {
     try {
         const result = await this.order_generateAndSendDirectDeliveryOTPByAdmin(req.params.orderId);
         req.flash('success_msg', result.message + ' Ask customer for OTP.');
     } catch (error) { req.flash('error_msg', `Admin OTP Send Failed: ${error.message}`); }
     res.redirect('/admin/manage-orders');
 };

exports.admin_confirmDirectDeliveryByAdmin = async (req, res, next) => {
     const { otp } = req.body;
     if (!otp || !/^\d{6}$/.test(otp.trim())) { req.flash('error_msg', 'Enter 6-digit OTP.'); return res.redirect('/admin/manage-orders'); }
     try {
         const { order } = await this.order_confirmDirectDeliveryByAdmin(req.params.orderId, req.session.user._id, otp.trim(), res);
         req.flash('success_msg', `Order ${req.params.orderId} confirmed delivered by Admin.`);
     } catch (error) { req.flash('error_msg', `Admin Delivery Confirm Failed: ${error.message}`); }
     res.redirect('/admin/manage-orders');
 };

exports.admin_cancelOrderByAdmin = async (req, res, next) => {
     const { orderId } = req.params; const { reason } = req.body; const adminUserId = req.session.user._id;
     if (!reason || !adminCancellationReasons.includes(reason)) { req.flash('error_msg', 'Select valid admin reason.'); return res.redirect('/admin/manage-orders'); }
     const sessionDB = await mongoose.startSession(); sessionDB.startTransaction();
     try {
         const order = await Order.findById(orderId).populate('products.productId', 'name _id').populate('userId', 'email name').session(sessionDB);
         if (!order) { await sessionDB.abortTransaction(); sessionDB.endSession(); req.flash('error_msg', 'Order not found.'); return res.status(404).redirect('/admin/manage-orders'); }
         if (order.status !== 'Pending') { await sessionDB.abortTransaction(); sessionDB.endSession(); req.flash('error_msg', `Order is '${order.status}'. Cannot cancel.`); return res.redirect('/admin/manage-orders'); }
         const restorePromises = order.products.map(item => {
             const qty = Number(item.quantity); if (!item.productId?._id || isNaN(qty) || qty <= 0) { console.warn(`Admin Cancel: Invalid item ${item.productId?._id}/Qty ${item.quantity} O.ID ${orderId}.`); return Promise.resolve(); }
             return Product.updateOne({ _id: item.productId._id }, { $inc: { stock: qty, orderCount: -1 } }, { session: sessionDB }).catch(err => console.error(`Admin Cancel: Fail stock P.ID ${item.productId._id} O.ID ${orderId}: ${err.message}`));
         });
         await Promise.allSettled(restorePromises);
         order.status = 'Cancelled'; order.cancellationReason = reason; await order.save({ session: sessionDB }); await sessionDB.commitTransaction();
         try { // Send email
              const customerEmail = order.userEmail || order.userId?.email; const customerName = order.shippingAddress.name || order.userId?.name || 'Customer';
              if(customerEmail) {
                  const subject = `Order Cancelled - miniapp`; const text = `Your order (${order._id}) cancelled by admin. Reason: ${reason}.`;
                  const html = generateEmailHtml({ recipientName: customerName, subject: subject, greeting: `Regarding Order #${order._id}`,
                      bodyLines: [`Order (#${order._id}) cancelled by admin.`, `<strong>Reason:</strong> ${reason}`, `Refund processed if applicable.`, `Contact support if needed.`],
                      buttonUrl: `${req.protocol}://${req.get('host')}/orders/my-orders`, buttonText: 'My Orders', companyName: 'miniapp' });
                  await sendEmail(customerEmail, subject, text, html);
              }
         } catch (emailError) { console.error(`Failed cancel email O.ID ${order._id}:`, emailError); }
         req.flash('success_msg', `Order ${orderId} cancelled by admin. Reason: ${reason}.`); res.redirect('/admin/manage-orders');
     } catch (error) {
         await sessionDB.abortTransaction(); console.error(`Error admin cancelling O.ID ${orderId}:`, error); req.flash('error_msg', 'Internal cancel error.'); res.redirect('/admin/manage-orders');
     } finally { if (sessionDB) sessionDB.endSession(); }
 };

exports.admin_getManageUsersPage = async (req, res, next) => {
     try {
         const users = await User.find({ _id: { $ne: req.session.user._id } }).select('name email role createdAt isVerified address.phone').sort({ createdAt: -1 }).lean();
         res.render('admin/manage-users', { title: 'Manage Registered Users', users: users });
     } catch (error) { next(error); }
 };

exports.admin_updateUserRole = async (req, res, next) => {
      const userId = req.params.id; const { role } = req.body; const allowedRoles = ['user', 'admin', 'seller'];
      if (!role || !allowedRoles.includes(role)) { req.flash('error_msg', 'Invalid role.'); return res.status(400).redirect('/admin/manage-users'); }
      if (userId === req.session.user._id.toString()) { req.flash('error_msg', 'Cannot change own role.'); return res.redirect('/admin/manage-users'); }
      try {
          const user = await User.findById(userId); if (!user) { req.flash('error_msg', 'User not found.'); return res.status(404).redirect('/admin/manage-users'); }
          user.role = role; await user.save(); req.flash('success_msg', `User ${user.email} role -> ${role}.`); res.redirect('/admin/manage-users');
      } catch (error) {
          if (error.name === 'CastError') { req.flash('error_msg', 'Invalid user ID.'); return res.status(400).redirect('/admin/manage-users'); }
          console.error(`Error updating role user ${userId}:`, error); req.flash('error_msg', 'Error updating role.'); res.redirect('/admin/manage-users');
      }
  };

exports.admin_removeUser = async (req, res, next) => {
      const userId = req.params.id;
      if (userId === req.session.user._id.toString()) { req.flash('error_msg', 'Cannot remove self.'); return res.redirect('/admin/manage-users'); }
      try {
          const user = await User.findById(userId); if (!user) { req.flash('error_msg', 'User not found.'); return res.status(404).redirect('/admin/manage-users'); }
          if (user.role === 'admin') { const adminCount = await User.countDocuments({ role: 'admin' }); if (adminCount <= 1) { req.flash('error_msg', 'Cannot remove last admin.'); return res.redirect('/admin/manage-users'); } }
          await User.deleteOne({ _id: userId }); req.flash('success_msg', `User ${user.email} removed.`); res.redirect('/admin/manage-users');
      } catch (error) {
          if (error.name === 'CastError') { req.flash('error_msg', 'Invalid user ID.'); return res.status(400).redirect('/admin/manage-users'); }
          console.error(`Error removing user ${userId}:`, error); req.flash('error_msg', 'Error removing user.'); res.redirect('/admin/manage-users');
      }
  };

exports.admin_getManageBannersPage = async (req, res, next) => {
    try {
        let bannerConfig = await BannerConfig.findOne({ configKey: 'mainBanners' }).lean() || { configKey: 'mainBanners', banners: [] };
        const displayBanners = Array.from({ length: 4 }).map((_, i) => bannerConfig.banners[i] || { imageUrl: '', linkUrl: '', title: '' });
        res.render('admin/manage-banners', { title: 'Manage Homepage Banners', bannerConfig: { ...bannerConfig, banners: displayBanners } });
    } catch (error) { console.error("Error fetching banner config:", error); next(error); }
};

exports.admin_updateBanners = async (req, res, next) => {
    const { imageUrl1, linkUrl1, title1, imageUrl2, linkUrl2, title2, imageUrl3, linkUrl3, title3, imageUrl4, linkUrl4, title4 } = req.body;
    const bannerInputs = [ { imageUrl: imageUrl1, linkUrl: linkUrl1, title: title1 }, { imageUrl: imageUrl2, linkUrl: linkUrl2, title: title2 }, { imageUrl: imageUrl3, linkUrl: linkUrl3, title: title3 }, { imageUrl: imageUrl4, linkUrl: linkUrl4, title: title4 } ];
    const urlPattern = /^https?:\/\/.+/; let validationError = false; const newBanners = [];
    for (let i = 0; i < bannerInputs.length; i++) {
        const { imageUrl, linkUrl, title } = bannerInputs[i]; const imgUrl = imageUrl?.trim(); const lnkUrl = linkUrl?.trim(); const ttl = title?.trim();
        if (imgUrl) {
            if (!urlPattern.test(imgUrl)) { req.flash('error_msg', `Banner ${i+1}: Invalid Image URL.`); validationError = true; }
            if (lnkUrl && !urlPattern.test(lnkUrl)) { req.flash('error_msg', `Banner ${i+1}: Invalid Link URL.`); validationError = true; }
            if (!validationError) newBanners.push({ imageUrl: imgUrl, linkUrl: lnkUrl || undefined, title: ttl || undefined });
        } else if (lnkUrl || ttl) { req.flash('error_msg', `Banner ${i+1}: Image URL required if Link or Title provided.`); validationError = true; }
    }
    if (validationError) {
        const displayBannersForError = Array.from({ length: 4 }).map((_, i) => bannerInputs[i]);
        return res.render('admin/manage-banners', { title: 'Manage Homepage Banners', bannerConfig: { banners: displayBannersForError } });
    }
    try {
        await BannerConfig.findOneAndUpdate( { configKey: 'mainBanners' }, { banners: newBanners, lastUpdatedBy: req.session.user._id }, { new: true, upsert: true, runValidators: true } );
        req.flash('success_msg', 'Homepage banners updated.'); res.redirect('/admin/manage-banners');
    } catch (error) {
        if (error.name === 'ValidationError') { req.flash('error_msg', `Validation Error: ${Object.values(error.errors).map(el => el.message).join(', ')}`); const displayBannersForError = Array.from({ length: 4 }).map((_, i) => bannerInputs[i]); return res.render('admin/manage-banners', { title: 'Manage Homepage Banners', bannerConfig: { banners: displayBannersForError } }); }
        console.error("Error updating banners:", error); req.flash('error_msg', 'Failed update banners (server error).'); res.redirect('/admin/manage-banners');
    }
};

// ============================
// Order Controller Functions (called internally or by other controllers)
// ============================
exports.order_placeOrder = async (req, res, next) => {
     const userId = req.session.user._id; const sessionDB = await mongoose.startSession(); sessionDB.startTransaction({ readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
     try {
         const user = await User.findById(userId).populate('cart.productId', 'name price imageUrl stock reviewStatus sellerId').session(sessionDB);
         if (!user) { await sessionDB.abortTransaction(); sessionDB.endSession(); req.flash('error_msg', 'User session lost. Login.'); return res.redirect('/auth/login'); }
         if (!user.cart || user.cart.length === 0) { await sessionDB.abortTransaction(); sessionDB.endSession(); req.flash('error_msg', 'Cart is empty.'); return res.redirect('/user/cart'); }
         if (!user.address?.name || !user.address.phone || !user.address.pincode || !user.address.cityVillage || !user.address.locality) { await sessionDB.abortTransaction(); sessionDB.endSession(); req.flash('error_msg', 'Shipping address incomplete.'); return res.redirect('/user/checkout'); }
         let orderProducts = []; let totalAmount = 0; const stockUpdates = []; let validationFailed = false; let validationMessage = 'Cart issue, review & try again.'; const itemsToRemove = [];
         for (const item of user.cart) {
             const qty = Number(item.quantity);
             if (isNaN(qty) || !Number.isInteger(qty) || qty <= 0) { validationMessage = 'Invalid quantity removed.'; itemsToRemove.push(item._id); validationFailed = true; continue; }
             if (!item.productId?._id) { validationMessage = 'Invalid product removed.'; itemsToRemove.push(item._id); validationFailed = true; continue; }
             const product = item.productId;
             if (product.reviewStatus !== 'approved') { validationMessage = `"${product.name}" unavailable, removed.`; itemsToRemove.push(item._id); validationFailed = true; continue; }
             if (product.stock < qty) { validationMessage = `Insufficient stock: "${product.name}" (Available: ${product.stock}). Update qty.`; validationFailed = true; break; }
             orderProducts.push({ productId: product._id, name: product.name, priceAtOrder: product.price, quantity: qty, imageUrl: product.imageUrl, sellerId: product.sellerId });
             totalAmount += product.price * qty; stockUpdates.push({ productId: product._id, qtyDecr: qty });
         }
         if (validationFailed) {
             if (itemsToRemove.length > 0) { await User.updateOne({ _id: userId }, { $pull: { cart: { _id: { $in: itemsToRemove } } } }).session(sessionDB); console.log(`Removed ${itemsToRemove.length} invalid items from cart user ${userId}`); }
             await sessionDB.abortTransaction(); sessionDB.endSession();
             const updatedUser = await User.findById(userId).select('cart').populate('cart.productId').lean(); req.session.user.cart = updatedUser ? updatedUser.cart.filter(i => i.productId).map(i => ({ productId: i.productId._id, quantity: i.quantity })) : []; await req.session.save();
             req.flash('error_msg', validationMessage); return res.redirect('/user/cart');
         }
         for (const update of stockUpdates) {
             const result = await Product.updateOne({ _id: update.productId, stock: { $gte: update.qtyDecr } }, { $inc: { stock: -update.qtyDecr, orderCount: 1 } }, { session: sessionDB });
             if (result.modifiedCount === 0) { await sessionDB.abortTransaction(); sessionDB.endSession(); req.flash('error_msg', `Checkout failed: Stock changed. Try again.`); return res.redirect('/user/cart'); }
         }
         const order = new Order({ userId: userId, userEmail: user.email, products: orderProducts, totalAmount: totalAmount, shippingAddress: user.address, paymentMethod: 'COD', status: 'Pending' });
         await order.save({ session: sessionDB }); user.cart = []; await user.save({ session: sessionDB }); await sessionDB.commitTransaction(); req.session.user.cart = []; await req.session.save();
         try { // Send confirmation email
              const subject = `Order Placed - miniapp`; const text = `Thank you for your order!`;
              const prodListHTML = order.products.map(p => `<li>${p.name} (Qty: ${p.quantity}) - ₹${p.priceAtOrder.toFixed(2)}</li>`).join('');
              const html = generateEmailHtml({ recipientName: user.name, subject: subject, greeting: `Order Confirmation #${order._id}`,
                   bodyLines: [`Order placed successfully.`, `<strong>ID:</strong> ${order._id}`, `<strong>Total:</strong> ₹${order.totalAmount.toFixed(2)}`, `<strong>Shipping To:</strong> ${order.shippingAddress.name}, ${order.shippingAddress.locality}, ${order.shippingAddress.pincode}`, `<h3 style="margin-top:15px;">Summary:</h3><ul>${prodListHTML}</ul>` ],
                   buttonUrl: `${req.protocol}://${req.get('host')}/orders/my-orders`, buttonText: 'View Order Status', companyName: 'miniapp' });
              await sendEmail(user.email, subject, text, html);
         } catch (emailError) { console.error(`Failed sending order confirm email O.ID ${order._id}:`, emailError); }
         req.flash('success_msg', 'Order placed successfully!'); res.redirect('/orders/my-orders');
     } catch (error) {
         if (sessionDB.inTransaction()) await sessionDB.abortTransaction(); console.error("Order Placement Error:", error);
         let userErrorMessage = 'Order failed: server error. Try again.'; if (error.message?.includes('Stock changed')) userErrorMessage = error.message;
         req.flash('error_msg', userErrorMessage); res.redirect('/user/cart');
     } finally { if (sessionDB) await sessionDB.endSession(); }
 };

exports.order_cancelOrder = async (req, res, next) => { // User cancellation
     const orderId = req.params.id; const userId = req.session.user._id; const sessionDB = await mongoose.startSession(); sessionDB.startTransaction({ writeConcern: { w: 'majority' }});
     try {
         const order = await Order.findOne({ _id: orderId, userId: userId, status: 'Pending', cancellationAllowedUntil: { $gt: Date.now() } }).populate('products.productId', '_id name').populate('userId', 'name').session(sessionDB);
         if (!order) { await sessionDB.abortTransaction(); sessionDB.endSession(); req.flash('error_msg', 'Order not found, processed, or cancel period expired.'); return res.redirect('/orders/my-orders'); }
         console.log(`User Cancel: Restore stock O.ID ${orderId}.`);
         const restorePromises = order.products.map(item => {
             const qty = Number(item.quantity); if (!item.productId?._id || isNaN(qty) || qty <= 0) { console.warn(`User Cancel: Invalid item ${item.productId?._id}/Qty ${item.quantity} O.ID ${orderId}.`); return Promise.resolve(); }
             return Product.updateOne({ _id: item.productId._id }, { $inc: { stock: qty, orderCount: -1 } }, { session: sessionDB }).catch(err => console.error(`User Cancel: Fail stock P.ID ${item.productId._id} O.ID ${orderId}: ${err.message}`));
         });
         await Promise.allSettled(restorePromises); console.log(`User Cancel: Stock restore complete O.ID ${orderId}.`);
         order.status = 'Cancelled'; order.cancellationReason = "Cancelled by customer"; await order.save({ session: sessionDB }); await sessionDB.commitTransaction();
         try { // Send cancellation email
              const subject = `Order Cancelled - miniapp`; const text = `Refund processed if applicable.`;
              const html = generateEmailHtml({ recipientName: order.userId?.name || req.session.user.name, subject: subject, greeting: 'Order Cancellation Confirmation', bodyLines: [`Order (#${order._id}) cancelled per request.`, `Refund processed if applicable.`, `Hope to serve you soon!` ], buttonUrl: `${req.protocol}://${req.get('host')}/`, buttonText: 'Continue Shopping', companyName: 'miniapp' });
             await sendEmail(order.userEmail, subject, text, html);
          } catch (emailError){ console.error(`Failed sending cancel confirm email O.ID ${order._id}:`, emailError); }
         req.flash('success_msg', 'Order cancelled successfully.'); res.redirect('/orders/my-orders');
     } catch (error) {
          if (sessionDB.inTransaction()) await sessionDB.abortTransaction(); console.error("User Order Cancellation Error:", error); req.flash('error_msg', 'Failed to cancel order (internal error).'); res.redirect('/orders/my-orders');
     } finally { if (sessionDB) await sessionDB.endSession(); }
 };

exports.order_getMyOrders = async (req, res, next) => {
     try {
         const orders = await Order.find({ userId: req.session.user._id }).select('-__v').sort({ orderDate: -1 }).populate('products.productId', 'name imageUrl _id price').lean();
         const now = Date.now();
         orders.forEach(order => {
             order.isCancellable = order.status === 'Pending' && order.cancellationAllowedUntil && now < new Date(order.cancellationAllowedUntil).getTime();
             order.showDeliveryOtp = order.status === 'Pending' && !!order.orderOTP && !!order.orderOTPExpires && new Date(order.orderOTPExpires).getTime() > now;
         });
         res.render('user/my-orders', { title: 'My Orders', orders: orders });
     } catch (error) { console.error("Error fetching user orders:", error); next(error); }
 };

exports.order_generateAndSendDirectDeliveryOTPByAdmin = async (orderId) => { // Internal function for Admin Controller
    try {
        const order = await Order.findById(orderId); if (!order) throw new Error('Order not found.'); if (order.status !== 'Pending') throw new Error(`OTP only for 'Pending' status (is ${order.status}).`);
        const otp = generateOTP(); const otpExpires = setOTPExpiration(5); order.orderOTP = otp; order.orderOTPExpires = otpExpires; await order.save();
        const user = await User.findById(order.userId).select('email');
        console.log(`ADMIN generated OTP for O.ID ${orderId}: ${otp} (User: ${user?.email || '[NA]'}).`);
        return { success: true, message: `OTP generated for order ${orderId}.` };
    } catch (error) { console.error(`Admin OTP Gen Error O.ID ${orderId}:`, error); throw error; }
};

exports.order_generateAndSendDirectDeliveryOTPBySeller = async (orderId, sellerId) => { // Internal function for Seller Controller
    try {
        const order = await Order.findById(orderId).populate('products.productId', 'sellerId');
        if (!order) throw new Error('Order not found.'); if (order.status !== 'Pending') throw new Error(`OTP only for 'Pending' status (is ${order.status}).`);
        if (!order.products.some(p => p.productId?.sellerId?.toString() === sellerId.toString())) throw new Error('Permission Denied: Order irrelevant.');
        const otp = generateOTP(); const otpExpires = setOTPExpiration(5); order.orderOTP = otp; order.orderOTPExpires = otpExpires; await order.save();
        const user = await User.findById(order.userId).select('email');
        console.log(`SELLER (${sellerId}) generated OTP O.ID ${orderId}: ${otp} (User: ${user?.email || '[NA]'}).`);
        return { success: true, message: `OTP generated for order ${orderId}.` };
    } catch (error) { console.error(`Seller OTP Gen Error O.ID ${orderId} by Seller ${sellerId}:`, error); throw error; }
};

exports.order_confirmDirectDeliveryByAdmin = async (orderId, adminUserId, providedOtp, resForHelper = null) => { // Internal for Admin Controller
     try {
         const order = await Order.findOne({ _id: orderId, status: 'Pending', orderOTP: providedOtp, orderOTPExpires: { $gt: Date.now() } });
         if (!order) { const check = await Order.findById(orderId).select('status orderOTP orderOTPExpires'); if (!check) throw new Error('Order not found.'); if (check.status !== 'Pending') throw new Error(`Order is ${check.status}.`); if (check.orderOTP !== providedOtp) throw new Error('Invalid OTP.'); if (!check.orderOTPExpires || check.orderOTPExpires <= Date.now()) throw new Error('Expired OTP.'); throw new Error('OTP verify failed.'); }
         order.status = 'Delivered'; order.receivedByDate = new Date(); order.orderOTP = undefined; order.orderOTPExpires = undefined; order.cancellationAllowedUntil = undefined; await order.save();
         console.log(`O.ID ${orderId} confirmed delivered by ADMIN ${adminUserId}`);
         try { // Send confirm email
            const subject = `Order Delivered - miniapp!`; const deliveredDate = resForHelper?.locals?.formatDateIST(order.receivedByDate) || new Date(order.receivedByDate).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
            const text = `Order ${order._id} delivered on ${deliveredDate}. Confirmed by Admin.`;
            const html = generateEmailHtml({ recipientName: order.shippingAddress.name, subject: subject, greeting: `Order Delivered!`, bodyLines: [`Order #${order._id} delivered.`, `<strong>Delivered On:</strong> ${deliveredDate}. Confirmed by admin.`], buttonUrl: `${resForHelper?.req?.protocol || 'http'}://${resForHelper?.req?.get('host') || 'localhost'}/orders/my-orders`, buttonText: 'View Order Details', companyName: 'miniapp' });
            await sendEmail(order.userEmail, subject, text, html);
         } catch (emailError){ console.error(`Admin Confirm: Fail send email O.ID ${order._id}:`, emailError); }
         return { success: true, order: order };
     } catch (error) { console.error(`Admin Confirm OTP Error O.ID ${orderId} by Admin ${adminUserId}:`, error); throw error; }
  };

exports.order_confirmDirectDeliveryBySeller = async (orderId, sellerId, providedOtp, resForHelper = null) => { // Internal for Seller Controller
     try {
         const order = await Order.findOne({ _id: orderId, status: 'Pending', orderOTP: providedOtp, orderOTPExpires: { $gt: Date.now() } }).populate('products.productId', 'sellerId');
         if (!order) { const check = await Order.findById(orderId).select('status orderOTP orderOTPExpires'); if (!check) throw new Error('Order not found.'); if (check.status !== 'Pending') throw new Error(`Order is ${check.status}.`); if (check.orderOTP !== providedOtp) throw new Error('Invalid OTP.'); if (!check.orderOTPExpires || check.orderOTPExpires <= Date.now()) throw new Error('Expired OTP.'); throw new Error('OTP verify failed.'); }
         if (!order.products.some(p => p.productId?.sellerId?.toString() === sellerId.toString())) { console.warn(`Seller ${sellerId} attempt confirm unrelated O.ID ${orderId}.`); throw new Error('Permission Denied: Irrelevant order.'); }
         order.status = 'Delivered'; order.receivedByDate = new Date(); order.orderOTP = undefined; order.orderOTPExpires = undefined; order.cancellationAllowedUntil = undefined; await order.save();
         console.log(`O.ID ${orderId} confirmed delivered by SELLER ${sellerId}`);
         try { // Send confirm email
            const subject = `Order Delivered - miniapp`; const deliveredDate = resForHelper?.locals?.formatDateIST(order.receivedByDate) || new Date(order.receivedByDate).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
            const text = `Order ${order._id} delivered on ${deliveredDate}. Confirmed by Seller.`;
            const html = generateEmailHtml({ recipientName: order.shippingAddress.name, subject: subject, greeting: `Order Delivered!`, bodyLines: [`Order #${order._id} delivered.`, `<strong>Delivered On:</strong> ${deliveredDate}. Confirmed by seller.`], buttonUrl: `${resForHelper?.req?.protocol || 'http'}://${resForHelper?.req?.get('host') || 'localhost'}/orders/my-orders`, buttonText: 'View Order Details', companyName: 'miniapp' });
            await sendEmail(order.userEmail, subject, text, html);
         } catch (emailError){ console.error(`Seller Confirm: Fail send email O.ID ${order._id}:`, emailError); }
         return { success: true, order: order };
     } catch (error) { console.error(`Seller Confirm OTP Error O.ID ${orderId} by Seller ${sellerId}:`, error); throw error; }
 };

// ============================
// Product Controller Functions
// ============================
const escapeRegex = (string) => string.replace(/[-\[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

exports.product_getProducts = async (req, res, next) => { // Also used by home page, indirectly via search/filter
  try {
    const searchTerm = req.query.search || ''; const categoryFilter = req.query.category || '';
    let query = { reviewStatus: 'approved', stock: { $gt: 0 } }; let sort = { createdAt: -1 }; const projection = {};
    if (searchTerm) { const regex = new RegExp(escapeRegex(searchTerm), 'i'); query.$or = [ { name: regex }, { category: regex } ]; console.log(`Regex Search Query: ${JSON.stringify(query)}`); }
    else if (categoryFilter && categoryNames.includes(categoryFilter)) { query.category = categoryFilter; }
    else if (categoryFilter) { console.warn(`Invalid cat filter on /products: ${categoryFilter}`); }
    const products = await Product.find(query, projection).sort(sort).lean();
    let pageTitle = 'Products';
    if (searchTerm) pageTitle = `Search: "${searchTerm}"`;
    else if (categoryFilter && categoryNames.includes(categoryFilter)) pageTitle = `Category: ${categoryFilter}`;
    res.render('products/index', { title: pageTitle, products: products, searchTerm: searchTerm, selectedCategory: categoryFilter, displayCategories: categories });
  } catch (error) { console.error("Error fetching products:", error); next(error); }
};

exports.product_getProductDetails = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id).populate('sellerId', 'name email').lean();
    if (!product) { const err = new Error('Product not found'); err.status = 404; return next(err); }
    const isApproved = product.reviewStatus === 'approved'; const user = req.session.user;
    const isAdmin = user?.role === 'admin'; const isOwner = user && product.sellerId?._id && user._id.toString() === product.sellerId._id.toString();
    if (!isApproved && !isAdmin && !isOwner) { const err = new Error('Product unavailable'); err.status = 404; return next(err); }
    let userRating = null; if (user) userRating = product.ratings?.find(r => r.userId?.toString() === user._id.toString())?.rating || null;
    const ratingCounts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }; let totalRatings = 0;
    if (product.ratings?.length > 0) { totalRatings = product.ratings.length; product.ratings.forEach(r => { if (r.rating && ratingCounts[r.rating] !== undefined) ratingCounts[r.rating]++; }); }
    res.render('products/detail', { title: product.name, product: product, isApproved: isApproved, isAdminView: isAdmin, isOwnerView: isOwner, userRating: userRating, userCanRate: !!user, ratingCounts: ratingCounts, totalRatings: product.numReviews || totalRatings });
  } catch (error) { if (error.name === 'CastError') { const err = new Error('Invalid Product ID'); err.status = 404; return next(err); } next(error); }
};

exports.product_rateProduct = async (req, res, next) => {
     const { rating } = req.body; const productId = req.params.id; const userId = req.session.user._id;
     if (!rating || isNaN(Number(rating)) || rating < 1 || rating > 5) { req.flash('error_msg', 'Valid rating 1-5 required.'); return res.redirect('back'); }
     try {
         const product = await Product.findById(productId); if (!product) { req.flash('error_msg', 'Product not found.'); return res.status(404).redirect('/'); }
         const existingIndex = product.ratings.findIndex(r => r.userId?.toString() === userId.toString());
         if (existingIndex > -1) product.ratings[existingIndex].rating = Number(rating);
         else product.ratings.push({ userId, rating: Number(rating) });
         await product.save(); req.flash('success_msg', 'Rating submitted!'); res.redirect(`/products/${productId}`);
     } catch (error) { if (error.name === 'CastError') { req.flash('error_msg', 'Invalid product ID.'); return res.status(400).redirect('/'); } console.error("Error rating product:", error); next(error); }
 };

exports.product_getProductSuggestions = async (req, res, next) => {
     const searchTerm = req.query.q; const limit = 8;
     if (!searchTerm || searchTerm.trim().length < 2) return res.json([]);
     try {
         const regex = new RegExp(escapeRegex(searchTerm), 'i');
         const query = { $or: [ { name: regex }, { category: regex } ], reviewStatus: 'approved', stock: { $gt: 0 } };
         const suggestions = await Product.find(query).select('_id name imageUrl').limit(limit).sort({ name: 1 }).lean();
         res.json(suggestions);
     } catch (error) { console.error("Error fetching suggestions:", error); res.status(500).json({ error: 'Failed to fetch' }); }
 };

// ============================
// User Controller Functions
// ============================
exports.user_getUserProfilePage = async (req, res, next) => {
    try {
        const user = await User.findById(req.session.user._id).select('name email role address createdAt').lean();
        if (!user) { console.warn(`User not in DB, active session: ${req.session.user._id}`); req.flash('error_msg', 'Invalid session. Login.'); return req.session.destroy(() => res.redirect('/auth/login')); }
        res.render('user/profile', { title: 'My Profile', user: user });
    } catch (error) { next(error); }
};

exports.user_updateUserName = async (req, res, next) => {
     const { name } = req.body; const userId = req.session.user._id;
     if (!name || typeof name !== 'string' || name.trim().length < 2) { req.flash('error_msg', 'Valid name >= 2 chars required.'); return res.redirect('/user/profile'); }
     try {
         const user = await User.findById(userId); if (!user) { req.flash('error_msg', 'User not found. Login.'); return res.redirect('/auth/login'); }
         user.name = name.trim(); await user.save(); req.session.user.name = user.name; await req.session.save();
         req.flash('success_msg', 'Name updated.'); res.redirect('/user/profile');
     } catch (error) {
         if (error.name === 'ValidationError') { req.flash('error_msg', `Validation: ${Object.values(error.errors).map(el => el.message).join(' ')}`); return res.redirect('/user/profile'); }
         console.error("Error updating name:", error); next(error);
     }
 };

exports.user_saveAddress = async (req, res, next) => {
     const { name, phone, pincode, locality, cityVillage, landmarkNearby, source, state, district, mandal } = req.body; const userId = req.session.user._id;
     const redirectPath = (source === 'profile') ? '/user/profile' : '/user/checkout';
     let errors = [];
     if (!name || !phone || !pincode || !locality || !cityVillage) errors.push('Req: Name, Phone, Pincode, Locality, House/Area.');
     if (phone && !/^\d{10,15}$/.test(phone.trim())) errors.push('Valid Phone (10-15 digits).');
     if (pincode && !/^\d{6}$/.test(pincode.trim())) errors.push('Valid 6-digit Pincode.');
     if (!state || !district || !mandal) errors.push('State/Dist/Mandal unknown. Verify Pincode.');
     if (state && !locality?.trim()) errors.push('Select Locality after entering Pincode.');
     if (errors.length > 0) { req.flash('error_msg', errors.join(' ')); req.session.addressFormData = req.body; return res.redirect(redirectPath); }
     try {
         const user = await User.findById(userId); if (!user) { req.flash('error_msg', 'User not found.'); delete req.session.addressFormData; return res.redirect('/auth/login'); }
         user.address = { name: name.trim(), phone: phone.trim(), pincode: pincode.trim(), locality: locality.trim(), cityVillage: cityVillage.trim(), landmarkNearby: landmarkNearby?.trim(), mandal: mandal?.trim(), district: district?.trim(), state: state?.trim() };
         await user.save(); req.session.user.address = user.address.toObject(); await req.session.save(); delete req.session.addressFormData;
         req.flash('success_msg', 'Address saved.'); res.redirect(redirectPath);
     } catch (error) {
         delete req.session.addressFormData;
         if (error.name === 'ValidationError') { let valErrors = Object.values(error.errors).map(el => el.message); if (!state || !district || !mandal || !locality) valErrors.unshift('Pincode/Locality missing.'); req.flash('error_msg', `Validation: ${valErrors.join(' ')}`); req.session.addressFormData = req.body; return res.redirect(redirectPath); }
         next(error);
     }
 };

exports.user_getCart = async (req, res, next) => {
     try {
         const user = await User.findById(req.session.user._id).populate('cart.productId', 'name price imageUrl stock _id reviewStatus').lean();
         if (!user) { console.warn(`User not found getCart: ${req.session.user._id}`); req.flash('error_msg', 'User not found.'); return req.session.destroy(() => res.redirect('/auth/login')); }
         let cartTotal = 0; let populatedCart = []; let cartUpdated = false;
         if (user.cart?.length > 0) {
              populatedCart = user.cart.map(item => {
                  if (!item.productId?._id) { console.warn(`Cart invalid prod ID user: ${user.email}`); cartUpdated = true; return null; }
                  if (item.productId.reviewStatus !== 'approved') { console.warn(`Prod ${item.productId.name} (${item.productId._id}) not approved.`); cartUpdated = true; return null; }
                 const subtotal = item.productId.price * item.quantity; cartTotal += subtotal;
                 return { productId: item.productId._id, name: item.productId.name, price: item.productId.price, imageUrl: item.productId.imageUrl, stock: item.productId.stock, quantity: item.quantity, subtotal: subtotal };
              }).filter(item => item !== null);
              if (cartUpdated) {
                  req.session.user.cart = populatedCart.map(item => ({ productId: item.productId, quantity: item.quantity }));
                  await req.session.save(); console.log(`Session cart updated user ${user.email}.`);
              }
          }
         res.render('user/cart', { title: 'Your Shopping Cart', cart: populatedCart, cartTotal: cartTotal });
       } catch (error) { next(error); }
 };

exports.user_addToCart = async (req, res, next) => { // Form submission (Product Detail)
     const { productId, quantity = 1 } = req.body; const userId = req.session.user._id; const numQuantity = parseInt(quantity, 10);
     if (!productId || !mongoose.Types.ObjectId.isValid(productId) || isNaN(numQuantity) || numQuantity < 1) { req.flash('error_msg', 'Invalid product/quantity.'); return res.redirect(req.headers.referer || '/'); }
     try {
         const [user, product] = await Promise.all([ User.findById(userId), Product.findById(productId).select('name stock reviewStatus') ]);
         if (!user) { req.flash('error_msg', 'User session error.'); return res.redirect('/auth/login'); }
         if (!product) { req.flash('error_msg', 'Product not found.'); return res.redirect(req.headers.referer || '/'); }
         if (product.reviewStatus !== 'approved') { req.flash('error_msg', `"${product.name}" unavailable.`); return res.redirect(req.headers.referer || '/'); }
         if (product.stock <= 0) { req.flash('error_msg', `${product.name} out of stock.`); return res.redirect(req.headers.referer || '/'); }
         const existIndex = user.cart.findIndex(i => i.productId.toString() === productId);
         if (existIndex > -1) {
             const newQty = user.cart[existIndex].quantity + numQuantity;
             if (product.stock < newQty) { req.flash('error_msg', `Cannot add ${numQuantity} more ${product.name}. Max stock: ${product.stock} (You have ${user.cart[existIndex].quantity}).`); return res.redirect(req.headers.referer || `/products/${productId}`); }
             user.cart[existIndex].quantity = newQty;
         } else {
             if (product.stock < numQuantity) { req.flash('error_msg', `Insufficient stock: ${product.name}. Only ${product.stock} avail.`); return res.redirect(req.headers.referer || `/products/${productId}`); }
             user.cart.push({ productId, quantity: numQuantity });
         }
         await user.save(); req.session.user.cart = user.cart.map(i => ({ productId: i.productId, quantity: i.quantity })); await req.session.save();
         req.flash('success_msg', `${product.name} added to cart!`);
         if(req.query.redirectTo === 'checkout') { return res.redirect('/user/checkout'); } // Buy Now logic
         else { return res.redirect('/user/cart'); } // Standard Add to Cart redirects to Cart page
     } catch (error) { if (error.name === 'CastError') { req.flash('error_msg', 'Invalid product ID.'); return res.redirect('/'); } console.error("Add Cart Error:", error); next(error); }
 };

exports.user_addToCartAjax = async (req, res, next) => { // AJAX (Product Index)
     const { productId, quantity = 1 } = req.body; const userId = req.session.user._id; const numQuantity = parseInt(quantity, 10);
     if (!productId || !mongoose.Types.ObjectId.isValid(productId)) return res.status(400).json({ success: false, message: 'Invalid product ID.' });
     if (isNaN(numQuantity) || numQuantity < 1) return res.status(400).json({ success: false, message: 'Invalid quantity.' });
     try {
         const [user, product] = await Promise.all([ User.findById(userId), Product.findById(productId).select('name stock reviewStatus') ]);
         if (!user) return res.status(401).json({ success: false, message: 'User session error.' });
         if (!product) return res.status(404).json({ success: false, message: 'Product not found.' });
         if (product.reviewStatus !== 'approved') return res.status(400).json({ success: false, message: `"${product.name}" unavailable.` });
         if (product.stock <= 0) return res.status(400).json({ success: false, message: `${product.name} out of stock.` });
         const existIndex = user.cart.findIndex(i => i.productId.toString() === productId);
         let finalQty = 0;
         if (existIndex > -1) {
             const newQty = user.cart[existIndex].quantity + numQuantity;
             if (product.stock < newQty) return res.status(400).json({ success: false, message: `Max stock: ${product.stock} (You have ${user.cart[existIndex].quantity}).` });
             user.cart[existIndex].quantity = newQty; finalQty = newQty;
         } else {
             if (product.stock < numQuantity) return res.status(400).json({ success: false, message: `Insufficient stock: ${product.stock} avail.` });
             user.cart.push({ productId, quantity: numQuantity }); finalQty = numQuantity;
         }
         await user.save(); req.session.user.cart = user.cart.map(i => ({ productId: i.productId, quantity: i.quantity })); await req.session.save();
         const updatedCartItemCount = user.cart.reduce((sum, i) => sum + i.quantity, 0);
         return res.status(200).json({ success: true, message: `${product.name} added!`, cartItemCount: updatedCartItemCount });
     } catch (error) { console.error("AJAX Add Cart Error:", error); let status = 500; let msg = 'Error adding item.'; if (error.name === 'CastError') { status = 400; msg = 'Invalid product ID.'; } return res.status(status).json({ success: false, message: msg }); }
 };

exports.user_updateCartQuantity = async (req, res, next) => {
          const { productId, quantity } = req.body; const userId = req.session.user._id; const numQuantity = parseInt(quantity, 10);
          if (!productId || !mongoose.Types.ObjectId.isValid(productId) || isNaN(numQuantity) || numQuantity < 0) return res.status(400).json({ success: false, message: 'Invalid product/qty.' });
         try {
             const [user, product] = await Promise.all([ User.findById(userId), Product.findById(productId).select('stock price reviewStatus name') ]);
             if (!user || !product) return res.status(404).json({ success: false, message: 'User/Product not found.' });
             if (product.reviewStatus !== 'approved') { const index = user.cart.findIndex(i => i.productId.toString() === productId); if (index > -1) { user.cart.splice(index, 1); await user.save(); req.session.user.cart = user.cart.map(i => ({ productId: i.productId, quantity: i.quantity })); await req.session.save(); } return res.status(400).json({ success: false, message: `Product "${product.name}" unavailable, removed.`, removal: true }); }
             const index = user.cart.findIndex(i => i.productId.toString() === productId);
             if (numQuantity === 0) { if (index > -1) user.cart.splice(index, 1); }
             else { if (product.stock < numQuantity) return res.status(400).json({ success: false, message: `Stock low: ${product.name} (${product.stock} avail).` }); if (index > -1) user.cart[index].quantity = numQuantity; else user.cart.push({ productId, quantity: numQuantity }); }
             await user.save(); req.session.user.cart = user.cart.map(i => ({ productId: i.productId, quantity: i.quantity }));
             let cartTotal = 0; let itemSubtotal = 0;
             const updatedUser = await User.findById(userId).populate('cart.productId', 'price').lean();
             updatedUser.cart.forEach(i => { if (i.productId?.price) { const currentSub = i.productId.price * i.quantity; cartTotal += currentSub; if (i.productId._id.toString() === productId) itemSubtotal = currentSub; } });
             await req.session.save();
             res.json({ success: true, message: 'Cart updated.', newQuantity: user.cart.find(i => i.productId.toString() === productId)?.quantity ?? 0, itemSubtotal, cartTotal, itemId: productId });
         } catch (error) { console.error("Cart Update Error:", error); res.status(500).json({ success: false, message: 'Error updating quantity.' }); }
 };

exports.user_removeFromCart = async (req, res, next) => {
     const { productId } = req.params; const userId = req.session.user._id;
     if (!productId || !mongoose.Types.ObjectId.isValid(productId)) { req.flash('error_msg', 'Invalid Product ID.'); return res.redirect('/user/cart'); }
     try {
         const userBefore = await User.findById(userId).lean(); const initialLength = userBefore?.cart?.length || 0;
         const user = await User.findOneAndUpdate({ _id: userId }, { $pull: { cart: { productId: productId } } }, { new: true });
         if (!user) { req.flash('error_msg', 'User not found.'); return res.redirect('/auth/login'); }
         req.session.user.cart = user.cart.map(i => ({ productId: i.productId, quantity: i.quantity })); await req.session.save();
         if (user.cart.length < initialLength) req.flash('success_msg', 'Item removed.');
         else req.flash('info_msg', 'Item not found in cart.');
         res.redirect('/user/cart');
     } catch (error) { console.error("Remove Cart Error:", error); next(error); }
 };

exports.user_getCheckoutPage = async (req, res, next) => {
    try {
       const user = await User.findById(req.session.user._id).populate('cart.productId', 'name price imageUrl stock reviewStatus sellerId _id').lean();
       if (!user) { req.flash('error_msg', 'Session expired.'); return res.redirect('/auth/login'); }
       if (!user.cart || user.cart.length === 0) { req.flash('error_msg', 'Cart empty.'); return res.redirect('/user/cart'); }
       let subTotal = 0; let items = []; let issuesFound = false; let issueMessages = []; let itemsToRemove = [];
       for (const item of user.cart) {
           const prodName = item.productId?.name || '[Unknown]'; const stock = item.productId?.stock ?? 0; const status = item.productId?.reviewStatus ?? 'unavailable';
           if (!item.productId?._id) { issueMessages.push('Invalid item detected.'); issuesFound = true; itemsToRemove.push(item._id); continue; }
           if(status !== 'approved') { issueMessages.push(`"${prodName}" unavailable.`); issuesFound = true; itemsToRemove.push(item._id); continue; }
           if(stock < item.quantity) { issueMessages.push(`Stock low: "${prodName}" (${stock} left).`); issuesFound = true; continue; }
           const price = item.productId.price || 0; const itemTotal = price * item.quantity; subTotal += itemTotal;
           items.push({ productId: item.productId._id, name: prodName, price: price, imageUrl: item.productId.imageUrl || '/images/placeholder.png', quantity: item.quantity, stock: stock, itemTotal: itemTotal });
       }
       if (issuesFound) {
             if (itemsToRemove.length > 0) { await User.updateOne({ _id: user._id }, { $pull: { cart: { _id: { $in: itemsToRemove } } } }); const updated = await User.findById(user._id).select('cart').lean(); req.session.user.cart = updated?.cart.map(i => ({ productId: i.productId, quantity: i.quantity })) || []; await req.session.save(); issueMessages.push('Removed problematic items.'); }
             req.flash('error_msg', "Resolve cart issues: " + issueMessages.join(' ')); return res.redirect('/user/cart');
        }
       res.render('user/checkout', { title: 'Checkout', userAddress: user.address, items: items, subTotal: subTotal, totalAmount: subTotal, paymentMethod: 'COD' });
   } catch (error) { next(error); }
 };

exports.user_lookupPincode = async (req, res) => {
    const { pincode } = req.params; const API_URL = `https://api.postalpincode.in/pincode/${pincode}`;
    if (!pincode || !/^\d{6}$/.test(pincode)) return res.status(400).json({ success: false, message: 'Invalid Pincode (6 digits).' });
    try {
        console.log(`Pincode Lookup Req: ${pincode}`);
        const response = await axios.get(API_URL, { timeout: 7000 });
        if (response.status !== 200) { console.error(`Pincode API fail ${pincode}. Status: ${response.status}`); return res.status(502).json({ success: false, message: `API unavailable (${response.statusText})` }); }
        const data = response.data; if (!Array.isArray(data) || !data[0]) { console.error(`Pincode API weird format ${pincode}. Data:`, JSON.stringify(data)); return res.status(500).json({ success: false, message: 'Unexpected API format.' }); }
        const result = data[0]; if (result.Status !== 'Success') { console.log(`Pincode ${pincode} API status: ${result.Status} msg: ${result.Message}`); return res.status(404).json({ success: false, message: `Pincode not found (${result.Message || 'No records'})` }); }
        if (!result.PostOffice || !Array.isArray(result.PostOffice) || result.PostOffice.length === 0) { console.warn(`Pincode ${pincode} OK but no PostOffice data.`); return res.json({ success: true, location: { pinCode: pincode, mandalName: '', districtName: '', stateName: '', localities: [] } }); }
        const postOffices = result.PostOffice; const firstPO = postOffices[0];
        const localitiesList = [...new Set(postOffices.map(po => po.Name).filter(Boolean).filter(name => name.toUpperCase() !== 'NA').sort())];
        const location = { pinCode: firstPO.Pincode || pincode, mandalName: firstPO.Block !== 'NA' ? firstPO.Block : (firstPO.Taluk !== 'NA' ? firstPO.Taluk : firstPO.Division || ''), districtName: firstPO.District || '', stateName: firstPO.State || '', localities: localitiesList };
        console.log(`Pincode Lookup OK ${pincode}. Loc:`, location); res.json({ success: true, location });
    } catch (error) { console.error(`Pincode lookup Net/Req Error ${pincode}:`, error.message); let status = 500; let msg = 'Error looking up pincode.'; if (axios.isAxiosError(error)) { if (error.code === 'ECONNABORTED') { msg = 'Lookup timeout.'; status = 504; } else if (error.response) { msg = `API error (${error.response.status}).`; status = 502; } else if (error.request) { msg = 'Net error.'; status = 502; } } res.status(status).json({ success: false, message: msg }); }
};

// ============================
// Seller Controller Functions
// ============================
exports.seller_getDashboard = (req, res) => {
    res.render('seller/dashboard', { title: 'Seller Dashboard' });
};

exports.seller_getUploadProductPage = (req, res) => {
    res.render('seller/upload-product', { title: 'Upload New Product', product: {}, categories: categories });
};

exports.seller_uploadProduct = async (req, res, next) => {
     const { name, category, price, stock, imageUrl, imageUrl2, specifications, shortDescription } = req.body;
     const sellerId = req.session.user._id; const sellerEmail = req.session.user.email;
     const renderOptions = { title: 'Upload New Product', product: req.body, categories: categories };
     if (!name || !category || price === undefined || stock === undefined || !imageUrl) { req.flash('error_msg', 'Req: Name, Cat, Price, Stock, Image1.'); return res.render('seller/upload-product', renderOptions); }
     if (isNaN(Number(price)) || Number(price) < 0 || isNaN(Number(stock)) || Number(stock) < 0) { req.flash('error_msg', 'Price/Stock >= 0.'); return res.render('seller/upload-product', renderOptions); }
     if (!categoryNames.includes(category)) { req.flash('error_msg', 'Invalid category.'); return res.render('seller/upload-product', renderOptions); }
     try {
         const newProduct = new Product({ name: name.trim(), category: category.trim(), shortDescription: shortDescription?.trim(), price: Number(price), stock: Number(stock), imageUrl: imageUrl.trim(), imageUrl2: imageUrl2?.trim(), specifications: specifications?.trim(), sellerId: sellerId, sellerEmail: sellerEmail, reviewStatus: 'pending' });
         await newProduct.save(); console.log(`P.ID ${newProduct._id} saved initially by seller ${sellerEmail}.`);
         reviewProductWithGemini(newProduct).then(async reviewResult => {
             try {
                 const ptu = await Product.findById(newProduct._id); if (!ptu) { console.warn(`P.ID ${newProduct._id} missing for status update.`); return; }
                 ptu.reviewStatus = reviewResult.status; ptu.rejectionReason = reviewResult.reason; await ptu.save();
                 console.log(`P.ID ${newProduct._id} review updated to ${reviewResult.status}.`);
             } catch (updateError) { console.error(`Error updating P.ID ${newProduct._id} after Gemini:`, updateError); }
         }).catch(reviewError => {
             console.error(`Error in Gemini chain for P.ID ${newProduct._id}:`, reviewError);
             Product.findByIdAndUpdate(newProduct._id, { reviewStatus: 'pending', rejectionReason: 'AI review process failed.' }).catch(err => console.error("Fail recovery mark prod pending:", err));
         });
         req.flash('success_msg', `Product "${newProduct.name}" submitted for review.`); res.redirect('/seller/products');
     } catch (error) {
         if (error.name === 'ValidationError') { req.flash('error_msg', `Validation: ${Object.values(error.errors).map(el => el.message).join(' ')}`); return res.render('seller/upload-product', renderOptions); }
         console.error("Seller Upload Error:", error); next(error);
     }
 };

exports.seller_getManageProductsPage = async (req, res, next) => {
    try {
        const products = await Product.find({ sellerId: req.session.user._id }).sort({ createdAt: -1 }).lean();
        res.render('seller/manage-products', { title: 'Manage Your Products', products: products });
    } catch (error) { next(error); }
};

exports.seller_getEditProductPage = async (req, res, next) => {
      try {
         const product = await Product.findOne({ _id: req.params.id, sellerId: req.session.user._id }).lean();
         if (!product) { req.flash('error_msg', 'Product not found/access denied.'); return res.redirect('/seller/products'); }
         res.render('seller/edit-product', { title: `Edit Product: ${product.name}`, product: product, categories: categories });
    } catch (error) { if (error.name === 'CastError') { req.flash('error_msg', 'Invalid product ID.'); return res.redirect('/seller/products'); } next(error); }
 };

exports.seller_updateProduct = async (req, res, next) => {
      const productId = req.params.id; const sellerId = req.session.user._id; const { name, category, price, stock, imageUrl, imageUrl2, specifications, shortDescription } = req.body;
      let productData = { _id: productId, ...req.body }; const renderOpts = { title: `Edit Error`, product: productData, categories: categories };
      const fetchProductForRender = async () => await Product.findOne({ _id: productId, sellerId: sellerId }).lean() || productData;
      if (!name || !category || price === undefined || stock === undefined || !imageUrl) { req.flash('error_msg', 'Req: Name, Cat, Price, Stock, Image1.'); renderOpts.product = { ...(await fetchProductForRender()), ...req.body }; return res.render('seller/edit-product', renderOpts); }
      if (isNaN(Number(price)) || Number(price) < 0 || isNaN(Number(stock)) || Number(stock) < 0) { req.flash('error_msg', 'Price/Stock >= 0.'); renderOpts.product = { ...(await fetchProductForRender()), ...req.body }; return res.render('seller/edit-product', renderOpts); }
      if (!categoryNames.includes(category)) { req.flash('error_msg', 'Invalid category.'); renderOpts.product = { ...(await fetchProductForRender()), ...req.body }; return res.render('seller/edit-product', renderOpts); }
      try {
          const product = await Product.findOne({ _id: productId, sellerId: sellerId });
          if (!product) { req.flash('error_msg', 'Product not found/access denied.'); return res.status(404).redirect('/seller/products'); }
          product.name = name.trim(); product.category = category.trim(); product.shortDescription = shortDescription?.trim(); product.price = Number(price); product.stock = Number(stock); product.imageUrl = imageUrl.trim(); product.imageUrl2 = imageUrl2?.trim(); product.specifications = specifications?.trim(); product.reviewStatus = 'pending'; product.rejectionReason = undefined;
          await product.save(); console.log(`P.ID ${productId} updated by seller, pending review.`);
          reviewProductWithGemini(product).then(async reviewResult => {
              try {
                  const ptu = await Product.findById(product._id); if (ptu) { ptu.reviewStatus = reviewResult.status; ptu.rejectionReason = reviewResult.reason; await ptu.save(); console.log(`P.ID ${product._id} review updated: ${reviewResult.status} after edit.`); }
              } catch (updateError) { console.error(`Error update P.ID ${product._id} after Gemini (post-edit):`, updateError); }
          }).catch(reviewError => {
              console.error(`Error in Gemini chain for edited P.ID ${product._id}:`, reviewError);
              Product.findByIdAndUpdate(product._id, { reviewStatus: 'pending', rejectionReason: 'AI review fail post-edit.' }).catch(err => console.error("Fail recovery mark edited pending:", err));
          });
          req.flash('success_msg', `Product "${product.name}" updated & resubmitted.`); res.redirect('/seller/products');
      } catch (error) {
           if (error.name === 'ValidationError') { req.flash('error_msg', `Validation: ${Object.values(error.errors).map(el => el.message).join(' ')}`); renderOpts.product = { ...(await fetchProductForRender()), ...req.body }; return res.render('seller/edit-product', renderOpts); }
           console.error("Seller Update Error:", error); next(error);
      }
  };

exports.seller_removeProduct = async (req, res, next) => {
     const productId = req.params.id; const sellerId = req.session.user._id;
     try {
          const product = await Product.findOneAndDelete({ _id: productId, sellerId: sellerId });
         if (!product) { req.flash('error_msg', 'Product not found/removed.'); return res.status(404).redirect('/seller/products'); }
         req.flash('success_msg', `Product "${product.name}" removed.`); res.redirect('/seller/products');
     } catch (error) {
         if (error.name === 'CastError') { req.flash('error_msg', 'Invalid product ID.'); return res.status(400).redirect('/seller/products'); }
         console.error("Seller Remove Error:", error); req.flash('error_msg', 'Error removing.'); res.redirect('/seller/products');
     }
 };

exports.seller_getManageOrdersPage = async (req, res, next) => {
     try {
         const sellerId = req.session.user._id;
         const sellerProdIds = (await Product.find({ sellerId: sellerId }).select('_id').lean()).map(p => p._id);
         if (sellerProdIds.length === 0) { return res.render('seller/manage-orders', { title: 'Manage Your Orders', orders: [], message: 'No products listed, no orders yet.', sellerCancellationReasons: sellerCancellationReasons }); }
         const orders = await Order.find({ 'products.productId': { $in: sellerProdIds } }).sort({ orderDate: -1 }).populate('products.productId', 'name imageUrl _id price sellerId').populate('userId', 'name email').lean();
         const now = Date.now();
         orders.forEach(order => {
              order.isRelevantToSeller = true; order.canBeDirectlyDeliveredBySeller = order.status === 'Pending'; order.canBeCancelledBySeller = order.status === 'Pending';
              order.showDeliveryOtp = order.status === 'Pending' && !!order.orderOTP && !!order.orderOTPExpires && new Date(order.orderOTPExpires).getTime() > now;
              if (order.products?.length > 0) {
                  order.itemsSummary = order.products.map(p => { const isSellerItem = p.productId?.sellerId?.toString() === sellerId.toString(); const price = p.priceAtOrder ?? p.productId?.price ?? 0; const name = p.productId?.name || p.name || '[?Name?]'; return `${isSellerItem ? '<strong>' : ''}${name} (Qty: ${p.quantity}) @ ₹${price.toFixed(2)}${isSellerItem ? ' (Yours)</strong>' : ''}`; }).join('<br>');
              } else order.itemsSummary = 'No items found';
         });
         res.render('seller/manage-orders', { title: 'Manage Your Orders', orders: orders, message: null, sellerCancellationReasons: sellerCancellationReasons });
     } catch (error) { next(error); }
 };

exports.seller_sendDirectDeliveryOtpBySeller = async (req, res, next) => {
     const orderId = req.params.orderId; const sellerId = req.session.user._id;
     try { // Middleware `isOrderRelevantToSeller` should have run
         const orderCheck = await Order.findById(orderId).select('status').lean(); // Quick check
         if (!orderCheck) throw new Error("Order not found.");
         if (orderCheck.status !== 'Pending') throw new Error(`Cannot send OTP for status ${orderCheck.status}.`);
         const result = await this.order_generateAndSendDirectDeliveryOTPBySeller(orderId, sellerId);
         req.flash('success_msg', result.message + ' Ask customer for OTP.');
     } catch (error) { req.flash('error_msg', `OTP Send Failed: ${error.message}`); }
     res.redirect('/seller/orders');
 };

exports.seller_confirmDirectDeliveryBySeller = async (req, res, next) => {
      const orderId = req.params.orderId; const { otp } = req.body; const sellerId = req.session.user._id;
      if (!otp || !/^\d{6}$/.test(otp.trim())) { req.flash('error_msg', 'Enter 6-digit OTP.'); return res.redirect('/seller/orders'); }
      try { // Middleware `isOrderRelevantToSeller` should have run
          const { order } = await this.order_confirmDirectDeliveryBySeller(orderId, sellerId, otp.trim(), res);
         req.flash('success_msg', `Order ${orderId} confirmed delivered by you.`);
      } catch (error) { req.flash('error_msg', `Confirm Failed: ${error.message}`); }
      res.redirect('/seller/orders');
  };

exports.seller_cancelOrderBySeller = async (req, res, next) => {
     const { orderId } = req.params; const { reason } = req.body; const sellerId = req.session.user._id; const sellerEmail = req.session.user.email;
     if (!reason || !sellerCancellationReasons.includes(reason)) { req.flash('error_msg', 'Select valid seller reason.'); return res.redirect('/seller/orders'); }
     const sessionDB = await mongoose.startSession(); sessionDB.startTransaction();
     try { // Middleware `isOrderRelevantToSeller` should have run
         const order = await Order.findById(orderId).populate('products.productId', 'sellerId name _id').populate('userId', 'email name').session(sessionDB);
         if (!order) { await sessionDB.abortTransaction(); sessionDB.endSession(); req.flash('error_msg', 'Order not found.'); return res.status(404).redirect('/seller/orders'); }
         if (order.status !== 'Pending') { await sessionDB.abortTransaction(); sessionDB.endSession(); req.flash('error_msg', `Order is '${order.status}'. Cannot cancel.`); return res.redirect('/seller/orders'); }
         console.log(`Seller Cancel: Restore stock seller ${sellerId} O.ID ${orderId}.`);
         const restorePromises = order.products .filter(item => item.productId?.sellerId?.toString() === sellerId.toString()) .map(item => {
             const qty = Number(item.quantity); if (!item.productId?._id || isNaN(qty) || qty <= 0) { console.warn(`Seller Cancel: Invalid item ${item.productId?._id}/Qty ${item.quantity} O.ID ${orderId}.`); return Promise.resolve(); }
             console.log(`Seller Cancel: Restore ${qty} stock P.ID ${item.productId._id}`);
             return Product.updateOne({ _id: item.productId._id }, { $inc: { stock: qty, orderCount: -1 } }, { session: sessionDB }).catch(err => console.error(`Seller Cancel: Fail stock P.ID ${item.productId._id} O.ID ${orderId}: ${err.message}`));
          });
         await Promise.allSettled(restorePromises); console.log(`Seller Cancel: Stock restore done ${sellerId} O.ID ${orderId}.`);
         order.status = 'Cancelled'; order.cancellationReason = `Cancelled by Seller: ${reason}`; order.orderOTP = undefined; order.orderOTPExpires = undefined; order.cancellationAllowedUntil = undefined;
         await order.save({ session: sessionDB }); await sessionDB.commitTransaction();
         try { // Send email
              const customerEmail = order.userEmail || order.userId?.email; const customerName = order.shippingAddress.name || order.userId?.name || 'Customer';
              if(customerEmail) {
                  const subject = `Order Cancelled - miniapp`; const text = `Order (${order._id}) cancelled by seller. Reason: ${reason}.`;
                  const html = generateEmailHtml({ recipientName: customerName, subject: subject, greeting: `Regarding Order #${order._id}`, bodyLines: [`Items in order (#${order._id}) cancelled by seller.`, `<strong>Reason:</strong> ${reason}`, `Refund processed if applicable.`], buttonUrl: `${req.protocol}://${req.get('host')}/orders/my-orders`, buttonText: 'My Orders', companyName: 'miniapp' });
                  await sendEmail(customerEmail, subject, text, html);
              } else console.warn(`Seller Cancel: Cannot find customer email O.ID ${orderId}.`);
         } catch (emailError) { console.error(`Seller Cancel: Fail send email O.ID ${order._id}:`, emailError); }
         req.flash('success_msg', `Order ${orderId} cancelled. Reason: ${reason}. Customer notified.`); res.redirect('/seller/orders');
     } catch (error) {
         if(sessionDB.inTransaction()) await sessionDB.abortTransaction(); console.error(`Error seller cancelling O.ID ${orderId}:`, error); req.flash('error_msg', 'Internal cancel error.'); res.redirect('/seller/orders');
     } finally { if (sessionDB) sessionDB.endSession(); }
 };