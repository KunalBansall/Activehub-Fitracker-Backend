const Member = require("../models/Member");
const Attendance = require("../models/Attendance");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const moment = require("moment");
const jwt = require("jsonwebtoken");
const { sendEmail } = require("../services/emailService");

// Get All Members (with Last Check-In and Data Isolation)
exports.getAllMembers = async (req, res) => {
  try {
    const adminGymId = req.admin._id; // Admin's gym ID from middleware

    const membersWithLastCheckIn = await Member.aggregate([
      { $match: { gymId: adminGymId } }, // Match members for the logged-in admin
      {
        $lookup: {
          from: "attendances", // Reference Attendance collection
          localField: "_id",
          foreignField: "memberId",
          as: "attendanceRecords",
        },
      },
      {
        $addFields: {
          lastCheckIn: { $max: "$attendanceRecords.entryTime" }, // Get the latest entry time
          membershipStatus: {
            $cond: [
              {
                $lte: [
                  "$membershipEndDate",
                  new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
                ],
              },
              "warning",
              "normal",
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
        { name: { $regex: query, $options: "i" } },
        { phoneNumber: { $regex: query, $options: "i" } },
        { email: { $regex: query, $options: "i" } },
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
    const member = await Member.findOne({
      _id: req.params.id,
      gymId: adminGymId,
    });
    if (!member) {
      return res.status(404).json({ message: "Member not found" });
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

// Create Member (Include Password Reset Link)
exports.createMember = async (req, res) => {
  const { validationResult } = require("express-validator");
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const adminGymId = req.admin._id;

  try {
    // Check for duplicates in the same gym
    const { email, phoneNumber, membershipEndDate } = req.body;

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

    // Set membershipStartDate to the current date
    const membershipStartDate = new Date();
    
    // Parse the end date from the request
    const endDate = new Date(membershipEndDate);
    
    // Ensure the provided membershipEndDate is valid
    if (isNaN(endDate.getTime())) {
      return res.status(400).json({ message: "Invalid membership end date." });
    }
    
    // Calculate durationMonths based on the difference between start and end dates
    const diffTime = Math.abs(endDate - membershipStartDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const durationMonths = Math.ceil(diffDays / 30); // Approximate months

    // Create a new member with the provided membershipEndDate and calculated durationMonths
    const member = await Member.create({
      ...req.body,
      gymId: adminGymId,
      membershipStartDate,
      membershipEndDate: endDate,
      durationMonths,
    });
    
    const resetToken = jwt.sign(
      { id: member._id }, // payload
      process.env.JWT_SECRET, // secret
      { expiresIn: "24h" } // token validity
    );

    const resetPasswordLink = `${process.env.FRONTEND_URL}/set-password/${member._id}/${resetToken}`;

    // Send Welcome Email with Reset Password Link
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: member.email,
      subject: `Welcome to ${req.admin.gymName || "our Gym"} - Set Your Password`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 20px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header with Gym Logo/Name -->
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #2c3e50; margin-bottom: 10px;">Welcome to ${req.admin.gymName || "Our Gym"}!</h1>
            <p style="color: #7f8c8d; font-size: 16px;">Dear ${member.name},</p>
          </div>

          <!-- Main Content -->
          <div style="background-color: #f8f9fa; padding: 25px; border-radius: 8px; margin-bottom: 30px;">
            <p style="color: #34495e; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
              We're excited to have you join our fitness community! Your membership is valid from 
              <strong>${membershipStartDate.toDateString()}</strong> to 
              <strong>${endDate.toDateString()}</strong>.
            </p>

            <p style="color: #34495e; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
              To get started, please set your password by clicking the button below. This will help you:
            </p>

            <ul style="color: #34495e; font-size: 16px; line-height: 1.6; margin-bottom: 20px; padding-left: 20px;">
              <li>Access your personalized dashboard</li>
              <li>Track your workouts and progress</li>
              <li>View your membership details</li>
              <li>Connect with trainers and other members</li>
            </ul>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetPasswordLink}" 
                 style="background-color: #3498db; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; font-size: 16px;">
                Set Your Password
              </a>
            </div>

            <p style="color: #7f8c8d; font-size: 14px; margin-bottom: 20px;">
              If the button doesn't work, copy and paste this link into your browser:
            </p>
            <p style="color: #3498db; word-break: break-all; font-size: 14px; background-color: #f1f1f1; padding: 10px; border-radius: 4px;">
              ${resetPasswordLink}
            </p>
          </div>

          <!-- Features Section -->
          <div style="margin-bottom: 30px;">
            <h3 style="color: #2c3e50; font-size: 18px; margin-bottom: 15px;">What You Can Do:</h3>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
              <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px;">
                <p style="color: #34495e; font-size: 14px; margin: 0;">Track Workouts</p>
              </div>
              <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px;">
                <p style="color: #34495e; font-size: 14px; margin: 0;">View Progress</p>
              </div>
              <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px;">
                <p style="color: #34495e; font-size: 14px; margin: 0;">Book Classes</p>
              </div>
              <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px;">
                <p style="color: #34495e; font-size: 14px; margin: 0;">Connect with Trainers</p>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div style="border-top: 1px solid #eee; padding-top: 20px; text-align: center;">
            <p style="color: #7f8c8d; font-size: 14px; margin-bottom: 10px;">
              If you have any questions, feel free to contact us at ${req.admin.email || "support@activehub.com"}
            </p>
            <p style="color: #7f8c8d; font-size: 14px;">
              Best regards,<br>
              <strong style="color: #2c3e50;">${req.admin.gymName || "ActiveHub"} Team</strong>
            </p>
          </div>
        </div>
      `,
    };

    let emailSent = false;
    try {
      await transporter.sendMail(mailOptions);
      emailSent = true;
      // console.log("Welcome email sent successfully to:", member.email);
    } catch (error) {
      console.error("Error sending welcome email:", error);
    }

    // Respond with the member and email status
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
    const member = await Member.findOne({
      _id: req.params.id,
      gymId: adminGymId,
    });

    if (!member) {
      return res.status(404).json({ message: "Member not found" });
    }

    const updates = { ...req.body };

    // Update membership dates if membershipEndDate is provided
    if (req.body.membershipEndDate) {
      const endDate = new Date(req.body.membershipEndDate);
      
      // Ensure the provided membershipEndDate is valid
      if (isNaN(endDate.getTime())) {
        return res.status(400).json({ message: "Invalid membership end date" });
      }
      
      // Use current membershipStartDate or create a new one if extending membership
      const startDate = member.membershipStartDate || new Date();
      
      // Calculate durationMonths based on the difference between start and end dates
      const diffTime = Math.abs(endDate - startDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const durationMonths = Math.ceil(diffDays / 30); // Approximate months
      
      updates.membershipEndDate = endDate;
      updates.durationMonths = durationMonths;
    } else if (req.body.durationMonths) {
      // Fallback for legacy code that might still use durationMonths
      const durationMonths = parseInt(req.body.durationMonths, 10);
      if (isNaN(durationMonths) || durationMonths <= 0) {
        return res.status(400).json({ message: "Invalid durationMonths value" });
      }

      const newStartDate = new Date();
      const newEndDate = new Date();
      newEndDate.setMonth(newStartDate.getMonth() + durationMonths);

      updates.membershipStartDate = newStartDate;
      updates.membershipEndDate = newEndDate;
    }

    const updatedMember = await Member.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
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
    const member = await Member.findOneAndDelete({
      _id: req.params.id,
      gymId: adminGymId,
    });
    if (!member) {
      return res
        .status(404)
        .json({ message: "Member not found or already deleted" });
    }

    res.json({ message: "Member deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Controller function to send membership renewal reminder
exports.sendRenewalReminder = async (req, res) => {
  const { memberId } = req.body;

  try {
    const member = await Member.findById(memberId);

    if (!member) {
      return res.status(404).json({ message: "Member not found" });
    }

    const membershipEndDate = new Date(member.membershipEndDate);
    const today = new Date();
    const daysRemaining = Math.floor(
      (membershipEndDate - today) / (1000 * 60 * 60 * 24)
    );

    // Send reminder only if membership is near expiration
    if (daysRemaining <= 10) {
      // Create email content
      const emailContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 20px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #2c3e50; margin-bottom: 10px;">Membership Renewal Reminder</h1>
            <p style="color: #7f8c8d; font-size: 16px;">Dear ${member.name},</p>
          </div>

          <!-- Main Content -->
          <div style="background-color: #f8f9fa; padding: 25px; border-radius: 8px; margin-bottom: 30px;">
            <p style="color: #34495e; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
              We hope you're enjoying your fitness journey with us! Your current membership will expire on 
              <strong style="color: #e74c3c;">${membershipEndDate.toDateString()}</strong>.
            </p>

            <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
              <p style="color: #856404; font-size: 16px; margin: 0;">
                <strong>Only ${daysRemaining} days left</strong> to renew your membership and continue enjoying all our facilities!
              </p>
            </div>

            <div style="text-align: center; margin: 30px 0;">
              <a href="https://activehub-fitracker.onrender.com/" 
                 style="background-color: #3498db; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; font-size: 16px;">
                Renew Your Membership
              </a>
            </div>

            <p style="color: #34495e; font-size: 16px; line-height: 1.6;">
              Renewing your membership ensures uninterrupted access to:
            </p>
            <ul style="color: #34495e; font-size: 16px; line-height: 1.6; padding-left: 20px;">
              <li>All gym facilities and equipment</li>
              <li>Group classes and personal training sessions</li>
              <li>Member-exclusive discounts and offers</li>
              <li>Progress tracking and workout plans</li>
            </ul>
          </div>

          <!-- Special Offer Section -->
          <div style="background-color: #e8f4f8; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
            <h3 style="color: #2c3e50; font-size: 18px; margin-bottom: 15px;">Special Renewal Offer!</h3>
            <p style="color: #34495e; font-size: 16px; line-height: 1.6;">
              Renew before your membership expires and get <strong>10% off</strong> on your next membership period!
            </p>
          </div>

          <!-- Footer -->
          <div style="border-top: 1px solid #eee; padding-top: 20px; text-align: center;">
            <p style="color: #7f8c8d; font-size: 14px; margin-bottom: 10px;">
              Need help with renewal? Contact us at support@activehub.com
            </p>
            <p style="color: #7f8c8d; font-size: 14px;">
              Best regards,<br>
              <strong style="color: #2c3e50;">ActiveHub Team</strong>
            </p>
          </div>
        </div>
      `;

      // Send email using the email service
      await sendEmail(
        member.email,
        "Membership Renewal Reminder",
        emailContent
      );

      return res.status(200).json({ message: "Reminder sent successfully" });
    } else {
      return res
        .status(200)
        .json({ message: "Membership is not expiring soon" });
    }
  } catch (error) {
    console.error("Error sending email:", error);
    return res.status(500).json({ message: "Failed to send notification" });
  }
};
