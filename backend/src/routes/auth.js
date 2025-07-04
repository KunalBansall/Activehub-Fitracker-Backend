const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const authController = require("../controllers/authController");
const { verifyOwner } = require("../middleware/adminLog");
const adminLogController = require("../controllers/adminLogController");

router.get("/logs", verifyOwner, adminLogController.getAdminLogs);

router.post(
  "/signup",
  [
    body("username").trim().notEmpty().withMessage("Username is required"),
    body("email")
      .isEmail().withMessage("Please enter a valid email")
      .normalizeEmail()
      .toLowerCase(),
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters long"),
    body("gymName").trim().notEmpty().withMessage("Gym name is required"),
    body("gymType").notEmpty().withMessage("Gym type is required"),
  ],
  authController.signup
);

router.post(
  "/signin",
  [
    body("email")
      .isEmail().withMessage("Please enter a valid email")
      .normalizeEmail()
      .toLowerCase(),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  authController.signin
);

router.post("/forgot-password", authController.forgotPassword);

// Reset Password Route
router.post("/reset-password/:id/:token", authController.resetPassword);

module.exports = router;
