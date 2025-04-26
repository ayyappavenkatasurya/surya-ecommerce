// controllers/adminController.js
const Product = require('../models/Product');
const Order = require('../models/Order');
const User = require('../models/User');
const BannerConfig = require('../models/BannerConfig');
const { sendEmail } = require('../config/mailer');
const { reviewProductWithGemini } = require('../services/geminiService');
const {
    generateAndSendDirectDeliveryOTPByAdmin,
    confirmDirectDeliveryByAdmin,
} = require('./orderController');
const mongoose = require('mongoose');
// *** Import categories and names ***
const categories = require('../config/categories');
const { categoryNames } = require('../config/categories');

const cancellationReasons = [
    "📞 Unable to contact the customer",
    "❗ Out of stock/unavailable item",
    "🗺️ Address incorrect/incomplete",
    "🚫 Customer requested cancellation",
    "❓ Other (Admin)",
];

// --- Admin Dashboard ---
exports.getAdminDashboard = (req, res) => {
    res.render('admin/dashboard', { title: 'Admin Dashboard' });
};

// --- Admin Product Upload Page ---
exports.getUploadProductPage = (req, res) => {
    // *** Pass categories to the view ***
    res.render('admin/upload-product', {
        title: 'Admin: Upload New Product',
        product: {},
        categories: categories // Pass the full list
    });
};

// --- Admin Product Upload Action ---
exports.uploadProduct = async (req, res, next) => {
    // --- UPDATED: Destructure imageUrl2 ---
    const { name, category, price, stock, imageUrl, imageUrl2, specifications, shortDescription } = req.body;
    // --- END UPDATED ---
    const adminUserId = req.session.user._id;
    const adminUserEmail = req.session.user.email;

    // Basic Validation
    if (!name || !category || price === undefined || stock === undefined || !imageUrl) {
        req.flash('error_msg', 'Please fill in all required fields (Name, Category, Price, Stock, Primary Image URL).');
        // *** Pass categories back on error ***
        return res.render('admin/upload-product', { title: 'Admin: Upload New Product', product: req.body, categories: categories });
    }
    if (isNaN(Number(price)) || Number(price) < 0 || isNaN(Number(stock)) || Number(stock) < 0) {
        req.flash('error_msg', 'Price and Stock must be valid non-negative numbers.');
        // *** Pass categories back on error ***
        return res.render('admin/upload-product', { title: 'Admin: Upload New Product', product: req.body, categories: categories });
    }
    // *** Add Category Validation ***
    if (!categoryNames.includes(category)) {
        req.flash('error_msg', 'Invalid category selected.');
        return res.render('admin/upload-product', { title: 'Admin: Upload New Product', product: req.body, categories: categories });
    }
    // Optional: Add validation for imageUrl2 if needed (e.g., check URL format if provided)

    try {
        const newProduct = new Product({
            name: name.trim(),
            category: category.trim(), // Category is now validated
            shortDescription: shortDescription ? shortDescription.trim() : undefined,
            price: Number(price),
            stock: Number(stock),
            imageUrl: imageUrl.trim(),
            // --- UPDATED: Assign imageUrl2 ---
            imageUrl2: imageUrl2 ? imageUrl2.trim() : undefined,
            // --- END UPDATED ---
            specifications: specifications ? specifications.trim() : '',
            sellerId: adminUserId,
            sellerEmail: adminUserEmail,
            reviewStatus: 'pending'
        });

        await newProduct.save(); // This will trigger enum validation
        console.log(`Product ${newProduct._id} saved initially by ADMIN ${adminUserEmail}.`);

        // Send for Gemini Review (Asynchronous - keep existing)
        reviewProductWithGemini(newProduct).then(async reviewResult => {
            try {
                const productToUpdate = await Product.findById(newProduct._id);
                if (productToUpdate) {
                    productToUpdate.reviewStatus = reviewResult.status;
                    productToUpdate.rejectionReason = reviewResult.reason;
                    await productToUpdate.save();
                    console.log(`Product ${newProduct._id} (Admin Upload) review status updated to ${reviewResult.status}.`);
                }
            } catch (updateError) {
                console.error(`Error updating product ${newProduct._id} (Admin Upload) after Gemini review:`, updateError);
            }
        }).catch(reviewError => {
            console.error(`Error in Gemini review promise chain for product ${newProduct._id} (Admin Upload):`, reviewError);
            Product.findByIdAndUpdate(newProduct._id, { reviewStatus: 'pending', rejectionReason: 'AI review process failed.' }).catch(err => console.error("Failed to mark admin-uploaded product as pending after review error:", err));
        });

        req.flash('success_msg', `Product "${newProduct.name}" uploaded and submitted for review.`);
        res.redirect('/admin/manage-products');

    } catch (error) {
        if (error.name === 'ValidationError') {
           let errors = Object.values(error.errors).map(el => el.message);
           req.flash('error_msg', `Validation Error: ${errors.join(' ')}`);
           // *** Pass categories back on error ***
           return res.render('admin/upload-product', { title: 'Admin: Upload New Product', product: req.body, categories: categories });
       }
        console.error("Error uploading product by Admin:", error);
        next(error);
    }
};

// --- Manage Products (Admin sees ALL) ---
exports.getManageProductsPage = async (req, res, next) => {
    try {
        const products = await Product.find({})
                                    .populate('sellerId', 'name email')
                                    .sort({ createdAt: -1 })
                                    .lean();
        res.render('admin/manage-products', {
            title: 'Manage All Products',
            products: products
        });
    } catch (error) {
        next(error);
    }
};

// --- Edit Product (Admin edits ANY) ---
exports.getEditProductPage = async (req, res, next) => {
    try {
        const product = await Product.findById(req.params.id)
                                     .populate('sellerId', 'name email')
                                     .lean();
        if (!product) {
            req.flash('error_msg', 'Product not found.');
            return res.redirect('/admin/manage-products');
        }
        // *** Pass categories to the view ***
        res.render('admin/edit-product', {
            title: `Admin Edit: ${product.name}`,
            product: product,
            isAdminView: true,
            categories: categories // Pass the full list
        });
    } catch (error) {
        if (error.name === 'CastError') {
            req.flash('error_msg', 'Invalid product ID format.');
            return res.redirect('/admin/manage-products');
        }
        next(error);
    }
};

// --- Update Product (Admin updates ANY) ---
exports.updateProduct = async (req, res, next) => {
    const productId = req.params.id;
    // --- UPDATED: Destructure imageUrl2 ---
    const { name, category, price, stock, imageUrl, imageUrl2, specifications, shortDescription, reviewStatus, rejectionReason } = req.body;
    // --- END UPDATED ---
    const renderOptions = { title: `Admin Edit Error`, product: { _id: productId, ...req.body }, isAdminView: true, categories: categories }; // For re-rendering on error

    // Validation
    if (!name || !category || price === undefined || stock === undefined || !imageUrl) {
        req.flash('error_msg', 'Please fill in all required fields.');
        return res.render('admin/edit-product', renderOptions);
    }
    if (isNaN(Number(price)) || Number(price) < 0 || isNaN(Number(stock)) || Number(stock) < 0) {
        req.flash('error_msg', 'Price and Stock must be valid non-negative numbers.');
         return res.render('admin/edit-product', renderOptions);
    }
    // *** Add Category Validation ***
    if (!categoryNames.includes(category)) {
        req.flash('error_msg', 'Invalid category selected.');
         return res.render('admin/edit-product', renderOptions);
    }
    const allowedStatus = ['pending', 'approved', 'rejected'];
    if (reviewStatus && !allowedStatus.includes(reviewStatus)) {
        req.flash('error_msg', 'Invalid review status selected.');
         return res.render('admin/edit-product', renderOptions);
    }
    if (reviewStatus === 'rejected' && !rejectionReason?.trim()) {
        req.flash('error_msg', 'Rejection reason is required when setting status to Rejected.');
        return res.render('admin/edit-product', renderOptions);
    }
    // Optional: Validate imageUrl2 format if present

    try {
        const product = await Product.findById(productId); // Fetch non-lean for saving
        if (!product) {
            req.flash('error_msg', 'Product not found.');
            return res.status(404).redirect('/admin/manage-products');
        }

        product.name = name.trim();
        product.category = category.trim(); // Category validated
        product.shortDescription = shortDescription ? shortDescription.trim() : undefined;
        product.price = Number(price);
        product.stock = Number(stock);
        product.imageUrl = imageUrl.trim();
        // --- UPDATED: Update imageUrl2 ---
        product.imageUrl2 = imageUrl2 ? imageUrl2.trim() : undefined;
        // --- END UPDATED ---
        product.specifications = specifications ? specifications.trim() : '';

        if (reviewStatus && allowedStatus.includes(reviewStatus)) {
            product.reviewStatus = reviewStatus;
            product.rejectionReason = (reviewStatus === 'rejected') ? rejectionReason.trim() : undefined;
        }

        await product.save(); // Will trigger enum validation
        req.flash('success_msg', `Product "${product.name}" updated successfully by admin.`);
        res.redirect('/admin/manage-products');

    } catch (error) {
        if (error.name === 'ValidationError') {
            let errors = Object.values(error.errors).map(el => el.message);
            req.flash('error_msg', `Validation Error: ${errors.join(' ')}`);
             try {
                 const originalProduct = await Product.findById(productId).lean();
                 renderOptions.product = { ...originalProduct, ...req.body }; // Merge original with invalid data
             } catch (fetchErr) {
                 console.error("Error refetching product on update validation fail:", fetchErr);
                 // Use req.body as fallback
             }
             return res.render('admin/edit-product', renderOptions);
        }
        if (error.name === 'CastError') {
            req.flash('error_msg', 'Invalid product ID format.');
            return res.status(400).redirect('/admin/manage-products');
        }
        console.error("Error updating product by Admin:", error);
        next(error);
    }
};


// --- Remove Product (Admin removes ANY - keep existing) ---
exports.removeProduct = async (req, res, next) => {
    const productId = req.params.id;
    try {
        const product = await Product.findByIdAndDelete(productId);
        if (!product) {
            req.flash('error_msg', 'Product not found.');
            return res.status(404).redirect('/admin/manage-products');
        }
        req.flash('success_msg', `Product "${product.name}" removed successfully by admin.`);
        res.redirect('/admin/manage-products');
    } catch (error) {
        if (error.name === 'CastError') {
            req.flash('error_msg', 'Invalid product ID format.');
            return res.status(400).redirect('/admin/manage-products');
        }
        console.error("Error removing product by Admin:", error);
        next(error);
    }
};


// --- Manage Orders (Admin sees ALL - keep existing) ---
exports.getManageOrdersPage = async (req, res, next) => {
    try {
        const orders = await Order.find({})
                                   .sort({ orderDate: -1 })
                                   .select('-__v -products.__v -shippingAddress._id')
                                   .populate('products.productId', 'name imageUrl _id price sellerId')
                                   .populate('userId', 'name email')
                                   .lean();

        const now = Date.now();

        orders.forEach(order => {
            order.canBeCancelledByAdmin = order.status === 'Pending';
            order.canBeDirectlyDeliveredByAdmin = order.status === 'Pending';
            order.showDeliveryOtp = order.status === 'Pending' && !!order.orderOTP && !!order.orderOTPExpires && new Date(order.orderOTPExpires).getTime() > now;

            if (order.products && order.products.length > 0) {
                order.itemsSummary = order.products.map(p => {
                    const productName = p.productId?.name || p.name || '[Product Missing]';
                    const price = p.priceAtOrder ?? 0;
                    return `${productName} (Qty: ${p.quantity}) @ ₹${price.toFixed(2)}`;
                }).join('<br>');
            } else {
                order.itemsSummary = 'No items found';
            }
        });

        res.render('admin/manage-orders', {
            title: 'Manage All Orders',
            orders: orders,
            cancellationReasons: cancellationReasons
        });
    } catch (error) {
        next(error);
    }
};


// --- Admin Order Actions (keep existing) ---
exports.sendDirectDeliveryOtpByAdmin = async (req, res, next) => {
    const { orderId } = req.params;
    try {
        const result = await generateAndSendDirectDeliveryOTPByAdmin(orderId);
        req.flash('success_msg', result.message + ' Ask customer for OTP.');
    } catch (error) {
        req.flash('error_msg', `Admin OTP Send Failed: ${error.message}`);
    }
    res.redirect('/admin/manage-orders');
};

exports.confirmDirectDeliveryByAdmin = async (req, res, next) => {
    const { orderId } = req.params;
    const { otp } = req.body;
    const adminUserId = req.session.user._id;

    if (!otp || !/^\d{6}$/.test(otp.trim())) {
        req.flash('error_msg', 'Please enter the 6-digit OTP.');
        return res.redirect('/admin/manage-orders');
    }

    try {
        const { order } = await confirmDirectDeliveryByAdmin(orderId, adminUserId, otp.trim(), res);
        req.flash('success_msg', `Order ${orderId} confirmed delivered by Admin.`);
    } catch (error) {
        req.flash('error_msg', `Admin Delivery Confirm Failed: ${error.message}`);
    }
    res.redirect('/admin/manage-orders');
};

exports.cancelOrderByAdmin = async (req, res, next) => {
    const { orderId } = req.params;
    const { reason } = req.body;
    const adminUserId = req.session.user._id;

    if (!reason || !cancellationReasons.includes(reason)) {
        req.flash('error_msg', 'Please select a valid admin reason for cancellation.');
        return res.redirect('/admin/manage-orders');
    }

    const sessionDB = await mongoose.startSession();
    sessionDB.startTransaction();
    try {
        const order = await Order.findById(orderId)
                                .populate('products.productId', 'name _id')
                                .populate('userId', 'email')
                                .session(sessionDB);

        if (!order) {
            await sessionDB.abortTransaction(); sessionDB.endSession();
            req.flash('error_msg', 'Order not found.');
            return res.status(404).redirect('/admin/manage-orders');
        }
        if (order.status !== 'Pending') {
            await sessionDB.abortTransaction(); sessionDB.endSession();
            req.flash('error_msg', `Order status is '${order.status}'. Only 'Pending' orders can be cancelled.`);
            return res.redirect('/admin/manage-orders');
        }

        // Restore Stock
        const productStockRestorePromises = order.products.map(item => {
            const quantityToRestore = Number(item.quantity);
            if (!item.productId?._id || isNaN(quantityToRestore) || quantityToRestore <= 0) {
                console.warn(`Admin Cancel: Invalid item P.ID ${item.productId?._id} or Qty ${item.quantity} in O.ID ${orderId}. Skipping restore.`);
                return Promise.resolve();
            }
            return Product.updateOne(
                { _id: item.productId._id },
                { $inc: { stock: quantityToRestore, orderCount: -1 } },
                { session: sessionDB }
            ).catch(err => {
               console.error(`Admin Cancel: Failed stock/count restore P.ID ${item.productId._id} O.ID ${orderId}: ${err.message}`);
            });
        });
        await Promise.allSettled(productStockRestorePromises);

        order.status = 'Cancelled';
        order.cancellationReason = reason;
        await order.save({ session: sessionDB });

        await sessionDB.commitTransaction();

        // Send Email Notification
        try {
            const customerEmail = order.userEmail || order.userId?.email;
            if(customerEmail) {
                const subjectCust = `Your Order (${order._id}) Has Been Cancelled`;
                const htmlCust = `<p>Your order (${order._id}) has been cancelled by administration.</p><p><strong>Reason:</strong> ${order.cancellationReason}</p><p>Contact support for questions.</p>`;
                await sendEmail(customerEmail, subjectCust, `Order ${order._id} cancelled. Reason: ${order.cancellationReason}`, htmlCust);
            }
        } catch (emailError) {
            console.error(`Failed sending cancellation email for order ${order._id}:`, emailError);
        }

        req.flash('success_msg', `Order ${orderId} cancelled by admin. Reason: ${reason}.`);
        res.redirect('/admin/manage-orders');

    } catch (error) {
        await sessionDB.abortTransaction();
        console.error(`Error cancelling order ${orderId} by admin ${adminUserId}:`, error);
        req.flash('error_msg', 'Failed to cancel order due to an internal error.');
        res.redirect('/admin/manage-orders');
    } finally {
        sessionDB.endSession();
    }
};


// --- Manage Users (Admin - keep existing) ---
exports.getManageUsersPage = async (req, res, next) => {
    try {
        const users = await User.find({ _id: { $ne: req.session.user._id } })
                                  .select('name email role createdAt isVerified address.phone')
                                  .sort({ createdAt: -1 })
                                  .lean();
        res.render('admin/manage-users', {
            title: 'Manage Registered Users',
            users: users
        });
    } catch (error) {
        next(error);
    }
};

exports.updateUserRole = async (req, res, next) => {
    const userId = req.params.id;
    const { role } = req.body;
    const allowedRoles = ['user', 'admin', 'seller'];

    if (!role || !allowedRoles.includes(role)) {
        req.flash('error_msg', 'Invalid role selected.');
        return res.status(400).redirect('/admin/manage-users');
    }
    if (userId === req.session.user._id.toString()) {
         req.flash('error_msg', 'You cannot change your own role.');
         return res.redirect('/admin/manage-users');
    }

    try {
        const user = await User.findById(userId);
        if (!user) {
            req.flash('error_msg', 'User not found.');
            return res.status(404).redirect('/admin/manage-users');
        }
        user.role = role;
        await user.save();
        req.flash('success_msg', `User ${user.email}'s role updated to ${role}.`);
        res.redirect('/admin/manage-users');

    } catch (error) {
        if (error.name === 'CastError') {
            req.flash('error_msg', 'Invalid user ID format.');
            return res.status(400).redirect('/admin/manage-users');
        }
        console.error(`Error updating role for user ${userId}:`, error);
        req.flash('error_msg', 'Error updating user role.');
        res.redirect('/admin/manage-users');
    }
};

exports.removeUser = async (req, res, next) => {
    const userId = req.params.id;

    if (userId === req.session.user._id.toString()) {
        req.flash('error_msg', 'You cannot remove yourself.');
        return res.redirect('/admin/manage-users');
    }

    try {
        const user = await User.findById(userId);
        if (!user) {
            req.flash('error_msg', 'User not found.');
            return res.status(404).redirect('/admin/manage-users');
        }

        if (user.role === 'admin') {
            const adminCount = await User.countDocuments({ role: 'admin' });
            if (adminCount <= 1) {
                req.flash('error_msg', 'Cannot remove the last admin account.');
                return res.redirect('/admin/manage-users');
            }
        }

        await User.deleteOne({ _id: userId });
        req.flash('success_msg', `User ${user.email} removed successfully.`);
        res.redirect('/admin/manage-users');

    } catch (error) {
        if (error.name === 'CastError') {
            req.flash('error_msg', 'Invalid user ID format.');
            return res.status(400).redirect('/admin/manage-users');
        }
        console.error(`Error removing user ${userId}:`, error);
        req.flash('error_msg', 'Error removing user.');
        res.redirect('/admin/manage-users');
    }
};


// --- Banner Management Controllers ---
exports.getManageBannersPage = async (req, res, next) => {
    try {
        let bannerConfig = await BannerConfig.findOne({ configKey: 'mainBanners' }).lean();
        if (!bannerConfig) {
            bannerConfig = { configKey: 'mainBanners', banners: [] };
        }
        const displayBanners = Array.from({ length: 4 }).map((_, index) => {
             return bannerConfig.banners[index] || { imageUrl: '', linkUrl: '', title: '' };
         });
        res.render('admin/manage-banners', {
            title: 'Manage Homepage Banners',
            bannerConfig: { ...bannerConfig, banners: displayBanners }
        });
    } catch (error) {
        console.error("Error fetching banner configuration:", error);
        next(error);
    }
};

exports.updateBanners = async (req, res, next) => {
    const { imageUrl1, linkUrl1, title1, imageUrl2, linkUrl2, title2, imageUrl3, linkUrl3, title3, imageUrl4, linkUrl4, title4 } = req.body;
    const adminUserId = req.session.user._id;

    const urlPattern = /^https?:\/\/.+/;
    const bannerInputs = [
        { imageUrl: imageUrl1, linkUrl: linkUrl1, title: title1 },
        { imageUrl: imageUrl2, linkUrl: linkUrl2, title: title2 },
        { imageUrl: imageUrl3, linkUrl: linkUrl3, title: title3 },
        { imageUrl: imageUrl4, linkUrl: linkUrl4, title: title4 }
    ];

    const newBanners = [];
    let validationError = false;
    for (let i = 0; i < bannerInputs.length; i++) {
        const input = bannerInputs[i];
        const trimmedImageUrl = input.imageUrl?.trim();
        const trimmedLinkUrl = input.linkUrl?.trim();
        const trimmedTitle = input.title?.trim();

        if (trimmedImageUrl) {
            if (!urlPattern.test(trimmedImageUrl)) {
                req.flash('error_msg', `Banner ${i + 1}: Image URL format is invalid.`);
                validationError = true;
            }
            if (trimmedLinkUrl && !urlPattern.test(trimmedLinkUrl)) {
                 req.flash('error_msg', `Banner ${i + 1}: Link URL format is invalid.`);
                 validationError = true;
             }
             if (!validationError) {
                newBanners.push({
                     imageUrl: trimmedImageUrl,
                     linkUrl: trimmedLinkUrl || undefined,
                     title: trimmedTitle || undefined
                 });
             }
        }
    }

    if (validationError) {
         const displayBannersForError = Array.from({ length: 4 }).map((_, index) => bannerInputs[index]);
         return res.render('admin/manage-banners', {
             title: 'Manage Homepage Banners',
             bannerConfig: { banners: displayBannersForError }
         });
    }

    try {
        await BannerConfig.findOneAndUpdate(
            { configKey: 'mainBanners' },
            { banners: newBanners, lastUpdatedBy: adminUserId },
            { new: true, upsert: true, runValidators: true }
        );
        req.flash('success_msg', 'Homepage banners updated successfully.');
        res.redirect('/admin/manage-banners');
    } catch (error) {
        if (error.name === 'ValidationError') {
            let errors = Object.values(error.errors).map(el => el.message);
             req.flash('error_msg', `Validation Error: ${errors.join(', ')}`);
             const displayBannersForError = Array.from({ length: 4 }).map((_, index) => bannerInputs[index]);
             return res.render('admin/manage-banners', {
                  title: 'Manage Homepage Banners',
                 bannerConfig: { banners: displayBannersForError }
             });
         }
        console.error("Error updating banners:", error);
        req.flash('error_msg', 'Failed to update banners due to a server error.');
        res.redirect('/admin/manage-banners');
    }
};