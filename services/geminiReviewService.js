// services/geminiReviewService.js
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
const axios = require('axios');
const Product = require('../models/Product'); // To update product status

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL_NAME = "gemini-2.0-flash"; // Use the vision model

if (!API_KEY) {
    console.warn("GEMINI_API_KEY not found in environment variables. Auto-review feature will be disabled.");
}

const genAI = API_KEY ? new GoogleGenerativeAI(API_KEY) : null;
const model = genAI ? genAI.getGenerativeModel({ model: MODEL_NAME }) : null;

// --- Helper function to fetch image data ---
async function urlToGenerativePart(url, mimeType) {
    try {
        console.log(`Fetching image from URL: ${url}`);
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        if (response.status !== 200) {
            throw new Error(`Failed to fetch image: Status code ${response.status}`);
        }
        const inferredMimeType = mimeType || response.headers['content-type'] || 'image/jpeg';
        if (!inferredMimeType.startsWith('image/')) {
             throw new Error(`Invalid content type fetched: ${inferredMimeType}`);
        }
        console.log(`Image fetched successfully. MimeType: ${inferredMimeType}`);
        return {
            inlineData: {
                data: Buffer.from(response.data).toString("base64"),
                mimeType: inferredMimeType,
            },
        };
    } catch (error) {
        console.error(`Error fetching image from URL ${url}:`, error.message);
        throw new Error(`Could not fetch or process image from URL. ${error.message}`);
    }
}

// --- Main Review Function ---
async function reviewProductWithGemini(productId) {
    if (!model) {
        console.log("Gemini model not initialized (API key missing?). Skipping auto-review for product:", productId);
        return;
    }

    console.log(`Starting Gemini review process for product ID: ${productId}`);
    let product;
    try {
        product = await Product.findById(productId);
        if (!product) {
            console.error(`AutoReview Error: Product ${productId} not found.`);
            return;
        }
        if (product.status !== 'Pending Review') {
            console.log(`Product ${productId} is not 'Pending Review' (Status: ${product.status}). Skipping auto-review.`);
            return;
        }

        // --- Prepare Input for Gemini ---
        const imageParts = [
            await urlToGenerativePart(product.imageUrl),
        ];

        const prompt = `
You are an E-commerce Product Reviewer AI for the Indian market (prices in INR).
Analyze the provided product image, name, and price.

**Product Details:**
*   Name: ${product.name}
*   Price: ₹${product.price.toFixed(2)} INR

**Analysis Tasks:**
1.  **Image-Name Match:** Does the product name "${product.name}" accurately and primarily represent the item(s) shown in the image? (Answer Yes/No)
2.  **Price Reasonableness (India):** Is the price ₹${product.price.toFixed(2)} INR generally reasonable (not extremely high or low) for a product like the one shown in the image, considering the Indian market? (Answer Yes/No)

**Decision Logic:**
*   If BOTH Task 1 and Task 2 are 'Yes', decide 'APPROVE'.
*   If EITHER Task 1 or Task 2 is 'No', decide 'REJECT'.

**Output Format:**
Respond ONLY with a single JSON object containing your decision and a brief reason if rejected. The JSON object should have keys "decision" (string: "APPROVE" or "REJECT") and "reason" (string: explanation if rejected, otherwise null).

**Example Approved Output:**
{"decision": "APPROVE", "reason": null}

**Example Rejected Output (Price):**
{"decision": "REJECT", "reason": "Price seems unusually high for this type of item in the Indian market."}

**Example Rejected Output (Mismatch):**
{"decision": "REJECT", "reason": "Product name does not seem to match the item shown in the image."}

Provide ONLY the JSON object as your response.
`;

        // --- Call Gemini API ---
        console.log(`Sending request to Gemini for product ${productId}...`);
        const generationConfig = {
            temperature: 0.2,
            topK: 1,
            topP: 1,
            maxOutputTokens: 2048,
        };
        const safetySettings = [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        ];

        const result = await model.generateContent({
            contents: [{ role: "user", parts: [...imageParts, { text: prompt }] }],
            generationConfig,
            safetySettings,
        });

        if (!result?.response?.candidates?.[0]?.content?.parts?.[0]?.text) {
             throw new Error("Invalid or incomplete response structure received from Gemini API.");
         }

        const responseText = result.response.candidates[0].content.parts[0].text;
        console.log(`Gemini Response Text for ${productId}:`, responseText);

        // --- Parse Gemini Response ---
        let reviewResult = { decision: 'REJECT', reason: 'Failed to parse AI analysis.' };
        try {
            const cleanedText = responseText.replace(/```json\n?|\n?```/g, '').trim();
            reviewResult = JSON.parse(cleanedText);
            // Basic validation of parsed result
            if (typeof reviewResult.decision !== 'string' || !['APPROVE', 'REJECT'].includes(reviewResult.decision)) {
                throw new Error("Parsed JSON missing valid 'decision' field.");
            }
            if (reviewResult.decision === 'REJECT' && typeof reviewResult.reason !== 'string') {
                 console.warn(`Gemini rejected product ${productId} but reason was missing or not a string. Using default rejection reason.`);
                 reviewResult.reason = 'Rejected by automated review (reason missing).';
             }
        } catch (parseError) {
            console.error(`AutoReview Error: Failed to parse Gemini JSON response for ${productId}:`, parseError, "Raw Response:", responseText);
            // Keep default rejection reason defined above
        }

        // --- FIXED: Update Product Status Conditionally ---
        let finalStatus;
        let updateOperation = {}; // Create the update object

        if (reviewResult.decision === 'APPROVE') {
            finalStatus = 'Approved';
            // If approving, set status and UNSET the reason field
            updateOperation = {
                $set: { status: finalStatus },
                $unset: { rejectionReason: "" } // Use $unset to remove the field entirely
            };
            console.log(`Gemini approved product ${productId}.`);
        } else { // Decision is REJECT
            finalStatus = 'Rejected';
            // If rejecting, set status and SET the reason field
            const finalReason = reviewResult.reason || 'Rejected by automated review (reason unclear).';
            updateOperation = {
                $set: {
                    status: finalStatus,
                    rejectionReason: finalReason
                }
                // No $unset needed here
            };
            console.log(`Gemini rejected product ${productId}. Reason: ${finalReason}`);
        }

        // Apply the correctly constructed update operation
        await Product.findByIdAndUpdate(productId, updateOperation);
        console.log(`Product ${productId} status updated to ${finalStatus}.`);
        // --- END FIXED ---

        // TODO: Optionally notify seller about the outcome here
        // const seller = await User.findOne({ email: product.sellerEmail });
        // if(seller) { sendEmail(...) }

    } catch (error) {
        // Log the specific error that occurred during the process
        console.error(`AutoReview Error: Failed processing product ${productId}:`, error);
        // Do NOT update the product status on error. It remains 'Pending Review'.
        // Optionally mark it for manual review if desired:
        // try {
        //     await Product.findByIdAndUpdate(productId, { $set: { rejectionReason: 'Automated review failed. Needs manual check.' }});
        // } catch (updateError) {
        //     console.error(`AutoReview Error: Failed to mark product ${productId} as needing manual check after error:`, updateError);
        // }
    }
}

module.exports = {
    reviewProductWithGemini
};