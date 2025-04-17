// controllers/sellerController.js
const Product = require('../models/Product');
const Order = require('../models/Order');
const User = require('../models/User');
const mongoose = require('mongoose');
const { sendEmail } = require('../config/mailer'); // For notifications if needed


// --- Seller Dashboard ---
exports.getSellerDashboard = (req, res) => {
    // Can add stats later (e.g., pending products, orders count)
    res.render('seller/dashboard', { title: 'Seller Dashboard' });
};


// --- Seller Product Management ---

// Seller Upload Product Page
exports.getUploadProductPage = (req, res) => {
    res.render('seller/upload-product', { title: 'Upload New Product' });
};

// Seller Upload Product Action
exports.uploadProduct = async (req, res, next) => {
    const { name, category, price, stock, imageUrl, specifications } = req.body;
    const sellerId = req.session.user._id; // Seller is the current user

    // Basic validation
    if (!name || !category || price === undefined || stock === undefined || !imageUrl) {
        req.flash('error_msg', 'Please fill in all required fields (Name, Category, Price, Stock, Image URL).');
        return res.render('seller/upload-product', { title: 'Upload New Product', product: req.body });
    }
     if (isNaN(Number(price)) || Number(price) < 0 || !Number.isInteger(Number(stock)) || Number(stock) < 0) {
        req.flash('error_msg', 'Price must be a non-negative number. Stock must be a non-negative integer.');
        return res.render('seller/upload-product', { title: 'Upload New Product', product: req.body });
    }

    try {
        const newProduct = new Product({
            name: name.trim(),
            category: category.trim(),
            price: Number(price),
            stock: Number(stock),
            imageUrl: imageUrl.trim(),
            specifications: specifications ? specifications.trim() : '',
            sellerId: sellerId,
            status: 'Pending Approval' // Default status for seller uploads
        });

        await newProduct.save();

        // Optional: Notify admin about new pending product?

        req.flash('success_msg', `Product "${newProduct.name}" uploaded successfully. It is pending admin approval.`);
        res.redirect('/seller/manage-products');

    } catch (error) {
        if (error.name === 'ValidationError') {
           let errors = Object.values(error.errors).map(el => el.message);
           req.flash('error_msg', `Validation Error: ${errors.join(' ')}`);
           return res.render('seller/upload-product', { title: 'Upload New Product', product: req.body });
       }
        console.error("Seller Upload Product Error:", error);
        next(error);
    }
};

// Seller Manage Products Page (Only shows OWN products)
exports.getManageProductsPage = async (req, res, next) => {
    try {
        const sellerId = req.session.user._id;
        const products = await Product.find({ sellerId: sellerId }) // Filter by sellerId
            .sort({ createdAt: -1 })
            .lean();

        res.render('seller/manage-products', {
            title: 'Manage My Products',
            products: products
        });
    } catch (error) {
        next(error);
    }
};

// Seller Edit Product Page (Only own products)
exports.getEditProductPage = async (req, res, next) => {
     try {
        const sellerId = req.session.user._id;
        const product = await Product.findOne({ _id: req.params.id, sellerId: sellerId }); // Ensure ownership

         if (!product) {
            req.flash('error_msg', 'Product not found or you do not have permission to edit it.');
            return res.redirect('/seller/manage-products');
        }
        res.render('seller/edit-product', {
            title: `Edit Product: ${product.name}`,
            product: product
        });
    } catch (error) {
         if (error.name === 'CastError') {
           req.flash('error_msg', 'Invalid product ID format.');
            return res.redirect('/seller/manage-products');
       }
        console.error("Seller Get Edit Product Error:", error);
        next(error);
     }
 };

// Seller Update Product Action (Requires re-approval)
 exports.updateProduct = async (req, res, next) => {
    const productId = req.params.id;
    const sellerId = req.session.user._id;
    const { name, category, price, stock, imageUrl, specifications } = req.body;

     // Basic validation
     if (!name || !category || price === undefined || stock === undefined || !imageUrl) {
        req.flash('error_msg', 'Please fill in all required fields.');
        // Fetch product data again to re-render the edit page correctly
        const productData = await Product.findOne({ _id: productId, sellerId: sellerId }).lean();
        return res.render('seller/edit-product', { title: `Edit Product: ${productData?.name || 'Product'}`, product: { ...productData, ...req.body }, error_msg: req.flash('error_msg') });
    }
     if (isNaN(Number(price)) || Number(price) < 0 || !Number.isInteger(Number(stock)) || Number(stock) < 0) {
         req.flash('error_msg', 'Price must be a non-negative number. Stock must be a non-negative integer.');
         const productData = await Product.findOne({ _id: productId, sellerId: sellerId }).lean();
         return res.render('seller/edit-product', { title: `Edit Product: ${productData?.name || 'Product'}`, product: { ...productData, ...req.body }, error_msg: req.flash('error_msg') });
    }

    try {
        const product = await Product.findOne({ _id: productId, sellerId: sellerId }); // Verify ownership
        if (!product) {
            req.flash('error_msg', 'Product not found or you do not have permission to update it.');
            return res.status(404).redirect('/seller/manage-products');
         }

         // Update fields
         product.name = name.trim();
         product.category = category.trim();
         product.price = Number(price);
         product.stock = Number(stock);
         product.imageUrl = imageUrl.trim();
         product.specifications = specifications ? specifications.trim() : '';
         product.status = 'Pending Approval'; // Set back to pending on edit
         product.rejectionReason = undefined; // Clear rejection reason on edit

         await product.save();
         req.flash('success_msg', `Product "${product.name}" updated. It is now pending admin re-approval.`);
         res.redirect('/seller/manage-products');

    } catch (error) {
         if (error.name === 'ValidationError') {
            let errors = Object.values(error.errors).map(el => el.message);
             req.flash('error_msg', `Validation Error: ${errors.join(' ')}`);
             const productData = await Product.findOne({ _id: productId, sellerId: sellerId }).lean();
             return res.render('seller/edit-product', { title: `Edit Product: ${productData?.name || 'Product'}`, product: { ...productData, ...req.body }, error_msg: req.flash('error_msg') });
         }
         if (error.name === 'CastError') {
             req.flash('error_msg', 'Invalid product ID format.');
             return res.status(400).redirect('/seller/manage-products');
         }
        console.error("Seller Update Product Error:", error);
        next(error);
     }
 };

// Seller Remove Product Action (Only own products)
exports.removeProduct = async (req, res, next) => {
    const productId = req.params.id;
    const sellerId = req.session.user._id;
    try {
         // Ensure seller owns the product before deleting
         const product = await Product.findOneAndDelete({ _id: productId, sellerId: sellerId });

        if (!product) {
             req.flash('error_msg', 'Product not found or you do not have permission to remove it.');
            return res.status(404).redirect('/seller/manage-products');
         }

         // Optional: Add checks here, e.g., prevent removal if product is in 'Approved' state and has orders?
         // if (product.status === 'Approved' && product.orderCount > 0) {
         //     req.flash('error_msg', 'Cannot remove an approved product that has been ordered. Contact admin.');
         //     return res.redirect('/seller/manage-products');
         // }

         req.flash('success_msg', `Product "${product.name}" removed successfully.`);
         res.redirect('/seller/manage-products');
    } catch (error) {
        if (error.name === 'CastError') {
             req.flash('error_msg', 'Invalid product ID format.');
             return res.status(400).redirect('/seller/manage-products');
         }
        console.error("Seller Remove Product Error:", error);
        next(error);
    }
};


// --- Seller Order Management ---

// Seller Manage Orders Page (Only shows orders containing OWN products)
exports.getManageOrdersPage = async (req, res, next) => {
    try {
        const sellerId = req.session.user._id;

        // Find orders where at least one product in the 'products' array has the current seller's ID
        const orders = await Order.find({ 'products.sellerId': sellerId })
            .sort({ orderDate: -1 })
            // Populate only the necessary product fields for display
            .populate({
                path: 'products.productId', // Populate based on productId field in the subdocument
                select: 'name imageUrl _id' // Select only needed fields from the Product model
            })
            .lean(); // Use lean for better performance

        // Filter products within each order to show only those belonging to the seller
        // and prepare display data
        const sellerOrders = orders.map(order => {
            // Filter the products array to include only items sold by this seller
            const sellerProductsInOrder = order.products.filter(p => p.sellerId && p.sellerId.toString() === sellerId.toString());

            // Create a summary string for the seller's items in this order
            let itemsSummary = 'No items from you in this order.'; // Default message
            if (sellerProductsInOrder.length > 0) {
                 itemsSummary = sellerProductsInOrder.map(p => {
                    // Use populated product name if available, otherwise fallback to name stored in order
                    const productName = p.productId ? p.productId.name : (p.name || '[Product Info Missing]');
                    const price = p.priceAtOrder || 0;
                    return `${productName} (Qty: ${p.quantity}) @ ₹${price.toFixed(2)}`;
                }).join('<br>');
            }

            // Return a modified order object for the view
            return {
                ...order, // Spread the original order data
                products: sellerProductsInOrder, // Replace products with only the seller's items
                itemsSummary: itemsSummary, // Add the summary for easy display
                // Seller typically cannot cancel/confirm delivery directly from this view
                canBeCancelledBySeller: false, // Example: Disable seller cancellation
                canBeDirectlyDeliveredBySeller: false // Example: Disable seller delivery actions
            };
        });


        res.render('seller/manage-orders', {
            title: 'Manage My Orders',
            orders: sellerOrders // Pass the processed orders
        });
    } catch (error) {
        console.error("Seller Manage Orders Error:", error);
        next(error);
    }
};