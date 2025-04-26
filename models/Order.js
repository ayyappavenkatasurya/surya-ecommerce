// models/Order.js
const mongoose = require('mongoose');

const OrderProductSchema = new mongoose.Schema({
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    priceAtOrder: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
    imageUrl: { type: String }, // <<<--- MISSING COMMA WAS HERE
    // **** ADDED: Seller ID for reference ****
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' } // Optional, but good for order context
}, { _id: false });

const OrderAddressSchema = new mongoose.Schema({
    name: { type: String, trim: true, required: true },
    phone: { type: String, trim: true, required: true },
    pincode: { type: String, trim: true, required: true },
    cityVillage: { type: String, trim: true, required: true }, // Area/Town/Village
    landmarkNearby: { type: String, trim: true },
    // **** NEW FIELDS ****
    mandal: { type: String, trim: true },     // Derived from pincode lookup
    district: { type: String, trim: true },   // Derived from pincode lookup
    state: { type: String, trim: true },      // Derived from pincode lookup
    // **** END NEW FIELDS ****
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
        type: OrderAddressSchema, // Now includes the new fields
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
        this.cancellationAllowedUntil = new Date(now.getTime() + 60 * 60 * 1000);
    }

    if (this.isModified('status') && this.status === 'Cancelled') {
        this.orderOTP = undefined;
        this.orderOTPExpires = undefined;
        this.receivedByDate = undefined;
        this.cancellationAllowedUntil = undefined;
    }

    if (this.isModified('status') && this.status !== 'Pending') {
         this.orderOTP = undefined;
         this.orderOTPExpires = undefined;
    }
    if (this.status === 'Delivered' || this.status === 'Cancelled') {
        this.orderOTP = undefined;
        this.orderOTPExpires = undefined;
    }

    next();
});

const Order = mongoose.model('Order', OrderSchema);

module.exports = Order;