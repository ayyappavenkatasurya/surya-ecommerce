// services/geminiService.js
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
const axios = require('axios');
// ** IMPORT the Category model **
const Category = require('../models/Category');

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
    console.warn("GEMINI_API_KEY is not set in .env file. Gemini features will be disabled.");
}

const genAI = API_KEY ? new GoogleGenerativeAI(API_KEY) : null;
// ** Make sure you're using a vision-capable model **
const visionModel = genAI ? genAI.getGenerativeModel({ model: "gemini-2.0-flash" }) : null; // Using gemini-1.5-flash as it's generally available and vision capable

// Standard Safety Settings (Adjust thresholds as needed for your specific use case)
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

/**
 * Fetches an image from a URL and converts it to a Gemini GenerativePart object.
 * @param {string} url The URL of the image.
 * @returns {Promise<object|null>} A promise that resolves to the GenerativePart object or null on error.
 */
async function urlToGenerativePart(url) {
    console.log(`Fetching image from: ${url}`);
    try {
        const response = await axios.get(url, {
            responseType: 'arraybuffer', // Get image data as a buffer
            timeout: 15000 // Increased timeout to 15 seconds
        });

        // Check status first
        if (response.status !== 200) {
            console.warn(`urlToGenerativePart: HTTP error status ${response.status} for URL: ${url}`);
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const contentType = response.headers['content-type']?.toLowerCase();
        const supportedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

        // Check content type validity
        if (!contentType || !supportedTypes.includes(contentType)) {
            console.warn(`urlToGenerativePart: Invalid or unsupported image Content-Type: ${contentType} from URL: ${url}`);
            throw new Error(`Unsupported image type: ${contentType || 'Unknown'}. Supported types: ${supportedTypes.join(', ')}`);
        }

        // Check buffer size (e.g., limit to ~4MB, Gemini API limit)
        const MAX_SIZE_BYTES = 4 * 1024 * 1024; // ~4MB
        if (response.data.length > MAX_SIZE_BYTES) {
            console.warn(`urlToGenerativePart: Image size (${(response.data.length / (1024 * 1024)).toFixed(2)}MB) exceeds limit for URL: ${url}`);
            throw new Error(`Image size exceeds the limit of ${MAX_SIZE_BYTES / (1024 * 1024)}MB.`);
        }
        if (response.data.length === 0) {
            console.warn(`urlToGenerativePart: Image data buffer is empty for URL: ${url}`);
             throw new Error(`Image data is empty.`);
         }


        const base64Data = Buffer.from(response.data).toString('base64');

        return {
            inlineData: {
                data: base64Data,
                mimeType: contentType,
            },
        };
    } catch (error) {
         // Log specific Axios error details if available
         console.error(`Error processing image from ${url}: ${error.message}`);
         if (axios.isAxiosError(error)) {
             let detail = '';
             if (error.response) {
                 detail = `Server responded with status ${error.response.status}`;
             } else if (error.request) {
                  detail = `No response received (Timeout: ${error.config?.timeout}ms or network issue)`;
             } else {
                 detail = `Request setup error (${error.message})`;
             }
              console.error(`Axios Error Detail: ${detail}`);
              // Throw a more specific error message
              throw new Error(`Failed to fetch/process image: ${detail}`);
         } else {
              // Re-throw generic errors or errors from size/type checks
              throw error;
         }
    }
}

/**
 * Reviews a product's details and image using Gemini Vision model.
 * @param {object} product The product object from MongoDB (should ideally have categoryName populated).
 * @returns {Promise<{status: string, reason: string|null}>} Object with review status ('approved', 'rejected', 'pending') and optional reason.
 */
const reviewProductWithGemini = async (product) => {
    // Guard clause if Gemini is not initialized
    if (!visionModel) {
        console.log("Gemini Vision model not available. Skipping review, defaulting to 'pending'.");
        return { status: 'pending', reason: 'Gemini Vision service unavailable.' };
    }

    // Destructure product fields - categoryRef is needed as fallback
    const { _id, name, categoryRef, categoryName, price, description, specifications, imageUrl } = product;

    // Log entry point
    console.log(`Starting Gemini Vision review for product "${name}" (ID: ${_id})`);

    let imagePart;
    try {
        imagePart = await urlToGenerativePart(imageUrl);
        // We already throw errors inside urlToGenerativePart if critical issues occur
        console.log(`Successfully prepared image part for "${name}" (${_id}).`);
    } catch (imageError) {
        console.error(`Cannot review product "${name}" (${_id}) due to image processing error: ${imageError.message}`);
        // Provide a user-friendly reason for rejection
        return { status: 'rejected', reason: `Image Error: Failed to load or process image. ${imageError.message}` };
    }

    // --- Determine Category Name for Review ---
    let categoryNameToReview = categoryName; // Prefer the name already on the product object

    // Fallback: If categoryName isn't populated/available, fetch it using categoryRef
    if (!categoryNameToReview && categoryRef) {
        console.warn(`Product "${name}" (${_id}) provided without categoryName populated. Fetching from DB using ref: ${categoryRef}`);
        try {
            const categoryDoc = await Category.findById(categoryRef).select('name').lean();
            if (categoryDoc && categoryDoc.name) {
                 categoryNameToReview = categoryDoc.name;
                 console.log(`Successfully fetched category name "${categoryNameToReview}" for product "${name}" (${_id}).`);
            } else {
                // Category ID exists but document not found or has no name
                console.error(`Gemini Review: Category document not found or missing name for ID ${categoryRef} (Product: "${name}", ID: ${_id})`);
                 categoryNameToReview = 'Invalid/Missing Category'; // Use a clear fallback
                 // Optionally, could reject immediately here
                 // return { status: 'rejected', reason: 'Invalid category associated with product.' };
            }
        } catch (catError) {
            console.error(`Gemini Review: Error fetching category ${categoryRef} for product "${name}" (${_id}):`, catError);
            // Consider this a temporary failure - mark as pending? Or reject?
            // Let's default to pending with a note about the category fetch error.
             return { status: 'pending', reason: `AI review failed: Could not verify category (${catError.message}).` };
        }
    } else if (!categoryNameToReview && !categoryRef) {
         console.error(`Gemini Review: Product "${name}" (${_id}) has neither categoryName nor categoryRef.`);
         categoryNameToReview = 'No Category Specified';
         // Could reject immediately:
         // return { status: 'rejected', reason: 'Product is missing required category information.' };
     }

    // --- Construct the Text Prompt ---
    const textPrompt = `
        Analyze the following product details AND the provided image for an e-commerce store. Act as a strict content moderator.

        **Instructions:**
        1. Examine the IMAGE CONTENT closely for prohibited items, safety concerns, and relevance.
        2. Examine the TEXT DETAILS (Name, Category, Description, Price, Specifications) for appropriateness, legitimacy, and relevance.
        3. **Crucially Verify:** Does the image VISUALLY AND CLEARLY MATCH the product described by the text (name, category: "${categoryNameToReview || 'N/A'}", key features in description/specs)? Misleading images are grounds for rejection.
        4. Check BOTH image and text strictly for:
            - Explicit content (nudity, graphic violence).
            - Real weapons (unless the category is strictly controlled, like 'Hunting Gear', and depicted appropriately; toy weapons must be clearly identifiable as toys in image AND text/category).
            - Illegal items or substances.
            - Hate speech, hateful symbols, harassment.
            - Content promoting dangerous acts.
            - Counterfeit indicators (if obvious from text/image).
            - Generally unsafe or harmful content.
        5. Check if the text details are legitimate:
            - Is the name/description coherent, relevant, and not misleading or nonsensical?
            - Is the price realistic for the item described in "${categoryNameToReview || 'N/A'}" category (reject clearly absurd prices like ₹1 for a car, but allow sale prices)?
            - Does the provided Category ("${categoryNameToReview || 'N/A'}") accurately fit the product shown in the image and described in the text?
        6. **Bias Check**: Ensure the review is based on policy violation, not personal preference or cultural bias.
        7. **Response Format**: Respond ONLY with "APPROVE" or "REJECT: [BRIEF_REASON]". The reason should be concise and informative.
        8. **Default to Rejection**: If unsure about safety, legitimacy, or image match, lean towards REJECT with a clear reason.

        **Product Details (Text):**
        - Name: ${name || '[MISSING NAME]'}
        - Category: ${categoryNameToReview || '[MISSING CATEGORY]'}
        - Description: ${description || 'Not provided'}
        - Price: ₹${typeof price === 'number' ? price.toFixed(2) : '[MISSING PRICE]'}
        - Specifications: ${specifications || 'Not provided'}
        - Provided Image URL: ${imageUrl || '[MISSING IMAGE URL]'}

        **Analysis Task:** Based on ALL instructions and checks above:
        Respond ONLY with "APPROVE" or "REJECT: [CONCISE_REASON]".

        Your response:`;

    const textPart = { text: textPrompt };
    const generationConfig = {
        // temperature: 0.3, // Lower temperature for more deterministic classification
        maxOutputTokens: 100 // Limit response length
    };

    // --- Perform Gemini API Call ---
    try {
        console.log(`Sending product "${name}" (ID: ${_id}) for Gemini Vision review with final category: "${categoryNameToReview}"...`);
        const result = await visionModel.generateContent(
            [textPart, imagePart], // Ensure imagePart is valid here
            { safetySettings, generationConfig } // Pass safety settings and config
        );
        const response = result?.response; // Optional chaining

        // Handle potential safety blocks from the API response
        if (!response || response.promptFeedback?.blockReason) {
           const blockReason = response?.promptFeedback?.blockReason || 'Unknown safety reason';
           const safetyRatings = response?.promptFeedback?.safetyRatings || []; // Might provide more detail
           console.warn(`Gemini review for "${name}" (ID: ${_id}) blocked by API. Reason: ${blockReason}. Ratings: ${JSON.stringify(safetyRatings)}`);
           return { status: 'rejected', reason: `Content blocked by AI safety filters (${blockReason}). Please revise content.` };
        }

        // Get the text response and clean it
        const reviewText = response?.text()?.trim().toUpperCase() || '';
        console.log(`Gemini Vision Raw Response for "${name}" (ID: ${_id}): ${reviewText}`);

        // Parse the response
        if (reviewText.startsWith('APPROVE')) {
            console.log(`Gemini Vision APPROVED product: "${name}" (ID: ${_id})`);
            return { status: 'approved', reason: null };
        } else if (reviewText.startsWith('REJECT')) {
            // Extract reason, provide a fallback if formatting is unexpected
            const reason = reviewText.substring('REJECT:'.length).trim() || 'Rejected by AI model (no specific reason provided).';
            console.log(`Gemini Vision REJECTED product: "${name}" (ID: ${_id}). Reason: ${reason}`);
            return { status: 'rejected', reason: reason };
        } else {
            // Handle unexpected response format
            console.warn(`Unexpected Gemini Vision response format for "${name}" (ID: ${_id}): "${reviewText}". Defaulting to pending.`);
            return { status: 'pending', reason: 'AI review result unclear or response format unexpected.' };
        }

    } catch (error) {
        // Handle errors during the API call itself
        console.error(`Error during Gemini Vision API call for product "${name}" (ID: ${_id}):`, error);
        let reason = 'AI review failed due to an API error.';
        // Check if it's a safety-related error from the client library/API
        if (error.message && (error.message.includes('SAFETY') || error.message.includes('blocked'))) {
            reason = 'Content blocked by AI safety filters during API call. Please revise content.';
        } else if (error.message) {
            // Provide a snippet of the error message
            reason = `AI API Error: ${error.message.substring(0, 150)}${error.message.length > 150 ? '...' : ''}`;
        }
        // Default to rejecting if the AI review process fails critically
        return { status: 'rejected', reason: reason };
    }
};

module.exports = { reviewProductWithGemini };