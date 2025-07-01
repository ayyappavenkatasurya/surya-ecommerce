// routes.js
const express = require('express');
const rateLimit = require('express-rate-limit');
const controllers = require('./controllers');
const middleware = require('./middleware');
const passport = require('passport'); // <<< MODIFIED: Import passport

// Destructure imported modules for convenience
const {
    isAuthenticated, isAdmin, isSeller, isAdminOrSeller, isProductOwner, isOrderRelevantToSeller
} = middleware;

// ... (Controller destructuring is unchanged)
const {
    auth_getLoginPage, auth_registerUser, auth_getRegisterPage, auth_verifyOtp, auth_getVerifyOtpPage,
    auth_resendOtp, auth_forgotPassword, auth_getForgotPasswordPage, auth_resetPassword, auth_getResetPasswordPage,
    auth_loginUser, auth_logoutUser, auth_getHomePage,
    product_getProducts, product_getProductDetails, product_rateProduct, product_getProductSuggestions,
    user_getUserProfilePage, user_updateUserName, user_saveAddress, user_getCart, user_addToCart,
    user_addToCartAjax, user_updateCartQuantity, user_removeFromCart, user_getCheckoutPage, user_lookupPincode,
    order_placeCODOrder,
    order_createRazorpayOrderIntent,
    order_verifyRazorpayPayment,
    order_markPaymentFailed,
    order_getMyOrders, order_cancelOrder,
    admin_getDashboard, admin_uploadProduct, admin_getUploadProductPage, admin_getManageProductsPage,
    admin_getEditProductPage, admin_updateProduct, admin_removeProduct, admin_getManageOrdersPage,
    admin_sendDirectDeliveryOtpByAdmin, admin_confirmDirectDeliveryByAdmin, admin_cancelOrderByAdmin,
    admin_getManageUsersPage, admin_updateUserRole, admin_removeUser,
    admin_getManageBannersPage, admin_updateBanners,
    seller_getDashboard, seller_getUploadProductPage, seller_uploadProduct, seller_getManageProductsPage,
    seller_getEditProductPage, seller_updateProduct, seller_removeProduct, seller_getManageOrdersPage,
    seller_sendDirectDeliveryOtpBySeller, seller_confirmDirectDeliveryBySeller, seller_cancelOrderBySeller
} = controllers;

const router = express.Router();

// --- Rate Limiting Configuration ---
// ... (Rate limiter setup is unchanged)
const generalLimiter = rateLimit({ windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || (15 * 60 * 1000)), max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || 100), standardHeaders: true, legacyHeaders: false, message: 'Too many requests from this IP, please try again after a while.', handler: (req, res, next, options) => { req.flash('error_msg', options.message); const backURL = req.header('Referer') || '/'; res.status(options.statusCode).redirect(backURL); }});
const authActionLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 15, message: 'Too many attempts. Please try again later.', handler: (req, res, next, options) => { req.flash('error_msg', options.message); let redirectUrl = '/auth/login'; if (req.path.includes('register')) redirectUrl = '/auth/register'; else if (req.path.includes('forgot-password')) redirectUrl = '/auth/forgot-password'; else if (req.path.includes('verify-otp') || req.path.includes('resend-otp')) { const email = req.body.email || req.query.email; redirectUrl = email ? `/auth/verify-otp?email=${encodeURIComponent(email)}` : '/auth/register'; } res.status(options.statusCode).redirect(redirectUrl); }});
const paymentApiLimiter = rateLimit({ windowMs: 5 * 60 * 1000, max: 10, message: 'Too many payment attempts. Please try again after a few minutes.', handler: (req, res, next, options) => { res.status(options.statusCode).json({ success: false, message: options.message }); }});

// --- Public/Base Routes ---
router.get('/', generalLimiter, auth_getHomePage);


// --- Auth Routes ---
const authRouter = express.Router();
authRouter.get('/login', generalLimiter, auth_getLoginPage);
authRouter.get('/register', generalLimiter, auth_getRegisterPage);
authRouter.get('/verify-otp', generalLimiter, auth_getVerifyOtpPage);
authRouter.get('/forgot-password', generalLimiter, auth_getForgotPasswordPage);
authRouter.get('/reset-password/:token', generalLimiter, auth_getResetPasswordPage);

authRouter.post('/register', authActionLimiter, auth_registerUser);
authRouter.post('/login', authActionLimiter, auth_loginUser);
authRouter.post('/logout', isAuthenticated, auth_logoutUser);
authRouter.post('/verify-otp', authActionLimiter, auth_verifyOtp);
authRouter.post('/resend-otp', authActionLimiter, auth_resendOtp);
authRouter.post('/forgot-password', authActionLimiter, auth_forgotPassword);
authRouter.post('/reset-password/:token', authActionLimiter, auth_resetPassword);

/* --- MODIFIED: Add Google OAuth Routes --- */
// 1. Route to start Google authentication
authRouter.get('/google',
    authActionLimiter, // Apply limiter
    passport.authenticate('google', {
        scope: ['profile', 'email'] // Request user's profile and email
    })
);

// 2. Google callback route
authRouter.get('/google/callback',
    passport.authenticate('google', {
        failureRedirect: '/auth/login', // Redirect on failure
        failureFlash: 'Google authentication failed. Please try again or use a different method.', // Optional flash message
    }),
    (req, res) => {
        // Successful authentication
        req.flash('success_msg', 'You have successfully logged in with Google.');
        const returnTo = req.session.returnTo || '/';
        delete req.session.returnTo;
        res.redirect(returnTo);
    }
);
/* --- END Google OAuth Routes --- */

router.use('/auth', authRouter);


// --- Product Routes (Public Facing) ---
const productRouter = express.Router();
productRouter.get('/suggestions', generalLimiter, product_getProductSuggestions);
productRouter.get('/', generalLimiter, product_getProducts);
productRouter.get('/:id', generalLimiter, product_getProductDetails);
productRouter.post('/:id/rate', isAuthenticated, generalLimiter, product_rateProduct);
router.use('/products', productRouter);


// --- User Routes (Authenticated) ---
const userRouter = express.Router();
userRouter.get('/pincode-lookup/:pincode', generalLimiter, user_lookupPincode);
userRouter.use(isAuthenticated);
userRouter.use(generalLimiter);
userRouter.get('/profile', user_getUserProfilePage);
userRouter.post('/profile/update-name', user_updateUserName);
userRouter.post('/address/save', user_saveAddress);
userRouter.get('/cart', user_getCart);
userRouter.post('/cart/add', user_addToCart);
userRouter.post('/cart/add-ajax', user_addToCartAjax);
userRouter.post('/cart/update', user_updateCartQuantity);
userRouter.post('/cart/remove/:productId', user_removeFromCart);
userRouter.get('/checkout', user_getCheckoutPage);
router.use('/user', userRouter);

// --- Order Routes (Authenticated) ---
const orderRouter = express.Router();
orderRouter.use(isAuthenticated);
orderRouter.post('/place-cod', paymentApiLimiter, order_placeCODOrder);
orderRouter.post('/create-razorpay-order', paymentApiLimiter, order_createRazorpayOrderIntent);
orderRouter.post('/verify-razorpay-payment', paymentApiLimiter, order_verifyRazorpayPayment);
orderRouter.post('/payment-failed/:internal_order_id', paymentApiLimiter, order_markPaymentFailed);
orderRouter.get('/my-orders', generalLimiter, order_getMyOrders);
orderRouter.post('/cancel/:id', generalLimiter, order_cancelOrder);
router.use('/orders', orderRouter);

// --- Admin Routes (Authenticated + Admin Role) ---
const adminRouter = express.Router();
adminRouter.use(isAuthenticated, isAdmin);
adminRouter.use(generalLimiter);
adminRouter.get('/dashboard', admin_getDashboard);
adminRouter.get('/upload-product', admin_getUploadProductPage);
adminRouter.post('/upload-product', admin_uploadProduct);
adminRouter.get('/manage-products', admin_getManageProductsPage);
adminRouter.get('/manage-products/edit/:id', admin_getEditProductPage);
adminRouter.post('/manage-products/update/:id', admin_updateProduct);
adminRouter.post('/manage-products/remove/:id', admin_removeProduct);
adminRouter.get('/manage-orders', admin_getManageOrdersPage);
adminRouter.post('/orders/:orderId/send-direct-delivery-otp', admin_sendDirectDeliveryOtpByAdmin);
adminRouter.post('/orders/:orderId/confirm-direct-delivery', admin_confirmDirectDeliveryByAdmin);
adminRouter.post('/orders/:orderId/cancel', admin_cancelOrderByAdmin);
adminRouter.get('/manage-users', admin_getManageUsersPage);
adminRouter.post('/users/:id/update-role', admin_updateUserRole);
adminRouter.post('/users/:id/remove', admin_removeUser);
adminRouter.get('/manage-banners', admin_getManageBannersPage);
adminRouter.post('/manage-banners', admin_updateBanners);
router.use('/admin', adminRouter);

// --- Seller Routes (Authenticated + Seller Role) ---
const sellerRouter = express.Router();
sellerRouter.use(isAuthenticated, isSeller);
sellerRouter.use(generalLimiter);
sellerRouter.get('/dashboard', seller_getDashboard);
sellerRouter.get('/products/upload', seller_getUploadProductPage);
sellerRouter.post('/products/upload', seller_uploadProduct);
sellerRouter.get('/products', seller_getManageProductsPage);
sellerRouter.get('/products/edit/:id', isProductOwner, seller_getEditProductPage);
sellerRouter.post('/products/update/:id', isProductOwner, seller_updateProduct);
sellerRouter.post('/products/remove/:id', isProductOwner, seller_removeProduct);
sellerRouter.get('/orders', seller_getManageOrdersPage);
sellerRouter.post('/orders/:orderId/send-otp', isOrderRelevantToSeller, seller_sendDirectDeliveryOtpBySeller);
sellerRouter.post('/orders/:orderId/confirm-delivery', isOrderRelevantToSeller, seller_confirmDirectDeliveryBySeller);
sellerRouter.post('/orders/:orderId/cancel', isOrderRelevantToSeller, seller_cancelOrderBySeller);
router.use('/seller', sellerRouter);

module.exports = router;