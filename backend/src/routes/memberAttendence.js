const express = require('express');
const router = express.Router();
const memberAttendanceController = require('../controllers/MemberAttendanceController');
const { authenticateMember } = require('../middleware/authMember');

router.use(authenticateMember);

router.post('/entry', memberAttendanceController.recordEntry);
router.post('/exit', memberAttendanceController.recordExit);
router.get('/history', memberAttendanceController.getMemberAttendanceHistory);

module.exports = router;