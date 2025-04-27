// controllers/userController.js
const User = require('../models/User');
const Product = require('../models/Product');
const mongoose = require('mongoose');
const axios = require('axios');

// ===================================================
// Existing functions (getUserProfilePage, updateUserName - NO CHANGES needed)
// ===================================================
exports.getUserProfilePage = async (req, res, next) => {
    try {
        const userId = req.session.user._id;
        const user = await User.findById(userId)
                            .select('name email role address createdAt')
                            .lean();

        if (!user) {
            console.warn(`User not found in DB despite active session: ${userId}`);
            req.flash('error_msg', 'User session invalid. Please log in again.');
            return req.session.destroy(err => {
                if (err) return next(err);
                res.redirect('/auth/login');
            });
        }

        res.render('user/profile', {
            title: 'My Profile',
            user: user
        });

    } catch (error) {
        next(error);
    }
};

exports.updateUserName = async (req, res, next) => {
    const { name } = req.body;
    const userId = req.session.user._id;

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
        req.flash('error_msg', 'Please enter a valid name (at least 2 characters).');
        return res.redirect('/user/profile');
    }

    const trimmedName = name.trim();

    try {
        const user = await User.findById(userId);
        if (!user) {
            req.flash('error_msg', 'User not found. Please log in again.');
            return res.redirect('/auth/login');
        }

        user.name = trimmedName;
        await user.save();

        req.session.user.name = user.name;
        await req.session.save();

        req.flash('success_msg', 'Name updated successfully.');
        res.redirect('/user/profile');

    } catch (error) {
        if (error.name === 'ValidationError') {
            let validationErrors = Object.values(error.errors).map(el => el.message);
            req.flash('error_msg', `Validation Error: ${validationErrors.join(' ')}`);
            return res.redirect('/user/profile');
        }
        console.error("Error updating user name:", error);
        next(error);
    }
};

// ===================================================
// UPDATED saveAddress function
// ===================================================
exports.saveAddress = async (req, res, next) => {
    // Destructure locality along with other fields
    const { name, phone, pincode, locality, cityVillage, landmarkNearby, source, state, district, mandal } = req.body;
    const userId = req.session.user._id;
    const redirectPath = (source === 'profile') ? '/user/profile' : '/user/checkout';

    // --- Input Validation ---
    let errors = [];
    // Add locality check
    if (!name || !phone || !pincode || !locality || !cityVillage) {
        errors.push('Please provide Name, Phone, Pincode, select a Locality, and enter House No/Building/Area.');
    }
    if (phone && !/^\d{10,15}$/.test(phone.trim())) { errors.push('Please enter a valid phone number (10-15 digits, numbers only).'); }
    if (pincode && !/^\d{6}$/.test(pincode.trim())) { errors.push('Please enter a valid 6-digit pincode.'); }
    if (!state || !district || !mandal) { errors.push('State, District, and Mandal/Taluk could not be determined. Please verify the Pincode and try saving again.'); }
    // Check if locality is empty if state/district/mandal were determined
    if (state && (!locality || locality.trim() === '')) {
        errors.push('Please select a Locality/Post Office from the dropdown after entering the Pincode.');
    }

    if (errors.length > 0) {
         req.flash('error_msg', errors.join(' '));
        // Pass back data to repopulate form
        req.session.addressFormData = req.body; // Store temporarily
        return res.redirect(redirectPath);
    }

    // --- Save Address Logic ---
    try {
        const user = await User.findById(userId);
        if (!user) {
            req.flash('error_msg', 'User not found.');
            delete req.session.addressFormData; // Clean up session data
            return res.redirect('/auth/login');
        }

        user.address = {
            name: name.trim(),
            phone: phone.trim(),
            pincode: pincode.trim(),
            locality: locality.trim(), // Save locality
            cityVillage: cityVillage.trim(), // Save House No/Building/Area
            landmarkNearby: landmarkNearby ? landmarkNearby.trim() : undefined, // Save Landmark
            mandal: mandal?.trim() || undefined,
            district: district?.trim() || undefined,
            state: state?.trim() || undefined
        };

        await user.save();

        // --- Update Session ---
        req.session.user.address = user.address.toObject();
        await req.session.save();
        delete req.session.addressFormData; // Clean up temporary form data

        req.flash('success_msg', 'Address saved successfully.');
        res.redirect(redirectPath);

    } catch (error) {
        delete req.session.addressFormData; // Clean up session data
        if (error.name === 'ValidationError') {
            let validationErrors = Object.values(error.errors).map(el => el.message);
             if (!state || !district || !mandal || !locality) {
                validationErrors.unshift('Pincode or Locality data might be missing.');
             }
            req.flash('error_msg', `Validation Error: ${validationErrors.join(' ')}`);
            req.session.addressFormData = req.body; // Store temporarily for repopulation
            return res.redirect(redirectPath);
        }
        next(error);
    }
};

// ===================================================
// Existing Cart/Checkout functions (NO CHANGES needed)
// ===================================================
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
           const productName = item.productId?.name || '[Unknown Product]';
           const productStock = item.productId?.stock ?? 0;
           const productStatus = item.productId?.reviewStatus ?? 'unavailable';

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
                 continue;
            }
            const itemPrice = typeof item.productId.price === 'number' ? item.productId.price : 0;
            const itemTotal = itemPrice * item.quantity;
            subTotal += itemTotal;
           checkoutItems.push({
               productId: item.productId._id,
               name: productName,
               price: itemPrice,
               imageUrl: item.productId.imageUrl || '/images/placeholder.png',
               quantity: item.quantity,
               stock: productStock,
               itemTotal: itemTotal
            });
       }

        if (issuesFound) {
             if (itemsToRemoveFromCartOnRedirect.length > 0) {
                 await User.updateOne(
                     { _id: userId },
                     { $pull: { cart: { _id: { $in: itemsToRemoveFromCartOnRedirect } } } }
                 );
                 const updatedUser = await User.findById(userId).select('cart').lean();
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

// ============================================================
// *** UPDATED Pincode Lookup using api.postalpincode.in ***
// ============================================================
exports.lookupPincode = async (req, res) => {
    const pincode = req.params.pincode;
    const API_URL = `https://api.postalpincode.in/pincode/${pincode}`;

    if (!pincode || !/^\d{6}$/.test(pincode)) {
        return res.status(400).json({ success: false, message: 'Invalid Pincode format (must be 6 digits).' });
    }

    try {
        console.log(`[Pincode Lookup] Requesting data for Pincode: ${pincode}`);
        const response = await axios.get(API_URL, { timeout: 7000 });

        if (response.status !== 200) {
            console.error(`[Pincode Lookup] API request failed for ${pincode}. Status: ${response.status}`);
            return res.status(502).json({ success: false, message: `Pincode API unavailable (${response.statusText})` });
        }

        const data = response.data;

        if (!Array.isArray(data) || data.length === 0 || !data[0]) {
            console.error(`[Pincode Lookup] Unexpected API response format for ${pincode}. Data:`, JSON.stringify(data));
            return res.status(500).json({ success: false, message: 'Unexpected API response format.' });
        }

        const result = data[0];

        if (result.Status !== 'Success') {
            console.log(`[Pincode Lookup] Pincode ${pincode} not found by API. Message: ${result.Message}`);
            return res.status(404).json({ success: false, message: `Pincode not found (${result.Message || 'No records'})` });
        }

        // Check if PostOffice data exists
        if (!result.PostOffice || !Array.isArray(result.PostOffice) || result.PostOffice.length === 0) {
            console.warn(`[Pincode Lookup] Pincode ${pincode} found (Status: Success) but no PostOffice data returned.`);
            return res.json({
                success: true,
                location: {
                    pinCode: pincode,
                    mandalName: '',
                    districtName: '',
                    stateName: '',
                    localities: [] // Return empty array
                }
            });
            // OR: return res.status(404).json({ success: false, message: 'Pincode found, but no location details available.' });
        }

        // --- Extract and Map Data ---
        const postOffices = result.PostOffice;
        const firstPO = postOffices[0];

        // --- Extract list of localities ---
        const localitiesList = postOffices
            .map(po => po.Name)
            .filter(name => name && name.trim() !== '' && name.toUpperCase() !== 'NA')
            .sort(); // Optional: sort

        const uniqueLocalities = [...new Set(localitiesList)];

        const transformedLocation = {
            pinCode: firstPO.Pincode || pincode,
            mandalName: firstPO.Block && firstPO.Block !== 'NA'
                            ? firstPO.Block
                            : (firstPO.Taluk && firstPO.Taluk !== 'NA'
                                ? firstPO.Taluk
                                : firstPO.Division || ''),
            districtName: firstPO.District || '',
            stateName: firstPO.State || '',
            // --- Add localities array ---
            localities: uniqueLocalities
        };

        console.log(`[Pincode Lookup] Success for ${pincode}. Location:`, transformedLocation);
        res.json({ success: true, location: transformedLocation });

    } catch (error) {
        console.error(`[Pincode Lookup] Network/Request Error for pincode ${pincode}:`, error.message);
        let statusCode = 500;
        let message = 'Error looking up pincode information.';
        if (axios.isAxiosError(error)) {
            if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
                message = 'Pincode lookup timed out. Please try again.';
                statusCode = 504;
            } else if (error.response) {
                 message = `Pincode API error (${error.response.status}).`;
                 statusCode = 502;
            } else if (error.request) {
                message = 'Network error during pincode lookup.';
                statusCode = 502;
            }
        }
        res.status(statusCode).json({ success: false, message: message });
    }
};
// ============================================================
// End Updated Pincode Lookup
// ============================================================