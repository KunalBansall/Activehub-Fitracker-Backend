const express = require('express');
const router = express.Router();
const { verifyOwner } = require('../middleware/verifyOwner');
const ownerController = require('../controllers/ownerController');

// Apply owner middleware to all routes
router.use(verifyOwner);

// Analytics endpoint
router.get('/analytics', ownerController.getAnalytics);

// Webhook logs endpoints
router.get('/webhooks', ownerController.getWebhookLogs);
router.get('/webhooks/detailed', ownerController.getDetailedWebhookLogs);
router.get('/webhooks/analytics', ownerController.getWebhookAnalytics);
router.post('/webhooks/replay/:webhookId', ownerController.replayWebhook);

// Get all gyms endpoint
router.get('/gyms', ownerController.getAllGyms);

// Gym-specific endpoints
router.get('/payments', ownerController.getGymPayments);
router.get('/gym-webhooks', ownerController.getGymWebhooks);
router.get('/subscriptions', ownerController.getGymSubscriptions);

module.exports = router; 