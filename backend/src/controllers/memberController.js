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
  const { validationResult } = require("express-validator");
  const nodemailer = require("nodemailer");

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const adminGymId = req.admin._id; // Admin's gym ID from middleware

  try {
    // Check for duplicates in the same gym
    const { email, phoneNumber } = req.body;
    const existingMember = await Member.findOne({
      gymId: adminGymId,
      $or: [{ email }, { phoneNumber }],
    });

    if (existingMember) {
      return res.status(409).json({
        message: "Duplicate entry detected",
        duplicateFields: {
          ...(existingMember.email === email && { email }),
          ...(existingMember.phoneNumber === phoneNumber && { phoneNumber }),
        },
      });
    }

    // Calculate membership dates
    const membershipStartDate = new Date();
    const membershipEndDate = new Date(membershipStartDate);

    const durationMonths = parseInt(req.body.durationMonths, 10);
    if (isNaN(durationMonths) || durationMonths <= 0) {
      return res.status(400).json({ message: "Invalid durationMonths value" });
    }

    membershipEndDate.setMonth(membershipEndDate.getMonth() + durationMonths);

    // Create a new member
    const member = await Member.create({
      ...req.body,
      gymId: adminGymId, // Associate the member with the admin's gym
      membershipStartDate,
      membershipEndDate,
    });

    // Send Welcome Email
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: member.email,
      subject: `Welcome to ${req.admin.gymName || "our Gym"}`,
      text: `Hi ${member.name},\n\n` +
        `We are delighted to welcome you to ${req.admin.gymName || "our gym"}! 🎉\n\n` +
        `Your membership has been successfully activated, and we are excited to support you on your fitness journey.\n\n` +
        `Your membership is valid from ${membershipStartDate.toDateString()} to ${membershipEndDate.toDateString()}. We have a variety of facilities and programs designed to help you achieve your goals. 💪\n\n` +
        `If you ever need assistance or have any questions, don’t hesitate to reach out to us. We're here to help! 😊\n\n` +
        `Best regards,\n` +
        `The ${req.admin.gymName || "Gym"} Team`
    };
    

    let emailSent = false;
    try {
      await transporter.sendMail(mailOptions);
      emailSent = true;
      console.log("Welcome email sent successfully to:", member.email);
    } catch (error) {
      console.error("Error sending welcome email:", error);
    }

    // Include emailSent flag in the response
    res.status(201).json({ member, emailSent });
  } catch (err) {
    console.error(err);
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
