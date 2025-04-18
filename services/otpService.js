// services/otpService.js
const crypto = require('crypto');

/**
 * Generates a random numeric OTP code of a specified length.
 * @param {number} [length=6] - The desired length of the OTP.
 * @returns {string} The generated OTP code.
 */
const generateOTP = (length = 6) => {
  // More robust generation ensuring target length even with non-numeric hex chars
  if (length <= 0) throw new Error('OTP length must be positive');
  const chars = '0123456789';
  let otp = '';
  const randomBytes = crypto.randomBytes(length); // Generate sufficient random bytes
  for (let i = 0; i < length; i++) {
    const randomIndex = randomBytes[i] % chars.length;
    otp += chars[randomIndex];
  }
  return otp;
};

/**
 * Calculates the expiration timestamp for an OTP.
 * @param {number} [minutes=10] - The duration in minutes until the OTP expires.
 * @returns {Date} The expiration date object.
 */
const setOTPExpiration = (minutes = 10) => {
  // Returns a Date object representing the expiration time
  return new Date(Date.now() + minutes * 60 * 1000);
};

module.exports = { generateOTP, setOTPExpiration };