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

// Monthly revenue archive endpoints
router.get('/archived-months', revenueController.getArchivedMonths);
router.get('/archived/:month/:year', revenueController.getArchivedMonthlyRevenue);
router.post('/archive-current', revenueController.archiveCurrentMonth);
router.get('/init-new-month', revenueController.initializeNewMonth);

module.exports = router; 