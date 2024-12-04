const Member = require('../models/Member');
const Attendance = require('../models/Attendance');
const { validationResult } = require('express-validator');

// Get All Members
// Get All Members with Last Check-In
exports.getAllMembers = async (req, res) => {
  try {
    const membersWithLastCheckIn = await Member.aggregate([
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

// Search Members
exports.searchMembers = async (req, res) => {
  const { query } = req.query;
  try {
    const members = await Member.find({
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { phoneNumber: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } }
      ]
    });
    res.json(members);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get Member Details
exports.getMemberDetails = async (req, res) => {
  try {
    const member = await Member.findById(req.params.id);
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

// Create Member
exports.createMember = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const membershipStartDate = new Date(); // Current date
    const membershipEndDate = new Date(membershipStartDate); // Start with the current date

    // Ensure the durationMonths is a valid number
    const durationMonths = parseInt(req.body.durationMonths, 10);
    if (isNaN(durationMonths) || durationMonths <= 0) {
      return res.status(400).json({ message: 'Invalid durationMonths value' });
    }

    // Add the months to the membershipEndDate
    membershipEndDate.setMonth(membershipEndDate.getMonth() + durationMonths);

    // Log the calculated dates for debugging
    console.log('Membership Start Date:', membershipStartDate);
    console.log('Calculated Membership End Date:', membershipEndDate);

    const member = await Member.create({
      ...req.body,
      membershipStartDate,
      membershipEndDate
    });

    res.status(201).json(member);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// Update Member
exports.updateMember = async (req, res) => {
  try {
    const member = await Member.findById(req.params.id);
    if (!member) {
      return res.status(404).json({ message: 'Member not found' });
    }

    // Check if the durationMonths is updated
    if (req.body.durationMonths) {
      const newDurationMonths = parseInt(req.body.durationMonths, 10);

      // Validate if durationMonths is a positive number
      if (isNaN(newDurationMonths) || newDurationMonths <= 0) {
        return res.status(400).json({ message: 'Invalid durationMonths value' });
      }

      // Set new membershipEndDate based on the current date (or membershipStartDate if you prefer)
      const newEndDate = new Date();
      newEndDate.setMonth(newEndDate.getMonth() + newDurationMonths);
      
      // Update the membershipEndDate in the request body
      req.body.membershipEndDate = newEndDate;
    }

    // Update the member with new data
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