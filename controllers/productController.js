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
    const searchTerm = req.query.search || '';
    let query = {
        reviewStatus: 'approved',
        stock: { $gt: 0 }
    };
    let sort = { createdAt: -1 };
    const projection = {};

    // --- NEW: Use Regex for sequential matching if searchTerm exists ---
    if (searchTerm) {
      const escapedSearchTerm = escapeRegex(searchTerm);
      const regex = new RegExp(escapedSearchTerm, 'i');

      // *** INCLUDE description in the $or query ***
      query.$or = [
        { name: regex },
        { category: regex },
        { description: regex } // Search description field
        // Add { specifications: regex } here if you want to search specs sequentially too
      ];
      // sort = { name: 1 }; // Optional: change sort for search
      console.log(`Regex Search Query (getProducts): ${JSON.stringify(query)}`);
    }
    // --- End Regex modification ---

    const products = await Product.find(query, projection)
                                    .sort(sort)
                                    .lean();

    // Render the same index page, passing search term for display
    res.render('products/index', {
      title: searchTerm ? `Search Results for "${searchTerm}"` : 'Home', // Dynamic title
      products: products,
      searchTerm: searchTerm
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    next(error);
  }
};


// --- Get Product Details (No changes needed) ---
exports.getProductDetails = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id)
                                    .populate('sellerId', 'name email')
                                    .lean();

    if (!product) {
       const error = new Error('Product not found');
       error.status = 404;
       return next(error);
    }

    const isApproved = product.reviewStatus === 'approved';
    const user = req.session.user;
    const isAdmin = user?.role === 'admin';
    const isOwner = user && product.sellerId?._id && user._id.toString() === product.sellerId._id.toString();


    if (!isApproved && !isAdmin && !isOwner) {
         const error = new Error('Product not available');
         error.status = 404;
         return next(error);
    }

    let userRating = null;
    if (user) {
       const ratingData = product.ratings?.find(r => r.userId?.toString() === user._id.toString());
       userRating = ratingData ? ratingData.rating : null;
    }

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
    });
  } catch (error) {
       if (error.name === 'CastError') {
           const notFoundError = new Error('Product not found (Invalid ID)');
           notFoundError.status = 404;
           return next(notFoundError);
       }
    next(error);
  }
};


// --- Rate Product (No changes needed) ---
 exports.rateProduct = async (req, res, next) => {
     const { rating } = req.body;
    const productId = req.params.id;
    const userId = req.session.user._id;

     if (!rating || isNaN(Number(rating)) || rating < 1 || rating > 5) {
         req.flash('error_msg', 'Please provide a valid rating between 1 and 5.');
        return res.redirect('back');
     }

    try {
        const product = await Product.findById(productId);

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

        await product.save();

         req.flash('success_msg', 'Thank you for your rating!');
         res.redirect(`/products/${productId}`);

     } catch (error) {
        if (error.name === 'CastError') {
            req.flash('error_msg', 'Invalid product ID.');
            return res.status(400).redirect('/');
        }
        console.error("Error rating product:", error);
        next(error);
     }
 };

 // --- Get Product Suggestions (Updated for sequential matching) ---
 exports.getProductSuggestions = async (req, res, next) => {
    const searchTerm = req.query.q;
    const limit = 8;

    if (!searchTerm || searchTerm.trim().length < 2) {
        return res.json([]);
    }

    try {
        // --- NEW: Use Regex for sequential matching ---
        const escapedSearchTerm = escapeRegex(searchTerm);
        const regex = new RegExp(escapedSearchTerm, 'i');

        // *** INCLUDE description in the $or query ***
        const query = {
            $or: [
                { name: regex },
                { category: regex },
                { description: regex } // Search description field
            ],
            reviewStatus: 'approved',
            stock: { $gt: 0 }
        };
        // --- End Regex modification ---

        const suggestions = await Product.find(query)
            .select('_id name imageUrl') // Select only needed fields
            .limit(limit)
            .sort({ name: 1 })
            .lean();

        res.json(suggestions);

    } catch (error) {
        console.error("Error fetching product suggestions:", error);
        res.status(500).json({ error: 'Failed to fetch suggestions' });
    }
 };