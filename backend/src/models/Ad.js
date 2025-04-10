const mongoose = require('mongoose');

const adSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  contentType: {
    type: String,
    enum: ['image', 'video'],
    required: true
  },
  mediaUrl: {
    type: String,
    required: true,
    trim: true
  },
  ctaUrl: {
    type: String,
    trim: true
  },
  targetAudience: {
    type: String,
    enum: ['admin', 'member', 'both'],
    default: 'both'
  },
  gyms: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: 'Admin',
    default: []
  },
  placement: {
    type: String,
    enum: ['sidebar', 'authPage', 'profile', 'topOverlay', 'fullScreen'],
    default: 'sidebar'
  },
  active: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date,
    required: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Ad', adSchema); 