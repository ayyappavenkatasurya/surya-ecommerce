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
const User = require('./models/User'); // Needed for potential DB checks in middleware/locals
const Product = require('./models/Product'); // Needed for pending count

// Connect to Database
connectDB();

const app = express();

// View Engine Setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(methodOverride('_method')); // If you use method override for forms (PUT/DELETE)

// Session Configuration
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false, // Don't save session if unmodified
    store: MongoStore.create({
        mongoUrl: process.env.MONGO_URI,
        collectionName: 'sessions',
        ttl: parseInt(process.env.SESSION_MAX_AGE || '86400000', 10) / 1000 // Convert ms to seconds for TTL
    }),
    cookie: {
        maxAge: parseInt(process.env.SESSION_MAX_AGE || '86400000', 10), // Max age in milliseconds
        httpOnly: true, // Prevent client-side JS access
        secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
        sameSite: 'lax' // Recommended for CSRF protection
    }
  })
);

// Flash Messages Middleware
app.use(flash());

// Global Variables Middleware (res.locals)
app.use(async (req, res, next) => {
  // Flash messages
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg = req.flash('error_msg');
  res.locals.error = req.flash('error'); // General error flash

  // User information
  res.locals.currentUser = req.session.user || null;

  // URL information
  res.locals.currentUrl = req.originalUrl;
  res.locals.fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

  // Cart item count - calculate safely
  res.locals.cartItemCount = req.session.user?.cart?.reduce((count, item) => count + (item.quantity || 0), 0) || 0;

  // User Initials
  let userInitials = '??';
  if (req.session.user && req.session.user.name) {
      // Simplified logic for initials
      try {
        const nameParts = req.session.user.name.trim().split(' ').filter(part => part.length > 0);
        if (nameParts.length > 1) {
            userInitials = (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase();
        } else if (nameParts.length === 1 && nameParts[0].length >= 1) {
            userInitials = nameParts[0].substring(0, Math.min(nameParts[0].length, 2)).toUpperCase();
            if (userInitials.length === 1) userInitials += userInitials; // Double up if only one char
        }
      } catch (e) {
          console.error("Error generating initials from name:", e);
          userInitials = '??'; // Fallback
      }
  }
  // Fallback to email if name fails or doesn't exist
  if (userInitials === '??' && req.session.user && req.session.user.email) {
       try {
            const emailPrefix = req.session.user.email.split('@')[0];
            if (emailPrefix.length >= 2) {
                userInitials = emailPrefix.substring(0, 2).toUpperCase();
            } else if (emailPrefix.length === 1) {
                userInitials = (emailPrefix[0] + emailPrefix[0]).toUpperCase();
            }
       } catch(e){ console.error("Error generating initials from email:", e);}
  }
  res.locals.userInitials = userInitials;

  // Date Formatter
  res.locals.formatDateIST = (dateInput) => {
      if (!dateInput) return 'N/A';
      try {
          const date = new Date(dateInput);
          if (isNaN(date.getTime())) {
              console.warn(`formatDateIST received invalid dateInput: ${dateInput}`);
              return 'Invalid Date';
          }
          // Consistent options
          const options = {
              timeZone: 'Asia/Kolkata', year: 'numeric', month: 'short',
              day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
          };
          return date.toLocaleString('en-IN', options);
      } catch (error) {
          console.error("Error formatting date to IST:", error, "Input:", dateInput);
          return 'Date Error';
      }
  };

  // Other Globals
  res.locals.defaultSiteName = 'miniapp'; // Your site name
  res.locals.NODE_ENV = process.env.NODE_ENV; // Environment

  // --- Pass user role explicitly for views ---
  res.locals.userRole = req.session.user ? req.session.user.role : null;

  // --- Pass Pending Product Count for Admin Header/Dashboard (Optional) ---
  // Avoid doing DB lookups here if possible, better in the specific controller (like getAdminDashboard)
  // If needed for header *always*, uncomment carefully, but it adds overhead to every request.
  /*
  if (res.locals.userRole === 'admin') {
      try {
          res.locals.pendingProductCount = await Product.countDocuments({ status: 'Pending Review' });
      } catch (countError) {
          console.error("Error fetching pending product count for locals:", countError);
          res.locals.pendingProductCount = 0;
      }
  } else {
       res.locals.pendingProductCount = 0;
  }
  */

  next();
});


// --- Routes ---
app.use('/', mainRouter); // Mount main router

// --- Error Handling Middleware ---
app.use(notFound); // 404 Handler (if no route matched)
app.use(errorHandler); // General Error Handler

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});