// services/geminiService.js
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
const axios = require('axios');

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
    console.warn("GEMINI_API_KEY is not set in .env file. Gemini features will be disabled.");
}

const genAI = API_KEY ? new GoogleGenerativeAI(API_KEY) : null;
const visionModel = genAI ? genAI.getGenerativeModel({ model: "gemini-2.0-flash" }) : null; // Updated model

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

async function urlToGenerativePart(url) {
    console.log(`Fetching image from: ${url}`);
    try {
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 10000
        });

        if (response.status !== 200) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const contentType = response.headers['content-type'];
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
         if (axios.isAxiosError(error)) {
             if (error.response) {
                 throw new Error(`Failed to fetch image: Server responded with status ${error.response.status}`);
             } else if (error.request) {
                  throw new Error(`Failed to fetch image: No response received (Timeout or network issue)`);
             } else {
                 throw new Error(`Failed to fetch image: Request setup error (${error.message})`);
             }
         } else {
             throw error;
         }
    }
}

const reviewProductWithGemini = async (product) => {
    if (!visionModel) {
        console.log("Gemini Vision model not available. Skipping review, defaulting to 'pending'.");
        return { status: 'pending', reason: 'Gemini Vision service unavailable' };
    }

    // *** ADD 'description' to destructuring ***
    const { name, category, price, description, specifications, imageUrl } = product;

    let imagePart;
    try {
        imagePart = await urlToGenerativePart(imageUrl);
        if (!imagePart) {
            throw new Error("Image processing failed unexpectedly.");
        }
         console.log(`Successfully prepared image part for ${name} from ${imageUrl}`);
    } catch (imageError) {
        console.error(`Cannot review product "${name}" due to image processing error: ${imageError.message}`);
        return { status: 'rejected', reason: `Image Error: ${imageError.message}` };
    }

    // *** UPDATE text prompt to include description ***
    const textPrompt = `
        Analyze the following product details AND the provided image for an e-commerce store. Act as a strict content moderator.

        **Instructions:**
        1. Examine the IMAGE CONTENT closely.
        2. Examine the TEXT DETAILS (Name, Category, Description, Price, Specifications).
        3. Verify if the image VISUALLY MATCHES the product described by the text (name, category, key features in description). Is it clearly the item described?
        4. Check BOTH image and text for:
            - Explicit content (nudity, graphic violence).
            - Depictions of weapons (unless clearly a toy and stated category is 'Toys').
            - Illegal items or substances.
            - Hateful symbols or hate speech.
            - Any generally unsafe or harmful content.
        5. Check if the text details seem legitimate:
            - Is the name/description sensible and relevant? Avoid gibberish or clearly misleading text.
            - Is the price reasonable for the category/description (reject absurd prices, but allow discounts)?
            - Does the category make sense for the name/image/description?
        6. **SAFETY IS PARAMOUNT**: If unsure, lean towards rejection, especially for safety concerns (weapons, explicit, illegal).
        7. Use ONLY the required response format.

        **Product Details (Text):**
        - Name: ${name}
        - Category: ${category}
        - Description: ${description || 'Not provided'}  <%# ADDED description %>
        - Price: ₹${price?.toFixed(2) || 'N/A'}
        - Specifications: ${specifications || 'Not provided'}
        - Provided Image URL: ${imageUrl}

        **Analysis Task:** Based on BOTH the text analysis AND image content analysis:
        - Respond with "APPROVE" if the product (image and text) seems legitimate, safe, accurately described, and the image clearly matches the text description.
        - Respond with "REJECT: [BRIEF REASON]" if ANY issues are found (safety violation in image/text, image mismatch, misleading text/description, nonsensical entry, absurd price, etc.). Example Reasons: "Image contains prohibited items", "Text/Description contains inappropriate language", "Image does not match product description", "Price is nonsensical".

        Your response:`;

    const textPart = { text: textPrompt };

    try {
        console.log(`Sending product "${name}" (with image) for Gemini Vision review...`);
        const generationConfig = {
            // Optional: Adjust temperature if needed, but default is often fine for classification
            // temperature: 0.4,
        };
        const result = await visionModel.generateContent(
            [textPart, imagePart],
            { safetySettings, generationConfig } // Pass settings and config
        );
        const response = result?.response;

        if (!response || response.promptFeedback?.blockReason) {
           const blockReason = response?.promptFeedback?.blockReason || 'Unknown safety reason';
           const safetyRatings = response?.promptFeedback?.safetyRatings || [];
           console.warn(`Gemini review for "${name}" blocked. Reason: ${blockReason}. Ratings: ${JSON.stringify(safetyRatings)}`);
           return { status: 'rejected', reason: `Content blocked by AI safety filters (${blockReason}).` };
       }

        const reviewText = response?.text()?.trim().toUpperCase() || '';
        console.log(`Gemini Vision Review Raw Response for "${name}": ${reviewText}`);

        if (reviewText.startsWith('APPROVE')) {
            console.log(`Gemini Vision approved product: ${name}`);
            return { status: 'approved', reason: null };
        } else if (reviewText.startsWith('REJECT')) {
            const reason = reviewText.split(':')[1]?.trim() || 'Rejected by AI model (no specific reason provided).';
            console.log(`Gemini Vision rejected product: ${name}. Reason: ${reason}`);
            return { status: 'rejected', reason: reason };
        } else {
            console.warn(`Unexpected Gemini Vision response format for "${name}": ${reviewText}. Defaulting to pending.`);
            return { status: 'pending', reason: 'AI review result unclear.' };
        }

    } catch (error) {
        console.error(`Error during Gemini Vision API call for product "${name}":`, error);
        let reason = 'AI review failed due to an API error.';
        if (error.message && error.message.includes('SAFETY')) {
            reason = 'Content blocked by AI safety filters during API call.';
        } else if (error.message) {
            reason = `AI API Error: ${error.message.substring(0, 100)}...`;
        }
        return { status: 'rejected', reason: reason };
    }
};

module.exports = { reviewProductWithGemini };