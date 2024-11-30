const Member = require('../models/Member');
const Attendance = require('../models/Attendance');

exports.recordEntry = async (req, res) => {
  try {
    const member = await Member.findById(req.params.memberId);
    if (!member) {
      return res.status(404).json({ message: 'Member not found' });
    }

    const attendance = await Attendance.create({
      memberId: member._id,
      entryTime: new Date()
    });

    res.json(attendance);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.recordExit = async (req, res) => {
  try {
    const attendance = await Attendance.findOne({
      memberId: req.params.memberId,
      exitTime: null
    }).sort({ entryTime: -1 });

    if (!attendance) {
      return res.status(404).json({ message: 'No active entry found' });
    }

    attendance.exitTime = new Date();
    await attendance.save();
    res.json(attendance);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getTodayAttendance = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const attendance = await Attendance.find({
      entryTime: {
        $gte: today,
        $lt: tomorrow
      }
    }).populate('memberId');
    
    res.json(attendance);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};