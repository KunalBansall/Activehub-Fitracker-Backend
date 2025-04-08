const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const orderController = require("../controllers/orderController");
const { authenticateMember } = require("../middleware/authMember");

// Validation middleware for creating orders
const orderValidation = [
  body("products").isArray({ min: 1 }).withMessage("At least one product is required"),
  body("products.*.productId").notEmpty().withMessage("Product ID is required"),
  body("products.*.name").notEmpty().withMessage("Product name is required"),
  body("products.*.price").isFloat({ min: 0 }).withMessage("Price must be a positive number"),
  body("products.*.quantity").isInt({ min: 1 }).withMessage("Quantity must be at least 1"),
  body("products.*.image").notEmpty().withMessage("Product image is required"),
  body("totalAmount").isFloat({ min: 0 }).withMessage("Total amount must be a positive number"),
  body("paymentMethod").isIn(["card", "cash", "bankTransfer"]).withMessage("Invalid payment method"),
  body("address.name").notEmpty().withMessage("Address name is required"),
  body("address.phoneNumber").notEmpty().withMessage("Address phone number is required"),
  body("address.street").notEmpty().withMessage("Street address is required"),
  body("address.city").notEmpty().withMessage("City is required"),
  body("address.state").notEmpty().withMessage("State is required"),
  body("address.zipCode").notEmpty().withMessage("Zip code is required"),
  body("address.country").notEmpty().withMessage("Country is required"),
];

// Apply member authentication to all routes
router.use(authenticateMember);

// Get member's own orders
router.get("/", orderController.getMyOrders);

// Get a specific order by ID (that belongs to the member)
router.get("/:id", orderController.getMemberOrderById);

// Create a new order as a member
router.post("/", orderValidation, orderController.createMemberOrder);

// Cancel an order (member can only cancel their own orders)
router.patch("/:id/cancel", orderController.cancelMemberOrder);

module.exports = router; 