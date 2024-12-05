const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { authenticateAdmin } = require('../middleware/auth');


router.use(authenticateAdmin);

router.get('/stats', dashboardController.getStats);

module.exports = router;