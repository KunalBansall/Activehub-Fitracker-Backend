const express = require("express");
const router = express.Router();
const { getMemberAnnouncements } = require("../controllers/announcementController");
const { authenticateMember } = require("../middleware/authMember");

// Member route - protected with member middleware
router.use(authenticateMember);

// Get announcements for members
router.get("/", getMemberAnnouncements);

module.exports = router; 