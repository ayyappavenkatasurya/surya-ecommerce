// controllers/deliveryController.js
const Order = require('../models/Order');
const User = require('../models/User');
const Product = require('../models/Product'); // --- ADDED for stock update ---
const { sendEmail } = require('../config/mailer');
const { generateAndSendDeliveryOTP, verifyDeliveryOTP } = require('./orderController');

// --- Define Cancellation Reasons (Consistent with Admin) ---
const cancellationReasons = [
    "📞 Unable to contact the customer",
    "🕒 Delay in shipping/delivery timeframe exceeded",
    "❗ Out of stock/unavailable item",
    "🗺️ Address incorrect/incomplete",
    "🚫 Customer requested cancellation",
    "🚚 Logistics issue/Vehicle breakdown",
    "❓ Other (Admin/Delivery)",
];

// --- Get Contact Page ---
exports.getContactPage = async (req, res, next) => {
    try {
        // Fetch fresh user data to ensure address is up-to-date
        const user = await User.findById(req.session.user._id).select('address.phone').lean();
        const currentPhoneNumber = user?.address?.phone || ''; // Safely access phone

        res.render('delivery/contact', {
            title: 'My Contact Information',
            currentPhoneNumber: currentPhoneNumber
        });
    } catch (error) {
        next(error);
    }
};

// --- Update Contact Info ---
exports.updateContactInfo = async (req, res, next) => {
    const { phone } = req.body;
    const userId = req.session.user._id;

    if (!phone || phone.trim().length < 10 || !/^\d+$/.test(phone.trim())) {
        req.flash('error_msg', 'Please enter a valid phone number (at least 10 digits, numbers only).');
        return res.redirect('/delivery/contact');
    }

    try {
        const user = await User.findById(userId);
        if (!user) {
            req.flash('error_msg', 'User not found.');
            return req.session.destroy(err => {
                if (err) return next(err);
                res.redirect('/auth/login');
            });
        }

        if (!user.address) {
            user.address = {};
        }
        user.address.phone = phone.trim();

        await user.save();

        if (!req.session.user.address) {
             req.session.user.address = {};
        }
        req.session.user.address.phone = user.address.phone;
        await req.session.save();

        req.flash('success_msg', 'Phone number updated successfully.');
        res.redirect('/delivery/dashboard');

    } catch (error) {
        if (error.name === 'ValidationError') {
            let errors = Object.values(error.errors).map(el => el.message);
            req.flash('error_msg', errors.join(' '));
            return res.redirect('/delivery/contact');
       }
        next(error);
    }
};


exports.getDeliveryDashboard = async (req, res, next) => {
  const deliveryAdminId = req.session.user._id;
   const deliveryAdminEmail = req.session.user.email;

  try {
    const totalAssigned = await Order.countDocuments({ assignedTo: deliveryAdminId });
    const pendingCount = await Order.countDocuments({
        assignedTo: deliveryAdminId,
        status: { $nin: ['Delivered', 'Cancelled'] }
     });
     const deliveredCount = await Order.countDocuments({
        assignedTo: deliveryAdminId,
        status: 'Delivered'
     });

    res.render('delivery/dashboard', {
      title: 'Delivery Dashboard',
      assignedAdminEmail: deliveryAdminEmail,
      totalAssigned,
      pendingCount,
      deliveredCount
    });

  } catch (error) {
    next(error);
  }
};

exports.getAssignedOrdersDetail = async (req, res, next) => {
    const deliveryAdminId = req.session.user._id;
    const type = req.params.type; // 'total', 'pending', 'delivered'

    try {
         let query = { assignedTo: deliveryAdminId };
         let pageTitle = `My Assigned Orders`;

         if (type === 'pending') {
            query.status = { $nin: ['Delivered', 'Cancelled'] };
             pageTitle = `My Active Deliveries`;
        } else if (type === 'delivered') {
            query.status = 'Delivered';
            pageTitle = `My Delivered Orders`;
        }

        const orders = await Order.find(query)
                                 .sort({ orderDate: -1 })
                                  .lean();

         orders.forEach(order => {
             order.formattedOrderDate = new Date(order.orderDate).toLocaleString();
             order.formattedReceivedDate = order.receivedByDate ? new Date(order.receivedByDate).toLocaleString() : 'N/A';
             order.canRequestDeliveryOtp = order.status === 'Out for Delivery';
             order.canBeCancelledByDelivery = order.status === 'Out for Delivery';
             order.canBeUnassignedByDelivery = order.status === 'Out for Delivery';
         });

        res.render('delivery/assigned-orders-detail', {
             title: pageTitle,
             orders: orders,
             listType: type,
             cancellationReasons: cancellationReasons
         });

    } catch (error) {
        next(error);
    }
};

// --- Send Delivery OTP Handler ---
exports.sendDeliveryOtp = async (req, res, next) => {
    const { orderId } = req.params;
    const deliveryAdminId = req.session.user._id;

    try {
        const result = await generateAndSendDeliveryOTP(orderId, deliveryAdminId);
        req.flash('success_msg', result.message + ' Ask the customer for the OTP.');
    } catch (error) {
        req.flash('error_msg', `Failed to send delivery OTP: ${error.message}`);
    }
    res.redirect(req.headers.referer || '/delivery/dashboard');
};

// --- Verify Delivery OTP Handler ---
exports.verifyDeliveryOtp = async (req, res, next) => {
     const { orderId } = req.params;
    const { otp } = req.body;
    const deliveryAdminId = req.session.user._id;

    if (!otp || !/^\d{6}$/.test(otp)) {
        req.flash('error_msg', 'Please enter the 6-digit OTP from the customer.');
        return res.redirect(req.headers.referer || '/delivery/dashboard');
    }

    try {
        const { order } = await verifyDeliveryOTP(orderId, deliveryAdminId, otp);
        req.flash('success_msg', `Order ${orderId} confirmed delivered successfully!`);
    } catch (error) {
        req.flash('error_msg', `Delivery confirmation failed: ${error.message}`);
    }
    res.redirect(req.headers.referer || '/delivery/dashboard');
};

// --- UPDATED: Cancel Assigned Order (Delivery Admin) ---
exports.cancelAssignedOrder = async (req, res, next) => {
    const { orderId } = req.params;
    const { reason } = req.body;
    const deliveryAdminId = req.session.user._id;

    if (!reason || !cancellationReasons.includes(reason)) {
        req.flash('error_msg', 'Please select a valid reason for cancellation.');
        return res.redirect(req.headers.referer || '/delivery/orders/pending');
    }

    try {
        const order = await Order.findById(orderId).populate('products.productId', 'name'); // Populate name for logging
        if (!order) {
            req.flash('error_msg', 'Order not found.');
            return res.status(404).redirect('/delivery/orders/pending');
        }

        if (!order.assignedTo || order.assignedTo.toString() !== deliveryAdminId.toString()) {
            req.flash('error_msg', 'You are not assigned to this order.');
            return res.status(403).redirect('/delivery/orders/pending');
        }

        // Only allow cancellation if 'Out for Delivery' (handled by the delivery person)
        if (order.status !== 'Out for Delivery') {
            req.flash('error_msg', `Order cannot be cancelled by you in its current status ('${order.status}'). Must be 'Out for Delivery'.`);
            return res.redirect(req.headers.referer || '/delivery/orders/pending');
        }

        // --- ADDED: Stock Restoration Logic ---
        console.log(`Delivery Cancellation: Attempting to restore stock for cancelled order ${orderId}.`);
        const productStockRestorePromises = order.products.map(item => {
            const quantityToRestore = Number(item.quantity);
            if (isNaN(quantityToRestore) || quantityToRestore <= 0) {
                 console.error(`Delivery Cancel: Invalid quantity ${item.quantity} for product ${item.productId?._id || 'Unknown ID'} in order ${orderId}, skipping stock restore.`);
                 return Promise.resolve();
            }
            if (!item.productId) {
                 console.error(`Delivery Cancel: Missing productId for an item in order ${orderId}, skipping stock restore for this item.`);
                return Promise.resolve();
            }
            return Product.updateOne(
                { _id: item.productId._id },
                { $inc: { stock: quantityToRestore, orderCount: -1 } } // Also decrement order count
            ).catch(err => {
               console.error(`Delivery Cancel: Failed restore stock/orderCount for product ${item.productId._id} (${item.productId.name}) on order ${orderId}: ${err.message}`);
               // Continue despite error (best effort)
            });
        });
        await Promise.all(productStockRestorePromises);
        console.log(`Delivery Cancel: Stock restoration attempted for order ${orderId}.`);
        // --- END Stock Restoration ---

        order.status = 'Cancelled';
        order.cancellationReason = reason;
        // Note: pre-save hook clears assignedTo, OTPs etc. based on 'Cancelled' status
        await order.save();

        // Notify Customer
        try {
            const subjectCust = `Your Order (${order._id}) Delivery Cancelled`;
            const htmlCust = `<p>We regret to inform you that the delivery for your order (${order._id}) has been cancelled by the delivery partner.</p>
                           <p><strong>Reason:</strong> ${order.cancellationReason}</p>
                           <p>We apologize for any inconvenience. Please contact support if you have questions or to rearrange.</p>`;
            await sendEmail(order.userEmail, subjectCust, `Delivery for order ${order._id} cancelled. Reason: ${order.cancellationReason}`, htmlCust);
        } catch (emailError) {
            console.error(`Failed sending delivery cancellation email to customer for order ${order._id}:`, emailError);
        }

        // Notify Admin? (Optional - Admin sees it in manage orders)

        req.flash('success_msg', `Order ${orderId} cancelled successfully with reason: ${reason}.`);
        res.redirect(req.headers.referer || '/delivery/orders/pending');

    } catch (error) {
        if (error.name === 'CastError') {
            req.flash('error_msg', 'Invalid Order ID format.');
        } else {
            console.error(`Error cancelling order ${orderId} by delivery admin ${deliveryAdminId}:`, error);
            req.flash('error_msg', 'Failed to cancel the order.');
        }
        res.redirect(req.headers.referer || '/delivery/orders/pending');
    }
};

// --- Unassign Order (Delivery Admin) ---
exports.unassignOrder = async (req, res, next) => {
    const { orderId } = req.params;
    const deliveryAdminId = req.session.user._id;

    try {
        const order = await Order.findById(orderId);
        if (!order) {
            req.flash('error_msg', 'Order not found.');
            return res.status(404).redirect('/delivery/orders/pending');
        }

        if (!order.assignedTo || order.assignedTo.toString() !== deliveryAdminId.toString()) {
            req.flash('error_msg', 'You are not assigned to this order.');
            return res.status(403).redirect('/delivery/orders/pending');
        }

        if (order.status !== 'Out for Delivery') {
            req.flash('error_msg', `Order cannot be unassigned in its current status ('${order.status}'). Must be 'Out for Delivery'.`);
            return res.redirect(req.headers.referer || '/delivery/orders/pending');
        }

        // No stock adjustment needed for unassigning, just status/assignment change
        order.status = 'Pending'; // Revert to Pending for Admin to re-assign
        order.assignedTo = null;
        order.assignedAdminEmail = null;

        await order.save();

        // Notify Admin? (Optional)
        // Notify Customer? (Maybe not necessary, just appears back in processing state)

        req.flash('success_msg', `Order ${orderId} unassigned successfully. It has been returned to the admin's Pending queue.`);
        res.redirect(req.headers.referer || '/delivery/orders/pending'); // Redirect back to pending list usually

    } catch (error) {
        if (error.name === 'CastError') {
            req.flash('error_msg', 'Invalid Order ID format.');
        } else {
            console.error(`Error unassigning order ${orderId} by delivery admin ${deliveryAdminId}:`, error);
            req.flash('error_msg', 'Failed to unassign the order.');
        }
        res.redirect(req.headers.referer || '/delivery/orders/pending');
    }
};