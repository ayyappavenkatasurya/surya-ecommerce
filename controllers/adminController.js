// controllers/adminController.js
const Product = require('../models/Product');
const Order = require('../models/Order');
const User = require('../models/User');
const { sendEmail } = require('../config/mailer');
const {
    generateAndSendDirectDeliveryOTPByAdmin,
    confirmDirectDeliveryByAdmin,
} = require('./orderController'); // Assuming these are correctly defined elsewhere
const mongoose = require('mongoose');
// --- Import the Gemini service ---
const { reviewProductWithGemini } = require('../services/geminiReviewService');

const cancellationReasons = [
    "📞 Unable to contact the customer",
    "❗ Out of stock/unavailable item",
    "🗺️ Address incorrect/incomplete",
    "🚫 Customer requested cancellation",
    "❓ Other (Admin/Seller)",
];


// --- DASHBOARD ---
exports.getAdminDashboard = async (req, res, next) => {
    try {
        let pendingProductCount = 0;
        // Count pending products only if the user is an admin
        if (req.session.user.role === 'admin') {
            pendingProductCount = await Product.countDocuments({ status: 'Pending Review' });
        }
        // Seller dashboard might show different stats if needed later

        res.render('admin/dashboard', {
            title: req.session.user.role === 'admin' ? 'Admin Dashboard' : 'Seller Dashboard',
            userRole: req.session.user.role, // Pass role to view
            pendingProductCount // Pass count to view for admin
        });
    } catch (error) {
        next(error);
    }
};

// --- PRODUCT MANAGEMENT (Combined Admin/Seller) ---

exports.getUploadProductPage = (req, res) => {
    // Renders the upload form page
    res.render('admin/upload-product', { title: 'Upload New Product' });
};

exports.getManageProductsPage = async (req, res, next) => {
    try {
        let productQuery = {};
        // Seller sees only their own products based on their email
        if (req.session.user.role === 'seller') {
            productQuery.sellerEmail = req.session.user.email;
        }
        // Admins see all products (no specific filter needed here)

        const products = await Product.find(productQuery)
                                   .sort({ createdAt: -1 }) // Show newest first
                                   .lean(); // Use lean for better performance in read-only views

        res.render('admin/manage-products', {
            title: 'Manage Products',
            products: products,
            userRole: req.session.user.role // Pass role for view conditional rendering
        });
    } catch (error) {
        next(error);
    }
};

exports.getEditProductPage = async (req, res, next) => {
     try {
        const product = await Product.findById(req.params.id);

        if (!product) {
            req.flash('error_msg', 'Product not found.');
            return res.redirect('/admin/manage-products');
        }

        // --- Ownership/Role Check for Editing ---
        // Sellers can only edit products where their email matches the product's sellerEmail
        if (req.session.user.role === 'seller' && product.sellerEmail !== req.session.user.email) {
            req.flash('error_msg', 'Access Denied: You can only edit your own products.');
            return res.redirect('/admin/manage-products');
        }
        // Admins can edit any product

        res.render('admin/edit-product', {
            title: `Edit Product: ${product.name}`,
            product: product // Pass the full product object
        });
    } catch (error) {
         // Handle invalid ID format
         if (error.name === 'CastError') {
           req.flash('error_msg', 'Invalid product ID format.');
            return res.redirect('/admin/manage-products');
       }
        next(error); // Pass other errors to handler
     }
 };

exports.uploadProduct = async (req, res, next) => {
    const { name, category, price, stock, imageUrl, specifications } = req.body;
    const sellerEmail = req.session.user.email; // User uploading is the seller/creator
    const userRole = req.session.user.role;

     // --- Input Validation ---
     if (!name || !category || price === undefined || stock === undefined || !imageUrl) {
        req.flash('error_msg', 'Please fill in all required fields (Name, Category, Price, Stock, Image URL).');
        return res.redirect('/admin/upload-product');
    }
     if (isNaN(Number(price)) || Number(price) < 0 || isNaN(Number(stock)) || Number(stock) < 0) {
        req.flash('error_msg', 'Price and Stock must be valid non-negative numbers.');
        return res.redirect('/admin/upload-product');
     }
    // --- End Validation ---

    try {
        // --- Determine Initial Product Status based on Role ---
        // Admins' products are auto-approved. Sellers' products start as Pending Review.
        const initialStatus = userRole === 'admin' ? 'Approved' : 'Pending Review';

        // Create the new product instance
        const newProduct = new Product({
            name: name.trim(),
            category: category.trim(),
            price: Number(price),
            stock: Number(stock),
            imageUrl: imageUrl.trim(),
            specifications: specifications ? specifications.trim() : '',
            sellerEmail: sellerEmail, // Set the creator's email
            status: initialStatus,    // Set status based on role
            rejectionReason: null   // Ensure null initially
        });

        await newProduct.save(); // Save the product to the database
        const savedProductId = newProduct._id; // Get the ID of the newly saved product

        let flashMessage = '';
        // --- Check if Auto-Review should be triggered ---
        const autoReviewEnabled = process.env.ENABLE_AUTO_REVIEW === 'true' && process.env.GEMINI_API_KEY;

        // Trigger review only for Sellers, if status is Pending, and if feature is enabled
        if (userRole === 'seller' && initialStatus === 'Pending Review' && autoReviewEnabled) {
            flashMessage = `Product "${newProduct.name}" submitted successfully and is being reviewed automatically.`;
            // Call Gemini review asynchronously (doesn't block the response to the user)
            // Using setImmediate ensures this runs after the current event loop finishes
            setImmediate(() => {
                reviewProductWithGemini(savedProductId).catch(err => {
                     console.error(`Error triggering Gemini review for ${savedProductId}:`, err);
                     // Product remains 'Pending Review' for manual check if Gemini fails
                 });
            });
        } else if (userRole === 'seller' && initialStatus === 'Pending Review' && !autoReviewEnabled) {
             // Auto-review disabled, needs manual review
             flashMessage = `Product "${newProduct.name}" uploaded successfully and is pending manual review.`;
             // TODO: Optionally notify admins here for manual review
        } else { // Admin upload (already approved)
            flashMessage = `Product "${newProduct.name}" uploaded and approved successfully by admin.`;
        }

        req.flash('success_msg', flashMessage);
        res.redirect('/admin/manage-products'); // Redirect after processing

    } catch (error) {
        // Handle Mongoose validation errors
        if (error.name === 'ValidationError') {
           let errors = Object.values(error.errors).map(el => el.message);
           req.flash('error_msg', `Validation Error: ${errors.join(' ')}`);
           return res.redirect('/admin/upload-product');
       }
        // Handle other errors
        console.error("Error uploading product:", error);
        next(error);
    }
};

 exports.updateProduct = async (req, res, next) => {
    const productId = req.params.id;
    const { name, category, price, stock, imageUrl, specifications } = req.body;
    const userEmail = req.session.user.email;
    const userRole = req.session.user.role;

     // --- Input Validation ---
     if (!name || !category || price === undefined || stock === undefined || !imageUrl) {
        req.flash('error_msg', 'Please fill in all required fields.');
        return res.redirect(`/admin/manage-products/edit/${productId}`);
    }
     if (isNaN(Number(price)) || Number(price) < 0 || isNaN(Number(stock)) || Number(stock) < 0) {
         req.flash('error_msg', 'Price and Stock must be valid non-negative numbers.');
        return res.redirect(`/admin/manage-products/edit/${productId}`);
    }
    // --- End Validation ---

    try {
        const product = await Product.findById(productId);
        if (!product) {
            req.flash('error_msg', 'Product not found.');
            return res.status(404).redirect('/admin/manage-products');
         }

         // --- Ownership Check for Sellers ---
         if (userRole === 'seller' && product.sellerEmail !== userEmail) {
            req.flash('error_msg', 'Access Denied: You can only update your own products.');
            return res.status(403).redirect('/admin/manage-products');
         }

         // --- Apply Updates to the product object ---
         product.name = name.trim();
         product.category = category.trim();
         product.price = Number(price);
         product.stock = Number(stock);
         product.imageUrl = imageUrl.trim();
         product.specifications = specifications ? specifications.trim() : '';

         // --- Determine Status After Update ---
         let needsReview = false;
         let finalStatus = product.status; // Keep current status by default for admin edit
         let flashMessage = '';

         if (userRole === 'seller') {
             finalStatus = 'Pending Review'; // Seller updates always trigger re-review
             needsReview = true; // Mark that review (manual or auto) is needed
         } else if (userRole === 'admin') {
              // Admin updates keep the current status unless explicitly changed via review actions
              flashMessage = `Product "${product.name}" updated successfully by admin. Status remains: ${product.status}.`;
         }

         product.status = finalStatus;
         // Clear rejection reason if going back to pending or if it's approved
         if (finalStatus === 'Pending Review' || finalStatus === 'Approved') {
             product.rejectionReason = null;
         }

         await product.save(); // Save the updated product

        // --- Trigger Auto-Review for Sellers if Needed and Enabled ---
         const autoReviewEnabled = process.env.ENABLE_AUTO_REVIEW === 'true' && process.env.GEMINI_API_KEY;

         if (needsReview && autoReviewEnabled) {
             flashMessage = `Product "${product.name}" updated and submitted for automated review.`;
             // Call Gemini review asynchronously
             setImmediate(() => {
                reviewProductWithGemini(productId).catch(err => {
                    console.error(`Error triggering Gemini review for updated product ${productId}:`, err);
                     // Product remains 'Pending Review' if Gemini fails
                });
             });
         } else if (needsReview && !autoReviewEnabled) {
             flashMessage = `Product "${product.name}" updated and is pending manual review.`;
             // TODO: Optionally notify admins for manual review
         }
         // Note: Admin flash message was set earlier if applicable

         req.flash('success_msg', flashMessage);
         res.redirect('/admin/manage-products');

    } catch (error) {
         // Handle Mongoose validation errors
         if (error.name === 'ValidationError') {
            let errors = Object.values(error.errors).map(el => el.message);
             req.flash('error_msg', `Validation Error: ${errors.join(' ')}`);
             return res.redirect(`/admin/manage-products/edit/${productId}`);
         }
         // Handle invalid ID format
         if (error.name === 'CastError') {
             req.flash('error_msg', 'Invalid product ID format.');
             return res.status(400).redirect('/admin/manage-products');
         }
         // Handle other errors
         console.error("Error updating product:", error);
         next(error);
     }
 };

exports.removeProduct = async (req, res, next) => {
    const productId = req.params.id;
    const userEmail = req.session.user.email;
    const userRole = req.session.user.role;

    try {
        const product = await Product.findById(productId);

        if (!product) {
            req.flash('error_msg', 'Product not found.');
            return res.status(404).redirect('/admin/manage-products');
         }

         // --- Ownership Check for Sellers ---
         if (userRole === 'seller' && product.sellerEmail !== userEmail) {
            req.flash('error_msg', 'Access Denied: You can only remove your own products.');
            return res.status(403).redirect('/admin/manage-products');
         }
         // Admins can remove any product

         // TODO: Consider implications - removing a product might affect past orders if not handled carefully.
         // Deleting is simple, but might be better to mark as 'Archived' or 'Deleted'.
         // For now, we proceed with deletion.
         await Product.deleteOne({ _id: productId }); // Use deleteOne for clarity

         req.flash('success_msg', `Product "${product.name}" removed successfully.`);
         res.redirect('/admin/manage-products');

    } catch (error) {
        // Handle invalid ID format
        if (error.name === 'CastError') {
             req.flash('error_msg', 'Invalid product ID format.');
             return res.status(400).redirect('/admin/manage-products');
         }
         // Handle other errors
        console.error("Error removing product:", error);
        next(error);
    }
};

// --- PRODUCT REVIEW (Admin Only Actions) ---

exports.getReviewProductsPage = async (req, res, next) => {
    // Ensure only admins can access this page (route middleware should also enforce this)
    if (req.session.user.role !== 'admin') {
        req.flash('error_msg', 'Access Denied.');
        return res.redirect('/admin/dashboard');
    }
    try {
        // Find products specifically with 'Pending Review' status
        const pendingProducts = await Product.find({ status: 'Pending Review' })
                                          .sort({ updatedAt: 1 }) // Show oldest pending first
                                          .lean(); // Use lean for read-only view
        res.render('admin/review-products', {
            title: 'Review Pending Products',
            products: pendingProducts
        });
    } catch (error) {
        next(error);
    }
};

exports.approveProduct = async (req, res, next) => {
    // Ensure only admins can perform this action (route middleware should also enforce this)
    if (req.session.user.role !== 'admin') {
         req.flash('error_msg', 'Access Denied.');
         // Redirect to a safe page, maybe dashboard or review page itself
         return res.redirect(req.headers.referer || '/admin/review-products');
    }
    const productId = req.params.id;
    try {
        const product = await Product.findById(productId);
        if (!product) {
            req.flash('error_msg', 'Product not found.');
            return res.redirect('/admin/review-products');
        }
        // Ensure the product is actually pending review before approving
        if (product.status !== 'Pending Review') {
            req.flash('error_msg', `Product is not pending review (Status: ${product.status}).`);
            return res.redirect('/admin/review-products');
        }

        // Update status and clear rejection reason
        product.status = 'Approved';
        product.rejectionReason = null; // Clear any previous reason explicitly
        await product.save();

        // TODO: Optionally notify the seller via email
        // try {
        //     await sendEmail(product.sellerEmail, `Product Approved: ${product.name}`, `<p>Your product "${product.name}" has been approved and is now live on the site.</p>`);
        // } catch (emailError) { console.error("Failed to send approval email:", emailError); }


        req.flash('success_msg', `Product "${product.name}" approved successfully.`);
        res.redirect('/admin/review-products'); // Redirect back to the review list
    } catch (error) {
        if (error.name === 'CastError') { req.flash('error_msg', 'Invalid product ID.'); }
        else { req.flash('error_msg', 'Error approving product.'); }
        console.error("Error approving product:", error);
        res.redirect('/admin/review-products');
    }
};

exports.rejectProduct = async (req, res, next) => {
    // Ensure only admins can perform this action (route middleware should also enforce this)
     if (req.session.user.role !== 'admin') {
        req.flash('error_msg', 'Access Denied.');
        return res.redirect(req.headers.referer || '/admin/review-products');
    }
    const productId = req.params.id;
    const { rejectionReason } = req.body; // Get reason from the form submission

    // Validate that a reason was provided
    if (!rejectionReason || rejectionReason.trim() === '') {
        req.flash('error_msg', 'Rejection reason is required.');
        // Redirect back to the review list. Ideally, state could be preserved, but this is simpler.
        return res.redirect('/admin/review-products');
    }

    try {
        const product = await Product.findById(productId);
        if (!product) {
            req.flash('error_msg', 'Product not found.');
            return res.redirect('/admin/review-products');
        }
        // Ensure the product is actually pending review before rejecting
         if (product.status !== 'Pending Review') {
             req.flash('error_msg', `Product is not pending review (Status: ${product.status}).`);
             return res.redirect('/admin/review-products');
         }

        // Update status and set the rejection reason
        product.status = 'Rejected';
        product.rejectionReason = rejectionReason.trim();
        await product.save();

        // TODO: Optionally notify the seller via email including the reason
        // try {
        //     await sendEmail(product.sellerEmail, `Product Rejected: ${product.name}`, `<p>Your product "${product.name}" has been rejected.</p><p><strong>Reason:</strong> ${product.rejectionReason}</p>`);
        // } catch (emailError) { console.error("Failed to send rejection email:", emailError); }

        req.flash('success_msg', `Product "${product.name}" rejected successfully.`);
        res.redirect('/admin/review-products'); // Redirect back to the review list

    } catch (error) {
        if (error.name === 'CastError') { req.flash('error_msg', 'Invalid product ID.'); }
        else { req.flash('error_msg', 'Error rejecting product.'); }
        console.error("Error rejecting product:", error);
        res.redirect('/admin/review-products');
    }
};


// --- ORDER MANAGEMENT (Combined Admin/Seller View, Limited Seller Actions) ---

exports.getManageOrdersPage = async (req, res, next) => {
    try {
        let ordersQuery = {};
        const userRole = req.session.user.role;
        const userEmail = req.session.user.email;

        // --- Filter orders based on role ---
        if (userRole === 'seller') {
            // 1. Find all product IDs belonging to this seller (efficiently)
            const sellerProducts = await Product.find({ sellerEmail: userEmail }).select('_id').lean();
            const sellerProductIds = sellerProducts.map(p => p._id);

            // 2. Find orders that contain at least one of these product IDs
            // Ensure sellerProductIds is not empty to avoid matching all orders if seller has no products
            if (sellerProductIds.length > 0) {
                 ordersQuery = { 'products.productId': { $in: sellerProductIds } };
            } else {
                 // If seller has no products, they have no relevant orders
                 ordersQuery = { _id: new mongoose.Types.ObjectId() }; // Query that matches nothing
            }
        }
        // Admins see all orders (ordersQuery remains empty {})

        const orders = await Order.find(ordersQuery)
                                   .sort({ orderDate: -1 }) // Sort by most recent order date
                                   // Populate necessary product and address details
                                   .populate('products.productId', 'name imageUrl _id price sellerEmail') // Include sellerEmail for display/check
                                   .lean(); // Use lean for performance

        // Add flags and format data for the view based on role
        orders.forEach(order => {
            // Admin specific action flags
            order.canBeCancelledByAdmin = userRole === 'admin' && order.status === 'Pending';
            order.canBeDirectlyDeliveredByAdmin = userRole === 'admin' && order.status === 'Pending';

            // Prepare item summary differently for sellers to highlight their items
            if (userRole === 'seller') {
                order.itemsSummary = order.products.map(p => {
                     // Check if the populated product's seller email matches the current seller
                     const isSellerProduct = p.productId?.sellerEmail === userEmail;
                     // Apply conditional styling
                     const highlightStyle = isSellerProduct ? 'style="font-weight: bold; color: var(--primary-color);"' : '';
                     const productName = p.productId?.name || '[Product Missing]';
                     const price = (p.priceAtOrder || 0).toFixed(2);
                     // Return HTML string for the item summary
                     return `<span ${highlightStyle}>${productName} (Qty: ${p.quantity}) @ ₹${price}</span>`;
                }).join('<br>'); // Join items with line breaks
            } else {
                 // Admin view (show all items normally)
                if (order.products && order.products.length > 0) {
                    order.itemsSummary = order.products.map(p =>
                        `${p.productId?.name || '[Product Name Missing]'} (Qty: ${p.quantity}) @ ₹${(p.priceAtOrder || 0).toFixed(2)}`
                    ).join('<br>');
                } else {
                    order.itemsSummary = 'No items found';
                }
            }
        });

        res.render('admin/manage-orders', {
            title: 'Manage Orders',
            orders: orders,
            cancellationReasons: cancellationReasons,
            userRole: userRole // Pass role to view for conditional elements
        });
    } catch (error) {
        next(error);
    }
};

// --- Direct Delivery OTP/Confirm (Admin Only Actions) ---
exports.sendDirectDeliveryOtpByAdmin = async (req, res, next) => {
    // Explicit admin check (redundant if route middleware is correct, but good practice)
    if (req.session.user.role !== 'admin') {
        req.flash('error_msg', 'Access Denied.');
        return res.redirect('/admin/manage-orders');
    }
    const { orderId } = req.params;
    try {
        // Assuming the internal function already has necessary checks (order exists, is pending)
        const result = await generateAndSendDirectDeliveryOTPByAdmin(orderId);
        req.flash('success_msg', result.message + ' Ask customer for OTP to confirm delivery.');
    } catch (error) {
        req.flash('error_msg', `Failed to send direct delivery OTP: ${error.message}`);
    }
    res.redirect('/admin/manage-orders'); // Redirect back to the orders list
};

exports.confirmDirectDeliveryByAdmin = async (req, res, next) => {
    // Explicit admin check
    if (req.session.user.role !== 'admin') {
        req.flash('error_msg', 'Access Denied.');
        return res.redirect('/admin/manage-orders');
    }
    const { orderId } = req.params;
    const { otp } = req.body;
    const adminUserId = req.session.user._id; // Get the actual admin ID

    // Validate OTP format
    if (!otp || !/^\d{6}$/.test(otp.trim())) {
        req.flash('error_msg', 'Please enter the 6-digit OTP received by the customer.');
        return res.redirect('/admin/manage-orders');
    }

    try {
        // Call the internal function which handles OTP verification and order update
        // Pass `res` so the helper can potentially use `res.locals.formatDateIST`
        const { order } = await confirmDirectDeliveryByAdmin(orderId, adminUserId, otp.trim(), res);
        req.flash('success_msg', `Order ${orderId} confirmed delivered successfully (Directly by Admin).`);
    } catch (error) {
        // Catch errors from the helper (e.g., invalid OTP, order not found)
        req.flash('error_msg', `Direct delivery confirmation failed: ${error.message}`);
    }
    res.redirect('/admin/manage-orders'); // Redirect back to the orders list
};

// --- Cancel Order (Admin Only Action) ---
// Note: Allowing sellers to cancel is complex if an order mixes sellers. Kept Admin-only.
exports.cancelOrderByAdmin = async (req, res, next) => {
    // Explicit admin check
    if (req.session.user.role !== 'admin') {
        req.flash('error_msg', 'Access Denied: Only admins can cancel orders.');
        return res.redirect('/admin/manage-orders');
    }
    const { orderId } = req.params;
    const { reason } = req.body;
    const adminUserId = req.session.user._id;

    // Validate cancellation reason
    if (!reason || !cancellationReasons.includes(reason)) {
        req.flash('error_msg', 'Please select a valid reason for cancellation.');
        return res.redirect('/admin/manage-orders');
    }

    const sessionDB = await mongoose.startSession(); // Start DB transaction
    sessionDB.startTransaction();
    try {
        // Find order within the transaction, populate product details for logging/stock restore
        const order = await Order.findById(orderId)
                                .populate('products.productId', 'name _id') // Populate name and ID
                                .session(sessionDB);

        if (!order) {
            req.flash('error_msg', 'Order not found.');
            await sessionDB.abortTransaction(); sessionDB.endSession();
            return res.status(404).redirect('/admin/manage-orders');
        }
        // Ensure only Pending orders can be cancelled this way
        if (order.status !== 'Pending') {
            req.flash('error_msg', `Order cannot be cancelled by admin in its current status ('${order.status}'). Must be 'Pending'.`);
            await sessionDB.abortTransaction(); sessionDB.endSession();
            return res.redirect('/admin/manage-orders');
        }

        // --- Restore Stock and Decrement Order Count for each item ---
        console.log(`Admin Cancellation (${adminUserId}): Attempting to restore stock/orderCount for cancelled order ${orderId}.`);
        const productStockRestorePromises = order.products.map(item => {
              const quantityToRestore = Number(item.quantity);
             // Validate quantity and product ID before attempting update
             if (isNaN(quantityToRestore) || quantityToRestore <= 0) {
                console.warn(`Admin Cancel: Invalid quantity ${item.quantity} for product ${item.productId?._id || 'Unknown ID'} in order ${orderId}, skipping stock restore.`);
                return Promise.resolve(); // Skip if invalid
            }
            if (!item.productId?._id) {
                console.warn(`Admin Cancel: Missing or invalid productId for an item in order ${orderId}, skipping stock restore.`);
                return Promise.resolve(); // Skip if invalid
            }
             // Use updateOne within the transaction to increment stock and decrement orderCount
             return Product.updateOne(
                { _id: item.productId._id },
                { $inc: { stock: quantityToRestore, orderCount: -1 } }, // Atomically update both
                { session: sessionDB }
            ).catch(err => {
               // Log error but don't abort the whole process if one product fails? Or should we abort?
               // Let's log and continue for now, but this could lead to inconsistencies.
               console.error(`Admin Cancel: Failed restore stock/orderCount for product ${item.productId._id} (${item.productId.name}) on order ${orderId}: ${err.message}`);
            });
        });
        await Promise.all(productStockRestorePromises); // Wait for all stock updates
        console.log(`Admin Cancel: Stock/OrderCount restoration attempted for order ${orderId}.`);
        // --- End Stock Restore ---

        // Update order status and reason
        order.status = 'Cancelled';
        order.cancellationReason = reason; // Store the selected reason
        // Other fields like OTP/expiry are cleared by pre-save hook in Order model
        await order.save({ session: sessionDB });

        // If all operations succeeded, commit the transaction
        await sessionDB.commitTransaction();

        // --- Send Notification Email (After successful transaction) ---
        try {
            const subjectCust = `Your Order (${order._id}) Has Been Cancelled`;
            const htmlCust = `<p>Your order (${order._id}) has been cancelled by administration.</p><p><strong>Reason:</strong> ${order.cancellationReason}</p><p>Please contact support if you have questions regarding this cancellation.</p>`;
            await sendEmail(order.userEmail, subjectCust, `Your order ${order._id} has been cancelled. Reason: ${order.cancellationReason}`, htmlCust);
        } catch (emailError) {
            console.error(`Failed sending cancellation email to customer for order ${order._id}:`, emailError);
            // Don't fail the request if email fails, just log it.
        }
        // --- End Email ---

        req.flash('success_msg', `Order ${orderId} cancelled successfully with reason: ${reason}. Stock restored.`);
        res.redirect('/admin/manage-orders');

    } catch (error) {
        // If any error occurred, abort the transaction
        await sessionDB.abortTransaction();
        // Handle specific errors
        if (error.name === 'CastError') {
            req.flash('error_msg', 'Invalid Order ID format.');
        } else {
            console.error(`Error cancelling order ${orderId} by admin ${adminUserId}:`, error);
            req.flash('error_msg', 'Failed to cancel the order due to an internal error.');
        }
        res.redirect('/admin/manage-orders');
    } finally {
        // Always end the session
        sessionDB.endSession();
    }
};


// --- USER MANAGEMENT (Admin Only Actions) ---

exports.getManageUsersPage = async (req, res, next) => {
    // Explicit admin check
    if (req.session.user.role !== 'admin') {
        req.flash('error_msg', 'Access Denied.');
        return res.redirect('/admin/dashboard');
    }
    try {
        // Exclude the current admin user from the list they are managing
        const users = await User.find({ _id: { $ne: req.session.user._id } })
                                  .select('name email role createdAt isVerified address.phone') // Select fields needed for display
                                  .sort({ createdAt: -1 }) // Show newest users first
                                  .lean(); // Use lean for performance
        res.render('admin/manage-users', {
            title: 'Manage Registered Users',
            users: users
        });
    } catch (error) {
        next(error);
    }
};

exports.updateUserRole = async (req, res, next) => {
    // Explicit admin check
    if (req.session.user.role !== 'admin') {
        req.flash('error_msg', 'Access Denied.');
        // Redirect back to prevent unauthorized action
        return res.redirect('/admin/manage-users');
    }
    const userId = req.params.id;
    const { role } = req.body;
     // Define allowed roles (including the new 'seller' role)
     const allowedRoles = ['user', 'admin', 'seller'];
     // Validate the submitted role
     if (!role || !allowedRoles.includes(role)) {
        req.flash('error_msg', 'Invalid role selected.');
         return res.status(400).redirect('/admin/manage-users');
     }

    try {
        // Prevent admin from changing their own role via this form
        if (req.params.id === req.session.user._id.toString()) {
             req.flash('error_msg', 'You cannot change your own role.');
             return res.redirect('/admin/manage-users');
         }

        const user = await User.findById(userId);
         if (!user) {
            req.flash('error_msg', 'User not found.');
             return res.status(404).redirect('/admin/manage-users');
         }

         // --- Prevent removing the last admin ---
         // If the user is currently an admin AND the new role is NOT admin
         if (user.role === 'admin' && role !== 'admin') {
            // Count how many admins currently exist
            const adminCount = await User.countDocuments({ role: 'admin' });
            // If there's only one or zero admins left, prevent the role change
            if (adminCount <= 1) {
                req.flash('error_msg', 'Cannot change the role of the last admin account.');
                return res.redirect('/admin/manage-users');
            }
        }
        // --- End Last Admin Check ---

         // Update the user's role
         user.role = role;
        await user.save(); // Save the change
        req.flash('success_msg', `User ${user.email}'s role updated to ${role}.`);
        res.redirect('/admin/manage-users'); // Redirect back to the list

    } catch (error) {
         // Handle invalid ID format
         if (error.name === 'CastError') {
             req.flash('error_msg', 'Invalid user ID format.');
             return res.status(400).redirect('/admin/manage-users');
         } else {
             // Handle other errors
             console.error(`Error updating role for user ${userId}:`, error);
            req.flash('error_msg', 'Error updating user role.');
            res.redirect('/admin/manage-users');
         }
    }
};

exports.removeUser = async (req, res, next) => {
    // Explicit admin check
     if (req.session.user.role !== 'admin') {
        req.flash('error_msg', 'Access Denied.');
        return res.redirect('/admin/manage-users'); // Redirect back
    }
    const userId = req.params.id;
    try {
        // Prevent admin from removing themselves
        if (req.params.id === req.session.user._id.toString()) {
            req.flash('error_msg', 'You cannot remove yourself.');
            return res.redirect('/admin/manage-users');
        }

         const user = await User.findById(userId);
         if (!user) {
            req.flash('error_msg', 'User not found.');
             return res.status(404).redirect('/admin/manage-users');
         }

         // --- Prevent removing the last admin ---
         if (user.role === 'admin') {
             const adminCount = await User.countDocuments({ role: 'admin' });
             if (adminCount <= 1) {
                 req.flash('error_msg', 'Cannot remove the last admin account.');
                return res.redirect('/admin/manage-users');
             }
         }
        // --- End Last Admin Check ---

         // --- Handle Seller Product Ownership (Important!) ---
         // Decide what happens to products owned by a seller being removed.
         if (user.role === 'seller') {
             console.warn(`Removing seller ${user.email}. Review policy for their products.`);
             // Option 1: Delete their products (Potentially dangerous for past orders)
             // await Product.deleteMany({ sellerEmail: user.email });
             // Option 2: Reassign products to a default admin or mark as orphaned
             // await Product.updateMany({ sellerEmail: user.email }, { $set: { status: 'Orphaned', sellerEmail: 'admin@example.com' }}); // Example reassignment
             // Option 3: Just remove the user (products become orphaned - current approach)
             // Current approach: Log warning, products remain associated with the now-deleted seller's email.
         }
         // --- End Seller Product Handling ---

        // Remove the user document
        await User.deleteOne({ _id: userId });

        req.flash('success_msg', `User ${user.email} removed successfully.`);
        res.redirect('/admin/manage-users');

    } catch (error) {
         // Handle invalid ID format
         if (error.name === 'CastError') {
             req.flash('error_msg', 'Invalid user ID format.');
             return res.status(400).redirect('/admin/manage-users');
         } else {
             // Handle other errors
             console.error(`Error removing user ${userId}:`, error);
            req.flash('error_msg', 'Error removing user.');
            res.redirect('/admin/manage-users');
         }
     }
 };