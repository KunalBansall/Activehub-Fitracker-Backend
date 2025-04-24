const mongoose = require('mongoose');

const monthlyRevenueSchema = new mongoose.Schema(
  {
    gymId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: true,
    },
    month: {
      type: Number, // 0-11 (January-December)
      required: true,
    },
    year: {
      type: Number,
      required: true,
    },
    membershipRevenue: {
      type: Number,
      required: true,
      default: 0,
    },
    shopRevenue: {
      type: Number,
      required: true,
      default: 0,
    },
    totalRevenue: {
      type: Number,
      required: true,
      default: 0,
    },
    membershipGrowth: {
      type: Number,
      default: 0,
    },
    shopGrowth: {
      type: Number,
      default: 0,
    },
    totalGrowth: {
      type: Number,
      default: 0,
    },
    revenueGoal: {
      type: Number,
      default: 0,
    },
    goalAchieved: {
      type: Boolean,
      default: false,
    }
  },
  {
    timestamps: true,
  }
);

// Add a compound index for unique month+year+gymId combination
monthlyRevenueSchema.index({ month: 1, year: 1, gymId: 1 }, { unique: true });

module.exports = mongoose.model('MonthlyRevenue', monthlyRevenueSchema); 