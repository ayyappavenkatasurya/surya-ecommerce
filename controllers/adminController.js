// controllers/adminController.js
const Product = require('../models/Product');
const Order = require('../models/Order');
const User = require('../models/User');
const BannerConfig = require('../models/BannerConfig');
const Category = require('../models/Category'); // *** IMPORT Category Model ***
const { sendEmail } = require('../config/mailer');
const { reviewProductWithGemini } = require('../services/geminiService');
const {
    generateAndSendDirectDeliveryOTPByAdmin,
    confirmDirectDeliveryByAdmin,
} = require('./orderController'); // Assuming these functions handle OTP logic correctly
const mongoose = require('mongoose');

const cancellationReasons = [
    "📞 Unable to contact the customer",
    "❗ Out of stock/unavailable item",
    "🗺️ Address incorrect/incomplete",
    "🚫 Customer requested cancellation",
    "❓ Other (Admin)",
];

// --- Admin Dashboard ---
exports.getAdminDashboard = (req, res) => {
    res.render('admin/dashboard', { title: 'Admin Dashboard' });
};

// ======================================
// NEW: Category Management Controllers
// ======================================

exports.getManageCategoriesPage = async (req, res, next) => {
    try {
        const categories = await Category.find({})
                                          .populate('createdBy', 'name email') // Populate user info
                                          .populate('lastUpdatedBy', 'name email')
                                          .sort({ name: 1 }) // Sort alphabetically by name
                                          .lean();
        res.render('admin/manage-categories', {
            title: 'Manage Categories',
            categories: categories
        });
    } catch (error) {
        next(error);
    }
};

exports.getAddCategoryPage = (req, res) => {
    res.render('admin/add-category', {
        title: 'Add New Category',
        category: {} // Empty object for the form value binding
    });
};

exports.addCategory = async (req, res, next) => {
    const { name, imageUrl } = req.body;
    const adminUserId = req.session.user._id;

    if (!name || !imageUrl) {
        req.flash('error_msg', 'Please provide both a category name and an image URL.');
        return res.render('admin/add-category', {
            title: 'Add New Category',
            category: req.body // Repopulate form with entered data
        });
    }

    try {
        // Check if category name already exists (case-insensitive check recommended)
        const existingCategory = await Category.findOne({ name: { $regex: new RegExp('^' + name.trim() + '$', 'i') } });
        if (existingCategory) {
            req.flash('error_msg', `Category "${name.trim()}" already exists.`);
             return res.render('admin/add-category', {
                 title: 'Add New Category',
                 category: req.body
             });
        }

        const newCategory = new Category({
            name: name.trim(),
            imageUrl: imageUrl.trim(),
            createdBy: adminUserId,
            lastUpdatedBy: adminUserId
        });
        await newCategory.save(); // Triggers pre-save hook for slug

        req.flash('success_msg', `Category "${newCategory.name}" added successfully.`);
        res.redirect('/admin/manage-categories');

    } catch (error) {
        if (error.name === 'ValidationError') {
           let errors = Object.values(error.errors).map(el => el.message);
           req.flash('error_msg', `Validation Error: ${errors.join(' ')}`);
           return res.render('admin/add-category', {
               title: 'Add New Category',
               category: req.body
           });
       } else if (error.code === 11000) { // Handle potential duplicate slug error
             req.flash('error_msg', `A category with a similar name might already exist (duplicate slug). Please choose a different name.`);
             return res.render('admin/add-category', {
                  title: 'Add New Category',
                 category: req.body
             });
         }
        console.error("Error adding category:", error);
        next(error);
    }
};


exports.getEditCategoryPage = async (req, res, next) => {
    try {
        const category = await Category.findById(req.params.id)
                                        .populate('createdBy', 'name email') // Optional: populate creator
                                        .lean();
        if (!category) {
            req.flash('error_msg', 'Category not found.');
            return res.redirect('/admin/manage-categories');
        }
        res.render('admin/edit-category', {
            title: `Edit Category: ${category.name}`,
            category: category
        });
    } catch (error) {
        if (error.name === 'CastError') {
            req.flash('error_msg', 'Invalid category ID format.');
            return res.redirect('/admin/manage-categories');
        }
        next(error);
    }
};

exports.updateCategory = async (req, res, next) => {
    const categoryId = req.params.id;
    const { name, imageUrl } = req.body;
    const adminUserId = req.session.user._id;
    let categoryDataForRender = null; // For repopulating form on error

     if (!name || !imageUrl) {
        req.flash('error_msg', 'Please provide both a category name and an image URL.');
        try {
            categoryDataForRender = await Category.findById(categoryId).lean();
        } catch (fetchError) {
            console.error("Error fetching category for error render:", fetchError);
        }
        return res.render('admin/edit-category', {
            title: `Edit Category: ${categoryDataForRender?.name || 'Error'}`,
            category: categoryDataForRender ? { ...categoryDataForRender, ...req.body } : { _id: categoryId, ...req.body } // Repopulate form
         });
    }

    try {
        const category = await Category.findById(categoryId); // Fetch full doc for .save()
        if (!category) {
            req.flash('error_msg', 'Category not found.');
            return res.status(404).redirect('/admin/manage-categories');
        }

        // Optional: Check if new name conflicts with ANOTHER existing category (case-insensitive)
        if (category.name.toLowerCase() !== name.trim().toLowerCase()) {
            const existingCategory = await Category.findOne({
                 name: { $regex: new RegExp('^' + name.trim() + '$', 'i') },
                 _id: { $ne: categoryId } // Exclude the current category
            });
             if (existingCategory) {
                 req.flash('error_msg', `Another category with the name "${name.trim()}" already exists.`);
                 // Use lean category data for rendering efficiency
                 categoryDataForRender = category.toObject();
                 return res.render('admin/edit-category', {
                     title: `Edit Category: ${category.name}`,
                     category: { ...categoryDataForRender, ...req.body }
                 });
             }
        }

        category.name = name.trim();
        category.imageUrl = imageUrl.trim();
        category.lastUpdatedBy = adminUserId;

        await category.save(); // Triggers pre-save hook for slug update if name changed
        req.flash('success_msg', `Category "${category.name}" updated successfully.`);
        res.redirect('/admin/manage-categories');

    } catch (error) {
         // Fetch category again for re-rendering form on error
         try {
            categoryDataForRender = await Category.findById(categoryId).lean();
         } catch(fetchError) { console.error("Error fetching category for error render:", fetchError);}

         if (error.name === 'ValidationError') {
            let errors = Object.values(error.errors).map(el => el.message);
             req.flash('error_msg', `Validation Error: ${errors.join(' ')}`);
             return res.render('admin/edit-category', {
                 title: `Edit Category: ${categoryDataForRender?.name || 'Error'}`,
                 category: categoryDataForRender ? { ...categoryDataForRender, ...req.body } : { _id: categoryId, ...req.body }
             });
         } else if (error.code === 11000) { // Handle potential duplicate slug error
             req.flash('error_msg', `Updating failed: A category with a similar name might already exist (duplicate slug). Please choose a different name.`);
             return res.render('admin/edit-category', {
                 title: `Edit Category: ${categoryDataForRender?.name || 'Error'}`,
                 category: categoryDataForRender ? { ...categoryDataForRender, ...req.body } : { _id: categoryId, ...req.body }
             });
         }
        console.error("Error updating category:", error);
        next(error);
    }
};

exports.deleteCategory = async (req, res, next) => {
    const categoryId = req.params.id;
    try {
        const category = await Category.findById(categoryId);
        if (!category) {
            req.flash('error_msg', 'Category not found.');
            return res.status(404).redirect('/admin/manage-categories');
        }

        // Use instance method deleteOne to trigger 'deleteOne' middleware (checks products)
        await category.deleteOne();

        req.flash('success_msg', `Category "${category.name}" deleted successfully.`);
        res.redirect('/admin/manage-categories');

    } catch (error) {
        if (error.name === 'CastError') {
            req.flash('error_msg', 'Invalid category ID format.');
            return res.status(400).redirect('/admin/manage-categories');
        }
        // Catch specific error from pre-delete hook (if products exist)
        if (error.message.startsWith('Cannot delete category')) {
            req.flash('error_msg', error.message);
        } else {
            console.error("Error deleting category:", error);
            req.flash('error_msg', 'Error deleting category. Check server logs.');
        }
        res.redirect('/admin/manage-categories');
    }
};

// ======================================
// End: Category Management Controllers
// ======================================


// --- Admin Product Upload Page ---
// --- UPDATED: Fetch Categories ---
exports.getUploadProductPage = async (req, res, next) => {
    try {
        const categories = await Category.find().sort('name').lean(); // Fetch categories
        res.render('admin/upload-product', {
            title: 'Admin: Upload New Product',
            product: {},
            categories: categories // Pass categories to the view
        });
    } catch (error) {
        console.error("Error fetching categories for upload page:", error);
        // Optionally render with an error message or redirect
         req.flash('error_msg', 'Could not load categories for the upload form.');
         res.redirect('/admin/dashboard');
        // next(error); // Or pass to global error handler
    }
};

// --- Admin Product Upload Action ---
// --- UPDATED: Handle categoryRef ---
exports.uploadProduct = async (req, res, next) => {
    // Get categoryRef instead of category
    const { name, categoryRef, price, stock, imageUrl, description, specifications } = req.body;
    const adminUserId = req.session.user._id;
    const adminUserEmail = req.session.user.email;
    let categories = []; // For re-rendering form on error

    try {
        // Fetch categories first, needed for both success and error paths
        categories = await Category.find().sort('name').lean();

        // Basic Validation
        if (!name || !categoryRef || price === undefined || stock === undefined || !imageUrl) {
            req.flash('error_msg', 'Please fill in all required fields (Name, Category, Price, Stock, Image URL).');
            return res.render('admin/upload-product', { title: 'Admin: Upload New Product', product: req.body, categories: categories });
        }
        if (!mongoose.Types.ObjectId.isValid(categoryRef)) {
             req.flash('error_msg', 'Invalid category selected.');
            return res.render('admin/upload-product', { title: 'Admin: Upload New Product', product: req.body, categories: categories });
        }
        if (isNaN(Number(price)) || Number(price) < 0 || isNaN(Number(stock)) || Number(stock) < 0) {
            req.flash('error_msg', 'Price and Stock must be valid non-negative numbers.');
            return res.render('admin/upload-product', { title: 'Admin: Upload New Product', product: req.body, categories: categories });
        }

        // Verify Category Exists (robustness check)
        const selectedCategory = await Category.findById(categoryRef).lean();
         if (!selectedCategory) {
             req.flash('error_msg', 'Selected category not found.');
             return res.render('admin/upload-product', { title: 'Admin: Upload New Product', product: req.body, categories: categories });
         }


        // Save using categoryRef (categoryName will be added by pre-save hook)
        const newProduct = new Product({
            name: name.trim(),
            categoryRef: categoryRef, // Use categoryRef
            // categoryName will be set by pre-save hook
            description: description ? description.trim() : '',
            price: Number(price),
            stock: Number(stock),
            imageUrl: imageUrl.trim(),
            specifications: specifications ? specifications.trim() : '',
            sellerId: adminUserId,
            sellerEmail: adminUserEmail,
            reviewStatus: 'pending'
        });

        await newProduct.save(); // Pre-save hook runs here to add categoryName
        console.log(`Product ${newProduct._id} (Cat: ${newProduct.categoryName}) saved initially by ADMIN ${adminUserEmail}.`);

        // Send for Gemini Review (Asynchronous) - Make sure this handles the new product structure if needed
        reviewProductWithGemini(newProduct).then(async reviewResult => {
            try {
                // Find the product again *after* save might have triggered async processes
                const productToUpdate = await Product.findById(newProduct._id);
                if (productToUpdate) {
                    productToUpdate.reviewStatus = reviewResult.status;
                    productToUpdate.rejectionReason = reviewResult.reason;
                    await productToUpdate.save();
                    console.log(`Product ${newProduct._id} (Admin Upload) review status updated to ${reviewResult.status}.`);
                } else {
                    console.warn(`Could not find product ${newProduct._id} to update review status after Gemini check.`);
                }
            } catch (updateError) {
                console.error(`Error updating product ${newProduct._id} (Admin Upload) after Gemini review:`, updateError);
            }
        }).catch(reviewError => {
            console.error(`Error in Gemini review promise chain for product ${newProduct._id} (Admin Upload):`, reviewError);
            // Attempt to mark as pending with error reason
             Product.findByIdAndUpdate(newProduct._id, { reviewStatus: 'pending', rejectionReason: 'AI review process failed.' }, { new: true })
                  .catch(err => console.error("Failed to mark admin-uploaded product as pending after review error:", err));
        });

        req.flash('success_msg', `Product "${newProduct.name}" uploaded and submitted for review.`);
        res.redirect('/admin/manage-products');

    } catch (error) {
         // Fetch categories if not already fetched in the try block (e.g., error before fetch)
         if (!categories || categories.length === 0) {
              try { categories = await Category.find().sort('name').lean(); }
              catch (catError) { console.error("Failed to fetch categories for error display:", catError); }
         }
        if (error.name === 'ValidationError') {
           let errors = Object.values(error.errors).map(el => el.message);
           req.flash('error_msg', `Validation Error: ${errors.join(' ')}`);
           return res.render('admin/upload-product', { title: 'Admin: Upload New Product', product: req.body, categories: categories });
       }
        console.error("Error uploading product by Admin:", error);
        next(error); // Pass to generic error handler
    }
};


// --- Manage Products (Admin sees ALL) ---
// --- UPDATED: Populate categoryRef ---
exports.getManageProductsPage = async (req, res, next) => {
    try {
        const products = await Product.find({})
                                    .populate('sellerId', 'name email')
                                    .populate('categoryRef', 'name') // Populate category name
                                    .sort({ createdAt: -1 })
                                    .lean();
        res.render('admin/manage-products', {
            title: 'Manage All Products',
            products: products
        });
    } catch (error) {
        next(error);
    }
};

// --- Edit Product (Admin edits ANY) ---
// --- UPDATED: Fetch categories for dropdown ---
exports.getEditProductPage = async (req, res, next) => {
    try {
        // Fetch product and categories concurrently
        const [product, categories] = await Promise.all([
            Product.findById(req.params.id)
                   .populate('sellerId', 'name email')
                   .populate('categoryRef') // Populate full category object
                   .lean(),
             Category.find().sort('name').lean() // Fetch all categories
        ]);

        if (!product) {
            req.flash('error_msg', 'Product not found.');
            return res.redirect('/admin/manage-products');
        }

        res.render('admin/edit-product', {
            title: `Admin Edit: ${product.name}`,
            product: product,
            categories: categories, // Pass categories to the view
            isAdminView: true
        });
    } catch (error) {
        if (error.name === 'CastError') {
            req.flash('error_msg', 'Invalid product ID format.');
            return res.redirect('/admin/manage-products');
        }
        console.error("Error fetching product/categories for edit:", error);
        next(error);
    }
};


// --- Update Product (Admin updates ANY) ---
// --- UPDATED: Handle categoryRef ---
exports.updateProduct = async (req, res, next) => {
    const productId = req.params.id;
    // Get categoryRef instead of category
    const { name, categoryRef, price, stock, imageUrl, description, specifications, reviewStatus, rejectionReason } = req.body;
    let categories = []; // For re-rendering form on error

    try {
        // Fetch categories first, might be needed for rendering error
        categories = await Category.find().sort('name').lean();

        // Validation
        if (!name || !categoryRef || price === undefined || stock === undefined || !imageUrl) {
            req.flash('error_msg', 'Please fill in all required fields.');
            // Need to redirect back to the edit page which will re-fetch data
            return res.redirect(`/admin/manage-products/edit/${productId}`);
        }
        if (!mongoose.Types.ObjectId.isValid(categoryRef)) {
             req.flash('error_msg', 'Invalid category selected.');
             return res.redirect(`/admin/manage-products/edit/${productId}`);
        }
        if (isNaN(Number(price)) || Number(price) < 0 || isNaN(Number(stock)) || Number(stock) < 0) {
            req.flash('error_msg', 'Price and Stock must be valid non-negative numbers.');
            return res.redirect(`/admin/manage-products/edit/${productId}`);
        }
        const allowedStatus = ['pending', 'approved', 'rejected'];
        if (reviewStatus && !allowedStatus.includes(reviewStatus)) {
            req.flash('error_msg', 'Invalid review status selected.');
            return res.redirect(`/admin/manage-products/edit/${productId}`);
        }
        if (reviewStatus === 'rejected' && !rejectionReason?.trim()) {
            req.flash('error_msg', 'Rejection reason is required when setting status to Rejected.');
            return res.redirect(`/admin/manage-products/edit/${productId}`);
        }

        // Verify Category Exists
         const selectedCategory = await Category.findById(categoryRef).lean();
         if (!selectedCategory) {
             req.flash('error_msg', 'Selected category not found.');
             return res.redirect(`/admin/manage-products/edit/${productId}`);
         }

        // Find product without lean() to use .save()
        const product = await Product.findById(productId);
        if (!product) {
            req.flash('error_msg', 'Product not found.');
            return res.status(404).redirect('/admin/manage-products');
        }

        // Update fields using categoryRef
        product.name = name.trim();
        product.categoryRef = categoryRef; // Update ref
        // categoryName will be updated by pre-save hook automatically
        product.description = description ? description.trim() : '';
        product.price = Number(price);
        product.stock = Number(stock);
        product.imageUrl = imageUrl.trim();
        product.specifications = specifications ? specifications.trim() : '';

        // Handle review status changes
        if (reviewStatus && allowedStatus.includes(reviewStatus)) {
            // Check if status is actually changing
             const statusChanged = product.reviewStatus !== reviewStatus;
             product.reviewStatus = reviewStatus;
            product.rejectionReason = (reviewStatus === 'rejected') ? rejectionReason.trim() : undefined;

             // Optional: Re-trigger review if changed from rejected/pending to approved?
             // if (statusChanged && reviewStatus === 'approved') {
             //    console.log(`Product ${productId} status manually set to Approved by admin.`);
             // }
        }
        // No else needed - don't change status if not provided in request

        await product.save(); // Triggers pre-save hooks (incl. categoryName update)
        req.flash('success_msg', `Product "${product.name}" updated successfully by admin.`);
        res.redirect('/admin/manage-products');

    } catch (error) {
         // Fetch categories if error occurred before fetch was complete
        if (!categories || categories.length === 0) {
             try { categories = await Category.find().sort('name').lean(); }
             catch (catError) { console.error("Error fetching categories for error display:", catError); }
        }
        if (error.name === 'ValidationError') {
            let errors = Object.values(error.errors).map(el => el.message);
            req.flash('error_msg', `Validation Error: ${errors.join(' ')}`);
            // Re-render the edit page with errors and existing data
             try {
                const productData = await Product.findById(productId).populate('sellerId', 'name email').populate('categoryRef').lean();
                // Repopulate the form with attempted values from req.body
                const repopulatedProduct = { ...productData, ...req.body, _id: productId, categoryRef: req.body.categoryRef }; // ensure req.body overrides for repopulation

                return res.render('admin/edit-product', {
                    title: `Admin Edit: ${productData ? productData.name : 'Error'}`,
                    product: repopulatedProduct, // Use the repopulated object
                    categories: categories,
                    isAdminView: true
                });
             } catch (renderError) {
                console.error("Error fetching product/categories for validation error render:", renderError);
                return res.redirect(`/admin/manage-products/edit/${productId}`);
             }
        }
        if (error.name === 'CastError') {
            req.flash('error_msg', 'Invalid ID format (Product or Category).');
            return res.status(400).redirect('/admin/manage-products');
        }
        console.error("Error updating product by Admin:", error);
        next(error); // Pass to generic error handler
    }
};


// --- Remove Product (Admin removes ANY) ---
exports.removeProduct = async (req, res, next) => {
    const productId = req.params.id;
    try {
        const product = await Product.findByIdAndDelete(productId);
        if (!product) {
            req.flash('error_msg', 'Product not found.');
            return res.status(404).redirect('/admin/manage-products');
        }
        req.flash('success_msg', `Product "${product.name}" removed successfully by admin.`);
        res.redirect('/admin/manage-products');
    } catch (error) {
        if (error.name === 'CastError') {
            req.flash('error_msg', 'Invalid product ID format.');
            return res.status(400).redirect('/admin/manage-products');
        }
        console.error("Error removing product by Admin:", error);
        next(error);
    }
};


// --- Manage Orders (Admin sees ALL) ---
exports.getManageOrdersPage = async (req, res, next) => {
      try {
        const orders = await Order.find({})
                                   .sort({ orderDate: -1 })
                                   .select('-__v -products.__v -shippingAddress._id')
                                   .populate('products.productId', 'name imageUrl _id price sellerId')
                                   .populate('userId', 'name email')
                                   .lean();

        const now = Date.now();

        orders.forEach(order => {
            order.canBeCancelledByAdmin = order.status === 'Pending';
            order.canBeDirectlyDeliveredByAdmin = order.status === 'Pending';
            order.showDeliveryOtp = order.status === 'Pending' && !!order.orderOTP && !!order.orderOTPExpires && new Date(order.orderOTPExpires).getTime() > now;

            // Generate items summary string
            if (order.products && order.products.length > 0) {
                order.itemsSummary = order.products.map(p => {
                    const productName = p.productId?.name || p.name || '[Product Missing]';
                    const price = p.priceAtOrder ?? (p.productId?.price ?? 0); // Use price at order, fallback carefully
                    return `${productName} (Qty: ${p.quantity}) @ ₹${price.toFixed(2)}`;
                }).join('<br>');
            } else {
                order.itemsSummary = 'No items found';
            }
        });

        res.render('admin/manage-orders', {
            title: 'Manage All Orders',
            orders: orders,
            cancellationReasons: cancellationReasons
        });
    } catch (error) {
        next(error);
    }
};

// --- Admin Order Actions (sendDirectDeliveryOtpByAdmin, confirmDirectDeliveryByAdmin, cancelOrderByAdmin) ---
// --- These don't interact with category data, so remain unchanged ---
exports.sendDirectDeliveryOtpByAdmin = async (req, res, next) => {
    const { orderId } = req.params;
    try {
        // isOrderRelevantToSeller middleware IS NOT USED HERE (Admin context)
        const result = await generateAndSendDirectDeliveryOTPByAdmin(orderId);
        req.flash('success_msg', result.message + ' Ask customer for OTP.');
    } catch (error) {
        req.flash('error_msg', `Admin OTP Send Failed: ${error.message}`);
    }
    res.redirect('/admin/manage-orders');
};

exports.confirmDirectDeliveryByAdmin = async (req, res, next) => {
    const { orderId } = req.params;
    const { otp } = req.body;
    const adminUserId = req.session.user._id;

    if (!otp || !/^\d{6}$/.test(otp.trim())) {
        req.flash('error_msg', 'Please enter the 6-digit OTP.');
        return res.redirect('/admin/manage-orders');
    }

    try {
        // isOrderRelevantToSeller middleware IS NOT USED HERE (Admin context)
        const { order } = await confirmDirectDeliveryByAdmin(orderId, adminUserId, otp.trim(), res); // Pass res for date formatting helper
        req.flash('success_msg', `Order ${orderId} confirmed delivered by Admin.`);
    } catch (error) {
        req.flash('error_msg', `Admin Delivery Confirm Failed: ${error.message}`);
    }
    res.redirect('/admin/manage-orders');
};

exports.cancelOrderByAdmin = async (req, res, next) => {
    const { orderId } = req.params;
    const { reason } = req.body;
    const adminUserId = req.session.user._id;

    if (!reason || !cancellationReasons.includes(reason)) {
        req.flash('error_msg', 'Please select a valid admin reason for cancellation.');
        return res.redirect('/admin/manage-orders');
    }

    const sessionDB = await mongoose.startSession();
    sessionDB.startTransaction();
    try {
        const order = await Order.findById(orderId)
                                // Populate necessary fields
                                .populate('products.productId', 'name _id') // Keep productId population
                                .populate('userId', 'email')
                                .session(sessionDB);

        if (!order) {
            await sessionDB.abortTransaction(); sessionDB.endSession();
            req.flash('error_msg', 'Order not found.');
            return res.status(404).redirect('/admin/manage-orders');
        }
        if (order.status !== 'Pending') {
            await sessionDB.abortTransaction(); sessionDB.endSession();
            req.flash('error_msg', `Order status is '${order.status}'. Only 'Pending' orders can be cancelled.`);
            return res.redirect('/admin/manage-orders');
        }

        // Restore Stock and decrement Order Count for *all* items in the order
        const productStockRestorePromises = order.products.map(item => {
            const quantityToRestore = Number(item.quantity);
            // Robust check for product ID existence before attempting update
            if (!item.productId?._id || isNaN(quantityToRestore) || quantityToRestore <= 0) {
                console.warn(`Admin Cancel: Invalid item P.ID ${item.productId?._id} or Qty ${item.quantity} in O.ID ${orderId}. Skipping restore.`);
                return Promise.resolve(); // Gracefully skip invalid items
            }
            return Product.updateOne(
                { _id: item.productId._id },
                { $inc: { stock: quantityToRestore, orderCount: -1 } }, // Restore stock, decrement order count
                { session: sessionDB }
            ).catch(err => {
               console.error(`Admin Cancel: Failed stock/count restore P.ID ${item.productId._id} O.ID ${orderId}: ${err.message}`);
               // Potentially throw error here if stock restoration failure should halt the whole process?
               // Or just log and continue, which is current behavior.
            });
        });
        // Wait for all restoration attempts to complete
        await Promise.allSettled(productStockRestorePromises);

        // Update order status and reason
        order.status = 'Cancelled';
        order.cancellationReason = `Admin Cancelled: ${reason}`; // Prefix reason
        await order.save({ session: sessionDB }); // Will trigger pre-save hook to clear OTP etc.

        await sessionDB.commitTransaction();

        // Send Email Notification (outside transaction)
        try {
            const customerEmail = order.userEmail || order.userId?.email;
            if(customerEmail) {
                const subjectCust = `Your Order (${order._id}) Has Been Cancelled`;
                // Make reason clear it was admin action
                const htmlCust = `<p>Your order (${order._id}) has been cancelled by administration.</p><p><strong>Reason:</strong> ${reason}</p><p>Contact support for questions.</p>`;
                await sendEmail(customerEmail, subjectCust, `Order ${order._id} cancelled by Admin. Reason: ${reason}`, htmlCust);
            } else {
                console.warn(`Admin Cancel: Could not find customer email for order ${orderId} notification.`);
            }
        } catch (emailError) {
            console.error(`Failed sending cancellation email for order ${order._id} (Admin Cancel):`, emailError);
            // Do not fail the request if email fails, but log it.
        }

        req.flash('success_msg', `Order ${orderId} cancelled by admin. Reason: ${reason}.`);
        res.redirect('/admin/manage-orders');

    } catch (error) {
        if (sessionDB.inTransaction()) { // Check if transaction is still active before aborting
             await sessionDB.abortTransaction();
        }
        console.error(`Error cancelling order ${orderId} by admin ${adminUserId}:`, error);
        req.flash('error_msg', 'Failed to cancel order due to an internal error.');
        res.redirect('/admin/manage-orders');
    } finally {
         if (sessionDB.id) { await sessionDB.endSession(); } // Check session exists before ending
    }
};


// --- Manage Users (Admin) ---
exports.getManageUsersPage = async (req, res, next) => {
      try {
        const users = await User.find({ _id: { $ne: req.session.user._id } }) // Exclude self
                                  .select('name email role createdAt isVerified address.phone') // Select necessary fields
                                  .sort({ createdAt: -1 })
                                  .lean();
        res.render('admin/manage-users', {
            title: 'Manage Registered Users',
            users: users
        });
    } catch (error) {
        next(error);
    }
};

// --- Update User Role (Admin) ---
exports.updateUserRole = async (req, res, next) => {
    const userId = req.params.id;
    const { role } = req.body;
    const allowedRoles = ['user', 'admin', 'seller'];

    if (!role || !allowedRoles.includes(role)) {
        req.flash('error_msg', 'Invalid role selected.');
        return res.status(400).redirect('/admin/manage-users');
    }
    if (userId === req.session.user._id.toString()) {
         req.flash('error_msg', 'You cannot change your own role.');
         return res.redirect('/admin/manage-users');
    }

    try {
        const user = await User.findById(userId);
        if (!user) {
            req.flash('error_msg', 'User not found.');
            return res.status(404).redirect('/admin/manage-users');
        }
        // Simple update - Consider adding email notifications for role changes
        user.role = role;
        await user.save();
        req.flash('success_msg', `User ${user.email}'s role updated to ${role}.`);
        res.redirect('/admin/manage-users');

    } catch (error) {
        if (error.name === 'CastError') {
            req.flash('error_msg', 'Invalid user ID format.');
            return res.status(400).redirect('/admin/manage-users');
        }
        console.error(`Error updating role for user ${userId}:`, error);
        req.flash('error_msg', 'Error updating user role.');
        res.redirect('/admin/manage-users');
    }
};

// --- Remove User (Admin) ---
exports.removeUser = async (req, res, next) => {
    const userId = req.params.id;

    if (userId === req.session.user._id.toString()) {
        req.flash('error_msg', 'You cannot remove yourself.');
        return res.redirect('/admin/manage-users');
    }

    try {
        const user = await User.findById(userId);
        if (!user) {
            req.flash('error_msg', 'User not found.');
            return res.status(404).redirect('/admin/manage-users');
        }

        // Prevent removing the last admin
        if (user.role === 'admin') {
            const adminCount = await User.countDocuments({ role: 'admin' });
            if (adminCount <= 1) {
                req.flash('error_msg', 'Cannot remove the last admin account.');
                return res.redirect('/admin/manage-users');
            }
        }

        // Consider consequences of removing a seller (impact on products)
        if (user.role === 'seller') {
            const productCount = await Product.countDocuments({ sellerId: userId });
            if (productCount > 0) {
                // Option 1: Prevent deletion
                 req.flash('error_msg', `Cannot remove seller ${user.email} as they have ${productCount} product(s). Reassign or remove products first.`);
                 return res.redirect('/admin/manage-users');

                // Option 2: Disable/Hide products (Example)
                // console.warn(`Disabling ${productCount} products for deleted seller ${user.email}.`);
                // await Product.updateMany({ sellerId: userId }, { $set: { stock: 0, reviewStatus: 'rejected', rejectionReason: 'Seller account removed' }});
            }
        }

        // Proceed with deletion
        await User.deleteOne({ _id: userId });
        req.flash('success_msg', `User ${user.email} removed successfully.`);
        res.redirect('/admin/manage-users');

    } catch (error) {
        if (error.name === 'CastError') {
            req.flash('error_msg', 'Invalid user ID format.');
            return res.status(400).redirect('/admin/manage-users');
        }
        console.error(`Error removing user ${userId}:`, error);
        req.flash('error_msg', 'Error removing user.');
        res.redirect('/admin/manage-users');
    }
};

// --- Banner Management ---
exports.getManageBannersPage = async (req, res, next) => {
      try {
        let bannerConfig = await BannerConfig.findOne({ configKey: 'mainBanners' }).lean();
        if (!bannerConfig) {
            bannerConfig = { configKey: 'mainBanners', banners: [] }; // Default empty structure
        }
        // Standardize to 4 slots for the form, filling with defaults if needed
        const displayBanners = Array.from({ length: 4 }).map((_, index) => {
             return bannerConfig.banners[index] || { imageUrl: '', linkUrl: '', title: '' };
         });
        res.render('admin/manage-banners', {
            title: 'Manage Homepage Banners',
            bannerConfig: { ...bannerConfig, banners: displayBanners } // Pass standardized array
        });
    } catch (error) {
        console.error("Error fetching banner configuration:", error);
        next(error);
    }
};

exports.updateBanners = async (req, res, next) => {
    const { imageUrl1, linkUrl1, title1, imageUrl2, linkUrl2, title2, imageUrl3, linkUrl3, title3, imageUrl4, linkUrl4, title4 } = req.body;
    const adminUserId = req.session.user._id;
    const urlPattern = /^https?:\/\/.+/; // Simple URL validation regex

    // Package inputs
    const bannerInputs = [
        { imageUrl: imageUrl1, linkUrl: linkUrl1, title: title1 },
        { imageUrl: imageUrl2, linkUrl: linkUrl2, title: title2 },
        { imageUrl: imageUrl3, linkUrl: linkUrl3, title: title3 },
        { imageUrl: imageUrl4, linkUrl: linkUrl4, title: title4 }
    ];

    const newBanners = [];
    let validationErrors = []; // Collect multiple errors

    // Validate and filter inputs
    for (let i = 0; i < bannerInputs.length; i++) {
        const input = bannerInputs[i];
        const trimmedImageUrl = input.imageUrl?.trim();
        const trimmedLinkUrl = input.linkUrl?.trim();
        const trimmedTitle = input.title?.trim();

        // Only process if an image URL is provided
        if (trimmedImageUrl) {
            let bannerValid = true;
            if (!urlPattern.test(trimmedImageUrl)) {
                validationErrors.push(`Banner ${i + 1}: Image URL format is invalid.`);
                bannerValid = false;
            }
            if (trimmedLinkUrl && !urlPattern.test(trimmedLinkUrl)) {
                 validationErrors.push(`Banner ${i + 1}: Link URL format is invalid.`);
                 bannerValid = false;
             }
            // Add only valid banners
             if (bannerValid) {
                newBanners.push({
                     imageUrl: trimmedImageUrl,
                     linkUrl: trimmedLinkUrl || undefined, // Ensure empty string becomes undefined
                     title: trimmedTitle || undefined
                 });
             }
        }
    }

    // If validation errors occurred, re-render the form with messages and repopulated data
    if (validationErrors.length > 0) {
         req.flash('error_msg', validationErrors.join(' '));
         // Use the original inputs to repopulate the form
         const displayBannersForError = Array.from({ length: 4 }).map((_, index) => bannerInputs[index]);
         return res.render('admin/manage-banners', {
             title: 'Manage Homepage Banners',
             bannerConfig: { banners: displayBannersForError }
         });
    }

    try {
        // Update or insert the banner configuration
        await BannerConfig.findOneAndUpdate(
            { configKey: 'mainBanners' },
            { banners: newBanners, lastUpdatedBy: adminUserId },
            { new: true, upsert: true, runValidators: true }
        );
        req.flash('success_msg', 'Homepage banners updated successfully.');
        res.redirect('/admin/manage-banners');
    } catch (error) {
        if (error.name === 'ValidationError') { // Handle schema validation errors (e.g., array limit)
            let schemaErrors = Object.values(error.errors).map(el => el.message);
             req.flash('error_msg', `Validation Error: ${schemaErrors.join(', ')}`);
             const displayBannersForError = Array.from({ length: 4 }).map((_, index) => bannerInputs[index]);
             return res.render('admin/manage-banners', {
                  title: 'Manage Homepage Banners',
                 bannerConfig: { banners: displayBannersForError }
             });
         }
        // Handle other potential errors
        console.error("Error updating banners:", error);
        req.flash('error_msg', 'Failed to update banners due to a server error.');
        // Redirect back, form will show previously saved state on next load
        res.redirect('/admin/manage-banners');
    }
};