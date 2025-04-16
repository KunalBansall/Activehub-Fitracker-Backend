const bcrypt = require("bcryptjs");
const Member = require("../models/Member"); // Assuming you have a Member model
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const moment = require("moment");

// const setPassword = async (req, res) => {
//   const { id, token } = req.params;
//   const { password } = req.body;

//   try {
//     // Find member by id and token
//     const member = await Member.findOne({
//       _id: id,
//       resetToken: token,
//       resetTokenExpiration: { $gt: Date.now() },
//     });

//     if (!member) {
//       return res.status(400).json({ message: "Invalid or expired token" });
//     }

//     // Hash the new password
//     const hashedPassword = await bcrypt.hash(password, 12);

//     // Update the member's password and reset token
//     member.password = hashedPassword;
//     member.resetToken = undefined;
//     member.resetTokenExpiration = undefined;

//     await member.save();

//     // Return success response
//     return res.status(200).json({
//       member,
//       message: "Password set successfully!"
//     });
//   } catch (err) {
//     console.error(err);
//     return res.status(500).json({ message: "Something went wrong" });
//   }
// };

const setPassword = async (req, res) => {
  const { id, token } = req.params;
  const { password } = req.body;

  // console.log("Request Params:", { id, token });
  // console.log("Password in request body:", password);

  if (!password || password.trim() === "") {
    return res.status(400).json({ message: "Password is required" });
  }

  try {
    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.id !== id) {
      return res.status(400).json({ message: "Invalid token" });
    }

    // Find the member
    const member = await Member.findById(id);
    // console.log("Member found:", member);

    if (!member) {
      return res.status(404).json({ message: "Member not found" });
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(password, 12);
    // console.log("Hashed password:", hashedPassword);

    // Update the member's password
    member.password = hashedPassword;
    member.resetToken = undefined; // Clear reset token
    member.resetTokenExpiration = undefined; // Clear token expiration

    // Save the updated member
    await member
      .save()
      .then(() => console.log("Member updated successfully"))
      .catch((err) => console.error("Error saving member:", err));

    return res.status(200).json({
      message: "Password set successfully!",
      Status: "Success", // Ensure the key is 'Status' with an uppercase "S"
    });
  } catch (err) {
    console.error("Error in setPassword:", err);
    return res.status(400).json({ message: "Invalid or expired token" });
  }
};

const login = async (req, res) => {
  const { email, password } = req.body;

  // console.log("Login request data:", { email, password }); // Log incoming data
  try {
    // Find the member by email
    const member = await Member.findOne({ email });
    // console.log("Member data:", member); // Debugging retrieved member data

    if (!member) {
      return res.status(404).json({ message: "Member not found" });
    }

    if (!member.password) {
      return res
        .status(400)
        .json({ message: "Password not set for this account" });
    }

    // Compare the plain-text password with the hashed password in the database
    const isMatch = await bcrypt.compare(password, member.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // Generate a JWT token for the member
    const token = jwt.sign({ id: member._id }, process.env.JWT_SECRET, {
      expiresIn: "30d",
    });

    res.status(200).json({
      message: "Login successful",
      token,
      userId: member._id,
      member,
    });
  } catch (err) {
    console.error("Error during login:", err);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

module.exports = { setPassword, login };
