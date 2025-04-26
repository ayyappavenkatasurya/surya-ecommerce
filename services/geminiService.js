// services/geminiService.js
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
const axios = require('axios');

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
    console.warn("GEMINI_API_KEY is not set in .env file. Gemini features will be disabled.");
}
const genAI = API_KEY ? new GoogleGenerativeAI(API_KEY) : null;
// --- UPDATED: Use a vision-capable model like gemini-1.5-flash ---
const visionModel = genAI ? genAI.getGenerativeModel({ model: "gemini-1.5-flash" }) : null;
// --- END UPDATED ---

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
        // Relaxed content type check to allow more flexibility, but keep warning
        if (!contentType || !contentType.toLowerCase().startsWith('image/')) {
             console.warn(`Potentially unsupported image Content-Type: ${contentType} from URL: ${url}. Proceeding but Gemini might reject.`);
             // Allow common image types even if not strictly in the list
             if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'].includes(contentType.toLowerCase())) {
                 console.warn(`Content-Type ${contentType} is less common for Gemini Vision.`);
             }
        } else if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'].includes(contentType.toLowerCase())) {
             console.warn(`Content-Type ${contentType} is less common for Gemini Vision.`);
        }


        const base64Data = Buffer.from(response.data).toString('base64');

        return {
            inlineData: {
                data: base64Data,
                mimeType: contentType || 'application/octet-stream', // Provide a default if missing
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
             throw error; // Re-throw other errors
         }
    }
}


const reviewProductWithGemini = async (product) => {
    if (!visionModel) {
        console.log("Gemini Vision model not available. Skipping review, defaulting to 'pending'.");
        return { status: 'pending', reason: 'Gemini Vision service unavailable' };
    }

    // --- UPDATED: Destructure imageUrl2 ---
    const { name, category, price, specifications, imageUrl, imageUrl2, shortDescription } = product;
    // --- END UPDATED ---

    let imagePart;
    let imagePart2 = null; // Initialize second image part as null

    try {
        // Process first image (required)
        imagePart = await urlToGenerativePart(imageUrl);
        if (!imagePart) throw new Error("Primary image processing failed.");
        console.log(`Successfully prepared primary image part for ${name} from ${imageUrl}`);

        // --- UPDATED: Process second image (optional) ---
        if (imageUrl2) {
            try {
                imagePart2 = await urlToGenerativePart(imageUrl2);
                if (!imagePart2) throw new Error("Second image processing failed unexpectedly.");
                 console.log(`Successfully prepared second image part for ${name} from ${imageUrl2}`);
            } catch (image2Error) {
                console.warn(`Could not process second image for "${name}" (${imageUrl2}): ${image2Error.message}. Proceeding with primary image only.`);
                // Note: We are choosing *not* to reject if only the second image fails.
                // If the second image MUST be valid, you could reject here:
                // return { status: 'rejected', reason: `Second Image Error: ${image2Error.message}` };
            }
        }
        // --- END UPDATED ---

    } catch (imageError) {
        console.error(`Cannot review product "${name}" due to critical image processing error: ${imageError.message}`);
        // Reject if the primary image fails
        return { status: 'rejected', reason: `Image Error: ${imageError.message}` };
    }


    // --- UPDATED: Construct Text Prompt Part (Mention potential second image) ---
    const textPrompt = `
        Analyze the following product details AND the provided image(s) for an e-commerce store. Act as a strict content moderator.

        **Instructions:**
        1. Examine the IMAGE CONTENT closely (check BOTH images if a second one is provided).
        2. Examine the TEXT DETAILS (Name, Category, Short Description, Price, Specifications).
        3. Verify if the image(s) VISUALLY MATCH the product described by the text (name, category, short description). Are they clearly the item described?
        4. Check BOTH image(s) and text for:
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
        - Short Description: ${shortDescription || 'Not provided'}
        - Price: ₹${price?.toFixed(2) || 'N/A'}
        - Specifications: ${specifications || 'Not provided'}
        - Primary Image URL: ${imageUrl}
        - Second Image URL: ${imageUrl2 || 'Not provided'} <%# Mention second URL %>

        **Analysis Task:** Based on BOTH the text analysis AND image content analysis (considering both images if provided):
        - Respond with "APPROVE" if the product (image(s) and text) seems legitimate, safe, accurately described, and the image(s) clearly match the text description.
        - Respond with "REJECT: [BRIEF REASON]" if ANY issues are found (safety violation in image/text, image mismatch, misleading text, nonsensical entry, absurd price, etc.). Example Reasons: "Image contains prohibited items", "Text contains inappropriate language", "Image does not match product description", "Price is nonsensical".

        Your response:`;
    // --- END UPDATED ---

    const textPart = { text: textPrompt };

    // --- UPDATED: Prepare content parts array (include imagePart2 if it exists) ---
    const contentParts = [textPart, imagePart];
    if (imagePart2) {
        contentParts.push(imagePart2);
    }
    // --- END UPDATED ---

    // --- Call Gemini API ---
    try {
        console.log(`Sending product "${name}" (${imagePart2 ? '2 images' : '1 image'}) for Gemini Vision review...`);
        const result = await visionModel.generateContent(
            contentParts, // Use the dynamic array
            { safetySettings } // Apply safety settings
        );
        const response = result?.response;

        // Check for safety blocks first
        if (!response || response.promptFeedback?.blockReason) {
           const blockReason = response?.promptFeedback?.blockReason || 'Unknown safety reason';
           const safetyRatings = response?.promptFeedback?.safetyRatings || [];
           console.warn(`Gemini review for "${name}" blocked. Reason: ${blockReason}. Ratings: ${JSON.stringify(safetyRatings)}`);
           return { status: 'rejected', reason: `Content blocked by AI safety filters (${blockReason}).` };
        }

        const reviewText = response?.text()?.trim().toUpperCase() || '';
        console.log(`Gemini Vision Review Raw Response for "${name}": ${reviewText}`);

        // Process the response text
        if (reviewText.startsWith('APPROVE')) {
            console.log(`Gemini Vision approved product: ${name}`);
            return { status: 'approved', reason: null };
        } else if (reviewText.startsWith('REJECT')) {
            const reason = reviewText.split(':')[1]?.trim() || 'Rejected by AI model (no specific reason provided).';
            console.log(`Gemini Vision rejected product: ${name}. Reason: ${reason}`);
            return { status: 'rejected', reason: reason };
        } else {
            // Handle cases where the model might not return exactly APPROVE or REJECT
            console.warn(`Unexpected Gemini Vision response format for "${name}": ${reviewText}. Defaulting to pending.`);
            // You might want to log the full response here for debugging: console.log(JSON.stringify(response));
            return { status: 'pending', reason: 'AI review result unclear.' };
        }

    } catch (error) {
        // Handle API call errors
        console.error(`Error during Gemini Vision API call for product "${name}":`, error);
        let reason = 'AI review failed due to an API error.';
        // Check if the error message indicates a safety issue (this might vary depending on the SDK version)
        if (error.message && (error.message.includes('SAFETY') || error.message.includes('blocked'))) {
            reason = 'Content potentially blocked by safety filters during API call.';
        } else if (error.message) {
            // Provide a snippet of the error message for context
            reason = `AI API Error: ${error.message.substring(0, 100)}${error.message.length > 100 ? '...' : ''}`;
        }
        // It's often safer to reject if the AI review fails catastrophically
        return { status: 'rejected', reason: reason };
    }
};

module.exports = { reviewProductWithGemini };