const mongoose = require("mongoose");

const gymSettingsSchema = new mongoose.Schema(
  {
    gymId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
      unique: true
    },
    smartInactivityAlerts: {
      type: Boolean,
      default: false
    },
    inactivityThresholdDays: {
      type: Number,
      default: 2,
      min: 1,
      max: 14
    },
    notificationCooldownDays: {
      type: Number,
      default: 3,
      min: 1,
      max: 14
    },
    customInactivityMessage: {
      type: String,
      default: "Hey {{name}}! We've missed you at the gym. Let's get back on track 💪"
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("GymSettings", gymSettingsSchema); 