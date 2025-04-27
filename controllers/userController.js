// controllers/userController.js
const User = require('../models/User');
const Product = require('../models/Product');
const mongoose = require('mongoose');
// *** REMOVE OLD LIBRARY REQUIRE (if it existed) ***
// const pincodeSearch = require('india-pincode-search'); // Remove this line

// *** ADD AXIOS REQUIRE ***
const axios = require('axios');

// ===================================================
// Existing functions (NO CHANGES needed in these)
// ===================================================

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
    // Note: This function relies on hidden inputs being populated by the JS lookup
    const { name, phone, pincode, cityVillage, landmarkNearby, source, state, district, mandal } = req.body;
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
     // Check if derived fields are present AFTER pincode lookup was expected
     if (!state || !district || !mandal) {
        errors.push('State, District, and Mandal/Taluk could not be determined. Please verify the Pincode and try saving again.');
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

        user.address = {
            name: name.trim(),
            phone: phone.trim(),
            pincode: pincode.trim(),
            cityVillage: cityVillage.trim(),
            landmarkNearby: landmarkNearby ? landmarkNearby.trim() : undefined,
            // Use hidden input values that should be populated by JS/API lookup
            mandal: mandal?.trim() || undefined,
            district: district?.trim() || undefined,
            state: state?.trim() || undefined
        };

        await user.save();

        // --- Update Session ---
        req.session.user.address = user.address.toObject();
        await req.session.save();

        req.flash('success_msg', 'Address saved successfully.');
        res.redirect(redirectPath);

    } catch (error) {
        if (error.name === 'ValidationError') {
            let validationErrors = Object.values(error.errors).map(el => el.message);
             if (!state || !district || !mandal) {
                validationErrors.unshift('Pincode data (State/District/Mandal) might be missing.');
             }
            req.flash('error_msg', `Validation Error: ${validationErrors.join(' ')}`);
            // Re-rendering with old data is complex here due to redirect path and potential checkout state.
            // Redirecting is simpler, though loses input values on validation fail.
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
                 await req.session.save(); // Save updated session cart
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
                     // Avoid adding if quantity > stock during direct update
                    if (product.stock >= numQuantity) {
                       user.cart.push({ productId, quantity: numQuantity });
                    } else {
                         return res.status(400).json({ success: false, message: `Insufficient stock for ${product.name}. Only ${product.stock} available.` });
                    }
                 }
            }

            await user.save();
            // Refresh session data after save
            req.session.user.cart = user.cart.map(item => ({ productId: item.productId, quantity: item.quantity }));

            let cartTotal = 0;
            let itemSubtotal = 0;
             // Repopulate with prices after save
            const updatedUser = await User.findById(userId).populate('cart.productId', 'price').lean();

             for (const item of updatedUser.cart) {
                 if (item.productId && typeof item.productId.price === 'number') {
                    const currentItemSubtotal = item.productId.price * item.quantity;
                    cartTotal += currentItemSubtotal;
                    if (item.productId._id.toString() === productId.toString()) {
                         itemSubtotal = currentItemSubtotal;
                     }
                 }
            }
             await req.session.save(); // Save the potentially updated cart count/total info

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
        // Fetch user to get the current cart before update
        const userBeforeUpdate = await User.findById(userId).lean();
        const initialCartLength = userBeforeUpdate ? userBeforeUpdate.cart.length : 0;

        const user = await User.findOneAndUpdate(
            { _id: userId },
            { $pull: { cart: { productId: productId } } },
            { new: true } // Return updated document
        );

         if (!user) {
             req.flash('error_msg', 'User not found.');
            return res.redirect('/auth/login');
         }

         // Update session cart
         req.session.user.cart = user.cart.map(item => ({ productId: item.productId, quantity: item.quantity }));
         await req.session.save();

         // Check if an item was actually removed
         if (user.cart.length < initialCartLength) {
             req.flash('success_msg', 'Item removed from cart.');
         } else {
              req.flash('info_msg', 'Item not found in cart.'); // Or no message
         }
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
        let itemsToRemoveFromCartOnRedirect = []; // Track items to remove

       for (const item of user.cart) {
            // Safely access potentially missing productId
           const productName = item.productId?.name || '[Unknown Product]';
           const productStock = item.productId?.stock ?? 0; // Default stock to 0 if product missing
           const productStatus = item.productId?.reviewStatus ?? 'unavailable'; // Default status

           if (!item.productId || !item.productId._id) {
               issueMessages.push(`An invalid item was detected in your cart.`);
               issuesFound = true;
               itemsToRemoveFromCartOnRedirect.push(item._id);
               continue;
           }
            if(productStatus !== 'approved'){
                issueMessages.push(`"${productName}" is currently unavailable.`);
                issuesFound = true;
                itemsToRemoveFromCartOnRedirect.push(item._id);
                continue;
            }
            if(productStock < item.quantity){
                issueMessages.push(`Insufficient stock for "${productName}" (Only ${productStock} left).`);
                issuesFound = true;
                 continue; // Let user fix quantity in cart page
            }
            // Use price from populated product, check if it's a valid number
            const itemPrice = typeof item.productId.price === 'number' ? item.productId.price : 0;
            const itemTotal = itemPrice * item.quantity;
            subTotal += itemTotal;
           checkoutItems.push({
               productId: item.productId._id,
               name: productName,
               price: itemPrice,
               imageUrl: item.productId.imageUrl || '/images/placeholder.png', // Fallback image
               quantity: item.quantity,
               stock: productStock,
               itemTotal: itemTotal
            });
       }

        if (issuesFound) {
             // Remove specific problematic items if identified
             if (itemsToRemoveFromCartOnRedirect.length > 0) {
                 await User.updateOne(
                     { _id: userId },
                     { $pull: { cart: { _id: { $in: itemsToRemoveFromCartOnRedirect } } } }
                 );
                 const updatedUser = await User.findById(userId).select('cart').lean(); // Re-fetch lean cart
                 req.session.user.cart = updatedUser ? updatedUser.cart.map(i => ({ productId: i.productId, quantity: i.quantity })) : [];
                 await req.session.save();
                 issueMessages.push('Problematic items have been removed.');
             }
             req.flash('error_msg', "Please resolve the following issues in your cart: " + issueMessages.join(' '));
             return res.redirect('/user/cart');
        }

        const totalAmount = subTotal;

       res.render('user/checkout', {
           title: 'Checkout',
           userAddress: user.address, // Already lean
           items: checkoutItems,
           subTotal: subTotal,
           totalAmount: totalAmount,
           paymentMethod: 'COD'
       });

   } catch (error) {
       next(error);
   }
};

// ============================================================
// *** UPDATED Pincode Lookup using api.postalpincode.in ***
// ============================================================
exports.lookupPincode = async (req, res) => { // Marked async
    const pincode = req.params.pincode;
    const API_URL = `https://api.postalpincode.in/pincode/${pincode}`;

    // Validate Pincode Format
    if (!pincode || !/^\d{6}$/.test(pincode)) {
        return res.status(400).json({ success: false, message: 'Invalid Pincode format (must be 6 digits).' });
    }

    try {
        console.log(`[Pincode Lookup] Requesting data for Pincode: ${pincode}`);

        // Make the API Request using Axios
        const response = await axios.get(API_URL, {
            timeout: 7000 // Set a timeout (e.g., 7 seconds)
        });

        // --- Check HTTP Status Code ---
        if (response.status !== 200) {
             console.error(`[Pincode Lookup] API request failed for ${pincode}. Status: ${response.status}`);
             // Return a generic error for non-200 status codes
             return res.status(502).json({ success: false, message: `Pincode API unavailable (${response.statusText})` });
        }

        const data = response.data;

        // --- Validate API Response Structure ---
        // The API returns an array, usually with one element [{ Status: '...', PostOffice: [...] }]
        if (!Array.isArray(data) || data.length === 0 || !data[0]) {
            console.error(`[Pincode Lookup] Unexpected API response format for ${pincode}. Data:`, JSON.stringify(data));
            return res.status(500).json({ success: false, message: 'Unexpected API response format.' });
        }

        const result = data[0];

        // --- Check API Status Message ---
        if (result.Status !== 'Success') {
            console.log(`[Pincode Lookup] Pincode ${pincode} not found by API. Message: ${result.Message}`);
            // Use 404 specifically for "not found" type errors from the API
            return res.status(404).json({ success: false, message: `Pincode not found (${result.Message || 'No records'})` });
        }

        // Check if PostOffice data exists
        if (!result.PostOffice || !Array.isArray(result.PostOffice) || result.PostOffice.length === 0) {
            console.warn(`[Pincode Lookup] Pincode ${pincode} found (Status: Success) but no PostOffice data returned.`);
            return res.status(404).json({ success: false, message: 'Pincode found, but no location details available.' });
        }

        // --- Extract and Map Data ---
        // We typically use the first Post Office listed for simplicity
        const locationData = result.PostOffice[0];

        // Map the fields from the API response to the names the frontend JavaScript expects
        const transformedLocation = {
            pinCode: locationData.Pincode || pincode, // Use original if missing
            locality: locationData.Name || '',        // Main locality name (Post Office Name)
            // Combine Block/Taluk/Division as 'Mandal' - prioritize Block
            mandalName: locationData.Block && locationData.Block !== 'NA'
                            ? locationData.Block
                            : (locationData.Taluk && locationData.Taluk !== 'NA'
                                ? locationData.Taluk
                                : locationData.Division || ''),
            districtName: locationData.District || '',   // District name
            stateName: locationData.State || '',         // State name
            postOfficeName: locationData.Name || '',     // Re-use PO Name for clarity
        };

        console.log(`[Pincode Lookup] Success for ${pincode}. Location:`, transformedLocation);
        // Send the transformed data back to the frontend
        res.json({ success: true, location: transformedLocation });

    } catch (error) {
        console.error(`[Pincode Lookup] Network/Request Error for pincode ${pincode}:`, error.message);

        let statusCode = 500;
        let message = 'Error looking up pincode information.';

        // Handle Axios-specific errors
        if (axios.isAxiosError(error)) {
            if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
                message = 'Pincode lookup timed out. Please try again.';
                statusCode = 504; // Gateway Timeout
            } else if (error.response) {
                 // This case is less likely here since we check status 200 above,
                 // but good practice for other Axios uses.
                 message = `Pincode API error (${error.response.status}).`;
                 statusCode = 502; // Bad Gateway if API itself errored significantly
            } else if (error.request) {
                // Request made but no response received (network issue)
                message = 'Network error during pincode lookup.';
                statusCode = 502; // Bad Gateway
            }
        }

        // Return the error response
        res.status(statusCode).json({ success: false, message: message });
    }
};