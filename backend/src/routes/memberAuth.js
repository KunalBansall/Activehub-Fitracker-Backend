const express = require("express");
const router = express.Router();
const { setPassword, login } = require("../controllers/memberAuthController");
const Member = require('../models/Member')
const { authenticateMember } = require('../middleware/authMember');  // Import the authentication middleware
const Attendance = require('../models/Attendance')


// POST request to set member's password
router.post("/set-password/:id/:token", setPassword);

// POST request for member login
router.post("/login", login);

module.exports = router;

router.get("/member/:id", async (req, res) => {
  try {
    // Fetch the member
    const member = await Member.findById(req.params.id);
    if (!member) {
      return res.status(404).json({ message: "Member not found" });
    }

    // Fetch the attendance for the member
    const attendance = await Attendance.find({ memberId: member._id })
      .sort({ entryTime: -1 }) // Sort by most recent first
      .limit(10); // Fetch the latest 10 attendance records

    // Respond with member and attendance data
    res.status(200).json({ ...member.toObject(), attendance });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
  }
});
router.put('/member/:id', authenticateMember, async (req, res) => {
    const memberId = req.params.id;
  
    try {
      // Find the member by ID
      const member = await Member.findById(memberId);
      if (!member) {
        return res.status(404).json({ message: 'Member not found' });
      }
  
      // Update the member fields dynamically
      Object.keys(req.body).forEach((key) => {
        member[key] = req.body[key];
      });
  
      // Save the updated member document
      await member.save();
  
      res.status(200).json({
        message: 'Member updated successfully',
        data: member,
      });
    } catch (error) {
      res.status(500).json({
        message: 'Error updating member',
        error: error.message,
      });
    }
  });