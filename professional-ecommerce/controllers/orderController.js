const Order = require('../models/Order');
const User = require('../models/User');
const Product = require('../models/Product');
const { sendEmail } = require('../config/mailer');
const mongoose = require('mongoose');
const { generateOTP, setOTPExpiration } = require('../services/otpService');

exports.placeOrder = async (req, res, next) => {

    try {
        const userId = req.session.user._id;
        const user = await User.findById(userId).populate('cart.productId');

         if (!user || !user.cart || user.cart.length === 0) {
             req.flash('error_msg', 'Your cart is empty or user not found.');
            return res.redirect('/cart');
        }

         if (!user.address || !user.address.name || !user.address.phone || !user.address.pincode || !user.address.cityVillage) {
             req.flash('error_msg', 'Please save your shipping address before placing the order.');
            return res.redirect('/user/checkout');
         }

        let orderProducts = [];
        let totalAmount = 0;
         const productUpdatePromises = [];

        for (const item of user.cart) {
            if (!item.productId) {
                 req.flash('error_msg', `One of the products in your cart is no longer available.`);
                 return res.redirect('/cart');
            }

             const product = item.productId;

            if (product.stock < item.quantity) {
                 req.flash('error_msg', `Insufficient stock for ${product.name}. Available: ${product.stock}. Please update your cart.`);
                return res.redirect('/cart');
             }

             orderProducts.push({
                productId: product._id,
                name: product.name,
                priceAtOrder: product.price,
                quantity: item.quantity,
                 imageUrl: product.imageUrl,
            });

            totalAmount += product.price * item.quantity;

            productUpdatePromises.push(
                 Product.updateOne(
                     { _id: product._id, stock: { $gte: item.quantity } },
                     { $inc: { stock: -item.quantity, orderCount: 1 } }

                )
            );
        }

        const productUpdateResults = await Promise.all(productUpdatePromises);

         if (productUpdateResults.some(result => result.modifiedCount === 0)) {
             req.flash('error_msg', 'Stock level changed for an item during checkout. Please review your cart and try again.');
             console.error(`Order placement failed for user ${userId}: Stock inconsistency detected.`);
              return res.redirect('/cart');
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


        await order.save();

        user.cart = [];
        await user.save();

         req.session.user.cart = [];


          try{
             const subject = 'Your Order Has Been Placed!';
            let productListHTML = order.products.map(p => `<li>${p.name} (Qty: ${p.quantity}) - $${p.priceAtOrder.toFixed(2)}</li>`).join('');
            const html = `<h2>Thank you for your order!</h2>
                          <p>Your Order ID: ${order._id}</p>
                          <p>Total Amount: $${order.totalAmount.toFixed(2)}</p>
                         <p>Shipping To: ${order.shippingAddress.name}, ${order.shippingAddress.cityVillage}</p>
                         <h3>Items:</h3>
                         <ul>${productListHTML}</ul>
                         <p>You can track your order status in the 'My Orders' section.</p>`;
            await sendEmail(user.email, subject, `Your order ${order._id} has been placed. Total: $${order.totalAmount.toFixed(2)}`, html);
          } catch (emailError){
             console.error(`Failed to send order confirmation email for order ${order._id}:`, emailError);
          }


        req.flash('success_msg', 'Order placed successfully!');
        res.redirect('/orders/my-orders');

    } catch (error) {
        console.error("Order Placement Error:", error);

         if (error.message.includes("stock")) {
            req.flash('error_msg', 'Stock level changed for an item during checkout. Please try again.');
            return res.redirect('/cart');
         }

        next(error);
    }
};

exports.getMyOrders = async (req, res, next) => {
    try {
        const orders = await Order.find({ userId: req.session.user._id })
                                   .sort({ orderDate: -1 })
                                   .lean();

         const now = Date.now();
        orders.forEach(order => {
             order.isCancellable = order.status === 'Pending' && order.cancellationAllowedUntil && now < new Date(order.cancellationAllowedUntil).getTime();
            order.formattedOrderDate = new Date(order.orderDate).toLocaleString();
            order.formattedReceivedDate = order.receivedByDate ? new Date(order.receivedByDate).toLocaleString() : 'N/A';
         });


        res.render('user/my-orders', {
            title: 'My Orders',
            orders: orders
        });
    } catch (error) {
        next(error);
    }
};

exports.cancelOrder = async (req, res, next) => {
    try {
        const orderId = req.params.id;
        const userId = req.session.user._id;

        const order = await Order.findOne({
             _id: orderId,
            userId: userId,
            status: 'Pending',
             cancellationAllowedUntil: { $gt: Date.now() }
        });

        if (!order) {
             req.flash('error_msg', 'Order not found, already processed, or cancellation period expired.');
            return res.redirect('/orders/my-orders');
        }

         const productStockRestorePromises = order.products.map(item => {
             return Product.updateOne(
                 { _id: item.productId },
                 { $inc: { stock: item.quantity, orderCount: -1 } }

             );
        });


        await Promise.all(productStockRestorePromises);

        order.status = 'Cancelled';
         order.receivedByDate = undefined;
         await order.save();

         try{
             const subject = 'Your Order Has Been Cancelled';
             const html = `<p>Your order (${order._id}) has been successfully cancelled.</p>`;
            await sendEmail(order.userEmail, subject, `Order ${order._id} cancelled.`, html);
         } catch (emailError){
             console.error(`Failed to send cancellation email for order ${order._id}:`, emailError);
         }

        req.flash('success_msg', 'Order cancelled successfully.');
        res.redirect('/orders/my-orders');

    } catch (error) {
         console.error("Order Cancellation Error:", error);
        next(error);
    }
};

 exports.verifyOrderWithOTP = async (adminUserId, orderId, providedOtp) => {

    try {
         const order = await Order.findOne({
            _id: orderId,
            status: 'Pending',
             orderOTP: providedOtp,
             orderOTPExpires: { $gt: Date.now() }
        });

         if (!order) {
             throw new Error('Invalid or expired OTP, or order cannot be verified.');
         }

         order.status = 'Order Received';
         order.orderOTP = undefined;
         order.orderOTPExpires = undefined;

         await order.save();


        try{
             const subject = `Order Status Updated: ${order.status}`;
             const html = `<p>The status of your order (${order._id}) has been updated to: <strong>${order.status}</strong>.</p>
                           <p>You can view your order details in the 'My Orders' section.</p>`;
            await sendEmail(order.userEmail, subject, `Your order ${order._id} status: ${order.status}.`, html);
         } catch (emailError){
             console.error(`Failed to send status update email for order ${order._id}:`, emailError);
         }

        return { success: true, order: order };

    } catch (error) {
        console.error(`Error verifying order OTP for order ${orderId}:`, error);
         throw error;
    }

 };

 exports.generateAndSendOrderVerificationOTP = async (orderId) => {
     try {
         const order = await Order.findById(orderId);
         if (!order) {
             throw new Error('Order not found.');
         }
        if (order.status !== 'Pending') {
             throw new Error('Order cannot be verified in its current state.');
         }

        const otp = generateOTP();
         const otpExpires = setOTPExpiration(10);

        order.orderOTP = otp;
        order.orderOTPExpires = otpExpires;
        await order.save();

         const subject = 'Admin Verification Request - Action Required';
         const text = `An admin is attempting to verify your order (${order._id}).\nPlease provide them with the following OTP: ${otp}\nIt will expire in 10 minutes.\nIf you did not request this verification or suspect suspicious activity, please contact support immediately.`;
         const html = `<p>An admin is attempting to verify your order (${order._id}).</p>
                      <p>Please provide the admin with the following OTP: <strong>${otp}</strong></p>
                      <p>The OTP will expire in 10 minutes.</p>
                      <p><strong>Do not share this OTP if you did not expect this verification.</strong> If you suspect suspicious activity, please contact support immediately.</p>`;

        const emailSent = await sendEmail(order.userEmail, subject, text, html);

        if (!emailSent) {
            order.orderOTP = undefined;
             order.orderOTPExpires = undefined;
             await order.save();
            throw new Error('Failed to send verification OTP email to the customer.');
         }

        return { success: true, message: `OTP sent to user ${order.userEmail}.` };

    } catch (error) {
         console.error(`Error sending verification OTP for order ${orderId}:`, error);
         throw error;
     }
 };

 exports.markOrderAsDelivered = async (orderId, deliveryAdminId) => {
     try {
        const order = await Order.findOne({
            _id: orderId,
            assignedTo: deliveryAdminId,
             status: { $in: ['Order Received', 'Out for Delivery'] }
        });

         if (!order) {
            throw new Error('Order not found, not assigned to you, or cannot be marked as delivered in its current state.');
        }

        order.status = 'Delivered';
         order.receivedByDate = new Date();


         await order.save();

        try{
             const subject = `Your Order Has Been Delivered!`;
             const html = `<p>Great news! Your order (${order._id}) has been delivered.</p>
                           <p>Received Date: ${order.receivedByDate.toLocaleString()}</p>
                          <p>Thank you for shopping with us!</p>`;
            await sendEmail(order.userEmail, subject, `Your order ${order._id} has been delivered.`, html);
         } catch (emailError){
             console.error(`Failed to send delivery confirmation email for order ${order._id}:`, emailError);
         }

        return { success: true, order };

     } catch (error) {
         console.error(`Error marking order ${orderId} as delivered by ${deliveryAdminId}:`, error);
        throw error;
    }
 };
