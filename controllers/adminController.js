// controllers/adminController.js
const Product = require('../models/Product');
const Order = require('../models/Order');
const User = require('../models/User');
const { sendEmail } = require('../config/mailer');
const { reviewProductWithGemini } = require('../services/geminiService'); // *** IMPORT Gemini service ***
const {
    generateAndSendDirectDeliveryOTPByAdmin,
    confirmDirectDeliveryByAdmin,
} = require('./orderController');
const mongoose = require('mongoose');

// Admin cancellation reasons (unchanged)
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

// --- *** ADDED BACK: Admin Product Upload Page *** ---
exports.getUploadProductPage = (req, res) => {
    res.render('admin/upload-product', { title: 'Admin: Upload New Product', product: {} }); // Pass empty product for form consistency
};

// --- *** ADDED BACK & ADAPTED: Admin Product Upload Action *** ---
exports.uploadProduct = async (req, res, next) => {
    const { name, category, price, stock, imageUrl, specifications } = req.body;
    const adminUserId = req.session.user._id; // The logged-in admin
    const adminUserEmail = req.session.user.email; // Admin's email

     // Basic Validation
     if (!name || !category || price === undefined || stock === undefined || !imageUrl) {
        req.flash('error_msg', 'Please fill in all required fields (Name, Category, Price, Stock, Image URL).');
        // Render with existing data for correction
        return res.render('admin/upload-product', { title: 'Admin: Upload New Product', product: req.body });
    }
     if (isNaN(Number(price)) || Number(price) < 0 || isNaN(Number(stock)) || Number(stock) < 0) {
        req.flash('error_msg', 'Price and Stock must be valid non-negative numbers.');
        return res.render('admin/upload-product', { title: 'Admin: Upload New Product', product: req.body });
     }

    try {
        // Create Product - Assign Admin's ID to sellerId for ownership tracking
        const newProduct = new Product({
            name: name.trim(),
            category: category.trim(),
            price: Number(price),
            stock: Number(stock),
            imageUrl: imageUrl.trim(),
            specifications: specifications ? specifications.trim() : '',
            sellerId: adminUserId, // *** Set Admin's ID as sellerId ***
            sellerEmail: adminUserEmail, // *** Set Admin's email ***
            reviewStatus: 'pending' // Start as pending for review
        });

        // Save the product first
        await newProduct.save();
        console.log(`Product ${newProduct._id} saved initially by ADMIN ${adminUserEmail}.`);

        // Send for Gemini Review (Asynchronous)
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
             // Optionally update status back to pending with error reason
              Product.findByIdAndUpdate(newProduct._id, { reviewStatus: 'pending', rejectionReason: 'AI review process failed.' }).catch(err => console.error("Failed to mark admin-uploaded product as pending after review error:", err));
        });

        // Immediate feedback to admin
        req.flash('success_msg', `Product "${newProduct.name}" uploaded and submitted for review.`);
        // Redirect to admin manage products page after upload
        res.redirect('/admin/manage-products');

    } catch (error) {
        // Handle Validation errors
        if (error.name === 'ValidationError') {
           let errors = Object.values(error.errors).map(el => el.message);
           req.flash('error_msg', `Validation Error: ${errors.join(' ')}`);
           return res.render('admin/upload-product', { title: 'Admin: Upload New Product', product: req.body });
       }
        // Handle other errors
        console.error("Error uploading product by Admin:", error);
        next(error); // Pass to generic error handler
    }
};


// --- Manage Products (Admin sees ALL) ---
exports.getManageProductsPage = async (req, res, next) => {
    try {
        const products = await Product.find({})
                                    .populate('sellerId', 'name email') // Populate seller info
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
                                      .populate('sellerId', 'name email') // Get seller info
                                      .lean(); // Use lean for read-only

         if (!product) {
            req.flash('error_msg', 'Product not found.');
            return res.redirect('/admin/manage-products');
        }
        res.render('admin/edit-product', {
            title: `Admin Edit: ${product.name}`,
            product: product,
            isAdminView: true // Flag can be used in EJS if needed
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
    // Include reviewStatus and rejectionReason as admin can override them
    const { name, category, price, stock, imageUrl, specifications, reviewStatus, rejectionReason } = req.body;

     // Validation (ensure required fields, number types, valid status)
     if (!name || !category || price === undefined || stock === undefined || !imageUrl) {
        req.flash('error_msg', 'Please fill in all required fields.');
        return res.redirect(`/admin/manage-products/edit/${productId}`);
    }
     if (isNaN(Number(price)) || Number(price) < 0 || isNaN(Number(stock)) || Number(stock) < 0) {
         req.flash('error_msg', 'Price and Stock must be valid non-negative numbers.');
        return res.redirect(`/admin/manage-products/edit/${productId}`);
    }
     const allowedStatus = ['pending', 'approved', 'rejected'];
     if (reviewStatus && !allowedStatus.includes(reviewStatus)) {
         req.flash('error_msg', 'Invalid review status selected.');
        return res.redirect(`/admin/manage-products/edit/${productId}`);
     }
      // Require rejectionReason if status is 'rejected'
     if (reviewStatus === 'rejected' && !rejectionReason?.trim()) {
         req.flash('error_msg', 'Rejection reason is required when setting status to Rejected.');
          return res.redirect(`/admin/manage-products/edit/${productId}`);
      }

    try {
        const product = await Product.findById(productId); // Fetch full object to save
        if (!product) {
            req.flash('error_msg', 'Product not found.');
            return res.status(404).redirect('/admin/manage-products');
         }

         product.name = name.trim();
         product.category = category.trim();
         product.price = Number(price);
         product.stock = Number(stock);
         product.imageUrl = imageUrl.trim();
         product.specifications = specifications ? specifications.trim() : '';

         // Admin directly sets review status and reason
         if (reviewStatus && allowedStatus.includes(reviewStatus)) {
             product.reviewStatus = reviewStatus;
             product.rejectionReason = (reviewStatus === 'rejected')
                                      ? rejectionReason.trim() // Use provided reason if rejected
                                      : undefined;             // Clear reason otherwise
         }

         await product.save();
         req.flash('success_msg', `Product "${product.name}" updated successfully by admin.`);
         res.redirect('/admin/manage-products');

    } catch (error) {
         if (error.name === 'ValidationError') {
            let errors = Object.values(error.errors).map(el => el.message);
             req.flash('error_msg', `Validation Error: ${errors.join(' ')}`);
             return res.redirect(`/admin/manage-products/edit/${productId}`);
         }
         if (error.name === 'CastError') {
             req.flash('error_msg', 'Invalid product ID format.');
             return res.status(400).redirect('/admin/manage-products');
         }
         console.error("Error updating product by Admin:", error);
        next(error);
     }
 };


// --- Remove Product (Admin removes ANY) ---
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


// --- Manage Orders (Admin sees ALL) ---
exports.getManageOrdersPage = async (req, res, next) => {
    try {
        const orders = await Order.find({})
                                   .sort({ orderDate: -1 })
                                   .populate('products.productId', 'name imageUrl _id price sellerId') // Incl sellerId
                                   .populate('userId', 'name email') // User info optional but helpful
                                   .lean();

        orders.forEach(order => {
            order.canBeCancelledByAdmin = order.status === 'Pending';
            order.canBeDirectlyDeliveredByAdmin = order.status === 'Pending';

            if (order.products && order.products.length > 0) {
                 order.itemsSummary = order.products.map(p => {
                    const productName = p.productId?.name || p.name || '[Product Missing]';
                    const price = p.priceAtOrder ?? 0;
                    // Optional: Indicate owner
                    // const ownerEmail = p.productId?.sellerId?.email || '[Seller Unknown]';
                    return `${productName} (Qty: ${p.quantity}) @ ₹${price.toFixed(2)}`; // Simpler summary for now
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

// --- Admin Order Actions (OTP Send/Confirm, Cancel - Unchanged) ---
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

        // Restore Stock and Decrement Order Count
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
               // Allow process to continue
            });
        });
        await Promise.allSettled(productStockRestorePromises);

        order.status = 'Cancelled';
        order.cancellationReason = reason; // Admin reason
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


// --- Manage Users (Admin - Unchanged) ---
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

// --- Update User Role (Admin - Unchanged) ---
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

// --- Remove User (Admin - Unchanged) ---
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

         // Consider implications for seller's products upon removal (orphan or disable)
         // e.g., await Product.updateMany({ sellerId: userId }, { reviewStatus: 'rejected', rejectionReason: 'Seller Removed' });
         
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