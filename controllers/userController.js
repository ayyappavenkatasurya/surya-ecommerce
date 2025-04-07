// controllers/userController.js
const User = require('../models/User');
const Product = require('../models/Product');

// --- UPDATED: Get User Profile Page ---
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
            // No need to check for delivery role here anymore
        });

    } catch (error) {
        next(error);
    }
};
// --- END UPDATED FUNCTION ---

// --- saveAddress remains the same, source logic is still useful ---
exports.saveAddress = async (req, res, next) => {
    const { name, phone, pincode, cityVillage, landmarkNearby, source } = req.body;
    const userId = req.session.user._id;

    const redirectPath = (source === 'profile') ? '/user/profile' : '/user/checkout';

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
        req.session.user.address = user.address;
        await req.session.save();
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

// --- Existing Cart functions remain the same ---
exports.getCart = async (req, res, next) => {
    try {
        const user = await User.findById(req.session.user._id)
                                    .populate('cart.productId')
                                    .lean();

        if (!user) {
           req.flash('error_msg', 'User not found.');
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
                _id: item._id,
                productId: item.productId._id,
                name: item.productId.name,
                price: item.productId.price,
                imageUrl: item.productId.imageUrl,
                stock: item.productId.stock,
                quantity: item.quantity,
                subtotal: itemSubtotal
            };
         }).filter(item => item !== null); // Filter out null items

         // Update session cart
         req.session.user.cart = user.cart.filter(item => item.productId);

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

        if (!productId || isNaN(numQuantity) || numQuantity < 1) {
           req.flash('error_msg', 'Invalid product or quantity.');
           return res.redirect(req.headers.referer && req.headers.referer.includes('/products/') ? req.headers.referer : '/');
       }

      try {
          const product = await Product.findById(productId);
          const user = await User.findById(userId);

          if (!user) {
              req.flash('error_msg', 'User session error. Please log in again.');
              return res.redirect('/auth/login');
          }
          if (!product) {
              req.flash('error_msg', 'Product not found.');
              return res.redirect(req.headers.referer && req.headers.referer.includes('/products/') ? req.headers.referer : '/');
          }

         if (product.stock < numQuantity) {
              req.flash('error_msg', `Insufficient stock for ${product.name}. Only ${product.stock} available.`);
              return res.redirect(`/products/${productId}`);
          }

         const existingCartItemIndex = user.cart.findIndex(item => item.productId.toString() === productId.toString());

         if (existingCartItemIndex > -1) {
             const existingQuantity = user.cart[existingCartItemIndex].quantity;
             const newQuantity = existingQuantity + numQuantity;
              if (product.stock < newQuantity) {
                 req.flash('error_msg', `Cannot add ${numQuantity} more ${product.name}. Only ${product.stock} available in total, you have ${existingQuantity} in cart.`);
                  return res.redirect(`/products/${productId}`);
             }
              user.cart[existingCartItemIndex].quantity = newQuantity;
         } else {
             user.cart.push({ productId, quantity: numQuantity });
         }

          await user.save();

         req.session.user.cart = user.cart;
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
          next(error);
      }
};

exports.updateCartQuantity = async (req, res, next) => {
         const { productId, quantity } = req.body;
         const userId = req.session.user._id;
        const numQuantity = parseInt(quantity, 10);

          if (!productId || isNaN(numQuantity) || numQuantity < 0) { // Allow 0 for removal
              return res.status(400).json({ success: false, message: 'Invalid product ID or quantity.' });
         }

        try {
            const user = await User.findById(userId);
             const product = await Product.findById(productId).select('stock price');

             if (!user || !product) {
                return res.status(404).json({ success: false, message: 'User or Product not found.' });
             }

             const cartItemIndex = user.cart.findIndex(item => item.productId.toString() === productId.toString());

            if (cartItemIndex === -1 && numQuantity > 0) {
                return res.status(404).json({ success: false, message: 'Item not found in cart.' });
            }

             let itemSubtotal = 0;

             if (numQuantity === 0) {
                 if(cartItemIndex > -1){
                     user.cart.splice(cartItemIndex, 1);
                 }
             } else {
                if (product.stock < numQuantity) {
                   return res.status(400).json({ success: false, message: `Insufficient stock. Only ${product.stock} available.` });
                 }
                 if(cartItemIndex > -1){
                     user.cart[cartItemIndex].quantity = numQuantity;
                 } else {
                     user.cart.push({ productId, quantity: numQuantity });
                 }
                 itemSubtotal = (product.price * numQuantity);
            }

            await user.save();

            req.session.user.cart = user.cart;

            const updatedUserPopulated = await User.findById(userId).populate('cart.productId', 'price').lean();
             let cartTotal = 0;
             updatedUserPopulated.cart.forEach(item => {
                if(item.productId){
                    cartTotal += (item.productId.price * item.quantity);
                }
             });

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

        if (!productId) {
           req.flash('error_msg', 'Product ID is required.');
           return res.redirect('/user/cart');
         }

        try {
            const user = await User.findById(userId);
             if (!user) {
                 req.flash('error_msg', 'User not found.');
                return res.redirect('/auth/login');
            }

             const initialCartLength = user.cart.length;
            user.cart = user.cart.filter(item => item.productId.toString() !== productId.toString());

             if(user.cart.length === initialCartLength){
                req.flash('error_msg', 'Item not found in cart.');
                return res.redirect('/user/cart');
             }

            await user.save();

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

exports.getCheckoutPage = async (req, res, next) => {
     try {
        const user = await User.findById(req.session.user._id)
                               .populate('cart.productId')
                               .lean();

        if (!user || !user.cart || user.cart.length === 0) {
            req.flash('error_msg', 'Your cart is empty or user session is invalid.');
            return res.redirect('/user/cart');
        }

        let subTotal = 0;
         let checkoutItems = [];
         let insufficientStock = false;

        for (const item of user.cart) {
            if (!item.productId) {
                console.warn(`Invalid product reference in cart for user ${user.email}, item: ${item._id}`);
                continue;
            }
             if(item.productId.stock < item.quantity){
                 insufficientStock = true;
                req.flash('error_msg', `Insufficient stock for ${item.productId.name}. Available: ${item.productId.stock}, In cart: ${item.quantity}. Please update your cart.`);
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

         if (insufficientStock) {
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