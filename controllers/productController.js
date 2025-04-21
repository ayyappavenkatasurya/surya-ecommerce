// controllers/productController.js
const Product = require('../models/Product');
const User = require('../models/User'); // Keep for user rating logic

/**
 * Escapes special characters in a string for use in a regular expression.
 * @param {string} string - The input string.
 * @returns {string} The escaped string.
 */
function escapeRegex(string) {
  return string.replace(/[-\[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

// --- Get Products (Handles both listing and search results with sequential matching) ---
exports.getProducts = async (req, res, next) => {
  try {
    const searchTerm = req.query.search || ''; // Get search term from query param 'search'
    let query = {
        reviewStatus: 'approved', // Always filter by approved
        stock: { $gt: 0 }         // Always filter by in-stock
    };
    let sort = { createdAt: -1 }; // Default sort
    const projection = {}; // No text score projection needed for regex

    // --- NEW: Use Regex for sequential matching if searchTerm exists ---
    if (searchTerm) {
      const escapedSearchTerm = escapeRegex(searchTerm); // Escape special characters
      const regex = new RegExp(escapedSearchTerm, 'i'); // 'i' for case-insensitive sequential match

      query.$or = [ // Match name OR category sequentially
        { name: regex },
        { category: regex }
        // Add { specifications: regex } here if you want to search specs sequentially too
      ];
      // Optional: Change sort for search results, e.g., alphabetical
      // sort = { name: 1 };
      console.log(`Regex Search Query: ${JSON.stringify(query)}`); // Log the query
    }
    // --- End Regex modification ---

    const products = await Product.find(query, projection) // Projection is now empty
                                    .sort(sort)
                                    .lean(); // Use lean for read-only performance

    // Render the same index page, passing search term for display
    res.render('products/index', {
      title: searchTerm ? `Search Results for "${searchTerm}"` : 'Home', // Dynamic title
      products: products,
      searchTerm: searchTerm // Pass term back to view
      // currentUser is available via res.locals
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    next(error); // Pass error to central handler
  }
};


// --- Get Product Details (No changes needed) ---
exports.getProductDetails = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id)
                                    .populate('sellerId', 'name email') // Populate seller
                                    .lean(); // Use lean()

    if (!product) {
       const error = new Error('Product not found');
       error.status = 404;
       return next(error); // Use central error handler
    }

    // Check if product is viewable
    const isApproved = product.reviewStatus === 'approved';
    const user = req.session.user;
    const isAdmin = user?.role === 'admin';
    const isOwner = user && product.sellerId?._id && user._id.toString() === product.sellerId._id.toString();


    if (!isApproved && !isAdmin && !isOwner) {
        // If product isn't approved, only admin or owner can see it
         const error = new Error('Product not available');
         error.status = 404; // Or 403 Forbidden, but 404 is less revealing
         return next(error);
    }

    // User rating logic
    let userRating = null;
    if (user) {
       const ratingData = product.ratings?.find(r => r.userId?.toString() === user._id.toString());
       userRating = ratingData ? ratingData.rating : null;
    }

    // Rating stats calculation
    const ratingCounts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    let totalRatings = 0;
    if (product.ratings && product.ratings.length > 0) {
        totalRatings = product.ratings.length;
        product.ratings.forEach(r => {
            if (r.rating && ratingCounts.hasOwnProperty(r.rating)) {
                ratingCounts[r.rating]++;
            }
        });
    }
    const displayTotalRatings = product.numReviews || totalRatings;


    res.render('products/detail', {
      title: product.name,
      product: product,
      isApproved: isApproved,
      isAdminView: isAdmin,
      isOwnerView: isOwner,
      userRating: userRating,
      userCanRate: user ? true : false,
      ratingCounts: ratingCounts,
      totalRatings: displayTotalRatings
      // Add other necessary variables like fullUrl etc. if needed by header partial
    });
  } catch (error) {
       if (error.name === 'CastError') {
           const notFoundError = new Error('Product not found (Invalid ID)');
           notFoundError.status = 404;
           return next(notFoundError);
       }
    next(error); // Pass other errors to central handler
  }
};


// --- Rate Product (No changes needed) ---
 exports.rateProduct = async (req, res, next) => {
     const { rating } = req.body;
    const productId = req.params.id;
    const userId = req.session.user._id;

     if (!rating || isNaN(Number(rating)) || rating < 1 || rating > 5) {
         req.flash('error_msg', 'Please provide a valid rating between 1 and 5.');
        return res.redirect('back'); // Redirect to previous page
     }

    try {
        const product = await Product.findById(productId); // Not lean()

         if (!product) {
             req.flash('error_msg', 'Product not found.');
             return res.status(404).redirect('/');
         }

         const existingRatingIndex = product.ratings.findIndex(r => r.userId?.toString() === userId.toString());

         if (existingRatingIndex > -1) {
            product.ratings[existingRatingIndex].rating = Number(rating);
         } else {
            product.ratings.push({ userId, rating: Number(rating) });
         }

        await product.save(); // Triggers pre-save hook for averageRating/numReviews

         req.flash('success_msg', 'Thank you for your rating!');
         res.redirect(`/products/${productId}`); // Redirect back to product page

     } catch (error) {
        if (error.name === 'CastError') {
            req.flash('error_msg', 'Invalid product ID.');
            return res.status(400).redirect('/');
        }
        console.error("Error rating product:", error);
        next(error); // Central error handler
     }
 };

 // --- Get Product Suggestions (Updated for sequential matching) ---
 exports.getProductSuggestions = async (req, res, next) => {
    const searchTerm = req.query.q; // Get query from 'q' parameter
    const limit = 8; // Max number of suggestions

    if (!searchTerm || searchTerm.trim().length < 2) {
        return res.json([]); // Return empty if no/short query
    }

    try {
        // --- NEW: Use Regex for sequential matching ---
        const escapedSearchTerm = escapeRegex(searchTerm); // Escape special chars
        const regex = new RegExp(escapedSearchTerm, 'i'); // 'i' for case-insensitive sequential match

        const query = {
            $or: [ // Match name OR category sequentially
                { name: regex },
                { category: regex }
            ],
            reviewStatus: 'approved', // Only suggest approved products
            stock: { $gt: 0 }         // Only suggest products in stock
        };
        // --- End Regex modification ---

        const suggestions = await Product.find(query)
            .select('_id name imageUrl') // Select only needed fields
            .limit(limit)
            .sort({ name: 1 }) // Sort suggestions alphabetically
            .lean(); // Use lean for performance

        res.json(suggestions); // Send results as JSON

    } catch (error) {
        console.error("Error fetching product suggestions:", error);
        // Avoid sending full error details to client
        res.status(500).json({ error: 'Failed to fetch suggestions' });
    }
 };