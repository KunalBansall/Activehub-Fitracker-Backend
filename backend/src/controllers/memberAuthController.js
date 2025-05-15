const bcrypt = require("bcryptjs");
const Member = require("../models/Member"); // Assuming you have a Member model
const Admin = require("../models/Admin"); // Import Admin model for gym information
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const moment = require("moment");
const nodemailer = require("nodemailer");

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

    // Update the member's lastDashboardLogin timestamp
    member.lastDashboardLogin = new Date();
    await member.save();

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

// Forgot Password Controller for Members
const memberForgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    const member = await Member.findOne({ email });
    if (!member) {
      return res.status(404).json({ message: "Member does not exist" });
    }

    // Find the gym information for this member
    const admin = await Admin.findById(member.gymId);
    const gymName = admin ? admin.gymName : "Your Gym";

    const token = jwt.sign({ id: member._id }, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });

    // Import the email service
    const emailService = require('../services/emailService');
    
    const username = member.name || "Member"; // Use member's name

    // Create the HTML email content
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 20px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #2c3e50; margin-bottom: 10px;">Password Reset Request</h1>
          <p style="color: #7f8c8d; font-size: 16px;">Hello ${username},</p>
        </div>

        <div style="background-color: #f8f9fa; padding: 25px; border-radius: 8px; margin-bottom: 30px;">
          <p style="color: #34495e; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
            We received a request to reset your password for your ${gymName} member account. Click the button below to reset it:
          </p>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}/reset-password/${member._id}/${token}?member=true" 
               style="background-color: #3498db; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; font-size: 16px;">
              Reset Password
            </a>
          </div>

          <p style="color: #7f8c8d; font-size: 14px; margin-bottom: 20px;">
            If the button doesn't work, copy and paste this link into your browser:
          </p>
          <p style="color: #3498db; word-break: break-all; font-size: 14px; background-color: #f1f1f1; padding: 10px; border-radius: 4px;">
            ${process.env.FRONTEND_URL}/reset-password/${member._id}/${token}?member=true
          </p>
        </div>

        <div style="border-top: 1px solid #eee; padding-top: 20px; margin-top: 20px;">
          <p style="color: #7f8c8d; font-size: 14px; margin-bottom: 10px;">
            If you didn't request this password reset, you can safely ignore this email.
          </p>
          <p style="color: #7f8c8d; font-size: 14px;">
            For security reasons, this link will expire in 24 hours.
          </p>
        </div>

        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center;">
          <p style="color: #7f8c8d; font-size: 14px;">
            Best regards,<br>
            <strong style="color: #2c3e50;">${gymName} Support Team</strong>
          </p>
        </div>
      </div>
    `;

    // Use the centralized email service to send the email
    const emailSent = await emailService.sendEmail(
      email,
      `Password Reset Request - ${gymName}`,
      htmlContent
    );

    if (!emailSent) {
      // If email sending fails, try a fallback method
      console.error('Failed to send password reset email using email service');
      
      // Create a direct transporter as fallback
      const transporter = nodemailer.createTransport({
        service: process.env.EMAIL_SERVICE || "gmail",
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD || process.env.EMAIL_PASS, // Try both environment variable names
        },
        tls: {
          rejectUnauthorized: false // Less secure but helps with some email providers
        }
      });

      // Send mail with the direct transporter
      transporter.sendMail({
        from: `"${gymName} Support" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: `Password Reset Request - ${gymName}`,
        html: htmlContent
      }, (error) => {
        if (error) {
          console.error('Fallback email sending failed:', error);
          return res.status(500).json({ message: "Failed to send email" });
        }
        res.json({ message: "Reset link sent successfully" });
      });
    } else {
      res.json({ message: "Reset link sent successfully" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

module.exports = { setPassword, login, memberForgotPassword };
