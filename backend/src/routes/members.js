// routes/adminRoutes.js
const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const memberController = require("../controllers/memberController");
const { authenticateAdmin } = require("../middleware/auth"); // Import the middleware

// Validation middleware
const memberValidation = [
  body("name").notEmpty().withMessage("Name is required"),
  body("email").isEmail().withMessage("Invalid email"),
  body("phoneNumber")
    .matches(/^\+?[\d\s-]+$/)
    .withMessage("Invalid phone number"),
  body("slot")
    .isIn(["Morning", "Evening", "Free Pass"])
    .withMessage("Invalid slot"),
  body("durationMonths")
    .isInt({ min: 1, max: 60 })
    .withMessage("Invalid duration"),
  body("fees").isFloat({ min: 0 }).withMessage("Invalid fees"),
  body("feeStatus").isIn(["paid", "due"]).withMessage("Invalid fee status"),
];

// Apply admin authentication middleware to all routes
router.use(authenticateAdmin);

// Define routes
router.get("/", memberController.getAllMembers);
router.get("/search", memberController.searchMembers);
router.get("/:id", memberController.getMemberDetails);
router.post("/", memberValidation, memberController.createMember);
router.patch("/:id", memberController.updateMember);
router.post("/renewal-reminder", memberController.sendRenewalReminder);

module.exports = router;
