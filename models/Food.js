const mongoose = require("mongoose");

// 1. Define what a single Review looks like
const reviewSchema = new mongoose.Schema({
  userName: { type: String, required: true },
  rating: { type: Number, required: true }, // 1 to 5 stars
}, { timestamps: true });

// 2. Update your Food Schema to hold these reviews
const FoodSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  category: { type: String, required: true },
  image: { type: String, required: true },
  isVeg: { type: Boolean, default: true },
  
  // 🚀 NEW FIELDS FOR REVIEWS
  reviews: [reviewSchema],
  rating: { type: Number, default: 0 }, // The calculated average (e.g., 4.2)
  numReviews: { type: Number, default: 0 } // Total number of ratings
});

const Food = mongoose.model("Food", FoodSchema);
module.exports = Food;