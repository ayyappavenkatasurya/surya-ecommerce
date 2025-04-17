// controllers/userController.js
const User = require('../models/User');
const Product = require('../models/Product');

// --- getUserProfilePage, saveAddress (remain mostly the same) ---
exports.getUserProfilePage = async (req, res, next) => {
    try {
        const userId = req.session.user._id;
        // Select role as well
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
            user: user // Pass user object which includes role
        });

    } catch (error) {
        next(error);
    }
};

exports.saveAddress = async (req, res, next) => {
    const { name, phone, pincode, cityVillage, landmarkNearby, source } = req.body;
    const userId = req.session.user._id;

    const redirectPath = (source === 'profile') ? '/user/profile' : '/user/checkout';

    // Validation remains the same
    if (!name || !phone || !pincode || !cityVillage) {
        req.flash('error_msg', 'Please provide Name, Phone, Pincode, and City/Village.');
        return res.redirect(redirectPath);
    }
    if (!/^\d{10,15}$/.test(phone.trim())) {
        req.flash('error_msg', 'Please enter a valid phone number (10-15 digits, numbers only).');
        return res.redirect(redirectPath);
    }
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
        user.address = {
            name: name.trim(),
            phone: phone.trim(),
            pincode: pincode.trim(),
            cityVillage: cityVillage.trim(),
            landmarkNearby: landmarkNearby ? landmarkNearby.trim() : ''
        };
        await user.save();
        // Update session
        req.session.user.address = user.address;
        await req.session.save(); // Ensure session is saved before redirecting
        req.flash('success_msg', 'Address saved successfully.');
        res.redirect(redirectPath);
    } catch (error) {
        if (error.name === 'ValidationError') {
            let errors = Object.values(error.errors).map(el => el.message);
            req.flash('error_msg', errors.join(' '));
            return res.redirect(redirectPath);
        }
        next(error);
    }
};

// --- Cart Management ---

exports.getCart = async (req, res, next) => {
    try {
        const user = await User.findById(req.session.user._id)
                                    // Populate product details needed for cart display
                                    .populate('cart.productId', 'name price imageUrl stock status') // Added status
                                    .lean(); // Use lean for read-only operation

        if (!user) {
           req.flash('error_msg', 'User not found.');
           return req.session.destroy(err => {
                if(err) return next(err);
                res.redirect('/auth/login');
           });
         }

        let cartTotal = 0;
        let cartNeedsUpdate = false;
        const populatedCart = [];

        // Filter cart items: Keep only those referencing existing, *Approved* products
        const validCartItems = [];
        for (const item of user.cart) {
             // Check if product exists and is approved
             if (!item.productId || item.productId.status !== 'Approved') {
                 console.warn(`Cart item refers to a non-existent or non-approved product ID: ${item.productId?._id || 'N/A'} for user: ${user.email}. Removing from cart.`);
                 cartNeedsUpdate = true; // Mark that the DB needs update
                 continue; // Skip this item
             }
             // Check stock (can be done here or just display)
             if (item.productId.stock < item.quantity) {
                 console.warn(`Stock reduced for ${item.productId.name}. Cart qty: ${item.quantity}, Stock: ${item.productId.stock}. Adjusting cart.`);
                 item.quantity = item.productId.stock; // Adjust quantity to max available
                 if (item.quantity <= 0) {
                     cartNeedsUpdate = true; // Mark for removal if stock is 0
                     continue; // Skip adding if qty becomes 0
                 }
                 req.flash('error_msg', `Quantity for ${item.productId.name} adjusted to available stock: ${item.quantity}.`);
                 cartNeedsUpdate = true; // Mark DB update needed for quantity change
             }

            const itemSubtotal = item.productId.price * item.quantity;
            cartTotal += itemSubtotal;

            populatedCart.push({
                // _id: item._id, // Not needed unless updating specific sub-documents by _id
                productId: item.productId._id,
                name: item.productId.name,
                price: item.productId.price,
                imageUrl: item.productId.imageUrl,
                stock: item.productId.stock,
                quantity: item.quantity,
                subtotal: itemSubtotal
            });
            validCartItems.push({ productId: item.productId._id, quantity: item.quantity }); // Keep track of valid items for DB update
         }

         // If invalid items were found or quantities adjusted, update the user document in DB
         if (cartNeedsUpdate) {
             await User.updateOne({ _id: user._id }, { $set: { cart: validCartItems } });
             // Update session cart to reflect the filtered/adjusted reality
             req.session.user.cart = validCartItems;
             await req.session.save();
             // Re-calculate total based on the cleaned cart
             cartTotal = populatedCart.reduce((sum, current) => sum + current.subtotal, 0);
         } else {
             // Ensure session cart matches DB if no updates were needed but filtering might happen
             // This ensures the session doesn't hold outdated references
             req.session.user.cart = validCartItems;
             await req.session.save();
         }


        res.render('user/cart', {
          title: 'Your Shopping Cart',
          cart: populatedCart, // Render the filtered & potentially adjusted cart
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

        if (!productId || isNaN(numQuantity) || numQuantity < 1) {
           req.flash('error_msg', 'Invalid product or quantity.');
           // Redirect back to product page if possible, otherwise home
           return res.redirect(req.headers.referer && req.headers.referer.includes('/products/') ? req.headers.referer : '/');
       }

      try {
          // --- Find product and ensure it's APPROVED ---
          const product = await Product.findOne({ _id: productId, status: 'Approved' });
          const user = await User.findById(userId); // Find user separately

          if (!user) {
              req.flash('error_msg', 'User session error. Please log in again.');
              return res.redirect('/auth/login');
          }
          if (!product) {
              // Product not found or not approved
              req.flash('error_msg', 'Product not found or currently unavailable.');
              return res.redirect(req.headers.referer && req.headers.referer.includes('/products/') ? req.headers.referer : '/');
          }

         // --- Stock Check ---
         if (product.stock < numQuantity) {
              req.flash('error_msg', `Insufficient stock for ${product.name}. Only ${product.stock} available.`);
              return res.redirect(`/products/${productId}`);
          }

         // --- Update User's Cart ---
         const existingCartItemIndex = user.cart.findIndex(item => item.productId.toString() === productId.toString());

         if (existingCartItemIndex > -1) {
             // Item exists, update quantity
             const existingQuantity = user.cart[existingCartItemIndex].quantity;
             const newQuantity = existingQuantity + numQuantity;
              // Double-check stock for combined quantity
              if (product.stock < newQuantity) {
                 req.flash('error_msg', `Cannot add ${numQuantity} more ${product.name}. Only ${product.stock} available in total, you have ${existingQuantity} in cart.`);
                  return res.redirect(`/products/${productId}`);
             }
              user.cart[existingCartItemIndex].quantity = newQuantity;
         } else {
             // Item doesn't exist, add it
             user.cart.push({ productId, quantity: numQuantity });
         }

          await user.save(); // Save the updated user document

         // --- Update Session Cart ---
         req.session.user.cart = user.cart; // Reflect the change in the session
         await req.session.save(); // Ensure session is saved

          req.flash('success_msg', `${product.name} added to cart!`);

           // Redirect logic (remains the same)
           if(req.query.redirectTo === 'checkout') {
              return res.redirect('/user/checkout');
          }
          res.redirect('/user/cart'); // Default redirect to cart

      } catch (error) {
           if (error.name === 'CastError') {
              req.flash('error_msg', 'Invalid product ID format.');
               return res.redirect('/'); // Redirect home for bad IDs
            }
          next(error); // Pass other errors to the handler
      }
};

exports.updateCartQuantity = async (req, res, next) => {
         const { productId, quantity } = req.body;
         const userId = req.session.user._id;
        const numQuantity = parseInt(quantity, 10);

          // Validate input
          if (!productId || isNaN(numQuantity) || numQuantity < 0) {
              return res.status(400).json({ success: false, message: 'Invalid product ID or quantity.' });
         }

        try {
            const user = await User.findById(userId);
             // --- Find product and ensure it's APPROVED ---
             const product = await Product.findOne({_id: productId, status: 'Approved'}).select('stock price'); // Select necessary fields

             if (!user || !product) {
                 // If product not found or not approved, treat as error
                return res.status(404).json({ success: false, message: 'Product not found or unavailable.' });
             }

             const cartItemIndex = user.cart.findIndex(item => item.productId.toString() === productId.toString());

            // If item not in cart AND quantity is positive, it's an error (shouldn't happen with UI)
            if (cartItemIndex === -1 && numQuantity > 0) {
                console.warn(`Attempted to update quantity for product ${productId} not in cart for user ${userId}`);
                return res.status(404).json({ success: false, message: 'Item not found in cart.' });
            }

             let itemSubtotal = 0;

             if (numQuantity === 0) {
                 // Remove item from cart if quantity is 0
                 if(cartItemIndex > -1){
                     user.cart.splice(cartItemIndex, 1);
                 }
                 // If cartItemIndex was -1, do nothing (already not there)
             } else {
                 // --- Stock Check for positive quantity ---
                 if (product.stock < numQuantity) {
                   return res.status(400).json({ success: false, message: `Insufficient stock. Only ${product.stock} available.` });
                 }
                 // Update quantity or add item (should only update in normal flow)
                 if(cartItemIndex > -1){
                     user.cart[cartItemIndex].quantity = numQuantity;
                 } else {
                     // This case should ideally not happen if adding is separate
                     console.warn(`Adding product ${productId} via update endpoint for user ${userId}.`);
                     user.cart.push({ productId, quantity: numQuantity });
                 }
                 itemSubtotal = (product.price * numQuantity);
            }

            await user.save(); // Save updated user cart

            // --- Update session cart ---
            req.session.user.cart = user.cart;

            // --- Recalculate cart total AFTER save and potential removals ---
            // Need to re-populate to get prices accurately if items were removed/added
            const updatedUserPopulated = await User.findById(userId).populate('cart.productId', 'price').lean();
             let cartTotal = 0;
             updatedUserPopulated.cart.forEach(item => {
                // Ensure productId exists after population (it should if save worked)
                if(item.productId){
                    cartTotal += (item.productId.price * item.quantity);
                }
             });

             await req.session.save(); // Save session again after calculations

            res.json({
                 success: true,
                 message: 'Cart updated successfully.',
                 // Provide the actual quantity in cart (might be 0 if removed)
                 newQuantity: user.cart.find(item => item.productId.toString() === productId.toString())?.quantity ?? 0,
                 itemSubtotal: itemSubtotal, // Subtotal of the *updated* item (0 if removed)
                 cartTotal: cartTotal,      // Newly calculated total
                 itemId: productId          // ID of the item processed
             });

        } catch (error) {
            console.error("Cart Update Error:", error);
            if (error.name === 'CastError') {
                return res.status(400).json({ success: false, message: 'Invalid product ID.' });
            }
            res.status(500).json({ success: false, message: 'Error updating cart quantity.' });
        }
};

exports.removeFromCart = async (req, res, next) => {
    const { productId } = req.params;
        const userId = req.session.user._id;

        if (!productId) {
           req.flash('error_msg', 'Product ID is required.');
           return res.redirect('/user/cart');
         }

        try {
            const user = await User.findById(userId);
             if (!user) {
                 req.flash('error_msg', 'User not found.');
                 // Redirect to login if user is invalid
                return res.redirect('/auth/login');
            }

             const initialCartLength = user.cart.length;
             // Filter out the item to remove
            user.cart = user.cart.filter(item => item.productId.toString() !== productId.toString());

             // Check if an item was actually removed
             if(user.cart.length === initialCartLength){
                // Item wasn't in the cart in the first place
                req.flash('error_msg', 'Item not found in cart.');
                // Still redirect to cart page
                return res.redirect('/user/cart');
             }

            await user.save(); // Save the user with the modified cart

             // --- Update session cart ---
             req.session.user.cart = user.cart;
             await req.session.save();

             req.flash('success_msg', 'Item removed from cart.');
             res.redirect('/user/cart');

        } catch (error) {
           if (error.name === 'CastError') {
              req.flash('error_msg', 'Invalid product ID format.');
               return res.redirect('/user/cart');
           }
            next(error);
        }
};

// --- Checkout ---
exports.getCheckoutPage = async (req, res, next) => {
     try {
        const user = await User.findById(req.session.user._id)
                               // Populate necessary fields including status and stock
                               .populate('cart.productId', 'name price imageUrl stock status')
                               .lean(); // Use lean for read-only

        if (!user) {
            req.flash('error_msg', 'User session invalid. Please log in.');
            return res.redirect('/auth/login');
        }
        if (!user.cart || user.cart.length === 0) {
            req.flash('error_msg', 'Your cart is empty.');
            return res.redirect('/user/cart');
        }

        let subTotal = 0;
         let checkoutItems = [];
         let issueFound = false; // Flag for any problem (stock, status)
         let updateNeeded = false; // Flag if cart needs DB update

        const validCartItemsForDB = [];

        // --- Validate each cart item before proceeding ---
        for (const item of user.cart) {
            // 1. Check if product exists and is Approved
            if (!item.productId || item.productId.status !== 'Approved') {
                req.flash('error_msg', `Item "${item.productId?.name || 'Unknown'}" is no longer available. It has been removed from your cart.`);
                console.warn(`Checkout: Removed unavailable/unapproved product ${item.productId?._id} for user ${user.email}`);
                issueFound = true;
                updateNeeded = true; // Mark DB update needed
                continue; // Skip this item
            }

            // 2. Check stock
            if (item.productId.stock < item.quantity) {
                 req.flash('error_msg', `Insufficient stock for ${item.productId.name}. Available: ${item.productId.stock}, In cart: ${item.quantity}. Please update your cart.`);
                 issueFound = true;
                 // Don't necessarily remove, just prevent checkout
            }

             // If item is valid so far, add to checkout list and calculate total
             const itemTotal = item.productId.price * item.quantity;
             subTotal += itemTotal;

            checkoutItems.push({
                productId: item.productId._id,
                name: item.productId.name,
                price: item.productId.price,
                imageUrl: item.productId.imageUrl,
                quantity: item.quantity,
                stock: item.productId.stock, // Pass stock info
                itemTotal: itemTotal
             });
            validCartItemsForDB.push({ productId: item.productId._id, quantity: item.quantity }); // Add to list for potential DB update
        }

         // If any issues were found (stock or availability), redirect back to cart
         if (issueFound) {
             // If we needed to remove items, update the DB and session
             if (updateNeeded) {
                 await User.updateOne({ _id: user._id }, { $set: { cart: validCartItemsForDB } });
                 req.session.user.cart = validCartItemsForDB;
                 await req.session.save();
             }
             return res.redirect('/user/cart');
         }

         // If all items are valid, proceed to render checkout
         const totalAmount = subTotal; // Add shipping/taxes later if needed

        res.render('user/checkout', {
            title: 'Checkout',
            userAddress: user.address, // Pass existing address
            items: checkoutItems,      // Pass validated items
            subTotal: subTotal,
            totalAmount: totalAmount,
            paymentMethod: 'COD'      // Assuming COD only for now
        });

    } catch (error) {
        next(error);
    }
};