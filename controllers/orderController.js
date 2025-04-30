// controllers/orderController.js
const Order = require('../models/Order');
const User = require('../models/User');
const Product = require('../models/Product');
const { sendEmail } = require('../config/mailer');
const mongoose = require('mongoose');
const { generateOTP, setOTPExpiration } = require('../services/otpService');
// *** IMPORT NEW SERVICE ***
const { generateEmailHtml } = require('../services/emailTemplateService');

exports.placeOrder = async (req, res, next) => {
    const userId = req.session.user._id;
    const sessionDB = await mongoose.startSession();
    sessionDB.startTransaction({ readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });

    try {
        const user = await User.findById(userId)
                              .populate('cart.productId', 'name price imageUrl stock reviewStatus sellerId')
                              .session(sessionDB);

        if (!user) {
            await sessionDB.abortTransaction(); sessionDB.endSession();
            req.flash('error_msg', 'User session not found. Please log in again.');
            return res.redirect('/auth/login');
        }
        if (!user.cart || user.cart.length === 0) {
             await sessionDB.abortTransaction(); sessionDB.endSession();
            req.flash('error_msg', 'Your cart is empty.');
            return res.redirect('/user/cart');
        }
        if (!user.address || !user.address.name || !user.address.phone || !user.address.pincode || !user.address.cityVillage || !user.address.locality) { // Added locality check
            await sessionDB.abortTransaction(); sessionDB.endSession();
            req.flash('error_msg', 'Please complete your shipping address before placing the order.');
            return res.redirect('/user/checkout');
        }

        let orderProducts = [];
        let totalAmount = 0;
        const productStockUpdates = [];
        let validationFailed = false;
        let validationErrorMessage = 'An issue occurred with your cart. Please review and try again.';
        const itemsToRemoveFromCart = [];

        for (const item of user.cart) {
            const itemQuantity = Number(item.quantity);
            if (isNaN(itemQuantity) || !Number.isInteger(itemQuantity) || itemQuantity <= 0) {
                validationErrorMessage = `Invalid quantity found for an item. It has been removed.`;
                itemsToRemoveFromCart.push(item._id);
                validationFailed = true; continue;
            }
            if (!item.productId || !item.productId._id) {
                 validationErrorMessage = `An invalid product reference was found and removed.`;
                 itemsToRemoveFromCart.push(item._id);
                 validationFailed = true; continue;
            }

            const currentProduct = item.productId;

             if (currentProduct.reviewStatus !== 'approved') {
                validationErrorMessage = `Product "${currentProduct.name}" is not available and has been removed from your cart.`;
                itemsToRemoveFromCart.push(item._id);
                validationFailed = true; continue;
            }
            if (currentProduct.stock < itemQuantity) {
                validationErrorMessage = `Insufficient stock for "${currentProduct.name}". Available: ${currentProduct.stock}. Please update your cart quantity.`;
                validationFailed = true;
                break;
            }

            orderProducts.push({
                productId: currentProduct._id,
                name: currentProduct.name,
                priceAtOrder: currentProduct.price,
                quantity: itemQuantity,
                imageUrl: currentProduct.imageUrl,
                sellerId: currentProduct.sellerId
            });
            totalAmount += currentProduct.price * itemQuantity;
            productStockUpdates.push({
                 productId: currentProduct._id,
                 quantityToDecrement: itemQuantity
             });
        }

        if (validationFailed) {
             if (itemsToRemoveFromCart.length > 0) {
                 await User.updateOne(
                    { _id: userId },
                    { $pull: { cart: { _id: { $in: itemsToRemoveFromCart } } } }
                 ).session(sessionDB);
                 console.log(`Removed ${itemsToRemoveFromCart.length} invalid items from cart for user ${userId}`);
             }
            await sessionDB.abortTransaction(); sessionDB.endSession();

             const updatedUser = await User.findById(userId).select('cart').populate('cart.productId').lean();
             req.session.user.cart = updatedUser ? updatedUser.cart.filter(i => i.productId).map(i => ({ productId: i.productId._id, quantity: i.quantity })) : [];
             await req.session.save();

             req.flash('error_msg', validationErrorMessage);
             return res.redirect('/user/cart');
         }

        for (const update of productStockUpdates) {
            const updateResult = await Product.updateOne(
                { _id: update.productId, stock: { $gte: update.quantityToDecrement } },
                { $inc: { stock: -update.quantityToDecrement, orderCount: 1 } },
                { session: sessionDB }
            );
            if (updateResult.modifiedCount === 0) {
                 await sessionDB.abortTransaction(); sessionDB.endSession();
                 req.flash('error_msg', `Checkout failed: Stock changed for a product during checkout. Please try again.`);
                 return res.redirect('/user/cart');
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
        await order.save({ session: sessionDB });

        user.cart = [];
        await user.save({ session: sessionDB });

        await sessionDB.commitTransaction();

        req.session.user.cart = [];
        await req.session.save();

        // *** UPDATED: Send Confirmation Email using template ***
        try {
            const subject = `Your miniapp Order #${order._id} Has Been Placed!`;
            // Create a more detailed text fallback
            const productListText = order.products.map(p => `- ${p.name} (Qty: ${p.quantity}) @ ₹${p.priceAtOrder.toFixed(2)}`).join('\n');
            const text = `Thank you for your order!\nOrder ID: ${order._id}\nTotal: ₹${order.totalAmount.toFixed(2)}\n\nItems:\n${productListText}\n\nShipping To: ${order.shippingAddress.name}, ${order.shippingAddress.cityVillage}, ${order.shippingAddress.pincode}\n\nWe'll notify you when it ships. You can view status here: ${req.protocol}://${req.get('host')}/orders/my-orders`;

            // Generate HTML using the template
            const productListHTML = order.products.map(p => `<li style="margin-bottom: 5px; padding-left: 0;">${p.name} (Qty: ${p.quantity}) - ₹${p.priceAtOrder.toFixed(2)}</li>`).join('');
            const html = generateEmailHtml({
                recipientName: user.name,
                subject: subject,
                greeting: `Order Confirmation #${order._id}`,
                bodyLines: [
                    `Thank you for your purchase! Your order has been successfully placed and is being processed.`,
                    `<strong>Order ID:</strong> ${order._id}`,
                    `<strong>Total Amount:</strong> ₹${order.totalAmount.toFixed(2)}`,
                    `<strong>Shipping To:</strong> ${order.shippingAddress.name}, ${order.shippingAddress.cityVillage}, ${order.shippingAddress.locality}, ${order.shippingAddress.pincode}`, // Added locality
                    `<h3 style="margin-top: 20px; margin-bottom: 10px; font-size: 16px; border-bottom: 1px solid #eee; padding-bottom: 5px;">Order Summary:</h3>
                     <ul style="list-style: none; padding: 0; margin: 0 0 15px 0;">${productListHTML}</ul>`, // Added bottom margin to ul
                    `We'll send you another email once your order has shipped.`
                ],
                buttonUrl: `${req.protocol}://${req.get('host')}/orders/my-orders`,
                buttonText: 'View Order Status',
                companyName: 'miniapp'
            });

            await sendEmail(user.email, subject, text, html); // Send both text and html
        } catch (emailError) {
            console.error(`Failed sending order confirmation email for order ${order._id}:`, emailError);
        }
        // *** END UPDATE ***

        req.flash('success_msg', 'Order placed successfully!');
        res.redirect('/orders/my-orders');

    } catch (error) {
        if (sessionDB.inTransaction()) {
             await sessionDB.abortTransaction();
        }
        console.error("Order Placement Transaction Error:", error);
        // Provide a slightly more informative error message
        let userErrorMessage = 'Order placement failed due to a server error. Please try again.';
        if (error.message && error.message.includes('Stock changed')) {
            userErrorMessage = error.message; // Use the specific stock error message
        }
        req.flash('error_msg', userErrorMessage);
        res.redirect('/user/cart');
    } finally {
        if (sessionDB && sessionDB.endSession) {
             await sessionDB.endSession();
        }
    }
};

exports.cancelOrder = async (req, res, next) => {
    const orderId = req.params.id;
    const userId = req.session.user._id;
    const sessionDB = await mongoose.startSession();
    sessionDB.startTransaction({ writeConcern: { w: 'majority' }});

    try {
        const order = await Order.findOne({
             _id: orderId,
             userId: userId,
             status: 'Pending',
             cancellationAllowedUntil: { $gt: Date.now() }
        })
        .populate('products.productId', '_id name')
        .populate('userId', 'name') // Populate user name for email
        .session(sessionDB);

        if (!order) {
             await sessionDB.abortTransaction(); sessionDB.endSession();
             req.flash('error_msg', 'Order not found, already processed/cancelled, or cancellation period expired.');
            return res.redirect('/orders/my-orders');
        }

        console.log(`User Cancellation: Restoring stock/orderCount for order ${orderId}.`);
        const productUpdatePromises = order.products.map(item => {
            const quantityToRestore = Number(item.quantity);
            if (!item.productId?._id || isNaN(quantityToRestore) || quantityToRestore <= 0) {
                 console.warn(`User Cancel: Invalid item P.ID ${item.productId?._id} or Qty ${item.quantity} in O.ID ${orderId}. Skipping stock restore.`);
                return Promise.resolve();
             }
             return Product.updateOne(
                 { _id: item.productId._id },
                 { $inc: { stock: quantityToRestore, orderCount: -1 } },
                 { session: sessionDB }
             ).catch(err => {
                console.error(`User Cancel: Failed stock/orderCount restore for P.ID ${item.productId._id} on O.ID ${orderId}: ${err.message}`);
             });
        });
        const results = await Promise.allSettled(productUpdatePromises);
        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                console.error(`Failed promise during stock restore for item index ${index} in order ${orderId}: ${result.reason}`);
            }
        });
        console.log(`User Cancel: Stock/OrderCount restoration process completed for order ${orderId}.`);

        order.status = 'Cancelled';
        order.cancellationReason = "Cancelled by customer";
        await order.save({ session: sessionDB });

        await sessionDB.commitTransaction();

        // *** UPDATED: Send email confirmation using template ***
         try{
             const subject = `Your miniapp Order #${order._id} Has Been Cancelled`;
             const text = `Your order (${order._id}) has been successfully cancelled as requested. Any applicable refund will be processed shortly.`;
             const html = generateEmailHtml({
                  recipientName: order.userId?.name || req.session.user.name, // Use populated name or session name
                  subject: subject,
                  greeting: `Order Cancellation Confirmation`,
                  bodyLines: [
                      `Your order (#${order._id}) has been successfully cancelled as per your request.`,
                      `If any payment was made, a refund will be processed according to our policy. Please allow a few business days for it to reflect in your account.`,
                      `We're sorry to see this order go. We hope to serve you again soon!`
                  ],
                  buttonUrl: `${req.protocol}://${req.get('host')}/`,
                  buttonText: 'Continue Shopping',
                  companyName: 'miniapp'
             });
            await sendEmail(order.userEmail, subject, text, html);
         } catch (emailError){
             console.error(`Failed sending cancellation confirmation email for order ${order._id}:`, emailError);
         }
        // *** END UPDATE ***

        req.flash('success_msg', 'Order cancelled successfully.');
        res.redirect('/orders/my-orders');

    } catch (error) {
         if (sessionDB.inTransaction()) {
             await sessionDB.abortTransaction();
         }
         console.error("Order Cancellation Error:", error);
         req.flash('error_msg', 'Failed to cancel the order due to an internal error.');
         res.redirect('/orders/my-orders');
    } finally {
        if (sessionDB && sessionDB.endSession) { await sessionDB.endSession(); }
    }
};

exports.getMyOrders = async (req, res, next) => {
    try {
        const orders = await Order.find({ userId: req.session.user._id })
                                   .select('-__v')
                                   .sort({ orderDate: -1 })
                                   .populate('products.productId', 'name imageUrl _id price')
                                   .lean();

        const now = Date.now();
        orders.forEach(order => {
            order.isCancellable = order.status === 'Pending' && order.cancellationAllowedUntil && now < new Date(order.cancellationAllowedUntil).getTime();
            order.showDeliveryOtp = order.status === 'Pending' &&
                                    !!order.orderOTP &&
                                    !!order.orderOTPExpires &&
                                    new Date(order.orderOTPExpires).getTime() > now;
        });

        res.render('user/my-orders', {
            title: 'My Orders',
            orders: orders
        });
    } catch (error) {
        console.error("Error fetching user orders:", error);
        next(error);
    }
};

exports.generateAndSendDirectDeliveryOTPByAdmin = async (orderId) => {
    try {
        const order = await Order.findById(orderId);
        if (!order) throw new Error('Order not found.');
        if (order.status !== 'Pending') throw new Error(`Cannot generate OTP for order status '${order.status}'. Must be 'Pending'.`);

        const otp = generateOTP();
        const otpExpires = setOTPExpiration(5);
        order.orderOTP = otp;
        order.orderOTPExpires = otpExpires;
        await order.save();

        const user = await User.findById(order.userId).select('email');
        const userEmail = user ? user.email : '[User Account Missing]';

        console.log(`ADMIN generated Direct Delivery OTP for O.ID ${orderId}. OTP: ${otp}. (User: ${userEmail})`);
        // Optional: Could send an email to the user here if needed, using generateEmailHtml

        return { success: true, message: `OTP generated for order ${orderId}. It is visible on the customer's 'My Orders' page.` };
    } catch (error) {
        console.error(`Error in generateAndSendDirectDeliveryOTPByAdmin for O.ID ${orderId}:`, error);
        throw error;
    }
};

exports.generateAndSendDirectDeliveryOTPBySeller = async (orderId, sellerId) => {
    try {
        const order = await Order.findById(orderId)
                                .populate('products.productId', 'sellerId');

        if (!order) throw new Error('Order not found.');
        if (order.status !== 'Pending') throw new Error(`Cannot generate OTP for order status '${order.status}'. Must be 'Pending'.`);

        const isRelevant = order.products.some(p => p.productId?.sellerId?.toString() === sellerId.toString());
        if (!isRelevant) {
            console.warn(`Seller ${sellerId} attempted OTP generation for unrelated order ${orderId}.`);
            throw new Error('Permission Denied: Order does not contain your products.');
        }

        const otp = generateOTP();
        const otpExpires = setOTPExpiration(5);
        order.orderOTP = otp;
        order.orderOTPExpires = otpExpires;
        await order.save();

        const user = await User.findById(order.userId).select('email');
        const userEmail = user ? user.email : '[User Account Missing]';

        console.log(`SELLER (${sellerId}) generated OTP for O.ID ${orderId}. OTP: ${otp}. (User: ${userEmail})`);
        // Optional: Could send an email to the user here if needed, using generateEmailHtml

        return { success: true, message: `OTP generated for order ${orderId}. It is visible on the customer's 'My Orders' page.` };
    } catch (error) {
        console.error(`Error in generateAndSendDirectDeliveryOTPBySeller for O.ID ${orderId} by Seller ${sellerId}:`, error);
        throw error;
    }
};

exports.confirmDirectDeliveryByAdmin = async (orderId, adminUserId, providedOtp, resForHelper = null) => {
    try {
        const order = await Order.findOne({
           _id: orderId,
           status: 'Pending',
           orderOTP: providedOtp,
           orderOTPExpires: { $gt: Date.now() }
        });

        if (!order) {
           const checkOrder = await Order.findById(orderId).select('status orderOTP orderOTPExpires');
           if (!checkOrder) throw new Error('Order not found.');
           if (checkOrder.status !== 'Pending') throw new Error(`Order status is '${checkOrder.status}', cannot confirm delivery.`);
           if (checkOrder.orderOTP !== providedOtp) throw new Error('Invalid OTP.');
           if (!checkOrder.orderOTPExpires || checkOrder.orderOTPExpires <= Date.now()) throw new Error('Expired OTP.');
           throw new Error('OTP verification failed.');
        }

        order.status = 'Delivered';
        order.receivedByDate = new Date();
        order.orderOTP = undefined;
        order.orderOTPExpires = undefined;
        order.cancellationAllowedUntil = undefined;
        await order.save();

        console.log(`Order ${orderId} confirmed delivered by ADMIN ${adminUserId}`);

        // *** UPDATED: Send Confirmation Email using template ***
        try {
            const subject = `Your miniapp Order #${order._id} Has Been Delivered!`;
            const formattedDeliveryDate = resForHelper?.locals?.formatDateIST(order.receivedByDate) || new Date(order.receivedByDate).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
            const text = `Great news! Your order (${order._id}) has been delivered on ${formattedDeliveryDate}. Confirmed by Admin. Thank you for shopping!`;
            const html = generateEmailHtml({
                recipientName: order.shippingAddress.name,
                subject: subject,
                greeting: `Your Order Has Arrived!`,
                bodyLines: [
                    `Great news! Your order (#${order._id}) has been successfully delivered and confirmed by administration.`,
                    `<strong>Delivered On:</strong> ${formattedDeliveryDate}`,
                    `We hope you enjoy your purchase!`,
                ],
                buttonUrl: `${resForHelper?.req?.protocol || 'http'}://${resForHelper?.req?.get('host') || 'localhost'}/orders/my-orders`,
                buttonText: 'View Order Details',
                companyName: 'miniapp'
            });
           await sendEmail(order.userEmail, subject, text, html);
        } catch (emailError){
            console.error(`Admin Confirm: Failed sending delivery confirmation email for O.ID ${order._id}:`, emailError);
        }
        // *** END UPDATE ***

        return { success: true, order: order };
    } catch (error) {
        console.error(`Error verifying ADMIN Direct Delivery OTP for O.ID ${orderId} by Admin ${adminUserId}:`, error);
        throw error;
   }
};

exports.confirmDirectDeliveryBySeller = async (orderId, sellerId, providedOtp, resForHelper = null) => {
    try {
        const order = await Order.findOne({
            _id: orderId,
            status: 'Pending',
            orderOTP: providedOtp,
            orderOTPExpires: { $gt: Date.now() }
        }).populate('products.productId', 'sellerId');

        if (!order) {
           const checkOrder = await Order.findById(orderId).select('status orderOTP orderOTPExpires');
           if (!checkOrder) throw new Error('Order not found.');
           if (checkOrder.status !== 'Pending') throw new Error(`Order status is '${checkOrder.status}'.`);
           if (checkOrder.orderOTP !== providedOtp) throw new Error('Invalid OTP.');
           if (!checkOrder.orderOTPExpires || checkOrder.orderOTPExpires <= Date.now()) throw new Error('Expired OTP.');
           throw new Error('OTP verification failed.');
        }

        const isRelevant = order.products.some(p => p.productId?.sellerId?.toString() === sellerId.toString());
        if (!isRelevant) {
           console.warn(`Seller ${sellerId} attempted to confirm unrelated order ${orderId}.`);
           throw new Error('Permission Denied: Order does not contain your products.');
        }

        order.status = 'Delivered';
        order.receivedByDate = new Date();
        order.orderOTP = undefined;
        order.orderOTPExpires = undefined;
        order.cancellationAllowedUntil = undefined;
        await order.save();

        console.log(`Order ${orderId} confirmed delivered by SELLER ${sellerId}`);

        // *** UPDATED: Send Confirmation Email using template ***
        try {
           const subject = `Your miniapp Order #${order._id} Has Been Delivered!`;
           const formattedDeliveryDate = resForHelper?.locals?.formatDateIST(order.receivedByDate) || new Date(order.receivedByDate).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
           const text = `Great news! Your order (${order._id}) has been delivered on ${formattedDeliveryDate}. Confirmed by Seller. Thank you for shopping!`;
           const html = generateEmailHtml({
               recipientName: order.shippingAddress.name,
               subject: subject,
               greeting: `Your Order Has Arrived!`,
               bodyLines: [
                   `Great news! Your order (#${order._id}) has been successfully delivered and confirmed by the seller.`,
                   `<strong>Delivered On:</strong> ${formattedDeliveryDate}`,
                   `We hope you enjoy your purchase!`,
               ],
               buttonUrl: `${resForHelper?.req?.protocol || 'http'}://${resForHelper?.req?.get('host') || 'localhost'}/orders/my-orders`,
               buttonText: 'View Order Details',
               companyName: 'miniapp'
           });
           await sendEmail(order.userEmail, subject, text, html);
        } catch (emailError){
            console.error(`Seller Confirm: Failed sending delivery confirmation email for O.ID ${order._id}:`, emailError);
        }
        // *** END UPDATE ***

        return { success: true, order: order };
    } catch (error) {
        console.error(`Error verifying SELLER Direct Delivery OTP for O.ID ${orderId} by Seller ${sellerId}:`, error);
        throw error;
   }
};