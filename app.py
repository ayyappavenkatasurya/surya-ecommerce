import os

# Define the project root directory name
PROJECT_ROOT = 'professional-ecommerce'

# Dictionary mapping file paths (relative to project root) to their content
# Using triple quotes for multi-line strings
files_content = {
    '.gitignore': """node_modules/
.env
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
dist/
build/
.idea/
.vscode/
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?
.DS_Store
Thumbs.db
""",

    'package.json': """{
  "name": "professional-ecommerce",
  "version": "1.0.0",
  "description": "Professional Responsive Ecommerce Application",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "keywords": [
    "ecommerce",
    "nodejs",
    "express",
    "mongodb",
    "ejs"
  ],
  "author": "AI Assistant",
  "license": "MIT",
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "connect-flash": "^0.1.1",
    "connect-mongo": "^5.1.0",
    "dotenv": "^16.4.5",
    "ejs": "^3.1.10",
    "express": "^4.19.2",
    "express-session": "^1.18.0",
    "method-override": "^3.0.0",
    "mongoose": "^8.4.0",
    "nodemailer": "^6.9.13"
  },
  "devDependencies": {
    "nodemon": "^3.1.0"
  }
}
""",

    'server.js': """require('dotenv').config();
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const flash = require('connect-flash');
const methodOverride = require('method-override');

const connectDB = require('./config/database');
const mainRouter = require('./routes/index');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

connectDB();

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(methodOverride('_method'));

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGO_URI,
        collectionName: 'sessions'
    }),
    cookie: {
        maxAge: parseInt(process.env.SESSION_MAX_AGE || '86400000', 10),
        httpOnly: true

    }
  })
);

app.use(flash());

app.use((req, res, next) => {
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg = req.flash('error_msg');
  res.locals.error = req.flash('error');
  res.locals.currentUser = req.session.user || null;
  res.locals.currentUrl = req.originalUrl;
  res.locals.cartItemCount = req.session.user?.cart?.reduce((count, item) => count + item.quantity, 0) || 0;
  next();
});


app.use('/', mainRouter);


app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});
""",

    'config/database.js': """const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error connecting to MongoDB: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
""",

    'config/mailer.js': """const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: parseInt(process.env.MAIL_PORT, 10),
  secure: parseInt(process.env.MAIL_PORT, 10) === 465,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

transporter.verify((error, success) => {
  if (error) {
    console.error('Error with Nodemailer transporter configuration:', error);
  } else {
    console.log('Nodemailer transporter is ready to send emails');
  }
});

const sendEmail = async (to, subject, text, html) => {
  try {
    await transporter.sendMail({
      from: process.env.MAIL_FROM,
      to: to,
      subject: subject,
      text: text,
      html: html,
    });
    console.log(`Email sent successfully to ${to}`);
    return true;
  } catch (error) {
    console.error(`Error sending email to ${to}:`, error);
    return false;
  }
};

module.exports = { sendEmail };
""",

    'services/otpService.js': """const crypto = require('crypto');

const generateOTP = (length = 6) => {
  const buffer = crypto.randomBytes(Math.ceil(length / 2));
  let otp = buffer.toString('hex');
  otp = otp.replace(/[^0-9]/g, '');
  otp = otp.slice(0, length);
  while (otp.length < length) {
    otp = '0' + otp;
  }
  return otp;
};

const setOTPExpiration = (minutes = 10) => {
  return Date.now() + minutes * 60 * 1000;
};

module.exports = { generateOTP, setOTPExpiration };
""",

    'models/User.js': """const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const AddressSchema = new mongoose.Schema({
    name: { type: String, trim: true },
    phone: { type: String, trim: true },
    pincode: { type: String, trim: true },
    cityVillage: { type: String, trim: true },
    landmarkNearby: { type: String, trim: true },
}, { _id: false });

const CartItemSchema = new mongoose.Schema({
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true,
    },
    quantity: {
        type: Number,
        required: true,
        min: 1,
        default: 1,
    }
}, { _id: false });

const UserSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please provide your name'],
        trim: true,
    },
    email: {
        type: String,
        required: [true, 'Please provide your email'],
        unique: true,
        match: [
            /^\\w+([.-]?\\w+)*@\\w+([.-]?\\w+)*(\\.\\w{2,3})+$/,
            'Please provide a valid email address',
        ],
        lowercase: true,
        trim: true,
    },
    password: {
        type: String,
        required: [true, 'Please provide a password'],
        minlength: 6,
        select: false,
    },
    role: {
        type: String,
        enum: ['user', 'admin', 'delivery_admin'],
        default: 'user',
    },
    isVerified: {
        type: Boolean,
        default: false,
    },
    otp: { type: String },
    otpExpires: { type: Date },
    address: AddressSchema,
    cart: [CartItemSchema],

    resetPasswordToken: String,
    resetPasswordExpires: Date,
}, {
    timestamps: true
});

UserSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();

    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

UserSchema.methods.matchPassword = async function(enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model('User', UserSchema);

module.exports = User;
""",

    'models/Product.js': """const mongoose = require('mongoose');

const RatingSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true },
}, { _id: false, timestamps: true });


const ProductSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please provide a product name'],
        trim: true,
    },
    category: {
        type: String,
        required: [true, 'Please provide a product category'],
        trim: true,
    },
    price: {
        type: Number,
        required: [true, 'Please provide a product price'],
        min: 0,
    },
    stock: {
        type: Number,
        required: [true, 'Please provide product stock quantity'],
        min: 0,
        default: 0,
    },
    imageUrl: {
        type: String,
        required: [true, 'Please provide a product image URL'],
        trim: true,
    },
    specifications: {
        type: String,
        trim: true,
    },
    sellerEmail: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
    },
    ratings: [RatingSchema],
    averageRating: {
      type: Number,
      default: 0,
    },
    numReviews: {
        type: Number,
        default: 0,
    },
    orderCount: {
        type: Number,
        default: 0,
    }
}, {
    timestamps: true
});

ProductSchema.pre('save', function(next) {
    if (this.ratings && this.ratings.length > 0) {
        this.numReviews = this.ratings.length;
        this.averageRating = this.ratings.reduce((acc, item) => item.rating + acc, 0) / this.ratings.length;
    } else {
        this.numReviews = 0;
        this.averageRating = 0;
    }
    next();
});


const Product = mongoose.model('Product', ProductSchema);

module.exports = Product;
""",

    'models/Order.js': """const mongoose = require('mongoose');

const OrderProductSchema = new mongoose.Schema({
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    priceAtOrder: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
    imageUrl: { type: String }
}, { _id: false });

const OrderAddressSchema = new mongoose.Schema({
    name: { type: String, trim: true, required: true },
    phone: { type: String, trim: true, required: true },
    pincode: { type: String, trim: true, required: true },
    cityVillage: { type: String, trim: true, required: true },
    landmarkNearby: { type: String, trim: true },
}, { _id: false });


const OrderSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    userEmail: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
    },
    products: [OrderProductSchema],
    totalAmount: {
        type: Number,
        required: true,
        min: 0,
    },
    shippingAddress: {
        type: OrderAddressSchema,
        required: true
    },
    paymentMethod: {
        type: String,
        enum: ['COD'],
        required: true,
        default: 'COD',
    },
    status: {
        type: String,
        enum: ['Pending', 'Order Received', 'Out for Delivery', 'Delivered', 'Cancelled'],
        default: 'Pending',
    },
    orderDate: {
        type: Date,
        default: Date.now,
    },
    receivedByDate: {
        type: Date,
    },
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
    },
    assignedAdminEmail: {
        type: String,
        lowercase: true,
        trim: true,
        default: null,
    },

    orderOTP: String,
    orderOTPExpires: Date,

    cancellationAllowedUntil: {
        type: Date,
    }
}, {
    timestamps: true
});

OrderSchema.pre('save', function(next) {
    if (this.isNew) {
        const now = this.orderDate || Date.now();
        this.cancellationAllowedUntil = new Date(now.getTime() + 60 * 60 * 1000);
    }
    next();
});

const Order = mongoose.model('Order', OrderSchema);

module.exports = Order;
""",

    'middleware/authMiddleware.js': """const User = require('../models/User');

const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.user) {
        User.findById(req.session.user._id).then(user => {
            if (!user) {
                req.session.destroy(err => {
                    if (err) {
                        console.error('Session destruction error:', err);
                        return next(err);
                    }
                    req.flash('error_msg', 'Session expired or user not found. Please login again.');
                    res.redirect('/auth/login');
                });
            } else {
                req.user = user;
                res.locals.currentUser = user;
                next();
            }
        }).catch(err => {
            console.error("Error checking user authentication:", err);
            req.flash('error_msg', 'An error occurred during authentication.');
            res.redirect('/auth/login');
        });
    } else {
        req.flash('error_msg', 'You must be logged in to view this page.');
        req.session.returnTo = req.originalUrl;
        res.redirect('/auth/login');
    }
};

module.exports = { isAuthenticated };
""",

    'middleware/roleMiddleware.js': """const isAdmin = (req, res, next) => {
  if (req.session.user && req.session.user.role === 'admin') {
    next();
  } else {
    req.flash('error_msg', 'Access Denied: Admin privileges required.');
    res.status(403).redirect('/');
  }
};

const isDeliveryAdmin = (req, res, next) => {
  if (req.session.user && req.session.user.role === 'delivery_admin') {
    next();
  } else {
    req.flash('error_msg', 'Access Denied: Delivery Admin privileges required.');
    res.status(403).redirect('/');
  }
};

const isAdminOrDeliveryAdmin = (req, res, next) => {
    if (req.session.user && (req.session.user.role === 'admin' || req.session.user.role === 'delivery_admin')) {
      next();
    } else {
      req.flash('error_msg', 'Access Denied: Admin or Delivery Admin privileges required.');
      res.status(403).redirect('/');
    }
}

module.exports = { isAdmin, isDeliveryAdmin, isAdminOrDeliveryAdmin };
""",

    'middleware/errorMiddleware.js': """const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

const errorHandler = (err, req, res, next) => {
  let statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  let message = err.message;

  if (err.name === 'CastError' && err.kind === 'ObjectId') {
    statusCode = 404;
    message = 'Resource not found';
  }
   if (err.name === 'ValidationError') {
       statusCode = 400;
       const errors = Object.values(err.errors).map(el => el.message);
       message = `Validation Error: ${errors.join(', ')}`;
   }
    if (err.code === 11000) {
       statusCode = 400;
       message = `Duplicate field value entered: ${Object.keys(err.keyValue)} already exists.`;
    }


  console.error("ERROR STACK: ", err.stack);

  if (req.accepts('html')) {
      res.status(statusCode).render('error', {
          title: 'Error',
          message: message,
          stack: process.env.NODE_ENV === 'development' ? err.stack : null,
          statusCode: statusCode
      });
  } else {
      res.status(statusCode).json({
          message: message,
          stack: process.env.NODE_ENV === 'development' ? err.stack : null,
      });
  }
};

module.exports = { notFound, errorHandler };
""",

    'controllers/authController.js': """const User = require('../models/User');
const Product = require('../models/Product');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { generateOTP, setOTPExpiration } = require('../services/otpService');
const { sendEmail } = require('../config/mailer');

exports.getLoginPage = (req, res) => {
    if (req.session.user) {
         return res.redirect('/');
    }
    res.render('auth/login', { title: 'Login' });
};

exports.getRegisterPage = (req, res) => {
    if (req.session.user) {
        return res.redirect('/');
   }
    res.render('auth/register', { title: 'Register' });
};

exports.getVerifyOtpPage = (req, res) => {
    const email = req.query.email;
    if (!email) {
        req.flash('error_msg', 'Email required for OTP verification.');
        return res.redirect('/auth/register');
    }
     if (req.session.user) {
        return res.redirect('/');
   }
    res.render('auth/verify-otp', { title: 'Verify Email', email });
};

exports.getForgotPasswordPage = (req, res) => {
    res.render('auth/forgot-password', { title: 'Forgot Password' });
};

exports.getResetPasswordPage = async (req, res, next) => {
    try {
        const user = await User.findOne({
            resetPasswordToken: req.params.token,
            resetPasswordExpires: { $gt: Date.now() },
        });

        if (!user) {
            req.flash('error_msg', 'Password reset token is invalid or has expired.');
            return res.redirect('/auth/forgot-password');
        }
        res.render('auth/reset-password', { title: 'Reset Password', token: req.params.token });
    } catch (error) {
        next(error);
    }
};

exports.registerUser = async (req, res, next) => {
    const { name, email, password, confirmPassword } = req.body;

    if (!name || !email || !password || !confirmPassword) {
        req.flash('error_msg', 'Please fill in all fields.');
        return res.redirect('/auth/register');
    }
    if (password !== confirmPassword) {
        req.flash('error_msg', 'Passwords do not match.');
        return res.redirect('/auth/register');
    }
    if (password.length < 6) {
        req.flash('error_msg', 'Password must be at least 6 characters.');
        return res.redirect('/auth/register');
    }

    try {
        let user = await User.findOne({ email: email.toLowerCase() });

        if (user && user.isVerified) {
            req.flash('error_msg', 'Email is already registered and verified.');
            return res.redirect('/auth/login');
        }

        const otp = generateOTP();
        const otpExpires = setOTPExpiration(10);

        if (user && !user.isVerified) {
            user.name = name;
            user.password = password;
            user.otp = otp;
            user.otpExpires = otpExpires;
            user.isVerified = false;
             await user.save({ validateBeforeSave: false });
        } else {
            user = new User({
                name,
                email: email.toLowerCase(),
                password,
                otp,
                otpExpires,
                isVerified: false,
            });
            await user.save();
        }

        const subject = 'Verify Your Email Address';
        const text = `Your verification OTP is: ${otp}\\nIt will expire in 10 minutes.`;
        const html = `<p>Your verification OTP is: <strong>${otp}</strong></p><p>It will expire in 10 minutes.</p>`;

        const emailSent = await sendEmail(user.email, subject, text, html);

        if (emailSent) {
            req.flash('success_msg', `An OTP has been sent to ${user.email}. Please verify.`);
            res.redirect(`/auth/verify-otp?email=${encodeURIComponent(user.email)}`);
        } else {
             await User.deleteOne({ _id: user._id, isVerified: false });
            req.flash('error_msg', 'Could not send OTP email. Please try registering again or contact support.');
            res.redirect('/auth/register');
        }

    } catch (error) {
        if (error.code === 11000) {
            req.flash('error_msg', 'Email already exists.');
             return res.redirect('/auth/register');
        }
        if (error.name === 'ValidationError') {
           let errors = Object.values(error.errors).map(el => el.message);
            req.flash('error_msg', errors.join(' '));
            return res.redirect('/auth/register');
       }
        next(error);
    }
};

exports.verifyOtp = async (req, res, next) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        req.flash('error_msg', 'Email and OTP are required.');
         return res.redirect(`/auth/verify-otp?email=${encodeURIComponent(email || '')}`);
    }

    try {
        const user = await User.findOne({
            email: email.toLowerCase(),
            otp: otp,
            otpExpires: { $gt: Date.now() },
        }).select('+password');

        if (!user) {
            req.flash('error_msg', 'Invalid or expired OTP.');
            return res.redirect(`/auth/verify-otp?email=${encodeURIComponent(email)}`);
        }

         let wasPasswordReset = user.resetPasswordToken && user.resetPasswordExpires > Date.now();

         user.isVerified = true;
         user.otp = undefined;
         user.otpExpires = undefined;

         if(wasPasswordReset){
             req.flash('success_msg', 'OTP Verified. Please set your new password.');
             await user.save({ validateBeforeSave: false });
             res.redirect(`/auth/reset-password/${user.resetPasswordToken}`);
         } else {
            await user.save();

            req.session.user = {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                address: user.address,
                cart: user.cart
             };
            req.session.save(err => {
               if (err) {
                    return next(err);
                }
                req.flash('success_msg', 'Email verified successfully! You are now logged in.');
                const returnTo = req.session.returnTo || '/';
                delete req.session.returnTo;
                res.redirect(returnTo);
             });
         }

    } catch (error) {
        next(error);
    }
};

exports.resendOtp = async (req, res, next) => {
    const { email } = req.body;

    if (!email) {
        req.flash('error_msg', 'Email is required to resend OTP.');
         return res.redirect(`/auth/verify-otp?email=${encodeURIComponent(req.query.email || '')}`);
    }

    try {
        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            req.flash('error_msg', 'User not found.');
            return res.redirect('/auth/register');
        }

        if(user.isVerified && !(user.resetPasswordToken && user.resetPasswordExpires > Date.now())) {
             req.flash('error_msg', 'This account is already verified.');
            return res.redirect('/auth/login');
        }

        const otp = generateOTP();
        const otpExpires = setOTPExpiration(10);

        user.otp = otp;
        user.otpExpires = otpExpires;
        await user.save();

        let subject = 'Your New Verification OTP';
         let text = `Your new verification OTP is: ${otp}\\nIt will expire in 10 minutes.`;
        let html = `<p>Your new verification OTP is: <strong>${otp}</strong></p><p>It will expire in 10 minutes.</p>`;


        const emailSent = await sendEmail(user.email, subject, text, html);

        if (emailSent) {
            req.flash('success_msg', `A new OTP has been sent to ${user.email}.`);
            res.redirect(`/auth/verify-otp?email=${encodeURIComponent(user.email)}`);
        } else {
            req.flash('error_msg', 'Could not resend OTP email. Please try again.');
             res.redirect(`/auth/verify-otp?email=${encodeURIComponent(user.email)}`);
        }
    } catch (error) {
        next(error);
    }
};


exports.loginUser = async (req, res, next) => {
    const { email, password } = req.body;

    if (!email || !password) {
        req.flash('error_msg', 'Please provide email and password.');
        return res.redirect('/auth/login');
    }

    try {
        const user = await User.findOne({ email: email.toLowerCase() }).select('+password').populate('cart.productId');

        if (!user) {
            req.flash('error_msg', 'Invalid credentials.');
            return res.redirect('/auth/login');
        }

         if (!user.isVerified) {
            req.flash('error_msg', 'Please verify your email first. An OTP was sent during registration.');
            return res.redirect(`/auth/verify-otp?email=${encodeURIComponent(user.email)}`);
         }

        const isMatch = await user.matchPassword(password);

        if (!isMatch) {
            req.flash('error_msg', 'Invalid credentials.');
            return res.redirect('/auth/login');
        }

        req.session.user = {
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
             address: user.address,
            cart: user.cart
         };

         req.session.regenerate(err => {
            if (err) {
                 return next(err);
             }
            req.session.user = {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                address: user.address,
                cart: user.cart
            };

             req.session.save(err => {
                 if (err) {
                     return next(err);
                 }
                 req.flash('success_msg', 'You are now logged in.');
                 const returnTo = req.session.returnTo || '/';
                 delete req.session.returnTo;
                 res.redirect(returnTo);
            });
        });

    } catch (error) {
        next(error);
    }
};

exports.logoutUser = (req, res, next) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Session destruction error:', err);
            return next(err);
        }
        res.clearCookie('connect.sid');
        req.flash('success_msg', 'You have been logged out.');
        res.redirect('/auth/login');
    });
};

exports.forgotPassword = async (req, res, next) => {
    const { email } = req.body;
    if (!email) {
        req.flash('error_msg', 'Please provide an email address.');
        return res.redirect('/auth/forgot-password');
    }

    try {
        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            req.flash('success_msg', 'If an account with that email exists, a password reset OTP will be sent.');
            return res.redirect('/auth/forgot-password');
        }
        if (!user.isVerified) {
            req.flash('error_msg', 'This account is not verified. Please complete registration verification first.');
             return res.redirect(`/auth/verify-otp?email=${encodeURIComponent(user.email)}`);
         }

         const otp = generateOTP();
         const resetToken = crypto.randomBytes(20).toString('hex');
        const otpExpires = setOTPExpiration(10);
        const resetExpires = setOTPExpiration(60);

        user.otp = otp;
        user.otpExpires = otpExpires;
        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = resetExpires;
        await user.save();

        const subject = 'Password Reset Request - Verify OTP';
         const text = `You requested a password reset.\\n\\nPlease use the following OTP to verify your request: ${otp}\\n\\nIt will expire in 10 minutes.\\n\\nIf you did not request this, please ignore this email.`;
         const html = `<p>You requested a password reset.</p><p>Please use the following OTP to verify your request: <strong>${otp}</strong></p><p>It will expire in 10 minutes.</p><p>If you did not request this, please ignore this email.</p>`;

         const emailSent = await sendEmail(user.email, subject, text, html);

        if (emailSent) {
            req.flash('success_msg', `An OTP has been sent to ${user.email} to verify your password reset request.`);
             res.redirect(`/auth/verify-otp?email=${encodeURIComponent(user.email)}&reason=reset`);
        } else {
            user.otp = undefined;
            user.otpExpires = undefined;
             user.resetPasswordToken = undefined;
            user.resetPasswordExpires = undefined;
             await user.save();
            req.flash('error_msg', 'Could not send password reset OTP. Please try again.');
            res.redirect('/auth/forgot-password');
        }

    } catch (error) {
        next(error);
    }
};


exports.resetPassword = async (req, res, next) => {
    const { password, confirmPassword } = req.body;
    const token = req.params.token;

    if (!password || !confirmPassword) {
        req.flash('error_msg', 'Please enter and confirm your new password.');
         return res.redirect(`/auth/reset-password/${token}`);
    }

    if (password !== confirmPassword) {
        req.flash('error_msg', 'Passwords do not match.');
         return res.redirect(`/auth/reset-password/${token}`);
    }
     if (password.length < 6) {
         req.flash('error_msg', 'Password must be at least 6 characters.');
        return res.redirect(`/auth/reset-password/${token}`);
    }

    try {
        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() },
         });


        if (!user) {
            req.flash('error_msg', 'Password reset token is invalid or has expired.');
            return res.redirect('/auth/forgot-password');
        }

        user.password = password;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
         user.otp = undefined;
         user.otpExpires = undefined;

        await user.save();

        req.session.user = {
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            address: user.address,
            cart: user.cart
        };

        req.session.save(err => {
            if(err) {
                console.error("Session save error after reset:", err)
             }
             req.flash('success_msg', 'Password has been reset successfully. You are now logged in.');
            res.redirect('/');
        });


    } catch (error) {
        next(error);
    }
};

exports.getHomePage = async (req, res, next) => {
  try {
    const products = await Product.find({ stock: { $gt: 0 } }).sort({ createdAt: -1 });
    res.render('products/index', {
      title: 'Home',
      products: products,
       searchTerm: ''
    });
  } catch (error) {
    next(error);
  }
};

""",

    'controllers/productController.js': """const Product = require('../models/Product');
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
""",

    'controllers/userController.js': """const User = require('../models/User');
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


""",

    'controllers/orderController.js': """const Order = require('../models/Order');
const User = require('../models/User');
const Product = require('../models/Product');
const { sendEmail } = require('../config/mailer');
const mongoose = require('mongoose');
const { generateOTP, setOTPExpiration } = require('../services/otpService');

exports.placeOrder = async (req, res, next) => {

    try {
        const userId = req.session.user._id;
        const user = await User.findById(userId).populate('cart.productId');

         if (!user || !user.cart || user.cart.length === 0) {
             req.flash('error_msg', 'Your cart is empty or user not found.');
            return res.redirect('/cart');
        }

         if (!user.address || !user.address.name || !user.address.phone || !user.address.pincode || !user.address.cityVillage) {
             req.flash('error_msg', 'Please save your shipping address before placing the order.');
            return res.redirect('/user/checkout');
         }

        let orderProducts = [];
        let totalAmount = 0;
         const productUpdatePromises = [];

        for (const item of user.cart) {
            if (!item.productId) {
                 req.flash('error_msg', `One of the products in your cart is no longer available.`);
                 return res.redirect('/cart');
            }

             const product = item.productId;

            if (product.stock < item.quantity) {
                 req.flash('error_msg', `Insufficient stock for ${product.name}. Available: ${product.stock}. Please update your cart.`);
                return res.redirect('/cart');
             }

             orderProducts.push({
                productId: product._id,
                name: product.name,
                priceAtOrder: product.price,
                quantity: item.quantity,
                 imageUrl: product.imageUrl,
            });

            totalAmount += product.price * item.quantity;

            productUpdatePromises.push(
                 Product.updateOne(
                     { _id: product._id, stock: { $gte: item.quantity } },
                     { $inc: { stock: -item.quantity, orderCount: 1 } }

                )
            );
        }

        const productUpdateResults = await Promise.all(productUpdatePromises);

         if (productUpdateResults.some(result => result.modifiedCount === 0)) {
             req.flash('error_msg', 'Stock level changed for an item during checkout. Please review your cart and try again.');
             console.error(`Order placement failed for user ${userId}: Stock inconsistency detected.`);
              return res.redirect('/cart');
         }

        const order = new Order({
            userId: userId,
            userEmail: user.email,
            products: orderProducts,
            totalAmount: totalAmount,
            shippingAddress: user.address,
            paymentMethod: 'COD',
            status: 'Pending',
         });


        await order.save();

        user.cart = [];
        await user.save();

         req.session.user.cart = [];


          try{
             const subject = 'Your Order Has Been Placed!';
            let productListHTML = order.products.map(p => `<li>${p.name} (Qty: ${p.quantity}) - $${p.priceAtOrder.toFixed(2)}</li>`).join('');
            const html = `<h2>Thank you for your order!</h2>
                          <p>Your Order ID: ${order._id}</p>
                          <p>Total Amount: $${order.totalAmount.toFixed(2)}</p>
                         <p>Shipping To: ${order.shippingAddress.name}, ${order.shippingAddress.cityVillage}</p>
                         <h3>Items:</h3>
                         <ul>${productListHTML}</ul>
                         <p>You can track your order status in the 'My Orders' section.</p>`;
            await sendEmail(user.email, subject, `Your order ${order._id} has been placed. Total: $${order.totalAmount.toFixed(2)}`, html);
          } catch (emailError){
             console.error(`Failed to send order confirmation email for order ${order._id}:`, emailError);
          }


        req.flash('success_msg', 'Order placed successfully!');
        res.redirect('/orders/my-orders');

    } catch (error) {
        console.error("Order Placement Error:", error);

         if (error.message.includes("stock")) {
            req.flash('error_msg', 'Stock level changed for an item during checkout. Please try again.');
            return res.redirect('/cart');
         }

        next(error);
    }
};

exports.getMyOrders = async (req, res, next) => {
    try {
        const orders = await Order.find({ userId: req.session.user._id })
                                   .sort({ orderDate: -1 })
                                   .lean();

         const now = Date.now();
        orders.forEach(order => {
             order.isCancellable = order.status === 'Pending' && order.cancellationAllowedUntil && now < new Date(order.cancellationAllowedUntil).getTime();
            order.formattedOrderDate = new Date(order.orderDate).toLocaleString();
            order.formattedReceivedDate = order.receivedByDate ? new Date(order.receivedByDate).toLocaleString() : 'N/A';
         });


        res.render('user/my-orders', {
            title: 'My Orders',
            orders: orders
        });
    } catch (error) {
        next(error);
    }
};

exports.cancelOrder = async (req, res, next) => {
    try {
        const orderId = req.params.id;
        const userId = req.session.user._id;

        const order = await Order.findOne({
             _id: orderId,
            userId: userId,
            status: 'Pending',
             cancellationAllowedUntil: { $gt: Date.now() }
        });

        if (!order) {
             req.flash('error_msg', 'Order not found, already processed, or cancellation period expired.');
            return res.redirect('/orders/my-orders');
        }

         const productStockRestorePromises = order.products.map(item => {
             return Product.updateOne(
                 { _id: item.productId },
                 { $inc: { stock: item.quantity, orderCount: -1 } }

             );
        });


        await Promise.all(productStockRestorePromises);

        order.status = 'Cancelled';
         order.receivedByDate = undefined;
         await order.save();

         try{
             const subject = 'Your Order Has Been Cancelled';
             const html = `<p>Your order (${order._id}) has been successfully cancelled.</p>`;
            await sendEmail(order.userEmail, subject, `Order ${order._id} cancelled.`, html);
         } catch (emailError){
             console.error(`Failed to send cancellation email for order ${order._id}:`, emailError);
         }

        req.flash('success_msg', 'Order cancelled successfully.');
        res.redirect('/orders/my-orders');

    } catch (error) {
         console.error("Order Cancellation Error:", error);
        next(error);
    }
};

 exports.verifyOrderWithOTP = async (adminUserId, orderId, providedOtp) => {

    try {
         const order = await Order.findOne({
            _id: orderId,
            status: 'Pending',
             orderOTP: providedOtp,
             orderOTPExpires: { $gt: Date.now() }
        });

         if (!order) {
             throw new Error('Invalid or expired OTP, or order cannot be verified.');
         }

         order.status = 'Order Received';
         order.orderOTP = undefined;
         order.orderOTPExpires = undefined;

         await order.save();


        try{
             const subject = `Order Status Updated: ${order.status}`;
             const html = `<p>The status of your order (${order._id}) has been updated to: <strong>${order.status}</strong>.</p>
                           <p>You can view your order details in the 'My Orders' section.</p>`;
            await sendEmail(order.userEmail, subject, `Your order ${order._id} status: ${order.status}.`, html);
         } catch (emailError){
             console.error(`Failed to send status update email for order ${order._id}:`, emailError);
         }

        return { success: true, order: order };

    } catch (error) {
        console.error(`Error verifying order OTP for order ${orderId}:`, error);
         throw error;
    }

 };

 exports.generateAndSendOrderVerificationOTP = async (orderId) => {
     try {
         const order = await Order.findById(orderId);
         if (!order) {
             throw new Error('Order not found.');
         }
        if (order.status !== 'Pending') {
             throw new Error('Order cannot be verified in its current state.');
         }

        const otp = generateOTP();
         const otpExpires = setOTPExpiration(10);

        order.orderOTP = otp;
        order.orderOTPExpires = otpExpires;
        await order.save();

         const subject = 'Admin Verification Request - Action Required';
         const text = `An admin is attempting to verify your order (${order._id}).\\nPlease provide them with the following OTP: ${otp}\\nIt will expire in 10 minutes.\\nIf you did not request this verification or suspect suspicious activity, please contact support immediately.`;
         const html = `<p>An admin is attempting to verify your order (${order._id}).</p>
                      <p>Please provide the admin with the following OTP: <strong>${otp}</strong></p>
                      <p>The OTP will expire in 10 minutes.</p>
                      <p><strong>Do not share this OTP if you did not expect this verification.</strong> If you suspect suspicious activity, please contact support immediately.</p>`;

        const emailSent = await sendEmail(order.userEmail, subject, text, html);

        if (!emailSent) {
            order.orderOTP = undefined;
             order.orderOTPExpires = undefined;
             await order.save();
            throw new Error('Failed to send verification OTP email to the customer.');
         }

        return { success: true, message: `OTP sent to user ${order.userEmail}.` };

    } catch (error) {
         console.error(`Error sending verification OTP for order ${orderId}:`, error);
         throw error;
     }
 };

 exports.markOrderAsDelivered = async (orderId, deliveryAdminId) => {
     try {
        const order = await Order.findOne({
            _id: orderId,
            assignedTo: deliveryAdminId,
             status: { $in: ['Order Received', 'Out for Delivery'] }
        });

         if (!order) {
            throw new Error('Order not found, not assigned to you, or cannot be marked as delivered in its current state.');
        }

        order.status = 'Delivered';
         order.receivedByDate = new Date();


         await order.save();

        try{
             const subject = `Your Order Has Been Delivered!`;
             const html = `<p>Great news! Your order (${order._id}) has been delivered.</p>
                           <p>Received Date: ${order.receivedByDate.toLocaleString()}</p>
                          <p>Thank you for shopping with us!</p>`;
            await sendEmail(order.userEmail, subject, `Your order ${order._id} has been delivered.`, html);
         } catch (emailError){
             console.error(`Failed to send delivery confirmation email for order ${order._id}:`, emailError);
         }

        return { success: true, order };

     } catch (error) {
         console.error(`Error marking order ${orderId} as delivered by ${deliveryAdminId}:`, error);
        throw error;
    }
 };
""",

    'controllers/adminController.js': """const Product = require('../models/Product');
const Order = require('../models/Order');
const User = require('../models/User');
const orderController = require('./orderController');

exports.getAdminDashboard = (req, res) => {
    res.render('admin/dashboard', { title: 'Admin Dashboard' });
};

exports.getUploadProductPage = (req, res) => {
    res.render('admin/upload-product', { title: 'Upload New Product' });
};

exports.getManageProductsPage = async (req, res, next) => {
    try {
        const products = await Product.find({}).sort({ createdAt: -1 });
        res.render('admin/manage-products', {
            title: 'Manage Products',
            products: products
        });
    } catch (error) {
        next(error);
    }
};

exports.getEditProductPage = async (req, res, next) => {
     try {
        const product = await Product.findById(req.params.id);
         if (!product) {
            req.flash('error_msg', 'Product not found.');
            return res.redirect('/admin/manage-products');
        }
        res.render('admin/edit-product', {
            title: `Edit Product: ${product.name}`,
            product: product
        });
    } catch (error) {
         if (error.name === 'CastError') {
           req.flash('error_msg', 'Invalid product ID format.');
            return res.redirect('/admin/manage-products');
       }
        next(error);
     }
 };

exports.getManageOrdersPage = async (req, res, next) => {
    try {
        const orders = await Order.find({})
                                   .sort({ orderDate: -1 })
                                  .lean();


        orders.forEach(order => {
             order.needsVerification = order.status === 'Pending';
             order.isVerified = ['Order Received', 'Out for Delivery', 'Delivered'].includes(order.status);
             order.formattedOrderDate = new Date(order.orderDate).toLocaleString();
            order.formattedReceivedDate = order.receivedByDate ? new Date(order.receivedByDate).toLocaleString() : 'N/A';
        });

         const deliveryAdmins = await User.find({ role: 'delivery_admin' }).select('email _id').lean();

        res.render('admin/manage-orders', {
            title: 'Manage Orders',
            orders: orders,
            deliveryAdmins: deliveryAdmins
        });
    } catch (error) {
        next(error);
    }
};


exports.getManageUsersPage = async (req, res, next) => {
    try {
        const users = await User.find({ _id: { $ne: req.session.user._id } })
                                  .select('name email role createdAt isVerified')
                                  .sort({ createdAt: -1 });
        res.render('admin/manage-users', {
            title: 'Manage Registered Users',
            users: users
        });
    } catch (error) {
        next(error);
    }
};


exports.getManageAssignedOrdersPage = async (req, res, next) => {
    try {
         const deliveryAdmins = await User.find({ role: 'delivery_admin' })
                                         .select('email _id name')
                                          .lean();

        const adminStatsPromises = deliveryAdmins.map(async (admin) => {
            const totalAssigned = await Order.countDocuments({ assignedTo: admin._id });
            const pendingCount = await Order.countDocuments({ assignedTo: admin._id, status: { $in: ['Order Received', 'Out for Delivery']} });
            const deliveredCount = await Order.countDocuments({ assignedTo: admin._id, status: 'Delivered' });

            return {
                 ...admin,
                totalAssigned,
                 pendingCount,
                deliveredCount
            };
        });

        const deliveryAdminStats = await Promise.all(adminStatsPromises);

        res.render('admin/manage-assigned-orders', {
             title: 'Manage Assigned Orders',
            deliveryAdmins: deliveryAdminStats
         });

    } catch (error) {
        next(error);
    }
};

exports.uploadProduct = async (req, res, next) => {
    const { name, category, price, stock, imageUrl, specifications } = req.body;
    const sellerEmail = req.session.user.email;

    if (!name || !category || !price || !stock || !imageUrl) {
        req.flash('error_msg', 'Please fill in all required fields (Name, Category, Price, Stock, Image URL).');
        return res.redirect('/admin/upload-product');
    }
     if (isNaN(Number(price)) || Number(price) < 0 || isNaN(Number(stock)) || Number(stock) < 0) {
        req.flash('error_msg', 'Price and Stock must be non-negative numbers.');
        return res.redirect('/admin/upload-product');
     }

    try {
        const newProduct = new Product({
            name,
            category,
            price: Number(price),
            stock: Number(stock),
            imageUrl,
            specifications: specifications || '',
            sellerEmail
        });

        await newProduct.save();

        req.flash('success_msg', `Product "${name}" uploaded successfully.`);
        res.redirect('/admin/manage-products');

    } catch (error) {
        if (error.name === 'ValidationError') {
           let errors = Object.values(error.errors).map(el => el.message);
           req.flash('error_msg', errors.join(' '));
           return res.redirect('/admin/upload-product');
       }
        next(error);
    }
};

 exports.updateProduct = async (req, res, next) => {
    const productId = req.params.id;
    const { name, category, price, stock, imageUrl, specifications } = req.body;

     if (!name || !category || !price || !stock || !imageUrl) {
        req.flash('error_msg', 'Please fill in all required fields.');
        return res.redirect(`/admin/manage-products/edit/${productId}`);
    }
     if (isNaN(Number(price)) || Number(price) < 0 || isNaN(Number(stock)) || Number(stock) < 0) {
         req.flash('error_msg', 'Price and Stock must be non-negative numbers.');
        return res.redirect(`/admin/manage-products/edit/${productId}`);
    }

    try {
        const product = await Product.findById(productId);

        if (!product) {
            req.flash('error_msg', 'Product not found.');
            return res.status(404).redirect('/admin/manage-products');
         }

         product.name = name;
         product.category = category;
         product.price = Number(price);
        product.stock = Number(stock);
         product.imageUrl = imageUrl;
         product.specifications = specifications || '';


         await product.save();

         req.flash('success_msg', `Product "${product.name}" updated successfully.`);
         res.redirect('/admin/manage-products');

    } catch (error) {
         if (error.name === 'ValidationError') {
            let errors = Object.values(error.errors).map(el => el.message);
             req.flash('error_msg', errors.join(' '));
             return res.redirect(`/admin/manage-products/edit/${productId}`);
         }
         if (error.name === 'CastError') {
             req.flash('error_msg', 'Invalid product ID format.');
             return res.redirect('/admin/manage-products');
         }
        next(error);
     }
 };

exports.removeProduct = async (req, res, next) => {
    const productId = req.params.id;

    try {
         const product = await Product.findByIdAndDelete(productId);

        if (!product) {
             req.flash('error_msg', 'Product not found.');
            return res.status(404).redirect('/admin/manage-products');
         }

         req.flash('success_msg', `Product "${product.name}" removed successfully.`);
         res.redirect('/admin/manage-products');

    } catch (error) {
        if (error.name === 'CastError') {
             req.flash('error_msg', 'Invalid product ID format.');
             return res.redirect('/admin/manage-products');
         }
        next(error);
    }
};

exports.sendVerificationOtp = async (req, res, next) => {
    const { orderId } = req.params;
    try {
        const result = await orderController.generateAndSendOrderVerificationOTP(orderId);
        req.flash('success_msg', result.message + ' Ask the customer for the OTP.');
    } catch (error) {
        req.flash('error_msg', `Failed to send OTP: ${error.message}`);
    }
    res.redirect('/admin/manage-orders');
};

exports.verifyOrderOtp = async (req, res, next) => {
     const { orderId } = req.params;
     const { otp } = req.body;

    if (!otp) {
         req.flash('error_msg', 'Please enter the OTP received by the customer.');
         return res.redirect('/admin/manage-orders');
     }

    try {
         await orderController.verifyOrderWithOTP(req.session.user._id, orderId, otp);
         req.flash('success_msg', `Order ${orderId} verified successfully and status updated to 'Order Received'.`);
    } catch (error) {
        req.flash('error_msg', `Verification failed: ${error.message}`);
    }
    res.redirect('/admin/manage-orders');
};

 exports.assignOrder = async (req, res, next) => {
     const { orderId } = req.params;
     const { deliveryAdminId } = req.body;


     if (!deliveryAdminId) {
         req.flash('error_msg', 'Please select a Delivery Admin to assign the order.');
         return res.redirect('/admin/manage-orders');
     }

    try {
         const order = await Order.findById(orderId);
         if (!order) {
            req.flash('error_msg', 'Order not found.');
            return res.status(404).redirect('/admin/manage-orders');
         }

        if (order.status !== 'Order Received') {
             req.flash('error_msg', `Order cannot be assigned in its current status (${order.status}). It must be 'Order Received'.`);
            return res.redirect('/admin/manage-orders');
         }

        const deliveryAdmin = await User.findOne({ _id: deliveryAdminId, role: 'delivery_admin' });
         if (!deliveryAdmin) {
            req.flash('error_msg', 'Selected Delivery Admin not found or is not a valid delivery admin.');
            return res.status(404).redirect('/admin/manage-orders');
        }

        order.assignedTo = deliveryAdmin._id;
        order.assignedAdminEmail = deliveryAdmin.email;
        order.status = 'Out for Delivery';

         await order.save();

         try{
            const subject = `New Order Assigned: ${order._id}`;
             const html = `<p>You have been assigned a new order for delivery.</p>
                           <p>Order ID: ${order._id}</p>
                          <p>Customer: ${order.shippingAddress.name}, ${order.shippingAddress.cityVillage}</p>
                          <p>Please check your Delivery Dashboard for details.</p>`;
            await sendEmail(deliveryAdmin.email, subject, `New order ${order._id} assigned.`, html);
         } catch(emailError) { console.error(`Failed sending assignment email to delivery admin ${deliveryAdmin.email} for order ${order._id}:`, emailError); }

        try{
            const subject = `Your Order is Out for Delivery!`;
            const html = `<p>Good news! Your order (${order._id}) is now out for delivery.</p>
                           <p>It is being handled by our delivery partner.</p>
                           <p>Estimated delivery time: [Could add estimation logic here]</p>`;
             await sendEmail(order.userEmail, subject, `Your order ${order._id} is out for delivery.`, html);
         } catch(emailError) { console.error(`Failed sending out-for-delivery email to customer for order ${order._id}:`, emailError); }


         req.flash('success_msg', `Order ${orderId} assigned to ${deliveryAdmin.email} and status updated.`);
         res.redirect('/admin/manage-orders');

    } catch (error) {
        if (error.name === 'CastError') {
            req.flash('error_msg', 'Invalid Order ID or Delivery Admin ID.');
            return res.redirect('/admin/manage-orders');
        }
         console.error(`Error assigning order ${orderId} to ${deliveryAdminId}:`, error);
        next(error);
    }
 };

exports.updateUserRole = async (req, res, next) => {
    const userId = req.params.id;
    const { role } = req.body;

     const allowedRoles = ['user', 'admin', 'delivery_admin'];
     if (!role || !allowedRoles.includes(role)) {
        req.flash('error_msg', 'Invalid role selected.');
         return res.redirect('/admin/manage-users');
     }

    try {
        const user = await User.findById(userId);
         if (!user) {
            req.flash('error_msg', 'User not found.');
             return res.status(404).redirect('/admin/manage-users');
         }

         if (user.email === req.session.user.email) {
             req.flash('error_msg', 'You cannot change your own role.');
             return res.redirect('/admin/manage-users');
         }


         user.role = role;
        await user.save();

        req.flash('success_msg', `User ${user.email}'s role updated to ${role}.`);
        res.redirect('/admin/manage-users');

    } catch (error) {
         if (error.name === 'CastError') {
             req.flash('error_msg', 'Invalid user ID.');
         } else {
             console.error(`Error updating role for user ${userId}:`, error);
            req.flash('error_msg', 'Error updating user role.');
         }
         res.redirect('/admin/manage-users');
    }
};

exports.removeUser = async (req, res, next) => {
    const userId = req.params.id;
    try {
         const user = await User.findById(userId);
         if (!user) {
            req.flash('error_msg', 'User not found.');
             return res.status(404).redirect('/admin/manage-users');
         }

        if (user.email === req.session.user.email) {
            req.flash('error_msg', 'You cannot remove yourself.');
            return res.redirect('/admin/manage-users');
        }
         if (user.role === 'admin') {
             const adminCount = await User.countDocuments({ role: 'admin' });
             if (adminCount <= 1) {
                 req.flash('error_msg', 'Cannot remove the last admin account.');
                return res.redirect('/admin/manage-users');
             }
         }

        await User.deleteOne({ _id: userId });

        if (user.role === 'delivery_admin') {
            await Order.updateMany(
                { assignedTo: userId, status: { $nin: ['Delivered', 'Cancelled'] } },
                { $set: { assignedTo: null, assignedAdminEmail: null, status: 'Order Received' } }
             );
             req.flash('success_msg', `User ${user.email} removed. Any active assigned orders have been unassigned.`);
         } else {
             req.flash('success_msg', `User ${user.email} removed successfully.`);
         }

        res.redirect('/admin/manage-users');

    } catch (error) {
         if (error.name === 'CastError') {
             req.flash('error_msg', 'Invalid user ID.');
         } else {
             console.error(`Error removing user ${userId}:`, error);
            req.flash('error_msg', 'Error removing user.');
         }
        res.redirect('/admin/manage-users');
     }
 };

 exports.removeDeliveryAdminAssignment = async (req, res, next) => {
    const userId = req.params.id;
    try {
         const user = await User.findOne({_id: userId, role: 'delivery_admin'});
         if (!user) {
            req.flash('error_msg', 'Delivery Admin not found.');
             return res.status(404).redirect('/admin/manage-assigned-orders');
         }

         if (user.email === req.session.user.email) {
            req.flash('error_msg', 'Action not allowed on self.');
            return res.redirect('/admin/manage-assigned-orders');
        }

         const updateResult = await Order.updateMany(
             { assignedTo: userId, status: { $nin: ['Delivered', 'Cancelled'] } },
             { $set: { assignedTo: null, assignedAdminEmail: null, status: 'Order Received' } }
         );

         await User.deleteOne({ _id: userId });

         req.flash('success_msg', `Delivery Admin ${user.email} removed. ${updateResult.modifiedCount} active orders unassigned.`);
         res.redirect('/admin/manage-assigned-orders');


     } catch (error) {
        if (error.name === 'CastError') {
             req.flash('error_msg', 'Invalid delivery admin ID.');
         } else {
             console.error(`Error removing delivery admin ${userId}:`, error);
             req.flash('error_msg', 'Error removing delivery admin.');
         }
        res.redirect('/admin/manage-assigned-orders');
     }
 };


  exports.getAssignedOrdersDetailForAdmin = async(req, res, next) => {
      const deliveryAdminId = req.params.deliveryAdminId;
      const type = req.params.type;

     try {
          const deliveryAdmin = await User.findById(deliveryAdminId).lean();
         if(!deliveryAdmin || deliveryAdmin.role !== 'delivery_admin'){
             req.flash('error_msg', 'Delivery Admin not found.');
             return res.redirect('/admin/manage-assigned-orders');
         }

         let query = { assignedTo: deliveryAdminId };
         let pageTitle = `Orders Assigned to ${deliveryAdmin.email}`;

         if (type === 'pending') {
            query.status = { $in: ['Order Received', 'Out for Delivery'] };
            pageTitle = `Pending ${pageTitle}`;
         } else if (type === 'delivered') {
             query.status = 'Delivered';
            pageTitle = `Delivered ${pageTitle}`;
        }

        const orders = await Order.find(query)
                                   .sort({ orderDate: -1 })
                                    .lean();

        orders.forEach(order => {
             order.formattedOrderDate = new Date(order.orderDate).toLocaleString();
            order.formattedReceivedDate = order.receivedByDate ? new Date(order.receivedByDate).toLocaleString() : 'N/A';
        });

         res.render('admin/assigned-orders-detail', {
             title: pageTitle,
            orders: orders,
             deliveryAdminEmail: deliveryAdmin.email
        });


     } catch (error) {
        if (error.name === 'CastError') {
            req.flash('error_msg', 'Invalid delivery admin ID.');
             return res.redirect('/admin/manage-assigned-orders');
        }
         next(error);
    }
  }
""",

    'controllers/deliveryController.js': """const Order = require('../models/Order');
const User = require('../models/User');
const orderController = require('./orderController');


exports.getDeliveryDashboard = async (req, res, next) => {
  const deliveryAdminId = req.session.user._id;
   const deliveryAdminEmail = req.session.user.email;

  try {
    const totalAssigned = await Order.countDocuments({ assignedTo: deliveryAdminId });
    const pendingCount = await Order.countDocuments({
        assignedTo: deliveryAdminId,
        status: { $in: ['Order Received', 'Out for Delivery'] }
     });
     const deliveredCount = await Order.countDocuments({
        assignedTo: deliveryAdminId,
        status: 'Delivered'
     });

    res.render('delivery/dashboard', {
      title: 'Delivery Dashboard',
      assignedAdminEmail: deliveryAdminEmail,
      totalAssigned,
      pendingCount,
      deliveredCount
    });

  } catch (error) {
    next(error);
  }
};

exports.getAssignedOrdersDetail = async (req, res, next) => {
    const deliveryAdminId = req.session.user._id;
    const type = req.params.type;

    try {
         let query = { assignedTo: deliveryAdminId };
         let pageTitle = `My Assigned Orders`;

         if (type === 'pending') {
            query.status = { $in: ['Order Received', 'Out for Delivery'] };
             pageTitle = `My Pending Deliveries`;
        } else if (type === 'delivered') {
            query.status = 'Delivered';
            pageTitle = `My Delivered Orders`;
        }


        const orders = await Order.find(query)
                                 .sort({ orderDate: -1 })
                                  .lean();

         orders.forEach(order => {
             order.formattedOrderDate = new Date(order.orderDate).toLocaleString();
             order.formattedReceivedDate = order.receivedByDate ? new Date(order.receivedByDate).toLocaleString() : 'N/A';
            order.canMarkDelivered = false; // Initialize
             if(type === 'total' && ['Order Received', 'Out for Delivery'].includes(order.status)){
                 order.canMarkDelivered = true;
             } else if (type === 'pending') {
                 order.canMarkDelivered = true;
             }
         });

        res.render('delivery/assigned-orders-detail', {
             title: pageTitle,
             orders: orders,
             listType: type
         });

    } catch (error) {
        next(error);
    }
};

 exports.markAsDelivered = async (req, res, next) => {
     const { orderId } = req.params;
    const deliveryAdminId = req.session.user._id;

    try {
         await orderController.markOrderAsDelivered(orderId, deliveryAdminId);

         req.flash('success_msg', `Order ${orderId} marked as delivered.`);
        res.redirect(req.headers.referer || '/delivery/dashboard');

    } catch (error) {
        console.error("Error in deliveryController markAsDelivered:", error);
         req.flash('error_msg', `Failed to mark order as delivered: ${error.message}`);
        res.redirect(req.headers.referer || '/delivery/dashboard');
    }
};

""",

    'routes/index.js': """const express = require('express');
const authRoutes = require('./authRoutes');
const productRoutes = require('./productRoutes');
const userRoutes = require('./userRoutes');
const orderRoutes = require('./orderRoutes');
const adminRoutes = require('./adminRoutes');
const deliveryRoutes = require('./deliveryRoutes');

const { getHomePage } = require('../controllers/authController');

const router = express.Router();

router.get('/', getHomePage);
router.use('/auth', authRoutes);
router.use('/products', productRoutes);

router.use('/user', userRoutes);
router.use('/orders', orderRoutes);

router.use('/admin', adminRoutes);

router.use('/delivery', deliveryRoutes);


module.exports = router;
""",

    'routes/authRoutes.js': """const express = require('express');
const authController = require('../controllers/authController');
const { isAuthenticated } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/login', authController.getLoginPage);
router.get('/register', authController.getRegisterPage);
router.get('/verify-otp', authController.getVerifyOtpPage);
router.get('/forgot-password', authController.getForgotPasswordPage);
router.get('/reset-password/:token', authController.getResetPasswordPage);

router.post('/register', authController.registerUser);
router.post('/login', authController.loginUser);
 router.post('/logout', isAuthenticated, authController.logoutUser);
router.post('/verify-otp', authController.verifyOtp);
 router.post('/resend-otp', authController.resendOtp);

router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password/:token', authController.resetPassword);


module.exports = router;
""",

    'routes/productRoutes.js': """const express = require('express');
const productController = require('../controllers/productController');
 const { isAuthenticated } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', productController.getProducts);
router.get('/:id', productController.getProductDetails);

 router.post('/:id/rate', isAuthenticated, productController.rateProduct);

module.exports = router;
""",

    'routes/userRoutes.js': """const express = require('express');
const userController = require('../controllers/userController');
const { isAuthenticated } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(isAuthenticated);

router.get('/cart', userController.getCart);
router.post('/cart/add', userController.addToCart);
 router.post('/cart/update', userController.updateCartQuantity);
 router.post('/cart/remove/:productId', userController.removeFromCart);

 router.post('/address/save', userController.saveAddress);

 router.get('/checkout', userController.getCheckoutPage);

module.exports = router;
""",

    'routes/orderRoutes.js': """const express = require('express');
const orderController = require('../controllers/orderController');
const { isAuthenticated } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(isAuthenticated);

router.post('/place', orderController.placeOrder);

router.get('/my-orders', orderController.getMyOrders);

 router.post('/cancel/:id', orderController.cancelOrder);

module.exports = router;
""",

    'routes/adminRoutes.js': """const express = require('express');
const adminController = require('../controllers/adminController');
const { isAuthenticated } = require('../middleware/authMiddleware');
const { isAdmin } = require('../middleware/roleMiddleware');

const router = express.Router();

router.use(isAuthenticated, isAdmin);

router.get('/dashboard', adminController.getAdminDashboard);

router.get('/upload-product', adminController.getUploadProductPage);
router.post('/upload-product', adminController.uploadProduct);

router.get('/manage-products', adminController.getManageProductsPage);
router.get('/manage-products/edit/:id', adminController.getEditProductPage);
router.post('/manage-products/update/:id', adminController.updateProduct);
router.post('/manage-products/remove/:id', adminController.removeProduct);

router.get('/manage-orders', adminController.getManageOrdersPage);

router.post('/orders/:orderId/send-otp', adminController.sendVerificationOtp);
router.post('/orders/:orderId/verify-otp', adminController.verifyOrderOtp);

 router.post('/orders/:orderId/assign', adminController.assignOrder);

router.get('/manage-users', adminController.getManageUsersPage);
 router.post('/users/:id/update-role', adminController.updateUserRole);
router.post('/users/:id/remove', adminController.removeUser);

router.get('/manage-assigned-orders', adminController.getManageAssignedOrdersPage);
 router.get('/manage-assigned-orders/details/:deliveryAdminId/:type', adminController.getAssignedOrdersDetailForAdmin);
 router.post('/manage-assigned-orders/remove/:id', adminController.removeDeliveryAdminAssignment);

module.exports = router;
""",

    'routes/deliveryRoutes.js': """const express = require('express');
const deliveryController = require('../controllers/deliveryController');
const { isAuthenticated } = require('../middleware/authMiddleware');
const { isDeliveryAdmin } = require('../middleware/roleMiddleware');

const router = express.Router();

router.use(isAuthenticated, isDeliveryAdmin);

router.get('/dashboard', deliveryController.getDeliveryDashboard);

router.get('/orders/:type', deliveryController.getAssignedOrdersDetail);

router.post('/orders/mark-delivered/:orderId', deliveryController.markAsDelivered);

module.exports = router;
""",

    'views/partials/header.ejs': """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><%= title %> | Professional Ecommerce</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" integrity="sha512-DTOQO9RWCH3ppGqcWaEA1BIZOC6xxalwEsw9c2QQeAIftl+Vegovlnee1c9QX4TctnWMn13TZye+giMm8e2LwA==" crossorigin="anonymous" referrerpolicy="no-referrer" />
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap" rel="stylesheet">
    <link rel="icon" href="/favicon.ico" type="image/x-icon">
    <link rel="stylesheet" href="/css/style.css">
</head>
<body>
    <header class="app-header">
        <nav class="navbar">
            <div class="nav-left">
                <a href="/" class="app-logo">
                   <i class="fas fa-shopping-bag"></i> <span class="app-name">EcoPro</span>
                </a>
            </div>
            <div class="nav-center">

            </div>
            <div class="nav-right">
                <% if (currentUser) { %>
                    <a href="/" class="nav-link <%= currentUrl === '/' ? 'active' : '' %>">Home</a>
                     <a href="/user/cart" class="nav-link nav-link-cart <%= currentUrl === '/user/cart' ? 'active' : '' %>">
                         <i class="fas fa-shopping-cart"></i> Cart
                         <% if (cartItemCount > 0) { %>
                             <span class="cart-badge"><%= cartItemCount %></span>
                         <% } %>
                     </a>
                    <a href="/orders/my-orders" class="nav-link <%= currentUrl === '/orders/my-orders' ? 'active' : '' %>">My Orders</a>

                    <% if (currentUser.role === 'admin') { %>
                        <a href="/admin/dashboard" class="nav-link <%= currentUrl.startsWith('/admin') ? 'active' : '' %>">Admin Dashboard</a>
                    <% } %>

                     <% if (currentUser.role === 'delivery_admin') { %>
                        <a href="/delivery/dashboard" class="nav-link <%= currentUrl.startsWith('/delivery') ? 'active' : '' %>">Delivery Dashboard</a>
                     <% } %>

                     <form action="/auth/logout" method="POST" style="display: inline;">
                        <button type="submit" class="btn btn-logout">Logout (<%= currentUser.name %>)</button>
                     </form>
                <% } else { %>
                    <a href="/auth/login" class="btn btn-login-register">Login / Register</a>
                <% } %>
            </div>
        </nav>
    </header>

     <%- include('messages') %>


    <main class="container">

""",

    'views/partials/footer.ejs': """    </main>

    <footer class="app-footer">
        <p>&copy; <%= new Date().getFullYear() %> Professional Ecommerce. All rights reserved.</p>

    </footer>

    <script src="/js/main.js"></script>

</body>
</html>
""",

    'views/partials/messages.ejs': """<% if (success_msg && success_msg.length > 0) { %>
  <div class="alert alert-success" role="alert">
    <%= success_msg %>
    <button type="button" class="close-alert" onclick="this.parentElement.style.display='none';">&times;</button>
  </div>
<% } %>

<% if (error_msg && error_msg.length > 0) { %>
  <div class="alert alert-danger" role="alert">
    <%= error_msg %>
     <button type="button" class="close-alert" onclick="this.parentElement.style.display='none';">&times;</button>
  </div>
<% } %>

<% if (error && typeof error !== 'undefined' && error.length > 0) { %>
  <div class="alert alert-danger" role="alert">
    <%= error %>
     <button type="button" class="close-alert" onclick="this.parentElement.style.display='none';">&times;</button>
  </div>
<% } %>

""",

    'views/auth/login.ejs': """<%- include('../partials/header', { title: 'Login' }) %>

<div class="auth-container">
    <h1>Login</h1>

    <form action="/auth/login" method="POST" class="auth-form">
        <div class="form-group">
            <label for="email">Email:</label>
            <input type="email" id="email" name="email" required>
        </div>
        <div class="form-group">
            <label for="password">Password:</label>
            <input type="password" id="password" name="password" required>
        </div>
        <button type="submit" class="btn btn-primary">Login</button>
    </form>
    <div class="auth-links">
        <p><a href="/auth/forgot-password">Forgot Password?</a></p>
        <p>Don't have an account? <a href="/auth/register">Register here</a></p>
    </div>
</div>

<%- include('../partials/footer') %>

""",

    'views/auth/register.ejs': """<%- include('../partials/header', { title: 'Register' }) %>

<div class="auth-container">
    <h1>Register</h1>

    <form action="/auth/register" method="POST" class="auth-form">
         <div class="form-group">
            <label for="name">Name:</label>
            <input type="text" id="name" name="name" required>
        </div>
        <div class="form-group">
            <label for="email">Email:</label>
            <input type="email" id="email" name="email" required>
        </div>
        <div class="form-group">
            <label for="password">Password:</label>
            <input type="password" id="password" name="password" minlength="6" required>
        </div>
        <div class="form-group">
            <label for="confirmPassword">Confirm Password:</label>
            <input type="password" id="confirmPassword" name="confirmPassword" minlength="6" required>
        </div>
        <button type="submit" class="btn btn-primary">Register</button>
    </form>
    <div class="auth-links">
        <p>Already have an account? <a href="/auth/login">Login here</a></p>
    </div>
</div>

<%- include('../partials/footer') %>
""",

    'views/auth/verify-otp.ejs': """<%- include('../partials/header', { title: title || 'Verify OTP' }) %>

<div class="auth-container">
    <h1>Verify OTP</h1>
    <p>An OTP has been sent to <strong><%= email %></strong>. Please enter it below.</p>

    <form action="/auth/verify-otp" method="POST" class="auth-form">
         <input type="hidden" name="email" value="<%= email %>">
        <div class="form-group">
            <label for="otp">OTP Code:</label>
            <input type="text" id="otp" name="otp" required pattern="\\d{6}" title="Enter 6-digit OTP">
        </div>
        <button type="submit" class="btn btn-primary">Verify OTP</button>
    </form>
    <div class="auth-links">
        <p>Didn't receive the OTP?</p>
        <form action="/auth/resend-otp" method="POST" style="display:inline;">
             <input type="hidden" name="email" value="<%= email %>">
             <button type="submit" class="btn btn-secondary btn-sm">Resend OTP</button>
         </form>
    </div>
</div>

<%- include('../partials/footer') %>
""",

    'views/auth/forgot-password.ejs': """<%- include('../partials/header', { title: 'Forgot Password' }) %>

<div class="auth-container">
    <h1>Forgot Password</h1>
    <p>Enter your email address below. If an account exists, we'll send an OTP to verify your request.</p>

    <form action="/auth/forgot-password" method="POST" class="auth-form">
        <div class="form-group">
            <label for="email">Email:</label>
            <input type="email" id="email" name="email" required>
        </div>
        <button type="submit" class="btn btn-primary">Send Reset OTP</button>
    </form>
    <div class="auth-links">
        <p><a href="/auth/login">Back to Login</a></p>
    </div>
</div>

<%- include('../partials/footer') %>
""",

    'views/auth/reset-password.ejs': """<%- include('../partials/header', { title: 'Reset Password' }) %>

<div class="auth-container">
    <h1>Reset Password</h1>
    <p>Enter your new password below.</p>

    <form action="/auth/reset-password/<%= token %>" method="POST" class="auth-form">
        <div class="form-group">
            <label for="password">New Password:</label>
            <input type="password" id="password" name="password" minlength="6" required>
        </div>
        <div class="form-group">
            <label for="confirmPassword">Confirm New Password:</label>
            <input type="password" id="confirmPassword" name="confirmPassword" minlength="6" required>
        </div>
        <button type="submit" class="btn btn-primary">Reset Password</button>
    </form>
     <div class="auth-links">
        <p><a href="/auth/login">Back to Login</a></p>
    </div>
</div>

<%- include('../partials/footer') %>
""",

    'views/products/index.ejs': """<%- include('../partials/header', { title: title }) %>

<div class="product-index-container">
    <h1><%= title %></h1>

    <div class="search-bar-container">
        <form action="/products" method="GET" class="search-form">
            <input type="text" name="search" placeholder="Search products by name, category..." value="<%= searchTerm %>">
            <button type="submit" class="btn"><i class="fas fa-search"></i></button>
             <% if (searchTerm) { %>
                 <a href="/" class="btn btn-clear-search">Clear</a>
             <% } %>
        </form>
    </div>


    <% if (products.length > 0) { %>
        <div class="product-grid">
            <% products.forEach(product => { %>
                <div class="product-card">
                    <a href="/products/<%= product._id %>" class="product-link">
                        <img src="<%= product.imageUrl %>" alt="<%= product.name %>" class="product-image">
                        <div class="product-info">
                            <h3 class="product-name"><%= product.name %></h3>
                            <p class="product-price">$<%= product.price.toFixed(2) %></p>
                            <p class="product-stock">Stock: <%= product.stock %></p>
                            <% if (product.numReviews > 0) { %>
                                 <p class="product-rating">
                                    <% for(let i=1; i<=5; i++) { %>
                                        <i class="fas fa-star<%= i <= product.averageRating ? '' : (i - 0.5 <= product.averageRating ? '-half-alt' : '-regular') %>"></i>
                                    <% } %>
                                    (<%= product.numReviews %>)
                                 </p>
                            <% } %>
                        </div>
                    </a>
                     <form action="/user/cart/add" method="POST" class="add-to-cart-form">
                         <input type="hidden" name="productId" value="<%= product._id %>">
                         <input type="hidden" name="quantity" value="1">
                        <button type="submit" class="btn btn-primary btn-add-to-cart" <%= product.stock <= 0 ? 'disabled' : '' %>>
                            <i class="fas fa-cart-plus"></i> <%= product.stock <= 0 ? 'Out of Stock' : 'Add to Cart' %>
                         </button>
                    </form>
                </div>
            <% }) %>
        </div>
    <% } else { %>
        <p>No products found matching your search criteria.</p>
    <% } %>

</div>

<%- include('../partials/footer') %>

""",

    'views/products/detail.ejs': """ <%- include('../partials/header', { title: product.name }) %>

 <div class="product-detail-container">
    <div class="product-detail-main">
         <div class="product-detail-image">
            <img src="<%= product.imageUrl %>" alt="<%= product.name %>">
         </div>
        <div class="product-detail-info">
             <h1><%= product.name %></h1>
             <p class="detail-price">$<%= product.price.toFixed(2) %></p>
            <p class="detail-stock">Available Stock: <%= product.stock %></p>

            <% if (product.numReviews > 0) { %>
                 <p class="detail-rating">
                     Rating:
                    <% for(let i=1; i<=5; i++) { %>
                        <i class="fas fa-star<%= i <= product.averageRating ? '' : (i - 0.5 <= product.averageRating ? '-half-alt' : '-regular') %>"></i>
                    <% } %>
                     (<%= product.numReviews %> reviews) | <%= product.orderCount %> Ordered
                 </p>
             <% } else { %>
                 <p class="detail-rating">No reviews yet | <%= product.orderCount %> Ordered</p>
             <% } %>

             <p>Seller: <%= product.sellerEmail %></p>

            <div class="product-actions">
                 <form action="/user/cart/add" method="POST" style="display: inline-block; margin-right: 10px;">
                    <input type="hidden" name="productId" value="<%= product._id %>">
                     <div class="quantity-selector">
                        <label for="quantity">Qty:</label>
                         <input type="number" id="quantity" name="quantity" value="1" min="1" max="<%= product.stock %>" required>
                     </div>
                     <button type="submit" class="btn btn-primary" <%= product.stock <= 0 ? 'disabled' : '' %>>
                         <i class="fas fa-cart-plus"></i> <%= product.stock <= 0 ? 'Out of Stock' : 'Add to Cart' %>
                     </button>
                </form>

                  <% if (product.stock > 0) { %>
                  <form action="/user/cart/add?redirectTo=checkout" method="POST" style="display: inline-block;">
                        <input type="hidden" name="productId" value="<%= product._id %>">
                        <input type="hidden" name="quantity" value="1">
                       <button type="submit" class="btn btn-success">Buy Now</button>
                     </form>
                  <% } else {%>
                    <button class="btn btn-success" disabled>Buy Now</button>
                  <% } %>

            </div>

             <div class="share-buttons">
                 Share: <a href="#" onclick="alert('Share functionality to be implemented'); return false;"><i class="fas fa-share-alt"></i> All Share Options</a>
             </div>


            <div class="product-specifications">
                 <h3>Specifications</h3>
                 <pre><%= product.specifications || 'No specifications provided.' %></pre>
             </div>
        </div>
     </div>

    <div class="product-rating-section">
         <h3>Rate This Product</h3>
         <% if (userCanRate) { %>
             <form action="/products/<%= product._id %>/rate" method="POST">
                 <div class="rating-stars">
                     <% for (let i = 5; i >= 1; i--) { %>
                        <input type="radio" id="star<%= i %>" name="rating" value="<%= i %>" <%= userRating === i ? 'checked' : '' %> required>
                        <label for="star<%= i %>" title="<%= i %> stars"><i class="fas fa-star"></i></label>
                     <% } %>
                 </div>
                 <button type="submit" class="btn btn-primary">Submit Rating</button>
             </form>
         <% } else { %>
            <p><a href="/auth/login?returnTo=<%= encodeURIComponent(currentUrl) %>">Login</a> to rate this product.</p>
         <% } %>
    </div>

     <% if (product.ratings && product.ratings.length > 0) { %>
        <div class="product-reviews">
             <h3>Customer Reviews</h3>
         </div>
     <% } %>

</div>

 <%- include('../partials/footer') %>
""",

    'views/user/cart.ejs': """<%- include('../partials/header', { title: 'Shopping Cart' }) %>

<div class="cart-container">
    <h1>Your Shopping Cart</h1>

    <% if (cart.length > 0) { %>
        <div class="cart-items">
            <% cart.forEach(item => { %>
                <div class="cart-item" data-product-id="<%= item.productId %>">
                    <div class="cart-item-image">
                        <img src="<%= item.imageUrl %>" alt="<%= item.name %>">
                    </div>
                    <div class="cart-item-details">
                        <h3 class="cart-item-name"><%= item.name %></h3>
                        <p class="cart-item-price">$<%= item.price.toFixed(2) %></p>
                         <p class="cart-item-stock">Stock: <%= item.stock %></p>
                    </div>
                    <div class="cart-item-quantity">
                        <label for="quantity-<%= item.productId %>">Qty:</label>
                        <input type="number"
                               id="quantity-<%= item.productId %>"
                               class="quantity-input"
                               name="quantity"
                               value="<%= item.quantity %>"
                               min="0"
                               max="<%= item.stock %>"
                               data-product-id="<%= item.productId %>"
                               data-item-price="<%= item.price %>">
                        <button class="btn btn-secondary btn-sm btn-update-qty" data-product-id="<%= item.productId %>">Update</button>
                     </div>
                     <div class="cart-item-subtotal">
                         Subtotal: $<span class="item-subtotal-value"><%= item.subtotal.toFixed(2) %></span>
                    </div>
                    <div class="cart-item-remove">
                        <form action="/user/cart/remove/<%= item.productId %>" method="POST">
                            <button type="submit" class="btn btn-danger btn-sm">&times; Remove</button>
                         </form>
                     </div>
                </div>
            <% }) %>
        </div>

         <div class="cart-summary">
             <h2>Cart Total: $<span id="cart-total-value"><%= cartTotal.toFixed(2) %></span></h2>
             <a href="/user/checkout" class="btn btn-success btn-checkout">Proceed to Checkout</a>
        </div>

    <% } else { %>
        <p>Your cart is empty. <a href="/">Continue Shopping</a></p>
    <% } %>
</div>

 <%- include('../partials/footer') %>
""",

    'views/user/checkout.ejs': """<%- include('../partials/header', { title: 'Checkout' }) %>

<div class="checkout-container">
    <h1>Checkout</h1>

    <div class="checkout-grid">
        <div class="checkout-address">
            <h2>Shipping Address</h2>
            <% if (userAddress && userAddress.name) { %>
                <div class="saved-address">
                    <p><strong><%= userAddress.name %></strong></p>
                    <p><%= userAddress.phone %></p>
                    <p><%= userAddress.landmarkNearby ? userAddress.landmarkNearby + ', ' : '' %><%= userAddress.cityVillage %></p>
                    <p>Pincode: <%= userAddress.pincode %></p>
                    <button type="button" id="edit-address-btn" class="btn btn-secondary btn-sm">Edit Address</button>
                </div>
             <% } %>

            <form action="/user/address/save" method="POST" id="address-form" class="address-form <%= (userAddress && userAddress.name) ? 'hidden' : '' %>">
                <h3><%= (userAddress && userAddress.name) ? 'Edit Address' : 'Add Address' %></h3>
                <div class="form-group">
                    <label for="name">Full Name:</label>
                    <input type="text" id="name" name="name" value="<%= userAddress?.name || '' %>" required>
                </div>
                <div class="form-group">
                    <label for="phone">Phone Number:</label>
                    <input type="tel" id="phone" name="phone" value="<%= userAddress?.phone || '' %>" required>
                </div>
                 <div class="form-group">
                    <label for="pincode">Pincode:</label>
                     <input type="text" id="pincode" name="pincode" value="<%= userAddress?.pincode || '' %>" required>
                </div>
                 <div class="form-group">
                    <label for="cityVillage">City / Village:</label>
                     <input type="text" id="cityVillage" name="cityVillage" value="<%= userAddress?.cityVillage || '' %>" required>
                </div>
                <div class="form-group">
                    <label for="landmarkNearby">Landmark / Nearby (Optional):</label>
                     <input type="text" id="landmarkNearby" name="landmarkNearby" value="<%= userAddress?.landmarkNearby || '' %>">
                </div>
                <button type="submit" class="btn btn-primary">Save Address</button>
                <% if (userAddress && userAddress.name) { %>
                    <button type="button" id="cancel-edit-btn" class="btn btn-secondary">Cancel Edit</button>
                <% } %>
             </form>
        </div>

         <div class="checkout-summary">
             <h2>Order Summary</h2>
             <div class="checkout-items">
                 <% items.forEach(item => { %>
                    <div class="checkout-item">
                         <img src="<%= item.imageUrl %>" alt="<%= item.name %>" class="checkout-item-image">
                        <div class="checkout-item-info">
                             <%= item.name %> (Qty: <%= item.quantity %>)
                        </div>
                        <div class="checkout-item-price">$<%= item.itemTotal.toFixed(2) %></div>
                     </div>
                <% }) %>
            </div>
            <hr>
            <div class="checkout-totals">
                <p>Subtotal: <span>$<%= subTotal.toFixed(2) %></span></p>
                 <p>Shipping: <span>FREE</span></p>
                <hr>
                 <p><strong>Total: <span>$<%= totalAmount.toFixed(2) %></span></strong></p>
            </div>

            <div class="checkout-payment">
                <h3>Payment Method</h3>
                 <div class="payment-option selected">
                     <input type="radio" id="cod" name="paymentMethod" value="COD" checked disabled>
                     <label for="cod"><i class="fas fa-money-bill-wave"></i> Cash on Delivery (COD)</label>
                 </div>
            </div>

            <form action="/orders/place" method="POST" class="place-order-form">
                 <input type="hidden" name="paymentMethod" value="COD">
                 <button type="submit" class="btn btn-success btn-block btn-place-order" <%= (!userAddress || !userAddress.name) ? 'disabled' : '' %>>
                    Place Order
                 </button>
                 <% if (!userAddress || !userAddress.name) { %>
                    <p class="text-danger small">Please save your shipping address first.</p>
                 <% } %>
             </form>
         </div>
    </div>
</div>


 <%- include('../partials/footer') %>

 <script>
    const editBtn = document.getElementById('edit-address-btn');
    const cancelBtn = document.getElementById('cancel-edit-btn');
    const addressForm = document.getElementById('address-form');
    const savedAddressDiv = document.querySelector('.saved-address');
    const placeOrderBtn = document.querySelector('.btn-place-order');
    const formTitle = addressForm.querySelector('h3');

    if(editBtn) {
         editBtn.addEventListener('click', () => {
             addressForm.classList.remove('hidden');
             if (savedAddressDiv) savedAddressDiv.classList.add('hidden');
             if(placeOrderBtn) placeOrderBtn.disabled = true;
             if(formTitle) formTitle.textContent = 'Edit Address';
         });
    }
     if(cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            addressForm.classList.add('hidden');
            if (savedAddressDiv) savedAddressDiv.classList.remove('hidden');
            if(placeOrderBtn) placeOrderBtn.disabled = false;
             // Optionally clear form fields on cancel or repopulate with original if needed
        });
     }
     // If initially no address, ensure place order button is disabled
     if (placeOrderBtn && (!savedAddressDiv || savedAddressDiv.classList.contains('hidden')) && addressForm.classList.contains('hidden')) {
        addressForm.classList.remove('hidden'); // Show form if no address saved
         if (formTitle) formTitle.textContent = 'Add Address';
     }
      if (placeOrderBtn && (!'<%= userAddress?.name %>')){
        placeOrderBtn.disabled = true;
      }

 </script>

""",

    'views/user/my-orders.ejs': """<%- include('../partials/header', { title: 'My Orders' }) %>

<div class="my-orders-container">
    <h1>My Orders</h1>

    <% if (orders.length > 0) { %>
        <div class="order-list">
            <% orders.forEach(order => { %>
                <div class="order-card status-<%= order.status.toLowerCase().replace(/ /g, '-') %>">
                     <div class="order-header">
                         <div><strong>Order ID:</strong> <%= order._id %></div>
                        <div><strong>Placed on:</strong> <%= order.formattedOrderDate %></div>
                        <div><strong>Total:</strong> $<%= order.totalAmount.toFixed(2) %></div>
                         <div><strong>Status:</strong> <span class="order-status"><%= order.status %></span></div>
                     </div>
                    <div class="order-body">
                         <div class="order-items-preview">
                             <% order.products.slice(0, 3).forEach(item => { %>
                                 <img src="<%= item.imageUrl %>" alt="<%= item.name %>" title="<%= item.name %> (Qty: <%= item.quantity %>)">
                             <% }) %>
                             <% if(order.products.length > 3) { %><span class="more-items">+ <%= order.products.length - 3 %> more</span><% } %>
                        </div>
                        <div class="order-details">
                             <p><strong>Shipping To:</strong> <%= order.shippingAddress.name %>, <%= order.shippingAddress.cityVillage %>, Pin: <%= order.shippingAddress.pincode %></p>
                             <p><strong>Delivered By:</strong> <%= order.formattedReceivedDate %></p>
                              <p><strong>Assigned:</strong> <%= order.assignedAdminEmail || 'Not Assigned Yet' %></p>
                         </div>
                    </div>
                     <div class="order-actions">
                        <% if (order.isCancellable) { %>
                            <form action="/orders/cancel/<%= order._id %>" method="POST" onsubmit="return confirm('Are you sure you want to cancel this order?');">
                                <button type="submit" class="btn btn-danger">Cancel Order</button>
                             </form>
                         <% } else if (order.status === 'Pending') { %>
                             <small class="text-muted">Cancellation window expired or order processing.</small>
                         <% } %>

                     </div>
                </div>
            <% }) %>
        </div>
    <% } else { %>
        <p>You haven't placed any orders yet. <a href="/">Start Shopping!</a></p>
    <% } %>
</div>

<%- include('../partials/footer') %>

""",

    'views/admin/dashboard.ejs': """<%- include('../partials/header', { title: 'Admin Dashboard' }) %>

<div class="admin-dashboard-container">
    <h1>Admin Dashboard</h1>
    <p>Welcome, <%= currentUser.name %>!</p>

    <div class="admin-actions-grid">
         <a href="/admin/upload-product" class="admin-action-card">
            <i class="fas fa-upload"></i>
            <h3>Upload Products</h3>
            <p>Add new products to the store.</p>
        </a>
         <a href="/admin/manage-products" class="admin-action-card">
            <i class="fas fa-edit"></i>
            <h3>Manage Products</h3>
            <p>Edit or remove existing products.</p>
         </a>
        <a href="/admin/manage-orders" class="admin-action-card">
             <i class="fas fa-clipboard-list"></i>
             <h3>Manage Orders</h3>
             <p>View, verify, and assign orders.</p>
        </a>
        <a href="/admin/manage-users" class="admin-action-card">
             <i class="fas fa-users-cog"></i>
             <h3>Manage Users</h3>
             <p>Update roles or remove users.</p>
        </a>
         <a href="/admin/manage-assigned-orders" class="admin-action-card">
            <i class="fas fa-shipping-fast"></i>
            <h3>Manage Assigned Orders</h3>
             <p>Track delivery admin progress.</p>
         </a>
        </div>
    </div>

 <%- include('../partials/footer') %>
""",

    'views/admin/upload-product.ejs': """<%- include('../partials/header', { title: 'Upload New Product' }) %>

<div class="admin-manage-container">
    <h1>Upload New Product</h1>

     <form action="/admin/upload-product" method="POST">
        <div class="form-group">
             <label for="name">Product Name:</label>
            <input type="text" id="name" name="name" required>
         </div>
        <div class="form-group">
            <label for="category">Category:</label>
             <input type="text" id="category" name="category" required>
         </div>
         <div class="form-group">
            <label for="price">Price:</label>
            <input type="number" id="price" name="price" step="0.01" min="0" required>
         </div>
        <div class="form-group">
             <label for="stock">Stock Quantity:</label>
             <input type="number" id="stock" name="stock" min="0" required>
        </div>
         <div class="form-group">
             <label for="imageUrl">Image URL:</label>
             <input type="url" id="imageUrl" name="imageUrl" required>
         </div>
         <div class="form-group">
             <label for="specifications">Specifications:</label>
             <textarea id="specifications" name="specifications" rows="5"></textarea>
        </div>
         <button type="submit" class="btn btn-primary">Upload Product</button>
         <a href="/admin/dashboard" class="btn btn-secondary">Cancel</a>
    </form>
 </div>

 <%- include('../partials/footer') %>
""",

    'views/admin/manage-products.ejs': """ <%- include('../partials/header', { title: 'Manage Products' }) %>

 <div class="admin-manage-container">
     <h1>Manage Products</h1>
    <a href="/admin/upload-product" class="btn btn-success mb-3" style="margin-bottom: 15px;">Upload New Product</a>

    <% if (products.length > 0) { %>
        <table class="data-table">
            <thead>
                <tr>
                    <th>Image</th>
                    <th>Name</th>
                     <th>Category</th>
                    <th>Price</th>
                    <th>Stock</th>
                    <th>Sold</th>
                    <th>Rating</th>
                     <th>Actions</th>
                </tr>
             </thead>
             <tbody>
                <% products.forEach(product => { %>
                    <tr>
                        <td><img src="<%= product.imageUrl %>" alt="<%= product.name %>" class="table-img"></td>
                         <td><%= product.name %></td>
                         <td><%= product.category %></td>
                        <td>$<%= product.price.toFixed(2) %></td>
                        <td><%= product.stock %></td>
                         <td><%= product.orderCount %></td>
                         <td><%= product.averageRating.toFixed(1) %> (<%= product.numReviews %>)</td>
                         <td class="actions-cell">
                            <a href="/admin/manage-products/edit/<%= product._id %>" class="btn btn-info btn-sm"><i class="fas fa-edit"></i> Edit</a>
                            <form action="/admin/manage-products/remove/<%= product._id %>" method="POST" class="inline-form" onsubmit="return confirm('Are you sure you want to remove this product: <%= product.name %>?');">
                                 <button type="submit" class="btn btn-danger btn-sm"><i class="fas fa-trash"></i> Remove</button>
                            </form>
                        </td>
                     </tr>
                 <% }) %>
            </tbody>
         </table>
    <% } else { %>
         <p>No products found. <a href="/admin/upload-product">Upload the first product!</a></p>
    <% } %>
 </div>

 <%- include('../partials/footer') %>
""",

    'views/admin/edit-product.ejs': """<%- include('../partials/header', { title: title }) %>

<div class="admin-manage-container">
    <h1><%= title %></h1>

     <form action="/admin/manage-products/update/<%= product._id %>" method="POST">
        <div class="form-group">
             <label for="name">Product Name:</label>
            <input type="text" id="name" name="name" value="<%= product.name %>" required>
         </div>
        <div class="form-group">
            <label for="category">Category:</label>
             <input type="text" id="category" name="category" value="<%= product.category %>" required>
         </div>
         <div class="form-group">
            <label for="price">Price:</label>
            <input type="number" id="price" name="price" step="0.01" min="0" value="<%= product.price %>" required>
         </div>
        <div class="form-group">
             <label for="stock">Stock Quantity:</label>
             <input type="number" id="stock" name="stock" min="0" value="<%= product.stock %>" required>
        </div>
         <div class="form-group">
             <label for="imageUrl">Image URL:</label>
             <input type="url" id="imageUrl" name="imageUrl" value="<%= product.imageUrl %>" required>
             <% if(product.imageUrl) { %> <img src="<%= product.imageUrl %>" alt="Current Image" style="max-width: 100px; margin-top: 5px;"> <% } %>
         </div>
         <div class="form-group">
             <label for="specifications">Specifications:</label>
             <textarea id="specifications" name="specifications" rows="5"><%= product.specifications %></textarea>
        </div>
         <button type="submit" class="btn btn-primary">Update Product</button>
         <a href="/admin/manage-products" class="btn btn-secondary">Cancel</a>
    </form>
 </div>

 <%- include('../partials/footer') %>
""",

    'views/admin/manage-orders.ejs': """<%- include('../partials/header', { title: 'Manage Orders' }) %>

<div class="admin-manage-container">
    <h1>Manage Orders</h1>

    <% if (orders.length > 0) { %>
        <table class="data-table">
            <thead>
                <tr>
                    <th>Order ID</th>
                    <th>Date</th>
                    <th>Customer</th>
                     <th>Address</th>
                    <th>Items</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th>Actions</th>
                </tr>
             </thead>
            <tbody>
                <% orders.forEach(order => { %>
                    <tr>
                        <td><%= order._id %></td>
                         <td><%= order.formattedOrderDate %></td>
                         <td><%= order.userEmail %></td>
                         <td>
                            <%= order.shippingAddress.name %>, <%= order.shippingAddress.cityVillage %>, <%= order.shippingAddress.pincode %>
                         </td>
                        <td>
                            <%= order.products.map(p => `${p.name} (x${p.quantity})`).join(', ').substring(0, 50) %>...
                         </td>
                        <td>$<%= order.totalAmount.toFixed(2) %></td>
                        <td>
                             <span class="status-badge status-<%= order.status.toLowerCase().replace(/ /g, '-') %>"><%= order.status %></span>
                            <% if(order.assignedAdminEmail) { %>
                                <br><small>(Assigned: <%= order.assignedAdminEmail %>)</small>
                            <% } %>
                        </td>
                        <td class="actions-cell">
                            <% if (order.needsVerification) { %>
                                 <form action="/admin/orders/<%= order._id %>/send-otp" method="POST" class="inline-form">
                                     <button type="submit" class="btn btn-warning btn-sm" title="Send verification OTP to customer"><i class="fas fa-paper-plane"></i> Send OTP</button>
                                 </form>
                                 <form action="/admin/orders/<%= order._id %>/verify-otp" method="POST" class="inline-form verify-otp-form">
                                     <input type="text" name="otp" placeholder="Enter OTP" required size="6" pattern="\\d{6}">
                                     <button type="submit" class="btn btn-success btn-sm"><i class="fas fa-check"></i> Verify</button>
                                 </form>

                            <% } else if (order.isVerified && order.status !== 'Cancelled' && order.status !== 'Delivered') { %>
                                <span class="verified-badge"><i class="fas fa-check-circle"></i> Verified</span>
                            <% } %>

                            <% if (order.status === 'Order Received' && deliveryAdmins && deliveryAdmins.length > 0) { %>
                                <form action="/admin/orders/<%= order._id %>/assign" method="POST" class="inline-form assign-order-form">
                                    <select name="deliveryAdminId" required>
                                        <option value="" disabled selected>Assign to...</option>
                                        <% deliveryAdmins.forEach(admin => { %>
                                             <option value="<%= admin._id %>"><%= admin.email %></option>
                                        <% }) %>
                                     </select>
                                     <button type="submit" class="btn btn-info btn-sm"><i class="fas fa-shipping-fast"></i> Assign & Ship</button>
                                 </form>
                            <% } else if (order.status === 'Order Received') { %>
                                 <small class="text-danger">No delivery admins available</small>
                            <% } %>

                         </td>
                    </tr>
                <% }) %>
             </tbody>
        </table>
    <% } else { %>
        <p>No orders received yet.</p>
    <% } %>
</div>

<%- include('../partials/footer') %>
""",

    'views/admin/manage-users.ejs': """ <%- include('../partials/header', { title: 'Manage Users' }) %>

<div class="admin-manage-container">
    <h1>Manage Users</h1>

    <% if (users.length > 0) { %>
         <table class="data-table">
             <thead>
                <tr>
                     <th>Name</th>
                    <th>Email</th>
                     <th>Role</th>
                     <th>Registered On</th>
                     <th>Verified</th>
                    <th>Actions</th>
                 </tr>
             </thead>
            <tbody>
                <% users.forEach(user => { %>
                    <tr>
                         <td><%= user.name %></td>
                        <td><%= user.email %></td>
                        <td>
                            <form action="/admin/users/<%= user._id %>/update-role" method="POST" class="inline-form">
                                 <select name="role" onchange="this.form.submit()">
                                     <option value="user" <%= user.role === 'user' ? 'selected' : '' %>>User</option>
                                    <option value="admin" <%= user.role === 'admin' ? 'selected' : '' %>>Admin</option>
                                     <option value="delivery_admin" <%= user.role === 'delivery_admin' ? 'selected' : '' %>>Delivery Admin</option>
                                 </select>
                                 <noscript><button type="submit" class="btn btn-sm btn-primary">Update Role</button></noscript>
                            </form>
                        </td>
                         <td><%= new Date(user.createdAt).toLocaleDateString() %></td>
                         <td><%= user.isVerified ? 'Yes' : 'No' %></td>
                         <td class="actions-cell">
                             <form action="/admin/users/<%= user._id %>/remove" method="POST" class="inline-form" onsubmit="return confirm('Are you sure you want to remove user <%= user.email %>? This is irreversible.');">
                                <button type="submit" class="btn btn-danger btn-sm"><i class="fas fa-user-times"></i> Remove</button>
                            </form>
                         </td>
                    </tr>
                 <% }) %>
            </tbody>
        </table>
     <% } else { %>
         <p>No other users registered.</p>
    <% } %>
</div>

<%- include('../partials/footer') %>
""",

    'views/admin/manage-assigned-orders.ejs': """ <%- include('../partials/header', { title: 'Manage Assigned Orders' }) %>

 <div class="admin-manage-container">
     <h1>Manage Delivery Admins & Assigned Orders</h1>

     <% if (deliveryAdmins.length > 0) { %>
         <table class="data-table">
             <thead>
                <tr>
                     <th>Delivery Admin</th>
                    <th>Total Assigned</th>
                    <th>Pending Deliveries</th>
                     <th>Delivered</th>
                     <th>Actions</th>
                </tr>
            </thead>
             <tbody>
                <% deliveryAdmins.forEach(admin => { %>
                    <tr>
                         <td><%= admin.email %></td>
                         <td><a href="/admin/manage-assigned-orders/details/<%= admin._id %>/total"><%= admin.totalAssigned %></a></td>
                         <td><a href="/admin/manage-assigned-orders/details/<%= admin._id %>/pending"><%= admin.pendingCount %></a></td>
                         <td><a href="/admin/manage-assigned-orders/details/<%= admin._id %>/delivered"><%= admin.deliveredCount %></a></td>
                        <td class="actions-cell">
                             <form action="/admin/manage-assigned-orders/remove/<%= admin._id %>" method="POST" class="inline-form" onsubmit="return confirm('Are you sure you want to REMOVE Delivery Admin <%= admin.email %>? This will also unassign their active orders.');">
                                <button type="submit" class="btn btn-danger btn-sm"><i class="fas fa-user-times"></i> Remove Admin & Unassign Orders</button>
                            </form>
                        </td>
                    </tr>
                 <% }) %>
             </tbody>
         </table>
     <% } else { %>
        <p>No users found with the 'delivery_admin' role. <a href="/admin/manage-users">Manage users</a> to assign the role.</p>
     <% } %>
 </div>

 <%- include('../partials/footer') %>
""",

    'views/admin/assigned-orders-detail.ejs': """ <%- include('../partials/header', { title: title }) %>

<div class="admin-manage-container">
    <h1><%= title %></h1>
    <p><a href="/admin/manage-assigned-orders">&laquo; Back to Delivery Admin Overview</a></p>

    <% if (orders.length > 0) { %>
        <table class="data-table">
            <thead>
                 <tr>
                    <th>Order ID</th>
                    <th>Placed Date</th>
                     <th>Customer Email</th>
                     <th>Address</th>
                     <th>Items</th>
                    <th>Total</th>
                     <th>Status</th>
                     <th>Delivered Date</th>
                 </tr>
             </thead>
            <tbody>
                <% orders.forEach(order => { %>
                    <tr>
                         <td><%= order._id %></td>
                         <td><%= order.formattedOrderDate %></td>
                        <td><%= order.userEmail %></td>
                        <td>
                             <%= order.shippingAddress.name %>, <%= order.shippingAddress.cityVillage %>, <%= order.shippingAddress.pincode %>
                             <br>Ph: <%= order.shippingAddress.phone %>
                         </td>
                         <td><%= order.products.map(p => `${p.name} (x${p.quantity})`).join(', ').substring(0, 50) %>...</td>
                         <td>$<%= order.totalAmount.toFixed(2) %></td>
                         <td><span class="status-badge status-<%= order.status.toLowerCase().replace(/ /g, '-') %>"><%= order.status %></span></td>
                         <td><%= order.formattedReceivedDate %></td>
                    </tr>
                <% }) %>
             </tbody>
        </table>
     <% } else { %>
         <p>No orders found matching this criteria for <%= deliveryAdminEmail %>.</p>
     <% } %>
</div>

<%- include('../partials/footer') %>
""",

    'views/delivery/dashboard.ejs': """<%- include('../partials/header', { title: 'Delivery Dashboard' }) %>

<div class="delivery-dashboard-container">
    <h1>My Delivery Dashboard</h1>
    <p>Welcome, <%= currentUser.name %> (<%= assignedAdminEmail %>)!</p>

    <div class="delivery-stats-grid">
         <div class="stat-card">
            <h2><%= totalAssigned %></h2>
            <p>Total Assigned Orders</p>
            <a href="/delivery/orders/total" class="btn btn-primary">View All</a>
         </div>
        <div class="stat-card">
            <h2><%= pendingCount %></h2>
            <p>Pending Deliveries</p>
            <a href="/delivery/orders/pending" class="btn btn-warning">View Pending</a>
         </div>
        <div class="stat-card">
            <h2><%= deliveredCount %></h2>
            <p>Completed Deliveries</p>
            <a href="/delivery/orders/delivered" class="btn btn-success">View Delivered</a>
        </div>
     </div>
</div>

 <%- include('../partials/footer') %>
""",

    'views/delivery/assigned-orders-detail.ejs': """<%- include('../partials/header', { title: title }) %>

<div class="delivery-orders-detail-container admin-manage-container">
    <h1><%= title %></h1>
     <p><a href="/delivery/dashboard">&laquo; Back to Delivery Dashboard</a></p>


    <% if (orders.length > 0) { %>
        <table class="data-table">
            <thead>
                <tr>
                     <th>Order ID</th>
                     <th>Placed Date</th>
                    <th>Customer</th>
                     <th>Address & Phone</th>
                    <th>Items</th>
                     <th>Status</th>
                     <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                <% orders.forEach(order => { %>
                    <tr>
                         <td><%= order._id %></td>
                         <td><%= order.formattedOrderDate %></td>
                         <td><%= order.shippingAddress.name %></td>
                         <td>
                            <%= order.shippingAddress.cityVillage %>, <%= order.shippingAddress.pincode %>
                             <br>Ph: <%= order.shippingAddress.phone %>
                             <br><small>Landmark: <%= order.shippingAddress.landmarkNearby || 'N/A' %></small>
                        </td>
                         <td><%= order.products.map(p => `${p.name} (x${p.quantity})`).join(', ').substring(0, 50) %>...</td>
                        <td>
                            <span class="status-badge status-<%= order.status.toLowerCase().replace(/ /g, '-') %>"><%= order.status %></span>
                            <% if(order.status === 'Delivered' && order.formattedReceivedDate) { %>
                                 <br><small>(Delivered: <%= order.formattedReceivedDate %>)</small>
                            <% } %>
                         </td>
                        <td class="actions-cell">
                            <% if (order.canMarkDelivered) { %>
                                <form action="/delivery/orders/mark-delivered/<%= order._id %>" method="POST" class="inline-form" onsubmit="return confirm('Mark order <%= order._id %> as Delivered?')">
                                    <button type="submit" class="btn btn-success btn-sm"><i class="fas fa-check-double"></i> Mark Delivered</button>
                                 </form>
                            <% } %>

                         </td>
                    </tr>
                <% }) %>
            </tbody>
         </table>
     <% } else { %>
         <p>No orders found matching this criteria.</p>
     <% } %>
</div>

<%- include('../partials/footer') %>
""",

    'views/error.ejs': """<%- include('./partials/header', { title: 'Error' }) %>

<div class="error-container container">
    <h1>Error <%= typeof statusCode !== 'undefined' ? statusCode : '' %></h1>
    <p class="lead text-danger"><%= message %></p>

    <% if (process.env.NODE_ENV === 'development' && stack) { %>
        <details style="white-space: pre-wrap; margin-top: 20px; background: #f1f1f1; padding: 10px; border-radius: 5px; font-size: 0.8em;">
            <summary>Stack Trace (Development Mode)</summary>
            <code><%= stack %></code>
        </details>
    <% } %>

    <p style="margin-top: 20px;"><a href="/" class="btn btn-primary">Go back to Home</a></p>
</div>

<%- include('./partials/footer') %>
""",

    'public/css/style.css': """:root {
    --primary-color: #4285F4;
    --secondary-color: #34A853;
    --danger-color: #EA4335;
    --warning-color: #FBBC05;
    --light-grey: #f5f5f5;
    --medium-grey: #e0e0e0;
    --dark-grey: #757575;
    --text-color: #212121;
    --white: #ffffff;
    --body-font: 'Roboto', sans-serif;
    --card-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    --border-radius: 4px;
}

* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: var(--body-font); line-height: 1.6; color: var(--text-color); background-color: #f8f9fa; }
a { color: var(--primary-color); text-decoration: none; }
a:hover { text-decoration: underline; }
img { max-width: 100%; height: auto; display: block; }
ul { list-style: none; }
pre { background-color: #eee; padding: 10px; border-radius: var(--border-radius); overflow-x: auto; font-size: 0.9em; font-family: monospace;}
table { width: 100%; border-collapse: collapse; margin-bottom: 1rem; background-color: var(--white); box-shadow: var(--card-shadow); border-radius: var(--border-radius); overflow: hidden;}
th, td { padding: 0.8rem 1rem; text-align: left; border-bottom: 1px solid var(--medium-grey); vertical-align: middle;}
th { background-color: var(--light-grey); font-weight: 500; white-space: nowrap;}
tr:last-child td { border-bottom: none; }
tr:hover { background-color: #f1f1f1;}
.container { max-width: 1200px; margin: 20px auto; padding: 0 15px; }
main.container { background-color: var(--white); padding: 25px; border-radius: var(--border-radius); box-shadow: var(--card-shadow); min-height: 70vh; }


.hidden { display: none !important; }
.text-danger { color: var(--danger-color); }
.text-muted { color: var(--dark-grey); }
.small { font-size: 0.9em; }
.inline-form { display: inline-block; margin: 0 5px 5px 0; vertical-align: middle;}
.btn-block { display: block; width: 100%; }
.mb-3 { margin-bottom: 1rem !important;}

.app-header { background-color: var(--white); box-shadow: var(--card-shadow); padding: 0 20px; position: sticky; top: 0; z-index: 100; }
.navbar { display: flex; justify-content: space-between; align-items: center; height: 60px; max-width: 1200px; margin: 0 auto; }
.app-logo { display: flex; align-items: center; font-size: 1.5em; font-weight: 500; color: var(--text-color); }
.app-logo i { margin-right: 8px; color: var(--primary-color); }
.app-name { font-weight: bold; }
.nav-right a, .nav-right form { margin-left: 15px; }
.nav-link { color: var(--dark-grey); position: relative; padding-bottom: 5px; transition: color 0.2s;}
.nav-link:hover { color: var(--primary-color); text-decoration: none;}
.nav-link.active { color: var(--primary-color); font-weight: 500; }
.nav-link.active::after { content: ''; position: absolute; bottom: 0; left: 0; width: 100%; height: 2px; background-color: var(--primary-color); }
.nav-link-cart { position: relative; }
.cart-badge { position: absolute; top: -8px; right: -10px; background-color: var(--danger-color); color: white; border-radius: 50%; padding: 2px 6px; font-size: 0.7em; line-height: 1; }


.app-footer { text-align: center; margin-top: 30px; padding: 20px; background-color: var(--white); border-top: 1px solid var(--medium-grey); color: var(--dark-grey); font-size: 0.9em; }

.btn {
    display: inline-block;
    font-weight: 400;
    text-align: center;
    vertical-align: middle;
    cursor: pointer;
    border: 1px solid transparent;
    padding: 0.5rem 1rem;
    font-size: 1rem;
    border-radius: var(--border-radius);
    transition: all 0.15s ease-in-out;
    white-space: nowrap;
}
.btn i { margin-right: 5px; }
.btn:disabled { opacity: 0.65; cursor: not-allowed; }
.btn-primary { color: var(--white); background-color: var(--primary-color); border-color: var(--primary-color); }
.btn-primary:hover:not(:disabled) { background-color: #3367D6; border-color: #3367D6; color: var(--white); text-decoration: none;}
.btn-secondary { color: var(--text-color); background-color: var(--medium-grey); border-color: var(--medium-grey); }
.btn-secondary:hover:not(:disabled) { background-color: #ccc; border-color: #ccc; color: var(--text-color); text-decoration: none;}
.btn-success { color: var(--white); background-color: var(--secondary-color); border-color: var(--secondary-color); }
.btn-success:hover:not(:disabled) { background-color: #2d8e49; border-color: #2d8e49; color: var(--white); text-decoration: none;}
.btn-danger { color: var(--white); background-color: var(--danger-color); border-color: var(--danger-color); }
.btn-danger:hover:not(:disabled) { background-color: #d03123; border-color: #d03123; color: var(--white); text-decoration: none;}
.btn-warning { color: var(--text-color); background-color: var(--warning-color); border-color: var(--warning-color); }
.btn-warning:hover:not(:disabled) { background-color: #e0a703; border-color: #e0a703; color: var(--text-color); text-decoration: none;}
 .btn-info { color: var(--white); background-color: #17a2b8; border-color: #17a2b8;}
.btn-info:hover:not(:disabled) { background-color: #138496; border-color: #138496; color: var(--white); text-decoration: none;}
 .btn-logout, .btn-login-register { background-color: transparent; border: 1px solid var(--primary-color); color: var(--primary-color); padding: 0.4rem 0.8rem; }
.btn-logout:hover, .btn-login-register:hover { background-color: var(--primary-color); color: white; text-decoration: none;}
.btn-sm { padding: 0.25rem 0.5rem; font-size: 0.875rem; }
 .btn-clear-search { margin-left: 10px; background-color: var(--medium-grey); color: var(--text-color);}


.form-group { margin-bottom: 1rem; }
.form-group label { display: block; margin-bottom: 0.5rem; font-weight: 500; }
.form-group input[type="text"],
.form-group input[type="email"],
.form-group input[type="password"],
.form-group input[type="number"],
.form-group input[type="tel"],
.form-group input[type="url"],
.form-group textarea,
.form-group select {
    display: block;
    width: 100%;
    padding: 0.6rem 0.75rem;
    font-size: 1rem;
    line-height: 1.5;
    color: var(--text-color);
    background-color: var(--white);
    background-clip: padding-box;
    border: 1px solid #ced4da;
    border-radius: var(--border-radius);
    transition: border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
}
.form-group input:focus,
.form-group textarea:focus,
.form-group select:focus {
    color: var(--text-color);
    background-color: var(--white);
    border-color: #86b7fe;
    outline: 0;
    box-shadow: 0 0 0 0.25rem rgba(13, 110, 253, 0.25);
}
 input[type=number]::-webkit-inner-spin-button,
 input[type=number]::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
 }
 input[type=number] { -moz-appearance: textfield; }
.quantity-input { width: 60px; text-align: center; margin: 0 5px; display: inline-block; padding: 0.4rem 0.5rem;}

.auth-container { max-width: 400px; margin: 30px auto; padding: 25px; background: var(--white); border-radius: var(--border-radius); box-shadow: var(--card-shadow); }
.auth-container h1 { text-align: center; margin-bottom: 20px; font-weight: 400; }
.auth-form .btn { width: 100%; }
.auth-links { margin-top: 20px; text-align: center; font-size: 0.9em;}
.auth-links p { margin-bottom: 5px;}

.alert { padding: 1rem; margin: 1rem auto; border: 1px solid transparent; border-radius: var(--border-radius); position: relative; max-width: 1200px; box-shadow: var(--card-shadow);}
.alert-success { color: #0f5132; background-color: #d1e7dd; border-color: #badbcc; }
.alert-danger { color: #842029; background-color: #f8d7da; border-color: #f5c2c7; }
.alert-warning { color: #664d03; background-color: #fff3cd; border-color: #ffecb5; }
.alert-info { color: #055160; background-color: #cff4fc; border-color: #b6effb; }
.close-alert { position: absolute; top: 50%; right: 1rem; transform: translateY(-50%); font-size: 1.2rem; color: inherit; background: none; border: none; cursor: pointer; padding: 0; line-height: 1;}

 .search-bar-container { text-align: center; margin: 0 0 25px 0; }
 .search-form { display: flex; justify-content: center;}
 .search-form input[type="text"] { padding: 10px; min-width: 300px; border: 1px solid var(--medium-grey); border-radius: var(--border-radius) 0 0 var(--border-radius); flex-grow: 1; max-width: 500px;}
 .search-form button { padding: 10px 15px; border-radius: 0 var(--border-radius) var(--border-radius) 0; border-left: none; background-color: var(--primary-color); color: white;}
 .search-form button:hover { background-color: #3367D6; }


.product-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 20px; }
.product-card { background-color: var(--white); border-radius: var(--border-radius); box-shadow: var(--card-shadow); overflow: hidden; transition: transform 0.2s ease, box-shadow 0.2s ease; display: flex; flex-direction: column;}
.product-card:hover { transform: translateY(-5px); box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);}
.product-link { display: block; color: inherit; text-decoration: none; flex-grow: 1; }
.product-image { width: 100%; height: 180px; object-fit: cover; background-color: var(--light-grey); }
.product-info { padding: 15px; flex-grow: 1; display: flex; flex-direction: column; justify-content: space-between; }
.product-name { font-size: 1rem; font-weight: 500; margin-bottom: 5px; color: var(--text-color);}
.product-price { font-size: 1.1rem; font-weight: bold; color: var(--secondary-color); margin-bottom: 5px; }
.product-stock { font-size: 0.85rem; color: var(--dark-grey); margin-bottom: 10px; }
.product-rating { font-size: 0.85em; color: var(--dark-grey);}
.product-rating i { color: var(--warning-color); font-size: 0.9em;}
.product-rating i.fa-regular { color: #ccc; }
.add-to-cart-form { padding: 0 15px 15px 15px;}
.btn-add-to-cart { width: 100%; margin-top: auto; font-size: 0.9rem; padding: 0.4rem 0.8rem;}


.product-detail-container { }
.product-detail-main { display: flex; gap: 30px; flex-wrap: wrap; }
.product-detail-image { flex-basis: 40%; max-width: 400px;}
.product-detail-image img { border: 1px solid var(--medium-grey); border-radius: var(--border-radius); }
.product-detail-info { flex-basis: 55%; }
.product-detail-info h1 { font-size: 1.8em; margin-bottom: 10px; font-weight: 500;}
.detail-price { font-size: 1.6em; color: var(--secondary-color); font-weight: bold; margin-bottom: 10px; }
.detail-stock { margin-bottom: 10px; font-weight: 500; color: var(--dark-grey);}
.detail-rating { margin-bottom: 15px; color: var(--dark-grey); font-size: 0.9em; }
.detail-rating i { color: var(--warning-color); }
.detail-rating i.fa-regular { color: #ccc; }
.product-actions { margin: 20px 0; }
.product-actions .btn, .product-actions form { margin-right: 10px; vertical-align: middle;}
.quantity-selector { display: inline-block; margin-right: 10px; }
.quantity-selector label { margin-right: 5px;}
.share-buttons { margin: 15px 0; font-size: 0.9em; color: var(--dark-grey);}
.product-specifications { margin-top: 20px; border-top: 1px solid var(--medium-grey); padding-top: 15px;}
.product-specifications h3 { font-weight: 500; margin-bottom: 10px; font-size: 1.1em;}
.product-rating-section { margin-top: 30px; border-top: 1px solid var(--medium-grey); padding-top: 20px; }
.product-rating-section h3 { font-weight: 500; margin-bottom: 10px; font-size: 1.1em;}
 .rating-stars input[type="radio"] { display: none; }
 .rating-stars label { color: #ccc; cursor: pointer; font-size: 1.5rem; padding: 0 2px; transition: color 0.2s; }
.rating-stars input[type="radio"]:checked ~ label,
 .rating-stars:not(:hover) input[type="radio"]:checked ~ label,
 .rating-stars:hover label,
 .rating-stars label:hover,
 .rating-stars label:hover ~ label
{ color: var(--warning-color); }
 .rating-stars:hover input[type="radio"]:not(:checked) ~ label:hover ~ label { color: #ccc; }


.cart-container { }
.cart-item { display: grid; grid-template-columns: auto 1fr auto auto auto; align-items: center; border-bottom: 1px solid var(--medium-grey); padding: 15px 0; gap: 15px; }
.cart-item-image { grid-column: 1 / 2; width: 80px; }
.cart-item-image img { width: 100%; height: auto; object-fit: contain; border: 1px solid var(--light-grey);}
.cart-item-details { grid-column: 2 / 3; }
.cart-item-name { font-size: 1.1rem; margin-bottom: 5px; font-weight: 500;}
.cart-item-price, .cart-item-stock { font-size: 0.9em; color: var(--dark-grey); }
.cart-item-quantity { grid-column: 3 / 4; text-align: center;}
.cart-item-quantity label { display: none;}
 .cart-item-subtotal { grid-column: 4 / 5; font-weight: bold; min-width: 100px; text-align: right;}
 .cart-item-remove { grid-column: 5 / 6; text-align: right;}
 .cart-summary { text-align: right; margin-top: 20px; border-top: 2px solid var(--text-color); padding-top: 15px;}
.cart-summary h2 { margin-bottom: 15px; font-weight: 500; font-size: 1.4em;}
.btn-checkout { font-size: 1.1rem; padding: 10px 20px; }


 .checkout-container { }
.checkout-grid { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 30px; }
.checkout-address h2, .checkout-summary h2, .checkout-payment h3 { margin-bottom: 15px; border-bottom: 1px solid var(--medium-grey); padding-bottom: 10px; font-weight: 500; font-size: 1.3em;}
.saved-address { padding: 15px; border: 1px solid var(--medium-grey); margin-bottom: 15px; border-radius: var(--border-radius); background: #f9f9f9;}
.saved-address p { margin-bottom: 5px;}
.saved-address button { margin-top: 10px;}
.address-form { padding: 15px; border: 1px solid var(--medium-grey); border-radius: var(--border-radius);}
.address-form h3 { margin-bottom: 15px; font-weight: 500; }
 .checkout-summary { padding: 20px; background: #f9f9f9; border-radius: var(--border-radius);}
 .checkout-item { display: flex; align-items: center; margin-bottom: 10px; gap: 10px;}
.checkout-item-image { flex-basis: 50px; flex-shrink: 0;}
.checkout-item-image img { width: 100%; border: 1px solid var(--light-grey); }
.checkout-item-info { flex-grow: 1; font-size: 0.9em; color: var(--dark-grey); line-height: 1.3;}
 .checkout-item-price { font-weight: 500; flex-shrink: 0; }
 .checkout-totals { margin: 15px 0; font-size: 1.1em;}
 .checkout-totals p { display: flex; justify-content: space-between; margin-bottom: 5px; }
 .checkout-totals hr { margin: 10px 0; }
 .checkout-totals p strong { font-size: 1.2em;}
 .payment-option { border: 1px solid var(--medium-grey); padding: 15px; border-radius: var(--border-radius); margin-bottom: 10px; cursor: pointer; background: var(--white);}
.payment-option.selected { border-color: var(--primary-color); border-width: 2px; background-color: #eaf2ff;}
 .payment-option input[type="radio"] { margin-right: 10px; vertical-align: middle;}
 .payment-option label { font-weight: 500; display: flex; align-items: center; }
 .payment-option i { margin-right: 8px; width: 20px; text-align: center; }
 .btn-place-order { padding: 12px; font-size: 1.2rem; margin-top: 15px;}


.my-orders-container { }
.order-card { border: 1px solid var(--medium-grey); margin-bottom: 20px; border-radius: var(--border-radius); background-color: var(--white); box-shadow: var(--card-shadow); overflow: hidden;}
.order-header { background-color: var(--light-grey); padding: 10px 15px; display: flex; justify-content: space-between; font-size: 0.9em; color: var(--dark-grey); flex-wrap: wrap; gap: 15px;}
.order-header div { white-space: nowrap;}
 .order-status { font-weight: bold; text-transform: uppercase; display: inline-block; padding: 2px 6px; border-radius: var(--border-radius); color: var(--white); font-size: 0.8em;}

 .status-pending .order-status { background-color: var(--warning-color); color: var(--text-color);}
.status-order-received .order-status, .status-out-for-delivery .order-status { background-color: var(--primary-color); }
 .status-delivered .order-status { background-color: var(--secondary-color); }
.status-cancelled .order-status { background-color: var(--danger-color); }

.order-body { padding: 15px; display: flex; gap: 20px; flex-wrap: wrap; }
.order-items-preview { display: flex; gap: 5px; align-items: center;}
 .order-items-preview img { height: 40px; width: 40px; object-fit: contain; border: 1px solid var(--light-grey); background: var(--white); border-radius: 3px;}
.order-details { font-size: 0.9em; flex-grow: 1; line-height: 1.4;}
.order-details p { margin-bottom: 4px;}
.order-actions { padding: 10px 15px; border-top: 1px solid var(--light-grey); text-align: right; }


 .admin-dashboard-container, .delivery-dashboard-container, .admin-manage-container, .delivery-orders-detail-container { }
 .admin-manage-container > h1, .delivery-orders-detail-container > h1 { margin-bottom: 20px; font-weight: 500;}
.admin-actions-grid, .delivery-stats-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 20px; margin-top: 20px; }
.admin-action-card, .stat-card { border: 1px solid var(--medium-grey); border-radius: var(--border-radius); padding: 20px; text-align: center; transition: box-shadow 0.2s; color: var(--text-color); background-color: var(--white);}
 .admin-action-card:hover, .stat-card:hover { box-shadow: 0 4px 8px rgba(0,0,0,0.15); text-decoration: none;}
 .admin-action-card i, .stat-card h2 { font-size: 2.5rem; margin-bottom: 10px; }
 .admin-action-card i { color: var(--primary-color); }
.stat-card h2 { color: var(--primary-color); font-weight: 500; }
 .admin-action-card h3, .stat-card p { margin-bottom: 10px; font-weight: 500; font-size: 1.1em;}
 .admin-action-card p { color: var(--dark-grey); font-size: 0.9em;}
.stat-card a.btn { margin-top: 15px; }


 .data-table img.table-img { height: 40px; width: 40px; object-fit: cover; border-radius: 3px;}
 .data-table .actions-cell form { margin-bottom: 5px; }
 .data-table .actions-cell { min-width: 200px; white-space: nowrap; }
 .data-table .verify-otp-form input { width: 100px; display: inline-block; margin-right: 5px; padding: 5px; height: calc(1.5em + 0.5rem + 2px);}
 .data-table .assign-order-form select { display: inline-block; width: auto; margin-right: 5px; padding: 5px; height: calc(1.5em + 0.5rem + 2px);}
 .data-table select { padding: 0.25rem 0.5rem; height: auto; font-size: 0.875rem; width: auto; }
 .verified-badge { color: var(--secondary-color); font-weight: bold; font-size: 0.9em;}
 .verified-badge i { margin-right: 3px;}
 .status-badge { font-weight: bold; text-transform: uppercase; display: inline-block; padding: 3px 8px; border-radius: var(--border-radius); color: var(--white); font-size: 0.8em; white-space: nowrap; }


@media (max-width: 992px) {
     .data-table .actions-cell { min-width: 150px; white-space: normal; }
      .data-table .verify-otp-form, .data-table .assign-order-form { display: block; margin-bottom: 5px;}
     .data-table .assign-order-form select { width: 100%; margin-bottom: 5px; }
     .data-table .verify-otp-form input { width: calc(100% - 80px);} /* Adjust width */
      .data-table .actions-cell .btn { display: block; width: 100%; margin-bottom: 5px;}
 }


@media (max-width: 768px) {
    .navbar { flex-direction: column; height: auto; padding: 10px 0; }
    .nav-left, .nav-right { margin-bottom: 10px; width: 100%; text-align: center;}
    .nav-right { display: flex; flex-wrap: wrap; justify-content: center; padding: 0; }
    .nav-right a, .nav-right form { margin: 8px; }
    main.container { padding: 15px;}
    .product-grid { grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); }
    .product-detail-main { flex-direction: column; }
     .product-detail-image, .product-detail-info { flex-basis: 100%; max-width: 100%; }
    .cart-item { grid-template-columns: auto 1fr auto; grid-template-rows: auto auto auto; gap: 5px 15px;}
     .cart-item-image { grid-row: 1 / 4;}
     .cart-item-details { grid-column: 2 / 4; grid-row: 1 / 2; }
     .cart-item-quantity { grid-column: 2 / 3; grid-row: 2/3; text-align: left;}
     .cart-item-subtotal { grid-column: 3/4; grid-row: 2/3; text-align: right; }
     .cart-item-remove { grid-column: 2/4; grid-row: 3/4; text-align: right; margin-top: 10px; }
    .checkout-grid { grid-template-columns: 1fr; }
     .order-header { flex-direction: column; align-items: flex-start; gap: 5px;}
     .admin-actions-grid, .delivery-stats-grid { grid-template-columns: 1fr; }
     .data-table thead { display: none; } /* Simplify table for mobile */
     .data-table tr { display: block; margin-bottom: 1rem; border: 1px solid var(--medium-grey); border-radius: var(--border-radius);}
     .data-table td { display: block; text-align: right; padding-left: 50%; position: relative; border-bottom: none;}
     .data-table td::before { content: attr(data-label); position: absolute; left: 10px; width: 45%; padding-right: 10px; white-space: nowrap; text-align: left; font-weight: bold; }
    .data-table td:last-child { border-bottom: 0;}
     .data-table .actions-cell { padding-left: 10px; text-align: left; }
     .data-table .actions-cell::before { display: none; }
      .data-table .inline-form { display: block; margin-bottom: 10px;}
 }


""",

    'public/js/main.js': """console.log("Main JS loaded.");

document.addEventListener('DOMContentLoaded', () => {

    const updateQtyButtons = document.querySelectorAll('.btn-update-qty');
    updateQtyButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            const productId = button.dataset.productId;
            const quantityInput = document.getElementById(`quantity-${productId}`);
            const newQuantity = parseInt(quantityInput.value, 10);

            if (isNaN(newQuantity) || newQuantity < 0) {
                 alert('Invalid quantity');
                return;
             }
            const maxStock = parseInt(quantityInput.max, 10);
            if(newQuantity > maxStock){
                alert(`Only ${maxStock} items available in stock.`);
                quantityInput.value = maxStock;
                 return;
             }

            updateCartItemQuantityAJAX(productId, newQuantity, button);

        });
    });

    async function updateCartItemQuantityAJAX(productId, quantity, buttonElement) {
        buttonElement.disabled = true;
         buttonElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        try {
            const response = await fetch('/user/cart/update', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',

                },
                body: JSON.stringify({ productId, quantity })
             });

            if (!response.ok) {
                 const errorData = await response.json().catch(() => ({ message: 'Failed to update cart. Server error.' }));
                throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
            }

             const data = await response.json();


             if (data.success) {
                const cartItemDiv = document.querySelector(`.cart-item[data-product-id="${productId}"]`);

                 if (quantity === 0) {
                    if (cartItemDiv) {
                        cartItemDiv.style.transition = 'opacity 0.3s ease';
                        cartItemDiv.style.opacity = '0';
                        setTimeout(() => cartItemDiv.remove(), 300);
                     }
                 } else {
                     const subtotalSpan = cartItemDiv?.querySelector('.item-subtotal-value');
                     if (subtotalSpan) subtotalSpan.textContent = data.itemSubtotal.toFixed(2);
                    const quantityInput = document.getElementById(`quantity-${productId}`);
                    if(quantityInput) quantityInput.value = data.newQuantity;

                 }

                const cartTotalSpan = document.getElementById('cart-total-value');
                if (cartTotalSpan) cartTotalSpan.textContent = data.cartTotal.toFixed(2);


                 const cartBadge = document.querySelector('.cart-badge');
                 const newCartItemCount = calculateNewCartCount();
                 if (cartBadge) {
                     if (newCartItemCount > 0) {
                         cartBadge.textContent = newCartItemCount;
                         cartBadge.style.display = 'inline-block';
                     } else {
                        cartBadge.textContent = '0';
                        cartBadge.style.display = 'none';
                     }
                 } else if (newCartItemCount > 0) {
                    // If badge didn't exist, create it? Less likely, assuming it's in header.ejs
                 }


                  console.log("Cart updated:", data.message);


                  // Handle empty cart state
                  const cartItemsContainer = document.querySelector('.cart-items');
                  if (calculateNewCartCount() === 0 && cartItemsContainer) {
                       cartItemsContainer.innerHTML = '<p>Your cart is empty. <a href="/">Continue Shopping</a></p>';
                       const cartSummary = document.querySelector('.cart-summary');
                       if (cartSummary) cartSummary.style.display = 'none';
                   }


             } else {
                alert(`Update failed: ${data.message}`);
                  const quantityInput = document.getElementById(`quantity-${productId}`);
                 if(quantityInput){
                   // Attempt to revert quantity to previous state maybe? Needs storing old value.
                  // Simple revert could just fetch cart data again or reload page.
                 }

             }

        } catch (error) {
            console.error('Error updating cart quantity:', error);
             alert(`Error: ${error.message}`);

        } finally {
             buttonElement.disabled = false;
             buttonElement.innerHTML = 'Update';
         }
    }


     function calculateNewCartCount() {
         const quantityInputs = document.querySelectorAll('.cart-item .quantity-input');
        let count = 0;
        quantityInputs.forEach(input => {
            const value = parseInt(input.value, 10);
            if (!isNaN(value)) {
              count += value;
            }
        });
        return count;
     }


      // Make tables responsive on small screens by adding data-label attributes
      function responsiveTables() {
         const tables = document.querySelectorAll('.data-table');
         tables.forEach(table => {
            const headers = Array.from(table.querySelectorAll('th')).map(th => th.textContent);
             const rows = table.querySelectorAll('tbody tr');
             rows.forEach(row => {
                 const cells = row.querySelectorAll('td');
                 cells.forEach((cell, index) => {
                     cell.setAttribute('data-label', headers[index] || '');
                });
             });
        });
      }
      if (window.innerWidth <= 768) { // Apply only on smaller screens
        responsiveTables();
     }
     window.addEventListener('resize', () => { // Re-apply if needed on resize? Less critical
        // Simple check might suffice for initial load. Full dynamic resize handling adds complexity.
     });

});
""",

    # --- Placeholder/Empty directories ---
    # These keys ensure the directories are created, even if empty for now
    'public/css/.keep': '',
    'public/js/.keep': '',
    # Add other empty directory markers if needed, e.g. logs/
    # 'logs/.keep': '',

}

# Placeholder content for .env file
env_content = """NODE_ENV=development
PORT=3000
MONGO_URI=mongodb://localhost:27017/suryaecommerce
SESSION_SECRET=e6142a6d230d0435c9b050af41bfd1e53ece6270797e546fbdaa97af20f3b77e
SESSION_MAX_AGE=86400000

MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USER=ayyappanallamothu4@gmail.com
MAIL_PASS=yxor nmot lxmq skyc
MAIL_FROM='"Surya Eshop" ayyappanallamothu4@gmail.com'
"""

# --- Main script execution ---
if __name__ == "__main__":
    print(f"Creating project structure under '{PROJECT_ROOT}'...")

    if not os.path.exists(PROJECT_ROOT):
        os.makedirs(PROJECT_ROOT)
        print(f"Created root directory: {PROJECT_ROOT}")

    # Create .env file separately
    env_path = os.path.join(PROJECT_ROOT, '.env')
    try:
        with open(env_path, 'w', encoding='utf-8') as f:
            f.write(env_content)
        print(f"  Created placeholder: {env_path}")
    except IOError as e:
        print(f"  Error creating {env_path}: {e}")


    # Create other files and directories
    for file_path, content in files_content.items():
        # Construct the full path relative to the script's location
        full_path = os.path.join(PROJECT_ROOT, file_path)

        # Extract the directory part of the path
        directory_path = os.path.dirname(full_path)

        # Create directories if they don't exist
        # Added check to avoid error on files in root like package.json
        if directory_path and not os.path.exists(directory_path):
            try:
                os.makedirs(directory_path, exist_ok=True)
                # print(f"  Created directory: {directory_path}") # Optional: print directory creation
            except OSError as e:
                print(f"  Error creating directory {directory_path}: {e}")
                continue # Skip file creation if directory fails

        # Write the file content, skip '.keep' placeholder files
        if os.path.basename(file_path) != '.keep':
            try:
                with open(full_path, 'w', encoding='utf-8') as f:
                    f.write(content)
                print(f"  Created file:      {full_path}")
            except IOError as e:
                print(f"  Error creating file {full_path}: {e}")
        # If it is a .keep file, just ensure the directory exists (handled above)
        elif directory_path :
             print(f"  Ensured directory: {directory_path}")

    print("Project structure created successfully!")
   