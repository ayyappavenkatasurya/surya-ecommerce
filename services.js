// services.js
const crypto = require('crypto');
const axios = require('axios');
const config = require('./config'); // Import the consolidated config
const { razorpayInstance } = config; // <<< Destructure razorpayInstance


// --- From services/emailTemplateService.js ---
const generateEmailHtml = (options) => {
    // ... (existing generateEmailHtml function - no changes needed here for now)
    const {
      recipientName = 'Valued Customer',
      subject = 'Notification',
      greeting = `Hello ${recipientName},`,
      bodyLines = [],
      buttonUrl,
      buttonText,
      footerText = `© ${new Date().getFullYear()} miniapp. All rights reserved.`,
      companyName = 'miniapp',
      companyAddress = 'Your Company Address Here',
    } = options;

    const styles = {
      body: `margin: 0; padding: 0; -webkit-text-size-adjust: 100%; background-color: #f0f5fd;`,
      wrapper: `width: 100%; table-layout: fixed; -webkit-text-size-adjust: 100%;`,
      main: `background-color: #ffffff; margin: 0 auto; width: 100%; max-width: 600px; border-spacing: 0; font-family: Arial, sans-serif; color: #333333; box-shadow: 0 2px 10px rgba(0,0,0,0.1); border-radius: 8px; overflow: hidden;`,
      header: `background: linear-gradient(135deg, #007bff 0%, #0056b3 100%); color: #ffffff; padding: 25px 20px; text-align: center; border-radius: 8px 8px 0 0; background-color: #007bff;`,
      headerH1: `margin: 0; font-size: 24px; font-weight: bold;`,
      content: `padding: 30px 25px; text-align: left; font-size: 16px; line-height: 1.6;`,
      greeting: `font-size: 18px; font-weight: bold; margin-bottom: 15px;`,
      paragraph: `margin: 0 0 15px 0;`,
      buttonWrapper: `padding: 15px 0; text-align: center;`,
      buttonLink: `background-color: #28a745; color: #ffffff; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; border: none; cursor: pointer; font-size: 16px;`,
      footer: `background-color: #e9ecef; color: #6c757d; padding: 20px 25px; text-align: center; font-size: 12px; line-height: 1.4; border-radius: 0 0 8px 8px;`,
      footerLink: `color: #007bff; text-decoration: none;`,
      preheader: `display: none !important; visibility: hidden; mso-hide: all; font-size: 1px; color: #ffffff; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden;`,
    };
     const bodyHtml = bodyLines
        .map(line => `<p style="${styles.paragraph}">${String(line).replace(/</g, "<").replace(/>/g, ">")}</p>`)
        .map(line => line.replace(/<strong>/g, '<strong>').replace(/<\/strong>/g, '</strong>')
                       .replace(/<br>/g, '<br>')
                       .replace(/<h3 style="(.*?)">/g, '<h3 style="$1">').replace(/<\/h3>/g, '</h3>')
                       .replace(/<ul style="(.*?)">/g, '<ul style="$1">').replace(/<\/ul>/g, '</ul>')
                       .replace(/<li style="(.*?)">/g, '<li style="$1">').replace(/<\/li>/g, '</li>')
                       .replace(/<a href="(.*?)"(.*?)>/g, '<a href="$1"$2>').replace(/<\/a>/g, '</a>')
         )
         .join('');
    let buttonHtml = '';
    if (buttonUrl && buttonText) {
      const safeButtonUrl = String(buttonUrl).replace(/</g, "<").replace(/>/g, ">").startsWith('http') ? buttonUrl : '#';
      const safeButtonText = String(buttonText).replace(/</g, "<").replace(/>/g, ">");
      buttonHtml = `
        <table border="0" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td style="${styles.buttonWrapper}">
              <a href="${safeButtonUrl}" target="_blank" style="${styles.buttonLink}">${safeButtonText}</a>
            </td>
          </tr>
        </table>`;
    }
    const safeSubject = String(subject).replace(/</g, "<");
    const safeCompanyName = String(companyName).replace(/</g, "<");
    const safeFooterText = String(footerText).replace(/</g, "<");
    const safeCompanyAddress = String(companyAddress).replace(/</g, "<");
    const safeGreeting = String(greeting).replace(/</g, "<");
    const html = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>${safeSubject}</title>
    <style type="text/css">
      body { ${styles.body} }
      .wrapper { ${styles.wrapper} }
      .main { ${styles.main} }
      @media screen and (max-width: 600px) {
        .main { width: 95% !important; max-width: 95%; }
        .content { padding: 20px 15px !important; }
        .header h1 { font-size: 20px !important; }
        .buttonLink { padding: 10px 20px !important; font-size: 15px !important; }
      }
    </style>
  </head>
  <body style="${styles.body}">
    <span style="${styles.preheader}">${safeSubject} - ${bodyLines.length > 0 ? String(bodyLines[0]).substring(0, 50).replace(/<[^>]*>?/gm, '') + '...' : ''}</span>
    <center class="wrapper" style="${styles.wrapper}">
      <table class="main" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="${styles.main}">
        <tr>
          <td class="header" style="${styles.header}">
            <h1 style="${styles.headerH1}">${safeCompanyName}</h1>
          </td>
        </tr>
        <tr>
          <td class="content" style="${styles.content}">
            <p style="${styles.greeting}">${safeGreeting}</p>
            ${bodyHtml}
            ${buttonHtml}
            <p style="${styles.paragraph}">If you have any questions, feel free to contact our support team.</p>
            <p style="${styles.paragraph}">Thanks,<br>The ${safeCompanyName} Team</p>
          </td>
        </tr>
        <tr>
          <td class="footer" style="${styles.footer}">
            <p style="margin:0 0 5px 0;">${safeFooterText}</p>
             ${companyAddress ? `<p style="margin:0 0 5px 0;">${safeCompanyAddress}</p>` : ''}
          </td>
        </tr>
      </table>
    </center>
  </body>
  </html>`;
    return html;
};

// --- From services/geminiService.js ---
const urlToGenerativePart = async (url) => {
    // ... (existing urlToGenerativePart function)
    console.log(`Fetching image from: ${url}`);
    try {
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 10000
        });
        if (response.status !== 200) throw new Error(`HTTP error! status: ${response.status}`);
        const contentType = response.headers['content-type'];
         if (!contentType || !contentType.toLowerCase().startsWith('image/')) {
             console.warn(`Potentially unsupported image Content-Type: ${contentType} from URL: ${url}. Proceeding.`);
         } else if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'].includes(contentType.toLowerCase())) {
             console.warn(`Content-Type ${contentType} is less common for Gemini Vision.`);
         }

        const base64Data = Buffer.from(response.data).toString('base64');
        return { inlineData: { data: base64Data, mimeType: contentType || 'application/octet-stream' } };
    } catch (error) {
         console.error(`Error fetching image from ${url}: ${error.message}`);
         if (axios.isAxiosError(error)) {
             if (error.response) throw new Error(`Failed to fetch image: Server responded with status ${error.response.status}`);
             else if (error.request) throw new Error(`Failed to fetch image: No response received`);
             else throw new Error(`Failed to fetch image: Request setup error (${error.message})`);
         } else throw error;
    }
};
const reviewProductWithGemini = async (product) => {
    // ... (existing reviewProductWithGemini function)
    const visionModel = config.visionModel;
    if (!visionModel) {
        console.log("Gemini Vision model not available. Skipping review, defaulting to 'pending'.");
        return { status: 'pending', reason: 'Gemini Vision service unavailable' };
    }
    const { name, category, price, specifications, imageUrl, imageUrl2, shortDescription } = product;
    let imagePart, imagePart2 = null;
    try {
        imagePart = await urlToGenerativePart(imageUrl);
        if (!imagePart) throw new Error("Primary image processing failed.");
        console.log(`Prepared primary image for ${name} from ${imageUrl}`);
        if (imageUrl2) {
            try {
                imagePart2 = await urlToGenerativePart(imageUrl2);
                if (!imagePart2) throw new Error("Second image processing failed.");
                console.log(`Prepared second image for ${name} from ${imageUrl2}`);
            } catch (image2Error) {
                console.warn(`Could not process second image for "${name}" (${imageUrl2}): ${image2Error.message}.`);
            }
        }
    } catch (imageError) {
        console.error(`Critical image processing error for "${name}": ${imageError.message}`);
        return { status: 'rejected', reason: `Image Error: ${imageError.message}` };
    }
    const textPrompt = `
        Analyze the following product details AND the provided image(s) for an e-commerce store. Act as a strict content moderator.
        Instructions: Examine IMAGE(s) and TEXT. Verify if image(s) VISUALLY MATCH text description (name, category, short desc). Check BOTH image(s) and text for explicit content, weapons (unless category 'Toys' and clearly stated), illegal items, hate symbols/speech, unsafe content. Check if text details are legitimate (sensible name/desc, reasonable price for category, category matches image). SAFETY IS PARAMOUNT: If unsure, lean towards REJECTION. Use ONLY the required response format.
        Product Details: Name: ${name}, Category: ${category}, Short Desc: ${shortDescription || 'N/A'}, Price: ₹${price?.toFixed(2) || 'N/A'}, Specs: ${specifications || 'N/A'}, Image1: ${imageUrl}, Image2: ${imageUrl2 || 'N/A'}.
        Analysis Task: Based on text AND image(s), respond with "APPROVE" if legitimate, safe, matches description. Respond with "REJECT: [BRIEF REASON]" if ANY issues (safety violation, mismatch, misleading text, nonsensical entry/price).
        Your response:`;
    const textPart = { text: textPrompt };
    const contentParts = [textPart, imagePart];
    if (imagePart2) {
        contentParts.push(imagePart2);
    }
    try {
        console.log(`Sending "${name}" (${imagePart2 ? '2 images' : '1 image'}) for Gemini Vision review...`);
        const result = await visionModel.generateContent(
            contentParts,
            { safetySettings: config.geminiSafetySettings }
        );
        const response = result?.response;
        if (!response || response.promptFeedback?.blockReason) {
           const blockReason = response?.promptFeedback?.blockReason || 'Unknown safety reason';
           console.warn(`Gemini review blocked for "${name}". Reason: ${blockReason}.`);
           return { status: 'rejected', reason: `Content blocked by AI safety filters (${blockReason}).` };
        }
        const reviewText = response?.text()?.trim().toUpperCase() || '';
        console.log(`Gemini Vision Raw Response for "${name}": ${reviewText}`);
        if (reviewText.startsWith('APPROVE')) {
            console.log(`Gemini Vision approved: ${name}`);
            return { status: 'approved', reason: null };
        } else if (reviewText.startsWith('REJECT')) {
            const reason = reviewText.split(':')[1]?.trim() || 'Rejected by AI (no specific reason).';
            console.log(`Gemini Vision rejected: ${name}. Reason: ${reason}`);
            return { status: 'rejected', reason: reason };
        } else {
            console.warn(`Unexpected Gemini Vision response format for "${name}": ${reviewText}. Defaulting to pending.`);
            return { status: 'pending', reason: 'AI review result unclear.' };
        }
    } catch (error) {
        console.error(`Error during Gemini Vision API call for "${name}":`, error);
        let reason = 'AI review failed due to API error.';
        if (error.message && (error.message.includes('SAFETY') || error.message.includes('blocked'))) {
            reason = 'Content potentially blocked by safety filters during API call.';
        } else if (error.message) {
            reason = `AI API Error: ${error.message.substring(0, 100)}...`;
        }
        return { status: 'rejected', reason: reason };
    }
};


// --- From services/otpService.js ---
const generateOTP = (length = 6) => {
  // ... (existing generateOTP function)
  if (length <= 0) throw new Error('OTP length must be positive');
  const chars = '0123456789';
  let otp = '';
  const randomBytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    otp += chars[randomBytes[i] % chars.length];
  }
  return otp;
};

const setOTPExpiration = (minutes = 10) => {
  return new Date(Date.now() + minutes * 60 * 1000);
};

// --- Razorpay Service Functions --- // <<< ADDED
const createRazorpayOrder = async (amountInPaise, receiptId, notes = {}) => {
    if (!razorpayInstance) {
        throw new Error("Razorpay not initialized. Check API keys.");
    }
    const options = {
        amount: amountInPaise, // amount in the smallest currency unit (e.g., 50000 for ₹500.00)
        currency: "INR",
        receipt: receiptId, // Your internal order ID or a unique receipt string
        notes: notes // Optional notes object
    };
    try {
        const order = await razorpayInstance.orders.create(options);
        console.log("Razorpay order created:", order.id);
        return order; // Contains order_id, amount, currency etc.
    } catch (error) {
        console.error("Error creating Razorpay order:", error);
        throw error;
    }
};

const verifyRazorpayPayment = (razorpayOrderId, razorpayPaymentId, razorpaySignature) => {
    if (!process.env.RAZORPAY_KEY_SECRET) {
        console.error("RAZORPAY_KEY_SECRET not found for verification.");
        return false;
    }
    const body = razorpayOrderId + "|" + razorpayPaymentId;
    const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(body.toString())
        .digest('hex');
    
    return expectedSignature === razorpaySignature;
};


// --- Consolidated Exports ---
module.exports = {
    generateEmailHtml,
    reviewProductWithGemini,
    generateOTP,
    setOTPExpiration,
    createRazorpayOrder, // <<< ADDED
    verifyRazorpayPayment // <<< ADDED
};