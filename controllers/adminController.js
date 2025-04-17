// controllers/adminController.js
const Product = require('../models/Product');
const Order = require('../models/Order');
const User = require('../models/User');
const { sendEmail } = require('../config/mailer');
const {
    generateAndSendDirectDeliveryOTPByAdmin,
    confirmDirectDeliveryByAdmin,
} = require('./orderController');
const mongoose = require('mongoose');


const cancellationReasons = [
    "📞 Unable to contact the customer",
    "❗ Out of stock/unavailable item",
    "🗺️ Address incorrect/incomplete",
    "🚫 Customer requested cancellation",
    "❓ Other (Admin)",
];


exports.getAdminDashboard = (req, res) => {
    res.render('admin/dashboard', { title: 'Admin Dashboard' });
};

exports.getUploadProductPage = (req, res) => {
    res.render('admin/upload-product', { title: 'Upload New Product' });
};

exports.getManageProductsPage = async (req, res, next) => {
    try {
        const products = await Product.find({}).sort({ createdAt: -1 }).lean();
        res.render('admin/manage-products', {
            title: 'Manage Products',
            products: products
        });
    } catch (error) {
        next(error);
    }
};

exports.getEditProductPage = async (req, res, next) => {
     try {
        const product = await Product.findById(req.params.id);
         if (!product) {
            req.flash('error_msg', 'Product not found.');
            return res.redirect('/admin/manage-products');
        }
        res.render('admin/edit-product', {
            title: `Edit Product: ${product.name}`,
            product: product
        });
    } catch (error) {
         if (error.name === 'CastError') {
           req.flash('error_msg', 'Invalid product ID format.');
            return res.redirect('/admin/manage-products');
       }
        next(error);
     }
 };

exports.getManageOrdersPage = async (req, res, next) => {
    try {
        const orders = await Order.find({})
                                   .sort({ orderDate: -1 })
                                   .populate('products.productId', 'name imageUrl _id price')
                                   .lean();

        orders.forEach(order => {
            order.canBeCancelledByAdmin = order.status === 'Pending';
            order.canBeDirectlyDeliveredByAdmin = order.status === 'Pending';

            if (order.products && order.products.length > 0) {
                order.itemsSummary = order.products.map(p =>
                    `${p.name || '[Product Name Missing]'} (Qty: ${p.quantity}) @ ₹${(p.priceAtOrder || 0).toFixed(2)}`
                ).join('<br>');
            } else {
                order.itemsSummary = 'No items found';
            }
        });

        res.render('admin/manage-orders', {
            title: 'Manage Orders',
            orders: orders,
            cancellationReasons: cancellationReasons
        });
    } catch (error) {
        next(error);
    }
};

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


exports.uploadProduct = async (req, res, next) => {
    const { name, category, price, stock, imageUrl, specifications } = req.body;
    const sellerEmail = req.session.user.email;

     if (!name || !category || price === undefined || stock === undefined || !imageUrl) {
        req.flash('error_msg', 'Please fill in all required fields (Name, Category, Price, Stock, Image URL).');
        return res.redirect('/admin/upload-product');
    }
     if (isNaN(Number(price)) || Number(price) < 0 || isNaN(Number(stock)) || Number(stock) < 0) {
        req.flash('error_msg', 'Price and Stock must be valid non-negative numbers.');
        return res.redirect('/admin/upload-product');
     }

    try {
        const newProduct = new Product({
            name: name.trim(),
            category: category.trim(),
            price: Number(price),
            stock: Number(stock),
            imageUrl: imageUrl.trim(),
            specifications: specifications ? specifications.trim() : '',
            sellerEmail
        });

        await newProduct.save();
        req.flash('success_msg', `Product "${newProduct.name}" uploaded successfully.`);
        res.redirect('/admin/manage-products');

    } catch (error) {
        if (error.name === 'ValidationError') {
           let errors = Object.values(error.errors).map(el => el.message);
           req.flash('error_msg', `Validation Error: ${errors.join(' ')}`);
           return res.redirect('/admin/upload-product');
       }
        next(error);
    }
};

 exports.updateProduct = async (req, res, next) => {
    const productId = req.params.id;
    const { name, category, price, stock, imageUrl, specifications } = req.body;

     if (!name || !category || price === undefined || stock === undefined || !imageUrl) {
        req.flash('error_msg', 'Please fill in all required fields.');
        return res.redirect(`/admin/manage-products/edit/${productId}`);
    }
     if (isNaN(Number(price)) || Number(price) < 0 || isNaN(Number(stock)) || Number(stock) < 0) {
         req.flash('error_msg', 'Price and Stock must be valid non-negative numbers.');
        return res.redirect(`/admin/manage-products/edit/${productId}`);
    }

    try {
        const product = await Product.findById(productId);
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

         await product.save();
         req.flash('success_msg', `Product "${product.name}" updated successfully.`);
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
        next(error);
     }
 };

exports.removeProduct = async (req, res, next) => {
    const productId = req.params.id;
    try {
         const product = await Product.findByIdAndDelete(productId);
        if (!product) {
             req.flash('error_msg', 'Product not found.');
            return res.status(404).redirect('/admin/manage-products');
         }
         req.flash('success_msg', `Product "${product.name}" removed successfully.`);
         res.redirect('/admin/manage-products');
    } catch (error) {
        if (error.name === 'CastError') {
             req.flash('error_msg', 'Invalid product ID format.');
             return res.status(400).redirect('/admin/manage-products');
         }
        next(error);
    }
};


exports.sendDirectDeliveryOtpByAdmin = async (req, res, next) => {
    const { orderId } = req.params;
    try {
        const result = await generateAndSendDirectDeliveryOTPByAdmin(orderId);
        req.flash('success_msg', result.message + ' Ask customer for OTP to confirm delivery.');
    } catch (error) {
        req.flash('error_msg', `Failed to send direct delivery OTP: ${error.message}`);
    }
    res.redirect('/admin/manage-orders');
};

exports.confirmDirectDeliveryByAdmin = async (req, res, next) => {
    const { orderId } = req.params;
    const { otp } = req.body;
    const adminUserId = req.session.user._id;

    if (!otp || !/^\d{6}$/.test(otp.trim())) {
        req.flash('error_msg', 'Please enter the 6-digit OTP received by the customer.');
        return res.redirect('/admin/manage-orders');
    }

    try {
        const { order } = await confirmDirectDeliveryByAdmin(orderId, adminUserId, otp.trim(), res);
        req.flash('success_msg', `Order ${orderId} confirmed delivered successfully (Directly by Admin).`);
    } catch (error) {
        req.flash('error_msg', `Direct delivery confirmation failed: ${error.message}`);
    }
    res.redirect('/admin/manage-orders');
};


exports.cancelOrderByAdmin = async (req, res, next) => {
    const { orderId } = req.params;
    const { reason } = req.body;
    const adminUserId = req.session.user._id;

    if (!reason || !cancellationReasons.includes(reason)) {
        req.flash('error_msg', 'Please select a valid reason for cancellation.');
        return res.redirect('/admin/manage-orders');
    }

    const sessionDB = await mongoose.startSession();
    sessionDB.startTransaction();
    try {
        const order = await Order.findById(orderId)
                                .populate('products.productId', 'name _id')
                                .session(sessionDB);

        if (!order) {
            req.flash('error_msg', 'Order not found.');
            await sessionDB.abortTransaction(); sessionDB.endSession();
            return res.status(404).redirect('/admin/manage-orders');
        }
        if (order.status !== 'Pending') {
            req.flash('error_msg', `Order cannot be cancelled by admin in its current status ('${order.status}'). Must be 'Pending'.`);
            await sessionDB.abortTransaction(); sessionDB.endSession();
            return res.redirect('/admin/manage-orders');
        }

        console.log(`Admin Cancellation (${adminUserId}): Attempting to restore stock for cancelled order ${orderId}.`);
        const productStockRestorePromises = order.products.map(item => {
              const quantityToRestore = Number(item.quantity);
             if (isNaN(quantityToRestore) || quantityToRestore <= 0) {
                console.warn(`Admin Cancel: Invalid quantity ${item.quantity} for product ${item.productId?._id || 'Unknown ID'} in order ${orderId}, skipping stock restore.`);
                return Promise.resolve();
            }
            if (!item.productId?._id) {
                console.warn(`Admin Cancel: Missing or invalid productId for an item in order ${orderId}, skipping stock restore.`);
                return Promise.resolve();
            }
             return Product.updateOne(
                { _id: item.productId._id },
                { $inc: { stock: quantityToRestore, orderCount: -1 } },
                { session: sessionDB }
            ).catch(err => {
               console.error(`Admin Cancel: Failed restore stock/orderCount for product ${item.productId._id} (${item.productId.name}) on order ${orderId}: ${err.message}`);
            });
        });
        await Promise.all(productStockRestorePromises);
        console.log(`Admin Cancel: Stock restoration attempted for order ${orderId}.`);

        order.status = 'Cancelled';
        order.cancellationReason = reason;
        await order.save({ session: sessionDB });

        await sessionDB.commitTransaction();

        try {
            const subjectCust = `Your Order (${order._id}) Has Been Cancelled`;
            const htmlCust = `<p>Your order (${order._id}) has been cancelled by administration.</p><p><strong>Reason:</strong> ${order.cancellationReason}</p><p>Please contact support if you have questions regarding this cancellation.</p>`;
            await sendEmail(order.userEmail, subjectCust, `Your order ${order._id} has been cancelled. Reason: ${order.cancellationReason}`, htmlCust);
        } catch (emailError) {
            console.error(`Failed sending cancellation email to customer for order ${order._id}:`, emailError);
        }

        req.flash('success_msg', `Order ${orderId} cancelled successfully with reason: ${reason}.`);
        res.redirect('/admin/manage-orders');

    } catch (error) {
        await sessionDB.abortTransaction();
        if (error.name === 'CastError') {
            req.flash('error_msg', 'Invalid Order ID format.');
        } else {
            console.error(`Error cancelling order ${orderId} by admin ${adminUserId}:`, error);
            req.flash('error_msg', 'Failed to cancel the order due to an internal error.');
        }
        res.redirect('/admin/manage-orders');
    } finally {
        sessionDB.endSession();
    }
};

exports.updateUserRole = async (req, res, next) => {
    const userId = req.params.id;
    const { role } = req.body;
     const allowedRoles = ['user', 'admin'];
     if (!role || !allowedRoles.includes(role)) {
        req.flash('error_msg', 'Invalid role selected.');
         return res.status(400).redirect('/admin/manage-users');
     }

    try {
        if (req.params.id === req.session.user._id.toString()) {
             req.flash('error_msg', 'You cannot change your own role.');
             return res.redirect('/admin/manage-users');
         }

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
         } else {
             console.error(`Error updating role for user ${userId}:`, error);
            req.flash('error_msg', 'Error updating user role.');
            res.redirect('/admin/manage-users');
         }
    }
};

exports.removeUser = async (req, res, next) => {
    const userId = req.params.id;
    try {

        if (req.params.id === req.session.user._id.toString()) {
            req.flash('error_msg', 'You cannot remove yourself.');
            return res.redirect('/admin/manage-users');
        }

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
         } else {
             console.error(`Error removing user ${userId}:`, error);
            req.flash('error_msg', 'Error removing user.');
            res.redirect('/admin/manage-users');
         }
     }
 };