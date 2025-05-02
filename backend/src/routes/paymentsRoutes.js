const express = require("express");
const { createSubscription } = require("../controllers/paymentsController");
const { verifySubscription } = require("../controllers/paymentsController");
const { handleWebhook } = require("../controllers/paymentsController");
const { getPaymentHistory } = require("../controllers/paymentsController");
const { authenticateAdmin } = require("../middleware/auth");

const router = express.Router();

router.post("/create-subscription", authenticateAdmin, createSubscription);
router.post("/verify-subscription", authenticateAdmin, verifySubscription);
router.post("/webhook", express.raw({ type: "application/json" }), handleWebhook);
router.get("/history", authenticateAdmin, getPaymentHistory);

module.exports = router;
