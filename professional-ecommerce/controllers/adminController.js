const Product = require('../models/Product');
const Order = require('../models/Order');
const User = require('../models/User');
const orderController = require('./orderController');

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

exports.getManageOrdersPage = async (req, res, next) => {
    try {
        const orders = await Order.find({})
                                   .sort({ orderDate: -1 })
                                  .lean();


        orders.forEach(order => {
             order.needsVerification = order.status === 'Pending';
             order.isVerified = ['Order Received', 'Out for Delivery', 'Delivered'].includes(order.status);
             order.formattedOrderDate = new Date(order.orderDate).toLocaleString();
            order.formattedReceivedDate = order.receivedByDate ? new Date(order.receivedByDate).toLocaleString() : 'N/A';
        });

         const deliveryAdmins = await User.find({ role: 'delivery_admin' }).select('email _id').lean();

        res.render('admin/manage-orders', {
            title: 'Manage Orders',
            orders: orders,
            deliveryAdmins: deliveryAdmins
        });
    } catch (error) {
        next(error);
    }
};


exports.getManageUsersPage = async (req, res, next) => {
    try {
        const users = await User.find({ _id: { $ne: req.session.user._id } })
                                  .select('name email role createdAt isVerified')
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
                                         .select('email _id name')
                                          .lean();

        const adminStatsPromises = deliveryAdmins.map(async (admin) => {
            const totalAssigned = await Order.countDocuments({ assignedTo: admin._id });
            const pendingCount = await Order.countDocuments({ assignedTo: admin._id, status: { $in: ['Order Received', 'Out for Delivery']} });
            const deliveredCount = await Order.countDocuments({ assignedTo: admin._id, status: 'Delivered' });

            return {
                 ...admin,
                totalAssigned,
                 pendingCount,
                deliveredCount
            };
        });

        const deliveryAdminStats = await Promise.all(adminStatsPromises);

        res.render('admin/manage-assigned-orders', {
             title: 'Manage Assigned Orders',
            deliveryAdmins: deliveryAdminStats
         });

    } catch (error) {
        next(error);
    }
};

exports.uploadProduct = async (req, res, next) => {
    const { name, category, price, stock, imageUrl, specifications } = req.body;
    const sellerEmail = req.session.user.email;

    if (!name || !category || !price || !stock || !imageUrl) {
        req.flash('error_msg', 'Please fill in all required fields (Name, Category, Price, Stock, Image URL).');
        return res.redirect('/admin/upload-product');
    }
     if (isNaN(Number(price)) || Number(price) < 0 || isNaN(Number(stock)) || Number(stock) < 0) {
        req.flash('error_msg', 'Price and Stock must be non-negative numbers.');
        return res.redirect('/admin/upload-product');
     }

    try {
        const newProduct = new Product({
            name,
            category,
            price: Number(price),
            stock: Number(stock),
            imageUrl,
            specifications: specifications || '',
            sellerEmail
        });

        await newProduct.save();

        req.flash('success_msg', `Product "${name}" uploaded successfully.`);
        res.redirect('/admin/manage-products');

    } catch (error) {
        if (error.name === 'ValidationError') {
           let errors = Object.values(error.errors).map(el => el.message);
           req.flash('error_msg', errors.join(' '));
           return res.redirect('/admin/upload-product');
       }
        next(error);
    }
};

 exports.updateProduct = async (req, res, next) => {
    const productId = req.params.id;
    const { name, category, price, stock, imageUrl, specifications } = req.body;

     if (!name || !category || !price || !stock || !imageUrl) {
        req.flash('error_msg', 'Please fill in all required fields.');
        return res.redirect(`/admin/manage-products/edit/${productId}`);
    }
     if (isNaN(Number(price)) || Number(price) < 0 || isNaN(Number(stock)) || Number(stock) < 0) {
         req.flash('error_msg', 'Price and Stock must be non-negative numbers.');
        return res.redirect(`/admin/manage-products/edit/${productId}`);
    }

    try {
        const product = await Product.findById(productId);

        if (!product) {
            req.flash('error_msg', 'Product not found.');
            return res.status(404).redirect('/admin/manage-products');
         }

         product.name = name;
         product.category = category;
         product.price = Number(price);
        product.stock = Number(stock);
         product.imageUrl = imageUrl;
         product.specifications = specifications || '';


         await product.save();

         req.flash('success_msg', `Product "${product.name}" updated successfully.`);
         res.redirect('/admin/manage-products');

    } catch (error) {
         if (error.name === 'ValidationError') {
            let errors = Object.values(error.errors).map(el => el.message);
             req.flash('error_msg', errors.join(' '));
             return res.redirect(`/admin/manage-products/edit/${productId}`);
         }
         if (error.name === 'CastError') {
             req.flash('error_msg', 'Invalid product ID format.');
             return res.redirect('/admin/manage-products');
         }
        next(error);
     }
 };

exports.removeProduct = async (req, res, next) => {
    const productId = req.params.id;

    try {
         const product = await Product.findByIdAndDelete(productId);

        if (!product) {
             req.flash('error_msg', 'Product not found.');
            return res.status(404).redirect('/admin/manage-products');
         }

         req.flash('success_msg', `Product "${product.name}" removed successfully.`);
         res.redirect('/admin/manage-products');

    } catch (error) {
        if (error.name === 'CastError') {
             req.flash('error_msg', 'Invalid product ID format.');
             return res.redirect('/admin/manage-products');
         }
        next(error);
    }
};

exports.sendVerificationOtp = async (req, res, next) => {
    const { orderId } = req.params;
    try {
        const result = await orderController.generateAndSendOrderVerificationOTP(orderId);
        req.flash('success_msg', result.message + ' Ask the customer for the OTP.');
    } catch (error) {
        req.flash('error_msg', `Failed to send OTP: ${error.message}`);
    }
    res.redirect('/admin/manage-orders');
};

exports.verifyOrderOtp = async (req, res, next) => {
     const { orderId } = req.params;
     const { otp } = req.body;

    if (!otp) {
         req.flash('error_msg', 'Please enter the OTP received by the customer.');
         return res.redirect('/admin/manage-orders');
     }

    try {
         await orderController.verifyOrderWithOTP(req.session.user._id, orderId, otp);
         req.flash('success_msg', `Order ${orderId} verified successfully and status updated to 'Order Received'.`);
    } catch (error) {
        req.flash('error_msg', `Verification failed: ${error.message}`);
    }
    res.redirect('/admin/manage-orders');
};

 exports.assignOrder = async (req, res, next) => {
     const { orderId } = req.params;
     const { deliveryAdminId } = req.body;


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

        if (order.status !== 'Order Received') {
             req.flash('error_msg', `Order cannot be assigned in its current status (${order.status}). It must be 'Order Received'.`);
            return res.redirect('/admin/manage-orders');
         }

        const deliveryAdmin = await User.findOne({ _id: deliveryAdminId, role: 'delivery_admin' });
         if (!deliveryAdmin) {
            req.flash('error_msg', 'Selected Delivery Admin not found or is not a valid delivery admin.');
            return res.status(404).redirect('/admin/manage-orders');
        }

        order.assignedTo = deliveryAdmin._id;
        order.assignedAdminEmail = deliveryAdmin.email;
        order.status = 'Out for Delivery';

         await order.save();

         try{
            const subject = `New Order Assigned: ${order._id}`;
             const html = `<p>You have been assigned a new order for delivery.</p>
                           <p>Order ID: ${order._id}</p>
                          <p>Customer: ${order.shippingAddress.name}, ${order.shippingAddress.cityVillage}</p>
                          <p>Please check your Delivery Dashboard for details.</p>`;
            await sendEmail(deliveryAdmin.email, subject, `New order ${order._id} assigned.`, html);
         } catch(emailError) { console.error(`Failed sending assignment email to delivery admin ${deliveryAdmin.email} for order ${order._id}:`, emailError); }

        try{
            const subject = `Your Order is Out for Delivery!`;
            const html = `<p>Good news! Your order (${order._id}) is now out for delivery.</p>
                           <p>It is being handled by our delivery partner.</p>
                           <p>Estimated delivery time: [Could add estimation logic here]</p>`;
             await sendEmail(order.userEmail, subject, `Your order ${order._id} is out for delivery.`, html);
         } catch(emailError) { console.error(`Failed sending out-for-delivery email to customer for order ${order._id}:`, emailError); }


         req.flash('success_msg', `Order ${orderId} assigned to ${deliveryAdmin.email} and status updated.`);
         res.redirect('/admin/manage-orders');

    } catch (error) {
        if (error.name === 'CastError') {
            req.flash('error_msg', 'Invalid Order ID or Delivery Admin ID.');
            return res.redirect('/admin/manage-orders');
        }
         console.error(`Error assigning order ${orderId} to ${deliveryAdminId}:`, error);
        next(error);
    }
 };

exports.updateUserRole = async (req, res, next) => {
    const userId = req.params.id;
    const { role } = req.body;

     const allowedRoles = ['user', 'admin', 'delivery_admin'];
     if (!role || !allowedRoles.includes(role)) {
        req.flash('error_msg', 'Invalid role selected.');
         return res.redirect('/admin/manage-users');
     }

    try {
        const user = await User.findById(userId);
         if (!user) {
            req.flash('error_msg', 'User not found.');
             return res.status(404).redirect('/admin/manage-users');
         }

         if (user.email === req.session.user.email) {
             req.flash('error_msg', 'You cannot change your own role.');
             return res.redirect('/admin/manage-users');
         }


         user.role = role;
        await user.save();

        req.flash('success_msg', `User ${user.email}'s role updated to ${role}.`);
        res.redirect('/admin/manage-users');

    } catch (error) {
         if (error.name === 'CastError') {
             req.flash('error_msg', 'Invalid user ID.');
         } else {
             console.error(`Error updating role for user ${userId}:`, error);
            req.flash('error_msg', 'Error updating user role.');
         }
         res.redirect('/admin/manage-users');
    }
};

exports.removeUser = async (req, res, next) => {
    const userId = req.params.id;
    try {
         const user = await User.findById(userId);
         if (!user) {
            req.flash('error_msg', 'User not found.');
             return res.status(404).redirect('/admin/manage-users');
         }

        if (user.email === req.session.user.email) {
            req.flash('error_msg', 'You cannot remove yourself.');
            return res.redirect('/admin/manage-users');
        }
         if (user.role === 'admin') {
             const adminCount = await User.countDocuments({ role: 'admin' });
             if (adminCount <= 1) {
                 req.flash('error_msg', 'Cannot remove the last admin account.');
                return res.redirect('/admin/manage-users');
             }
         }

        await User.deleteOne({ _id: userId });

        if (user.role === 'delivery_admin') {
            await Order.updateMany(
                { assignedTo: userId, status: { $nin: ['Delivered', 'Cancelled'] } },
                { $set: { assignedTo: null, assignedAdminEmail: null, status: 'Order Received' } }
             );
             req.flash('success_msg', `User ${user.email} removed. Any active assigned orders have been unassigned.`);
         } else {
             req.flash('success_msg', `User ${user.email} removed successfully.`);
         }

        res.redirect('/admin/manage-users');

    } catch (error) {
         if (error.name === 'CastError') {
             req.flash('error_msg', 'Invalid user ID.');
         } else {
             console.error(`Error removing user ${userId}:`, error);
            req.flash('error_msg', 'Error removing user.');
         }
        res.redirect('/admin/manage-users');
     }
 };

 exports.removeDeliveryAdminAssignment = async (req, res, next) => {
    const userId = req.params.id;
    try {
         const user = await User.findOne({_id: userId, role: 'delivery_admin'});
         if (!user) {
            req.flash('error_msg', 'Delivery Admin not found.');
             return res.status(404).redirect('/admin/manage-assigned-orders');
         }

         if (user.email === req.session.user.email) {
            req.flash('error_msg', 'Action not allowed on self.');
            return res.redirect('/admin/manage-assigned-orders');
        }

         const updateResult = await Order.updateMany(
             { assignedTo: userId, status: { $nin: ['Delivered', 'Cancelled'] } },
             { $set: { assignedTo: null, assignedAdminEmail: null, status: 'Order Received' } }
         );

         await User.deleteOne({ _id: userId });

         req.flash('success_msg', `Delivery Admin ${user.email} removed. ${updateResult.modifiedCount} active orders unassigned.`);
         res.redirect('/admin/manage-assigned-orders');


     } catch (error) {
        if (error.name === 'CastError') {
             req.flash('error_msg', 'Invalid delivery admin ID.');
         } else {
             console.error(`Error removing delivery admin ${userId}:`, error);
             req.flash('error_msg', 'Error removing delivery admin.');
         }
        res.redirect('/admin/manage-assigned-orders');
     }
 };


  exports.getAssignedOrdersDetailForAdmin = async(req, res, next) => {
      const deliveryAdminId = req.params.deliveryAdminId;
      const type = req.params.type;

     try {
          const deliveryAdmin = await User.findById(deliveryAdminId).lean();
         if(!deliveryAdmin || deliveryAdmin.role !== 'delivery_admin'){
             req.flash('error_msg', 'Delivery Admin not found.');
             return res.redirect('/admin/manage-assigned-orders');
         }

         let query = { assignedTo: deliveryAdminId };
         let pageTitle = `Orders Assigned to ${deliveryAdmin.email}`;

         if (type === 'pending') {
            query.status = { $in: ['Order Received', 'Out for Delivery'] };
            pageTitle = `Pending ${pageTitle}`;
         } else if (type === 'delivered') {
             query.status = 'Delivered';
            pageTitle = `Delivered ${pageTitle}`;
        }

        const orders = await Order.find(query)
                                   .sort({ orderDate: -1 })
                                    .lean();

        orders.forEach(order => {
             order.formattedOrderDate = new Date(order.orderDate).toLocaleString();
            order.formattedReceivedDate = order.receivedByDate ? new Date(order.receivedByDate).toLocaleString() : 'N/A';
        });

         res.render('admin/assigned-orders-detail', {
             title: pageTitle,
            orders: orders,
             deliveryAdminEmail: deliveryAdmin.email
        });


     } catch (error) {
        if (error.name === 'CastError') {
            req.flash('error_msg', 'Invalid delivery admin ID.');
             return res.redirect('/admin/manage-assigned-orders');
        }
         next(error);
    }
  }
