// controllers/sellerController.js
const Product = require('../models/Product');
const Order = require('../models/Order');
const User = require('../models/User');
const { reviewProductWithGemini } = require('../services/geminiService');
const { sendEmail } = require('../config/mailer'); // Import sendEmail
const {
    generateAndSendDirectDeliveryOTPBySeller,
    confirmDirectDeliveryBySeller
} = require('./orderController');
const mongoose = require('mongoose');

// Seller Dashboard
// ... (getSellerDashboard, getUploadProductPage, etc. - Keep existing functions) ...
exports.getSellerDashboard = (req, res) => {
    res.render('seller/dashboard', { title: 'Seller Dashboard' });
};

// Product Management Pages
exports.getUploadProductPage = (req, res) => {
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
        const product = await Product.findById(req.params.id).lean();
        if (!product) {
           req.flash('error_msg', 'Product not found.');
           return res.redirect('/seller/products');
       }
       res.render('seller/edit-product', {
           title: `Edit Product: ${product.name}`,
           product: product
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
// ... (uploadProduct, updateProduct, removeProduct - Keep existing functions) ...
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
                 const productToUpdate = await Product.findById(newProduct._id);
                 if (productToUpdate) {
                    productToUpdate.reviewStatus = reviewResult.status;
                    productToUpdate.rejectionReason = reviewResult.reason;
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
    const sellerId = req.session.user._id;
    const { name, category, price, stock, imageUrl, specifications } = req.body;

     if (!name || !category || price === undefined || stock === undefined || !imageUrl) {
        req.flash('error_msg', 'Please fill in all required fields.');
        try { const product = await Product.findOne({ _id: productId, sellerId: sellerId }).lean(); return res.render('seller/edit-product', { title: `Edit Product: ${product?.name || 'Error'}`, product: product || { _id: productId, ...req.body } }); } catch { return res.redirect(`/seller/products/edit/${productId}`); }
    }
     if (isNaN(Number(price)) || Number(price) < 0 || isNaN(Number(stock)) || Number(stock) < 0) {
         req.flash('error_msg', 'Price and Stock must be valid non-negative numbers.');
         try { const product = await Product.findOne({ _id: productId, sellerId: sellerId }).lean(); return res.render('seller/edit-product', { title: `Edit Product: ${product?.name || 'Error'}`, product: product || { _id: productId, ...req.body } }); } catch { return res.redirect(`/seller/products/edit/${productId}`); }
     }

    try {
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

        reviewProductWithGemini(product).then(async reviewResult => {
             try {
                 const productToUpdate = await Product.findById(product._id);
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

// Seller Order Management Page (Add cancellation flag)
exports.getManageOrdersPage = async (req, res, next) => {
    try {
        const sellerId = req.session.user._id;
        const sellerProductRefs = await Product.find({ sellerId: sellerId }).select('_id').lean();
        const sellerProductIds = sellerProductRefs.map(p => p._id);

        if (sellerProductIds.length === 0) {
             return res.render('seller/manage-orders', {
                 title: 'Manage Your Orders',
                 orders: [],
                 message: 'You have no products listed, so no orders to manage yet.'
             });
        }

        const orders = await Order.find({ 'products.productId': { $in: sellerProductIds } })
                                   .sort({ orderDate: -1 })
                                   .populate('products.productId', 'name imageUrl _id price sellerId')
                                   .populate('userId', 'email') // Populate userId email for notification fallback
                                   .lean();

        const now = Date.now();
        orders.forEach(order => {
             order.isRelevantToSeller = true;
             order.canBeDirectlyDeliveredBySeller = order.status === 'Pending';
             // *** ADD CANCELLATION FLAG ***
             order.canBeCancelledBySeller = order.status === 'Pending'; // Simple check for now

             order.showDeliveryOtp = order.status === 'Pending' &&
                                     !!order.orderOTP &&
                                     !!order.orderOTPExpires &&
                                     new Date(order.orderOTPExpires).getTime() > now;

             if (order.products && order.products.length > 0) {
                order.itemsSummary = order.products.map(p => {
                    const isSellerItem = p.productId?.sellerId?.toString() === sellerId.toString();
                    const price = (p.priceAtOrder !== undefined && p.priceAtOrder !== null) ? p.priceAtOrder : (p.productId?.price ?? 0);
                    const productName = p.productId?.name || p.name || '[Product Name Missing]';
                    return `${isSellerItem ? '<strong>' : ''}${productName} (Qty: ${p.quantity}) @ ₹${price.toFixed(2)}${isSellerItem ? '</strong> (Your Item)' : ''}`;
                }).join('<br>');
            } else {
                 order.itemsSummary = 'No items found';
            }
            // Ensure userEmail is available for notifications
            order.userEmail = order.userEmail || order.userId?.email;
        });

        res.render('seller/manage-orders', {
            title: 'Manage Your Orders',
            orders: orders,
            message: null
        });
    } catch (error) {
        next(error);
    }
};

// Seller Order Actions
// ... (sendDirectDeliveryOtpBySeller, confirmDirectDeliveryBySeller - Keep existing) ...
exports.sendDirectDeliveryOtpBySeller = async (req, res, next) => {
    const { orderId } = req.params;
    const sellerId = req.session.user._id;

    try {
        // isOrderRelevantToSeller middleware ensures relevance
        const order = await Order.findById(orderId); // Fetch again if needed
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


// --- NEW: Seller Cancel Order Action ---
exports.cancelOrderBySeller = async (req, res, next) => {
    const { orderId } = req.params;
    const sellerId = req.session.user._id; // Authenticated seller ID
    const sellerEmail = req.session.user.email; // For reason string

    const sessionDB = await mongoose.startSession();
    sessionDB.startTransaction();

    try {
        // Middleware `isOrderRelevantToSeller` already verified basic relevance
        // Fetch order within transaction, populate needed fields
        const order = await Order.findById(orderId)
                                .populate('products.productId', 'name _id sellerId') // Need sellerId for final check, _id for stock
                                .populate('userId', 'email') // For notification fallback
                                .session(sessionDB);

        if (!order) {
            await sessionDB.abortTransaction(); sessionDB.endSession();
            req.flash('error_msg', 'Order not found.');
            return res.status(404).redirect('/seller/orders');
        }

        // --- Double Checks within Transaction ---
        if (order.status !== 'Pending') {
            await sessionDB.abortTransaction(); sessionDB.endSession();
            req.flash('error_msg', `Cannot cancel order with status '${order.status}'. Only 'Pending' orders can be cancelled.`);
            return res.redirect('/seller/orders');
        }

        // Re-verify relevance *explicitly* within transaction (optional but safer)
        const isRelevant = order.products.some(p => p.productId?.sellerId?.toString() === sellerId.toString());
        if (!isRelevant) {
            await sessionDB.abortTransaction(); sessionDB.endSession();
            console.warn(`Seller ${sellerId} cancellation attempt for non-relevant order ${orderId} (failed tx check).`);
            req.flash('error_msg', 'Permission denied: Order does not contain your products.');
            return res.status(403).redirect('/seller/orders');
        }
        // --- End Double Checks ---

        // Restore Stock for ALL items in the order (Consistent with Admin/User cancellation)
        const productStockRestorePromises = order.products.map(item => {
            const quantityToRestore = Number(item.quantity);
            if (!item.productId?._id || isNaN(quantityToRestore) || quantityToRestore <= 0) {
                console.warn(`Seller Cancel (${sellerId}): Invalid item P.ID ${item.productId?._id} or Qty ${item.quantity} in O.ID ${orderId}. Skipping restore.`);
                return Promise.resolve();
            }
            return Product.updateOne(
                { _id: item.productId._id },
                { $inc: { stock: quantityToRestore, orderCount: -1 } },
                { session: sessionDB }
            ).catch(err => {
               console.error(`Seller Cancel (${sellerId}): Failed stock/count restore P.ID ${item.productId._id} O.ID ${orderId}: ${err.message}`);
            });
        });
        await Promise.allSettled(productStockRestorePromises);
        console.log(`Seller Cancel (${sellerId}): Stock restoration attempted for order ${orderId}.`);

        // Update Order Status and Reason
        order.status = 'Cancelled';
        order.cancellationReason = `Cancelled by Seller (${sellerEmail})`; // Specific reason
        await order.save({ session: sessionDB });

        // Commit Transaction
        await sessionDB.commitTransaction();

        // Send Email Notification (Outside Transaction)
        try {
            const customerEmail = order.userEmail || order.userId?.email;
            if (customerEmail) {
                const subjectCust = `Your Order (${order._id}) Has Been Cancelled by the Seller`;
                const htmlCust = `<p>Your order (${order._id}) has been cancelled by the seller.</p><p><strong>Reason:</strong> ${order.cancellationReason}</p><p>If you have questions, please contact support.</p>`;
                await sendEmail(customerEmail, subjectCust, `Order ${order._id} cancelled. Reason: ${order.cancellationReason}`, htmlCust);
            } else {
                 console.warn(`Seller Cancel: Could not find customer email for order ${orderId} notification.`);
            }
        } catch (emailError) {
            console.error(`Seller Cancel (${sellerId}): Failed sending cancellation email for order ${order._id}:`, emailError);
            // Don't fail the request if email fails, but log it.
        }

        req.flash('success_msg', `Order ${orderId} cancelled successfully.`);
        res.redirect('/seller/orders');

    } catch (error) {
        await sessionDB.abortTransaction(); // Ensure abort on any error
        console.error(`Error cancelling order ${orderId} by seller ${sellerId}:`, error);
        req.flash('error_msg', 'Failed to cancel order due to an internal error.');
        res.redirect('/seller/orders');
    } finally {
        sessionDB.endSession(); // Always end the session
    }
};