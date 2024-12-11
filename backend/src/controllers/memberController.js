const Member = require("../models/Member");
const Attendance = require("../models/Attendance");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const moment = require("moment");
const jwt = require("jsonwebtoken");

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
    const { email, phoneNumber, durationMonths } = req.body;

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

    // Set membershipStartDate to the current date if not provided
    const membershipStartDate = new Date();

    // Calculate membershipEndDate (adding months to membershipStartDate)
    const endDate = new Date(membershipStartDate);
    endDate.setMonth(endDate.getMonth() + durationMonths); // Add the number of months to start date

    // Ensure the calculated membershipEndDate is valid
    if (isNaN(endDate.getTime())) {
      return res.status(400).json({ message: "Invalid membership end date." });
    }

    // Log for debugging
    // console.log(`Start Date: ${membershipStartDate}, End Date: ${endDate}`);

    // Generate password reset token (valid for 24 hours)
    // const resetToken = crypto.randomBytes(20).toString("hex");
    // const resetToken = jwt.sign(
    //   { id: member._id }, // payload
    //   process.env.JWT_SECRET, // secret
    //   { expiresIn: "24h" } // token validity
    // );

    // const resetTokenExpiration = moment().add(1, "days").toDate(); // Expire in 1 day

    // Create a new member with the calculated membershipEndDate and reset token info
    const member = await Member.create({
      ...req.body,
      gymId: adminGymId,
      membershipStartDate, // Use current date for membershipStartDate
      membershipEndDate: endDate,
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
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: member.email,
      subject: `Welcome to ${req.admin.gymName || "our Gym"}`,
      html: `
        <html>
  <body style="font-family: Arial, sans-serif; background-color: #f8f9fa; color: #333; margin: 0; padding: 0;">
    <div style="max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);">
      
      <!-- Header -->
      <div style="text-align: center; padding-bottom: 20px;">
        <h2 style="color: #1D4ED8; font-size: 24px; font-weight: bold; margin: 0;">Welcome to ${
          req.admin.gymName || "Our Gym"
        }</h2>
      </div>
      
      <!-- Greeting & Introduction -->
      <p style="font-size: 16px; line-height: 1.5; color: #333;">
        Dear <strong>${member.name}</strong>,
      </p>
      <p style="font-size: 16px; line-height: 1.5; color: #333;">
        We are thrilled to have you join <strong>${
          req.admin.gymName || "our gym"
        }</strong>! 🎉
      </p>
      <!-- Membership Validity Info -->
<p style="font-size: 16px; line-height: 1.5; color: #333;">
  Your membership is valid from <strong>${membershipStartDate.toDateString()}</strong>
  to <strong>${endDate.toDateString()}</strong>.
</p>

      
      <!-- Instructions -->
      <p style="font-size: 16px; line-height: 1.5; color: #333;">
        To get started, please set your password by clicking the link below. This will help you manage your gym profile, track your progress, and enjoy all the features we offer.
      </p>
      
      <!-- Password Reset Link -->
      <div style="text-align: center; margin-top: 20px;">
        <a href="${resetPasswordLink}" 
           style="background-color: #1D4ED8; color: white; padding: 12px 25px; font-size: 16px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">
           Set Your Password
        </a>
      </div>
      
      <!-- Additional Info -->
      <p style="font-size: 16px; line-height: 1.5; color: #333; margin-top: 30px;">
        Once your password is set, you will be able to access all features including:
      </p>
      <ul style="font-size: 16px; line-height: 1.5; color: #333; margin-left: 20px; list-style-type: disc;">
        <li>View your gym profile and details</li>
        <li>Track your attendance and workouts</li>
        <li>Access personalized exercise routines</li>
        <li>Connect with your trainer and much more!</li>
      </ul>
      
      <!-- Contact Info -->
      <p style="font-size: 16px; line-height: 1.5; color: #333; margin-top: 30px;">
        If you have any questions or need assistance, don't hesitate to reach out to us. We're here to help!
      </p>
      
      <!-- Footer -->
      <p style="font-size: 16px; color: #6c757d; text-align: center; margin-top: 30px;">
        Best regards,<br>
        The <strong>${req.admin.gymName || "Gym"}</strong> Team
      </p>
      
      <!-- Copyright -->
      <p style="font-size: 14px; color: #6c757d; text-align: center; margin-top: 20px;">
        &copy; ${new Date().getFullYear()} ActiveHub Fitracker. All rights reserved.
      </p>
      
    </div>
  </body>
</html>

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

    // Only update membershipStartDate if it's explicitly provided in the request body
    if (req.body.membershipStartDate) {
      const newStartDate = new Date(req.body.membershipStartDate);
      // Validate if the provided start date is a valid date
      if (isNaN(newStartDate)) {
        return res.status(400).json({ message: "Invalid membership start date" });
      }
      req.body.membershipStartDate = newStartDate;
    }

    if (req.body.durationMonths) {
      const newDurationMonths = parseInt(req.body.durationMonths, 10);
      if (isNaN(newDurationMonths) || newDurationMonths <= 0) {
        return res.status(400).json({ message: "Invalid durationMonths value" });
      }

      const newEndDate = new Date();
      newEndDate.setMonth(newEndDate.getMonth() + newDurationMonths);
      req.body.membershipEndDate = newEndDate;
    }

    // Update the member data, excluding membershipStartDate if not provided
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

// Set up Nodemailer transporter
const transporter = nodemailer.createTransport({
  service: "gmail", // Replace with your email provider
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, // Use your email password or an App Password for security
  },
});

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
      // Send email with Nodemailer
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: member.email,
        subject: "Membership Renewal Reminder",
        html: `
          <html>
            <body style="font-family: Arial, sans-serif; background-color: #f8f9fa; color: #333;">
              <div style="max-width: 600px; margin: 0 auto; padding: 20px; background-color: #fff; border-radius: 8px; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);">
                <h2 style="color: #1D4ED8; text-align: center;">Membership Renewal Reminder</h2>
                <p style="font-size: 16px;">Dear <strong>${
                  member.name
                }</strong>,</p>
                <p style="font-size: 16px;">We hope you're enjoying your time at our gym! We wanted to remind you that your membership will expire on <strong>${membershipEndDate.toDateString()}</strong>.</p>
                <p style="font-size: 16px; font-weight: bold; color: #e63946;">Don't let your membership lapse! Renew today to continue enjoying all the benefits of being a member of our gym.</p>
                <div style="text-align: center; margin-top: 20px;">
                  <a href="https://activehub-fitracker.onrender.com/" style="background-color: #1D4ED8; color: white; padding: 10px 20px; font-size: 16px; text-decoration: none; border-radius: 4px;">Renew Your Membership</a>
                </div>
                <p style="font-size: 16px; margin-top: 30px;">If you have any questions or need assistance with your renewal, feel free to contact us at <strong>activehubfitracker.com</strong>.</p>
                <p style="font-size: 16px; color: #6c757d;">Thank you for being a valued member of our gym!</p>
                <p style="font-size: 14px; color: #6c757d; text-align: center;">&copy; ${new Date().getFullYear()} ActiveHub Fitracker. All rights reserved.</p>
              </div>
            </body>
          </html>
        `,
      };

      await transporter.sendMail(mailOptions);

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
