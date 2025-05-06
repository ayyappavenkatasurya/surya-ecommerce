// models.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const config = require('./config'); // Import the consolidated config

// --- From models/BannerConfig.js ---
const BannerSchema = new mongoose.Schema({
  imageUrl: { type: String, trim: true, required: true },
  linkUrl: { type: String, trim: true },
  title: { type: String, trim: true },
}, { _id: false });

function bannerArrayLimit(val) {
  return val.length <= 4;
}

const BannerConfigSchema = new mongoose.Schema({
  configKey: {
    type: String,
    default: 'mainBanners',
    unique: true,
    required: true,
  },
  banners: {
    type: [BannerSchema],
    validate: [bannerArrayLimit, '{PATH} exceeds the limit of 4 banners']
  },
  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { timestamps: true });

const BannerConfig = mongoose.model('BannerConfig', BannerConfigSchema);


// --- From models/User.js ---
const AddressSchema = new mongoose.Schema({
    name: { type: String, trim: true },
    phone: { type: String, trim: true },
    pincode: { type: String, trim: true },
    locality: { type: String, trim: true }, // From Pincode lookup
    cityVillage: { type: String, trim: true }, // House No/Building/Area
    landmarkNearby: { type: String, trim: true }, // Optional
    mandal: { type: String, trim: true }, // Derived
    district: { type: String, trim: true }, // Derived
    state: { type: String, trim: true }, // Derived
}, { _id: false });

const CartItemSchema = new mongoose.Schema({
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true, min: 1, default: 1 },
}, { _id: false });

const UserSchema = new mongoose.Schema({
    name: { type: String, required: [true, 'Please provide your name'], trim: true },
    email: {
        type: String,
        required: [true, 'Please provide your email'],
        unique: true,
        match: /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        lowercase: true,
        trim: true,
    },
    password: {
        type: String,
        required: [true, 'Please provide a password'],
        minlength: [8, 'Password must be at least 8 characters long'],
        select: false,
    },
    role: { type: String, enum: ['user', 'admin', 'seller'], default: 'user' },
    isVerified: { type: Boolean, default: false },
    otp: { type: String },
    otpExpires: { type: Date },
    address: AddressSchema,
    cart: [CartItemSchema],
    resetPasswordToken: String,
    resetPasswordExpires: Date,
}, { timestamps: true });

UserSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

UserSchema.methods.matchPassword = async function(enteredPassword) {
    if (!this.password) {
        const userWithPassword = await User.findById(this._id).select('+password').exec();
        if (!userWithPassword || !userWithPassword.password) return false;
        return await bcrypt.compare(enteredPassword, userWithPassword.password);
    }
    return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model('User', UserSchema);


// --- From models/Product.js ---
const RatingSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true },
}, { _id: false, timestamps: true });

const ProductSchema = new mongoose.Schema({
    name: { type: String, required: [true, 'Please provide a product name'], trim: true, index: true },
    shortDescription: { type: String, trim: true, maxlength: 200 },
    category: {
        type: String,
        required: [true, 'Please select a product category'],
        trim: true,
        index: true,
        enum: {
            values: config.categoryNames, // Use from consolidated config
            message: '{VALUE} is not a supported category.'
        }
    },
    price: { type: Number, required: [true, 'Please provide a product price'], min: 0 },
    stock: { type: Number, required: [true, 'Please provide product stock quantity'], min: 0, default: 0 },
    imageUrl: { type: String, required: [true, 'Please provide a product image URL'], trim: true },
    imageUrl2: { type: String, trim: true }, // Optional second image
    specifications: { type: String, trim: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sellerEmail: { type: String, required: true, lowercase: true, trim: true },
    ratings: [RatingSchema],
    averageRating: { type: Number, default: 0 },
    numReviews: { type: Number, default: 0 },
    orderCount: { type: Number, default: 0 },
    reviewStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
    rejectionReason: { type: String, trim: true }
}, { timestamps: true });

ProductSchema.pre('save', function(next) {
    if (this.isModified('ratings')) {
        this.numReviews = this.ratings ? this.ratings.length : 0;
        this.averageRating = this.numReviews > 0 ? this.ratings.reduce((acc, item) => item.rating + acc, 0) / this.numReviews : 0;
    }
    if (this.isModified('reviewStatus') && this.reviewStatus !== 'rejected') {
        this.rejectionReason = undefined;
    }
    next();
});

ProductSchema.index({ name: 'text', category: 'text', specifications: 'text' });

const Product = mongoose.model('Product', ProductSchema);


// --- From models/Order.js ---
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
    locality: { type: String, trim: true, required: true }, // Added
    cityVillage: { type: String, trim: true, required: true }, // House/Area
    landmarkNearby: { type: String, trim: true }, // Optional
    mandal: { type: String, trim: true }, // Derived
    district: { type: String, trim: true }, // Derived
    state: { type: String, trim: true }, // Derived
}, { _id: false });

const OrderSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userEmail: { type: String, required: true, lowercase: true, trim: true },
    products: [OrderProductSchema],
    totalAmount: { type: Number, required: true, min: 0 },
    shippingAddress: { type: OrderAddressSchema, required: true },
    paymentMethod: { type: String, enum: ['COD'], required: true, default: 'COD' },
    status: { type: String, enum: ['Pending', 'Delivered', 'Cancelled'], default: 'Pending' },
    orderDate: { type: Date, default: Date.now },
    receivedByDate: { type: Date },
    orderOTP: String,
    orderOTPExpires: Date,
    cancellationAllowedUntil: { type: Date },
    cancellationReason: { type: String, trim: true }
}, { timestamps: true });

OrderSchema.pre('save', function(next) {
    if (this.isNew && !this.cancellationAllowedUntil) {
        const now = this.orderDate || Date.now();
        this.cancellationAllowedUntil = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour
    }
    if (this.isModified('status') && (this.status === 'Cancelled' || this.status === 'Delivered')) {
        this.orderOTP = undefined;
        this.orderOTPExpires = undefined;
        this.cancellationAllowedUntil = undefined;
        if (this.status === 'Cancelled') this.receivedByDate = undefined;
    }
    if (this.isModified('status') && this.status !== 'Pending') {
         this.orderOTP = undefined;
         this.orderOTPExpires = undefined;
     }
    next();
});

const Order = mongoose.model('Order', OrderSchema);


// --- Consolidated Exports ---
module.exports = {
    BannerConfig,
    User,
    Product,
    Order
};