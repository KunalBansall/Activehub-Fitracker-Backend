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
    const updates = { ...req.body };

    // Only allow these fields to be updated
    const allowedUpdates = [
      "username",
      "email",
      "gymName",
      "gymAddress",
      "gymType",
      "profilePhotoUrl",
      "profilePhotoId",
      "photos"
    ];

    const updateFields = Object.keys(updates);
    const isValidOperation = updateFields.every((field) =>
      allowedUpdates.includes(field)
    );

    if (!isValidOperation) {
      return res.status(400).json({ 
        message: "Invalid updates", 
        providedFields: updateFields 
      });
    }

    if (updates.gymAddress) {
        const allowedAddressFields = ['street', 'city', 'state', 'zipCode', 'country'];
        const addressFields = Object.keys(updates.gymAddress);
        const isValidAddress = addressFields.every(field => allowedAddressFields.includes(field));
  
        if (!isValidAddress) {
          return res.status(400).json({ message: "Invalid gymAddress fields" });
        }
    }
    
    // Handle photos array validation and transform if present
    if (updates.photos) {
      // Ensure photos is an array
      if (!Array.isArray(updates.photos)) {
        return res.status(400).json({ message: "Photos must be an array" });
      }
      
      // Transform photos if needed and validate
      updates.photos = updates.photos.map(photo => {
        // Create a clean photo object with only the fields we need
        let cleanPhoto = {
          url: photo.url,
          publicId: photo.publicId || photo.id
        };
        
        // If MongoDB _id exists, preserve it
        if (photo._id) {
          cleanPhoto._id = photo._id;
        }
        
        return cleanPhoto;
      });
      
      // Validate each photo object
      for (const photo of updates.photos) {
        if (!photo.url || !photo.publicId) {
          return res.status(400).json({ 
            message: "Each photo must have url and publicId fields" 
          });
        }
      }
    }

    // Handle profile photo ID transformation if needed
    if (updates.id && !updates.profilePhotoId) {
      updates.profilePhotoId = updates.id;
      delete updates.id;
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
    console.error("Update error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Add a photo to the admin's photo gallery
exports.addPhoto = async (req, res) => {
  try {
    const adminId = req.admin._id;
    const { url, publicId, id } = req.body;

    // Validate required fields - accept either publicId or id
    const photoId = publicId || id;
    if (!url || !photoId) {
      return res.status(400).json({ message: "URL and publicId/id are required" });
    }

    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    // Add the new photo to the photos array
    admin.photos.push({ url, publicId: photoId });
    await admin.save();

    res.status(201).json(admin.photos);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Remove a photo from the admin's photo gallery
exports.removePhoto = async (req, res) => {
  try {
    const adminId = req.admin._id;
    const { photoId } = req.params;

    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    // Find and remove the photo
    const photoIndex = admin.photos.findIndex(photo => photo._id.toString() === photoId);
    if (photoIndex === -1) {
      return res.status(404).json({ message: "Photo not found" });
    }

    admin.photos.splice(photoIndex, 1);
    await admin.save();

    res.status(200).json({ message: "Photo removed successfully", photos: admin.photos });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Set or update profile photo
exports.updateProfilePhoto = async (req, res) => {
  try {
    const adminId = req.admin._id;
    const { profilePhotoUrl, profilePhotoId, id } = req.body;

    // Accept either profilePhotoId or id
    const photoId = profilePhotoId || id;

    // Validate required fields
    if (!profilePhotoUrl || !photoId) {
      return res.status(400).json({ 
        message: "Profile photo URL and publicId/id are required" 
      });
    }

    const admin = await Admin.findByIdAndUpdate(
      adminId, 
      { profilePhotoUrl, profilePhotoId: photoId },
      { new: true }
    ).select("-password");

    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    res.status(200).json(admin);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
