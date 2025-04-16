const Member = require('../models/Member');
const Attendance = require('../models/Attendance');

// Record Entry
exports.recordEntry = async (req, res) => {
  const adminGymId = req.admin._id; // Admin's gym ID from middleware

  try {
    // Verify the member belongs to the admin's gym
    const member = await Member.findOne({ _id: req.params.memberId, gymId: adminGymId });
    if (!member) {
      return res.status(404).json({ message: 'Member not found or unauthorized access' });
    }

    // Check if member already has an active session
    const activeSession = await Attendance.findOne({
      memberId: member._id,
      exitTime: null
    });

    if (activeSession) {
      return res.status(400).json({ 
        message: 'Session already active',
        details: `Member already checked in at ${new Date(activeSession.entryTime).toLocaleString()}` 
      });
    }

    // Create a new attendance entry
    const attendance = await Attendance.create({
      memberId: member._id,
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

// Record Exit
exports.recordExit = async (req, res) => {
  const adminGymId = req.admin._id; // Admin's gym ID from middleware

  try {
    // Verify the member belongs to the admin's gym
    const member = await Member.findOne({ _id: req.params.memberId, gymId: adminGymId });
    if (!member) {
      return res.status(404).json({ message: 'Member not found or unauthorized access' });
    }

    // Find the latest attendance record with a null exitTime
    const attendance = await Attendance.findOne({
      memberId: member._id,
      exitTime: null,
    }).sort({ entryTime: -1 });

    if (!attendance) {
      return res.status(404).json({ 
        message: 'No active session', 
        details: 'Member must check in before checking out' 
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

// Get Today's Attendance (Data Isolation)
exports.getTodayAttendance = async (req, res) => {
  const adminGymId = req.admin._id; // Admin's gym ID from middleware

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Find attendance for members of the admin's gym within today's date range
    const attendance = await Attendance.find({
      entryTime: {
        $gte: today,
        $lt: tomorrow,
      },
    })
      .populate({
        path: 'memberId',
        match: { gymId: adminGymId }, // Match only members of the admin's gym
      })
      .exec();

    // Filter out null members (non-matching gym IDs)
    const filteredAttendance = attendance.filter((record) => record.memberId !== null);

    res.json(filteredAttendance);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get Member's Attendance History
exports.getMemberAttendanceHistory = async (req, res) => {
  const adminGymId = req.admin._id; // Admin's gym ID from middleware

  try {
    // Verify the member belongs to the admin's gym
    const member = await Member.findOne({ _id: req.params.memberId, gymId: adminGymId });
    if (!member) {
      return res.status(404).json({ message: 'Member not found or unauthorized access' });
    }

    // Fetch the attendance history for the member
    const attendanceHistory = await Attendance.find({ memberId: member._id }).sort({
      entryTime: -1,
    });

    res.json(attendanceHistory);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
