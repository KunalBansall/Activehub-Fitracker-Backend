const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');

router.post('/entry/:memberId', attendanceController.recordEntry);
router.post('/exit/:memberId', attendanceController.recordExit);
router.get('/today', attendanceController.getTodayAttendance);

module.exports = router;