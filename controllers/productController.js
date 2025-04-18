// controllers/productController.js
const Product = require('../models/Product');
const User = require('../models/User'); // Keep for user rating logic

// --- UPDATE Get Products (Show ONLY Approved) ---
exports.getProducts = async (req, res, next) => {
  try {
    const searchTerm = req.query.search || '';
    let query = {
        // *** ADDED: Filter by approved status and stock ***
        reviewStatus: 'approved',
        stock: { $gt: 0 }
    };

    if (searchTerm) {
      // Using text index for search
      query.$text = { $search: searchTerm };
      // If not using text index, use regex:
      // const escapedSearchTerm = searchTerm.replace(/[-\[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
      // const regex = new RegExp(escapedSearchTerm, 'i');
      // query.$or = [
      //    { name: regex },
      //    { category: regex },
      //    { specifications: regex }
      // ];
    }

    // Define projection for text search score if using $text
    const projection = searchTerm ? { score: { $meta: "textScore" } } : {};
    const sort = searchTerm ? { score: { $meta: "textScore" } } : { createdAt: -1 };


    const products = await Product.find(query, projection) // Add projection
                                    .sort(sort)        // Sort by score or date
                                    .lean();             // Use lean for performance

    res.render('products/index', {
      title: searchTerm ? `Search Results for "${searchTerm}"` : 'Home',
      products: products,
      searchTerm: searchTerm
    });
  } catch (error) {
    next(error);
  }
};


// --- UPDATE Get Product Details (Check Status/Ownership) ---
exports.getProductDetails = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id)
                                    .populate('sellerId', 'name email') // Populate seller
                                    .lean(); // Use lean()

    if (!product) {
       // Handles CastError implicitly if ID is invalid format for findById
       const error = new Error('Product not found');
       error.status = 404;
       return next(error); // Use central error handler
    }

    // *** ADDED: Check if product is viewable ***
    const isApproved = product.reviewStatus === 'approved';
    const user = req.session.user;
    const isAdmin = user?.role === 'admin';
    // Check if user is explicitly the seller comparing ObjectIds as strings
    const isOwner = user && product.sellerId?._id && user._id.toString() === product.sellerId._id.toString();


    if (!isApproved && !isAdmin && !isOwner) {
        // If product isn't approved, only admin or owner can see it
         const error = new Error('Product not available');
         error.status = 404; // Or 403 Forbidden, but 404 is less revealing
         return next(error);
    }


    // User rating logic (no change needed here)
    let userRating = null;
    if (user) {
       // Note: lean() means product.ratings doesn't have Mongoose methods. Need manual find.
       const ratingData = product.ratings?.find(r => r.userId?.toString() === user._id.toString());
       userRating = ratingData ? ratingData.rating : null;
    }

    // Rating stats calculation (no change needed here)
    const ratingCounts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    let totalRatings = 0;
    if (product.ratings && product.ratings.length > 0) {
        totalRatings = product.ratings.length;
        product.ratings.forEach(r => {
            // Check rating value exists and is within expected range
            if (r.rating && ratingCounts.hasOwnProperty(r.rating)) {
                ratingCounts[r.rating]++;
            }
        });
    }

    const displayTotalRatings = product.numReviews || totalRatings;


    res.render('products/detail', {
      title: product.name,
      product: product,
      // Pass status flags to view for conditional rendering (e.g., banners)
      isApproved: isApproved,
      isAdminView: isAdmin,
      isOwnerView: isOwner,
      userRating: userRating,
      // Allow rating only if product is approved (or maybe always for owner/admin?)
      userCanRate: user ? true : false, // Existing logic: logged in = can rate
      // Pass rating data
      ratingCounts: ratingCounts,
      totalRatings: displayTotalRatings
    });
  } catch (error) {
       // Mongoose CastError (invalid ID format) should be caught by findById -> null
       if (error.name === 'CastError') {
           const notFoundError = new Error('Product not found (Invalid ID)');
           notFoundError.status = 404;
           return next(notFoundError);
       }
    next(error); // Pass other errors to central handler
  }
};


// --- Rate Product (No fundamental change, but check product exists) ---
 exports.rateProduct = async (req, res, next) => {
     const { rating } = req.body;
    const productId = req.params.id;
    const userId = req.session.user._id;

     if (!rating || isNaN(Number(rating)) || rating < 1 || rating > 5) { // Added NaN check
         req.flash('error_msg', 'Please provide a valid rating between 1 and 5.');
        // Redirect back is safer than assuming specific path
        return res.redirect('back'); // Redirect to previous page
     }

    try {
        // Find the product *without* lean() to use save() method
        const product = await Product.findById(productId);

         if (!product) {
             req.flash('error_msg', 'Product not found.');
             // Redirecting to home might be better than back if product disappeared
             return res.status(404).redirect('/');
         }

         // --- OPTIONAL: Prevent rating non-approved products? ---
         // if (product.reviewStatus !== 'approved') {
         //     req.flash('error_msg', 'This product cannot be rated currently.');
         //     return res.redirect('back');
         // }


         // Find existing rating index
         const existingRatingIndex = product.ratings.findIndex(r => r.userId?.toString() === userId.toString());

         if (existingRatingIndex > -1) {
             // Update existing rating
            product.ratings[existingRatingIndex].rating = Number(rating);
             // Optionally update timestamp if RatingSchema tracks it
         } else {
            // Add new rating
            product.ratings.push({ userId, rating: Number(rating) });
         }

        // Mongoose pre-save hook will recalculate averageRating and numReviews
        await product.save();

         req.flash('success_msg', 'Thank you for your rating!');
         res.redirect(`/products/${productId}`); // Redirect back to product page

     } catch (error) {
        // Handle CastError for productId
        if (error.name === 'CastError') {
            req.flash('error_msg', 'Invalid product ID.');
            return res.status(400).redirect('/');
        }
        console.error("Error rating product:", error);
        next(error); // Central error handler
     }
 };