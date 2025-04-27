// models/Order.js
const mongoose = require('mongoose');

const OrderProductSchema = new mongoose.Schema({
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    priceAtOrder: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
    imageUrl: { type: String },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { _id: false });

const OrderAddressSchema = new mongoose.Schema({
    name: { type: String, trim: true, required: true },
    phone: { type: String, trim: true, required: true },
    pincode: { type: String, trim: true, required: true },
    // **** ADD LOCALITY ****
    locality: { type: String, trim: true, required: true }, // Selected from dropdown
    // **** END LOCALITY ****
    cityVillage: { type: String, trim: true, required: true }, // For House No / Building / Area
    landmarkNearby: { type: String, trim: true }, // Optional Landmark
    mandal: { type: String, trim: true },     // Derived from pincode lookup
    district: { type: String, trim: true },   // Derived from pincode lookup
    state: { type: String, trim: true },      // Derived from pincode lookup
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
        type: OrderAddressSchema, // Now includes the locality field
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
        enum: ['Pending', 'Delivered', 'Cancelled'],
        default: 'Pending',
    },
    orderDate: {
        type: Date,
        default: Date.now,
    },
    receivedByDate: {
        type: Date,
    },
    orderOTP: String,
    orderOTPExpires: Date,
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
    if (this.isNew && !this.cancellationAllowedUntil) {
        const now = this.orderDate || Date.now();
        this.cancellationAllowedUntil = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour
    }

    // Clear OTP and related fields on cancellation or delivery
    if (this.isModified('status') && (this.status === 'Cancelled' || this.status === 'Delivered')) {
        this.orderOTP = undefined;
        this.orderOTPExpires = undefined;
        this.cancellationAllowedUntil = undefined; // Disable cancellation
        if (this.status === 'Cancelled') {
            this.receivedByDate = undefined; // Clear received date if cancelled
        }
    }
     // Also clear OTP if status changes FROM Pending to something else (but might be redundant with above)
     if (this.isModified('status') && this.status !== 'Pending') {
        this.orderOTP = undefined;
        this.orderOTPExpires = undefined;
    }

    next();
});

const Order = mongoose.model('Order', OrderSchema);

module.exports = Order;