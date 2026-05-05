const mongoose = require("mongoose");

const settingsSchema = new mongoose.Schema({
  deliveryFee: { type: Number, default: 40 },
  offerPercentage: { type: Number, default: 10 },
  minOrderForFreeDelivery: { type: Number, default: 300 },
  
  // 🚀 Added these so MongoDB stops ignoring your business info updates
  contactNumber: { type: String, default: "" },
  supportEmail: { type: String, default: "" },
  storeAddress: { type: String, default: "" }
});

module.exports = mongoose.model("Settings", settingsSchema);