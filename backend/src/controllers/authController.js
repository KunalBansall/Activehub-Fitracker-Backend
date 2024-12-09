const Admin = require("../models/Admin");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const bcrypt = require("bcryptjs");

const generateToken = (admin) => {
  return jwt.sign(
    { id: admin._id, email: admin.email },
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

    const admin = await Admin.create({
      username,
      email,
      password,
      gymName,
      gymAddress,
      gymType,
    });

    const token = generateToken(admin);

    res.status(201).json({
      _id: admin._id,
      username: admin.username,
      email: admin.email,
      gymName: admin.gymName,
      token,
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

    const token = generateToken(admin);

    res.json({
      _id: admin._id,
      username: admin.username,
      email: admin.email,
      gymName: admin.gymName,
      token,
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

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const gymName = user.gymName || "Your Gym"; // Fallback if gymName is not available
    const username = user.username || "User"; // Fallback if username is not available

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: `Password Reset Request - ${gymName}`,
      text: `Hello ${username},

We received a request to reset your password. Please click the link below to reset it:

${process.env.FRONTEND_URL}/reset-password/${user._id}/${token}

If you did not request this, please ignore this email or contact our support team.

Thank you,
${gymName} Support Team`,

      html: `
        <p>Hi <strong>${username}</strong>,</p>
        <p>We received a request to reset your password. Click the button below to reset it:</p>
        <p style="text-align: center; margin: 20px 0;">
          <a href="${process.env.FRONTEND_URL}/reset-password/${user._id}/${token}" 
             style="background-color: #007BFF; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
            Reset Password
          </a>
        </p>
        <p>If the button doesn't work, you can copy and paste the following link into your browser:</p>
        <p>${process.env.FRONTEND_URL}/reset-password/${user._id}/${token}</p>
        <p>If you did not request this, please ignore this email or <a href="https://activehub-fitracker.onrender.com/">contact our support team</a>.</p>
        <p>Best regards,<br>${gymName} Support Team</p>
      `,
    };

    transporter.sendMail(mailOptions, (error) => {
      if (error) {
        console.error(error);
        return res.status(500).json({ message: "Failed to send email" });
      }
      res.json({ message: "Reset link sent successfully" });
    });
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
        return res
          .status(400)
          .json({
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
