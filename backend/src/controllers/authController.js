const Admin = require("../models/Admin");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const bcrypt = require("bcryptjs");
const AdminLog = require("../models/AdminLog");
const { getClientIp, getLocationByIp } = require("../config/locationHelper");
const { sendWelcomeEmail } = require("../services/emailService");

const generateToken = (admin) => {
  return jwt.sign(
    { id: admin._id, email: admin.email, role: admin.role },
    process.env.JWT_SECRET,
    { expiresIn: "30d" }
  );
};

exports.signup = async (req, res) => {
  try {
    const { username, email, password, gymName, gymAddress, gymType } =
      req.body;

    const adminExists = await Admin.findOne({ email });
    if (adminExists) {
      return res.status(400).json({ message: "Email already registered" });
    }
    const role = email === process.env.OWNER_EMAIL ? "owner" : "admin";

    // Calculate trial and grace period end dates
    const now = new Date();
    const trialEndDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 days
    const graceEndDate = new Date(trialEndDate.getTime() + 3 * 24 * 60 * 60 * 1000); // +3 days after trial

    const admin = await Admin.create({
      username,
      email,
      password,
      gymName,
      gymAddress,
      gymType,
      role,
      subscriptionStatus: "trial",
      trialEndDate,
      graceEndDate,
    });

    const ipAddress = getClientIp(req);
    const location = await getLocationByIp(ipAddress);
    console.log("locationandIpAdress", location, ipAddress);

    const token = generateToken(admin);

    // Log sign-up activity
    await AdminLog.create({
      adminId: admin._id,
      action: "sign-up",
      ipAddress,
      location,
      deviceInfo: req.headers["user-agent"],
      timestamp: new Date(),
    });

    // Send welcome email to the new gym owner/admin
    try {
      const emailSent = await sendWelcomeEmail(admin);
      console.log(`Welcome email to ${admin.email} ${emailSent ? 'sent successfully' : 'failed to send'}`);
    } catch (emailError) {
      // Don't let email errors affect the signup process
      console.error('Error sending welcome email:', emailError);
    }

    res.status(201).json({
      _id: admin._id,
      username: admin.username,
      email: admin.email,
      gymName: admin.gymName,
      role: admin.role,
      token,
      subscriptionStatus: admin.subscriptionStatus,
      trialEndDate: admin.trialEndDate
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.signin = async (req, res) => {
  try {
    const { email, password } = req.body;

    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const ipAddress = getClientIp(req);
    console.log("Detected IP Address:", ipAddress); // Log the IP address

    const location = await getLocationByIp(ipAddress);
    console.log("Detected Location:", location); // Log the location data


    const token = generateToken(admin);

    // Log sign-in activity
    await AdminLog.create({
      adminId: admin._id,
      action: "sign-in",
      ipAddress,
      location,
      deviceInfo: req.headers["user-agent"],
      timestamp: new Date(),
    });

    res.json({
      _id: admin._id,
      username: admin.username,
      email: admin.email,
      gymName: admin.gymName,
      role: admin.role,
      token,
      subscriptionStatus: admin.subscriptionStatus,
      trialEndDate: admin.trialEndDate,
      graceEndDate: admin.graceEndDate,
      subscriptionEndDate: admin.subscriptionEndDate
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Forgot Password Controller
exports.forgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await Admin.findOne({ email }); // Ensure Admin schema has gymName and username fields
    if (!user) {
      return res.status(404).json({ message: "User does not exist" });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });

    // Import the email service
    const emailService = require('../services/emailService');
    
    const gymName = user.gymName || "Your Gym"; // Fallback if gymName is not available
    const username = user.username || "User"; // Fallback if username is not available

    // Create the HTML email content
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 20px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #2c3e50; margin-bottom: 10px;">Password Reset Request</h1>
          <p style="color: #7f8c8d; font-size: 16px;">Hello ${username},</p>
        </div>

        <div style="background-color: #f8f9fa; padding: 25px; border-radius: 8px; margin-bottom: 30px;">
          <p style="color: #34495e; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
            We received a request to reset your password for your ${gymName} account. Click the button below to reset it:
          </p>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}/reset-password/${user._id}/${token}" 
               style="background-color: #3498db; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; font-size: 16px;">
              Reset Password
            </a>
          </div>

          <p style="color: #7f8c8d; font-size: 14px; margin-bottom: 20px;">
            If the button doesn't work, copy and paste this link into your browser:
          </p>
          <p style="color: #3498db; word-break: break-all; font-size: 14px; background-color: #f1f1f1; padding: 10px; border-radius: 4px;">
            ${process.env.FRONTEND_URL}/reset-password/${user._id}/${token}
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

// Reset Password Controller
exports.resetPassword = async (req, res) => {
  const { id, token } = req.params;
  const { password } = req.body;

  try {
    jwt.verify(token, process.env.JWT_SECRET, async (err) => {
      if (err) {
        return res.status(400).json({
          Status: "Error with token",
          message: "Invalid or expired token",
        });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      await Admin.findByIdAndUpdate(id, { password: hashedPassword });

      res.json({ Status: "Success", message: "Password reset successfully" });
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ Status: err, message: "Internal Server Error" });
  }
};
