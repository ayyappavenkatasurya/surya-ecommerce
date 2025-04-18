// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const AddressSchema = new mongoose.Schema({
    name: { type: String, trim: true },
    phone: { type: String, trim: true },
    pincode: { type: String, trim: true },
    cityVillage: { type: String, trim: true },
    landmarkNearby: { type: String, trim: true },
}, { _id: false });

const CartItemSchema = new mongoose.Schema({
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true,
    },
    quantity: {
        type: Number,
        required: true,
        min: 1,
        default: 1,
    }
}, { _id: false }); // Changed _id back to false as per original

const UserSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please provide your name'],
        trim: true,
    },
    email: {
        type: String,
        required: [true, 'Please provide your email'],
        unique: true,
        match: [
            /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
            'Please provide a valid email address',
        ],
        lowercase: true,
        trim: true,
    },
    password: {
        type: String,
        required: [true, 'Please provide a password'],
        minlength: 6,
        select: false, // Keep password hidden by default
    },
    role: {
        type: String,
        // *** UPDATED: Added 'seller' role ***
        enum: ['user', 'admin', 'seller'],
        default: 'user',
    },
    isVerified: {
        type: Boolean,
        default: false,
    },
    otp: { type: String },
    otpExpires: { type: Date },
    address: AddressSchema,
    cart: [CartItemSchema],

    resetPasswordToken: String,
    resetPasswordExpires: Date,
}, {
    timestamps: true
});

// Hash password before saving
UserSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();

    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error); // Pass error to mongoose error handling
    }
});

// Method to compare entered password with hashed password
UserSchema.methods.matchPassword = async function(enteredPassword) {
    // Need to explicitly select password if it was excluded in the query
    // If the user instance was fetched without `+password`, this.password will be undefined.
    // It's safer to fetch the user with password when matching is needed.
    if (!this.password) {
        const userWithPassword = await mongoose.model('User').findById(this._id).select('+password').exec();
        if (!userWithPassword) return false; // Should not happen if instance exists
        return await bcrypt.compare(enteredPassword, userWithPassword.password);
    }
    return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model('User', UserSchema);

module.exports = User;