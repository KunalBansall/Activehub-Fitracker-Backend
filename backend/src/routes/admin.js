// routes/adminRoutes.js
const express = require("express");
const { 
  getAdminProfile, 
  updateAdminProfile,
  addPhoto,
  removePhoto,
  updateProfilePhoto
} = require("../controllers/adminController");
const { authenticateAdmin } = require("../middleware/auth"); // Middleware for authentication

const router = express.Router();

// GET /profile - Fetch admin profile
router.get("/profile", authenticateAdmin, getAdminProfile);

// PUT /profile - Update admin profile
router.put("/profile", authenticateAdmin, updateAdminProfile);

// POST /photos - Add a photo to the admin's gallery
router.post("/photos", authenticateAdmin, addPhoto);

// DELETE /photos/:photoId - Remove a photo from the admin's gallery
router.delete("/photos/:photoId", authenticateAdmin, removePhoto);

// PUT /profile-photo - Update the admin's profile photo
router.put("/profile-photo", authenticateAdmin, updateProfilePhoto);

module.exports = router;
