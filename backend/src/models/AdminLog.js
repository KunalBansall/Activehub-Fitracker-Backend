const mongoose = require("mongoose");

const adminLogSchema = new mongoose.Schema({
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Admin", // Reference to Admin model
    required: true,
  },
  action: {
    type: String, // "sign-up" or "sign-in"
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now, // Log timestamp
  },
  ipAddress: {
    type: String, // Capture IP address
  },
  location: {
    city: String,
    region: String,
    country: String,
    lat: Number,
    lon: Number,
  },
  deviceInfo: {
    type: String, // Capture User-Agent for device info
  },
});

module.exports = mongoose.model("AdminLog", adminLogSchema);
