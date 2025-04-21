// controllers/sellerController.js
const Product = require('../models/Product');
const Order = require('../models/Order');
const User = require('../models/User');
const Category = require('../models/Category'); // *** IMPORT Category Model ***
const { sendEmail } = require('../config/mailer');
const { reviewProductWithGemini } = require('../services/geminiService');
const {
    generateAndSendDirectDeliveryOTPBySeller,
    confirmDirectDeliveryBySeller
} = require('./orderController');
const mongoose = require('mongoose');

const sellerCancellationReasons = [
    "❗ Item Out of Stock",
    "🚚 Unable to Fulfill/Ship",
    "👤 Customer Requested Cancellation",
    "❓ Other Reason",
];

// Seller Dashboard
exports.getSellerDashboard = (req, res) => {
    res.render('seller/dashboard', { title: 'Seller Dashboard' });
};

// --- Product Management Pages ---
// --- UPDATED: Fetch Categories for Upload Page ---
exports.getUploadProductPage = async (req, res, next) => {
     try {
         const categories = await Category.find().sort('name').lean(); // Fetch categories
         res.render('seller/upload-product', {
            title: 'Upload New Product',
            product: {}, // Empty product object for form binding
            categories: categories // Pass categories to the view
        });
     } catch (error) {
        console.error("Error fetching categories for seller upload page:", error);
        req.flash('error_msg', 'Could not load category data.');
         res.render('seller/upload-product', { // Render even if category fetch fails
             title: 'Upload New Product',
             product: {},
             categories: []
         });
     }
};

// --- UPDATED: Fetch Categories for Edit Page ---
exports.getEditProductPage = async (req, res, next) => {
     try {
        // isProductOwner middleware ensures ownership
        const [product, categories] = await Promise.all([
             Product.findOne({ _id: req.params.id, sellerId: req.session.user._id })
                    .populate('categoryRef') // Populate category object
                    .lean(), // Fetch the specific product owned by the seller
             Category.find().sort('name').lean() // Fetch all categories
        ]);

        if (!product) {
           req.flash('error_msg', 'Product not found or you do not have permission to edit it.');
           return res.redirect('/seller/products');
        }

        res.render('seller/edit-product', {
           title: `Edit Product: ${product.name}`,
           product: product,
           categories: categories // Pass categories to the view
        });

   } catch (error) {
        if (error.name === 'CastError') {
            req.flash('error_msg', 'Invalid product ID format.');
            return res.redirect('/seller/products');
        }
        console.error("Error fetching product/categories for edit:", error);
        next(error);
    }
};


// --- Product Management Actions ---
// --- UPDATED: Handle categoryRef on Upload ---
exports.uploadProduct = async (req, res, next) => {
    // *** Get categoryRef instead of category ***
    const { name, categoryRef, price, stock, imageUrl, description, specifications } = req.body;
    const sellerId = req.session.user._id;
    const sellerEmail = req.session.user.email;
    let categories = []; // For re-rendering form on error

     try {
         // Fetch categories for validation and error re-rendering
         categories = await Category.find().sort('name').lean();

         // --- Updated Validation ---
        if (!name || !categoryRef || price === undefined || stock === undefined || !imageUrl) { // Check ref
            req.flash('error_msg', 'Please fill in all required fields (Name, Category, Price, Stock, Image URL).');
            return res.render('seller/upload-product', { title: 'Upload New Product', product: req.body, categories: categories });
        }
         if (!mongoose.Types.ObjectId.isValid(categoryRef)) {
            req.flash('error_msg', 'Invalid category selected.');
            return res.render('seller/upload-product', { title: 'Upload New Product', product: req.body, categories: categories });
         }
         if (isNaN(Number(price)) || Number(price) < 0 || isNaN(Number(stock)) || Number(stock) < 0) {
            req.flash('error_msg', 'Price and Stock must be valid non-negative numbers.');
            return res.render('seller/upload-product', { title: 'Upload New Product', product: req.body, categories: categories });
         }
          // Ensure categories are loaded for the check below
          if (!categories || categories.length === 0) {
               throw new Error("Categories could not be loaded for validation.");
          }
          // Verify Category Exists
          const selectedCategory = categories.find(cat => cat._id.toString() === categoryRef);
          if (!selectedCategory) {
              req.flash('error_msg', 'Selected category not found or invalid.');
              return res.render('seller/upload-product', { title: 'Upload New Product', product: req.body, categories: categories });
          }

        // --- Save using categoryRef (categoryName will be added by pre-save hook) ---
        const newProduct = new Product({
            name: name.trim(),
            categoryRef: categoryRef, // Use categoryRef
            // categoryName will be set by pre-save hook using selectedCategory.name
            description: description ? description.trim() : '',
            price: Number(price),
            stock: Number(stock),
            imageUrl: imageUrl.trim(),
            specifications: specifications ? specifications.trim() : '',
            sellerId: sellerId,
            sellerEmail: sellerEmail,
            reviewStatus: 'pending' // Start as pending
        });

        await newProduct.save(); // Pre-save hook runs here to set categoryName
        console.log(`Product ${newProduct._id} (Cat: ${newProduct.categoryName}) saved initially by seller ${sellerEmail}.`);

        // Trigger Gemini review asynchronously (pass the saved product which now has _id)
        reviewProductWithGemini(newProduct).then(async reviewResult => {
             try {
                 const productToUpdate = await Product.findById(newProduct._id);
                 if (productToUpdate) {
                    productToUpdate.reviewStatus = reviewResult.status;
                    productToUpdate.rejectionReason = reviewResult.reason;
                    await productToUpdate.save(); // Save the updated review status
                    console.log(`Product ${newProduct._id} review status updated to ${reviewResult.status}.`);
                 } else {
                     console.warn(`Product ${newProduct._id} not found for status update after Gemini review.`);
                 }
             } catch (updateError) {
                console.error(`Error updating product ${newProduct._id} after Gemini review:`, updateError);
             }
        }).catch(reviewError => {
             console.error(`Error in Gemini review promise chain for product ${newProduct._id}:`, reviewError);
             // Attempt to mark as pending with error reason if review chain fails
              Product.findByIdAndUpdate(newProduct._id, { reviewStatus: 'pending', rejectionReason: 'AI review process failed.' }).catch(err => console.error("Failed to mark product as pending after review error:", err));
        });

        req.flash('success_msg', `Product "${newProduct.name}" submitted for review.`);
        res.redirect('/seller/products'); // Redirect to seller's product list

    } catch (error) {
         // Ensure categories are available if an error occurs before or during fetch
         if (!categories || categories.length === 0) {
              try { categories = await Category.find().sort('name').lean(); } catch (catError) { console.error("Failed to fetch categories for error display:", catError); }
         }
        if (error.name === 'ValidationError') {
           let errors = Object.values(error.errors).map(el => el.message);
           req.flash('error_msg', `Validation Error: ${errors.join(' ')}`);
           return res.render('seller/upload-product', { title: 'Upload New Product', product: req.body, categories: categories || [] });
       }
        console.error("Error uploading product:", error);
        req.flash('error_msg', `Error uploading product: ${error.message}`);
        return res.render('seller/upload-product', { title: 'Upload New Product', product: req.body, categories: categories || [] });
        // Or use next(error);
    }
};

// --- UPDATED: Handle categoryRef on Update ---
exports.updateProduct = async (req, res, next) => {
    const productId = req.params.id;
    const sellerId = req.session.user._id;
    // *** Get categoryRef instead of category ***
    const { name, categoryRef, price, stock, imageUrl, description, specifications } = req.body;
     let categories = []; // For potential re-rendering on error

    try {
        // Fetch categories early for validation/error case
        categories = await Category.find().sort('name').lean();

         // --- Updated Validation ---
         if (!name || !categoryRef || price === undefined || stock === undefined || !imageUrl) { // Check ref
            req.flash('error_msg', 'Please fill in all required fields.');
             // Redirect back to edit page, data will be re-fetched by getEditProductPage
             return res.redirect(`/seller/products/edit/${productId}`);
         }
        if (!mongoose.Types.ObjectId.isValid(categoryRef)) {
             req.flash('error_msg', 'Invalid category selected.');
             return res.redirect(`/seller/products/edit/${productId}`);
          }
         if (isNaN(Number(price)) || Number(price) < 0 || isNaN(Number(stock)) || Number(stock) < 0) {
             req.flash('error_msg', 'Price and Stock must be valid non-negative numbers.');
             return res.redirect(`/seller/products/edit/${productId}`);
         }
          // Ensure categories loaded for check
          if (!categories || categories.length === 0) {
               throw new Error("Categories could not be loaded for validation.");
          }
        // Verify Category Exists using pre-fetched categories
        const selectedCategory = categories.find(cat => cat._id.toString() === categoryRef);
        if (!selectedCategory) {
           req.flash('error_msg', 'Selected category not found or invalid.');
           return res.redirect(`/seller/products/edit/${productId}`);
        }

        // Use findOne to ensure ownership and get non-lean doc for saving
        const product = await Product.findOne({ _id: productId, sellerId: sellerId });
        if (!product) {
            req.flash('error_msg', 'Product not found or access denied.');
            return res.status(404).redirect('/seller/products');
         }

         // Check if core details impacting review have changed
         const detailsChanged = product.name !== name.trim() ||
                               product.categoryRef.toString() !== categoryRef ||
                               product.description !== (description ? description.trim() : '') ||
                               product.imageUrl !== imageUrl.trim();


         // Update product fields
         product.name = name.trim();
         product.categoryRef = categoryRef; // Update Ref
         // categoryName will be updated by pre-save hook using selectedCategory.name
         product.description = description ? description.trim() : '';
         product.price = Number(price);
         product.stock = Number(stock);
         product.imageUrl = imageUrl.trim();
         product.specifications = specifications ? specifications.trim() : '';

         // Only reset review status if relevant details changed
         if (detailsChanged) {
            product.reviewStatus = 'pending'; // Reset status on update of key details
            product.rejectionReason = undefined; // Clear rejection reason
            console.log(`Product ${productId} core details updated by seller, set to pending review.`);
         } else {
            console.log(`Product ${productId} updated by seller (only price/stock/specs?), review status remains ${product.reviewStatus}.`);
         }


         await product.save(); // Pre-save runs to update categoryName if needed

        // Trigger Gemini review only if status was reset to pending
        if (product.reviewStatus === 'pending') {
            reviewProductWithGemini(product).then(async reviewResult => {
                 try {
                     const productToUpdate = await Product.findById(product._id); // Refetch fresh instance
                     if (productToUpdate) {
                        productToUpdate.reviewStatus = reviewResult.status;
                        productToUpdate.rejectionReason = reviewResult.reason;
                        await productToUpdate.save(); // Save review status
                        console.log(`Product ${product._id} review status updated to ${reviewResult.status} after edit.`);
                     }
                 } catch (updateError) {
                    console.error(`Error updating product ${product._id} after Gemini review (post-edit):`, updateError);
                 }
            }).catch(reviewError => {
                 console.error(`Error in Gemini review promise chain for edited product ${product._id}:`, reviewError);
                  Product.findByIdAndUpdate(product._id, { reviewStatus: 'pending', rejectionReason: 'AI review process failed after edit.' }).catch(err => console.error("Failed to mark edited product as pending after review error:", err));
             });
        }

         req.flash('success_msg', `Product "${product.name}" updated${product.reviewStatus === 'pending' ? ' and resubmitted for review' : ''}.`);
         res.redirect('/seller/products');

    } catch (error) {
         // Ensure categories available for potential error render (though redirect is preferred)
          if (!categories || categories.length === 0) {
               try { categories = await Category.find().sort('name').lean(); } catch (catErr) {}
           }
        if (error.name === 'ValidationError') {
            let errors = Object.values(error.errors).map(el => el.message);
            req.flash('error_msg', `Validation Error: ${errors.join(' ')}`);
        } else {
             console.error("Error updating product:", error);
            req.flash('error_msg', 'An error occurred while updating the product.');
        }
        // Redirect back to edit page on any error to allow user to fix
        return res.redirect(`/seller/products/edit/${productId}`);
    }
};

// --- UPDATED: Populate category name ---
exports.getManageProductsPage = async (req, res, next) => {
    try {
        const sellerId = req.session.user._id;
        const products = await Product.find({ sellerId: sellerId })
                                    .populate('categoryRef', 'name') // Populate category name via ref
                                    .sort({ createdAt: -1 })
                                    .lean();

        res.render('seller/manage-products', {
            title: 'Manage Your Products',
            products: products
        });
    } catch (error) {
        console.error("Error fetching seller products:", error);
        next(error);
    }
};

exports.removeProduct = async (req, res, next) => {
    const productId = req.params.id;
    const sellerId = req.session.user._id; // Ensure seller ID from session

    try {
         // Find and delete specifically matching the product ID AND seller ID
         const product = await Product.findOneAndDelete({ _id: productId, sellerId: sellerId });

        if (!product) {
             // Product either doesn't exist or doesn't belong to this seller
             req.flash('error_msg', 'Product not found or you do not have permission to remove it.');
             return res.status(404).redirect('/seller/products');
         }
         req.flash('success_msg', `Product "${product.name}" removed successfully.`);
         res.redirect('/seller/products'); // Redirect back to the seller's product list
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

// --- Seller Order Management Page ---
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
                                   .populate('products.productId', 'name imageUrl _id price sellerId') // Include sellerId here
                                   .populate('userId', 'name email') // Populate user for display if needed
                                   .lean();

        // 3. Add flags specific to seller actions and format items summary
        const now = Date.now();
        orders.forEach(order => {
             order.isRelevantToSeller = true; // Set flag based on the find query
             order.canBeDirectlyDeliveredBySeller = order.status === 'Pending';
             order.canBeCancelledBySeller = order.status === 'Pending';

             order.showDeliveryOtp = order.status === 'Pending' &&
                                     !!order.orderOTP &&
                                     !!order.orderOTPExpires &&
                                     new Date(order.orderOTPExpires).getTime() > now;

            // Format item summary, highlighting seller's items
            if (order.products && order.products.length > 0) {
                order.itemsSummary = order.products.map(p => {
                    const isSellerItem = p.productId?.sellerId?.toString() === sellerId.toString();
                    const price = (p.priceAtOrder !== undefined && p.priceAtOrder !== null) ? p.priceAtOrder : (p.productId?.price ?? 0);
                    const productName = p.productId?.name || p.name || '[Product Name Missing]';
                    // Highlight seller's items using text-success (or other class)
                    return `${isSellerItem ? '<strong class="text-success">' : ''}${productName} (Qty: ${p.quantity}) @ ₹${price.toFixed(2)}${isSellerItem ? ' (Your Item)</strong>' : ''}`;
                }).join('<br>');
            } else {
                 order.itemsSummary = 'No items found';
            }
        });

        res.render('seller/manage-orders', {
            title: 'Manage Your Orders',
            orders: orders,
            message: null, // No general message if orders were found
            sellerCancellationReasons: sellerCancellationReasons
        });
    } catch (error) {
        console.error("Error fetching seller orders:", error);
        next(error);
    }
};


// --- Seller Order Actions (send OTP, confirm delivery, cancel order) ---
// These actions don't directly involve category details, so no changes needed here
// assuming relevance is checked via middleware (isOrderRelevantToSeller).

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
    res.redirect('/seller/orders'); // Redirect back to the orders page
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
    res.redirect('/seller/orders'); // Redirect back
};

exports.cancelOrderBySeller = async (req, res, next) => {
    const { orderId } = req.params;
    const { reason } = req.body;
    const sellerId = req.session.user._id;
    const sellerEmail = req.session.user.email; // For logging

    if (!reason || !sellerCancellationReasons.includes(reason)) {
        req.flash('error_msg', 'Please select a valid seller reason for cancellation.');
        return res.redirect('/seller/orders');
    }

    const sessionDB = await mongoose.startSession();
    sessionDB.startTransaction();
    try {
        // Middleware ensures relevance, but fetch needed details again for the transaction
        const order = await Order.findById(orderId)
                                .populate('products.productId', 'sellerId name _id') // Include necessary fields
                                .populate('userId', 'email')
                                .session(sessionDB);

        if (!order) {
            await sessionDB.abortTransaction(); sessionDB.endSession();
            req.flash('error_msg', 'Order not found.');
            return res.status(404).redirect('/seller/orders');
        }

        if (order.status !== 'Pending') {
            await sessionDB.abortTransaction(); sessionDB.endSession();
            req.flash('error_msg', `Order status is '${order.status}'. Only 'Pending' orders can be cancelled by seller.`);
            return res.redirect('/seller/orders');
        }

        // Double-check relevance inside transaction
        const isRelevant = order.products.some(p => p.productId?.sellerId?.toString() === sellerId.toString());
        if (!isRelevant) {
             await sessionDB.abortTransaction(); sessionDB.endSession();
             console.warn(`Seller ${sellerEmail} (${sellerId}) attempted cancellation for non-relevant order ${orderId}.`);
             req.flash('error_msg', 'Permission Denied: Order does not contain your products.');
             return res.status(403).redirect('/seller/orders');
        }

        console.log(`Seller Cancel: Restoring stock for seller ${sellerId}'s items in order ${orderId}.`);
        // Filter to only restore stock for THIS seller's items
        const productStockRestorePromises = order.products
            .filter(item => item.productId?.sellerId?.toString() === sellerId.toString())
            .map(item => {
                const quantityToRestore = Number(item.quantity);
                 if (!item.productId?._id || isNaN(quantityToRestore) || quantityToRestore <= 0) {
                    console.warn(`Seller Cancel: Invalid P.ID ${item.productId?._id} or Qty ${item.quantity} for seller's item in O.ID ${orderId}. Skipping restore.`);
                    return Promise.resolve(); // Skip invalid items gracefully
                }
                console.log(`Seller Cancel: Restoring ${quantityToRestore} stock for P.ID ${item.productId._id}`);
                 // Update Product stock and decrement order count within transaction
                 return Product.updateOne(
                     { _id: item.productId._id },
                     { $inc: { stock: quantityToRestore, orderCount: -1 } },
                     { session: sessionDB } // Use transaction session
                 ).catch(err => {
                    // Log the error but allow the main cancellation logic to continue
                    console.error(`Seller Cancel: Failed stock/count restore P.ID ${item.productId._id} O.ID ${orderId}: ${err.message}`);
                 });
            });

        await Promise.allSettled(productStockRestorePromises); // Wait for all attempts
        console.log(`Seller Cancel: Stock restoration attempts completed for seller ${sellerId} in order ${orderId}.`);

        // Cancel the entire order (current implementation)
        order.status = 'Cancelled';
        order.cancellationReason = `Cancelled by Seller: ${reason}`;
        // Clear sensitive fields upon cancellation
        order.orderOTP = undefined;
        order.orderOTPExpires = undefined;
        order.cancellationAllowedUntil = undefined;

        await order.save({ session: sessionDB }); // Save order changes

        await sessionDB.commitTransaction(); // Commit the transaction

        // Send email notification (outside transaction)
        try {
            const customerEmail = order.userEmail || order.userId?.email; // Find customer email
            if(customerEmail) {
                const subjectCust = `Update on Your Order (${order._id})`;
                const htmlCust = `<p>Unfortunately, your order (${order._id}) has been cancelled by the seller.</p>
                                <p><strong>Reason:</strong> ${reason}</p>
                                <p>Any payment made (if applicable) will be refunded according to policy.</p>
                                <p>We apologize for any inconvenience. Please contact support if you have questions.</p>`;
                const textCust = `Your order ${order._id} was cancelled by the seller. Reason: ${reason}. Contact support for questions.`;
                await sendEmail(customerEmail, subjectCust, textCust, htmlCust); // Send email
            } else {
                console.warn(`Seller Cancel: Could not find customer email for order ${orderId} notification.`);
            }
        } catch (emailError) {
            console.error(`Seller Cancel: Failed sending cancellation email for order ${order._id}:`, emailError);
        }

        req.flash('success_msg', `Order ${orderId} cancelled successfully. Reason: ${reason}. Customer notified.`);
        res.redirect('/seller/orders'); // Redirect back

    } catch (error) {
        if (sessionDB.inTransaction()) { // Abort if transaction is still active
            await sessionDB.abortTransaction();
        }
        console.error(`Error cancelling order ${orderId} by seller ${sellerEmail} (${sellerId}):`, error);
        req.flash('error_msg', 'Failed to cancel order due to an internal error.');
        res.redirect('/seller/orders'); // Redirect back
    } finally {
         if (sessionDB.id) { await sessionDB.endSession(); } // Always end the session
    }
};