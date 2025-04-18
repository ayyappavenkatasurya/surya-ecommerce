// controllers/orderController.js
const Order = require('../models/Order');
const User = require('../models/User');
const Product = require('../models/Product');
const { sendEmail } = require('../config/mailer');
const mongoose = require('mongoose');
const { generateOTP, setOTPExpiration } = require('../services/otpService');

// --- UPDATE placeOrder to include sellerId and check approval/stock within transaction ---
exports.placeOrder = async (req, res, next) => {
    const userId = req.session.user._id;
    const sessionDB = await mongoose.startSession();
    sessionDB.startTransaction({ readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } }); // Use snapshot isolation if possible

    try {
        const user = await User.findById(userId)
                              // Populate necessary cart product fields including status and seller
                              .populate('cart.productId', 'name price imageUrl stock reviewStatus sellerId')
                              .session(sessionDB); // Use session

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
        // Ensure address exists
        if (!user.address || !user.address.name || !user.address.phone || !user.address.pincode || !user.address.cityVillage) {
            await sessionDB.abortTransaction(); sessionDB.endSession();
            req.flash('error_msg', 'Please complete your shipping address before placing the order.');
            return res.redirect('/user/checkout');
        }

        let orderProducts = [];
        let totalAmount = 0;
        const productStockUpdates = [];
        let validationFailed = false;
        let validationErrorMessage = 'An issue occurred with your cart. Please review and try again.';
        const itemsToRemoveFromCart = []; // Track items to remove due to issues

        // --- Validate Cart Items Within Transaction ---
        for (const item of user.cart) {
            // Basic checks
            const itemQuantity = Number(item.quantity);
            if (isNaN(itemQuantity) || !Number.isInteger(itemQuantity) || itemQuantity <= 0) {
                validationErrorMessage = `Invalid quantity found for an item. It has been removed.`;
                itemsToRemoveFromCart.push(item._id);
                validationFailed = true; continue; // Continue checking other items
            }
            if (!item.productId || !item.productId._id) {
                 validationErrorMessage = `An invalid product reference was found and removed.`;
                 itemsToRemoveFromCart.push(item._id);
                 validationFailed = true; continue;
            }

            const currentProduct = item.productId; // Already populated

            // *** Check Approval Status ***
             if (currentProduct.reviewStatus !== 'approved') {
                validationErrorMessage = `Product "${currentProduct.name}" is not available and has been removed from your cart.`;
                itemsToRemoveFromCart.push(item._id);
                validationFailed = true; continue;
            }
            // *** Check Stock Availability ***
            if (currentProduct.stock < itemQuantity) {
                // If stock issue, fail the whole order immediately, don't just remove item
                validationErrorMessage = `Insufficient stock for "${currentProduct.name}". Available: ${currentProduct.stock}. Please update your cart quantity.`;
                validationFailed = true;
                break; // Stop processing on critical stock issue
            }

            // If valid, add to order and prepare update
            orderProducts.push({
                productId: currentProduct._id,
                name: currentProduct.name,
                priceAtOrder: currentProduct.price, // Price at the time of order
                quantity: itemQuantity,
                imageUrl: currentProduct.imageUrl,
                sellerId: currentProduct.sellerId // *** Include Seller ID ***
            });
            totalAmount += currentProduct.price * itemQuantity;
            productStockUpdates.push({
                 productId: currentProduct._id,
                 quantityToDecrement: itemQuantity
             });
        } // End cart loop

        // --- Handle Validation Failures ---
        if (validationFailed) {
             // If items needed removal, perform the removal update
             if (itemsToRemoveFromCart.length > 0) {
                 await User.updateOne(
                    { _id: userId },
                    { $pull: { cart: { _id: { $in: itemsToRemoveFromCart } } } }
                 ).session(sessionDB); // Perform removal within session
                 console.log(`Removed ${itemsToRemoveFromCart.length} invalid items from cart for user ${userId}`);
             }
            await sessionDB.abortTransaction(); sessionDB.endSession(); // Abort the transaction

             // Refresh session cart AFTER DB update
             const updatedUser = await User.findById(userId).select('cart').populate('cart.productId').lean();
             req.session.user.cart = updatedUser ? updatedUser.cart.filter(i => i.productId) : [];
             await req.session.save();

             req.flash('error_msg', validationErrorMessage);
             return res.redirect('/user/cart');
         }

        // --- Proceed with DB Updates if Validation Passed ---

        // Decrement Stock and Increment Order Count
        for (const update of productStockUpdates) {
            const updateResult = await Product.updateOne(
                { _id: update.productId, stock: { $gte: update.quantityToDecrement } }, // Check stock again
                { $inc: { stock: -update.quantityToDecrement, orderCount: 1 } },
                { session: sessionDB }
            );
            if (updateResult.modifiedCount === 0) { // Handle concurrent update failure
                 await sessionDB.abortTransaction(); sessionDB.endSession();
                 req.flash('error_msg', `Checkout failed: Stock changed for a product during checkout. Please try again.`);
                 // Don't remove items here, let user review cart again
                 return res.redirect('/user/cart');
             }
        }

        // Create the Order document
        const order = new Order({
            userId: userId,
            userEmail: user.email,
            products: orderProducts, // Includes sellerId
            totalAmount: totalAmount,
            shippingAddress: user.address,
            paymentMethod: 'COD', // Or from request body if multiple methods allowed
            status: 'Pending',
            // cancellationAllowedUntil is set by pre-save hook
        });
        await order.save({ session: sessionDB });

        // Clear User's Cart
        user.cart = [];
        await user.save({ session: sessionDB });

        // --- Commit Transaction ---
        await sessionDB.commitTransaction();

        // Update session cart AFTER successful commit
        req.session.user.cart = [];
        await req.session.save();

        // --- Send Confirmation Email (Outside Transaction) ---
        try {
            const subject = 'Your Order Has Been Placed!';
            let productListHTML = order.products.map(p => `<li>${p.name} (Qty: ${p.quantity}) - ₹${p.priceAtOrder.toFixed(2)}</li>`).join('');
            const formattedOrderDate = res.locals.formatDateIST(order.orderDate);
            const html = `<h2>Thank you for your order!</h2><p>Your Order ID: ${order._id}</p><p>Order Placed: ${formattedOrderDate}</p><p>Total Amount: ₹${order.totalAmount.toFixed(2)}</p><p>Shipping To: ${order.shippingAddress.name}, ${order.shippingAddress.cityVillage}</p><h3>Items:</h3><ul>${productListHTML}</ul><p>You can track your order status in the 'My Orders' section.</p>`;
            await sendEmail(user.email, subject, `Your order ${order._id} has been placed. Total: ₹${totalAmount.toFixed(2)}`, html);
        } catch (emailError) {
            console.error(`Failed sending order confirmation email for order ${order._id}:`, emailError);
            // Don't fail the request if email fails
        }

        req.flash('success_msg', 'Order placed successfully!');
        res.redirect('/orders/my-orders'); // Redirect to user's order history

    } catch (error) {
        // Ensure transaction is aborted on any unexpected error
        if (sessionDB.inTransaction()) {
             await sessionDB.abortTransaction();
        }
        console.error("Order Placement Transaction Error:", error);
        req.flash('error_msg', `Order placement failed due to a server error. Please review your cart and try again.`);
        res.redirect('/user/cart'); // Redirect to cart
    } finally {
        // Always end the session
        if (sessionDB.id) { // Check if session exists before ending
             await sessionDB.endSession();
        }
    }
};

// --- UPDATE cancelOrder (Uses Transaction) ---
exports.cancelOrder = async (req, res, next) => {
    const orderId = req.params.id;
    const userId = req.session.user._id;
    const sessionDB = await mongoose.startSession();
    sessionDB.startTransaction({ writeConcern: { w: 'majority' }}); // Ensure durability

    try {
        // Find the order: Must belong to the user, be 'Pending', and within cancellation window
        const order = await Order.findOne({
             _id: orderId,
             userId: userId, // Belongs to logged-in user
             status: 'Pending', // Only pending orders
             cancellationAllowedUntil: { $gt: Date.now() } // Within allowed time
        })
        .populate('products.productId', '_id name') // Need _id for update
        .session(sessionDB); // Use the transaction session

        if (!order) {
             await sessionDB.abortTransaction(); sessionDB.endSession();
             req.flash('error_msg', 'Order not found, already processed/cancelled, or cancellation period expired.');
            return res.redirect('/orders/my-orders');
        }

        console.log(`User Cancellation: Restoring stock/orderCount for order ${orderId}.`);
        // Restore stock and decrement orderCount for each valid product item
        const productUpdatePromises = order.products.map(item => {
            const quantityToRestore = Number(item.quantity);
            if (!item.productId?._id || isNaN(quantityToRestore) || quantityToRestore <= 0) {
                 console.warn(`User Cancel: Invalid item P.ID ${item.productId?._id} or Qty ${item.quantity} in O.ID ${orderId}. Skipping stock restore.`);
                return Promise.resolve(); // Skip invalid items gracefully
             }
            // Update the Product: Increment stock, decrement orderCount
             return Product.updateOne(
                 { _id: item.productId._id },
                 { $inc: { stock: quantityToRestore, orderCount: -1 } },
                 { session: sessionDB } // Use transaction session
             ).catch(err => {
                // Log error, but allow cancellation to continue for the order itself
                console.error(`User Cancel: Failed stock/orderCount restore for P.ID ${item.productId._id} on O.ID ${orderId}: ${err.message}`);
             });
        });
        // Wait for all stock updates to attempt (use allSettled)
        const results = await Promise.allSettled(productUpdatePromises);
        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                console.error(`Failed promise during stock restore for item index ${index} in order ${orderId}: ${result.reason}`);
            }
        });
        console.log(`User Cancel: Stock/OrderCount restoration process completed for order ${orderId}.`);


        // Update the Order status
        order.status = 'Cancelled';
        order.cancellationReason = "Cancelled by customer";
        // OTP fields etc., should be cleared by the pre-save hook in Order model
        await order.save({ session: sessionDB });

        // --- Commit Transaction ---
        await sessionDB.commitTransaction();

        // Send email confirmation (outside transaction)
         try{
             const subject = 'Your Order Has Been Cancelled';
             const html = `<p>Your order (${order._id}) has been successfully cancelled as requested.</p>`;
            await sendEmail(order.userEmail, subject, `Order ${order._id} cancelled.`, html);
         } catch (emailError){
             console.error(`Failed sending cancellation confirmation email for order ${order._id}:`, emailError);
         }

        req.flash('success_msg', 'Order cancelled successfully.');
        res.redirect('/orders/my-orders');

    } catch (error) {
         // Abort transaction on error
         if (sessionDB.inTransaction()) {
             await sessionDB.abortTransaction();
         }
         console.error("Order Cancellation Error:", error);
         req.flash('error_msg', 'Failed to cancel the order due to an internal error.');
         res.redirect('/orders/my-orders');
    } finally {
        // Always end the session
        if (sessionDB.id) { await sessionDB.endSession(); }
    }
};

// --- Get My Orders (Includes OTP display logic) ---
exports.getMyOrders = async (req, res, next) => {
    try {
        const orders = await Order.find({ userId: req.session.user._id })
                                   .select('-__v') // Exclude version key for cleaner output
                                   .sort({ orderDate: -1 })
                                   // Populate products for display
                                   .populate('products.productId', 'name imageUrl _id price')
                                   .lean(); // Use lean for read-only access

        const now = Date.now();
        orders.forEach(order => {
            // Determine if customer can cancel
            order.isCancellable = order.status === 'Pending' && order.cancellationAllowedUntil && now < new Date(order.cancellationAllowedUntil).getTime();

            // Determine if Delivery OTP should be shown
            order.showDeliveryOtp = order.status === 'Pending' &&
                                    !!order.orderOTP &&          // OTP must exist
                                    !!order.orderOTPExpires &&   // Expiry must exist
                                    new Date(order.orderOTPExpires).getTime() > now; // Must not be expired

            // Dates will be formatted in EJS using the formatDateIST helper
        });

        res.render('user/my-orders', {
            title: 'My Orders',
            orders: orders // Pass orders to the view
            // formatDateIST helper is available via res.locals
        });
    } catch (error) {
        console.error("Error fetching user orders:", error);
        next(error); // Pass error to central handler
    }
};

// --- Admin OTP Generation Logic (Remains Largely the Same) ---
exports.generateAndSendDirectDeliveryOTPByAdmin = async (orderId) => {
    try {
        const order = await Order.findById(orderId);
        if (!order) throw new Error('Order not found.');
        if (order.status !== 'Pending') throw new Error(`Cannot generate OTP for order status '${order.status}'. Must be 'Pending'.`);

        const otp = generateOTP();
        const otpExpires = setOTPExpiration(5); // 5 minutes validity
        order.orderOTP = otp;
        order.orderOTPExpires = otpExpires;
        await order.save();

        const user = await User.findById(order.userId).select('email'); // Get user email for logging/potential notification
        const userEmail = user ? user.email : '[User Account Missing]';

        console.log(`ADMIN generated Direct Delivery OTP for O.ID ${orderId}. OTP: ${otp}. (User: ${userEmail})`);
        // Optional: Send email/SMS to user.email here if needed

        return { success: true, message: `OTP generated for order ${orderId}. It is visible on the customer's 'My Orders' page.` };
    } catch (error) {
        console.error(`Error in generateAndSendDirectDeliveryOTPByAdmin for O.ID ${orderId}:`, error);
        throw error; // Re-throw for the calling controller
    }
};

// --- Seller OTP Generation Logic (NEW) ---
exports.generateAndSendDirectDeliveryOTPBySeller = async (orderId, sellerId) => {
    try {
        const order = await Order.findById(orderId)
                                .populate('products.productId', 'sellerId'); // Populate sellerId for verification

        if (!order) throw new Error('Order not found.');
        if (order.status !== 'Pending') throw new Error(`Cannot generate OTP for order status '${order.status}'. Must be 'Pending'.`);

        // Security Check: Ensure the order contains at least one product from this seller
        const isRelevant = order.products.some(p => p.productId?.sellerId?.toString() === sellerId.toString());
        if (!isRelevant) {
            console.warn(`Seller ${sellerId} attempted OTP generation for unrelated order ${orderId}.`);
            throw new Error('Permission Denied: Order does not contain your products.');
        }

        const otp = generateOTP();
        const otpExpires = setOTPExpiration(5); // 5 minutes validity
        order.orderOTP = otp;
        order.orderOTPExpires = otpExpires;
        await order.save();

        const user = await User.findById(order.userId).select('email');
        const userEmail = user ? user.email : '[User Account Missing]';

        console.log(`SELLER (${sellerId}) generated OTP for O.ID ${orderId}. OTP: ${otp}. (User: ${userEmail})`);
        // Optional: Send email/SMS notification

        return { success: true, message: `OTP generated for order ${orderId}. It is visible on the customer's 'My Orders' page.` };
    } catch (error) {
        console.error(`Error in generateAndSendDirectDeliveryOTPBySeller for O.ID ${orderId} by Seller ${sellerId}:`, error);
        throw error; // Re-throw for the calling controller
    }
};

// --- Admin Confirm Delivery Logic (Remains Largely the Same) ---
exports.confirmDirectDeliveryByAdmin = async (orderId, adminUserId, providedOtp, resForHelper = null) => {
    try {
        const order = await Order.findOne({
           _id: orderId,
           status: 'Pending',
           orderOTP: providedOtp,
           orderOTPExpires: { $gt: Date.now() }
        });

        if (!order) {
           // Check specific failure reason
           const checkOrder = await Order.findById(orderId).select('status orderOTP orderOTPExpires');
           if (!checkOrder) throw new Error('Order not found.');
           if (checkOrder.status !== 'Pending') throw new Error(`Order status is '${checkOrder.status}', cannot confirm delivery.`);
           if (checkOrder.orderOTP !== providedOtp) throw new Error('Invalid OTP.');
           if (!checkOrder.orderOTPExpires || checkOrder.orderOTPExpires <= Date.now()) throw new Error('Expired OTP.');
           throw new Error('OTP verification failed.'); // Generic fallback
        }

        // Update Order
        order.status = 'Delivered';
        order.receivedByDate = new Date();
        // Clear OTP fields - Pre-save hook in Order model should handle this, but explicit clear is safe
        order.orderOTP = undefined;
        order.orderOTPExpires = undefined;
        order.cancellationAllowedUntil = undefined; // Disable cancellation
        await order.save();

        console.log(`Order ${orderId} confirmed delivered by ADMIN ${adminUserId}`);

        // Send Confirmation Email
        try {
            const subject = `Your Order Has Been Delivered!`;
            const formattedDeliveryDate = resForHelper?.locals?.formatDateIST(order.receivedByDate) || new Date(order.receivedByDate).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
            const html = `<p>Great news! Your order (${order._id}) has been successfully delivered and confirmed by administration.</p><p>Received Date: ${formattedDeliveryDate}</p><p>Thank you for shopping with us!</p>`;
           await sendEmail(order.userEmail, subject, `Your order ${order._id} has been delivered.`, html);
        } catch (emailError){
            console.error(`Admin Confirm: Failed sending delivery confirmation email for O.ID ${order._id}:`, emailError);
        }

        return { success: true, order: order };
    } catch (error) {
        console.error(`Error verifying ADMIN Direct Delivery OTP for O.ID ${orderId} by Admin ${adminUserId}:`, error);
        throw error; // Re-throw
   }
};

// --- Seller Confirm Delivery Logic (NEW) ---
exports.confirmDirectDeliveryBySeller = async (orderId, sellerId, providedOtp, resForHelper = null) => {
    try {
        const order = await Order.findOne({
            _id: orderId,
            status: 'Pending',
            orderOTP: providedOtp,
            orderOTPExpires: { $gt: Date.now() }
        }).populate('products.productId', 'sellerId'); // Need sellerId for verification

        if (!order) {
           // Check specific failure reason
           const checkOrder = await Order.findById(orderId).select('status orderOTP orderOTPExpires');
           if (!checkOrder) throw new Error('Order not found.');
           if (checkOrder.status !== 'Pending') throw new Error(`Order status is '${checkOrder.status}'.`);
           if (checkOrder.orderOTP !== providedOtp) throw new Error('Invalid OTP.');
           if (!checkOrder.orderOTPExpires || checkOrder.orderOTPExpires <= Date.now()) throw new Error('Expired OTP.');
           throw new Error('OTP verification failed.');
        }

        // Security Check: Verify order relevance to this seller
        const isRelevant = order.products.some(p => p.productId?.sellerId?.toString() === sellerId.toString());
        if (!isRelevant) {
           console.warn(`Seller ${sellerId} attempted to confirm unrelated order ${orderId}.`);
           throw new Error('Permission Denied: Order does not contain your products.');
        }

        // Update Order
        order.status = 'Delivered';
        order.receivedByDate = new Date();
        // Clear OTP fields
        order.orderOTP = undefined;
        order.orderOTPExpires = undefined;
        order.cancellationAllowedUntil = undefined;
        await order.save();

        console.log(`Order ${orderId} confirmed delivered by SELLER ${sellerId}`);

        // Send Confirmation Email
        try {
           const subject = `Your Order Has Been Delivered!`;
           const formattedDeliveryDate = resForHelper?.locals?.formatDateIST(order.receivedByDate) || new Date(order.receivedByDate).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
           const html = `<p>Great news! Your order (${order._id}) has been successfully delivered and confirmed by the seller.</p><p>Received Date: ${formattedDeliveryDate}</p><p>Thank you for shopping with us!</p>`;
           await sendEmail(order.userEmail, subject, `Your order ${order._id} has been delivered.`, html);
        } catch (emailError){
            console.error(`Seller Confirm: Failed sending delivery confirmation email for O.ID ${order._id}:`, emailError);
        }

        return { success: true, order: order };
    } catch (error) {
        console.error(`Error verifying SELLER Direct Delivery OTP for O.ID ${orderId} by Seller ${sellerId}:`, error);
        throw error; // Re-throw
   }
};