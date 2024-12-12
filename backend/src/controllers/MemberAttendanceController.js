const Member = require('../models/Member');
const Attendance = require('../models/Attendance');

// Record Entry
exports.recordEntry = async (req, res) => {
  const memberId = req.member._id; // Member's ID from middleware

  try {
    // Check if there's an active entry
    const activeEntry = await Attendance.findOne({
      memberId: memberId,
      exitTime: null,
    });

    if (activeEntry) {
      return res.status(400).json({ message: 'You already have an active entry' });
    }

    // Create an attendance entry
    const attendance = await Attendance.create({
      memberId: memberId,
      entryTime: new Date(),
    });

    res.json(attendance);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Record Exit
exports.recordExit = async (req, res) => {
  const memberId = req.member._id; // Member's ID from middleware

  try {
    // Find the latest attendance record with a null exitTime
    const attendance = await Attendance.findOne({
      memberId: memberId,
      exitTime: null,
    }).sort({ entryTime: -1 });

    if (!attendance) {
      return res.status(404).json({ message: 'No active entry found' });
    }

    // Update the exitTime
    attendance.exitTime = new Date();
    await attendance.save();

    res.json(attendance);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get Member's Attendance History
exports.getMemberAttendanceHistory = async (req, res) => {
  const memberId = req.member._id; // Member's ID from middleware

  try {
    // Fetch the attendance history for the member
    const attendanceHistory = await Attendance.find({ memberId: memberId }).sort({
      entryTime: -1,
    });

    res.json(attendanceHistory);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};