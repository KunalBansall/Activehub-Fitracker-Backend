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
  }
});

module.exports = mongoose.model('AdView', adViewSchema); 