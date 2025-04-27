// server.js
require('dotenv').config();
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
const { categories: siteCategories } = require('./config/categories');

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
        // secure: process.env.NODE_ENV === 'production',
        // sameSite: 'lax'
    }
  })
);


app.use(flash());


// Middleware to set res.locals
app.use((req, res, next) => {

  // Flash messages
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg = req.flash('error_msg');
  res.locals.error = req.flash('error'); // For general errors if needed

  // Current user info
  res.locals.currentUser = req.session.user || null;

  // URL info
  res.locals.currentUrl = req.originalUrl;
  res.locals.fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

  // Cart info
  res.locals.cartItemCount = req.session.user?.cart?.reduce((count, item) => count + (item.quantity || 0), 0) || 0;

  // User Initials calculation
  let userInitials = '??';
  if (req.session.user && req.session.user.name) {
    try {
      const nameParts = req.session.user.name.trim().split(' ');
      if (nameParts.length > 1 && nameParts[0] && nameParts[1]) {
          userInitials = (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase();
      } else if (nameParts.length === 1 && nameParts[0].length >= 2) {
          userInitials = nameParts[0].substring(0, 2).toUpperCase();
      } else if (nameParts.length === 1 && nameParts[0].length === 1) {
           userInitials = (nameParts[0][0] + nameParts[0][0]).toUpperCase();
      }
       else if (req.session.user.email) {
            const emailPrefix = req.session.user.email.split('@')[0];
            if (emailPrefix.length >= 2) { userInitials = emailPrefix.substring(0, 2).toUpperCase(); }
            else if (emailPrefix.length === 1) { userInitials = emailPrefix.toUpperCase() + emailPrefix.toUpperCase(); }
       }
    } catch (e) {
      console.error("Error generating initials:", e);
       if (req.session.user.email) {
            const emailPrefix = req.session.user.email.split('@')[0];
            if (emailPrefix.length >= 2) { userInitials = emailPrefix.substring(0, 2).toUpperCase(); }
            else if (emailPrefix.length === 1) { userInitials = emailPrefix.toUpperCase() + emailPrefix.toUpperCase(); }
       }
    }
  } else if (req.session.user && req.session.user.email) {
        const emailPrefix = req.session.user.email.split('@')[0];
        if (emailPrefix.length >= 2) { userInitials = emailPrefix.substring(0, 2).toUpperCase(); }
        else if (emailPrefix.length === 1) { userInitials = emailPrefix.toUpperCase() + emailPrefix.toUpperCase(); }
  }
  res.locals.userInitials = userInitials;

  // Date Formatter Helper
  res.locals.formatDateIST = (dateInput) => {
      if (!dateInput) return 'N/A';
      try {
          const date = new Date(dateInput);
          if (isNaN(date.getTime())) { return 'Invalid Date'; }
          const options = { timeZone: 'Asia/Kolkata', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true };
          return date.toLocaleString('en-IN', options);
      } catch (error) {
          console.error("Error formatting date to IST:", error, "Input:", dateInput);
          return 'Date Error';
      }
  };

  // Site Defaults
  res.locals.defaultSiteName = 'miniapp';
  res.locals.NODE_ENV = process.env.NODE_ENV;
  res.locals.siteCategories = siteCategories;

  // **** ADDED: Handle addressFormData ****
  // Assign from session if exists, otherwise null. This makes it available to all templates.
  res.locals.addressFormData = req.session?.addressFormData || null;
  // Clean up session immediately after assigning to locals
  if (req.session?.addressFormData) {
      delete req.session.addressFormData;
  }
  // **** END: Handle addressFormData ****

  next(); // Proceed to the next middleware/route handler
});


// --- Routes ---
app.use('/', mainRouter);


// --- Error Handling ---
app.use(notFound);
app.use(errorHandler);


// --- Server Start ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});