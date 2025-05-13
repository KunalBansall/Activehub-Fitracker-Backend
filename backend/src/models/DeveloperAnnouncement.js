const mongoose = require("mongoose");

const developerAnnouncementSchema = new mongoose.Schema(
  {
    title: { 
      type: String, 
      required: true,
      trim: true
    },
    message: { 
      type: String, 
      required: true 
    },
    type: { 
      type: String, 
      enum: ['info', 'warning', 'update'], 
      default: 'info' 
    },
    visible: { 
      type: Boolean, 
      default: true 
    },
    mediaUrl: {
      type: String,
      default: null
    },
    mediaType: {
      type: String,
      enum: ['image', 'video', null],
      default: null
    },
    targetAudience: {
      type: String,
      enum: ['all', 'trial', 'active', 'expired'],
      default: 'all'
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("DeveloperAnnouncement", developerAnnouncementSchema);
