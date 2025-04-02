const crypto = require('crypto');

const generateOTP = (length = 6) => {
  const buffer = crypto.randomBytes(Math.ceil(length / 2));
  let otp = buffer.toString('hex');
  otp = otp.replace(/[^0-9]/g, '');
  otp = otp.slice(0, length);
  while (otp.length < length) {
    otp = '0' + otp;
  }
  return otp;
};

const setOTPExpiration = (minutes = 10) => {
  return Date.now() + minutes * 60 * 1000;
};

module.exports = { generateOTP, setOTPExpiration };
