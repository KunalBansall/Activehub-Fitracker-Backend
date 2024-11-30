const Member = require('../models/Member');
const Attendance = require('../models/Attendance');
const { validationResult } = require('express-validator');

exports.getAllMembers = async (req, res) => {
  try {
    const members = await Member.find().select('-__v');
    const membersWithStatus = members.map(member => ({
      ...member.toObject(),
      membershipStatus: member.membershipEndDate <= new Date(Date.now() + 5 * 24 * 60 * 60 * 1000) ? 'warning' : 'normal'
    }));
    res.json(membersWithStatus);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

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

exports.createMember = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const membershipStartDate = new Date();
    const membershipEndDate = new Date();
    membershipEndDate.setMonth(membershipEndDate.getMonth() + req.body.durationMonths);

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

exports.updateMember = async (req, res) => {
  try {
    const member = await Member.findById(req.params.id);
    if (!member) {
      return res.status(404).json({ message: 'Member not found' });
    }

    if (req.body.durationMonths) {
      const newEndDate = new Date(member.membershipEndDate);
      newEndDate.setMonth(newEndDate.getMonth() + req.body.durationMonths);
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