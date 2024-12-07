// routes/adminRoutes.js
const express = require("express");
const { getAdminProfile, updateAdminProfile } = require("../controllers/adminController");
const { authenticateAdmin } = require("../middleware/auth"); // Middleware for authentication

const router = express.Router();

// GET /profile - Fetch admin profile
router.get("/profile", authenticateAdmin, getAdminProfile);

// PUT /profile - Update admin profile
router.put("/profile", authenticateAdmin, updateAdminProfile);

module.exports = router;
