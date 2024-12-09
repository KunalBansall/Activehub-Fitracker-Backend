const mongoose = require("mongoose");

const memberSchema = new mongoose.Schema(
  {
    gymId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin", // Assuming you have an Admin model
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      match: /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/,
    },
    phoneNumber: {
      type: String,
      required: true,
      match: /^\+?[\d\s-]+$/,
    },
    weight: {
      type: Number,
      required: true,
      min: 20,
      max: 300,
    },
    height: {
      type: Number,
      required: true,
      min: 100,
      max: 250,
    },
    trainerAssigned: {
      type: String,
    },
    membershipStartDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    durationMonths: {
      type: Number,
      required: true,
      min: 1,
      max: 60,
    },
    membershipEndDate: {
      type: Date,
      required: true,
    },
    fees: {
      type: Number,
      required: true,
      min: 0,
    },
    feeStatus: {
      type: String,
      enum: ["paid", "due"],
      default: "due",
    },
    photo: {
      type: String,
    },
    status: {
      type: String,
      enum: ["active", "expired", "pending"],
      default: "active",
    },
    membershipType: {
      type: String,
      enum: ["basic", "premium", "platinum"],
      required: true,
    },
    password: {
      // New field for password
      type: String,
      required: false,
    },
    resetToken: {
      // New field for reset token
      type: String,
    },
    resetTokenExpiration: {
      // New field for token expiration
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);
module.exports = mongoose.model("Member", memberSchema);
