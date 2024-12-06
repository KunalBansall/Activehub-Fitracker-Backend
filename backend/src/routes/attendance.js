const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');
const { authenticateAdmin } = require('../middleware/auth');

router.use(authenticateAdmin);


router.post('/entry/:memberId', attendanceController.recordEntry);
router.post('/exit/:memberId', attendanceController.recordExit);
router.get('/today', attendanceController.getTodayAttendance);
router.get('/history/:memberId', attendanceController.getMemberAttendanceHistory);


module.exports = router;