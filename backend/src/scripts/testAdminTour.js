// scripts/testAdminTour.js
require('dotenv').config();
const mongoose = require('mongoose');
const Admin = require('../models/Admin');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});

const resetAdminTourStatus = async (adminId) => {
  try {
    if (!adminId) {
      console.error('Admin ID is required');
      process.exit(1);
    }

    // Find the admin and reset the tour status
    const admin = await Admin.findByIdAndUpdate(
      adminId,
      { hasCompletedTour: false },
      { new: true }
    );

    if (!admin) {
      console.error('Admin not found');
      process.exit(1);
    }

    console.log(`Tour status reset for admin: ${admin.username}`);
    console.log('hasCompletedTour:', admin.hasCompletedTour);
    
    // Close the MongoDB connection
    mongoose.connection.close();
  } catch (error) {
    console.error('Error resetting tour status:', error);
    process.exit(1);
  }
};

// Get admin ID from command line arguments
const adminId = process.argv[2];

// Run the function
resetAdminTourStatus(adminId);
