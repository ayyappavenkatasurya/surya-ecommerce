// server.js
require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const flash = require('connect-flash');
const methodOverride = require('method-override');
// <<< MODIFIED: Import passport and strategy
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;


// Import consolidated modules
const Config = require('./config');
const routes = require('./routes');
const middleware = require('./middleware');
// <<< MODIFIED: Import User model for Passport config
const { User } = require('./models');

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
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production'
    }
  })
);

/* --- MODIFIED: Passport Middleware & Strategy Configuration --- */
app.use(passport.initialize());
app.use(passport.session());

// Configure Google OAuth2.0 strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${process.env.SERVER_BASE_URL}/auth/google/callback`
    },
    async (accessToken, refreshToken, profile, done) => {
        try {
            // 1. Check if user already exists via Google ID
            let user = await User.findOne({ googleId: profile.id });

            if (user) {
                return done(null, user); // User found, log them in
            }

            // 2. If no user with Google ID, check for email match
            const userEmail = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
            if (userEmail) {
                user = await User.findOne({ email: userEmail });

                // 2a. Email exists, link the Google ID
                if (user) {
                    user.googleId = profile.id;
                    // Google email is inherently verified
                    user.isVerified = true;
                    await user.save({ validateBeforeSave: false }); // Bypass password validation
                    return done(null, user);
                }
            }

            // 3. No existing user, create a new one
            const newUser = new User({
                googleId: profile.id,
                name: profile.displayName,
                email: userEmail,
                isVerified: true // Google handles email verification
                // Password is not required for Google users
            });

            await newUser.save();
            return done(null, newUser);

        } catch (error) {
            return done(error, false);
        }
    }));
    console.log("Passport Google strategy configured.");
} else {
    console.warn("Google OAuth credentials not set. Google login will be disabled.");
}


// Serialize user to store in session
passport.serializeUser((user, done) => {
    done(null, user.id); // Store only the user's ID in the session
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (error) {
        done(error, null);
    }
});
/* --- END Passport Configuration --- */

// --- Flash Middleware ---
app.use(flash());

// --- Res Locals Middleware (Uses consolidated config) ---
app.use((req, res, next) => {
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg = req.flash('error_msg');
  res.locals.error = req.flash('error');

  // <<< MODIFIED: Use req.user from passport if req.session.user is not set
  // Passport populates req.user. We will also maintain our req.session.user
  if (req.user && !req.session.user) {
      req.session.user = {
          _id: req.user._id,
          name: req.user.name,
          email: req.user.email,
          role: req.user.role,
          address: req.user.address?.toObject(),
          cart: req.user.cart ? req.user.cart.map(item => ({ productId: item.productId?._id, quantity: item.quantity })) : []
      };
  }

  res.locals.currentUser = req.session.user || null;
  res.locals.cartItemCount = req.session.user?.cart?.reduce((count, item) => count + (item.quantity || 0), 0) || 0;
  let userInitials = '??';
  if (req.session.user?.name) {
    try {
      const nameParts = req.session.user.name.trim().split(' ');
      if (nameParts.length > 1 && nameParts[0] && nameParts[nameParts.length - 1]) userInitials = (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase();
      else if (nameParts.length === 1 && nameParts[0].length >= 2) userInitials = nameParts[0].substring(0, 2).toUpperCase();
      else if (nameParts.length === 1 && nameParts[0].length === 1) userInitials = (nameParts[0][0] + nameParts[0][0]).toUpperCase();
    } catch (e) { userInitials = '??'; }
  }
   else if (req.session.user?.email) {
     const emailPrefix = req.session.user.email.split('@')[0];
     if (emailPrefix.length >= 2) { userInitials = emailPrefix.substring(0, 2).toUpperCase(); }
     else if (emailPrefix.length === 1) { userInitials = emailPrefix.toUpperCase() + emailPrefix.toUpperCase(); }
   }
  res.locals.userInitials = userInitials;


  res.locals.currentUrl = req.originalUrl;
  res.locals.fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  res.locals.formatDateIST = (dateInput) => {
      if (!dateInput) return 'N/A';
      try { const date = new Date(dateInput); return date.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }); }
      catch (error) { console.error("Date Format Error:", error, dateInput); return 'Date Error'; }
  };
  res.locals.defaultSiteName = 'miniapp';
  res.locals.NODE_ENV = process.env.NODE_ENV;
  res.locals.siteCategories = siteCategories;
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