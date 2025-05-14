
// server.js
require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const flash = require('connect-flash');
const methodOverride = require('method-override');
// const rateLimit = require('express-rate-limit'); // Rate limiter will be defined and applied in routes.js

// Import consolidated modules
const Config = require('./config');
const routes = require('./routes'); // Import the single router file
const middleware = require('./middleware');

// Destructure for clarity
const { connectDB, categories: siteCategories } = Config;
const { notFound, errorHandler } = middleware;

connectDB();

const app = express();

// --- View Engine ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// --- Base Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(methodOverride('_method'));

// --- Session Middleware ---
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
        // secure: process.env.NODE_ENV === 'production', // Enable in production
        // sameSite: 'lax' // Recommended for security
    }
  })
);

// --- Flash Middleware ---
app.use(flash());

// --- Res Locals Middleware (Uses consolidated config) ---
app.use((req, res, next) => {
  // Flash messages
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg = req.flash('error_msg');
  res.locals.error = req.flash('error');

  // User info
  res.locals.currentUser = req.session.user || null;
  res.locals.cartItemCount = req.session.user?.cart?.reduce((count, item) => count + (item.quantity || 0), 0) || 0;
  let userInitials = '??';
  if (req.session.user?.name) {
    try {
      const nameParts = req.session.user.name.trim().split(' ');
      if (nameParts.length > 1 && nameParts[0] && nameParts[nameParts.length - 1]) userInitials = (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase();
      else if (nameParts.length === 1 && nameParts[0].length >= 2) userInitials = nameParts[0].substring(0, 2).toUpperCase();
      else if (nameParts.length === 1 && nameParts[0].length === 1) userInitials = (nameParts[0][0] + nameParts[0][0]).toUpperCase();
    } catch (e) { userInitials = '??'; } // Fallback remains '??'
  }
   else if (req.session.user?.email) { // Fallback to email if name fails/missing
     const emailPrefix = req.session.user.email.split('@')[0];
     if (emailPrefix.length >= 2) { userInitials = emailPrefix.substring(0, 2).toUpperCase(); }
     else if (emailPrefix.length === 1) { userInitials = emailPrefix.toUpperCase() + emailPrefix.toUpperCase(); }
   }
  res.locals.userInitials = userInitials;


  // URL and Date Formatting
  res.locals.currentUrl = req.originalUrl;
  res.locals.fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  res.locals.formatDateIST = (dateInput) => {
      if (!dateInput) return 'N/A';
      try { const date = new Date(dateInput); return date.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }); }
      catch (error) { console.error("Date Format Error:", error, dateInput); return 'Date Error'; }
  };

  // Site Config from consolidated config
  res.locals.defaultSiteName = 'miniapp'; // Or read from config if moved there
  res.locals.NODE_ENV = process.env.NODE_ENV;
  res.locals.siteCategories = siteCategories; // Use imported categories

   // Pincode Address Form Data Handling (Retain original logic)
   res.locals.addressFormData = req.session?.addressFormData || null;
   if (req.session?.addressFormData) { delete req.session.addressFormData; }

  next();
});

// --- Mount the consolidated router ---
app.use('/', routes);

// --- Error Handling (Uses consolidated middleware) ---
app.use(notFound);
app.use(errorHandler);

// --- Server Start ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});