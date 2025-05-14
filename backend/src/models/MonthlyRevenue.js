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
    monthName: {
      type: String, // e.g., "May 2025"
      required: true,
    },
    // Expected revenue
    expectedMembershipRevenue: {
      type: Number,
      required: true,
      default: 0,
    },
    expectedShopRevenue: {
      type: Number,
      required: true,
      default: 0,
    },
    totalExpectedRevenue: {
      type: Number,
      required: true,
      default: 0,
    },
    // Collected revenue
    collectedMembershipRevenue: {
      type: Number,
      required: true,
      default: 0,
    },
    collectedShopRevenue: {
      type: Number,
      required: true,
      default: 0,
    },
    totalCollectedRevenue: {
      type: Number,
      required: true,
      default: 0,
    },
    // Remaining/pending revenue
    pendingMembershipRevenue: {
      type: Number,
      required: true,
      default: 0,
    },
    pendingShopRevenue: {
      type: Number,
      required: true,
      default: 0,
    },
    totalRemainingRevenue: {
      type: Number,
      required: true,
      default: 0,
    },
    // Growth metrics
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
    // Goal tracking
    revenueGoal: {
      type: Number,
      default: 0,
    },
    goalAchieved: {
      type: Boolean,
      default: false,
    },
    // Collection rate
    collectionRate: {
      type: Number,
      default: 0, // Percentage of expected revenue that was collected
    },
    // Additional metadata
    archivedAt: {
      type: Date,
      default: Date.now,
    },
    emailSent: {
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