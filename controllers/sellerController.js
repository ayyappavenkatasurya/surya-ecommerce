// controllers/sellerController.js
const Product = require('../models/Product');
const Order = require('../models/Order');
const User = require('../models/User');
const { sendEmail } = require('../config/mailer');
// *** IMPORT NEW SERVICE ***
const { generateEmailHtml } = require('../services/emailTemplateService');
const { reviewProductWithGemini } = require('../services/geminiService');
const {
    generateAndSendDirectDeliveryOTPBySeller,
    confirmDirectDeliveryBySeller
} = require('./orderController');
const mongoose = require('mongoose');
const categories = require('../config/categories');
const { categoryNames } = require('../config/categories');

const sellerCancellationReasons = [
    "❗ Item Out of Stock",
    "🚚 Unable to Fulfill/Ship",
    "👤 Technical Issue",
    "❓ Other Reason",
];

exports.getSellerDashboard = (req, res) => {
    res.render('seller/dashboard', { title: 'Seller Dashboard' });
};

exports.getUploadProductPage = (req, res) => {
    res.render('seller/upload-product', {
        title: 'Upload New Product',
        product: {},
        categories: categories
    });
};

exports.uploadProduct = async (req, res, next) => {
    const { name, category, price, stock, imageUrl, imageUrl2, specifications, shortDescription } = req.body;
    const sellerId = req.session.user._id;
    const sellerEmail = req.session.user.email;

     if (!name || !category || price === undefined || stock === undefined || !imageUrl) {
        req.flash('error_msg', 'Please fill in all required fields (Name, Category, Price, Stock, Primary Image URL).');
        return res.render('seller/upload-product', { title: 'Upload New Product', product: req.body, categories: categories });
    }
     if (isNaN(Number(price)) || Number(price) < 0 || isNaN(Number(stock)) || Number(stock) < 0) {
        req.flash('error_msg', 'Price and Stock must be valid non-negative numbers.');
         return res.render('seller/upload-product', { title: 'Upload New Product', product: req.body, categories: categories });
     }
     if (!categoryNames.includes(category)) {
        req.flash('error_msg', 'Invalid category selected.');
        return res.render('seller/upload-product', { title: 'Upload New Product', product: req.body, categories: categories });
    }

    try {
        const newProduct = new Product({
            name: name.trim(),
            category: category.trim(),
            shortDescription: shortDescription ? shortDescription.trim() : undefined,
            price: Number(price),
            stock: Number(stock),
            imageUrl: imageUrl.trim(),
            imageUrl2: imageUrl2 ? imageUrl2.trim() : undefined,
            specifications: specifications ? specifications.trim() : '',
            sellerId: sellerId,
            sellerEmail: sellerEmail,
            reviewStatus: 'pending'
        });

        await newProduct.save();
        console.log(`Product ${newProduct._id} saved initially by seller ${sellerEmail}.`);

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
           return res.render('seller/upload-product', { title: 'Upload New Product', product: req.body, categories: categories });
       }
        console.error("Error uploading product:", error);
        next(error);
    }
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
        const product = await Product.findOne({ _id: req.params.id, sellerId: req.session.user._id }) // Ensure ownership
                                     .lean();
        if (!product) {
           req.flash('error_msg', 'Product not found or access denied.');
           return res.redirect('/seller/products');
       }
       res.render('seller/edit-product', {
           title: `Edit Product: ${product.name}`,
           product: product,
           categories: categories
       });
   } catch (error) {
        if (error.name === 'CastError') {
          req.flash('error_msg', 'Invalid product ID format.');
           return res.redirect('/seller/products');
      }
       next(error);
    }
};

exports.updateProduct = async (req, res, next) => {
    const productId = req.params.id;
    const sellerId = req.session.user._id;
    const { name, category, price, stock, imageUrl, imageUrl2, specifications, shortDescription } = req.body;
    const renderOptions = { title: `Edit Product Error`, product: { _id: productId, ...req.body }, categories: categories };

     if (!name || !category || price === undefined || stock === undefined || !imageUrl) {
        req.flash('error_msg', 'Please fill in all required fields.');
        try { const originalProduct = await Product.findOne({ _id: productId, sellerId: sellerId }).lean(); renderOptions.product = { ...originalProduct, ...req.body }; } catch (fetchErr) { console.error("Error refetching product on update validation fail:", fetchErr); }
        return res.render('seller/edit-product', renderOptions);
    }
     if (isNaN(Number(price)) || Number(price) < 0 || isNaN(Number(stock)) || Number(stock) < 0) {
         req.flash('error_msg', 'Price and Stock must be valid non-negative numbers.');
         try { const originalProduct = await Product.findOne({ _id: productId, sellerId: sellerId }).lean(); renderOptions.product = { ...originalProduct, ...req.body }; } catch (fetchErr) { console.error("Error refetching product on update validation fail:", fetchErr); }
         return res.render('seller/edit-product', renderOptions);
     }
     if (!categoryNames.includes(category)) {
        req.flash('error_msg', 'Invalid category selected.');
         try { const originalProduct = await Product.findOne({ _id: productId, sellerId: sellerId }).lean(); renderOptions.product = { ...originalProduct, ...req.body }; } catch (fetchErr) { console.error("Error refetching product on update validation fail:", fetchErr); }
        return res.render('seller/edit-product', renderOptions);
    }

    try {
        const product = await Product.findOne({ _id: productId, sellerId: sellerId });

        if (!product) {
            req.flash('error_msg', 'Product not found or access denied.');
            return res.status(404).redirect('/seller/products');
         }

         product.name = name.trim();
         product.category = category.trim();
         product.shortDescription = shortDescription ? shortDescription.trim() : undefined;
         product.price = Number(price);
         product.stock = Number(stock);
         product.imageUrl = imageUrl.trim();
         product.imageUrl2 = imageUrl2 ? imageUrl2.trim() : undefined;
         product.specifications = specifications ? specifications.trim() : '';
         product.reviewStatus = 'pending';
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
              try { const originalProduct = await Product.findOne({ _id: productId, sellerId: sellerId }).lean(); renderOptions.product = { ...originalProduct, ...req.body }; } catch (fetchErr) { console.error("Error refetching product on update validation fail:", fetchErr); }
             return res.render('seller/edit-product', renderOptions);
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

exports.getManageOrdersPage = async (req, res, next) => {
    try {
        const sellerId = req.session.user._id;

        const sellerProductRefs = await Product.find({ sellerId: sellerId }).select('_id').lean();
        const sellerProductIds = sellerProductRefs.map(p => p._id);

        if (sellerProductIds.length === 0) {
             return res.render('seller/manage-orders', {
                 title: 'Manage Your Orders',
                 orders: [],
                 message: 'You have no products listed, so no orders to manage yet.',
                 sellerCancellationReasons: sellerCancellationReasons
             });
        }

        // Find orders containing ANY of the seller's products
        const orders = await Order.find({ 'products.productId': { $in: sellerProductIds } })
                                   .sort({ orderDate: -1 })
                                   .populate('products.productId', 'name imageUrl _id price sellerId')
                                   .populate('userId', 'name email')
                                   .lean();

        const now = Date.now();
        orders.forEach(order => {
             // Mark if the order is relevant (already guaranteed by query, but good for clarity)
             order.isRelevantToSeller = true;
             // Conditions for seller actions
             order.canBeDirectlyDeliveredBySeller = order.status === 'Pending';
             order.canBeCancelledBySeller = order.status === 'Pending';

             order.showDeliveryOtp = order.status === 'Pending' &&
                                     !!order.orderOTP &&
                                     !!order.orderOTPExpires &&
                                     new Date(order.orderOTPExpires).getTime() > now;

            // Create summary, highlighting seller's items
            if (order.products && order.products.length > 0) {
                order.itemsSummary = order.products.map(p => {
                    const isSellerItem = p.productId?.sellerId?.toString() === sellerId.toString();
                    const price = (p.priceAtOrder !== undefined && p.priceAtOrder !== null) ? p.priceAtOrder : (p.productId?.price ?? 0);
                    const productName = p.productId?.name || p.name || '[Product Name Missing]';
                    // Highlight seller's item
                    return `${isSellerItem ? '<strong class="text-success">' : ''}${productName} (Qty: ${p.quantity}) @ ₹${price.toFixed(2)}${isSellerItem ? ' (Your Item)</strong>' : ''}`;
                }).join('<br>');
            } else {
                 order.itemsSummary = 'No items found';
            }
        });
        res.render('seller/manage-orders', {
            title: 'Manage Your Orders',
            orders: orders,
            message: null,
            sellerCancellationReasons: sellerCancellationReasons
        });
    } catch (error) {
        next(error);
    }
};

exports.sendDirectDeliveryOtpBySeller = async (req, res, next) => {
    const { orderId } = req.params;
    const sellerId = req.session.user._id;

    try {
        // Basic check before calling the service function
        const order = await Order.findById(orderId).select('status'); // Select minimal field
        if (!order) throw new Error("Order not found.");
        if (order.status !== 'Pending') throw new Error(`Cannot send OTP for order status ${order.status}.`);

        // isOrderRelevantToSeller middleware already checked relevance
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
         // isOrderRelevantToSeller middleware already checked relevance
         const { order } = await confirmDirectDeliveryBySeller(orderId, sellerId, otp.trim(), res);
        req.flash('success_msg', `Order ${orderId} confirmed delivered by you.`);
    } catch (error) {
        req.flash('error_msg', `Delivery confirmation failed: ${error.message}`);
    }
    res.redirect('/seller/orders');
};

exports.cancelOrderBySeller = async (req, res, next) => {
    const { orderId } = req.params;
    const { reason } = req.body;
    const sellerId = req.session.user._id;
    const sellerEmail = req.session.user.email;

    if (!reason || !sellerCancellationReasons.includes(reason)) {
        req.flash('error_msg', 'Please select a valid seller reason for cancellation.');
        return res.redirect('/seller/orders');
    }

    const sessionDB = await mongoose.startSession();
    sessionDB.startTransaction();
    try {
        // isOrderRelevantToSeller middleware ensures relevance
        const order = await Order.findById(orderId)
                                .populate('products.productId', 'sellerId name _id')
                                // *** Populate user name for email ***
                                .populate('userId', 'email name')
                                .session(sessionDB);

        if (!order) { // Should not happen if middleware worked, but good check
            await sessionDB.abortTransaction(); sessionDB.endSession();
            req.flash('error_msg', 'Order not found.');
            return res.status(404).redirect('/seller/orders');
        }

        if (order.status !== 'Pending') {
            await sessionDB.abortTransaction(); sessionDB.endSession();
            req.flash('error_msg', `Order status is '${order.status}'. Only 'Pending' orders can be cancelled by seller.`);
            return res.redirect('/seller/orders');
        }

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
                 // Restore stock AND decrement order count for the specific product
                 return Product.updateOne(
                     { _id: item.productId._id },
                     { $inc: { stock: quantityToRestore, orderCount: -1 } }, // Also decrement orderCount
                     { session: sessionDB }
                 ).catch(err => {
                    console.error(`Seller Cancel: Failed stock/count restore P.ID ${item.productId._id} O.ID ${orderId}: ${err.message}`);
                 });
            });

        await Promise.allSettled(productStockRestorePromises);
        console.log(`Seller Cancel: Stock restoration attempts completed for seller ${sellerId} in order ${orderId}.`);

        // Set order status to Cancelled - This applies to the whole order
        order.status = 'Cancelled';
        order.cancellationReason = `Cancelled by Seller: ${reason}`;
        // Clear OTP fields (handled by pre-save hook as well)
        order.orderOTP = undefined;
        order.orderOTPExpires = undefined;
        order.cancellationAllowedUntil = undefined;

        await order.save({ session: sessionDB });

        await sessionDB.commitTransaction();

        // *** UPDATED: Send Cancellation Email to Customer using template ***
        try {
            const customerEmail = order.userEmail || order.userId?.email;
            // *** Use populated name or fallback ***
            const customerName = order.shippingAddress.name || order.userId?.name || 'Customer';
            if(customerEmail) {
                const subjectCust = `Update on Your miniapp Order #${order._id}`;
                const textCust = `Unfortunately, your order (${order._id}) has been cancelled by the seller. Reason: ${reason}. Contact support for questions.`;
                const htmlCust = generateEmailHtml({
                    recipientName: customerName,
                    subject: subjectCust,
                    greeting: `Regarding Your Order #${order._id}`,
                    bodyLines: [
                        `We are writing to inform you that item(s) in your order (#${order._id}) had to be cancelled by the seller.`,
                        `<strong>Reason:</strong> ${reason}`, // Use the seller's reason
                        `If any payment was made for the cancelled items, a refund will be processed according to our policy.`,
                        `We apologize for any inconvenience. Please contact support if you have questions.`
                    ],
                    buttonUrl: `${req.protocol}://${req.get('host')}/orders/my-orders`,
                    buttonText: 'View My Orders',
                    companyName: 'miniapp'
                });
                await sendEmail(customerEmail, subjectCust, textCust, htmlCust);
            } else {
                console.warn(`Seller Cancel: Could not find customer email for order ${orderId} notification.`);
            }
        } catch (emailError) {
            console.error(`Seller Cancel: Failed sending cancellation email for order ${order._id}:`, emailError);
        }
        // *** END UPDATE ***

        req.flash('success_msg', `Order ${orderId} cancelled successfully. Reason: ${reason}. Customer notified.`);
        res.redirect('/seller/orders');

    } catch (error) {
        if(sessionDB.inTransaction()) {
            await sessionDB.abortTransaction();
        }
        console.error(`Error cancelling order ${orderId} by seller ${sellerEmail} (${sellerId}):`, error);
        req.flash('error_msg', 'Failed to cancel order due to an internal error.');
        res.redirect('/seller/orders');
    } finally {
        if (sessionDB && sessionDB.endSession) {
            sessionDB.endSession();
        }
    }
};