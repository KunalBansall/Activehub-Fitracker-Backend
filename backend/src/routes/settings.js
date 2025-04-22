const express = require("express");
const router = express.Router();
const settingsController = require("../controllers/settingsController");
const { authenticateAdmin } = require("../middleware/auth");

// Routes for gym settings
router.get("/", authenticateAdmin, settingsController.getGymSettings);
router.put("/", authenticateAdmin, settingsController.updateGymSettings);

module.exports = router; 