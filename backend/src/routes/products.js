const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const productController = require("../controllers/productController");
const { authenticateAdmin } = require("../middleware/auth");
const {restrictWriteAccess} = require("../middleware/subscriptionAccess");


// Validation middleware for product creation and updates
const productValidation = [
  body("name").notEmpty().withMessage("Product name is required"),
  body("description").notEmpty().withMessage("Product description is required"),
  body("price")
    .isFloat({ min: 0 })
    .withMessage("Price must be a positive number"),
  body("category")
    .isIn(["supplements", "equipment", "apparel", "accessories", "other"])
    .withMessage("Invalid product category"),
  body("inventory")
    .isInt({ min: 0 })
    .withMessage("Inventory must be a non-negative integer"),
];

// Apply admin authentication to all routes
router.use(authenticateAdmin);

// Admin routes
router.get("/", productController.getAllProducts);
router.get("/:id", productController.getProductById);
router.post("/", restrictWriteAccess, productValidation, productController.createProduct);
router.put("/:id", restrictWriteAccess,productValidation, productController.updateProduct);
router.delete("/:id",restrictWriteAccess, productController.deleteProduct);
router.patch("/:id/feature", restrictWriteAccess,productController.toggleFeature);
router.post("/:id/reviews", productController.adminAddReview);

module.exports = router; 