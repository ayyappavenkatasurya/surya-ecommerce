// models/Category.js
const mongoose = require('mongoose');
const slugify = require('slugify'); // You might need to install: npm install slugify

const CategorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please provide a category name'],
        unique: true,
        trim: true,
        maxlength: [50, 'Category name cannot be more than 50 characters']
    },
    imageUrl: {
        type: String,
        required: [true, 'Please provide an image URL for the category'],
        trim: true,
        match: [/^https?:\/\/.+\..+/, 'Please provide a valid URL']
    },
    slug: { // For potential future use in URLs
        type: String,
        unique: true,
        index: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    lastUpdatedBy: {
         type: mongoose.Schema.Types.ObjectId,
         ref: 'User'
     }
}, {
    timestamps: true
});

// Pre-save hook to generate slug from name
CategorySchema.pre('save', function(next) {
    if (this.isModified('name') || this.isNew) {
      this.slug = slugify(this.name, { lower: true, strict: true });
    }
    next();
});

// Ensure product references are updated/checked before deleting a category
CategorySchema.pre('deleteOne', { document: true, query: false }, async function(next) {
    console.log(`Checking for products in category: ${this.name} (${this._id}) before deletion.`);
    const Product = mongoose.model('Product'); // Avoid circular dependency issues by requiring here
    try {
        const productCount = await Product.countDocuments({ categoryRef: this._id });
        if (productCount > 0) {
             console.warn(`Deletion aborted: ${productCount} products found in category "${this.name}".`);
             // Throw an error that can be caught in the controller
             const error = new Error(`Cannot delete category "${this.name}" as it contains ${productCount} product(s). Please reassign products first.`);
             error.statusCode = 400; // Bad Request
             return next(error);
        }
        console.log(`No products found for category "${this.name}". Safe to delete.`);
        next();
    } catch (err) {
         console.error("Error checking products before category deletion:", err);
         // Pass the error to the next middleware/error handler
         next(err);
    }
});


const Category = mongoose.model('Category', CategorySchema);

module.exports = Category;