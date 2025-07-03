// controllers/adminController.js
const Admin = require("../models/Admin");
const jwt = require('jsonwebtoken');
const { sendEmail } = require('../services/emailService');

// Get Admin Profile
exports.getAdminProfile = async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1]; // Extract the token
        if (!token) {
          return res.status(400).json({ message: 'Authentication required' });
        }
    
        // Decode token or fetch admin profile from DB using the token
        const decoded = jwt.verify(token, process.env.JWT_SECRET); // JWT decoding example


        const adminProfile = await Admin.findById(decoded.id); // Example: retrieve admin profile


    
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
    let oldEmail = null;

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

    // Get the current admin data before updating
    const currentAdmin = await Admin.findById(adminId);
    if (!currentAdmin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    // Check if email is being updated
    if (updates.email && updates.email !== currentAdmin.email) {
      // First check if the new email is already in use
      const emailExists = await Admin.findOne({ 
        _id: { $ne: adminId }, // Exclude current admin
        email: { $regex: new RegExp(`^${updates.email}$`, 'i') } // Case-insensitive match
      });
      
      if (emailExists) {
        return res.status(400).json({ 
          message: "Email already in use",
          field: "email"
        });
      }
      
      oldEmail = currentAdmin.email;
      
      // Prepare email content but don't send yet
      const emailSubject = 'Important: Your ActiveHub Account Email Has Been Updated';
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Email Address Updated</h2>
          <p>Hello ${currentAdmin.username || 'there'},</p>
          <p>This is to inform you that the email address associated with your ActiveHub Fitracker account has been updated.</p>
          <p><strong>Old Email:</strong> ${oldEmail}</p>
          <p><strong>New Email:</strong> ${updates.email}</p>
          <p>If you did not make this change, please contact our support team immediately.</p>
          <p>Thank you,<br>The ActiveHub Fitracker Team</p>
        </div>
      `;
      
      // Prepare welcome email for new email
      const newEmailSubject = 'Welcome to ActiveHub - Your Account Email Has Been Updated';
      const newEmailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Welcome to ActiveHub</h2>
          <p>Hello ${currentAdmin.username || 'there'},</p>
          <p>This email is now associated with your ActiveHub Fitracker account.</p>
          <p>If you did not make this change, please contact our support team immediately.</p>
          <p>Thank you for using ActiveHub Fitracker!</p>
          <p>Best regards,<br>The ActiveHub Fitracker Team</p>
        </div>
      `;

      // Only send emails after successful update (see below)
      const emailTemplates = {
        oldEmail: { to: oldEmail, subject: emailSubject, html: emailHtml },
        newEmail: { to: updates.email, subject: newEmailSubject, html: newEmailHtml }
      };
      
      // Store email templates to be sent after successful update
      updates._emailTemplates = emailTemplates;
    }

    // Remove email templates from updates before saving
    const emailTemplates = updates._emailTemplates;
    delete updates._emailTemplates;
    
    const admin = await Admin.findByIdAndUpdate(adminId, updates, {
      new: true,
      runValidators: true,
    }).select("-password");

    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }
    
    // Only send emails after successful update
    if (emailTemplates) {
      try {
        await Promise.all([
          sendEmail(emailTemplates.oldEmail.to, emailTemplates.oldEmail.subject, emailTemplates.oldEmail.html),
          sendEmail(emailTemplates.newEmail.to, emailTemplates.newEmail.subject, emailTemplates.newEmail.html)
        ]);
      } catch (emailError) {
        console.error('Failed to send email notifications:', emailError);
        // Don't fail the request if email sending fails
      }
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

// Get All Gyms
exports.getAllGyms = async (req, res) => {
  try {
    const gyms = await Admin.find({}, { _id: 1, gymName: 1, email: 1 });
    res.status(200).json(gyms);
  } catch (error) {
    console.error('Error fetching gyms:', error);
    res.status(500).json({ message: 'Error fetching gyms', error: error.message });
  }
};

// Mark onboarding tour as completed
exports.markTourCompleted = async (req, res) => {
  try {
    const { adminId } = req.body;
    
    if (!adminId) {
      return res.status(400).json({ message: 'Admin ID is required' });
    }
    
    // Update the admin document to mark the tour as completed
    const updatedAdmin = await Admin.findByIdAndUpdate(
      adminId,
      { hasCompletedTour: true },
      { new: true }
    );
    
    if (!updatedAdmin) {
      return res.status(404).json({ message: 'Admin not found' });
    }
    
    res.status(200).json({
      message: 'Tour marked as completed successfully',
      hasCompletedTour: updatedAdmin.hasCompletedTour
    });
  } catch (error) {
    console.error('Error marking tour as completed:', error);
    res.status(500).json({ message: 'Error marking tour as completed', error: error.message });
  }
};
