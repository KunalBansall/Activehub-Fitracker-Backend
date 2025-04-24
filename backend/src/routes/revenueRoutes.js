const express = require('express');
const router = express.Router();
const revenueController = require('../controllers/revenueController');
const { authenticateAdmin } = require('../middleware/auth');

// Apply admin authentication middleware
router.use(authenticateAdmin);

// Revenue endpoints
router.get('/overview', revenueController.getRevenueOverview);
router.get('/trends', revenueController.getRevenueTrends);

// Monthly revenue reports endpoints
router.get('/monthly-reports', revenueController.getMonthlyReports);
router.get('/monthly-reports/:year/:month', revenueController.getMonthlyReportDetail);
router.get('/generate-report', revenueController.generateMonthlyReport);

module.exports = router; 