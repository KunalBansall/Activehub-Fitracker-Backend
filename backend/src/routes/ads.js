// routes/ads.js
const express = require('express');
const router = express.Router();
const adController = require('../controllers/adController');
const { verifyOwner } = require('../middleware/verifyOwner');
const { verifyTokenAndRole } = require('../middleware/verifyTokenAndRole');

// Create new ad (owner only)
router.post('/', verifyOwner, adController.createAd);

// Get all ads (owner only)
router.get('/all', verifyOwner, adController.getAllAds);

// Get ad analytics (owner only)
router.get('/analytics', verifyOwner, adController.getAdAnalytics);

// Get active ads for current user (admin/member)
router.get('/', verifyTokenAndRole, adController.getAds);

// Update ad (owner only)
router.patch('/:id', verifyOwner, adController.updateAd);

// Delete ad (owner only)
router.delete('/:id', verifyOwner, adController.deleteAd);

// Record ad view
router.post('/view/:id', verifyTokenAndRole, adController.recordView);

// Record ad click
router.post('/click/:id', verifyTokenAndRole, adController.recordClick);

module.exports = router; 