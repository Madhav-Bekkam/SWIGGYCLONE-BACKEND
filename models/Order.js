const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({
  items: [{ 
    _id: String, name: String, price: Number, quantity: Number, image: String 
  }],
  totalAmount: { type: Number, required: true },
  discount: { type: Number, default: 0 },
  finalAmount: { type: Number, required: true },
  customer: { type: Object, default: {} },
  status: { type: String, default: "Pending" }
}, { timestamps: true });

module.exports = mongoose.model("Order", orderSchema);