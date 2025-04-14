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
const mainRouter = require('./routes/index'); // Main router including all sub-routes
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

// Connect to Database
connectDB();

const app = express();

// View Engine Setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware Setup
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files (CSS, JS, images)
app.use(methodOverride('_method')); // Support PUT/DELETE via POST with _method query param

// Session Middleware
app.use(
  session({
    secret: process.env.SESSION_SECRET, // Secret used to sign the session ID cookie
    resave: false, // Don't save session if unmodified
    saveUninitialized: false, // Don't create session until something stored
    store: MongoStore.create({ // Store session data in MongoDB
        mongoUrl: process.env.MONGO_URI,
        collectionName: 'sessions' // Optional: specify collection name
    }),
    cookie: {
        maxAge: parseInt(process.env.SESSION_MAX_AGE || '86400000', 10), // Session duration (default 1 day)
        httpOnly: true // Prevent client-side JS from accessing cookie
        // secure: process.env.NODE_ENV === 'production', // Use secure cookies in production (HTTPS) - Uncomment if using HTTPS
        // sameSite: 'lax' // Mitigate CSRF attacks
    }
  })
);

// Flash Message Middleware
app.use(flash()); // Requires session middleware

// Middleware to set local variables for views (accessible in EJS templates)
app.use((req, res, next) => {
  // Flash messages
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg = req.flash('error_msg');
  res.locals.error = req.flash('error'); // General error flash

  // User information
  res.locals.currentUser = req.session.user || null; // Logged-in user object or null

  // URL information
  res.locals.currentUrl = req.originalUrl; // Current path (e.g., /products/123)
  res.locals.fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`; // Full URL including domain

  // Cart count (calculated safely)
  res.locals.cartItemCount = req.session.user?.cart?.reduce((count, item) => count + (item.quantity || 0), 0) || 0;

  // Calculate User Initials for Avatar
  let userInitials = '??'; // Default fallback
  if (req.session.user && req.session.user.name) { // Check for name first
    try {
      const nameParts = req.session.user.name.trim().split(' ');
      if (nameParts.length > 1 && nameParts[0] && nameParts[1]) {
          // Use first letter of first and last name parts
          userInitials = (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase();
      } else if (nameParts.length === 1 && nameParts[0].length >= 2) {
          // Use first two letters of single name
          userInitials = nameParts[0].substring(0, 2).toUpperCase();
      } else if (nameParts.length === 1 && nameParts[0].length === 1) {
           // Use single letter twice if only one letter name
           userInitials = (nameParts[0][0] + nameParts[0][0]).toUpperCase();
      }
       // Fallback to email if name processing failed or name is empty
       else if (req.session.user.email) {
            const emailPrefix = req.session.user.email.split('@')[0];
            if (emailPrefix.length >= 2) {
                userInitials = emailPrefix.substring(0, 2).toUpperCase();
            } else if (emailPrefix.length === 1) {
                userInitials = emailPrefix.toUpperCase() + emailPrefix.toUpperCase();
            }
       }
    } catch (e) {
      console.error("Error generating initials:", e);
      // Fallback to email if error during name processing
       if (req.session.user.email) {
            const emailPrefix = req.session.user.email.split('@')[0];
            if (emailPrefix.length >= 2) {
                userInitials = emailPrefix.substring(0, 2).toUpperCase();
            } else if (emailPrefix.length === 1) {
                userInitials = emailPrefix.toUpperCase() + emailPrefix.toUpperCase();
            }
       }
    }
  } else if (req.session.user && req.session.user.email) { // If no name, use email
        const emailPrefix = req.session.user.email.split('@')[0];
        if (emailPrefix.length >= 2) {
            userInitials = emailPrefix.substring(0, 2).toUpperCase();
        } else if (emailPrefix.length === 1) {
            userInitials = emailPrefix.toUpperCase() + emailPrefix.toUpperCase();
        }
  }
  res.locals.userInitials = userInitials;

  // Date Formatting Helper for IST timezone
  res.locals.formatDateIST = (dateInput) => {
      if (!dateInput) return 'N/A'; // Handle null or undefined dates
      try {
          const date = new Date(dateInput);
          // Check if the date object is valid
          if (isNaN(date.getTime())) {
              console.warn(`formatDateIST received invalid dateInput: ${dateInput}`);
              return 'Invalid Date';
          }

          const options = {
              timeZone: 'Asia/Kolkata', // Target timezone IST
              year: 'numeric',
              month: 'short', // e.g., 'Jan', 'Feb'
              day: 'numeric',
              hour: 'numeric', // e.g., '1', '2'... '12'
              minute: '2-digit', // e.g., '05', '15'
              // second: '2-digit', // Optional: include seconds if needed
              hour12: true // Use AM/PM
          };
          // Use 'en-IN' locale for formatting conventions common in India (can use 'en-US' too)
          return date.toLocaleString('en-IN', options);
      } catch (error) {
          console.error("Error formatting date to IST:", error, "Input:", dateInput);
          return 'Date Error'; // Fallback error message
      }
  };

  // Default Site Name for Meta Tags
  res.locals.defaultSiteName = 'miniapp'; // Change this to your actual application name

  // Pass NODE_ENV to views for conditional rendering (e.g., error stack)
  res.locals.NODE_ENV = process.env.NODE_ENV;

  next(); // Proceed to the next middleware or route handler
});

// Main Application Routes
app.use('/', mainRouter); // Mount the main router at the root path

// Error Handling Middleware (Should be LAST after routes)
app.use(notFound); // Handle 404 Not Found errors
app.use(errorHandler); // Handle all other errors

// Start Server
const PORT = process.env.PORT || 3000; // Use port from .env or default to 3000

app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});