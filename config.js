// config.js
const mongoose = require('mongoose');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
const nodemailer = require('nodemailer');

// --- From config/categories.js ---
const categoriesData = [
    { name: "Electronics", iconUrl: "https://cdn.iconscout.com/icon/premium/png-512-thumb/electronics-industry-4494765-3725864.png?f=webp&w=512" },
    { name: "Food", iconUrl: "https://cdn-icons-png.flaticon.com/128/737/737967.png" },
    { name: "Home & Kitchen", iconUrl: "https://cdn.iconscout.com/icon/free/png-512/free-kitchen-icon-download-in-svg-png-gif-file-formats--appliances-stove-digital-electric-cooking-online-store-pack-miscellaneous-icons-288069.png?f=webp&w=512" },
    { name: "Books", iconUrl: "https://cdn.iconscout.com/icon/premium/png-512-thumb/books-3166435-2641511.png?f=webp&w=512" },
    { name: "Sports & Outdoors", iconUrl: "https://cdn.iconscout.com/icon/premium/png-512-thumb/sports-3552379-2971891.png?f=webp&w=512" },
    { name: "Toys & Games", iconUrl: "https://cdn.iconscout.com/icon/premium/png-512-thumb/games-3407099-2833026.png?f=webp&w=512" },
    { name: "Grocery", iconUrl: "https://cdn.iconscout.com/icon/premium/png-512-thumb/grocery-9471761-7699268.png?f=webp&w=512" },
    { name: "Health & Beauty", iconUrl: "https://cdn.iconscout.com/icon/free/png-512/free-beauty-icon-download-in-svg-png-gif-file-formats--care-cosmetics-makeup-and-pack-icons-804.png?f=webp&w=512" },
];
const categoryNames = categoriesData.map(cat => cat.name);

// --- From config/database.js ---
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error connecting to MongoDB: ${error.message}`);
    process.exit(1);
  }
};

// --- From config/gemini.js ---
if (!process.env.GEMINI_API_KEY) {
    console.warn("GEMINI_API_KEY is not set in .env file. Gemini features will be disabled.");
}
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;
// Text-only model (if still needed elsewhere)
const textModel = genAI ? genAI.getGenerativeModel({ model: "gemini-pro"}) : null; // Use appropriate model
// Vision model (used in geminiService)
const visionModel = genAI ? genAI.getGenerativeModel({ model: "gemini-1.5-flash" }) : null;
const geminiSafetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

if (genAI && visionModel) { // Primarily check the vision model used in services
    console.log("Gemini AI SDK Initialized successfully (Vision capable).");
} else {
     console.log("Gemini AI SDK could not be initialized (API Key missing or Vision model error?).");
}


// --- From config/mailer.js ---
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

// --- Consolidated Exports ---
module.exports = {
    // From categories.js
    categories: categoriesData,
    categoryNames: categoryNames,
    // From database.js
    connectDB,
    // From gemini.js
    textModel, // Exporting text model in case it's used, primarily visionModel is used in services
    visionModel, // Exporting the vision model directly for geminiService
    geminiSafetySettings, // Exporting safety settings
    // From mailer.js
    sendEmail
};