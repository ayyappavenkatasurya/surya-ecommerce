// config/categories.js

// ** IMPORTANT: Replace these placeholder URLs with your actual external image URLs **
const categories = [
    { name: "Electronics", iconUrl: "https://img.icons8.com/ios/100/electronics.png" },
    { name: "Fashion", iconUrl: "https://img.icons8.com/ios/100/clothes.png" },
    { name: "Home & Kitchen", iconUrl: "https://img.icons8.com/ios/100/kitchen-room.png" },
    { name: "Books", iconUrl: "https://img.icons8.com/ios/100/books.png" },
    { name: "Sports & Outdoors", iconUrl: "https://img.icons8.com/ios/100/football2.png" },
    { name: "Toys & Games", iconUrl: "https://img.icons8.com/ios/100/controller.png" },
    { name: "Grocery", iconUrl: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRwXOntQInELZDYy4cC3ZoYx6llzPlV9urYoQ&s" },
    { name: "Health & Beauty", iconUrl: "https://img.icons8.com/ios/100/lipstick.png" },
    // Add or modify categories as needed
  ];
  
  // Also export just the names for validation purposes
  const categoryNames = categories.map(cat => cat.name);
  
  module.exports = categories;
  module.exports.categoryNames = categoryNames; // Export names separately