// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const AddressSchema = new mongoose.Schema({
    name: { type: String, trim: true },
    phone: { type: String, trim: true },
    pincode: { type: String, trim: true },
    // **** ADD LOCALITY ****
    locality: { type: String, trim: true }, // Selected from dropdown
    // **** END LOCALITY ****
    cityVillage: { type: String, trim: true }, // For House No / Building / Area
    landmarkNearby: { type: String, trim: true }, // Optional Landmark
    mandal: { type: String, trim: true },     // Derived from pincode lookup
    district: { type: String, trim: true },   // Derived from pincode lookup
    state: { type: String, trim: true },      // Derived from pincode lookup
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
}, { _id: false });

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
        minlength: [8, 'Password must be at least 8 characters long'], // <-- INCREASED MIN LENGTH VALIDATION
        select: false, // Keep password hidden by default
    },
    role: {
        type: String,
        enum: ['user', 'admin', 'seller'],
        default: 'user',
    },
    isVerified: {
        type: Boolean,
        default: false,
    },
    otp: { type: String },
    otpExpires: { type: Date },
    address: AddressSchema, // Contains the new fields now
    cart: [CartItemSchema],

    resetPasswordToken: String,
    resetPasswordExpires: Date,
}, {
    timestamps: true
});

// Hash password before saving
UserSchema.pre('save', async function(next) {
    // Only hash the password if it has been modified (or is new)
    if (!this.isModified('password')) return next();

    // Password complexity validation should happen *before* this hook.
    // This hook only handles the hashing.

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
    // If password field wasn't selected during query, fetch it explicitly
    if (!this.password) {
        // Need to re-fetch the user document including the password field
        const userWithPassword = await mongoose.model('User').findById(this._id).select('+password').exec();
        if (!userWithPassword || !userWithPassword.password) return false; // User not found or no password set
        return await bcrypt.compare(enteredPassword, userWithPassword.password);
    }
    // If password field was already selected
    return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model('User', UserSchema);

module.exports = User;