const User = require('../models/User');
const Product = require('../models/Product');

exports.getCart = async (req, res, next) => {
  try {
    const user = await User.findById(req.session.user._id)
                                .populate('cart.productId')
                                .lean();

    if (!user) {
       req.flash('error_msg', 'User not found.');
       req.session.destroy();
       return res.redirect('/auth/login');
     }

    let cartTotal = 0;
    const populatedCart = user.cart.map(item => {
         if (!item.productId) {
             console.warn(`Cart item refers to a non-existent product ID: ${item._id} for user: ${user.email}`);
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

     req.session.user.cart = user.cart;

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
       return res.redirect(req.headers.referer || `/products/${productId || ''}`);
   }

  try {
      const product = await Product.findById(productId);
      const user = await User.findById(userId);

      if (!product) {
          req.flash('error_msg', 'Product not found.');
          return res.redirect(req.headers.referer || '/');
      }

     if (product.stock < numQuantity) {
          req.flash('error_msg', `Insufficient stock. Only ${product.stock} available.`);
          return res.redirect(req.headers.referer || `/products/${productId}`);
      }

     const existingCartItemIndex = user.cart.findIndex(item => item.productId.toString() === productId.toString());

     if (existingCartItemIndex > -1) {
         const newQuantity = user.cart[existingCartItemIndex].quantity + numQuantity;
          if (product.stock < newQuantity) {
             req.flash('error_msg', `Cannot add ${numQuantity}. Only ${product.stock} available in total, you have ${user.cart[existingCartItemIndex].quantity} in cart.`);
              return res.redirect(req.headers.referer || `/products/${productId}`);
         }
          user.cart[existingCartItemIndex].quantity = newQuantity;
     } else {
         user.cart.push({ productId, quantity: numQuantity });
     }

      await user.save();

     req.session.user.cart = user.cart;
     await req.session.save();


      req.flash('success_msg', `${product.name} added to cart!`);
       // Handle redirection based on potential query parameter from 'Buy Now'
       if(req.query.redirectTo === 'checkout') {
          return res.redirect('/user/checkout');
      }
      res.redirect(req.headers.referer || '/cart');

  } catch (error) {
       if (error.name === 'CastError') {
          req.flash('error_msg', 'Invalid product ID format.');
           return res.redirect(req.headers.referer || '/');
        }
      next(error);
  }
};

 exports.updateCartQuantity = async (req, res, next) => {
     const { productId, quantity } = req.body;
     const userId = req.session.user._id;
    const numQuantity = parseInt(quantity, 10);


      if (!productId || isNaN(numQuantity) || numQuantity < 0) {
          return res.status(400).json({ success: false, message: 'Invalid product ID or quantity.' });
     }

    try {
        const user = await User.findById(userId);
         const product = await Product.findById(productId);


         if (!user || !product) {
            return res.status(404).json({ success: false, message: 'User or Product not found.' });
         }

         const cartItemIndex = user.cart.findIndex(item => item.productId.toString() === productId.toString());

        if (cartItemIndex === -1) {
            return res.status(404).json({ success: false, message: 'Item not found in cart.' });
        }

         if (numQuantity === 0) {
            user.cart.splice(cartItemIndex, 1);
         } else {
            if (product.stock < numQuantity) {
               return res.status(400).json({ success: false, message: `Insufficient stock. Only ${product.stock} available.` });
             }
            user.cart[cartItemIndex].quantity = numQuantity;
        }

        await user.save();

        req.session.user.cart = user.cart;

         const updatedUser = await User.findById(userId).populate('cart.productId').lean();
         let cartTotal = 0;
         const populatedCart = updatedUser.cart.map(item => {
            if(!item.productId) return null;
            const itemSubtotal = item.productId.price * item.quantity;
             cartTotal += itemSubtotal;
             return { ...item, subtotal: itemSubtotal };
         }).filter(Boolean);

         const itemSubtotal = (product.price * numQuantity);

         await req.session.save();

        res.json({
             success: true,
             message: 'Cart updated successfully.',
            newQuantity: numQuantity > 0 ? user.cart.find(item => item.productId.toString() === productId.toString())?.quantity : 0,
             itemSubtotal: numQuantity === 0 ? 0 : itemSubtotal,
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
       return res.redirect('/cart');
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
             return res.redirect('/cart');
         }

        await user.save();

         req.session.user.cart = user.cart;
         await req.session.save();


         req.flash('success_msg', 'Item removed from cart.');
         res.redirect('/cart');

    } catch (error) {
       if (error.name === 'CastError') {
          req.flash('error_msg', 'Invalid product ID format.');
           return res.redirect('/cart');
       }
        next(error);
    }
};

 exports.saveAddress = async (req, res, next) => {
     const { name, phone, pincode, cityVillage, landmarkNearby } = req.body;
     const userId = req.session.user._id;

     if (!name || !phone || !pincode || !cityVillage) {
         req.flash('error_msg', 'Please provide Name, Phone, Pincode, and City/Village.');
         return res.redirect(req.headers.referer || '/user/checkout');
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
         res.redirect(req.headers.referer || '/user/checkout');

    } catch (error) {
        if (error.name === 'ValidationError') {
            let errors = Object.values(error.errors).map(el => el.message);
            req.flash('error_msg', errors.join(' '));
            return res.redirect(req.headers.referer || '/user/checkout');
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
            req.flash('error_msg', 'Your cart is empty or user not found.');
            return res.redirect('/cart');
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
                req.flash('error_msg', `Insufficient stock for ${item.productId.name}. Available: ${item.productId.stock}, In cart: ${item.quantity}. Please update cart.`);
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
             return res.redirect('/cart');
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


