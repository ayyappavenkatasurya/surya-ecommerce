// controllers/sellerController.js
const Product = require('../models/Product');
const Order = require('../models/Order');
const User = require('../models/User');
const { sendEmail } = require('../config/mailer'); // Import sendEmail
const { reviewProductWithGemini } = require('../services/geminiService');
const {
    generateAndSendDirectDeliveryOTPBySeller,
    confirmDirectDeliveryBySeller
} = require('./orderController');
const mongoose = require('mongoose');

// --- NEW: Seller Cancellation Reasons ---
const sellerCancellationReasons = [
    "❗ Item Out of Stock (Seller)",
    "🚚 Unable to Fulfill/Ship (Seller)",
    "👤 Customer Requested Cancellation (via Seller)",
    "❓ Other Reason (Seller)",
];

// Seller Dashboard
exports.getSellerDashboard = (req, res) => {
    res.render('seller/dashboard', { title: 'Seller Dashboard' });
};

// Product Management Pages
exports.getUploadProductPage = (req, res) => {
    // Pass an empty product object or defaults if needed for rendering sticky form
    res.render('seller/upload-product', { title: 'Upload New Product', product: {} });
};

exports.getManageProductsPage = async (req, res, next) => {
    try {
        const sellerId = req.session.user._id;
        const products = await Product.find({ sellerId: sellerId })
                                    .sort({ createdAt: -1 })
                                    .lean();

        res.render('seller/manage-products', {
            title: 'Manage Your Products',
            products: products
        });
    } catch (error) {
        next(error);
    }
};

exports.getEditProductPage = async (req, res, next) => {
     try {
        // isProductOwner middleware ensures ownership
        const product = await Product.findById(req.params.id).lean(); // Use lean here
        if (!product) {
           req.flash('error_msg', 'Product not found.');
           return res.redirect('/seller/products');
       }
       // Ownership check already done by middleware

       res.render('seller/edit-product', {
           title: `Edit Product: ${product.name}`,
           product: product // Pass lean object
       });
   } catch (error) {
        if (error.name === 'CastError') {
          req.flash('error_msg', 'Invalid product ID format.');
           return res.redirect('/seller/products');
      }
       next(error);
    }
};

// Product Management Actions
exports.uploadProduct = async (req, res, next) => {
    const { name, category, price, stock, imageUrl, specifications } = req.body;
    const sellerId = req.session.user._id;
    const sellerEmail = req.session.user.email;

     if (!name || !category || price === undefined || stock === undefined || !imageUrl) {
        req.flash('error_msg', 'Please fill in all required fields (Name, Category, Price, Stock, Image URL).');
        return res.render('seller/upload-product', { title: 'Upload New Product', product: req.body });
    }
     if (isNaN(Number(price)) || Number(price) < 0 || isNaN(Number(stock)) || Number(stock) < 0) {
        req.flash('error_msg', 'Price and Stock must be valid non-negative numbers.');
        return res.render('seller/upload-product', { title: 'Upload New Product', product: req.body });
     }

    try {
        const newProduct = new Product({
            name: name.trim(),
            category: category.trim(),
            price: Number(price),
            stock: Number(stock),
            imageUrl: imageUrl.trim(),
            specifications: specifications ? specifications.trim() : '',
            sellerId: sellerId,
            sellerEmail: sellerEmail,
            reviewStatus: 'pending' // Start as pending
        });

        await newProduct.save();
        console.log(`Product ${newProduct._id} saved initially by seller ${sellerEmail}.`);

        // Trigger Gemini review asynchronously
        reviewProductWithGemini(newProduct).then(async reviewResult => {
             try {
                 // Fetch the latest version of the product to update
                 const productToUpdate = await Product.findById(newProduct._id);
                 if (productToUpdate) {
                    productToUpdate.reviewStatus = reviewResult.status;
                    productToUpdate.rejectionReason = reviewResult.reason; // Might be null/undefined
                    await productToUpdate.save();
                    console.log(`Product ${newProduct._id} review status updated to ${reviewResult.status}.`);
                 } else {
                     console.warn(`Product ${newProduct._id} not found for status update after Gemini review.`);
                 }
             } catch (updateError) {
                console.error(`Error updating product ${newProduct._id} after Gemini review:`, updateError);
             }
        }).catch(reviewError => {
             console.error(`Error in Gemini review promise chain for product ${newProduct._id}:`, reviewError);
             // Consider setting status back to 'pending' or a specific 'error' state
             // Example: Mark as pending with a reason if review fails completely
              Product.findByIdAndUpdate(newProduct._id, { reviewStatus: 'pending', rejectionReason: 'AI review process failed.' }).catch(err => console.error("Failed to mark product as pending after review error:", err));
        });

        req.flash('success_msg', `Product "${newProduct.name}" submitted for review.`);
        res.redirect('/seller/products');

    } catch (error) {
        if (error.name === 'ValidationError') {
           let errors = Object.values(error.errors).map(el => el.message);
           req.flash('error_msg', `Validation Error: ${errors.join(' ')}`);
           return res.render('seller/upload-product', { title: 'Upload New Product', product: req.body });
       }
        console.error("Error uploading product:", error);
        next(error);
    }
};

exports.updateProduct = async (req, res, next) => {
    const productId = req.params.id;
    const sellerId = req.session.user._id; // For validation, though middleware handles access
    const { name, category, price, stock, imageUrl, specifications } = req.body;

     if (!name || !category || price === undefined || stock === undefined || !imageUrl) {
        req.flash('error_msg', 'Please fill in all required fields.');
        // Need to fetch product again to render edit page correctly
        try { const product = await Product.findOne({ _id: productId, sellerId: sellerId }).lean(); return res.render('seller/edit-product', { title: `Edit Product: ${product?.name || 'Error'}`, product: product || { _id: productId, ...req.body } }); } catch { return res.redirect(`/seller/products/edit/${productId}`); }
    }
     if (isNaN(Number(price)) || Number(price) < 0 || isNaN(Number(stock)) || Number(stock) < 0) {
         req.flash('error_msg', 'Price and Stock must be valid non-negative numbers.');
         try { const product = await Product.findOne({ _id: productId, sellerId: sellerId }).lean(); return res.render('seller/edit-product', { title: `Edit Product: ${product?.name || 'Error'}`, product: product || { _id: productId, ...req.body } }); } catch { return res.redirect(`/seller/products/edit/${productId}`); }
     }

    try {
        // Find product ensuring it belongs to the seller (redundant with middleware, but safe)
        const product = await Product.findOne({ _id: productId, sellerId: sellerId });

        if (!product) {
            req.flash('error_msg', 'Product not found or access denied.');
            return res.status(404).redirect('/seller/products');
         }

         product.name = name.trim();
         product.category = category.trim();
         product.price = Number(price);
         product.stock = Number(stock);
         product.imageUrl = imageUrl.trim();
         product.specifications = specifications ? specifications.trim() : '';
         product.reviewStatus = 'pending'; // Reset status on update
         product.rejectionReason = undefined;

         await product.save();
         console.log(`Product ${productId} updated by seller, set to pending review.`);

        // Trigger Gemini review asynchronously
        reviewProductWithGemini(product).then(async reviewResult => {
             try {
                 const productToUpdate = await Product.findById(product._id); // Fetch again to update
                 if (productToUpdate) {
                    productToUpdate.reviewStatus = reviewResult.status;
                    productToUpdate.rejectionReason = reviewResult.reason;
                    await productToUpdate.save();
                    console.log(`Product ${product._id} review status updated to ${reviewResult.status} after edit.`);
                 }
             } catch (updateError) {
                console.error(`Error updating product ${product._id} after Gemini review (post-edit):`, updateError);
             }
        }).catch(reviewError => {
             console.error(`Error in Gemini review promise chain for edited product ${product._id}:`, reviewError);
              Product.findByIdAndUpdate(product._id, { reviewStatus: 'pending', rejectionReason: 'AI review process failed after edit.' }).catch(err => console.error("Failed to mark edited product as pending after review error:", err));
         });

         req.flash('success_msg', `Product "${product.name}" updated and resubmitted for review.`);
         res.redirect('/seller/products');

    } catch (error) {
         if (error.name === 'ValidationError') {
            let errors = Object.values(error.errors).map(el => el.message);
             req.flash('error_msg', `Validation Error: ${errors.join(' ')}`);
             try { const product = await Product.findOne({ _id: productId, sellerId: sellerId }).lean(); return res.render('seller/edit-product', { title: `Edit Product: ${product?.name || 'Error'}`, product: product || { _id: productId, ...req.body } }); } catch { return res.redirect(`/seller/products/edit/${productId}`); }
         }
         console.error("Error updating product:", error);
         next(error);
     }
 };

exports.removeProduct = async (req, res, next) => {
    const productId = req.params.id;
    const sellerId = req.session.user._id;

    try {
         // Middleware verifies ownership, find and delete in one step
         const product = await Product.findOneAndDelete({ _id: productId, sellerId: sellerId });

        if (!product) {
             req.flash('error_msg', 'Product not found or already removed.');
             return res.status(404).redirect('/seller/products');
         }
         req.flash('success_msg', `Product "${product.name}" removed successfully.`);
         res.redirect('/seller/products');
    } catch (error) {
        if (error.name === 'CastError') {
             req.flash('error_msg', 'Invalid product ID format.');
            return res.status(400).redirect('/seller/products');
        }
        console.error("Error removing product:", error);
        req.flash('error_msg', 'Error removing product.');
        res.redirect('/seller/products');
    }
};

// --- CORRECTED Seller Order Management Page ---
exports.getManageOrdersPage = async (req, res, next) => {
    try {
        const sellerId = req.session.user._id;

        // 1. Find product IDs sold by this seller
        const sellerProductRefs = await Product.find({ sellerId: sellerId }).select('_id').lean();
        const sellerProductIds = sellerProductRefs.map(p => p._id);

        // Handle case where seller has no products
        if (sellerProductIds.length === 0) {
             return res.render('seller/manage-orders', {
                 title: 'Manage Your Orders',
                 orders: [],
                 message: 'You have no products listed, so no orders to manage yet.',
                 sellerCancellationReasons: sellerCancellationReasons // Pass reasons even if no orders
             });
        }

        // 2. Find orders containing any of these products
        const orders = await Order.find({ 'products.productId': { $in: sellerProductIds } })
                                   .sort({ orderDate: -1 })
                                   .populate('products.productId', 'name imageUrl _id price sellerId')
                                   .populate('userId', 'name email') // Populate user for display if needed
                                   .lean();

        // 3. Add flags specific to seller actions and format items summary
        const now = Date.now();
        orders.forEach(order => {
             order.isRelevantToSeller = true;
             order.canBeDirectlyDeliveredBySeller = order.status === 'Pending';
             // *** NEW: Seller Cancellation Logic ***
             order.canBeCancelledBySeller = order.status === 'Pending'; // Simple check for now

             order.showDeliveryOtp = order.status === 'Pending' &&
                                     !!order.orderOTP &&
                                     !!order.orderOTPExpires &&
                                     new Date(order.orderOTPExpires).getTime() > now;

            // Format Items Summary (Highlight seller's items)
            if (order.products && order.products.length > 0) {
                order.itemsSummary = order.products.map(p => {
                    // Ensure productId and sellerId exist before comparing
                    const isSellerItem = p.productId?.sellerId?.toString() === sellerId.toString();
                    const price = (p.priceAtOrder !== undefined && p.priceAtOrder !== null) ? p.priceAtOrder : (p.productId?.price ?? 0);
                    const productName = p.productId?.name || p.name || '[Product Name Missing]';

                    // Highlight seller's item clearly
                    return `${isSellerItem ? '<strong class="text-success">' : ''}${productName} (Qty: ${p.quantity}) @ ₹${price.toFixed(2)}${isSellerItem ? ' (Your Item)</strong>' : ''}`;
                }).join('<br>');
            } else {
                 order.itemsSummary = 'No items found';
            }
        });

        // *** Render the template, PASSING message as null and reasons ***
        res.render('seller/manage-orders', {
            title: 'Manage Your Orders',
            orders: orders,
            message: null, // Pass null when orders exist
            sellerCancellationReasons: sellerCancellationReasons // Pass reasons to the view
        });
    } catch (error) {
        next(error);
    }
};


// --- Seller Order Actions ---
exports.sendDirectDeliveryOtpBySeller = async (req, res, next) => {
    const { orderId } = req.params;
    const sellerId = req.session.user._id;

    try {
        // isOrderRelevantToSeller middleware should have already checked relevance
        const order = await Order.findById(orderId); // Fetch order again if needed
        if (!order) throw new Error("Order not found.");
        if (order.status !== 'Pending') throw new Error(`Cannot send OTP for order status ${order.status}.`);

        const result = await generateAndSendDirectDeliveryOTPBySeller(orderId, sellerId);
        req.flash('success_msg', result.message + ' Ask customer for OTP.');
    } catch (error) {
        req.flash('error_msg', `Failed to send delivery OTP: ${error.message}`);
    }
    res.redirect('/seller/orders');
};

exports.confirmDirectDeliveryBySeller = async (req, res, next) => {
    const { orderId } = req.params;
    const { otp } = req.body;
    const sellerId = req.session.user._id;

    if (!otp || !/^\d{6}$/.test(otp.trim())) {
        req.flash('error_msg', 'Please enter the 6-digit OTP.');
        return res.redirect('/seller/orders');
    }

    try {
         // isOrderRelevantToSeller middleware checks relevance
         const { order } = await confirmDirectDeliveryBySeller(orderId, sellerId, otp.trim(), res);
        req.flash('success_msg', `Order ${orderId} confirmed delivered by you.`);
    } catch (error) {
        req.flash('error_msg', `Delivery confirmation failed: ${error.message}`);
    }
    res.redirect('/seller/orders');
};

// --- NEW: Seller Cancel Order ---
exports.cancelOrderBySeller = async (req, res, next) => {
    const { orderId } = req.params;
    const { reason } = req.body;
    const sellerId = req.session.user._id;
    const sellerEmail = req.session.user.email; // For logging

    // Validate reason
    if (!reason || !sellerCancellationReasons.includes(reason)) {
        req.flash('error_msg', 'Please select a valid seller reason for cancellation.');
        return res.redirect('/seller/orders');
    }

    const sessionDB = await mongoose.startSession();
    sessionDB.startTransaction();
    try {
        // Find the order and populate product sellerId
        const order = await Order.findById(orderId)
                                .populate('products.productId', 'sellerId name _id') // Need sellerId and _id
                                .populate('userId', 'email') // For notification
                                .session(sessionDB);

        if (!order) {
            await sessionDB.abortTransaction(); sessionDB.endSession();
            req.flash('error_msg', 'Order not found.');
            return res.status(404).redirect('/seller/orders');
        }

        // Check if order status is Pending
        if (order.status !== 'Pending') {
            await sessionDB.abortTransaction(); sessionDB.endSession();
            req.flash('error_msg', `Order status is '${order.status}'. Only 'Pending' orders can be cancelled by seller.`);
            return res.redirect('/seller/orders');
        }

        // Double check relevance (middleware should handle this, but good practice)
        const isRelevant = order.products.some(p => p.productId?.sellerId?.toString() === sellerId.toString());
        if (!isRelevant) {
             await sessionDB.abortTransaction(); sessionDB.endSession();
             console.warn(`Seller ${sellerEmail} (${sellerId}) attempted cancellation for non-relevant order ${orderId}.`);
             req.flash('error_msg', 'Permission Denied: Order does not contain your products.');
             return res.status(403).redirect('/seller/orders');
        }


        // --- Restore Stock ONLY for the seller's items ---
        console.log(`Seller Cancel: Restoring stock for seller ${sellerId}'s items in order ${orderId}.`);
        const productStockRestorePromises = order.products
            .filter(item => item.productId?.sellerId?.toString() === sellerId.toString()) // Filter only seller's items
            .map(item => {
                const quantityToRestore = Number(item.quantity);
                 if (!item.productId?._id || isNaN(quantityToRestore) || quantityToRestore <= 0) {
                    console.warn(`Seller Cancel: Invalid P.ID ${item.productId?._id} or Qty ${item.quantity} for seller's item in O.ID ${orderId}. Skipping restore.`);
                    return Promise.resolve();
                }
                console.log(`Seller Cancel: Restoring ${quantityToRestore} stock for P.ID ${item.productId._id}`);
                 return Product.updateOne(
                     { _id: item.productId._id },
                     { $inc: { stock: quantityToRestore, orderCount: -1 } }, // Restore stock, decrement order count
                     { session: sessionDB }
                 ).catch(err => {
                    console.error(`Seller Cancel: Failed stock/count restore P.ID ${item.productId._id} O.ID ${orderId}: ${err.message}`);
                 });
            });

        await Promise.allSettled(productStockRestorePromises);
        console.log(`Seller Cancel: Stock restoration attempts completed for seller ${sellerId} in order ${orderId}.`);

        // Update Order Status and Reason
        order.status = 'Cancelled';
        order.cancellationReason = `Cancelled by Seller: ${reason}`; // Add prefix
        // Clear OTP fields etc. (pre-save hook might also do this)
        order.orderOTP = undefined;
        order.orderOTPExpires = undefined;
        order.cancellationAllowedUntil = undefined; // Remove cancellation window

        await order.save({ session: sessionDB });

        await sessionDB.commitTransaction();

        // --- Send Email Notification (Outside Transaction) ---
        try {
            const customerEmail = order.userEmail || order.userId?.email;
            if(customerEmail) {
                const subjectCust = `Update on Your Order (${order._id})`;
                const htmlCust = `<p>Unfortunately, your order (${order._id}) has been cancelled by the seller.</p>
                                <p><strong>Reason:</strong> ${reason}</p>
                                <p>Any payment made (if applicable) will be refunded according to policy.</p>
                                <p>We apologize for any inconvenience. Please contact support if you have questions.</p>`;
                const textCust = `Your order ${order._id} was cancelled by the seller. Reason: ${reason}. Contact support for questions.`;
                await sendEmail(customerEmail, subjectCust, textCust, htmlCust);
            } else {
                console.warn(`Seller Cancel: Could not find customer email for order ${orderId} notification.`);
            }
        } catch (emailError) {
            console.error(`Seller Cancel: Failed sending cancellation email for order ${order._id}:`, emailError);
        }

        req.flash('success_msg', `Order ${orderId} cancelled successfully. Reason: ${reason}. Customer notified.`);
        res.redirect('/seller/orders');

    } catch (error) {
        await sessionDB.abortTransaction();
        console.error(`Error cancelling order ${orderId} by seller ${sellerEmail} (${sellerId}):`, error);
        req.flash('error_msg', 'Failed to cancel order due to an internal error.');
        res.redirect('/seller/orders');
    } finally {
        sessionDB.endSession();
    }
};