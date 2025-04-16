const Announcement = require("../models/Announcement");

// Create a new announcement
exports.createAnnouncement = async (req, res) => {
  try {
    const { title, message, image, mediaType, category } = req.body;
    
    const announcement = await Announcement.create({
      gymId: req.admin.gymId || req.admin._id, // Use admin's ID as gymId if gymId not available
      title,
      message,
      image,
      mediaType: mediaType || "image", // Default to image if not provided
      category,
      createdBy: req.admin._id,
    });

    res.status(201).json({
      success: true,
      data: announcement,
    });
  } catch (error) {
    console.error("Error creating announcement:", error);
    res.status(500).json({
      success: false,
      message: "Could not create announcement",
      error: error.message,
    });
  }
};

// Get all announcements for a gym
exports.getAnnouncements = async (req, res) => {
  try {
    const gymId = req.admin ? (req.admin.gymId || req.admin._id) : req.query.gymId;
    
    if (!gymId) {
      return res.status(400).json({
        success: false,
        message: "Gym ID is required",
      });
    }

    const announcements = await Announcement.find({ gymId })
      .sort({ createdAt: -1 }) // Sort by most recent first
      .populate("createdBy", "username email");

    res.status(200).json({
      success: true,
      count: announcements.length,
      data: announcements,
    });
  } catch (error) {
    console.error("Error fetching announcements:", error);
    res.status(500).json({
      success: false,
      message: "Could not fetch announcements",
      error: error.message,
    });
  }
};

// Get a single announcement by ID
exports.getAnnouncementById = async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id)
      .populate("createdBy", "username email");

    if (!announcement) {
      return res.status(404).json({
        success: false,
        message: "Announcement not found",
      });
    }

    res.status(200).json({
      success: true,
      data: announcement,
    });
  } catch (error) {
    console.error("Error fetching announcement:", error);
    res.status(500).json({
      success: false,
      message: "Could not fetch announcement",
      error: error.message,
    });
  }
};

// Update an announcement
exports.updateAnnouncement = async (req, res) => {
  try {
    const { title, message, image, mediaType, category, isActive } = req.body;
    
    let announcement = await Announcement.findById(req.params.id);
    
    if (!announcement) {
      return res.status(404).json({
        success: false,
        message: "Announcement not found",
      });
    }
    
    // Verify the announcement belongs to this gym
    if (announcement.gymId.toString() !== (req.admin.gymId || req.admin._id).toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this announcement",
      });
    }
    
    announcement = await Announcement.findByIdAndUpdate(
      req.params.id,
      {
        title,
        message,
        image,
        mediaType,
        category,
        isActive,
      },
      {
        new: true,
        runValidators: true,
      }
    ).populate("createdBy", "username email");
    
    res.status(200).json({
      success: true,
      data: announcement,
    });
  } catch (error) {
    console.error("Error updating announcement:", error);
    res.status(500).json({
      success: false,
      message: "Could not update announcement",
      error: error.message,
    });
  }
};

// Delete an announcement
exports.deleteAnnouncement = async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id);
    
    if (!announcement) {
      return res.status(404).json({
        success: false,
        message: "Announcement not found",
      });
    }
    
    // Verify the announcement belongs to this gym
    if (announcement.gymId.toString() !== (req.admin.gymId || req.admin._id).toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this announcement",
      });
    }
    
    await Announcement.deleteOne({ _id: req.params.id });
    
    res.status(200).json({
      success: true,
      data: {},
      message: "Announcement deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting announcement:", error);
    res.status(500).json({
      success: false,
      message: "Could not delete announcement",
      error: error.message,
    });
  }
};

// Get announcements for members
exports.getMemberAnnouncements = async (req, res) => {
  try {
    const gymId = req.query.gymId;
    
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
    console.error("Error fetching member announcements:", error);
    res.status(500).json({
      success: false,
      message: "Could not fetch announcements",
      error: error.message,
    });
  }
}; 