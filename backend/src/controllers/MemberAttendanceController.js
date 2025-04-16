const Member = require('../models/Member');
const Attendance = require('../models/Attendance');

// Record Entry for a member (self check-in)
exports.recordEntry = async (req, res) => {
  try {
    const memberId = req.member._id; // Member ID from middleware

    // Check if member already has an active session
    const activeSession = await Attendance.findOne({
      memberId: memberId,
      exitTime: null
    });

    if (activeSession) {
      return res.status(400).json({ 
        message: 'Session already active',
        details: `You already checked in at ${new Date(activeSession.entryTime).toLocaleString()}` 
      });
    }

    // Create a new attendance entry
    const attendance = await Attendance.create({
      memberId: memberId,
      entryTime: new Date(),
    });

    res.json({
      message: 'Entry recorded successfully',
      attendance
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Record Exit for a member (self check-out)
exports.recordExit = async (req, res) => {
  try {
    const memberId = req.member._id; // Member ID from middleware

    // Find the latest attendance record with a null exitTime
    const attendance = await Attendance.findOne({
      memberId: memberId,
      exitTime: null,
    }).sort({ entryTime: -1 });

    if (!attendance) {
      return res.status(404).json({ 
        message: 'No active session', 
        details: 'You must check in before checking out' 
      });
    }

    // Update the exitTime
    attendance.exitTime = new Date();
    await attendance.save();

    // Calculate duration
    const entryTime = new Date(attendance.entryTime);
    const exitTime = new Date(attendance.exitTime);
    const durationMs = exitTime - entryTime;
    const durationHours = Math.floor(durationMs / (1000 * 60 * 60));
    const durationMinutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));

    res.json({
      message: 'Exit recorded successfully',
      attendance,
      sessionDuration: `${durationHours}h ${durationMinutes}m`
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get Member's own Attendance History
exports.getMemberAttendanceHistory = async (req, res) => {
  try {
    const memberId = req.member._id; // Member ID from middleware

    // Fetch the attendance history for the member
    const attendanceHistory = await Attendance.find({ memberId: memberId }).sort({
      entryTime: -1,
    });

    res.json(attendanceHistory);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};