// controllers/orderController.js
const Order = require('../models/Order');
const User = require('../models/User');
const Product = require('../models/Product');
const { sendEmail } = require('../config/mailer');
const mongoose = require('mongoose');
const { generateOTP, setOTPExpiration } = require('../services/otpService'); // Assuming otpService exists

exports.placeOrder = async (req, res, next) => {
    const userId = req.session.user._id;
    const sessionDB = await mongoose.startSession(); // Start transaction session
    sessionDB.startTransaction();

    try {
        // Get user with cart and address within the transaction
        const user = await User.findById(userId).populate('cart.productId').session(sessionDB);

        // --- Basic Validations ---
        if (!user) {
            throw new Error('User session not found. Please log in again.');
        }
        if (!user.cart || user.cart.length === 0) {
            throw new Error('Your cart is empty.');
        }
        if (!user.address || !user.address.name || !user.address.phone || !user.address.pincode || !user.address.cityVillage) {
            // Redirect outside transaction if possible, but throwing error ensures rollback
            throw new Error('Please save your shipping address before placing the order.');
        }

        let orderProducts = [];
        let totalAmount = 0;
        const productUpdates = []; // To track stock decrements

        // --- Validate Cart Items and Prepare Order WITHIN Transaction ---
        for (const item of user.cart) {
            const itemQuantity = Number(item.quantity);
            // Basic quantity validation
            if (isNaN(itemQuantity) || !Number.isInteger(itemQuantity) || itemQuantity <= 0) {
                throw new Error(`An item in your cart has an invalid quantity (${item.quantity || 'empty'}). Please fix your cart.`);
            }
            // Check if product reference is valid
            if (!item.productId || typeof item.productId !== 'object') {
                // This shouldn't happen if cart cleaning works, but good failsafe
                throw new Error(`An invalid item reference was detected in your cart. Please review your cart.`);
            }

            // --- CRITICAL CHECK: Fetch Product within transaction, check STATUS and STOCK ---
            // Use findOne for safety, ensure it exists, is approved, and has stock
            const currentProduct = await Product.findOne({
                _id: item.productId._id,
                status: 'Approved', // MUST be approved
                stock: { $gte: itemQuantity } // MUST have enough stock
            }).select('stock name price imageUrl').session(sessionDB); // Select necessary fields

            if (!currentProduct) {
                // If product not found, or not approved, or not enough stock
                // Find the original product (even if not approved/in stock) to show name in error
                const originalProduct = await Product.findById(item.productId._id).select('name stock status').lean(); // lean is fine for read-only error message
                if (!originalProduct) {
                    throw new Error(`A product in your cart (ID: ${item.productId._id}) no longer exists. Please remove it.`);
                } else if (originalProduct.status !== 'Approved') {
                    throw new Error(`Product "${originalProduct.name}" is currently unavailable (${originalProduct.status}). Please remove it from your cart.`);
                } else { // Must be stock issue
                     throw new Error(`Insufficient stock for "${originalProduct.name}". Available: ${originalProduct.stock}. Your cart has ${itemQuantity}. Please update your cart.`);
                }
            }
            // --- END CRITICAL CHECK ---

            // If checks pass, add to order details
            orderProducts.push({
                productId: currentProduct._id,
                name: currentProduct.name,
                priceAtOrder: currentProduct.price,
                quantity: itemQuantity,
                imageUrl: currentProduct.imageUrl,
            });
            totalAmount += currentProduct.price * itemQuantity;

            // Prepare stock update operation
            productUpdates.push({
                updateOne: {
                    filter: { _id: currentProduct._id, stock: { $gte: itemQuantity } }, // Re-check stock just before update
                    update: { $inc: { stock: -itemQuantity, orderCount: 1 } } // Decrement stock, increment order count
                }
            });
        } // End cart loop

        // --- Perform Bulk Stock Update ---
        if (productUpdates.length > 0) {
             const updateResult = await Product.bulkWrite(productUpdates, { session: sessionDB });
             // Verify all updates succeeded - check modifiedCount against expected count
             if (updateResult.modifiedCount !== productUpdates.length) {
                 console.error("Bulk stock update mismatch:", updateResult);
                 // Attempt to find which one failed (more complex) or just throw generic error
                  throw new Error(`Stock levels changed concurrently for an item during checkout. Please review your cart and try again.`);
             }
        }

        // --- Create the Order document ---
        const order = new Order({
            userId: userId,
            userEmail: user.email,
            products: orderProducts,
            totalAmount: totalAmount,
            shippingAddress: user.address,
            paymentMethod: 'COD', // Assuming COD
            status: 'Pending',
            // cancellationAllowedUntil will be set by pre-save hook
        });
        await order.save({ session: sessionDB });

        // --- Clear User's Cart ---
        user.cart = [];
        await user.save({ session: sessionDB });

        // --- Commit Transaction ---
        await sessionDB.commitTransaction();

        // --- Post-Transaction: Update Session and Send Email ---
        req.session.user.cart = []; // Clear cart in session
        await req.session.save();

        try {
            const subject = 'Your Order Has Been Placed!';
            let productListHTML = order.products.map(p => `<li>${p.name} (Qty: ${p.quantity}) - ₹${p.priceAtOrder.toFixed(2)}</li>`).join('');
            // Use the date formatter from res.locals if available
            const formattedOrderDate = res.locals.formatDateIST ? res.locals.formatDateIST(order.orderDate) : order.orderDate.toLocaleString();
            const html = `<h2>Thank you for your order!</h2><p>Your Order ID: ${order._id}</p><p>Order Placed: ${formattedOrderDate}</p><p>Total Amount: ₹${order.totalAmount.toFixed(2)}</p><p>Shipping To: ${order.shippingAddress.name}, ${order.shippingAddress.cityVillage}</p><h3>Items:</h3><ul>${productListHTML}</ul><p>You can track your order status in the 'My Orders' section.</p>`;
            await sendEmail(user.email, subject, `Your order ${order._id} has been placed. Total: ₹${totalAmount.toFixed(2)}`, html);
        } catch (emailError) {
            console.error(`Failed to send order confirmation email for order ${order._id}:`, emailError);
            // Don't fail the request if email fails, just log it.
        }

        req.flash('success_msg', 'Order placed successfully!');
        res.redirect('/orders/my-orders');

    } catch (error) {
        // --- Abort Transaction on ANY error ---
        await sessionDB.abortTransaction();
        console.error("Error during order placement transaction:", error);
        req.flash('error_msg', `Order placement failed: ${error.message}. Please check your cart or address and try again.`);
        // Redirect based on error type
        if (error.message.includes('address')) {
             res.redirect('/user/checkout');
        } else {
             res.redirect('/user/cart'); // Default to cart for item issues
        }
    } finally {
        // --- End Session ---
        sessionDB.endSession();
    }
};


// --- cancelOrder (User) - Remains largely the same, ensure stock restore works ---
exports.cancelOrder = async (req, res, next) => {
    const sessionDB = await mongoose.startSession();
    sessionDB.startTransaction();
    try {
        const orderId = req.params.id;
        const userId = req.session.user._id;

        // Find the order: Must belong to user, be Pending, and within cancellation window
        const order = await Order.findOne({
             _id: orderId,
            userId: userId,
            status: 'Pending',
             cancellationAllowedUntil: { $gt: Date.now() } // Check cancellation window
        }).populate('products.productId', '_id name').session(sessionDB); // Populate name for logging

        if (!order) {
             req.flash('error_msg', 'Order not found, already processed, or cancellation period expired.');
            await sessionDB.abortTransaction(); sessionDB.endSession();
            return res.redirect('/orders/my-orders');
        }

        // --- Restore Stock ---
        console.log(`User Cancellation (${userId}): Attempting to restore stock/orderCount for order ${orderId}.`);
        const productStockRestorePromises = order.products.map(item => {
             const quantityToRestore = Number(item.quantity);
             if (isNaN(quantityToRestore) || quantityToRestore <= 0) return Promise.resolve();
              if (!item.productId?._id) {
                  console.error(`User Cancel: Missing or invalid productId for item in order ${orderId}`);
                  return Promise.resolve(); // Don't throw, just skip
              }
             // Restore stock AND decrement orderCount
             return Product.updateOne(
                 { _id: item.productId._id },
                 { $inc: { stock: quantityToRestore, orderCount: -1 } }, // Decrement orderCount
                 { session: sessionDB }
             ).catch(err => {
                // Log error but don't necessarily abort the whole cancellation if one product fails
                console.error(`User Cancel: Failed restore stock/orderCount for product ${item.productId._id} (${item.productId.name}) on cancelling order ${orderId}: ${err.message}`);
             });
        });
        await Promise.all(productStockRestorePromises);
        console.log(`User Cancel: Stock/OrderCount restoration attempted for order ${orderId}.`);
        // --- End Stock Restore ---

        // Update order status
        order.status = 'Cancelled';
        order.cancellationReason = "Cancelled by customer";
        // Fields like orderOTP, expires, receivedDate are handled by pre-save hook in Order model
        await order.save({ session: sessionDB });

        // Commit transaction
        await sessionDB.commitTransaction();

         // Send confirmation email (outside transaction)
         try{
             const subject = 'Your Order Has Been Cancelled';
             const html = `<p>Your order (${order._id}) has been successfully cancelled as requested.</p>`;
            await sendEmail(order.userEmail, subject, `Order ${order._id} cancelled.`, html);
         } catch (emailError){
             console.error(`Failed to send user cancellation email for order ${order._id}:`, emailError);
         }

        req.flash('success_msg', 'Order cancelled successfully.');
        res.redirect('/orders/my-orders');

    } catch (error) {
         // Abort transaction on error
         await sessionDB.abortTransaction();
         console.error("User Order Cancellation Error:", error);
         if (error.name === 'CastError') {
             req.flash('error_msg', 'Invalid order ID format.');
         } else {
            req.flash('error_msg', 'Failed to cancel the order due to an internal error.');
         }
         res.redirect('/orders/my-orders');
    } finally {
        // End session
        sessionDB.endSession();
    }
};

// --- getMyOrders (User) - Remains the same ---
exports.getMyOrders = async (req, res, next) => {
    try {
        const orders = await Order.find({ userId: req.session.user._id })
                                   // Select necessary fields, including OTP for display logic
                                   .select('+cancellationReason +orderOTP +orderOTPExpires +cancellationAllowedUntil +receivedByDate')
                                   .sort({ orderDate: -1 })
                                   // Populate product details needed for display
                                   .populate('products.productId', 'name imageUrl _id') // Minimal population
                                   .lean(); // Use lean for read-only

        const now = Date.now();
        orders.forEach(order => {
            // Determine if cancellable by user
            order.isCancellable = order.status === 'Pending' && order.cancellationAllowedUntil && now < new Date(order.cancellationAllowedUntil).getTime();

            // Determine if delivery OTP should be shown (for direct delivery)
            order.showDeliveryOtp = order.status === 'Pending' &&
                                    order.orderOTP &&
                                    order.orderOTPExpires &&
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

// --- generateAndSendDirectDeliveryOTPByAdmin (Admin Only) ---
// Should remain Admin only, as it's for bypassing standard delivery process
exports.generateAndSendDirectDeliveryOTPByAdmin = async (orderId) => {
     // No user context needed directly, but ensure called by Admin route
     try {
         const order = await Order.findById(orderId);
         if (!order) throw new Error('Order not found.');
         if (order.status !== 'Pending') throw new Error(`Cannot generate OTP for order with status '${order.status}'. Must be 'Pending'.`);

         const otp = generateOTP();
         const otpExpires = setOTPExpiration(5); // 5 minutes validity
         order.orderOTP = otp;
         order.orderOTPExpires = otpExpires;
         await order.save(); // Save OTP to order

         const user = await User.findById(order.userId).select('email name'); // Get email for notification
         if (!user) {
             // Rollback OTP generation if user not found? Or just log? Let's log and proceed.
             console.error(`Customer user account not found for order ${orderId} during OTP generation.`);
             // Maybe clear OTP fields?
             // order.orderOTP = undefined; order.orderOTPExpires = undefined; await order.save();
             throw new Error('Customer user account not found for this order.');
         }

        // --- Send Email to Customer with OTP ---
        // NOTE: Previous version logged instead of emailing. Reinstating email.
        try {
            const subject = `Delivery OTP for Your Order ${orderId}`;
            const text = `Please provide the following OTP to the delivery person (Admin Direct Delivery) to confirm receipt of your order ${orderId}: ${otp}\nThis OTP is valid for 5 minutes.`;
            const html = `<p>Please provide the following OTP to the delivery person (Admin Direct Delivery) to confirm receipt of your order ${orderId}:</p><h2>${otp}</h2><p>This OTP is valid for 5 minutes.</p><p>If you did not request this or are not receiving the delivery now, please contact support immediately.</p>`;
            const emailSent = await sendEmail(user.email, subject, text, html);
            if (!emailSent) {
                 // If email fails, should we still proceed? Yes, OTP is on user's page too. Log it.
                 console.error(`Failed to send direct delivery OTP email to ${user.email} for order ${orderId}, but OTP is generated.`);
             } else {
                 console.log(`Direct delivery OTP email sent successfully to ${user.email} for order ${orderId}.`);
             }
        } catch (emailError) {
             console.error(`Error sending direct delivery OTP email to ${user.email} for order ${orderId}:`, emailError);
        }

        // Return success message indicating OTP is generated and available to customer
        return { success: true, message: `OTP generated for order ${orderId}. It has been sent to the customer's email and is available on their 'My Orders' page.` };

    } catch (error) {
         console.error(`Error generating ADMIN Direct Delivery OTP for order ${orderId}:`, error);
         throw error; // Re-throw to be caught by the calling controller action
     }
 };

// --- confirmDirectDeliveryByAdmin (Admin Only) ---
// Confirms delivery using the OTP generated above
exports.confirmDirectDeliveryByAdmin = async (orderId, adminUserId, providedOtp, resForHelper) => {
     // No user context needed directly, but ensure called by Admin route
     try {
         // Find the order matching ID, status, OTP, and expiry
         const order = await Order.findOne({
            _id: orderId,
            status: 'Pending', // Must be pending
             orderOTP: providedOtp, // OTP must match
             orderOTPExpires: { $gt: Date.now() } // OTP must not be expired
         });

         if (!order) {
            // Provide more specific feedback if possible
            const checkOrder = await Order.findById(orderId).select('status'); // Check current status
            if (!checkOrder) throw new Error('Order not found.');
            if (checkOrder.status !== 'Pending') throw new Error(`Order status is '${checkOrder.status}', cannot confirm direct delivery from this state.`);
            // If status is Pending, the OTP must be wrong or expired
            throw new Error('Invalid or expired OTP.');
        }

        // --- Update Order Status ---
        order.status = 'Delivered';
        order.receivedByDate = new Date();
        // Clear OTP fields (also handled by pre-save hook, but good practice)
        order.orderOTP = undefined;
        order.orderOTPExpires = undefined;
        await order.save();

        // --- Send Confirmation Email to Customer ---
        try {
             const subject = `Your Order ${order._id} Has Been Delivered!`;
             // Use date formatter if available from response object locals
             const formattedDeliveryDate = (resForHelper && resForHelper.locals && typeof resForHelper.locals.formatDateIST === 'function')
                 ? resForHelper.locals.formatDateIST(order.receivedByDate)
                 : new Date(order.receivedByDate).toLocaleString();

             const html = `<p>Great news! Your order (${order._id}) has been successfully delivered and confirmed by administration.</p><p>Received Date: ${formattedDeliveryDate}</p><p>Thank you for shopping with us!</p>`;
            await sendEmail(order.userEmail, subject, `Your order ${order._id} has been delivered.`, html);
         } catch (emailError){
             console.error(`Failed sending direct delivery confirmation email for order ${order._id}:`, emailError);
             // Log but don't fail the confirmation process
         }

        console.log(`Order ${orderId} marked as Delivered by Admin ${adminUserId} using direct OTP.`);
        return { success: true, order: order }; // Return success and updated order

     } catch (error) {
         console.error(`Error verifying ADMIN Direct Delivery OTP for order ${orderId}:`, error);
        throw error; // Re-throw for the calling controller action
    }
};