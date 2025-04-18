// services/geminiService.js
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
const axios = require('axios'); // Import axios for fetching image data

// --- Configuration ---
const API_KEY = process.env.GEMINI_API_KEY;

// Check if API key is set
if (!API_KEY) {
    console.warn("GEMINI_API_KEY is not set in .env file. Gemini features will be disabled.");
}

const genAI = API_KEY ? new GoogleGenerativeAI(API_KEY) : null;

// *** Use the Vision model ***
const visionModel = genAI ? genAI.getGenerativeModel({ model: "gemini-2.0-flash" }) : null;

// Optional: Configure safety settings
const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];


if (genAI && visionModel) {
    console.log("Gemini AI SDK Initialized successfully with Vision model.");
} else {
     console.log("Gemini AI SDK Vision model could not be initialized (API Key missing or configuration error?).");
}

// --- Helper function to fetch image and get Base64 data + MIME type ---
async function urlToGenerativePart(url) {
    console.log(`Fetching image from: ${url}`);
    try {
        const response = await axios.get(url, {
            responseType: 'arraybuffer', // Fetch as binary data
            timeout: 10000 // Add a timeout (10 seconds)
        });

        if (response.status !== 200) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const contentType = response.headers['content-type'];
        // Basic validation for common image types Gemini supports
        if (!contentType || !['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(contentType.toLowerCase())) {
            console.warn(`Invalid or unsupported image Content-Type: ${contentType} from URL: ${url}`);
            throw new Error(`Unsupported image type: ${contentType}`);
        }

        const base64Data = Buffer.from(response.data).toString('base64');

        return {
            inlineData: {
                data: base64Data,
                mimeType: contentType,
            },
        };
    } catch (error) {
         console.error(`Error fetching image from ${url}: ${error.message}`);
         // Determine if the error is network related, timeout, or status code
         if (axios.isAxiosError(error)) {
             if (error.response) {
                 // Server responded with a status code outside 2xx range
                 throw new Error(`Failed to fetch image: Server responded with status ${error.response.status}`);
             } else if (error.request) {
                 // Request was made but no response received (e.g., timeout, network issue)
                  throw new Error(`Failed to fetch image: No response received (Timeout or network issue)`);
             } else {
                  // Something else happened in setting up the request
                 throw new Error(`Failed to fetch image: Request setup error (${error.message})`);
             }
         } else {
            // Not an Axios error (e.g., validation error thrown above)
             throw error; // Re-throw the original error
         }
    }
}


/**
 * Reviews product text and image content using Gemini Vision API.
 * Fetches the image from the provided URL.
 *
 * @param {object} product - The product object (name, category, price, imageUrl, specifications).
 * @returns {Promise<{status: ('approved'|'rejected'|'pending'), reason: string | null}>} Review result.
 */
const reviewProductWithGemini = async (product) => {
    // Check if Vision model is available
    if (!visionModel) {
        console.log("Gemini Vision model not available. Skipping review, defaulting to 'pending'.");
        return { status: 'pending', reason: 'Gemini Vision service unavailable' };
    }

    const { name, category, price, specifications, imageUrl } = product;

    // --- 1. Fetch and Prepare Image Part ---
    let imagePart;
    try {
        imagePart = await urlToGenerativePart(imageUrl);
        if (!imagePart) { // Should have thrown an error, but double-check
            throw new Error("Image processing failed unexpectedly.");
        }
         console.log(`Successfully prepared image part for ${name} from ${imageUrl}`);
    } catch (imageError) {
        console.error(`Cannot review product "${name}" due to image processing error: ${imageError.message}`);
        // Reject if image fetch/processing fails critically
        return { status: 'rejected', reason: `Image Error: ${imageError.message}` };
    }


    // --- 2. Construct Text Prompt Part ---
    // Update prompt to include image analysis instructions
    const textPrompt = `
        Analyze the following product details AND the provided image for an e-commerce store. Act as a strict content moderator.

        **Instructions:**
        1. Examine the IMAGE CONTENT closely.
        2. Examine the TEXT DETAILS (Name, Category, Price, Specifications).
        3. Verify if the image VISUALLY MATCHES the product described by the text (name, category). Is it clearly the item described?
        4. Check BOTH image and text for:
            - Explicit content (nudity, graphic violence).
            - Depictions of weapons (unless clearly a toy and stated category is 'Toys').
            - Illegal items or substances.
            - Hateful symbols or hate speech.
            - Any generally unsafe or harmful content.
        5. Check if the text details seem legitimate:
            - Is the name/description sensible? Avoid gibberish or clearly misleading text.
            - Is the price reasonable for the category (reject absurd prices like ₹1 for a car, but allow discounts)?
            - Does the category make sense for the name/image?
        6. **SAFETY IS PARAMOUNT**: If unsure, lean towards rejection, especially for safety concerns (weapons, explicit, illegal).
        7. Use ONLY the required response format.

        **Product Details (Text):**
        - Name: ${name}
        - Category: ${category}
        - Price: ₹${price?.toFixed(2) || 'N/A'}
        - Specifications: ${specifications || 'Not provided'}
        - Provided Image URL: ${imageUrl}

        **Analysis Task:** Based on BOTH the text analysis AND image content analysis:
        - Respond with "APPROVE" if the product (image and text) seems legitimate, safe, accurately described, and the image clearly matches the text description.
        - Respond with "REJECT: [BRIEF REASON]" if ANY issues are found (safety violation in image/text, image mismatch, misleading text, nonsensical entry, absurd price, etc.). Example Reasons: "Image contains prohibited items", "Text contains inappropriate language", "Image does not match product description", "Price is nonsensical".

        Your response:`;

    const textPart = { text: textPrompt };

    // --- 3. Call Gemini API ---
    try {
        console.log(`Sending product "${name}" (with image) for Gemini Vision review...`);
        const result = await visionModel.generateContent(
            [textPart, imagePart], // Send both text and image parts
            { safetySettings } // Apply safety settings
        );
        const response = result?.response;

        // Handle potential blocked response due to safety settings BEFORE checking text content
        if (!response || response.promptFeedback?.blockReason) {
           const blockReason = response?.promptFeedback?.blockReason || 'Unknown safety reason';
           const safetyRatings = response?.promptFeedback?.safetyRatings || [];
           console.warn(`Gemini review for "${name}" blocked. Reason: ${blockReason}. Ratings: ${JSON.stringify(safetyRatings)}`);
           return { status: 'rejected', reason: `Content blocked by AI safety filters (${blockReason}).` };
       }

        // Process the successful response text
        const reviewText = response?.text()?.trim().toUpperCase() || '';
        console.log(`Gemini Vision Review Raw Response for "${name}": ${reviewText}`);

        if (reviewText.startsWith('APPROVE')) {
            console.log(`Gemini Vision approved product: ${name}`);
            return { status: 'approved', reason: null };
        } else if (reviewText.startsWith('REJECT')) {
            // Extract reason, provide default if missing after colon
            const reason = reviewText.split(':')[1]?.trim() || 'Rejected by AI model (no specific reason provided).';
            console.log(`Gemini Vision rejected product: ${name}. Reason: ${reason}`);
            return { status: 'rejected', reason: reason };
        } else {
            // Handle unexpected valid response formats
            console.warn(`Unexpected Gemini Vision response format for "${name}": ${reviewText}. Defaulting to pending.`);
            return { status: 'pending', reason: 'AI review result unclear.' };
        }

    } catch (error) {
        // Catch errors during the Gemini API call itself
        console.error(`Error during Gemini Vision API call for product "${name}":`, error);
        let reason = 'AI review failed due to an API error.';
        // Check for specific safety errors sometimes caught here
        if (error.message && error.message.includes('SAFETY')) {
            reason = 'Content blocked by AI safety filters during API call.';
        } else if (error.message) {
            reason = `AI API Error: ${error.message.substring(0, 100)}...`; // Keep reason brief
        }
        // Default to rejection on significant API errors? Or pending? Rejection is safer.
        return { status: 'rejected', reason: reason };
    }
};

module.exports = { reviewProductWithGemini };