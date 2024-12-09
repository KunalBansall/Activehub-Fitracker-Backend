const bcrypt = require("bcryptjs");
const Member = require("../models/Member"); // Assuming you have a Member model
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const moment = require("moment");

const setPassword = async (req, res) => {
  const { id, token } = req.params;
  const { password } = req.body;

  try {
    // Find member by id and token
    const member = await Member.findOne({
      _id: id,
      resetToken: token,
      resetTokenExpiration: { $gt: Date.now() },
    });

    if (!member) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Update the member's password and reset token
    member.password = hashedPassword;
    member.resetToken = undefined;
    member.resetTokenExpiration = undefined;

    await member.save();

    // Return success response
    return res.status(200).json({ 
      member, 
      message: "Password set successfully!" 
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Something went wrong" });
  }
};


const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const member = await Member.findOne({ email });
    if (!member) {
      return res.status(404).json({ message: "Member not found" });
    }

    // Compare passwords
    const isMatch = await bcrypt.compare(password, member.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // Generate JWT token for member
    const token = jwt.sign({ id: member._id }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

    res.status(200).json({ message: "Login successful", token });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

module.exports = { setPassword, login };
