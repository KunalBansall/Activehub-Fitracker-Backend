const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const memberController = require("../controllers/memberController");
const { authenticateAdmin } = require("../middleware/auth");

// Validation middleware
const memberValidation = [
  body("name").notEmpty(),
  body("email").isEmail(),
  body("phoneNumber").matches(/^\+?[\d\s-]+$/),
  body("weight").isFloat({ min: 20, max: 300 }),
  body("height").isFloat({ min: 100, max: 250 }),
  body("membershipType").isIn(["basic", "premium", "platinum"]),
  body("durationMonths").isInt({ min: 1, max: 60 }),
  body("fees").isFloat({ min: 0 }),
  body("feeStatus").isIn(["paid", "due"]),
];
router.use(authenticateAdmin);

router.get("/", memberController.getAllMembers);
router.get("/search", memberController.searchMembers);
router.get("/:id", memberController.getMemberDetails);
router.post("/", memberValidation, memberController.createMember);
router.patch("/:id", memberController.updateMember);
router.post("/renewal-reminder", memberController.sendRenewalReminder);

module.exports = router;
