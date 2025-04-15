// controllers/orderController.js
const Order = require('../models/Order');
const User = require('../models/User');
const Product = require('../models/Product');
const { sendEmail } = require('../config/mailer'); // Keep require, might be used elsewhere
const mongoose = require('mongoose');
const { generateOTP, setOTPExpiration } = require('../services/otpService');

// --- placeOrder (Existing Code) ---
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
                break; // Stop processing cart
            }
            if (!item.productId || typeof item.productId !== 'object') {
                console.warn(`User ${userId} cart contains invalid item reference: ${item._id}. Removing.`);
                // Attempt to remove the invalid item from the user's cart in the DB
                await User.updateOne({ _id: userId }, { $pull: { cart: { _id: item._id } } });
                req.flash('error_msg', `An invalid item was detected and removed from your cart. Please review your cart and checkout again.`);
                validationFailed = true;
                break; // Stop processing cart
            }
            // Fetch the product again to ensure the latest stock and details
            const currentProduct = await Product.findById(item.productId._id).select('stock name price imageUrl');
            if (!currentProduct) {
                req.flash('error_msg', `Product "${item.productId.name || 'ID: '+item.productId._id}" is no longer available. Please remove it from your cart.`);
                validationFailed = true;
                 // Attempt to remove the now-missing product from the user's cart
                await User.updateOne({ _id: userId }, { $pull: { cart: { productId: item.productId._id } } });
                break; // Stop processing cart
            }
            if (currentProduct.stock < itemQuantity) {
                req.flash('error_msg', `Insufficient stock for "${currentProduct.name}". Available: ${currentProduct.stock}. Your cart has ${itemQuantity}. Please update your cart.`);
                validationFailed = true;
                break; // Stop processing cart
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

        // If validation failed, reload cart (session will be updated) and redirect
        if (validationFailed) {
            // Refresh session cart data after potential DB removals
            const updatedUser = await User.findById(userId).select('cart').populate('cart.productId').lean();
            req.session.user.cart = updatedUser ? updatedUser.cart : [];
            await req.session.save();
            return res.redirect('/user/cart');
        }

        // 2. Perform Operations within a transaction for atomicity (Optional but recommended)
        const sessionDB = await mongoose.startSession();
        sessionDB.startTransaction();
        try {
            // Decrement stock and increment orderCount
            for (const update of productUpdates) {
                const updateResult = await Product.updateOne(
                    { _id: update.productId, stock: { $gte: update.quantityToDecrement } },
                    { $inc: { stock: -update.quantityToDecrement, orderCount: 1 } },
                    { session: sessionDB } // Add session to operation
                );
                // Check if stock was sufficient *at the time of update*
                if (updateResult.modifiedCount === 0 && updateResult.matchedCount === 1) {
                     throw new Error(`Stock level changed concurrently for a product (ID: ${update.productId}). Please try again.`);
                 }
                 if(updateResult.matchedCount === 0) {
                      throw new Error(`A product (ID: ${update.productId}) was not found or removed during checkout. Please review your cart.`);
                 }
            }

            // Create the order
            const order = new Order({
                userId: userId,
                userEmail: user.email,
                products: orderProducts,
                totalAmount: totalAmount,
                shippingAddress: user.address,
                paymentMethod: 'COD', // Assuming COD only for now
                status: 'Pending',
                // orderDate and cancellationAllowedUntil are set by default/pre-save hook
            });
            await order.save({ session: sessionDB }); // Add session to save

            // Clear user's cart
            user.cart = [];
            await user.save({ session: sessionDB }); // Add session to save

            // Commit the transaction
            await sessionDB.commitTransaction();

            // Update session cart *after* successful transaction
            req.session.user.cart = [];
            await req.session.save();

            // Send Confirmation Email (Best Effort - outside transaction)
            try {
                const subject = 'Your Order Has Been Placed!';
                let productListHTML = order.products.map(p => `<li>${p.name} (Qty: ${p.quantity}) - ₹${p.priceAtOrder.toFixed(2)}</li>`).join('');
                // --- USE formatDateIST from res.locals ---
                const formattedOrderDate = res.locals.formatDateIST(order.orderDate); // Access helper via res.locals
                const html = `<h2>Thank you for your order!</h2><p>Your Order ID: ${order._id}</p><p>Order Placed: ${formattedOrderDate}</p><p>Total Amount: ₹${order.totalAmount.toFixed(2)}</p><p>Shipping To: ${order.shippingAddress.name}, ${order.shippingAddress.cityVillage}</p><h3>Items:</h3><ul>${productListHTML}</ul><p>You can track your order status in the 'My Orders' section.</p>`;
                await sendEmail(user.email, subject, `Your order ${order._id} has been placed. Total: ₹${totalAmount.toFixed(2)}`, html);
            } catch (emailError) {
                console.error(`Failed to send order confirmation email for order ${order._id}:`, emailError);
                // Don't fail the entire request if email fails, but log it.
            }

            req.flash('success_msg', 'Order placed successfully!');
            res.redirect('/orders/my-orders');

        } catch (error) {
            // If any error occurs, abort the transaction
            await sessionDB.abortTransaction();
            console.error("Error during order transaction:", error);
            req.flash('error_msg', `Order placement failed: ${error.message}. Your cart has not been modified. Please try again.`);
            // Redirect back to cart as the order failed
            res.redirect('/user/cart');
        } finally {
            // End the session
            sessionDB.endSession();
        }

    } catch (error) {
        // Handle errors outside the transaction block (e.g., initial user/cart fetch)
        console.error("Outer Order Placement Error:", error);
        next(error); // Pass to the main error handler
    }
};
// --- END placeOrder ---

// --- cancelOrder (User) (Existing Code) ---
exports.cancelOrder = async (req, res, next) => {
    const sessionDB = await mongoose.startSession(); // Use transaction for stock restore + order update
    sessionDB.startTransaction();
    try {
        const orderId = req.params.id;
        const userId = req.session.user._id;

        const order = await Order.findOne({
             _id: orderId,
            userId: userId,
            status: 'Pending',
             cancellationAllowedUntil: { $gt: Date.now() }
        }).populate('products.productId', '_id').session(sessionDB); // Add session

        if (!order) {
             req.flash('error_msg', 'Order not found, already processed, or cancellation period expired.');
            await sessionDB.abortTransaction(); sessionDB.endSession();
            return res.redirect('/orders/my-orders');
        }

        // Restore stock (best effort within transaction)
        console.log(`User Cancellation: Attempting to restore stock for order ${orderId}.`);
        const productStockRestorePromises = order.products.map(item => {
             const quantityToRestore = Number(item.quantity);
             if (isNaN(quantityToRestore) || quantityToRestore <= 0) return Promise.resolve();
              if (!item.productId?._id) {
                  console.error(`User Cancel: Missing or invalid productId for item in order ${orderId}`);
                  return Promise.resolve();
              }
             // Add session to stock update
             return Product.updateOne(
                 { _id: item.productId._id },
                 { $inc: { stock: quantityToRestore, orderCount: -1 } },
                 { session: sessionDB }
             ).catch(err => {
                // Log error but don't necessarily fail transaction if one product fails? Depends on requirements.
                // For now, we let it proceed, but log the failure.
                console.error(`User Cancel: Failed to restore stock/orderCount for product ${item.productId._id} on cancelling order ${orderId}: ${err.message}`);
             });
        });
        await Promise.all(productStockRestorePromises);
        console.log(`User Cancel: Stock restoration attempted for order ${orderId}.`);

        order.status = 'Cancelled';
        order.cancellationReason = "Cancelled by customer";
        await order.save({ session: sessionDB }); // Save order within transaction

        await sessionDB.commitTransaction(); // Commit successful cancellation and stock restore

         // Send email (best effort, outside transaction)
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
         await sessionDB.abortTransaction(); // Abort transaction on any error
         console.error("Order Cancellation Error:", error);
         if (error.name === 'CastError') {
             req.flash('error_msg', 'Invalid order ID format.');
         } else {
            req.flash('error_msg', 'Failed to cancel the order due to an internal error.');
         }
         res.redirect('/orders/my-orders');
    } finally {
        sessionDB.endSession(); // Always end session
    }
};
// --- END cancelOrder ---

// --- Get User's Orders (Includes OTP Logic) ---
exports.getMyOrders = async (req, res, next) => {
    try {
        const orders = await Order.find({ userId: req.session.user._id })
                                   // Select all fields needed, including OTP fields and cancellation reason
                                   .select('+cancellationReason +orderOTP +orderOTPExpires')
                                   .sort({ orderDate: -1 })
                                   .lean(); // Use lean for performance

        const now = Date.now();
        orders.forEach(order => {
            // Determine if the order is cancellable by the user
            order.isCancellable = order.status === 'Pending' && order.cancellationAllowedUntil && now < new Date(order.cancellationAllowedUntil).getTime();

            // --- Determine if Delivery OTP should be shown ---
            order.showDeliveryOtp = order.status === 'Pending' &&
                                    order.orderOTP &&
                                    order.orderOTPExpires &&
                                    new Date(order.orderOTPExpires).getTime() > now;
            // ------------------------------------------------------

            // Dates will be formatted in the EJS template using the helper
        });

        res.render('user/my-orders', {
            title: 'My Orders',
            orders: orders // Pass orders with raw dates and new showDeliveryOtp flag
        });
    } catch (error) {
        console.error("Error fetching user orders:", error);
        next(error); // Pass to global error handler
    }
};
// --- END Get User's Orders ---

// --- Admin Direct Delivery OTP (Email Sending Removed) ---
exports.generateAndSendDirectDeliveryOTPByAdmin = async (orderId) => {
     try {
         const order = await Order.findById(orderId);
         if (!order) throw new Error('Order not found.');
         if (order.status !== 'Pending') throw new Error(`Cannot generate OTP for order with status '${order.status}'. Must be 'Pending'.`);

         const otp = generateOTP();
         const otpExpires = setOTPExpiration(5); // 5 mins expiry for delivery OTP
         order.orderOTP = otp;
         order.orderOTPExpires = otpExpires;
         await order.save(); // Save OTP to order

         const user = await User.findById(order.userId).select('email'); // Still useful for the message
         if (!user) {
             // Clean up OTP if user not found (good practice)
             order.orderOTP = undefined; order.orderOTPExpires = undefined; await order.save();
             // Throw error as we can't confirm who the customer is even for the message
             throw new Error('Customer user account not found for this order.');
         }

         // --- Email Sending Section REMOVED/COMMENTED ---
         /*
         const subject = 'Confirming Delivery - Action Required';
         const text = `An administrator is ready to complete the delivery for your order (${order._id}).\nPlease provide them with the following OTP to confirm you have received your items: ${otp}\nIt will expire in 5 minutes.\nDo not share if you haven't received your items.`;
         const html = `<p>An administrator is ready to complete the delivery for your order (${order._id}).</p><p>Please provide the administrator with the following OTP to confirm you have received your items: <strong>${otp}</strong></p><p>The OTP will expire in 5 minutes.</p><p><strong>Only share this OTP once you have received your items from the administrator.</strong></p>`;

        const emailSent = await sendEmail(user.email, subject, text, html);
        if (!emailSent) {
            // Clean up OTP if email fails (optional, but perhaps less critical now)
            // order.orderOTP = undefined; order.orderOTPExpires = undefined; await order.save();
            // throw new Error('Failed to send direct delivery confirmation OTP email to the customer.');
            console.warn(`Direct delivery OTP generated for order ${orderId}, but email sending is disabled.`);
         }
         */
         // --- End of Removed Email Section ---

        // Adjust success message
        console.log(`Direct delivery OTP generated for order ${orderId} (Email sending disabled). OTP: ${otp}`); // Log OTP for admin reference if needed
        return { success: true, message: `OTP generated for order ${orderId}. It's available on the customer's 'My Orders' page.` };

    } catch (error) {
         console.error(`Error generating ADMIN Direct Delivery OTP for order ${orderId}:`, error);
         // Re-throw the error to be caught by the caller controller
         throw error;
     }
 };
 // --- END generateAndSendDirectDeliveryOTPByAdmin ---

// --- Verify OTP and Confirm Delivery Directly By Admin (Existing Code) ---
// Added 'resForHelper' parameter to access the date formatter
exports.confirmDirectDeliveryByAdmin = async (orderId, adminUserId, providedOtp, resForHelper) => {
     try {
         const order = await Order.findOne({
            _id: orderId,
            status: 'Pending', // Can only confirm delivery if Pending
             orderOTP: providedOtp,
             orderOTPExpires: { $gt: Date.now() } // Check OTP expiry
         });

         if (!order) {
            // Provide more specific feedback if OTP is wrong vs order status changed
            const checkOrder = await Order.findById(orderId);
            if (!checkOrder) throw new Error('Order not found.');
            if (checkOrder.status !== 'Pending') throw new Error(`Order status is '${checkOrder.status}', cannot confirm direct delivery from this state.`);
            // If order exists and is Pending, the OTP must be wrong/expired
            throw new Error('Invalid or expired OTP.');
        }

        // OTP is valid: Update Order
        order.status = 'Delivered';
        order.receivedByDate = new Date(); // Set delivery time
        // OTP fields should be cleared by the pre-save hook in Order.js when status changes
        await order.save();

        // Send Delivery Confirmation Email (Best Effort - STILL SEND CONFIRMATION EMAIL)
        try {
             const subject = `Your Order Has Been Delivered!`;
             // --- USE formatDateIST from resForHelper.locals (if available) ---
             const formattedDeliveryDate = (resForHelper && resForHelper.locals && typeof resForHelper.locals.formatDateIST === 'function')
                 ? resForHelper.locals.formatDateIST(order.receivedByDate)
                 : new Date(order.receivedByDate).toLocaleString(); // Fallback to default locale string

             const html = `<p>Great news! Your order (${order._id}) has been successfully delivered and confirmed by administration.</p><p>Received Date: ${formattedDeliveryDate}</p><p>Thank you for shopping with us!</p>`;
            await sendEmail(order.userEmail, subject, `Your order ${order._id} has been delivered.`, html);
         } catch (emailError){
             // Log error but don't fail the confirmation
             console.error(`Failed sending direct delivery confirmation email for order ${order._id}:`, emailError);
         }
        // Return the updated order object
        return { success: true, order: order };
     } catch (error) {
         // Log the error and re-throw to be handled by the calling controller
         console.error(`Error verifying ADMIN Direct Delivery OTP for order ${orderId}:`, error);
        throw error;
    }
};
// --- END confirmDirectDeliveryByAdmin ---