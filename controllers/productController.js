// controllers/productController.js
const Product = require('../models/Product');
const User = require('../models/User');
// *** Import category names ***
const { categoryNames } = require('../config/categories');


function escapeRegex(string) {
  // Simple regex escape. Consider a more robust library if needed.
  return string.replace(/[-\[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

// --- Get Products (Handles listing, search, AND category filter) ---
exports.getProducts = async (req, res, next) => {
  try {
    const searchTerm = req.query.search || '';
    // *** Get category filter ***
    const categoryFilter = req.query.category || '';

    let query = {
        reviewStatus: 'approved', // Always filter by approved
        stock: { $gt: 0 }         // Always filter by in-stock
    };
    let sort = { createdAt: -1 }; // Default sort
    const projection = {};

    // Use Regex for sequential matching if searchTerm exists
    if (searchTerm) {
      const escapedSearchTerm = escapeRegex(searchTerm);
      const regex = new RegExp(escapedSearchTerm, 'i');
      query.$or = [
        { name: regex },
        { category: regex }
      ];
      console.log(`Regex Search Query: ${JSON.stringify(query)}`);
    }
    // Apply category filter ONLY if no search term is present
    else if (categoryFilter && categoryNames.includes(categoryFilter)) {
         query.category = categoryFilter;
    } else if (categoryFilter) {
         console.warn(`Invalid category filter attempted on /products route: ${categoryFilter}`);
    }
    // --- End Filter Logic ---

    const products = await Product.find(query, projection)
                                    .sort(sort)
                                    .lean();

    // Determine page title based on filters
    let pageTitle = 'Products';
    if (searchTerm) {
        pageTitle = `Search Results for "${searchTerm}"`;
    } else if (categoryFilter && categoryNames.includes(categoryFilter)) {
        pageTitle = `Category: ${categoryFilter}`;
    }

    // Render the same index page, passing search term and category for display
    res.render('products/index', {
      title: pageTitle,
      products: products,
      searchTerm: searchTerm,
      selectedCategory: categoryFilter && categoryNames.includes(categoryFilter) ? categoryFilter : null, // Pass selected category
      // Note: displayCategories are typically passed by getHomePage, not needed here unless specifically rendering categories on this route
      // displayCategories: require('../config/categories') // Uncomment if needed here
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

 // --- Get Product Suggestions (Updated for sequential matching - no category changes needed here) ---
 exports.getProductSuggestions = async (req, res, next) => {
    const searchTerm = req.query.q;
    const limit = 8;

    if (!searchTerm || searchTerm.trim().length < 2) {
        return res.json([]);
    }

    try {
        const escapedSearchTerm = escapeRegex(searchTerm);
        const regex = new RegExp(escapedSearchTerm, 'i');

        const query = {
            $or: [ { name: regex }, { category: regex } ],
            reviewStatus: 'approved',
            stock: { $gt: 0 }
        };

        const suggestions = await Product.find(query)
            .select('_id name imageUrl')
            .limit(limit)
            .sort({ name: 1 })
            .lean();

        res.json(suggestions);

    } catch (error) {
        console.error("Error fetching product suggestions:", error);
        res.status(500).json({ error: 'Failed to fetch suggestions' });
    }
 };