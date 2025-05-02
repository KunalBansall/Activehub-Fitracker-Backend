const express = require("express");
const router = express.Router();
const attendanceController = require("../controllers/attendanceController");
const { authenticateAdmin } = require("../middleware/auth");
const {restrictWriteAccess} = require("../middleware/subscriptionAccess");


router.use(authenticateAdmin);

router.post("/entry/:memberId",restrictWriteAccess, attendanceController.recordEntry);
router.post("/exit/:memberId",restrictWriteAccess, attendanceController.recordExit);
router.get("/today", attendanceController.getTodayAttendance);
router.get(
  "/history/:memberId",
  attendanceController.getMemberAttendanceHistory
);

module.exports = router;
