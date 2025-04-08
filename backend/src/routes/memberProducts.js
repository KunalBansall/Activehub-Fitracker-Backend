const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const productController = require("../controllers/productController");
const { authenticateMember } = require("../middleware/authMember");

// Validation middleware for reviews
const reviewValidation = [
  body("rating")
    .isInt({ min: 1, max: 5 })
    .withMessage("Rating must be between 1 and 5"),
  body("comment")
    .notEmpty()
    .withMessage("Review comment is required")
    .isLength({ min: 3, max: 500 })
    .withMessage("Comment must be between 3 and 500 characters"),
];

// Apply member authentication to all routes except the ones that need to be public
router.use(authenticateMember);

// Get all products available to the member (including featured filter)
router.get("/", productController.getMemberProducts);

// Get product details
router.get("/:id", productController.getMemberProductDetails);

// Add a review to a product
router.post("/:id/reviews", reviewValidation, productController.addProductReview);

module.exports = router; 