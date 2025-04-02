const mongoose = require('mongoose');

const RatingSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true },
}, { _id: false, timestamps: true });


const ProductSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please provide a product name'],
        trim: true,
    },
    category: {
        type: String,
        required: [true, 'Please provide a product category'],
        trim: true,
    },
    price: {
        type: Number,
        required: [true, 'Please provide a product price'],
        min: 0,
    },
    stock: {
        type: Number,
        required: [true, 'Please provide product stock quantity'],
        min: 0,
        default: 0,
    },
    imageUrl: {
        type: String,
        required: [true, 'Please provide a product image URL'],
        trim: true,
    },
    specifications: {
        type: String,
        trim: true,
    },
    sellerEmail: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
    },
    ratings: [RatingSchema],
    averageRating: {
      type: Number,
      default: 0,
    },
    numReviews: {
        type: Number,
        default: 0,
    },
    orderCount: {
        type: Number,
        default: 0,
    }
}, {
    timestamps: true
});

ProductSchema.pre('save', function(next) {
    if (this.ratings && this.ratings.length > 0) {
        this.numReviews = this.ratings.length;
        this.averageRating = this.ratings.reduce((acc, item) => item.rating + acc, 0) / this.ratings.length;
    } else {
        this.numReviews = 0;
        this.averageRating = 0;
    }
    next();
});


const Product = mongoose.model('Product', ProductSchema);

module.exports = Product;
