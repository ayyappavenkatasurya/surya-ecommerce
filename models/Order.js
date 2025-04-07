// models/Order.js
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
        // --- REMOVED 'Out for Delivery' ---
        enum: ['Pending', 'Delivered', 'Cancelled'],
        // ---------------------------------
        default: 'Pending',
    },
    orderDate: {
        type: Date,
        default: Date.now,
    },
    receivedByDate: { // Renamed for clarity (date customer received it)
        type: Date,
    },
    // --- REMOVED assignedTo and assignedAdminEmail ---
    // assignedTo: { ... }
    // assignedAdminEmail: { ... }
    // ------------------------------------------------

    // --- OTP now only for Admin Direct Delivery ---
    orderOTP: String,
    orderOTPExpires: Date,
    // -------------------------------------------

    cancellationAllowedUntil: {
        type: Date,
    },
    cancellationReason: {
        type: String,
        trim: true,
    }
}, {
    timestamps: true
});

OrderSchema.pre('save', function(next) {
    // Set customer cancellation window only for new orders
    if (this.isNew && !this.cancellationAllowedUntil) {
        const now = this.orderDate || Date.now();
        // Allow customer cancellation for 1 hour after placement
        this.cancellationAllowedUntil = new Date(now.getTime() + 60 * 60 * 1000);
    }

    // Clear fields when order is cancelled (removed assignment fields)
    if (this.isModified('status') && this.status === 'Cancelled') {
        this.orderOTP = undefined;
        this.orderOTPExpires = undefined;
        this.receivedByDate = undefined; // Clear received date on cancellation
        this.cancellationAllowedUntil = undefined; // Prevent further user cancellation
    }

    // --- UPDATED: Clear OTP if status changes away from 'Pending' ---
    // OTP is only relevant in 'Pending' (for potential admin direct delivery)
    if (this.isModified('status') && this.status !== 'Pending') {
         this.orderOTP = undefined;
         this.orderOTPExpires = undefined;
    }
    // Clear OTP if status becomes Delivered or Cancelled (ensures OTP is gone after successful delivery/cancellation)
    if (this.status === 'Delivered' || this.status === 'Cancelled') {
        this.orderOTP = undefined;
        this.orderOTPExpires = undefined;
    }

    next();
});

const Order = mongoose.model('Order', OrderSchema);

module.exports = Order;