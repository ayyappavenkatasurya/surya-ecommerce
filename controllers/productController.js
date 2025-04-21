// controllers/productController.js
const Product = require('../models/Product');
const User = require('../models/User');
const Category = require('../models/Category'); // *** IMPORT Category ***
const mongoose = require('mongoose'); // Needed for ObjectId validation if used

/**
 * Escapes special characters in a string for use in a regular expression.
 * @param {string} string - The input string.
 * @returns {string} The escaped string.
 */
function escapeRegex(string) {
  // Simple escape function, consider a more robust one if needed for complex regex
  return string.replace(/[-\[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

// --- UPDATED Get Products (Handles category filter and search) ---
exports.getProducts = async (req, res, next) => {
  try {
    const searchTerm = req.query.search || '';
    // --- NEW: Check for category filter ---
    const categoryFilterName = req.query.categoryName || ''; // Use categoryName

    let query = {
        reviewStatus: 'approved', // Only show approved products
        stock: { $gt: 0 }         // Only show products in stock
    };
    let sort = { createdAt: -1 }; // Default: Newest first
    const projection = {};        // Define if specific fields are needed

    // --- Filter by Category if provided ---
    if (categoryFilterName) {
        // Basic validation for category name format if needed
        // Example: if (!/^[a-zA-Z0-9\s&-]+$/.test(categoryFilterName)) { ... handle error ... }
        query.categoryName = categoryFilterName; // Filter by denormalized name
         console.log(`Filtering products page by category: ${categoryFilterName}`);
         // Optional: Change sort order when filtering by category, e.g., sort by name
         // sort = { name: 1 };
     }

    // --- Handle Search Term (sequential match) ---
    if (searchTerm) {
      const escapedSearchTerm = escapeRegex(searchTerm);
      const regex = new RegExp(escapedSearchTerm, 'i'); // Case-insensitive

      // Update search fields to include name, categoryName, and description
      query.$or = [
        { name: regex },
        { categoryName: regex }, // Search denormalized category name
        { description: regex }
        // { specifications: regex } // Add specifications if needed
      ];
       // Current query combines search AND category filter if both are present.
       // If search should *override* the category filter, uncomment below:
       // if (categoryFilterName) { delete query.categoryName; }
      console.log(`Regex Search Query (getProducts): ${JSON.stringify(query)}`);
      // Optional: Change sort order for search results
      // sort = { name: 1 }; // e.g., Alphabetical
    }

    // Fetch categories as well - useful for displaying sidebar or breadcrumbs
     const [products, categories] = await Promise.all([
        Product.find(query, projection)
                .populate('categoryRef', 'name') // Optionally populate just the name for consistency
                .sort(sort)
                .lean(),
         Category.find().sort('name').lean() // Fetch all categories for display
    ]);

    // Render the main product index view
    res.render('products/index', {
        title: categoryFilterName
            ? `Products in ${categoryFilterName}` // Title for category filtered page
            : (searchTerm ? `Search Results for "${searchTerm}"` : 'Home'), // Dynamic title for search or home
        products: products,
        searchTerm: searchTerm,
        homepageCategories: categories, // Pass all categories (e.g., for category nav display)
        homepageBanners: [], // Pass empty array or fetch banners if needed on this specific route
        selectedCategoryName: categoryFilterName // Pass selected category name for potential highlighting/breadcrumbs
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    next(error); // Pass error to the central handler
  }
};


// --- Get Product Details ---
// --- UPDATED: Populate categoryRef ---
exports.getProductDetails = async (req, res, next) => {
  try {
    // Validate Product ID format first
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        const error = new Error('Invalid Product ID format');
        error.status = 400; // Bad Request
        return next(error);
    }

    const product = await Product.findById(req.params.id)
                                    .populate('sellerId', 'name email') // Populate seller details
                                    .populate('categoryRef', 'name slug') // Populate category name/slug
                                    .lean(); // Use lean for performance

    // --- Handle Product Not Found ---
    if (!product) {
       const error = new Error('Product not found');
       error.status = 404; // Not Found
       return next(error);
    }

    // --- Permission checks (Status, Admin, Owner) ---
    const isApproved = product.reviewStatus === 'approved';
    const user = req.session.user;
    const isAdmin = user?.role === 'admin';
    // Safely check owner status (handles cases where sellerId might be missing)
    const isOwner = user && product.sellerId?._id && user._id.toString() === product.sellerId._id.toString();

    // If product is not approved AND user is not admin OR owner, deny access
    if (!isApproved && !isAdmin && !isOwner) {
         const error = new Error('Product not available');
         error.status = 404; // Use 404 to mask existence
         return next(error);
    }

    // --- Prepare Rating Information ---
    let userRating = null;
    if (user && product.ratings && Array.isArray(product.ratings)) { // Check product.ratings exists and is an array
       const ratingData = product.ratings.find(r => r.userId?.toString() === user._id.toString());
       userRating = ratingData ? ratingData.rating : null;
    }

    const ratingCounts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    let totalRatings = 0;
    if (product.ratings && product.ratings.length > 0) {
        totalRatings = product.ratings.length;
        product.ratings.forEach(r => {
            if (r.rating >= 1 && r.rating <= 5) { // Ensure rating is valid before counting
                ratingCounts[r.rating]++;
            }
        });
    }
    // Use numReviews (updated by pre-save hook) if available, otherwise fallback to calculated total
     const displayTotalRatings = product.numReviews ?? totalRatings;

    // Render the detail view
    res.render('products/detail', {
      title: product.name,
      product: product, // Pass the lean product object (includes populated categoryRef)
      isApproved: isApproved,
      isAdminView: isAdmin,
      isOwnerView: isOwner,
      userRating: userRating, // User's existing rating (if any)
      userCanRate: user ? true : false, // Can the current viewer rate? (Needs login)
      ratingCounts: ratingCounts, // Counts for each star level (for rating bars)
      totalRatings: displayTotalRatings // Total number of ratings to display
    });
  } catch (error) {
       // Handle potential CastError specifically during findById
       if (error.name === 'CastError') {
           const notFoundError = new Error('Product not found (Invalid ID format)');
           notFoundError.status = 404;
           return next(notFoundError);
       }
    // Pass any other errors to the central handler
    next(error);
  }
};


// --- Rate Product (No changes needed related to category update) ---
 exports.rateProduct = async (req, res, next) => {
    const { rating } = req.body;
    const productId = req.params.id;
    const userId = req.session.user?._id; // Make sure user exists

    // Validation
     if (!userId) {
        // This should ideally be caught by isAuthenticated middleware, but double-check
         req.flash('error_msg', 'You must be logged in to rate products.');
         return res.redirect(`/products/${productId}`);
     }
     if (!mongoose.Types.ObjectId.isValid(productId)) {
        req.flash('error_msg', 'Invalid Product ID.');
        return res.status(400).redirect('/'); // Redirect home or back?
    }
     if (!rating || isNaN(Number(rating)) || rating < 1 || rating > 5) {
         req.flash('error_msg', 'Please provide a valid rating between 1 and 5.');
        return res.redirect('back'); // Go back to the product page
     }

    try {
        // Find product *without* lean() to use .save() and trigger hooks
        const product = await Product.findById(productId);

         if (!product) {
             req.flash('error_msg', 'Product not found.');
             return res.status(404).redirect('/');
         }

          // Ensure product is approved before allowing rating
         if (product.reviewStatus !== 'approved') {
             req.flash('error_msg', 'This product cannot be rated yet.');
             return res.redirect(`/products/${productId}`);
         }

         // Check if user has already rated
         const existingRatingIndex = product.ratings.findIndex(r => r.userId?.toString() === userId.toString());

         if (existingRatingIndex > -1) {
             // Update existing rating
             product.ratings[existingRatingIndex].rating = Number(rating);
         } else {
             // Add new rating object
             product.ratings.push({ userId: userId, rating: Number(rating) });
         }

        // Save the product - this will trigger the pre-save hook in Product.js
        // which recalculates averageRating and numReviews
        await product.save();

         req.flash('success_msg', 'Thank you for your rating!');
         res.redirect(`/products/${productId}`); // Redirect back to product page

     } catch (error) {
        // Redundant CastError check if validation is done above, but safe to keep
        if (error.name === 'CastError') {
            req.flash('error_msg', 'Invalid product ID.');
            return res.status(400).redirect('/');
        }
        console.error("Error rating product:", error);
        next(error); // Pass other errors to the central handler
     }
 };

 // --- Get Product Suggestions (Updated to search categoryName) ---
 exports.getProductSuggestions = async (req, res, next) => {
    const searchTerm = req.query.q;
    const limit = 8; // Max number of suggestions

    // Basic validation for search term length
    if (!searchTerm || searchTerm.trim().length < 2) {
        return res.json([]); // Return empty array if search term is too short
    }

    try {
        // Escape regex characters for safe searching
        const escapedSearchTerm = escapeRegex(searchTerm);
        // Create case-insensitive regex
        const regex = new RegExp(escapedSearchTerm, 'i');

        // Define the search query targeting relevant fields
        const query = {
            $or: [
                { name: regex },         // Match product name
                { categoryName: regex }, // *** Match categoryName ***
                { description: regex }   // Match description
                // { specifications: regex } // Optional: add specs search
            ],
            reviewStatus: 'approved', // Only suggest approved products
            stock: { $gt: 0 }         // Only suggest products in stock
        };

        // Fetch suggestions from the database
        const suggestions = await Product.find(query)
            .select('_id name imageUrl categoryName') // Select fields needed for display
            .limit(limit) // Limit the number of results
            .sort({ name: 1 }) // Sort alphabetically (or consider relevance score later)
            .lean(); // Use lean for performance

        // Return suggestions as JSON
        res.json(suggestions);

    } catch (error) {
        console.error("Error fetching product suggestions:", error);
        // Return an error response (optional, depends on desired frontend handling)
        res.status(500).json({ error: 'Failed to fetch suggestions' });
    }
 };