const mongoose = require("mongoose");

const announcementSchema = new mongoose.Schema(
  {
    gymId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
    },
    image: {
      type: String, // URL to the image or video
    },
    mediaType: {
      type: String,
      enum: ["image", "video"],
      default: "image",
    },
    category: {
      type: String,
      enum: ["news", "information", "event", "tip"],
      default: "information",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Announcement", announcementSchema); 