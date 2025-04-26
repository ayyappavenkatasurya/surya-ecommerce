// config/categories.js

// ** IMPORTANT: Replace these placeholder URLs with your actual external image URLs **
const categories = [
    { name: "Electronics", iconUrl: "https://cdn.iconscout.com/icon/premium/png-512-thumb/electronics-industry-4494765-3725864.png?f=webp&w=512" },
    { name: "Food", iconUrl: "https://cdn-icons-png.flaticon.com/128/737/737967.png" },
    { name: "Home & Kitchen", iconUrl: "https://cdn.iconscout.com/icon/free/png-512/free-kitchen-icon-download-in-svg-png-gif-file-formats--appliances-stove-digital-electric-cooking-online-store-pack-miscellaneous-icons-288069.png?f=webp&w=512" },
    { name: "Books", iconUrl: "https://cdn.iconscout.com/icon/premium/png-512-thumb/books-3166435-2641511.png?f=webp&w=512" },
    { name: "Sports & Outdoors", iconUrl: "https://cdn.iconscout.com/icon/premium/png-512-thumb/sports-3552379-2971891.png?f=webp&w=512" },
    { name: "Toys & Games", iconUrl: "https://cdn.iconscout.com/icon/premium/png-512-thumb/games-3407099-2833026.png?f=webp&w=512" },
    { name: "Grocery", iconUrl: "https://cdn.iconscout.com/icon/premium/png-512-thumb/grocery-9471761-7699268.png?f=webp&w=512" },
    { name: "Health & Beauty", iconUrl: "https://cdn.iconscout.com/icon/free/png-512/free-beauty-icon-download-in-svg-png-gif-file-formats--care-cosmetics-makeup-and-pack-icons-804.png?f=webp&w=512" },
    // Add or modify categories as needed
  ];
  
  // Also export just the names for validation purposes
  const categoryNames = categories.map(cat => cat.name);
  
  module.exports = categories;
  module.exports.categoryNames = categoryNames; // Export names separately