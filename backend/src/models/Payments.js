const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    razorpay_payment_id: { type: String, required: true },
    razorpay_subscription_id: { type: String },
    razorpay_signature: { type: String },
    status: { type: String, default: "completed" }, // or failed/pending
    planId: { type: String }, // Optional
    amount: { type: Number }, // You can fetch this from Razorpay if needed
    currency: { type: String, default: "INR" },
    method: { type: String }, // Will be set via webhook or Razorpay fetch
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Payment", paymentSchema);
 