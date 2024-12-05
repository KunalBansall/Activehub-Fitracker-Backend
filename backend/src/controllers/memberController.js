const Member = require('../models/Member');
const Attendance = require('../models/Attendance');
const { validationResult } = require('express-validator');

// Get All Members (with Last Check-In and Data Isolation)
exports.getAllMembers = async (req, res) => {
  try {
    const adminGymId = req.admin._id; // Admin's gym ID from middleware

    const membersWithLastCheckIn = await Member.aggregate([
      { $match: { gymId: adminGymId } }, // Match members for the logged-in admin
      {
        $lookup: {
          from: 'attendances', // Reference Attendance collection
          localField: '_id',
          foreignField: 'memberId',
          as: 'attendanceRecords',
        },
      },
      {
        $addFields: {
          lastCheckIn: { $max: '$attendanceRecords.entryTime' }, // Get the latest entry time
          membershipStatus: {
            $cond: [
              { $lte: ['$membershipEndDate', new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)] },
              'warning',
              'normal',
            ],
          },
        },
      },
      {
        $project: {
          attendanceRecords: 0, // Exclude attendance records array for cleaner output
        },
      },
    ]);

    res.json(membersWithLastCheckIn);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Search Members (with Data Isolation)
exports.searchMembers = async (req, res) => {
  const { query } = req.query;
  const adminGymId = req.admin._id; // Admin's gym ID from middleware

  try {
    const members = await Member.find({
      gymId: adminGymId,
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { phoneNumber: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } },
      ],
    });

    res.json(members);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get Member Details (with Data Isolation)
exports.getMemberDetails = async (req, res) => {
  const adminGymId = req.admin._id;

  try {
    const member = await Member.findOne({ _id: req.params.id, gymId: adminGymId });
    if (!member) {
      return res.status(404).json({ message: 'Member not found' });
    }

    const attendance = await Attendance.find({ memberId: member._id })
      .sort({ entryTime: -1 })
      .limit(10);

    res.json({ ...member.toObject(), attendance });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Create Member (Link to Admin's Gym)
exports.createMember = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const adminGymId = req.admin._id; // Admin's gym ID from middleware

  try {
    const membershipStartDate = new Date();
    const membershipEndDate = new Date(membershipStartDate);

    const durationMonths = parseInt(req.body.durationMonths, 10);
    if (isNaN(durationMonths) || durationMonths <= 0) {
      return res.status(400).json({ message: 'Invalid durationMonths value' });
    }

    membershipEndDate.setMonth(membershipEndDate.getMonth() + durationMonths);

    const member = await Member.create({
      ...req.body,
      gymId: adminGymId, // Associate the member with the admin's gym
      membershipStartDate,
      membershipEndDate,
    });

    res.status(201).json(member);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// Update Member (with Data Isolation)
exports.updateMember = async (req, res) => {
  const adminGymId = req.admin._id;

  try {
    const member = await Member.findOne({ _id: req.params.id, gymId: adminGymId });
    if (!member) {
      return res.status(404).json({ message: 'Member not found' });
    }

    if (req.body.durationMonths) {
      const newDurationMonths = parseInt(req.body.durationMonths, 10);
      if (isNaN(newDurationMonths) || newDurationMonths <= 0) {
        return res.status(400).json({ message: 'Invalid durationMonths value' });
      }

      const newEndDate = new Date();
      newEndDate.setMonth(newEndDate.getMonth() + newDurationMonths);
      req.body.membershipEndDate = newEndDate;
    }

    const updatedMember = await Member.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );

    res.json(updatedMember);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// Delete Member (with Data Isolation)
exports.deleteMember = async (req, res) => {
  const adminGymId = req.admin._id;

  try {
    const member = await Member.findOneAndDelete({ _id: req.params.id, gymId: adminGymId });
    if (!member) {
      return res.status(404).json({ message: 'Member not found or already deleted' });
    }

    res.json({ message: 'Member deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
