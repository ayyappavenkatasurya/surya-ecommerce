// routes.js
const express = require('express');
const controllers = require('./controllers'); // Correct import
const middleware = require('./middleware');

// Destructure imported modules for convenience
const {
    isAuthenticated, isAdmin, isSeller, isAdminOrSeller, isProductOwner, isOrderRelevantToSeller
} = middleware;

// ***** CORRECTED DESTRUCTURING FOR controllers *****
// Ensure ALL exported functions from controllers.js are listed here
const {
    // Auth Controllers
    auth_getLoginPage, auth_registerUser, auth_getRegisterPage, auth_verifyOtp, auth_getVerifyOtpPage,
    auth_resendOtp, auth_forgotPassword, auth_getForgotPasswordPage, auth_resetPassword, auth_getResetPasswordPage,
    auth_loginUser, auth_logoutUser, auth_getHomePage,

    // Product Controllers
    product_getProducts, product_getProductDetails, product_rateProduct, product_getProductSuggestions,

    // User Controllers (Make sure ALL are here)
    user_getUserProfilePage, // <--- WAS LIKELY MISSED/MISPELLED HERE ORIGINALLY
    user_updateUserName, user_saveAddress, user_getCart, user_addToCart,
    user_addToCartAjax, user_updateCartQuantity, user_removeFromCart, user_getCheckoutPage, user_lookupPincode,

    // Order Controllers (including internal helpers IF they were meant to be route handlers - adjust if not)
    // Note: Helpers like generateAndSend... and confirm... are likely called internally by admin/seller controllers, not directly routed.
    order_placeOrder, order_getMyOrders, order_cancelOrder, // User cancellation route handler

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
} = controllers; // <--- Make sure this points to the imported controllers object
// ***** END CORRECTED DESTRUCTURING *****

const router = express.Router();

// --- Public/Base Routes ---
router.get('/', auth_getHomePage); // Home page showing approved products etc.


// --- Auth Routes ---
const authRouter = express.Router();
authRouter.get('/login', auth_getLoginPage);
authRouter.get('/register', auth_getRegisterPage);
authRouter.get('/verify-otp', auth_getVerifyOtpPage);
authRouter.get('/forgot-password', auth_getForgotPasswordPage);
authRouter.get('/reset-password/:token', auth_getResetPasswordPage);
authRouter.post('/register', auth_registerUser);
authRouter.post('/login', auth_loginUser);
authRouter.post('/logout', isAuthenticated, auth_logoutUser);
authRouter.post('/verify-otp', auth_verifyOtp);
authRouter.post('/resend-otp', auth_resendOtp);
authRouter.post('/forgot-password', auth_forgotPassword);
authRouter.post('/reset-password/:token', auth_resetPassword);
router.use('/auth', authRouter);


// --- Product Routes (Public Facing) ---
const productRouter = express.Router();
productRouter.get('/suggestions', product_getProductSuggestions); // Before /:id
productRouter.get('/', product_getProducts); // List/Search approved products
productRouter.get('/:id', product_getProductDetails); // Show details (permission checked in controller)
productRouter.post('/:id/rate', isAuthenticated, product_rateProduct); // Requires login
router.use('/products', productRouter);


// --- User Routes (Authenticated) ---
const userRouter = express.Router();
// Pincode is technically public access but placed here for logical grouping
userRouter.get('/pincode-lookup/:pincode', user_lookupPincode);
userRouter.use(isAuthenticated); // Protect subsequent user routes
userRouter.get('/profile', user_getUserProfilePage); // <--- Should now work
userRouter.post('/profile/update-name', user_updateUserName);
userRouter.post('/address/save', user_saveAddress);
userRouter.get('/cart', user_getCart);
userRouter.post('/cart/add', user_addToCart); // For forms
userRouter.post('/cart/add-ajax', user_addToCartAjax); // For AJAX buttons
userRouter.post('/cart/update', user_updateCartQuantity);
userRouter.post('/cart/remove/:productId', user_removeFromCart);
userRouter.get('/checkout', user_getCheckoutPage);
router.use('/user', userRouter);


// --- Order Routes (Authenticated) ---
const orderRouter = express.Router();
orderRouter.use(isAuthenticated);
orderRouter.post('/place', order_placeOrder);
orderRouter.get('/my-orders', order_getMyOrders);
orderRouter.post('/cancel/:id', order_cancelOrder); // User cancelling their own order
router.use('/orders', orderRouter);


// --- Admin Routes (Authenticated + Admin Role) ---
const adminRouter = express.Router();
adminRouter.use(isAuthenticated, isAdmin);
adminRouter.get('/dashboard', admin_getDashboard);
adminRouter.get('/upload-product', admin_getUploadProductPage);
adminRouter.post('/upload-product', admin_uploadProduct);
adminRouter.get('/manage-products', admin_getManageProductsPage);
adminRouter.get('/manage-products/edit/:id', admin_getEditProductPage);
adminRouter.post('/manage-products/update/:id', admin_updateProduct);
adminRouter.post('/manage-products/remove/:id', admin_removeProduct);
adminRouter.get('/manage-orders', admin_getManageOrdersPage);
adminRouter.post('/orders/:orderId/send-direct-delivery-otp', admin_sendDirectDeliveryOtpByAdmin); // Calls the controller function
adminRouter.post('/orders/:orderId/confirm-direct-delivery', admin_confirmDirectDeliveryByAdmin); // Calls the controller function
adminRouter.post('/orders/:orderId/cancel', admin_cancelOrderByAdmin); // Calls the controller function
adminRouter.get('/manage-users', admin_getManageUsersPage);
adminRouter.post('/users/:id/update-role', admin_updateUserRole);
adminRouter.post('/users/:id/remove', admin_removeUser);
adminRouter.get('/manage-banners', admin_getManageBannersPage);
adminRouter.post('/manage-banners', admin_updateBanners);
router.use('/admin', adminRouter);


// --- Seller Routes (Authenticated + Seller Role) ---
const sellerRouter = express.Router();
sellerRouter.use(isAuthenticated, isSeller);
sellerRouter.get('/dashboard', seller_getDashboard);
sellerRouter.get('/products/upload', seller_getUploadProductPage);
sellerRouter.post('/products/upload', seller_uploadProduct);
sellerRouter.get('/products', seller_getManageProductsPage); // Lists only own products
sellerRouter.get('/products/edit/:id', isProductOwner, seller_getEditProductPage); // Requires ownership
sellerRouter.post('/products/update/:id', isProductOwner, seller_updateProduct); // Requires ownership
sellerRouter.post('/products/remove/:id', isProductOwner, seller_removeProduct); // Requires ownership
sellerRouter.get('/orders', seller_getManageOrdersPage); // List relevant orders
sellerRouter.post('/orders/:orderId/send-otp', isOrderRelevantToSeller, seller_sendDirectDeliveryOtpBySeller); // Calls controller func, requires relevance
sellerRouter.post('/orders/:orderId/confirm-delivery', isOrderRelevantToSeller, seller_confirmDirectDeliveryBySeller); // Calls controller func, requires relevance
sellerRouter.post('/orders/:orderId/cancel', isOrderRelevantToSeller, seller_cancelOrderBySeller); // Calls controller func, requires relevance
router.use('/seller', sellerRouter);


module.exports = router; // Export the single consolidated router