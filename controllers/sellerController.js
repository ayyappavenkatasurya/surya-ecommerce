// controllers/sellerController.js
const Product = require('../models/Product');
const Order = require('../models/Order');
const User = require('../models/User');
const { reviewProductWithGemini } = require('../services/geminiService');
// Make sure these are correctly exported/adapted if needed
const {
    generateAndSendDirectDeliveryOTPBySeller,
    confirmDirectDeliveryBySeller
} = require('./orderController');
const mongoose = require('mongoose');

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
                 message: 'You have no products listed, so no orders to manage yet.' // Pass the message here
             });
        }

        // 2. Find orders containing any of these products
        const orders = await Order.find({ 'products.productId': { $in: sellerProductIds } })
                                   .sort({ orderDate: -1 })
                                   // Populate product fields needed for display/checks
                                   .populate('products.productId', 'name imageUrl _id price sellerId')
                                   .lean();

        // 3. Add flags specific to seller actions and format items summary
        const now = Date.now();
        orders.forEach(order => {
             order.isRelevantToSeller = true; // Already filtered
             order.canBeDirectlyDeliveredBySeller = order.status === 'Pending';
             order.canBeCancelledBySeller = false; // Sellers don't cancel in this logic

            // Check if OTP should be shown on this page (useful for seller)
            // This check was originally in getMyOrders, duplicated here for seller view context
             order.showDeliveryOtp = order.status === 'Pending' &&
                                     !!order.orderOTP &&
                                     !!order.orderOTPExpires &&
                                     new Date(order.orderOTPExpires).getTime() > now;

             // Format Items Summary (Highlight seller's items)
            if (order.products && order.products.length > 0) {
                order.itemsSummary = order.products.map(p => {
                    const isSellerItem = p.productId?.sellerId?.toString() === sellerId.toString();
                    // Safely access price
                    const price = (p.priceAtOrder !== undefined && p.priceAtOrder !== null) ? p.priceAtOrder : (p.productId?.price ?? 0);
                    const productName = p.productId?.name || p.name || '[Product Name Missing]'; // Use populated name if available

                    return `${isSellerItem ? '<strong>' : ''}${productName} (Qty: ${p.quantity}) @ ₹${price.toFixed(2)}${isSellerItem ? '</strong> (Your Item)' : ''}`;
                }).join('<br>');
            } else {
                 order.itemsSummary = 'No items found';
            }
        });

        // *** Render the template, PASSING message as null ***
        res.render('seller/manage-orders', {
            title: 'Manage Your Orders',
            orders: orders,
            message: null // Pass null when orders exist
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