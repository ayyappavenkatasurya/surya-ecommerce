// controllers/orderController.js
const Order = require('../models/Order');
const User = require('../models/User');
const Product = require('../models/Product');
const { sendEmail } = require('../config/mailer');
const mongoose = require('mongoose');
const { generateOTP, setOTPExpiration } = require('../services/otpService');

// --- UPDATED placeOrder ---
exports.placeOrder = async (req, res, next) => {
    try {
        const userId = req.session.user._id;
        const user = await User.findById(userId).populate('cart.productId');

        if (!user) {
            req.flash('error_msg', 'User session not found. Please log in again.');
            return res.redirect('/auth/login');
        }
        if (!user.cart || user.cart.length === 0) {
            req.flash('error_msg', 'Your cart is empty.');
            return res.redirect('/user/cart');
        }
        if (!user.address || !user.address.name || !user.address.phone || !user.address.pincode || !user.address.cityVillage) {
            req.flash('error_msg', 'Please save your shipping address before placing the order.');
            return res.redirect('/user/checkout');
        }

        let orderProducts = [];
        let totalAmount = 0;
        const productUpdates = [];
        let validationFailed = false;

        // 1. Validate stock AND quantity, prepare order data
        for (const item of user.cart) {
            const itemQuantity = Number(item.quantity);
            if (isNaN(itemQuantity) || !Number.isInteger(itemQuantity) || itemQuantity <= 0) {
                console.error(`Invalid quantity found in cart for user ${userId}, product ID ${item.productId?._id || 'N/A'}: ${item.quantity}`);
                req.flash('error_msg', `An item in your cart has an invalid quantity (${item.quantity || 'empty'}). Please remove or update it.`);
                validationFailed = true;
                break;
            }
            if (!item.productId || typeof item.productId !== 'object') {
                console.warn(`User ${userId} cart contains invalid item reference: ${item._id}. Removing.`);
                await User.updateOne({ _id: userId }, { $pull: { cart: { _id: item._id } } });
                req.flash('error_msg', `An invalid item was detected and removed from your cart. Please review your cart and checkout again.`);
                validationFailed = true;
                break;
            }
            const currentProduct = await Product.findById(item.productId._id).select('stock name price imageUrl');
            if (!currentProduct) {
                req.flash('error_msg', `Product "${item.productId.name || 'ID: '+item.productId._id}" is no longer available. Please remove it from your cart.`);
                validationFailed = true;
                await User.updateOne({ _id: userId }, { $pull: { cart: { productId: item.productId._id } } });
                break;
            }
            if (currentProduct.stock < itemQuantity) {
                req.flash('error_msg', `Insufficient stock for "${currentProduct.name}". Available: ${currentProduct.stock}. Your cart has ${itemQuantity}. Please update your cart.`);
                validationFailed = true;
                break;
            }
            orderProducts.push({
                productId: currentProduct._id,
                name: currentProduct.name,
                priceAtOrder: currentProduct.price,
                quantity: itemQuantity,
                imageUrl: currentProduct.imageUrl,
            });
            totalAmount += currentProduct.price * itemQuantity;
            productUpdates.push({
                productId: currentProduct._id,
                quantityToDecrement: itemQuantity
            });
        }

        if (validationFailed) {
            const updatedUser = await User.findById(userId).select('cart');
            req.session.user.cart = updatedUser ? updatedUser.cart : [];
            await req.session.save();
            return res.redirect('/user/cart');
        }

        // 2. Perform Operations
        try {
            for (const update of productUpdates) {
                const updateResult = await Product.updateOne(
                    { _id: update.productId, stock: { $gte: update.quantityToDecrement } },
                    { $inc: { stock: -update.quantityToDecrement, orderCount: 1 } }
                );
                if (updateResult.modifiedCount === 0 && updateResult.matchedCount === 1) {
                     throw new Error(`Stock level changed concurrently for a product (ID: ${update.productId}). Please try again.`);
                 }
                 if(updateResult.matchedCount === 0) {
                      throw new Error(`A product (ID: ${update.productId}) was removed during checkout. Please review your cart.`);
                 }
            }
            const order = new Order({
                userId: userId,
                userEmail: user.email,
                products: orderProducts,
                totalAmount: totalAmount,
                shippingAddress: user.address,
                paymentMethod: 'COD',
                status: 'Pending',
            });
            await order.save(); // This will trigger the pre-save hook to set cancellationAllowedUntil

            user.cart = [];
            await user.save();
            req.session.user.cart = [];
            await req.session.save();

            // Send Confirmation Email (Best Effort)
            try {
                const subject = 'Your Order Has Been Placed!';
                let productListHTML = order.products.map(p => `<li>${p.name} (Qty: ${p.quantity}) - ₹${p.priceAtOrder.toFixed(2)}</li>`).join('');
                // Use formatDateIST for confirmation email as well
                const formattedOrderDate = res.locals.formatDateIST(order.orderDate); // Access helper via res.locals
                const html = `<h2>Thank you for your order!</h2><p>Your Order ID: ${order._id}</p><p>Order Placed: ${formattedOrderDate}</p><p>Total Amount: ₹${order.totalAmount.toFixed(2)}</p><p>Shipping To: ${order.shippingAddress.name}, ${order.shippingAddress.cityVillage}</p><h3>Items:</h3><ul>${productListHTML}</ul><p>You can track your order status in the 'My Orders' section.</p>`;
                await sendEmail(user.email, subject, `Your order ${order._id} has been placed. Total: ₹${totalAmount.toFixed(2)}`, html);
            } catch (emailError) {
                console.error(`Failed to send order confirmation email for order ${order._id}:`, emailError);
            }

            req.flash('success_msg', 'Order placed successfully!');
            res.redirect('/orders/my-orders');

        } catch (error) {
            console.error("Error during critical order processing block:", error);
            req.flash('error_msg', `Order placement failed due to an unexpected issue: ${error.message}. Please check 'My Orders' or contact support.`);
            res.redirect('/orders/my-orders');
        }

    } catch (error) {
        console.error("Outer Order Placement Error:", error);
        next(error);
    }
};
// --- END UPDATED placeOrder ---

// --- cancelOrder (User) ---
exports.cancelOrder = async (req, res, next) => {
    try {
        const orderId = req.params.id;
        const userId = req.session.user._id;

        const order = await Order.findOne({
             _id: orderId,
            userId: userId,
            status: 'Pending',
             cancellationAllowedUntil: { $gt: Date.now() }
        }).populate('products.productId', '_id'); // Need _id for stock restore

        if (!order) {
             req.flash('error_msg', 'Order not found, already processed, or cancellation period expired.');
            return res.redirect('/orders/my-orders');
        }

        // Restore stock (best effort)
        console.log(`User Cancellation: Attempting to restore stock for order ${orderId}.`);
        const productStockRestorePromises = order.products.map(item => {
             const quantityToRestore = Number(item.quantity);
             if (isNaN(quantityToRestore) || quantityToRestore <= 0) return Promise.resolve();
              if (!item.productId?._id) {
                  console.error(`User Cancel: Missing or invalid productId for item in order ${orderId}`);
                  return Promise.resolve();
              }
             return Product.updateOne(
                 { _id: item.productId._id },
                 { $inc: { stock: quantityToRestore, orderCount: -1 } }
             ).catch(err => {
                console.error(`User Cancel: Failed to restore stock/orderCount for product ${item.productId._id} on cancelling order ${orderId}: ${err.message}`);
             });
        });
        await Promise.all(productStockRestorePromises);
        console.log(`User Cancel: Stock restoration attempted for order ${orderId}.`);

        order.status = 'Cancelled';
        order.cancellationReason = "Cancelled by customer";
        await order.save(); // pre-save hook clears fields

         try{
             const subject = 'Your Order Has Been Cancelled';
             const html = `<p>Your order (${order._id}) has been successfully cancelled as requested.</p>`;
            await sendEmail(order.userEmail, subject, `Order ${order._id} cancelled.`, html);
         } catch (emailError){
             console.error(`Failed to send cancellation email for order ${order._id}:`, emailError);
         }

        req.flash('success_msg', 'Order cancelled successfully.');
        res.redirect('/orders/my-orders');

    } catch (error) {
         console.error("Order Cancellation Error:", error);
         if (error.name === 'CastError') {
             req.flash('error_msg', 'Invalid order ID format.');
         } else {
            req.flash('error_msg', 'Failed to cancel the order due to an internal error.');
         }
         res.redirect('/orders/my-orders');
    }
};

// --- Get User's Orders ---
exports.getMyOrders = async (req, res, next) => {
    try {
        const orders = await Order.find({ userId: req.session.user._id })
                                   .select('+cancellationReason') // Keep reason
                                   .sort({ orderDate: -1 })
                                   .lean(); // Use lean

         const now = Date.now();
        orders.forEach(order => {
            order.isCancellable = order.status === 'Pending' && order.cancellationAllowedUntil && now < new Date(order.cancellationAllowedUntil).getTime();
            // Removed manual date formatting (formattedOrderDate, formattedReceivedDate)
            // We will use formatDateIST helper in the EJS template
         });

        res.render('user/my-orders', {
            title: 'My Orders',
            orders: orders // Pass orders with raw dates
        });
    } catch (error) {
        console.error("Error fetching user orders:", error);
        next(error);
    }
};

// --- Admin Direct Delivery OTP ---
exports.generateAndSendDirectDeliveryOTPByAdmin = async (orderId) => {
     try {
         const order = await Order.findById(orderId);
         if (!order) throw new Error('Order not found.');
         if (order.status !== 'Pending') throw new Error(`Cannot confirm direct delivery for order with status '${order.status}'. Must be 'Pending'.`);

        const otp = generateOTP();
         const otpExpires = setOTPExpiration(5); // 5 mins
         order.orderOTP = otp;
         order.orderOTPExpires = otpExpires;
         await order.save();

         const user = await User.findById(order.userId).select('email');
         if (!user) {
             order.orderOTP = undefined; order.orderOTPExpires = undefined; await order.save();
             throw new Error('Customer user account not found for sending OTP.');
         }

         // Email to CUSTOMER
         const subject = 'Confirming Delivery - Action Required';
         const text = `An administrator is ready to complete the delivery for your order (${order._id}).\nPlease provide them with the following OTP to confirm you have received your items: ${otp}\nIt will expire in 5 minutes.\nDo not share if you haven't received your items.`;
         const html = `<p>An administrator is ready to complete the delivery for your order (${order._id}).</p><p>Please provide the administrator with the following OTP to confirm you have received your items: <strong>${otp}</strong></p><p>The OTP will expire in 5 minutes.</p><p><strong>Only share this OTP once you have received your items from the administrator.</strong></p>`;

        const emailSent = await sendEmail(user.email, subject, text, html);
        if (!emailSent) {
            order.orderOTP = undefined; order.orderOTPExpires = undefined; await order.save();
            throw new Error('Failed to send direct delivery confirmation OTP email to the customer.');
         }
        return { success: true, message: `Direct delivery confirmation OTP sent to customer ${user.email}.` };
    } catch (error) {
         console.error(`Error sending ADMIN Direct Delivery OTP for order ${orderId}:`, error);
         throw error;
     }
 };

// --- Verify OTP and Confirm Delivery Directly By Admin ---
exports.confirmDirectDeliveryByAdmin = async (orderId, adminUserId, providedOtp) => {
     try {
         const order = await Order.findOne({
            _id: orderId,
            status: 'Pending',
             orderOTP: providedOtp,
             orderOTPExpires: { $gt: Date.now() }
         });

         if (!order) {
            const checkOrder = await Order.findById(orderId);
            if (!checkOrder) throw new Error('Order not found.');
            if (checkOrder.status !== 'Pending') throw new Error(`Order status is '${checkOrder.status}', cannot confirm direct delivery from this state.`);
            throw new Error('Invalid or expired OTP.');
        }

        // OTP Valid: Update Order
        order.status = 'Delivered';
        order.receivedByDate = new Date();
        // OTP fields cleared by pre-save hook
        await order.save();

        // Send Delivery Confirmation Email (Best Effort)
        try {
             const subject = `Your Order Has Been Delivered!`;
             // Use formatDateIST in email as well
             const formattedDeliveryDate = res.locals.formatDateIST(order.receivedByDate); // Assuming res is accessible or pass helper
             const html = `<p>Great news! Your order (${order._id}) has been successfully delivered and confirmed by administration.</p><p>Received Date: ${formattedDeliveryDate}</p><p>Thank you for shopping with us!</p>`;
            await sendEmail(order.userEmail, subject, `Your order ${order._id} has been delivered.`, html);
         } catch (emailError){
             console.error(`Failed sending direct delivery confirmation email for order ${order._id}:`, emailError);
         }
        return { success: true, order: order };
     } catch (error) {
         console.error(`Error verifying ADMIN Direct Delivery OTP for order ${orderId}:`, error);
        throw error;
    }
};