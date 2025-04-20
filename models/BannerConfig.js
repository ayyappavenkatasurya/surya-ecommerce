// models/BannerConfig.js
const mongoose = require('mongoose');

const BannerSchema = new mongoose.Schema({
  imageUrl: { type: String, trim: true, required: true },
  linkUrl: { type: String, trim: true }, // Optional: URL to navigate to when banner is clicked
  title: { type: String, trim: true }, // Optional: Title/Alt text for the banner
}, { _id: false }); // Don't need separate IDs for each banner item in the array

const BannerConfigSchema = new mongoose.Schema({
  // Using a known key to ensure we only have one document (singleton pattern)
  configKey: {
    type: String,
    default: 'mainBanners',
    unique: true, // Enforces only one banner config document
    required: true,
  },
  banners: {
    type: [BannerSchema],
    validate: [arrayLimit, '{PATH} exceeds the limit of 4 banners'] // Custom validator
  },
  lastUpdatedBy: { // Track who last updated it
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true // Adds createdAt and updatedAt
});

// Custom validator function for array limit
function arrayLimit(val) {
  return val.length <= 4;
}

const BannerConfig = mongoose.model('BannerConfig', BannerConfigSchema);

module.exports = BannerConfig;