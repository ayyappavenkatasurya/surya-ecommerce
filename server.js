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

app.use((req, res, next) => {
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg = req.flash('error_msg');
  res.locals.error = req.flash('error');
  res.locals.currentUser = req.session.user || null;
  res.locals.currentUrl = req.originalUrl;
  res.locals.fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  res.locals.cartItemCount = req.session.user?.cart?.reduce((count, item) => count + item.quantity, 0) || 0;

  // --- NEW: Calculate User Initials ---
  let userInitials = '??'; // Default fallback
  if (req.session.user && req.session.user.email) {
    try {
      // Try splitting by space first (for names), then fallback to email
      const nameParts = req.session.user.name?.split(' ');
      if (nameParts && nameParts.length > 1) {
          userInitials = (nameParts[0][0] + nameParts[1][0]).toUpperCase();
      } else if (nameParts && nameParts.length === 1 && nameParts[0].length >= 2) {
          userInitials = nameParts[0].substring(0, 2).toUpperCase();
      }
       else {
        // Fallback to email if name didn't work well
        const emailPrefix = req.session.user.email.split('@')[0];
        if (emailPrefix.length >= 2) {
            userInitials = emailPrefix.substring(0, 2).toUpperCase();
        } else if (emailPrefix.length === 1) {
            userInitials = emailPrefix.toUpperCase() + emailPrefix.toUpperCase(); // Double the single letter
        }
      }
    } catch (e) {
      console.error("Error generating initials:", e);
      // Keep default '??'
    }
  }
  res.locals.userInitials = userInitials;
  // --- END: Calculate User Initials ---

  next();
});


app.use('/', mainRouter);


app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});