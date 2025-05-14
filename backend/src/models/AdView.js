const mongoose = require('mongoose');

const adViewSchema = new mongoose.Schema({
  adId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ad',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  role: {
    type: String,
    enum: ['admin', 'member'],
    required: true
  },
  viewedAt: {
    type: Date,
    default: Date.now
  },
  clicked: {
    type: Boolean,
    default: false
  },
  clickType: {
    type: String,
    enum: ['cta', 'learn_more', 'image', 'video', 'close', 'other'],
    default: 'cta'
  },
  clickedAt: {
    type: Date,
    default: null
  },
  deviceInfo: {
    type: Object,
    default: () => ({
      userAgent: '',
      screenWidth: 0,
      screenHeight: 0,
      path: ''
    })
  },
  viewDuration: {
    type: Number, // Duration in seconds
    default: 0
  }
});

// Add indexes for better query performance
adViewSchema.index({ adId: 1, viewedAt: -1 });
adViewSchema.index({ userId: 1, role: 1 });

module.exports = mongoose.model('AdView', adViewSchema);