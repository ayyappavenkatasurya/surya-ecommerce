// controllers/productController.js
const Product = require('../models/Product');
const User = require('../models/User');

// getProducts remains the same...
exports.getProducts = async (req, res, next) => {
  try {
    const searchTerm = req.query.search || '';
    let query = { stock: { $gt: 0 } };

    if (searchTerm) {
      // Escape regex special characters for safety
      const escapedSearchTerm = searchTerm.replace(/[-\[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
      const regex = new RegExp(escapedSearchTerm, 'i');
      query.$or = [
         { name: regex },
         { category: regex },
         { specifications: regex }
      ];
    }

    const products = await Product.find(query).sort({ createdAt: -1 });

    res.render('products/index', {
      title: searchTerm ? `Search Results for "${searchTerm}"` : 'Home',
      products: products,
      searchTerm: searchTerm
    });
  } catch (error) {
    next(error);
  }
};


exports.getProductDetails = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
       const error = new Error('Product not found');
       error.status = 404;
       return next(error);
    }

    let userRating = null;
    if (req.session.user) {
       const ratingData = product.ratings.find(r => r.userId.toString() === req.session.user._id.toString());
       userRating = ratingData ? ratingData.rating : null;
    }

    // --- Calculate Rating Counts ---
    const ratingCounts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    let totalRatings = 0;
    if (product.ratings && product.ratings.length > 0) {
        totalRatings = product.ratings.length; // Use the actual array length for calculation
        product.ratings.forEach(r => {
            if (ratingCounts.hasOwnProperty(r.rating)) {
                ratingCounts[r.rating]++;
            }
        });
    }
    // Ensure totalRatings used for percentage calculation matches numReviews if available
    // This handles potential small discrepancies if numReviews wasn't updated perfectly
    const displayTotalRatings = product.numReviews || totalRatings;
    // --- End Calculation ---

    res.render('products/detail', {
      title: product.name,
      product: product,
      userRating: userRating,
      userCanRate: req.session.user ? true : false,
      ratingCounts: ratingCounts, // Pass the counts
      totalRatings: displayTotalRatings // Pass the total count for percentage calculation
    });
  } catch (error) {
       if (error.name === 'CastError') {
           const notFoundError = new Error('Product not found');
           notFoundError.status = 404;
           return next(notFoundError);
       }
    next(error);
  }
};

// rateProduct remains the same...
 exports.rateProduct = async (req, res, next) => {
     const { rating } = req.body;
    const productId = req.params.id;
    const userId = req.session.user._id;

     if (!rating || rating < 1 || rating > 5) {
         req.flash('error_msg', 'Please provide a valid rating between 1 and 5.');
        return res.redirect(`/products/${productId}`);
     }

    try {
        const product = await Product.findById(productId);

         if (!product) {
             req.flash('error_msg', 'Product not found.');
             return res.status(404).redirect('/');
         }

         const existingRatingIndex = product.ratings.findIndex(r => r.userId.toString() === userId.toString());

         if (existingRatingIndex > -1) {
            // Update existing rating
            product.ratings[existingRatingIndex].rating = Number(rating);
             // Optionally update timestamp if RatingSchema has timestamps:true
             // product.ratings[existingRatingIndex].updatedAt = new Date();
         } else {
            // Add new rating
            product.ratings.push({ userId, rating: Number(rating) });
        }

        // Pre-save hook in Product.js will recalculate averageRating and numReviews
        await product.save();

         req.flash('success_msg', 'Thank you for your rating!');
         res.redirect(`/products/${productId}`);

     } catch (error) {
        next(error);
     }
 };