// controllers/userController.js
const User = require('../models/User');
const Product = require('../models/Product');
const mongoose = require('mongoose'); // Import mongoose for ID validation

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

exports.saveAddress = async (req, res, next) => {
    const { name, phone, pincode, cityVillage, landmarkNearby, source } = req.body;
    const userId = req.session.user._id;

    // Determine redirect path based on where the form was submitted from
    const redirectPath = (source === 'profile') ? '/user/profile' : '/user/checkout';

    // --- Input Validation ---
    let errors = [];
    if (!name || !phone || !pincode || !cityVillage) {
        errors.push('Please provide Name, Phone, Pincode, and City/Village.');
    }
    // Validate phone format (10-15 digits)
    if (phone && !/^\d{10,15}$/.test(phone.trim())) {
        errors.push('Please enter a valid phone number (10-15 digits, numbers only).');
    }
    // Validate pincode format (6 digits)
     if (pincode && !/^\d{6}$/.test(pincode.trim())) {
        errors.push('Please enter a valid 6-digit pincode.');
    }
    if (errors.length > 0) {
         req.flash('error_msg', errors.join(' '));
        return res.redirect(redirectPath); // Redirect back to the form page
    }

    // --- Save Address Logic ---
    try {
        // Find user by ID (not lean, need to save)
        const user = await User.findById(userId);
        if (!user) {
            // Should be caught by auth middleware, but good to check
            req.flash('error_msg', 'User not found.');
            return res.redirect('/auth/login');
        }
        // Update or create address sub-document
        user.address = {
            name: name.trim(),
            phone: phone.trim(),
            pincode: pincode.trim(),
            cityVillage: cityVillage.trim(),
            landmarkNearby: landmarkNearby ? landmarkNearby.trim() : undefined // Store as undefined if empty
        };
        // Save the user document (this will trigger Mongoose validation if any on AddressSchema)
        await user.save();

        // --- Update Session ---
        // Ensure session reflects the saved address
        req.session.user.address = user.address.toObject(); // Convert Mongoose sub-doc to plain object for session
        await req.session.save(); // Wait for session save to complete

        req.flash('success_msg', 'Address saved successfully.');
        res.redirect(redirectPath); // Redirect to the appropriate page

    } catch (error) {
        // Handle Mongoose validation errors specifically
        if (error.name === 'ValidationError') {
            let validationErrors = Object.values(error.errors).map(el => el.message);
            req.flash('error_msg', `Validation Error: ${validationErrors.join(' ')}`);
            return res.redirect(redirectPath);
        }
        // Pass other errors to the central handler
        next(error);
    }
};

exports.getCart = async (req, res, next) => {
    try {
        const userId = req.session.user._id;
        const user = await User.findById(userId)
                                    // Populate products in cart - select fields needed for display & calculation
                                    .populate('cart.productId', 'name price imageUrl stock _id reviewStatus')
                                    .lean(); // Use lean for reading

        if (!user) {
           // Should be caught by auth middleware
           console.warn(`User not found in getCart despite session: ${userId}`);
           req.flash('error_msg', 'User not found.');
           return req.session.destroy(err => {
                if(err) return next(err);
                res.redirect('/auth/login');
           });
         }

        let cartTotal = 0;
        let populatedCart = [];
        let cartUpdated = false; // Flag to check if session cart needs updating

        if (user.cart && user.cart.length > 0) {
             populatedCart = user.cart.map(item => {
                 // Check if product was populated and is approved
                 if (!item.productId || !item.productId._id) {
                     console.warn(`Cart item ${item._id} refers to a non-existent product ID for user: ${user.email}. Will filter.`);
                     cartUpdated = true; // Mark that session cart needs update
                     return null; // Filter this item out
                 }
                 // *** Check if product is approved - remove if not ***
                 if (item.productId.reviewStatus !== 'approved') {
                      console.warn(`Product ${item.productId.name} (${item.productId._id}) in cart is not approved. Will filter.`);
                      cartUpdated = true;
                      return null; // Filter this out
                 }

                // Calculate subtotal if valid
                const itemSubtotal = item.productId.price * item.quantity;
                cartTotal += itemSubtotal;

                return {
                    // Cart Item ID itself, useful for forms? Not really needed for display.
                    // _id: item._id,
                    productId: item.productId._id, // Use product's ID
                    name: item.productId.name,
                    price: item.productId.price,
                    imageUrl: item.productId.imageUrl,
                    stock: item.productId.stock,
                    quantity: item.quantity,
                    subtotal: itemSubtotal
                };
             }).filter(item => item !== null); // Remove null entries

            // If items were filtered out, update the session cart
             if (cartUpdated) {
                 const validCartItems = populatedCart.map(item => ({ productId: item.productId, quantity: item.quantity }));
                 req.session.user.cart = validCartItems;
                 // No need to save user DB here, just update session representation
                 // Let user manually remove or proceed to checkout where it gets filtered again.
                  // TODO: Consider triggering an async background task to clean DB cart? Or wait for next cart action?
                  console.log(`Session cart updated for user ${user.email} due to invalid/unapproved items found.`);
             }
         } // End if user.cart


        res.render('user/cart', {
          title: 'Your Shopping Cart',
          cart: populatedCart,
          cartTotal: cartTotal
          // currentUser is available via res.locals
        });
      } catch (error) {
        next(error); // Pass errors to central handler
      }
};

// --- UPDATE addToCart (Check Approval) ---
exports.addToCart = async (req, res, next) => {
    const { productId, quantity = 1 } = req.body;
    const userId = req.session.user._id;
    const numQuantity = parseInt(quantity, 10);

     // Validate Product ID and Quantity
     if (!productId || !mongoose.Types.ObjectId.isValid(productId) || isNaN(numQuantity) || numQuantity < 1) {
         req.flash('error_msg', 'Invalid product or quantity.');
         return res.redirect(req.headers.referer || '/'); // Redirect back
     }

    try {
        // Find user and product concurrently
        const [user, product] = await Promise.all([
            User.findById(userId),
            // Fetch product including reviewStatus and stock
            Product.findById(productId).select('name stock reviewStatus') // Minimal fields needed
        ]);

        // Handle User/Product Not Found
        if (!user) {
            req.flash('error_msg', 'User session error. Please log in again.');
            return res.redirect('/auth/login');
        }
        if (!product) {
            req.flash('error_msg', 'Product not found.');
            return res.redirect(req.headers.referer || '/');
        }

        // *** NEW CHECK: Only allow adding approved products ***
        if (product.reviewStatus !== 'approved') {
             req.flash('error_msg', `Sorry, "${product.name}" is currently unavailable.`);
             return res.redirect(req.headers.referer || '/'); // Redirect back
        }

       // Check stock (before potentially adding more)
       if (product.stock <= 0) { // Explicitly check for 0 stock too
            req.flash('error_msg', `${product.name} is currently out of stock.`);
            return res.redirect(req.headers.referer || '/');
        }

       // Find existing cart item index
       const existingCartItemIndex = user.cart.findIndex(item => item.productId.toString() === productId.toString());

       if (existingCartItemIndex > -1) {
           // Update existing item quantity
           const existingQuantity = user.cart[existingCartItemIndex].quantity;
           const newQuantity = existingQuantity + numQuantity;
           // Check combined stock
            if (product.stock < newQuantity) {
               req.flash('error_msg', `Cannot add ${numQuantity} more ${product.name}. Only ${product.stock} available in total (you have ${existingQuantity} in cart).`);
                return res.redirect(req.headers.referer?.includes(`/products/${productId}`) ? `/products/${productId}` : '/');
           }
            user.cart[existingCartItemIndex].quantity = newQuantity;
       } else {
           // Add new item - check stock for the requested quantity first
           if (product.stock < numQuantity) {
               req.flash('error_msg', `Insufficient stock for ${product.name}. Only ${product.stock} available.`);
                return res.redirect(req.headers.referer?.includes(`/products/${productId}`) ? `/products/${productId}` : '/');
           }
           user.cart.push({ productId, quantity: numQuantity });
       }

        await user.save(); // Save the updated user cart to DB

       // Update session cart reliably after saving DB
       req.session.user.cart = user.cart.map(item => ({ productId: item.productId, quantity: item.quantity })); // Use simplified format
       await req.session.save(); // Wait for session to save

        req.flash('success_msg', `${product.name} added to cart!`);

       // Redirect based on query parameter or default to cart
        if(req.query.redirectTo === 'checkout') {
           return res.redirect('/user/checkout');
       }
        res.redirect('/user/cart');

    } catch (error) {
         if (error.name === 'CastError') { // Handle potential ID format error during findById
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

         // Validation
         if (!productId || !mongoose.Types.ObjectId.isValid(productId) || isNaN(numQuantity) || numQuantity < 0) {
              return res.status(400).json({ success: false, message: 'Invalid product ID or quantity.' });
         }

        try {
            // Fetch user and product simultaneously
            const [user, product] = await Promise.all([
                 User.findById(userId), // Find user to modify cart
                 // Fetch product to check stock and price (minimal fields)
                 Product.findById(productId).select('stock price reviewStatus name')
            ]);

            if (!user) { // Should not happen if authenticated
               return res.status(404).json({ success: false, message: 'User not found.' });
            }
            if (!product) {
               return res.status(404).json({ success: false, message: 'Product not found.' });
            }

            // *** Check if product is approved ***
            if (product.reviewStatus !== 'approved') {
                // If product isn't approved anymore, remove it from cart via this update
                const itemIndexToRemove = user.cart.findIndex(item => item.productId.toString() === productId.toString());
                if (itemIndexToRemove > -1) {
                    user.cart.splice(itemIndexToRemove, 1); // Remove from user cart array
                    await user.save(); // Save the user
                    req.session.user.cart = user.cart.map(i => ({ productId: i.productId, quantity: i.quantity })); // Update session
                    await req.session.save();
                }
                return res.status(400).json({ success: false, message: `Product "${product.name}" is unavailable and has been removed.`, removal: true }); // Indicate removal
            }

            // Find the cart item
            const cartItemIndex = user.cart.findIndex(item => item.productId.toString() === productId.toString());

           // Handle removing the item (quantity = 0)
            if (numQuantity === 0) {
                if (cartItemIndex > -1) {
                    user.cart.splice(cartItemIndex, 1); // Remove item from array
                }
                // If item wasn't found, do nothing for quantity 0
            }
            // Handle updating or adding the item
            else {
                // Check stock for the NEW quantity
               if (product.stock < numQuantity) {
                   // Respond with error, don't change cart
                  return res.status(400).json({ success: false, message: `Insufficient stock for ${product.name}. Only ${product.stock} available.` });
                 }
                // Update existing item or add if it wasn't in cart (shouldn't happen for update > 0?)
                if (cartItemIndex > -1) {
                    user.cart[cartItemIndex].quantity = numQuantity;
                } else {
                    // Add item if trying to update a non-existent item to > 0? Or return error? Let's add.
                    user.cart.push({ productId, quantity: numQuantity });
                 }
            }

            // Save user cart changes to DB
            await user.save();

            // Update session cart
            req.session.user.cart = user.cart.map(item => ({ productId: item.productId, quantity: item.quantity }));

            // --- Recalculate cart total AFTER updating DB cart ---
            // Refetch user with populated cart for accurate total OR calculate manually from current cart
            let cartTotal = 0;
            let itemSubtotal = 0;
            // Use the updated user.cart array for calculation
             for (const item of user.cart) {
                 // Need product price. Could fetch all prices again, or use stored price if reliable?
                 // Fetching price again is safer.
                 const relatedProduct = await Product.findById(item.productId).select('price').lean(); // Fetch price minimally
                 if (relatedProduct) {
                    const currentItemSubtotal = relatedProduct.price * item.quantity;
                    cartTotal += currentItemSubtotal;
                    // Set subtotal for the item being updated
                    if (item.productId.toString() === productId.toString()) {
                         itemSubtotal = currentItemSubtotal;
                     }
                 }
            }


             await req.session.save(); // Save session with updated cart array

            // Send JSON response
            res.json({
                 success: true,
                 message: 'Cart updated successfully.',
                 // Provide updated quantity (might be 0 if removed)
                 newQuantity: user.cart.find(item => item.productId.toString() === productId.toString())?.quantity ?? 0,
                 itemSubtotal: itemSubtotal,
                 cartTotal: cartTotal,
                 itemId: productId // Send back item ID for frontend reference
             });

        } catch (error) {
            console.error("Cart Update Error:", error);
            res.status(500).json({ success: false, message: 'Error updating cart quantity.' });
        }
};

exports.removeFromCart = async (req, res, next) => {
    const { productId } = req.params;
    const userId = req.session.user._id;

    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) { // Validate ID format
       req.flash('error_msg', 'Invalid Product ID.');
       return res.redirect('/user/cart');
     }

    try {
        // Use findOneAndUpdate to pull the item directly from DB cart
        const user = await User.findOneAndUpdate(
            { _id: userId }, // Find the user
            { $pull: { cart: { productId: productId } } }, // Pull item matching productId
            { new: true } // Return the updated user document
        );

         if (!user) { // Should not happen if authenticated
             req.flash('error_msg', 'User not found.');
            return res.redirect('/auth/login');
         }

         // Check if item was actually removed (might have already been gone)
         // This requires comparing cart before/after, findOneAndUpdate doesn't easily tell if $pull removed something.
         // Alternative: Find user, filter cart manually, save user. Less atomic but gives more info.

         // Let's stick with atomic $pull and assume it worked if no error.

         // Update session cart
         req.session.user.cart = user.cart.map(item => ({ productId: item.productId, quantity: item.quantity }));
         await req.session.save(); // Save updated session

         req.flash('success_msg', 'Item removed from cart.');
         res.redirect('/user/cart'); // Redirect back to cart

    } catch (error) {
       console.error("Remove From Cart Error:", error);
       next(error); // Pass to central error handler
    }
};

// --- UPDATE getCheckoutPage (Check Approval and Stock) ---
exports.getCheckoutPage = async (req, res, next) => {
    try {
       const userId = req.session.user._id;
       const user = await User.findById(userId)
                              // Populate product fields needed for checkout validation & display
                              .populate('cart.productId', 'name price imageUrl stock reviewStatus sellerId _id')
                              .lean(); // Use lean for read-only

       // Basic checks
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
        let issueMessages = []; // Collect all issues

       // --- Validate items for checkout ---
       for (const item of user.cart) {
           if (!item.productId || !item.productId._id) {
               issueMessages.push('An invalid item reference was detected.');
               issuesFound = true;
               continue; // Skip processing this item
           }

           // *** CHECK: Product Approval Status ***
            if(item.productId.reviewStatus !== 'approved'){
                issueMessages.push(`"${item.productId.name}" is unavailable.`);
                issuesFound = true;
                continue; // Skip this item
            }

            // *** CHECK: Stock Availability ***
            if(item.productId.stock < item.quantity){
                issueMessages.push(`Insufficient stock for "${item.productId.name}" (Only ${item.productId.stock} left).`);
                issuesFound = true;
                // Don't break here, collect all messages first
                 continue; // Skip adding to checkout list if stock issue
            }

            // If all checks pass, add to checkout summary
            const itemTotal = item.productId.price * item.quantity;
            subTotal += itemTotal;

           checkoutItems.push({
               productId: item.productId._id,
               name: item.productId.name,
               price: item.productId.price,
               imageUrl: item.productId.imageUrl,
               quantity: item.quantity,
               stock: item.productId.stock, // Pass stock for display if needed
               itemTotal: itemTotal
               // sellerId: item.productId.sellerId // Pass if needed
            });
       } // End loop

        // If any validation issues were found, redirect to cart with messages
        if (issuesFound) {
            // Optionally: Trigger removal of problematic items from user's DB cart here
            // await User.updateOne(...)
             req.flash('error_msg', "Please resolve the following issues in your cart: " + issueMessages.join(' '));
             return res.redirect('/user/cart');
        }

        // Proceed to render checkout page if cart is valid
        const totalAmount = subTotal; // Apply shipping costs if any

       res.render('user/checkout', {
           title: 'Checkout',
           userAddress: user.address,    // Pass user's address
           items: checkoutItems,        // Pass validated items
           subTotal: subTotal,
           totalAmount: totalAmount,
           paymentMethod: 'COD'         // Default payment method
       });

   } catch (error) {
       next(error); // Pass errors to handler
   }
};