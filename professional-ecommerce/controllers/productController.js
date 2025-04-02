const Product = require('../models/Product');
const User = require('../models/User');

exports.getProducts = async (req, res, next) => {
  try {
    const searchTerm = req.query.search || '';
    let query = { stock: { $gt: 0 } };

    if (searchTerm) {
      query.$or = [
         { name: { $regex: searchTerm, $options: 'i' } },
         { category: { $regex: searchTerm, $options: 'i' } },
          { specifications: { $regex: searchTerm, $options: 'i' } }
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


    res.render('products/detail', {
      title: product.name,
      product: product,
      userRating: userRating,
      userCanRate: req.session.user ? true : false

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
            product.ratings[existingRatingIndex].rating = Number(rating);

         } else {
            product.ratings.push({ userId, rating: Number(rating) });
        }

        await product.save();

         req.flash('success_msg', 'Thank you for your rating!');
         res.redirect(`/products/${productId}`);

     } catch (error) {
        next(error);
     }
 };
