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

// Middleware to set local variables for views
app.use((req, res, next) => {
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg = req.flash('error_msg');
  res.locals.error = req.flash('error');
  res.locals.currentUser = req.session.user || null;
  res.locals.currentUrl = req.originalUrl;
  res.locals.fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  res.locals.cartItemCount = req.session.user?.cart?.reduce((count, item) => count + item.quantity, 0) || 0;

  // --- Calculate User Initials ---
  let userInitials = '??'; // Default fallback
  if (req.session.user && req.session.user.email) {
    try {
      const nameParts = req.session.user.name?.split(' ');
      if (nameParts && nameParts.length > 1) {
          userInitials = (nameParts[0][0] + nameParts[1][0]).toUpperCase();
      } else if (nameParts && nameParts.length === 1 && nameParts[0].length >= 2) {
          userInitials = nameParts[0].substring(0, 2).toUpperCase();
      } else {
        const emailPrefix = req.session.user.email.split('@')[0];
        if (emailPrefix.length >= 2) {
            userInitials = emailPrefix.substring(0, 2).toUpperCase();
        } else if (emailPrefix.length === 1) {
            userInitials = emailPrefix.toUpperCase() + emailPrefix.toUpperCase();
        }
      }
    } catch (e) {
      console.error("Error generating initials:", e);
    }
  }
  res.locals.userInitials = userInitials;

  // --- NEW: Date Formatting Helper for IST ---
  res.locals.formatDateIST = (dateInput) => {
      if (!dateInput) return 'N/A'; // Handle null or undefined dates
      try {
          const date = new Date(dateInput);
          // Check if the date is valid after conversion
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
              second: '2-digit', // e.g., '08', '59'
              hour12: true // Use AM/PM
          };
          // Use 'en-IN' locale for formatting conventions common in India (though options override most)
          return date.toLocaleString('en-IN', options);
      } catch (error) {
          console.error("Error formatting date to IST:", error, "Input:", dateInput);
          return 'Date Error'; // Fallback error message
      }
  };
  // --- END: Date Formatting Helper ---

  next();
});

app.use('/', mainRouter);


app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});