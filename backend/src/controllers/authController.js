const Admin = require('../models/Admin');
const jwt = require('jsonwebtoken');

const generateToken = (admin) => {
  return jwt.sign(
    { id: admin._id, email: admin.email },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
};

exports.signup = async (req, res) => {
  try {
    const {
      username,
      email,
      password,
      gymName,
      gymAddress,
      gymType
    } = req.body;

    const adminExists = await Admin.findOne({ email });
    if (adminExists) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    const admin = await Admin.create({
      username,
      email,
      password,
      gymName,
      gymAddress,
      gymType
    });

    const token = generateToken(admin);

    res.status(201).json({
      _id: admin._id,
      username: admin.username,
      email: admin.email,
      gymName: admin.gymName,
      token
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
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = generateToken(admin);

    res.json({
      _id: admin._id,
      username: admin.username,
      email: admin.email,
      gymName: admin.gymName,
      token
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};