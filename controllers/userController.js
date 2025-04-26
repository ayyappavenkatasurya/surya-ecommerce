// controllers/userController.js
const User = require('../models/User');
const Product = require('../models/Product');
const mongoose = require('mongoose'); // Import mongoose for ID validation
const pincodeSearch = require('india-pincode-search'); // <<<--- IMPORT LIBRARY

exports.getUserProfilePage = async (req, res, next) => {
    try {
        const userId = req.session.user._id;
        // Select only necessary fields for profile display
        const user = await User.findById(userId)
                            .select('name email role address createdAt') // Added createdAt for info if needed
                            .lean(); // Use lean for read-only

        if (!user) {
            // This case should ideally be handled by isAuthenticated middleware
            console.warn(`User not found in DB despite active session: ${userId}`);
            req.flash('error_msg', 'User session invalid. Please log in again.');
            return req.session.destroy(err => {
                if (err) return next(err);
                res.redirect('/auth/login');
            });
        }

        res.render('user/profile', {
            title: 'My Profile',
            user: user // Pass user data to the view
            // currentUser is available via res.locals
        });

    } catch (error) {
        next(error); // Pass error to handler
    }
};

exports.updateUserName = async (req, res, next) => {
    const { name } = req.body;
    const userId = req.session.user._id;

    // --- Input Validation ---
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
        req.flash('error_msg', 'Please enter a valid name (at least 2 characters).');
        return res.redirect('/user/profile');
    }

    const trimmedName = name.trim();

    try {
        // Find user (not lean, need to save)
        const user = await User.findById(userId);
        if (!user) {
            req.flash('error_msg', 'User not found. Please log in again.');
            return res.redirect('/auth/login');
        }

        // Update the name
        user.name = trimmedName;
        await user.save();

        // --- Update Session ---
        req.session.user.name = user.name; // Update name in session
        await req.session.save(); // Wait for session save to complete

        req.flash('success_msg', 'Name updated successfully.');
        res.redirect('/user/profile'); // Redirect back to profile

    } catch (error) {
        // Handle Mongoose validation errors specifically
        if (error.name === 'ValidationError') {
            let validationErrors = Object.values(error.errors).map(el => el.message);
            req.flash('error_msg', `Validation Error: ${validationErrors.join(' ')}`);
            return res.redirect('/user/profile');
        }
        // Pass other errors to the central handler
        console.error("Error updating user name:", error);
        next(error);
    }
};


exports.saveAddress = async (req, res, next) => {
    // **** MODIFIED: Destructure new fields ****
    const { name, phone, pincode, cityVillage, landmarkNearby, source, state, district, mandal } = req.body;
    // **** END MODIFIED ****
    const userId = req.session.user._id;

    const redirectPath = (source === 'profile') ? '/user/profile' : '/user/checkout';

    // --- Input Validation ---
    let errors = [];
    if (!name || !phone || !pincode || !cityVillage) {
        errors.push('Please provide Name, Phone, Pincode, and City/Village/Area.');
    }
    if (phone && !/^\d{10,15}$/.test(phone.trim())) {
        errors.push('Please enter a valid phone number (10-15 digits, numbers only).');
    }
     if (pincode && !/^\d{6}$/.test(pincode.trim())) {
        errors.push('Please enter a valid 6-digit pincode.');
    }
    if (errors.length > 0) {
         req.flash('error_msg', errors.join(' '));
        return res.redirect(redirectPath);
    }

    // --- Save Address Logic ---
    try {
        const user = await User.findById(userId);
        if (!user) {
            req.flash('error_msg', 'User not found.');
            return res.redirect('/auth/login');
        }

        // **** MODIFIED: Include new fields in the address object ****
        user.address = {
            name: name.trim(),
            phone: phone.trim(),
            pincode: pincode.trim(),
            cityVillage: cityVillage.trim(),
            landmarkNearby: landmarkNearby ? landmarkNearby.trim() : undefined,
            // Add the derived fields (use optional chaining and trim for safety)
            mandal: mandal?.trim() || undefined,
            district: district?.trim() || undefined,
            state: state?.trim() || undefined
        };
        // **** END MODIFIED ****

        await user.save();

        // --- Update Session ---
        req.session.user.address = user.address.toObject();
        await req.session.save();

        req.flash('success_msg', 'Address saved successfully.');
        res.redirect(redirectPath);

    } catch (error) {
        if (error.name === 'ValidationError') {
            let validationErrors = Object.values(error.errors).map(el => el.message);
            req.flash('error_msg', `Validation Error: ${validationErrors.join(' ')}`);
            return res.redirect(redirectPath);
        }
        next(error);
    }
};

exports.getCart = async (req, res, next) => {
    try {
        const userId = req.session.user._id;
        const user = await User.findById(userId)
                                    .populate('cart.productId', 'name price imageUrl stock _id reviewStatus')
                                    .lean();

        if (!user) {
           console.warn(`User not found in getCart despite session: ${userId}`);
           req.flash('error_msg', 'User not found.');
           return req.session.destroy(err => {
                if(err) return next(err);
                res.redirect('/auth/login');
           });
         }

        let cartTotal = 0;
        let populatedCart = [];
        let cartUpdated = false;

        if (user.cart && user.cart.length > 0) {
             populatedCart = user.cart.map(item => {
                 if (!item.productId || !item.productId._id) {
                     console.warn(`Cart item refers to a non-existent product ID for user: ${user.email}. Will filter.`);
                     cartUpdated = true;
                     return null;
                 }
                 if (item.productId.reviewStatus !== 'approved') {
                      console.warn(`Product ${item.productId.name} (${item.productId._id}) in cart is not approved. Will filter.`);
                      cartUpdated = true;
                      return null;
                 }
                const itemSubtotal = item.productId.price * item.quantity;
                cartTotal += itemSubtotal;
                return {
                    productId: item.productId._id,
                    name: item.productId.name,
                    price: item.productId.price,
                    imageUrl: item.productId.imageUrl,
                    stock: item.productId.stock,
                    quantity: item.quantity,
                    subtotal: itemSubtotal
                };
             }).filter(item => item !== null);

             if (cartUpdated) {
                 const validCartItems = populatedCart.map(item => ({ productId: item.productId, quantity: item.quantity }));
                 req.session.user.cart = validCartItems;
                  console.log(`Session cart updated for user ${user.email} due to invalid/unapproved items found.`);
             }
         }

        res.render('user/cart', {
          title: 'Your Shopping Cart',
          cart: populatedCart,
          cartTotal: cartTotal
        });
      } catch (error) {
        next(error);
      }
};

exports.addToCart = async (req, res, next) => {
    const { productId, quantity = 1 } = req.body;
    const userId = req.session.user._id;
    const numQuantity = parseInt(quantity, 10);

     if (!productId || !mongoose.Types.ObjectId.isValid(productId) || isNaN(numQuantity) || numQuantity < 1) {
         req.flash('error_msg', 'Invalid product or quantity.');
         return res.redirect(req.headers.referer || '/');
     }

    try {
        const [user, product] = await Promise.all([
            User.findById(userId),
            Product.findById(productId).select('name stock reviewStatus')
        ]);

        if (!user) {
            req.flash('error_msg', 'User session error. Please log in again.');
            return res.redirect('/auth/login');
        }
        if (!product) {
            req.flash('error_msg', 'Product not found.');
            return res.redirect(req.headers.referer || '/');
        }

        if (product.reviewStatus !== 'approved') {
             req.flash('error_msg', `Sorry, "${product.name}" is currently unavailable.`);
             return res.redirect(req.headers.referer || '/');
        }

       if (product.stock <= 0) {
            req.flash('error_msg', `${product.name} is currently out of stock.`);
            return res.redirect(req.headers.referer || '/');
        }

       const existingCartItemIndex = user.cart.findIndex(item => item.productId.toString() === productId.toString());

       if (existingCartItemIndex > -1) {
           const existingQuantity = user.cart[existingCartItemIndex].quantity;
           const newQuantity = existingQuantity + numQuantity;
            if (product.stock < newQuantity) {
               req.flash('error_msg', `Cannot add ${numQuantity} more ${product.name}. Only ${product.stock} available in total (you have ${existingQuantity} in cart).`);
                return res.redirect(req.headers.referer?.includes(`/products/${productId}`) ? `/products/${productId}` : '/');
           }
            user.cart[existingCartItemIndex].quantity = newQuantity;
       } else {
           if (product.stock < numQuantity) {
               req.flash('error_msg', `Insufficient stock for ${product.name}. Only ${product.stock} available.`);
                return res.redirect(req.headers.referer?.includes(`/products/${productId}`) ? `/products/${productId}` : '/');
           }
           user.cart.push({ productId, quantity: numQuantity });
       }

        await user.save();

       req.session.user.cart = user.cart.map(item => ({ productId: item.productId, quantity: item.quantity }));
       await req.session.save();

        req.flash('success_msg', `${product.name} added to cart!`);

        if(req.query.redirectTo === 'checkout') {
           return res.redirect('/user/checkout');
       }
        res.redirect('/user/cart');

    } catch (error) {
         if (error.name === 'CastError') {
            req.flash('error_msg', 'Invalid product ID format.');
             return res.redirect('/');
         }
         console.error("Add to Cart Error:", error);
        next(error);
    }
};

exports.updateCartQuantity = async (req, res, next) => {
         const { productId, quantity } = req.body;
         const userId = req.session.user._id;
         const numQuantity = parseInt(quantity, 10);

         if (!productId || !mongoose.Types.ObjectId.isValid(productId) || isNaN(numQuantity) || numQuantity < 0) {
              return res.status(400).json({ success: false, message: 'Invalid product ID or quantity.' });
         }

        try {
            const [user, product] = await Promise.all([
                 User.findById(userId),
                 Product.findById(productId).select('stock price reviewStatus name')
            ]);

            if (!user) {
               return res.status(404).json({ success: false, message: 'User not found.' });
            }
            if (!product) {
               return res.status(404).json({ success: false, message: 'Product not found.' });
            }

            if (product.reviewStatus !== 'approved') {
                const itemIndexToRemove = user.cart.findIndex(item => item.productId.toString() === productId.toString());
                if (itemIndexToRemove > -1) {
                    user.cart.splice(itemIndexToRemove, 1);
                    await user.save();
                    req.session.user.cart = user.cart.map(i => ({ productId: i.productId, quantity: i.quantity }));
                    await req.session.save();
                }
                return res.status(400).json({ success: false, message: `Product "${product.name}" is unavailable and has been removed.`, removal: true });
            }

            const cartItemIndex = user.cart.findIndex(item => item.productId.toString() === productId.toString());

            if (numQuantity === 0) {
                if (cartItemIndex > -1) {
                    user.cart.splice(cartItemIndex, 1);
                }
            }
            else {
               if (product.stock < numQuantity) {
                  return res.status(400).json({ success: false, message: `Insufficient stock for ${product.name}. Only ${product.stock} available.` });
                 }
                if (cartItemIndex > -1) {
                    user.cart[cartItemIndex].quantity = numQuantity;
                } else {
                    user.cart.push({ productId, quantity: numQuantity });
                 }
            }

            await user.save();
            req.session.user.cart = user.cart.map(item => ({ productId: item.productId, quantity: item.quantity }));

            let cartTotal = 0;
            let itemSubtotal = 0;
             for (const item of user.cart) {
                 const relatedProduct = await Product.findById(item.productId).select('price').lean();
                 if (relatedProduct) {
                    const currentItemSubtotal = relatedProduct.price * item.quantity;
                    cartTotal += currentItemSubtotal;
                    if (item.productId.toString() === productId.toString()) {
                         itemSubtotal = currentItemSubtotal;
                     }
                 }
            }
             await req.session.save();

            res.json({
                 success: true,
                 message: 'Cart updated successfully.',
                 newQuantity: user.cart.find(item => item.productId.toString() === productId.toString())?.quantity ?? 0,
                 itemSubtotal: itemSubtotal,
                 cartTotal: cartTotal,
                 itemId: productId
             });

        } catch (error) {
            console.error("Cart Update Error:", error);
            res.status(500).json({ success: false, message: 'Error updating cart quantity.' });
        }
};

exports.removeFromCart = async (req, res, next) => {
    const { productId } = req.params;
    const userId = req.session.user._id;

    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
       req.flash('error_msg', 'Invalid Product ID.');
       return res.redirect('/user/cart');
     }

    try {
        const user = await User.findOneAndUpdate(
            { _id: userId },
            { $pull: { cart: { productId: productId } } },
            { new: true }
        );

         if (!user) {
             req.flash('error_msg', 'User not found.');
            return res.redirect('/auth/login');
         }

         req.session.user.cart = user.cart.map(item => ({ productId: item.productId, quantity: item.quantity }));
         await req.session.save();

         req.flash('success_msg', 'Item removed from cart.');
         res.redirect('/user/cart');

    } catch (error) {
       console.error("Remove From Cart Error:", error);
       next(error);
    }
};

exports.getCheckoutPage = async (req, res, next) => {
    try {
       const userId = req.session.user._id;
       const user = await User.findById(userId)
                              .populate('cart.productId', 'name price imageUrl stock reviewStatus sellerId _id')
                              .lean();

       if (!user) {
           req.flash('error_msg', 'User session expired. Please login.');
           return res.redirect('/auth/login');
       }
       if (!user.cart || user.cart.length === 0) {
           req.flash('error_msg', 'Your cart is empty.');
           return res.redirect('/user/cart');
       }

       let subTotal = 0;
        let checkoutItems = [];
        let issuesFound = false;
        let issueMessages = [];

       for (const item of user.cart) {
           if (!item.productId || !item.productId._id) {
               issueMessages.push('An invalid item reference was detected.');
               issuesFound = true;
               continue;
           }
            if(item.productId.reviewStatus !== 'approved'){
                issueMessages.push(`"${item.productId.name}" is unavailable.`);
                issuesFound = true;
                continue;
            }
            if(item.productId.stock < item.quantity){
                issueMessages.push(`Insufficient stock for "${item.productId.name}" (Only ${item.productId.stock} left).`);
                issuesFound = true;
                 continue;
            }
            const itemTotal = item.productId.price * item.quantity;
            subTotal += itemTotal;
           checkoutItems.push({
               productId: item.productId._id,
               name: item.productId.name,
               price: item.productId.price,
               imageUrl: item.productId.imageUrl,
               quantity: item.quantity,
               stock: item.productId.stock,
               itemTotal: itemTotal
            });
       }

        if (issuesFound) {
             req.flash('error_msg', "Please resolve the following issues in your cart: " + issueMessages.join(' '));
             return res.redirect('/user/cart');
        }

        const totalAmount = subTotal;

       res.render('user/checkout', {
           title: 'Checkout',
           userAddress: user.address,
           items: checkoutItems,
           subTotal: subTotal,
           totalAmount: totalAmount,
           paymentMethod: 'COD'
       });

   } catch (error) {
       next(error);
   }
};

exports.lookupPincode = (req, res) => {
    const pincode = req.params.pincode;

    if (!pincode || !/^\d{6}$/.test(pincode)) {
        return res.status(400).json({ success: false, message: 'Invalid Pincode format (must be 6 digits).' });
    }

    try {
        const results = pincodeSearch.search(pincode);

        if (!results || results.length === 0) {
            return res.status(404).json({ success: false, message: 'Pincode not found.' });
        }

        const locationData = results[0];
        const transformedLocation = {
            pinCode: locationData.pincode,
            locality: locationData.village,
            mandalName: locationData.district,
            districtName: locationData.city,
            stateName: locationData.state,
            postOfficeName: locationData.office
        };

        res.json({ success: true, location: transformedLocation });

    } catch (error) {
        console.error(`Error looking up pincode ${pincode}:`, error);
        res.status(500).json({ success: false, message: 'Error looking up pincode information.' });
    }
};