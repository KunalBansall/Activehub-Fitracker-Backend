const express = require("express");
const router = express.Router();
const Announcement = require("../models/Announcement");

// Get announcements for public access (no auth required)
router.get("/", async (req, res) => {
  try {
    const { gymId } = req.query;
    
    if (!gymId) {
      return res.status(400).json({
        success: false,
        message: "Gym ID is required",
      });
    }

    const announcements = await Announcement.find({ 
      gymId, 
      isActive: true 
    })
      .sort({ createdAt: -1 })
      .populate("createdBy", "username");

    res.status(200).json({
      success: true,
      count: announcements.length,
      data: announcements,
    });
  } catch (error) {
    console.error("Error fetching public announcements:", error);
    res.status(500).json({
      success: false,
      message: "Could not fetch announcements",
      error: error.message,
    });
  }
});

module.exports = router; 