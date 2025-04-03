// controllers/userController.js
const User = require('../models/User');
const Product = require('../models/Product');

// --- NEW: Get User Profile Page ---
exports.getUserProfilePage = async (req, res, next) => {
    try {
        const userId = req.session.user._id;
        // Select necessary fields including role and address
        const user = await User.findById(userId).select('name email role address').lean();

        if (!user) {
            req.flash('error_msg', 'User not found. Please log in again.');
            return req.session.destroy(err => {
                if (err) return next(err);
                res.redirect('/auth/login');
            });
        }

        res.render('user/profile', {
            title: 'My Profile',
            user: user // Pass the user object to the view
        });

    } catch (error) {
        next(error);
    }
};
// --- END NEW FUNCTION ---

// --- Modify saveAddress to handle redirection ---
exports.saveAddress = async (req, res, next) => {
    // --- ADD source field ---
    const { name, phone, pincode, cityVillage, landmarkNearby, source } = req.body;
    const userId = req.session.user._id;

    // Determine the redirect path based on the source
    const redirectPath = (source === 'profile') ? '/user/profile' : '/user/checkout';

    // Basic validation for required fields
    if (!name || !phone || !pincode || !cityVillage) {
        req.flash('error_msg', 'Please provide Name, Phone, Pincode, and City/Village.');
        // Redirect back to the determined path
        return res.redirect(redirectPath);
    }

    // Phone number validation (simple example: 10-15 digits)
    if (!/^\d{10,15}$/.test(phone.trim())) {
        req.flash('error_msg', 'Please enter a valid phone number (10-15 digits, numbers only).');
        return res.redirect(redirectPath);
    }
    // Pincode validation (simple example: 6 digits)
     if (!/^\d{6}$/.test(pincode.trim())) {
        req.flash('error_msg', 'Please enter a valid 6-digit pincode.');
        return res.redirect(redirectPath);
    }


    try {
        const user = await User.findById(userId);
        if (!user) {
            req.flash('error_msg', 'User not found.');
            return res.redirect('/auth/login');
        }

        // Update or set the address subdocument
        user.address = {
            name: name.trim(),
            phone: phone.trim(),
            pincode: pincode.trim(),
            cityVillage: cityVillage.trim(),
            landmarkNearby: landmarkNearby ? landmarkNearby.trim() : ''
        };

        await user.save(); // Validate and save the user document

        // Update session with the new address
        req.session.user.address = user.address;
        await req.session.save(); // Save session

        req.flash('success_msg', 'Address saved successfully.');
        // Redirect back to the determined path after saving
        res.redirect(redirectPath);

    } catch (error) {
        if (error.name === 'ValidationError') {
            // Extract and flash validation errors
            let errors = Object.values(error.errors).map(el => el.message);
            req.flash('error_msg', errors.join(' '));
            return res.redirect(redirectPath);
        }
        next(error); // Pass other errors to handler
    }
};
// --- END MODIFICATION ---


// --- Existing Cart functions remain the same ---
exports.getCart = async (req, res, next) => {
    // ... (keep existing code)
    try {
        const user = await User.findById(req.session.user._id)
                                    .populate('cart.productId')
                                    .lean();

        if (!user) {
           req.flash('error_msg', 'User not found.');
           // Ensure session is destroyed before redirecting if user is invalid
           return req.session.destroy(err => {
                if(err) return next(err);
                res.redirect('/auth/login');
           });
         }

        let cartTotal = 0;
        const populatedCart = user.cart.map(item => {
             if (!item.productId) {
                 console.warn(`Cart item refers to a non-existent product ID: ${item._id} for user: ${user.email}`);
                 // Optionally remove invalid item from cart here
                 // User.updateOne({ _id: user._id }, { $pull: { cart: { _id: item._id } } }).catch(console.error);
                 return null;
             }
            const itemSubtotal = item.productId.price * item.quantity;
            cartTotal += itemSubtotal;
            return {
                // Ensure all necessary fields for the view are included
                _id: item._id, // Might be needed if you have specific item operations
                productId: item.productId._id,
                name: item.productId.name,
                price: item.productId.price,
                imageUrl: item.productId.imageUrl,
                stock: item.productId.stock,
                quantity: item.quantity,
                subtotal: itemSubtotal
            };
         }).filter(item => item !== null); // Filter out null items (invalid products)

         // Update session cart (important if items were filtered)
         req.session.user.cart = user.cart.filter(item => item.productId); // Store only valid items in session

        res.render('user/cart', {
          title: 'Your Shopping Cart',
          cart: populatedCart, // Pass the processed cart data
          cartTotal: cartTotal
        });
      } catch (error) {
        next(error);
      }
};

exports.addToCart = async (req, res, next) => {
    // ... (keep existing code)
    const { productId, quantity = 1 } = req.body;
      const userId = req.session.user._id;
       const numQuantity = parseInt(quantity, 10);


        if (!productId || isNaN(numQuantity) || numQuantity < 1) {
           req.flash('error_msg', 'Invalid product or quantity.');
           // Redirect back to the product page or home if referer is missing/invalid
           return res.redirect(req.headers.referer && req.headers.referer.includes('/products/') ? req.headers.referer : '/');
       }

      try {
          const product = await Product.findById(productId);
          const user = await User.findById(userId); // Fetch the user document

          if (!user) {
              req.flash('error_msg', 'User session error. Please log in again.');
              return res.redirect('/auth/login');
          }
          if (!product) {
              req.flash('error_msg', 'Product not found.');
              // Redirect back safely
              return res.redirect(req.headers.referer && req.headers.referer.includes('/products/') ? req.headers.referer : '/');
          }

         if (product.stock < numQuantity) {
              req.flash('error_msg', `Insufficient stock for ${product.name}. Only ${product.stock} available.`);
              return res.redirect(`/products/${productId}`); // Redirect specifically to product detail
          }

         const existingCartItemIndex = user.cart.findIndex(item => item.productId.toString() === productId.toString());

         if (existingCartItemIndex > -1) {
             // Item exists, update quantity
             const existingQuantity = user.cart[existingCartItemIndex].quantity;
             const newQuantity = existingQuantity + numQuantity;
              if (product.stock < newQuantity) {
                 req.flash('error_msg', `Cannot add ${numQuantity} more ${product.name}. Only ${product.stock} available in total, you have ${existingQuantity} in cart.`);
                  return res.redirect(`/products/${productId}`);
             }
              user.cart[existingCartItemIndex].quantity = newQuantity;
         } else {
             // Item does not exist, add new item
             user.cart.push({ productId, quantity: numQuantity });
         }

          await user.save(); // Save the updated user document

         // Update the cart in the session
         req.session.user.cart = user.cart;
         await req.session.save(); // Ensure session is saved before redirect

          req.flash('success_msg', `${product.name} added to cart!`);

           // Handle redirection based on potential query parameter from 'Buy Now'
           if(req.query.redirectTo === 'checkout') {
              return res.redirect('/user/checkout'); // Correct checkout path
          }
          // --- FIX: Redirect to the correct cart path ---
          res.redirect('/user/cart');
          // --- END FIX ---

      } catch (error) {
           if (error.name === 'CastError') {
              req.flash('error_msg', 'Invalid product ID format.');
               return res.redirect('/'); // Redirect home on invalid ID
            }
          next(error);
      }
};

exports.updateCartQuantity = async (req, res, next) => {
    // ... (keep existing code)
         const { productId, quantity } = req.body;
         const userId = req.session.user._id;
        const numQuantity = parseInt(quantity, 10);


          if (!productId || isNaN(numQuantity) || numQuantity < 0) { // Allow 0 for removal
              return res.status(400).json({ success: false, message: 'Invalid product ID or quantity.' });
         }

        try {
            const user = await User.findById(userId);
             const product = await Product.findById(productId).select('stock price'); // Only fetch needed fields

             if (!user || !product) {
                return res.status(404).json({ success: false, message: 'User or Product not found.' });
             }

             const cartItemIndex = user.cart.findIndex(item => item.productId.toString() === productId.toString());

            if (cartItemIndex === -1 && numQuantity > 0) { // Don't error if trying to remove non-existent item
                return res.status(404).json({ success: false, message: 'Item not found in cart.' });
            }

             let itemSubtotal = 0; // Initialize subtotal

             if (numQuantity === 0) {
                 if(cartItemIndex > -1){ // Only splice if item exists
                     user.cart.splice(cartItemIndex, 1);
                 }
             } else { // numQuantity > 0
                if (product.stock < numQuantity) {
                   return res.status(400).json({ success: false, message: `Insufficient stock. Only ${product.stock} available.` });
                 }
                 if(cartItemIndex > -1){
                     user.cart[cartItemIndex].quantity = numQuantity;
                 } else {
                     // Should not happen if validation is correct, but handle defensively
                     user.cart.push({ productId, quantity: numQuantity });
                 }
                 itemSubtotal = (product.price * numQuantity); // Calculate subtotal only if quantity > 0
            }

            await user.save(); // Save the updated user document

            // Update session cart
            req.session.user.cart = user.cart;

            // Recalculate total AFTER saving and potentially fetching again or using current data
             let cartTotal = 0;
             // Need product prices for recalculation. Fetch populated cart or calculate based on saved data.
             // Easiest might be to calculate from current user.cart if product data is consistent.
             // Let's assume we need prices - fetch populated cart for accurate total.
             const updatedUserPopulated = await User.findById(userId).populate('cart.productId', 'price').lean(); // Fetch only price needed for total
             updatedUserPopulated.cart.forEach(item => {
                if(item.productId){
                    cartTotal += (item.productId.price * item.quantity);
                }
             });

             await req.session.save(); // Ensure session updated before sending response

            res.json({
                 success: true,
                 message: 'Cart updated successfully.',
                 // Return the new quantity from the updated cart data
                 newQuantity: user.cart.find(item => item.productId.toString() === productId.toString())?.quantity ?? 0, // Use nullish coalescing
                 itemSubtotal: itemSubtotal, // Use calculated subtotal
                 cartTotal: cartTotal, // Use recalculated total
                 itemId: productId
             });

        } catch (error) {
            console.error("Cart Update Error:", error);
            res.status(500).json({ success: false, message: 'Error updating cart quantity.' });
        }
};

exports.removeFromCart = async (req, res, next) => {
    // ... (keep existing code)
    const { productId } = req.params; // Get productId from URL params
        const userId = req.session.user._id;

        if (!productId) {
           // This case should ideally not happen if the route is defined correctly
           req.flash('error_msg', 'Product ID is required.');
           // --- FIX: Redirect to the correct cart path ---
           return res.redirect('/user/cart');
           // --- END FIX ---
         }

        try {
            const user = await User.findById(userId);
             if (!user) {
                 req.flash('error_msg', 'User not found.');
                return res.redirect('/auth/login');
            }

             const initialCartLength = user.cart.length;

            // Filter out the item to remove
            user.cart = user.cart.filter(item => item.productId.toString() !== productId.toString());

             // Check if an item was actually removed
             if(user.cart.length === initialCartLength){
                // Item wasn't in the cart in the first place
                req.flash('error_msg', 'Item not found in cart.');
                // --- FIX: Redirect to the correct cart path ---
                return res.redirect('/user/cart');
                // --- END FIX ---
             }

            // Save the user document with the updated cart
            await user.save();

             // Update the session cart
             req.session.user.cart = user.cart;
             await req.session.save(); // Ensure session is saved

             req.flash('success_msg', 'Item removed from cart.');
             // --- FIX: Redirect to the correct cart path ---
             res.redirect('/user/cart');
             // --- END FIX ---

        } catch (error) {
           if (error.name === 'CastError') {
              req.flash('error_msg', 'Invalid product ID format.');
               // --- FIX: Redirect to the correct cart path ---
               return res.redirect('/user/cart');
               // --- END FIX ---
           }
            next(error); // Pass other errors to the handler
        }
};

exports.getCheckoutPage = async (req, res, next) => {
    // ... (keep existing code)
     try {
        const user = await User.findById(req.session.user._id)
                               .populate('cart.productId') // Populate product details
                               .lean(); // Use lean for read-only rendering

        // Check if user exists and has items in cart
        if (!user || !user.cart || user.cart.length === 0) {
            req.flash('error_msg', 'Your cart is empty or user session is invalid.');
            // --- FIX: Redirect to the correct cart path ---
            return res.redirect('/user/cart');
            // --- END FIX ---
        }

        let subTotal = 0;
         let checkoutItems = [];
         let insufficientStock = false;

        // Process cart items for checkout display and stock check
        for (const item of user.cart) {
            if (!item.productId) {
                console.warn(`Invalid product reference in cart for user ${user.email}, item: ${item._id}`);
                // Optionally remove invalid item from cart here before proceeding
                continue; // Skip this invalid item
            }
             // Check stock level against cart quantity
             if(item.productId.stock < item.quantity){
                 insufficientStock = true;
                // Add a specific message for the item with insufficient stock
                req.flash('error_msg', `Insufficient stock for ${item.productId.name}. Available: ${item.productId.stock}, In cart: ${item.quantity}. Please update your cart.`);
             }

             // Calculate item total and add to subtotal
             const itemTotal = item.productId.price * item.quantity;
             subTotal += itemTotal;

             // Prepare item data for rendering in checkout summary
            checkoutItems.push({
                productId: item.productId._id,
                name: item.productId.name,
                price: item.productId.price,
                imageUrl: item.productId.imageUrl,
                quantity: item.quantity,
                stock: item.productId.stock, // Pass stock info if needed in view
                itemTotal: itemTotal
             });
        }

         // If any item has insufficient stock, redirect back to cart with flash messages
         if (insufficientStock) {
             // --- FIX: Redirect to the correct cart path ---
             return res.redirect('/user/cart');
             // --- END FIX ---
         }

         // Calculate total amount (can add shipping, taxes here later if needed)
         const totalAmount = subTotal;


        // Render the checkout page with necessary data
        res.render('user/checkout', {
            title: 'Checkout',
            userAddress: user.address, // Pass saved address (or null if none)
            items: checkoutItems, // Pass processed items for summary
            subTotal: subTotal,
            totalAmount: totalAmount,
            paymentMethod: 'COD' // Default or selected payment method
        });

    } catch (error) {
        next(error); // Pass errors to the main error handler
    }
};