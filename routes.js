
// routes.js
const express = require('express');
const rateLimit = require('express-rate-limit'); // <<< ADDED
const controllers = require('./controllers');
const middleware = require('./middleware');

// Destructure imported modules for convenience
const {
    isAuthenticated, isAdmin, isSeller, isAdminOrSeller, isProductOwner, isOrderRelevantToSeller
} = middleware;

const {
    // Auth Controllers
    auth_getLoginPage, auth_registerUser, auth_getRegisterPage, auth_verifyOtp, auth_getVerifyOtpPage,
    auth_resendOtp, auth_forgotPassword, auth_getForgotPasswordPage, auth_resetPassword, auth_getResetPasswordPage,
    auth_loginUser, auth_logoutUser, auth_getHomePage,

    // Product Controllers
    product_getProducts, product_getProductDetails, product_rateProduct, product_getProductSuggestions,

    // User Controllers
    user_getUserProfilePage, user_updateUserName, user_saveAddress, user_getCart, user_addToCart,
    user_addToCartAjax, user_updateCartQuantity, user_removeFromCart, user_getCheckoutPage, user_lookupPincode,

    // Order Controllers
    order_placeCODOrder,
    order_createRazorpayOrderIntent,
    order_verifyRazorpayPayment,
    order_markPaymentFailed,
    order_getMyOrders, order_cancelOrder,

    // Admin Controllers
    admin_getDashboard, admin_uploadProduct, admin_getUploadProductPage, admin_getManageProductsPage,
    admin_getEditProductPage, admin_updateProduct, admin_removeProduct, admin_getManageOrdersPage,
    admin_sendDirectDeliveryOtpByAdmin, admin_confirmDirectDeliveryByAdmin, admin_cancelOrderByAdmin,
    admin_getManageUsersPage, admin_updateUserRole, admin_removeUser,
    admin_getManageBannersPage, admin_updateBanners,

    // Seller Controllers
    seller_getDashboard, seller_getUploadProductPage, seller_uploadProduct, seller_getManageProductsPage,
    seller_getEditProductPage, seller_updateProduct, seller_removeProduct, seller_getManageOrdersPage,
    seller_sendDirectDeliveryOtpBySeller, seller_confirmDirectDeliveryBySeller, seller_cancelOrderBySeller
} = controllers;

const router = express.Router();

// --- Rate Limiting Configuration ---  <<< ADDED SECTION
const generalLimiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || (15 * 60 * 1000)), // Default 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || 100), // Default 100 requests per windowMs
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    message: 'Too many requests from this IP, please try again after a while.',
    handler: (req, res, next, options) => {
        req.flash('error_msg', options.message);
        // Attempt to redirect back, or to a common page if referer is not available
        const backURL = req.header('Referer') || '/';
        res.status(options.statusCode).redirect(backURL);
    }
});

const authActionLimiter = rateLimit({ // Stricter for sensitive auth actions
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 15, // Limit each IP to 15 requests per window
    message: 'Too many attempts. Please try again later.',
    handler: (req, res, next, options) => {
        req.flash('error_msg', options.message);
        // Redirect to a relevant page, e.g., login for login attempts, register for register attempts
        let redirectUrl = '/auth/login';
        if (req.path.includes('register')) redirectUrl = '/auth/register';
        else if (req.path.includes('forgot-password')) redirectUrl = '/auth/forgot-password';
        else if (req.path.includes('verify-otp') || req.path.includes('resend-otp')) {
            const email = req.body.email || req.query.email;
            redirectUrl = email ? `/auth/verify-otp?email=${encodeURIComponent(email)}` : '/auth/register';
        }
        res.status(options.statusCode).redirect(redirectUrl);
    }
});

const paymentApiLimiter = rateLimit({ // Limiter for payment APIs
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 10, // Limit to 10 payment-related API calls per window
    message: 'Too many payment attempts. Please try again after a few minutes.',
    handler: (req, res, next, options) => {
        // For API endpoints, respond with JSON
        res.status(options.statusCode).json({ success: false, message: options.message });
    }
});
// --- END Rate Limiting Configuration ---


// --- Public/Base Routes ---
router.get('/', generalLimiter, auth_getHomePage);


// --- Auth Routes ---
const authRouter = express.Router();
// Apply generalLimiter to GET pages, stricter authActionLimiter to POST actions
authRouter.get('/login', generalLimiter, auth_getLoginPage);
authRouter.get('/register', generalLimiter, auth_getRegisterPage);
authRouter.get('/verify-otp', generalLimiter, auth_getVerifyOtpPage);
authRouter.get('/forgot-password', generalLimiter, auth_getForgotPasswordPage);
authRouter.get('/reset-password/:token', generalLimiter, auth_getResetPasswordPage);

authRouter.post('/register', authActionLimiter, auth_registerUser);
authRouter.post('/login', authActionLimiter, auth_loginUser);
authRouter.post('/logout', isAuthenticated, auth_logoutUser); // Logout is less sensitive
authRouter.post('/verify-otp', authActionLimiter, auth_verifyOtp);
authRouter.post('/resend-otp', authActionLimiter, auth_resendOtp);
authRouter.post('/forgot-password', authActionLimiter, auth_forgotPassword);
authRouter.post('/reset-password/:token', authActionLimiter, auth_resetPassword);
router.use('/auth', authRouter);


// --- Product Routes (Public Facing) ---
const productRouter = express.Router();
productRouter.get('/suggestions', generalLimiter, product_getProductSuggestions); // Limiter for suggestion API
productRouter.get('/', generalLimiter, product_getProducts);
productRouter.get('/:id', generalLimiter, product_getProductDetails);
productRouter.post('/:id/rate', isAuthenticated, generalLimiter, product_rateProduct); // Limit rating submissions
router.use('/products', productRouter);


// --- User Routes (Authenticated) ---
const userRouter = express.Router();
userRouter.get('/pincode-lookup/:pincode', generalLimiter, user_lookupPincode); // Limit pincode lookups
userRouter.use(isAuthenticated); // Authenticated routes below
userRouter.use(generalLimiter); // Apply general limiter to authenticated user actions

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
// Apply paymentApiLimiter to payment creation and verification
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
adminRouter.use(generalLimiter); // Apply general limiter to admin actions

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
sellerRouter.use(generalLimiter); // Apply general limiter to seller actions

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