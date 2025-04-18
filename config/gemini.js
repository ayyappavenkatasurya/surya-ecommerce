// config/gemini.js
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Access your API key as an environment variable
if (!process.env.GEMINI_API_KEY) {
    console.warn("GEMINI_API_KEY is not set in .env file. Gemini features will be disabled.");
}

const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

const textModel = genAI ? genAI.getGenerativeModel({ model: "gemini-2.0-flash"}) : null; // Use appropriate model

if (genAI && textModel) {
    console.log("Gemini AI SDK Initialized successfully.");
} else {
     console.log("Gemini AI SDK could not be initialized (API Key missing?).");
}

module.exports = { textModel }; // Export the model instance