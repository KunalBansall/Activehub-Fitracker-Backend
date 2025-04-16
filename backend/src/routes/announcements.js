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

// Admin routes - all protected
router.use(authenticateAdmin);

// CRUD operations for announcements
router.route("/")
  .post(createAnnouncement)
  .get(getAnnouncements);

router.route("/:id")
  .get(getAnnouncementById)
  .put(updateAnnouncement)
  .delete(deleteAnnouncement);

module.exports = router; 