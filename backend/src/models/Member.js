const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    match: /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/
  },
  phoneNumber: {
    type: String,
    required: true,
    match: /^\+?[\d\s-]+$/
  },
  weight: {
    type: Number,
    required: true,
    min: 20,
    max: 300
  },
  height: {
    type: Number,
    required: true,
    min: 100,
    max: 250
  },
  trainerAssigned: {
    type: String
  },
  membershipStartDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  durationMonths: {
    type: Number,
    required: true,
    min: 1,
    max: 60
  },
  membershipEndDate: {
    type: Date,
    required: true
  },
  fees: {
    type: Number,
    required: true,
    min: 0
  },
  feeStatus: {
    type: String,
    enum: ['paid', 'due'],
    default: 'due'
  },
  photo: {
    type: String
  },
  status: {
    type: String,
    enum: ['active', 'expired', 'pending'],
    default: 'active'
  },
  membershipType: {
    type: String,
    enum: ['basic', 'premium', 'platinum'],
    required: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Member', memberSchema);