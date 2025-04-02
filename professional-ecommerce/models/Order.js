const mongoose = require('mongoose');

const OrderProductSchema = new mongoose.Schema({
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    priceAtOrder: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
    imageUrl: { type: String }
}, { _id: false });

const OrderAddressSchema = new mongoose.Schema({
    name: { type: String, trim: true, required: true },
    phone: { type: String, trim: true, required: true },
    pincode: { type: String, trim: true, required: true },
    cityVillage: { type: String, trim: true, required: true },
    landmarkNearby: { type: String, trim: true },
}, { _id: false });


const OrderSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    userEmail: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
    },
    products: [OrderProductSchema],
    totalAmount: {
        type: Number,
        required: true,
        min: 0,
    },
    shippingAddress: {
        type: OrderAddressSchema,
        required: true
    },
    paymentMethod: {
        type: String,
        enum: ['COD'],
        required: true,
        default: 'COD',
    },
    status: {
        type: String,
        enum: ['Pending', 'Order Received', 'Out for Delivery', 'Delivered', 'Cancelled'],
        default: 'Pending',
    },
    orderDate: {
        type: Date,
        default: Date.now,
    },
    receivedByDate: {
        type: Date,
    },
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
    },
    assignedAdminEmail: {
        type: String,
        lowercase: true,
        trim: true,
        default: null,
    },

    orderOTP: String,
    orderOTPExpires: Date,

    cancellationAllowedUntil: {
        type: Date,
    }
}, {
    timestamps: true
});

OrderSchema.pre('save', function(next) {
    if (this.isNew) {
        const now = this.orderDate || Date.now();
        this.cancellationAllowedUntil = new Date(now.getTime() + 60 * 60 * 1000);
    }
    next();
});

const Order = mongoose.model('Order', OrderSchema);

module.exports = Order;
