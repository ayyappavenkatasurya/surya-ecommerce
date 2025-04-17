// controllers/productController.js
const Product = require('../models/Product');
const User = require('../models/User'); // Keep User model if needed for ratings etc.

/**
 * @desc    Get approved products for the public listing/search page
 * @route   GET /products
 * @access  Public
 */
exports.getProducts = async (req, res, next) => {
  try {
    const searchTerm = req.query.search || '';
    // --- BASE QUERY: Only show APPROVED products with stock > 0 ---
    let query = { status: 'Approved', stock: { $gt: 0 } };

    if (searchTerm) {
      const escapedSearchTerm = searchTerm.replace(/[-\[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
      const regex = new RegExp(escapedSearchTerm, 'i');
      // Apply search using text index (or fallback to regex within approved products)
      // Using text index is generally more efficient if set up correctly in the model
      // query.$text = { $search: escapedSearchTerm }; // Option 1: Use text index
      // Option 2: Regex search (as before)
      query.$or = [
         { name: regex },
         { category: regex },
         { specifications: regex }
      ];
    }

    const products = await Product.find(query)
                                   .sort({ createdAt: -1 }) // Sort newest first
                                   .lean(); // Use lean for performance as it's read-only

    res.render('products/index', {
      title: searchTerm ? `Search Results for "${searchTerm}"` : 'Home',
      products: products,
      searchTerm: searchTerm
    });
  } catch (error) {
    console.error("Error fetching products for home page:", error);
    next(error); // Pass error to the error handler
  }
};


/**
 * @desc    Get details of a single APPROVED product
 * @route   GET /products/:id
 * @access  Public
 */
exports.getProductDetails = async (req, res, next) => {
  try {
    const productId = req.params.id;

    // --- CRITICAL: Find product by ID *AND* ensure it's Approved ---
    const product = await Product.findOne({
        _id: productId,
        status: 'Approved' // Only fetch if the product status is 'Approved'
    }); // Don't use lean here if we modify later (e.g., potentially updating views count, though not implemented)

    // If no product is found (either wrong ID or not Approved), trigger the 404 error
    if (!product) {
       // This is the point where the error "Product not found or not available" is correctly generated.
       const error = new Error('Product not found or not available.');
       error.status = 404;
       return next(error); // Pass the error to the error handling middleware
    }

    // --- Rating Logic (Only runs if product is found and approved) ---
    let userRating = null;
    if (req.session.user) {
       // Find if the current user has rated this product
       const ratingData = product.ratings.find(r => r.userId.toString() === req.session.user._id.toString());
       userRating = ratingData ? ratingData.rating : null;
    }

    // Calculate rating distribution
    const ratingCounts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    let totalRatings = 0;
    if (product.ratings && product.ratings.length > 0) {
        totalRatings = product.ratings.length;
        product.ratings.forEach(r => {
            // Ensure rating is within expected bounds before counting
            if (ratingCounts.hasOwnProperty(r.rating)) {
                ratingCounts[r.rating]++;
            }
        });
    }
    // Use numReviews from product document (calculated on save) as the source of truth
    const displayTotalRatings = product.numReviews || 0;
    // --- End Rating Logic ---

    // Render the product detail page
    res.render('products/detail', {
      title: product.name,
      product: product, // Pass the full mongoose document
      userRating: userRating,
      userCanRate: req.session.user ? true : false, // Allow rating if logged in
      ratingCounts: ratingCounts,
      totalRatings: displayTotalRatings
      // No need to pass userRole here, this is the public view
    });

  } catch (error) {
       // Handle potential CastError if the ID format is invalid
       if (error.name === 'CastError') {
           const notFoundError = new Error('Product not found (Invalid ID format)');
           notFoundError.status = 404;
           return next(notFoundError);
       }
       // Pass any other errors to the main error handler
       next(error);
  }
};


/**
 * @desc    Rate an APPROVED product
 * @route   POST /products/:id/rate
 * @access  Private (Authenticated Users)
 */
 exports.rateProduct = async (req, res, next) => {
     const { rating } = req.body;
    const productId = req.params.id;
    // Ensure user is logged in (should be handled by isAuthenticated middleware)
    if (!req.session.user || !req.session.user._id) {
        req.flash('error_msg', 'You must be logged in to rate products.');
        return res.redirect('/auth/login');
    }
    const userId = req.session.user._id;

    // Validate rating input
     if (!rating || rating < 1 || rating > 5) {
         req.flash('error_msg', 'Please provide a valid rating between 1 and 5.');
        // Redirect back to the product page they were on
        return res.redirect(`/products/${productId}`);
     }

    try {
        // --- Find the product, ensuring it exists AND is Approved ---
        // We use findOneAndUpdate to potentially update the rating atomically,
        // though the current logic finds then saves. Let's stick to find then save for clarity with hooks.
        const product = await Product.findOne({ _id: productId, status: 'Approved' });

         if (!product) {
             // Product not found or not approved for rating
             req.flash('error_msg', 'Product not found or not available for rating.');
             return res.status(404).redirect('/'); // Redirect home or to product list
         }

         // --- Rating Logic ---
         const existingRatingIndex = product.ratings.findIndex(r => r.userId.toString() === userId.toString());

         if (existingRatingIndex > -1) {
            // User has already rated, update their existing rating
            product.ratings[existingRatingIndex].rating = Number(rating);
            product.ratings[existingRatingIndex].updatedAt = Date.now(); // Optionally track update time
         } else {
            // User hasn't rated yet, add a new rating entry
            product.ratings.push({ userId, rating: Number(rating) });
        }

        // The pre-save hook in Product.js will recalculate averageRating and numReviews
        await product.save();

         req.flash('success_msg', 'Thank you for your rating!');
         res.redirect(`/products/${productId}`); // Redirect back to the product page

     } catch (error) {
         // Handle potential errors
         if (error.name === 'CastError') {
            req.flash('error_msg', 'Invalid product ID.');
            return res.redirect('/'); // Redirect home for bad IDs
         }
         // Pass other errors to the error handler
        next(error);
     }
 };