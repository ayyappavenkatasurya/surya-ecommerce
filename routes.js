// routes.js
const express = require('express');
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
    order_markPaymentFailed, // <<< NEW
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

// --- Public/Base Routes ---
router.get('/', auth_getHomePage); 


// --- Auth Routes ---
const authRouter = express.Router();
// ... (Existing Auth Routes - no change)
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
// ... (Existing Product Routes - no change)
productRouter.get('/suggestions', product_getProductSuggestions);
productRouter.get('/', product_getProducts); 
productRouter.get('/:id', product_getProductDetails); 
productRouter.post('/:id/rate', isAuthenticated, product_rateProduct); 
router.use('/products', productRouter);


// --- User Routes (Authenticated) ---
const userRouter = express.Router();
// ... (Existing User Routes - no change)
userRouter.get('/pincode-lookup/:pincode', user_lookupPincode);
userRouter.use(isAuthenticated); 
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
orderRouter.post('/place-cod', order_placeCODOrder);
orderRouter.post('/create-razorpay-order', order_createRazorpayOrderIntent); 
orderRouter.post('/verify-razorpay-payment', order_verifyRazorpayPayment);
orderRouter.post('/payment-failed/:internal_order_id', order_markPaymentFailed); // <<< NEW
orderRouter.get('/my-orders', order_getMyOrders);
orderRouter.post('/cancel/:id', order_cancelOrder); 
router.use('/orders', orderRouter);


// --- Admin Routes (Authenticated + Admin Role) ---
const adminRouter = express.Router();
// ... (Existing Admin Routes - no change)
adminRouter.use(isAuthenticated, isAdmin);
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
// ... (Existing Seller Routes - no change for most)
sellerRouter.use(isAuthenticated, isSeller);
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