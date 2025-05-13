// routes/adminRoutes.js
const express = require("express");
const { 
  getAdminProfile, 
  updateAdminProfile,
  addPhoto,
  removePhoto,
  updateProfilePhoto,
  getAllGyms,
  markTourCompleted
} = require("../controllers/adminController");
const { authenticateAdmin } = require("../middleware/auth"); // Middleware for authentication
const {restrictWriteAccess} = require("../middleware/subscriptionAccess");


const router = express.Router();
const developerAnnouncementController = require('../controllers/developerAnnouncementController');

// GET /profile - Fetch admin profile
router.get("/profile", authenticateAdmin, getAdminProfile);

// PUT /profile - Update admin profile
router.put("/profile", authenticateAdmin,restrictWriteAccess, updateAdminProfile);

// POST /photos - Add a photo to the admin's gallery
router.post("/photos", authenticateAdmin,restrictWriteAccess, addPhoto);

// DELETE /photos/:photoId - Remove a photo from the admin's gallery
router.delete("/photos/:photoId", authenticateAdmin,restrictWriteAccess, removePhoto);

// PUT /profile-photo - Update the admin's profile photo
router.put("/profile-photo", authenticateAdmin, updateProfilePhoto);

// POST /tour-completed - Mark the onboarding tour as completed
router.post("/tour-completed", authenticateAdmin, markTourCompleted);

// GET /gyms - Get all gyms
router.get("/gyms", authenticateAdmin, getAllGyms);

// GET /announcements/developer - Get all developer announcements
router.get("/announcements/developer", authenticateAdmin, developerAnnouncementController.getAdminAnnouncements);

module.exports = router;
