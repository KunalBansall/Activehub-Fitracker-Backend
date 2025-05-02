const express = require("express");
const router = express.Router();
const { 
  createAnnouncement, 
  getAnnouncements, 
  getAnnouncementById, 
  updateAnnouncement, 
  deleteAnnouncement 
} = require("../controllers/announcementController");
const { authenticateAdmin } = require("../middleware/auth");
const {restrictWriteAccess} = require("../middleware/subscriptionAccess");


// Admin routes - all protected
router.use(authenticateAdmin);

// CRUD operations for announcements
router.route("/")
  .post(restrictWriteAccess ,createAnnouncement)
  .get(getAnnouncements);

router.route("/:id")
  .get(getAnnouncementById)
  .put(restrictWriteAccess ,updateAnnouncement)
  .delete(restrictWriteAccess ,deleteAnnouncement);

module.exports = router; 