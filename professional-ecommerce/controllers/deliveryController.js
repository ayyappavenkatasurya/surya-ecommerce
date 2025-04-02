const Order = require('../models/Order');
const User = require('../models/User');
const orderController = require('./orderController');


exports.getDeliveryDashboard = async (req, res, next) => {
  const deliveryAdminId = req.session.user._id;
   const deliveryAdminEmail = req.session.user.email;

  try {
    const totalAssigned = await Order.countDocuments({ assignedTo: deliveryAdminId });
    const pendingCount = await Order.countDocuments({
        assignedTo: deliveryAdminId,
        status: { $in: ['Order Received', 'Out for Delivery'] }
     });
     const deliveredCount = await Order.countDocuments({
        assignedTo: deliveryAdminId,
        status: 'Delivered'
     });

    res.render('delivery/dashboard', {
      title: 'Delivery Dashboard',
      assignedAdminEmail: deliveryAdminEmail,
      totalAssigned,
      pendingCount,
      deliveredCount
    });

  } catch (error) {
    next(error);
  }
};

exports.getAssignedOrdersDetail = async (req, res, next) => {
    const deliveryAdminId = req.session.user._id;
    const type = req.params.type;

    try {
         let query = { assignedTo: deliveryAdminId };
         let pageTitle = `My Assigned Orders`;

         if (type === 'pending') {
            query.status = { $in: ['Order Received', 'Out for Delivery'] };
             pageTitle = `My Pending Deliveries`;
        } else if (type === 'delivered') {
            query.status = 'Delivered';
            pageTitle = `My Delivered Orders`;
        }


        const orders = await Order.find(query)
                                 .sort({ orderDate: -1 })
                                  .lean();

         orders.forEach(order => {
             order.formattedOrderDate = new Date(order.orderDate).toLocaleString();
             order.formattedReceivedDate = order.receivedByDate ? new Date(order.receivedByDate).toLocaleString() : 'N/A';
            order.canMarkDelivered = false; // Initialize
             if(type === 'total' && ['Order Received', 'Out for Delivery'].includes(order.status)){
                 order.canMarkDelivered = true;
             } else if (type === 'pending') {
                 order.canMarkDelivered = true;
             }
         });

        res.render('delivery/assigned-orders-detail', {
             title: pageTitle,
             orders: orders,
             listType: type
         });

    } catch (error) {
        next(error);
    }
};

 exports.markAsDelivered = async (req, res, next) => {
     const { orderId } = req.params;
    const deliveryAdminId = req.session.user._id;

    try {
         await orderController.markOrderAsDelivered(orderId, deliveryAdminId);

         req.flash('success_msg', `Order ${orderId} marked as delivered.`);
        res.redirect(req.headers.referer || '/delivery/dashboard');

    } catch (error) {
        console.error("Error in deliveryController markAsDelivered:", error);
         req.flash('error_msg', `Failed to mark order as delivered: ${error.message}`);
        res.redirect(req.headers.referer || '/delivery/dashboard');
    }
};

