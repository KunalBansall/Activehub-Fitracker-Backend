// controllers/adminController.js
const Admin = require("../models/Admin");
const jwt = require('jsonwebtoken');

// Get Admin Profile
exports.getAdminProfile = async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1]; // Extract the token
        if (!token) {
          return res.status(400).json({ message: 'Authentication required' });
        }
    
        // Decode token or fetch admin profile from DB using the token
        const decoded = jwt.verify(token, process.env.JWT_SECRET); // JWT decoding example
        // console.log("Decoded token:", decoded); // Log the decoded token to ensure it contains `_id`

        const adminProfile = await Admin.findById(decoded.id); // Example: retrieve admin profile
        // console.log("Admin profile:", adminProfile); // Log the admin profile to ensure it's fetched correctly

    
        if (!adminProfile) {
          return res.status(404).json({ message: 'Profile not found' });
        }
    
        return res.status(200).json(adminProfile);
      } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Server error', error: error.message });
      }
};

// Update Admin Profile
exports.updateAdminProfile = async (req, res) => {
  try {
    const adminId = req.admin._id;
    const updates = req.body;

    // Only allow these fields to be updated
    const allowedUpdates = [
      "username",
      "email",
      "gymName",
      "gymAddress",
      "gymType",
    ];

    const updateFields = Object.keys(updates);
    const isValidOperation = updateFields.every((field) =>
      allowedUpdates.includes(field)
    );

    if (updates.gymAddress) {
        const allowedAddressFields = ['street', 'city', 'state', 'zipCode', 'country'];
        const addressFields = Object.keys(updates.gymAddress);
        const isValidAddress = addressFields.every(field => allowedAddressFields.includes(field));
  
        if (!isValidAddress) {
          return res.status(400).json({ message: "Invalid gymAddress fields" });
        }
      }

    const admin = await Admin.findByIdAndUpdate(adminId, updates, {
      new: true,
      runValidators: true,
    }).select("-password");

    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    res.status(200).json(admin);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
