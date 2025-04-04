// controllers/adminController.js
const Product = require('../models/Product');
const Order = require('../models/Order');
const User = require('../models/User');
const { sendEmail } = require('../config/mailer');
const {
    generateAndSendDirectDeliveryOTPByAdmin,
    confirmDirectDeliveryByAdmin,
    // Note: generateAndSendDeliveryOTP, verifyDeliveryOTP are typically called from deliveryController, not directly here
} = require('./orderController'); // Assuming these are correctly imported

// --- Keep cancellationReasons array ---
const cancellationReasons = [
    "📞 Unable to contact the customer",
    "🕒 Delay in shipping/delivery timeframe exceeded",
    "❗ Out of stock/unavailable item",
    "🗺️ Address incorrect/incomplete",
    "🚫 Customer requested cancellation",
    "🚚 Logistics issue/Vehicle breakdown",
    "❓ Other (Admin/Delivery)",
];

// =======================
// Dashboard & Page Getters
// =======================
exports.getAdminDashboard = (req, res) => {
    res.render('admin/dashboard', { title: 'Admin Dashboard' });
};

exports.getUploadProductPage = (req, res) => {
    res.render('admin/upload-product', { title: 'Upload New Product' });
};

exports.getManageProductsPage = async (req, res, next) => {
    try {
        const products = await Product.find({}).sort({ createdAt: -1 });
        res.render('admin/manage-products', {
            title: 'Manage Products',
            products: products
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
        res.render('admin/edit-product', {
            title: `Edit Product: ${product.name}`,
            product: product
        });
    } catch (error) {
         if (error.name === 'CastError') {
           req.flash('error_msg', 'Invalid product ID format.');
            return res.redirect('/admin/manage-products');
       }
        next(error);
     }
 };

// --- UPDATED getManageOrdersPage function (includes logic for bulk assign checks) ---
exports.getManageOrdersPage = async (req, res, next) => {
    try {
        const orders = await Order.find({})
                                   .sort({ orderDate: -1 })
                                   .populate('products.productId', 'name imageUrl _id price') // Ensure necessary fields are populated
                                   .lean();

        orders.forEach(order => {
            order.formattedOrderDate = new Date(order.orderDate).toLocaleString();
            order.formattedReceivedDate = order.receivedByDate ? new Date(order.receivedByDate).toLocaleString() : 'N/A';
            // Determine capabilities for each order
            order.canBeCancelledByAdmin = ['Pending', 'Out for Delivery'].includes(order.status);
            order.canBeAssignedByAdmin = order.status === 'Pending'; // Check for individual and bulk assignment eligibility
            order.canBeDirectlyDeliveredByAdmin = order.status === 'Pending';
            order.canBeUnassignedByAdmin = order.status === 'Out for Delivery';

            // Pre-calculate item details string for display (optional improvement)
            if (order.products && order.products.length > 0) {
                order.itemsSummary = order.products.map(p =>
                    `${p.name || '[Product Name Missing]'} (Qty: ${p.quantity}) @ ₹${(p.priceAtOrder || 0).toFixed(2)}`
                ).join('<br>');
            } else {
                order.itemsSummary = 'No items found';
            }
        });

         const deliveryAdmins = await User.find({ role: 'delivery_admin' })
                                          .select('email _id address.phone name') // Added name
                                          .lean();

        res.render('admin/manage-orders', {
            title: 'Manage Orders',
            orders: orders,
            deliveryAdmins: deliveryAdmins,
            cancellationReasons: cancellationReasons
        });
    } catch (error) {
        next(error);
    }
};
// --- END UPDATED getManageOrdersPage function ---


exports.getManageUsersPage = async (req, res, next) => {
    try {
        // Exclude the current admin from the list
        const users = await User.find({ _id: { $ne: req.session.user._id } })
                                  .select('name email role createdAt isVerified address.phone') // Select necessary fields including phone
                                  .sort({ createdAt: -1 });
        res.render('admin/manage-users', {
            title: 'Manage Registered Users',
            users: users
        });
    } catch (error) {
        next(error);
    }
};

exports.getManageAssignedOrdersPage = async (req, res, next) => {
    try {
         const deliveryAdmins = await User.find({ role: 'delivery_admin' })
                                         .select('email _id name address.phone') // Select phone
                                         .lean();

        const adminStatsPromises = deliveryAdmins.map(async (admin) => {
            const totalAssigned = await Order.countDocuments({ assignedTo: admin._id });
            // Pending for delivery admin means 'Out for Delivery' status assigned to them
            const pendingCount = await Order.countDocuments({ assignedTo: admin._id, status: 'Out for Delivery' });
            const deliveredCount = await Order.countDocuments({ assignedTo: admin._id, status: 'Delivered' });

            // Safely access phone number
            const phone = admin.address?.phone || null;

            return { ...admin, phone, totalAssigned, pendingCount, deliveredCount };
        });

        const deliveryAdminStats = await Promise.all(adminStatsPromises);

        res.render('admin/manage-assigned-orders', {
             title: 'Manage Assigned Orders & Delivery Admins', // Updated title
            deliveryAdmins: deliveryAdminStats
         });

    } catch (error) {
        next(error);
    }
};


exports.getAssignedOrdersDetailForAdmin = async(req, res, next) => {
   const deliveryAdminId = req.params.deliveryAdminId;
    const type = req.params.type; // 'total', 'pending', 'delivered'

   try {
        const deliveryAdmin = await User.findById(deliveryAdminId).select('email name').lean(); // Select needed fields
       if(!deliveryAdmin || deliveryAdmin.role !== 'delivery_admin'){
           req.flash('error_msg', 'Delivery Admin not found.');
           return res.redirect('/admin/manage-assigned-orders');
       }

       let query = { assignedTo: deliveryAdminId };
       let pageTitle = `Orders Assigned to ${deliveryAdmin.email}`;

       if (type === 'pending') {
          query.status = 'Out for Delivery'; // Pending for delivery admin means 'Out for Delivery'
          pageTitle = `Active Deliveries for ${deliveryAdmin.email}`;
       } else if (type === 'delivered') {
           query.status = 'Delivered';
          pageTitle = `Delivered by ${deliveryAdmin.email}`;
      } // 'total' uses the base query

      const orders = await Order.find(query)
                                .sort({ orderDate: -1 })
                                .populate('products.productId', 'name imageUrl') // Populate for image/details
                                .lean();

      orders.forEach(order => {
           order.formattedOrderDate = new Date(order.orderDate).toLocaleString();
           order.formattedReceivedDate = order.receivedByDate ? new Date(order.receivedByDate).toLocaleString() : 'N/A';
            // Add primary image URL
           order.primaryImageUrl = order.products?.[0]?.imageUrl;
      });

       res.render('admin/assigned-orders-detail', {
           title: pageTitle,
           orders: orders,
           deliveryAdminEmail: deliveryAdmin.email // Pass email for display
       });

   } catch (error) {
      if (error.name === 'CastError') {
           req.flash('error_msg', 'Invalid delivery admin ID.');
           return res.redirect('/admin/manage-assigned-orders');
      }
       next(error);
  }
}


// =======================
// Product Actions
// =======================
exports.uploadProduct = async (req, res, next) => {
    const { name, category, price, stock, imageUrl, specifications } = req.body;
    // Assuming sellerEmail comes from the logged-in admin session
    const sellerEmail = req.session.user.email;

    // Basic Validation
    if (!name || !category || !price || !stock || !imageUrl) {
        req.flash('error_msg', 'Please fill in all required fields (Name, Category, Price, Stock, Image URL).');
        return res.redirect('/admin/upload-product');
    }
     // Number validation
     if (isNaN(Number(price)) || Number(price) < 0 || isNaN(Number(stock)) || Number(stock) < 0) {
        req.flash('error_msg', 'Price and Stock must be non-negative numbers.');
        return res.redirect('/admin/upload-product');
     }

    try {
        const newProduct = new Product({
            name: name.trim(),
            category: category.trim(),
            price: Number(price),
            stock: Number(stock),
            imageUrl: imageUrl.trim(),
            specifications: specifications ? specifications.trim() : '',
            sellerEmail // Assign seller email
        });

        await newProduct.save();
        req.flash('success_msg', `Product "${newProduct.name}" uploaded successfully.`);
        res.redirect('/admin/manage-products'); // Redirect to manage products page

    } catch (error) {
        // Handle validation errors from Mongoose Schema
        if (error.name === 'ValidationError') {
           let errors = Object.values(error.errors).map(el => el.message);
           req.flash('error_msg', errors.join(' '));
           return res.redirect('/admin/upload-product');
       }
        // Handle other errors (e.g., database connection issues)
        next(error); // Pass to the global error handler
    }
};

 exports.updateProduct = async (req, res, next) => {
    const productId = req.params.id;
    const { name, category, price, stock, imageUrl, specifications } = req.body;

    // Basic Validation
     if (!name || !category || !price || !stock || !imageUrl) {
        req.flash('error_msg', 'Please fill in all required fields.');
        // Redirect back to the edit page for this specific product
        return res.redirect(`/admin/manage-products/edit/${productId}`);
    }
    // Number validation
     if (isNaN(Number(price)) || Number(price) < 0 || isNaN(Number(stock)) || Number(stock) < 0) {
         req.flash('error_msg', 'Price and Stock must be non-negative numbers.');
        return res.redirect(`/admin/manage-products/edit/${productId}`);
    }

    try {
        const product = await Product.findById(productId);
        if (!product) {
            req.flash('error_msg', 'Product not found.');
            // Use 404 status for resource not found
            return res.status(404).redirect('/admin/manage-products');
         }

         // Update product fields
         product.name = name.trim();
         product.category = category.trim();
         product.price = Number(price);
        product.stock = Number(stock);
         product.imageUrl = imageUrl.trim();
         product.specifications = specifications ? specifications.trim() : '';
         // sellerEmail typically doesn't change on update, but could be added if needed

         await product.save(); // Trigger validation and save
         req.flash('success_msg', `Product "${product.name}" updated successfully.`);
         res.redirect('/admin/manage-products'); // Redirect to manage products page

    } catch (error) {
         // Handle Mongoose validation errors
         if (error.name === 'ValidationError') {
            let errors = Object.values(error.errors).map(el => el.message);
             req.flash('error_msg', errors.join(' '));
             return res.redirect(`/admin/manage-products/edit/${productId}`);
         }
         // Handle invalid ID format errors (CastError)
         if (error.name === 'CastError') {
             req.flash('error_msg', 'Invalid product ID format.');
             // Redirect to manage products as the ID is likely wrong
             return res.redirect('/admin/manage-products');
         }
        // Pass other errors to the global error handler
        next(error);
     }
 };

exports.removeProduct = async (req, res, next) => {
    const productId = req.params.id;

    try {
         // Use findByIdAndDelete for atomicity
         const product = await Product.findByIdAndDelete(productId);
        if (!product) {
             // Product already deleted or never existed
             req.flash('error_msg', 'Product not found.');
            return res.redirect('/admin/manage-products');
         }
         // Success message using the deleted product's name
         req.flash('success_msg', `Product "${product.name}" removed successfully.`);
         res.redirect('/admin/manage-products');

    } catch (error) {
        // Handle invalid ID format errors (CastError)
        if (error.name === 'CastError') {
             req.flash('error_msg', 'Invalid product ID format.');
             return res.redirect('/admin/manage-products');
         }
        // Pass other errors to the global error handler
        next(error);
    }
};

// =======================
// Order Actions
// =======================

exports.sendDirectDeliveryOtpByAdmin = async (req, res, next) => {
    const { orderId } = req.params;
    try {
        const result = await generateAndSendDirectDeliveryOTPByAdmin(orderId);
        req.flash('success_msg', result.message + ' Ask customer for OTP to confirm delivery.');
    } catch (error) {
        req.flash('error_msg', `Failed to send direct delivery OTP: ${error.message}`);
    }
    res.redirect('/admin/manage-orders');
};

exports.confirmDirectDeliveryByAdmin = async (req, res, next) => {
    const { orderId } = req.params;
    const { otp } = req.body;
    const adminUserId = req.session.user._id;

    // Basic OTP validation
    if (!otp || !/^\d{6}$/.test(otp)) {
        req.flash('error_msg', 'Please enter the 6-digit OTP received by the customer.');
        return res.redirect('/admin/manage-orders');
    }

    try {
        // Delegate OTP verification and order update logic
        const { order } = await confirmDirectDeliveryByAdmin(orderId, adminUserId, otp);
        req.flash('success_msg', `Order ${orderId} confirmed delivered successfully (Directly by Admin).`);
    } catch (error) {
        req.flash('error_msg', `Direct delivery confirmation failed: ${error.message}`);
    }
    res.redirect('/admin/manage-orders');
};


exports.assignOrder = async (req, res, next) => {
     const { orderId } = req.params;
     const { deliveryAdminId } = req.body;

     // Basic validation
     if (!deliveryAdminId) {
         req.flash('error_msg', 'Please select a Delivery Admin to assign the order.');
         return res.redirect('/admin/manage-orders');
     }

    try {
         const order = await Order.findById(orderId);
         if (!order) {
            req.flash('error_msg', 'Order not found.');
            return res.status(404).redirect('/admin/manage-orders');
         }
        // Check if order is assignable
        if (order.status !== 'Pending') {
             req.flash('error_msg', `Order cannot be assigned in its current status ('${order.status}'). It must be 'Pending'.`);
            return res.redirect('/admin/manage-orders');
         }
        // Find the selected delivery admin
        const deliveryAdmin = await User.findOne({ _id: deliveryAdminId, role: 'delivery_admin' }).select('email name address.phone'); // Select name & phone
         if (!deliveryAdmin) {
            req.flash('error_msg', 'Selected Delivery Admin not found or is not a valid delivery admin.');
            return res.status(400).redirect('/admin/manage-orders');
        }

        // Update order status and assignment
        order.assignedTo = deliveryAdmin._id;
        // Store email and phone (if exists) for display
        order.assignedAdminEmail = deliveryAdmin.address?.phone
            ? `${deliveryAdmin.email} (${deliveryAdmin.address.phone})`
            : deliveryAdmin.email;
        order.status = 'Out for Delivery';

         await order.save(); // Save the changes

         // --- Notifications (Best Effort) ---
         // Notify Delivery Admin
         try{
            const subjectAdmin = `New Order Assigned: ${order._id}`;
             const htmlAdmin = `<p>You have been assigned order ${order._id} for delivery.</p><p>Customer: ${order.shippingAddress.name}, ${order.shippingAddress.cityVillage}</p><p>Please check your Delivery Dashboard for details.</p>`;
            await sendEmail(deliveryAdmin.email, subjectAdmin, `New order ${order._id} assigned for delivery.`, htmlAdmin);
         } catch(emailError) {
             // Log failure, but don't block the process
             console.error(`Failed sending assignment email to delivery admin ${deliveryAdmin.email} for order ${order._id}:`, emailError);
         }
         // Notify Customer
        try{
            const subjectCust = `Your Order is Out for Delivery!`;
            // Include assigned person's name or email/phone if name is unavailable
            const assignedPersonInfo = deliveryAdmin.name || order.assignedAdminEmail;
            const htmlCust = `<p>Your order (${order._id}) is now out for delivery with ${assignedPersonInfo}.</p><p>You can track its progress in the 'My Orders' section of your account.</p>`;
            await sendEmail(order.userEmail, subjectCust, `Your order ${order._id} is out for delivery.`, htmlCust);
         } catch(emailError) {
             console.error(`Failed sending out-for-delivery email to customer for order ${order._id}:`, emailError);
         }
         // --- End Notifications ---

         req.flash('success_msg', `Order ${orderId} assigned to ${deliveryAdmin.email} and status updated to 'Out for Delivery'.`);
         res.redirect('/admin/manage-orders');

    } catch (error) {
        // Handle CastError for invalid IDs
        if (error.name === 'CastError') {
            req.flash('error_msg', 'Invalid Order ID or Delivery Admin ID format.');
            return res.redirect('/admin/manage-orders');
        }
        // Log unexpected errors
         console.error(`Error assigning order ${orderId} to ${deliveryAdminId}:`, error);
        req.flash('error_msg', 'An unexpected error occurred while assigning the order.');
        // Pass to generic error handler only if truly unexpected
        next(error);
    }
 };


// --- NEW: Bulk Assign Orders by Admin ---
exports.bulkAssignOrders = async (req, res, next) => {
    let { orderIds, deliveryAdminId } = req.body; // Use let as orderIds might be reassigned

    // Ensure orderIds is always an array, even if only one checkbox is submitted
    if (orderIds && !Array.isArray(orderIds)) {
        orderIds = [orderIds];
    }

    // 1. Initial Validation
    if (!orderIds || orderIds.length === 0) {
        req.flash('error_msg', 'No orders selected for bulk assignment.');
        return res.redirect('/admin/manage-orders');
    }
    if (!deliveryAdminId) {
        req.flash('error_msg', 'Please select a Delivery Admin to assign the orders to.');
        return res.redirect('/admin/manage-orders');
    }

    let successCount = 0;
    let failCount = 0;
    const failures = []; // To store { orderId, reason }

    try {
        // 2. Validate Delivery Admin
        const deliveryAdmin = await User.findOne({ _id: deliveryAdminId, role: 'delivery_admin' })
                                        .select('email name address.phone'); // Select name & phone
        if (!deliveryAdmin) {
            req.flash('error_msg', 'Selected Delivery Admin not found or is not valid.');
            return res.redirect('/admin/manage-orders');
        }
        const assignedAdminEmailString = deliveryAdmin.address?.phone
            ? `${deliveryAdmin.email} (${deliveryAdmin.address.phone})`
            : deliveryAdmin.email;

        // 3. Process Orders Iteratively (Best Effort)
        // Using Promise.allSettled allows all assignments to attempt even if some fail
        const assignmentPromises = orderIds.map(async (orderId) => {
            try {
                const order = await Order.findById(orderId);

                if (!order) {
                    throw new Error('Not found.');
                }
                if (order.status !== 'Pending') {
                    throw new Error(`Invalid status ('${order.status}'). Must be 'Pending'.`);
                }

                // Assign and update status
                order.assignedTo = deliveryAdmin._id;
                order.assignedAdminEmail = assignedAdminEmailString;
                order.status = 'Out for Delivery';
                await order.save();

                // --- Send Notifications (Best effort per order) ---
                const notifyPromises = [];
                // Notify Delivery Admin
                notifyPromises.push(
                    sendEmail(
                        deliveryAdmin.email,
                        `New Order Assigned: ${order._id}`,
                        `New order ${order._id} assigned for delivery.`,
                        `<p>You have been assigned order ${order._id} for delivery.</p><p>Customer: ${order.shippingAddress.name}, ${order.shippingAddress.cityVillage}</p><p>Please check your Delivery Dashboard for details.</p>`
                    ).catch(emailError => console.error(`Failed sending assignment email to delivery admin ${deliveryAdmin.email} for order ${order._id}:`, emailError))
                );
                // Notify Customer
                const assignedPersonInfo = deliveryAdmin.name || assignedAdminEmailString;
                notifyPromises.push(
                    sendEmail(
                        order.userEmail,
                        `Your Order is Out for Delivery!`,
                        `Your order ${order._id} is out for delivery.`,
                        `<p>Your order (${order._id}) is now out for delivery with ${assignedPersonInfo}.</p><p>You can track its progress in the 'My Orders' section of your account.</p>`
                    ).catch(emailError => console.error(`Failed sending out-for-delivery email to customer for order ${order._id}:`, emailError))
                );
                // Wait for notifications to attempt sending, but don't let them block assignment success
                await Promise.allSettled(notifyPromises);

                return { status: 'fulfilled', orderId: orderId }; // Indicate success for this order

            } catch (orderError) {
                // Log the specific error for this order
                console.error(`Failed to assign order ${orderId} in bulk:`, orderError);
                return { status: 'rejected', orderId: orderId, reason: orderError.message || 'Unknown error' }; // Indicate failure
            }
        });

        // Wait for all assignment attempts to complete
        const results = await Promise.allSettled(assignmentPromises);

        // Process results
        results.forEach(result => {
            if (result.status === 'fulfilled') {
                successCount++;
            } else {
                // result.status === 'rejected'
                failCount++;
                // The reason is already captured from the inner catch block if available
                // Store the detailed reason if provided by the promise rejection
                failures.push({ orderId: result.reason?.orderId || 'Unknown', reason: result.reason?.reason || result.reason || 'Processing failed' });
            }
        });


        // 4. Provide Feedback
        if (successCount > 0) {
            req.flash('success_msg', `${successCount} order(s) successfully assigned to ${deliveryAdmin.email}.`);
        }
        if (failCount > 0) {
            const failureDetails = failures.map(f => `Order ${f.orderId}: ${f.reason}`).join('; ');
            req.flash('error_msg', `${failCount} order(s) failed to assign. Details: ${failureDetails}`);
        }
        if (successCount === 0 && failCount === 0 && orderIds.length > 0) {
             // This case might happen if all selected orders were already processed or invalid IDs
             req.flash('error_msg', 'No valid orders were processed during bulk assignment. Please check the order statuses.');
        } else if (successCount === 0 && failCount === 0 && orderIds.length === 0) {
             // This case is handled by initial validation, but included for completeness
            req.flash('error_msg', 'No orders were selected.');
        }

        res.redirect('/admin/manage-orders');

    } catch (error) { // Catch errors like deliveryAdmin validation or major issues before the loop
        if (error.name === 'CastError') {
            req.flash('error_msg', 'Invalid Delivery Admin ID format.');
        } else {
            console.error(`General error during bulk order assignment setup:`, error);
            req.flash('error_msg', 'An unexpected error occurred during bulk assignment initiation.');
        }
        res.redirect('/admin/manage-orders');
    }
};
// --- END: Bulk Assign Orders by Admin ---


// --- Unassign Order by Admin ---
exports.unassignOrderFromAdmin = async (req, res, next) => {
    const { orderId } = req.params;
    const adminUserId = req.session.user._id; // For logging purposes

    try {
        const order = await Order.findById(orderId);
        if (!order) {
            req.flash('error_msg', 'Order not found.');
            return res.status(404).redirect('/admin/manage-orders');
        }

        // Ensure the order is actually assigned and Out for Delivery
        if (order.status !== 'Out for Delivery') {
            req.flash('error_msg', `Order cannot be unassigned in its current status ('${order.status}'). Must be 'Out for Delivery'.`);
            return res.redirect('/admin/manage-orders');
        }
        if (!order.assignedTo) {
             // This state shouldn't happen if status is 'Out for Delivery', but check defensively
             req.flash('error_msg', 'Order is marked "Out for Delivery" but is not currently assigned to anyone. Please review.');
             return res.redirect('/admin/manage-orders');
        }

        const originalAssignedAdminId = order.assignedTo; // For notification (optional)
        const originalAssignedAdminEmail = order.assignedAdminEmail; // Store email/phone string for notification

        // Reset status and assignment fields
        order.status = 'Pending';
        order.assignedTo = null;
        order.assignedAdminEmail = null;
        // The pre-save hook should automatically clear OTP fields when status changes away from relevant states

        await order.save();

        // Notify the Delivery Admin whose order was unassigned (Best Effort)
        // Extract email part if phone was included
        const deliveryAdminEmailOnly = originalAssignedAdminEmail ? originalAssignedAdminEmail.split(' ')[0] : null;
        if (deliveryAdminEmailOnly) {
             try {
                const subjectAdmin = `Order Unassigned: ${order._id}`;
                 const htmlAdmin = `<p>Order ${order._id}, previously assigned to you, has been unassigned by an administrator and returned to the pending queue.</p><p>Please check with administration if you have questions.</p>`;
                await sendEmail(deliveryAdminEmailOnly, subjectAdmin, `Assigned order ${order._id} was unassigned by admin.`, htmlAdmin);
             } catch(emailError) {
                 // Log error but don't block user feedback
                 console.error(`Failed sending unassignment notice to delivery admin ${deliveryAdminEmailOnly} for order ${order._id}:`, emailError);
             }
        }

        req.flash('success_msg', `Order ${orderId} unassigned successfully and returned to Pending status.`);
        res.redirect('/admin/manage-orders');

    } catch (error) {
        if (error.name === 'CastError') {
            req.flash('error_msg', 'Invalid Order ID format.');
        } else {
            console.error(`Error unassigning order ${orderId} by admin ${adminUserId}:`, error);
            req.flash('error_msg', 'Failed to unassign the order due to an internal error.');
        }
        // Redirect back even on error
        res.redirect('/admin/manage-orders');
    }
};
// --- END: Unassign Order by Admin ---

exports.cancelOrderByAdmin = async (req, res, next) => {
    const { orderId } = req.params;
    const { reason } = req.body;
    const adminUserId = req.session.user._id; // For logging

    // Validate reason
    if (!reason || !cancellationReasons.includes(reason)) {
        req.flash('error_msg', 'Please select a valid reason for cancellation.');
        return res.redirect('/admin/manage-orders');
    }

    try {
        const order = await Order.findById(orderId).populate('products.productId', 'name'); // Populate name for logging stock restore
        if (!order) {
            req.flash('error_msg', 'Order not found.');
            return res.status(404).redirect('/admin/manage-orders');
        }
        // Check if cancellable by admin
        const cancellableStatuses = ['Pending', 'Out for Delivery'];
        if (!cancellableStatuses.includes(order.status)) {
            req.flash('error_msg', `Order cannot be cancelled by admin in its current status ('${order.status}').`);
            return res.redirect('/admin/manage-orders');
        }
        const originalStatus = order.status; // Track status before cancellation
        const originalAssignedAdminEmail = order.assignedAdminEmail; // For potential notification

        // --- Stock Restoration Logic ---
        console.log(`Admin Cancellation: Attempting to restore stock for cancelled order ${orderId} (Original Status: ${originalStatus}).`);
        const productStockRestorePromises = order.products.map(item => {
              // Validate quantity before restoring
              const quantityToRestore = Number(item.quantity);
             if (isNaN(quantityToRestore) || quantityToRestore <= 0) {
                console.error(`Admin Cancel: Invalid quantity ${item.quantity} for product ${item.productId?._id || 'Unknown ID'} in order ${orderId}, skipping stock restore.`);
                return Promise.resolve(); // Skip this item
            }
            // Check if productId exists (it should, but check defensively)
            if (!item.productId) {
                console.error(`Admin Cancel: Missing productId for an item in order ${orderId}, skipping stock restore for this item.`);
                return Promise.resolve(); // Skip this item
            }
             // Update stock and decrement orderCount using $inc
             return Product.updateOne(
                { _id: item.productId._id }, // Use populated ID
                { $inc: { stock: quantityToRestore, orderCount: -1 } }
            ).catch(err => {
               // Log error but continue with cancellation (best effort stock restore)
               console.error(`Admin Cancel: Failed restore stock/orderCount for product ${item.productId._id} (${item.productId.name}) on order ${orderId}: ${err.message}`);
            });
        });
        // Wait for all stock updates to attempt completion
        await Promise.all(productStockRestorePromises);
        console.log(`Admin Cancel: Stock restoration attempted for order ${orderId}. Check logs for details.`);
        // --- End Stock Restoration ---

        // Update order status and reason
        order.status = 'Cancelled';
        order.cancellationReason = reason;
        // Note: The pre-save hook in Order.js should clear assignedTo, OTPs etc. based on 'Cancelled' status
        await order.save();

        // --- Notifications (Best Effort) ---
        // Notify Customer
        try {
            const subjectCust = `Your Order (${order._id}) Has Been Cancelled`;
            const htmlCust = `<p>Your order (${order._id}) has been cancelled by administration.</p><p><strong>Reason:</strong> ${order.cancellationReason}</p><p>Please contact support if you have questions regarding this cancellation.</p>`;
            await sendEmail(order.userEmail, subjectCust, `Your order ${order._id} has been cancelled. Reason: ${order.cancellationReason}`, htmlCust);
        } catch (emailError) {
            console.error(`Failed sending cancellation email to customer for order ${order._id}:`, emailError);
        }
        // Notify Delivery Admin IF it was 'Out for Delivery' when cancelled
        const deliveryAdminEmailOnly = originalAssignedAdminEmail ? originalAssignedAdminEmail.split(' ')[0] : null;
        if (originalStatus === 'Out for Delivery' && deliveryAdminEmailOnly) {
             try {
                const subjectAdmin = `Assigned Order Cancelled: ${order._id}`;
                 const htmlAdmin = `<p>Order ${order._id}, which was assigned to you, has been cancelled by an administrator.</p><p><strong>Reason:</strong> ${reason}</p><p>This order should no longer be delivered.</p>`;
                await sendEmail(deliveryAdminEmailOnly, subjectAdmin, `Assigned order ${order._id} cancelled by admin. Reason: ${reason}`, htmlAdmin);
             } catch(emailError) {
                 console.error(`Failed sending cancellation notice to delivery admin ${deliveryAdminEmailOnly} for order ${order._id}:`, emailError);
             }
        }
        // --- End Notifications ---

        req.flash('success_msg', `Order ${orderId} cancelled successfully with reason: ${reason}.`);
        res.redirect('/admin/manage-orders');

    } catch (error) {
        if (error.name === 'CastError') {
            req.flash('error_msg', 'Invalid Order ID format.');
        } else {
            // Log unexpected errors
            console.error(`Error cancelling order ${orderId} by admin ${adminUserId}:`, error);
            req.flash('error_msg', 'Failed to cancel the order due to an internal error.');
        }
        // Redirect back even on error
        res.redirect('/admin/manage-orders');
    }
};


// =======================
// User Management Actions
// =======================
exports.updateUserRole = async (req, res, next) => {
    const userId = req.params.id;
    const { role } = req.body;

    // Validate role
     const allowedRoles = ['user', 'admin', 'delivery_admin'];
     if (!role || !allowedRoles.includes(role)) {
        req.flash('error_msg', 'Invalid role selected.');
         return res.redirect('/admin/manage-users');
     }

    try {
        // Prevent admin from changing their own role
        if (req.params.id === req.session.user._id.toString()) {
             req.flash('error_msg', 'You cannot change your own role.');
             return res.redirect('/admin/manage-users');
         }

        const user = await User.findById(userId);
         if (!user) {
            req.flash('error_msg', 'User not found.');
             return res.status(404).redirect('/admin/manage-users');
         }

         // Update the role and save
         user.role = role;
        await user.save();

        req.flash('success_msg', `User ${user.email}'s role updated to ${role}.`);
        res.redirect('/admin/manage-users');

    } catch (error) {
         // Handle CastError for invalid ID
         if (error.name === 'CastError') {
             req.flash('error_msg', 'Invalid user ID format.');
         } else {
             // Log unexpected errors
             console.error(`Error updating role for user ${userId}:`, error);
            req.flash('error_msg', 'Error updating user role.');
         }
         res.redirect('/admin/manage-users'); // Redirect back on error
    }
};

exports.removeUser = async (req, res, next) => {
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
             return res.redirect('/admin/manage-users');
         }

         // Prevent removing the last admin
         if (user.role === 'admin') {
             const adminCount = await User.countDocuments({ role: 'admin' });
             if (adminCount <= 1) {
                 req.flash('error_msg', 'Cannot remove the last admin account.');
                return res.redirect('/admin/manage-users');
             }
         }

        // Remove the user
        await User.deleteOne({ _id: userId });
        let message = `User ${user.email} removed successfully.`;

        // If the removed user was a delivery admin, unassign their active orders
        if (user.role === 'delivery_admin') {
             const updateResult = await Order.updateMany(
                { assignedTo: userId, status: 'Out for Delivery' }, // Find active orders assigned to them
                { $set: { assignedTo: null, assignedAdminEmail: null, status: 'Pending' } } // Reset assignment and status
             );
             // Provide feedback on unassigned orders
             if (updateResult.modifiedCount > 0) {
                 message = `Delivery Admin ${user.email} removed. ${updateResult.modifiedCount} active deliveries have been unassigned and set back to 'Pending'.`;
             } else {
                 message = `Delivery Admin ${user.email} removed. No active orders needed unassignment.`;
             }
         }

        req.flash('success_msg', message);
        res.redirect('/admin/manage-users');

    } catch (error) {
         // Handle CastError for invalid ID
         if (error.name === 'CastError') {
             req.flash('error_msg', 'Invalid user ID format.');
         } else {
             // Log unexpected errors
             console.error(`Error removing user ${userId}:`, error);
            req.flash('error_msg', 'Error removing user.');
         }
        res.redirect('/admin/manage-users'); // Redirect back on error
     }
 };

// ======================================
// Assigned Orders / Delivery Admin Mgmt
// (This is essentially covered by manage-users removeUser now, but kept for potential direct removal from assigned orders page)
exports.removeDeliveryAdminAssignment = async (req, res, next) => {
    const userId = req.params.id; // This is the delivery admin's ID to remove
    try {
        // Prevent action on self if accessed via a route potentially available to delivery admins too
        if (userId === req.session.user._id.toString()) {
            req.flash('error_msg', 'Action not allowed on self.');
            return res.redirect('/admin/manage-assigned-orders');
        }

         const user = await User.findOne({_id: userId, role: 'delivery_admin'});
         if (!user) {
            req.flash('error_msg', 'Delivery Admin user not found.');
             return res.status(404).redirect('/admin/manage-assigned-orders');
         }

        // Remove the user account entirely
        await User.deleteOne({ _id: userId });

        // Unassign their 'Out for Delivery' orders
         const updateResult = await Order.updateMany(
             { assignedTo: userId, status: 'Out for Delivery' },
             { $set: { assignedTo: null, assignedAdminEmail: null, status: 'Pending' } } // Revert to Pending
         );

         req.flash('success_msg', `Delivery Admin ${user.email} removed. ${updateResult.modifiedCount} active deliveries unassigned and reverted to 'Pending'.`);
         res.redirect('/admin/manage-assigned-orders');

     } catch (error) {
        if (error.name === 'CastError') {
             req.flash('error_msg', 'Invalid delivery admin ID format.');
         } else {
             console.error(`Error removing delivery admin ${userId}:`, error);
             req.flash('error_msg', 'Error removing delivery admin.');
         }
        res.redirect('/admin/manage-assigned-orders');
     }
 };