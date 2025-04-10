// middleware/verifyTokenAndRole.js
const Admin = require('../models/Admin');
const Member = require('../models/Member');
const jwt = require('jsonwebtoken');

exports.verifyTokenAndRole = async (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ message: 'Authorization token is missing' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // First try to find admin
    let admin = await Admin.findById(decoded.id);
    if (admin) {
      req.user = admin;
      req.role = 'admin';
      req.gymId = admin._id; // For admin, gymId is their own ID
      next();
      return;
    }
    
    // If not found, try to find member
    let member = await Member.findById(decoded.id);
    if (member) {
      req.user = member;
      req.role = 'member';
      req.gymId = member.gymId; // For member, use their assigned gym ID
      next();
      return;
    }
    
    // If neither found
    return res.status(404).json({ message: 'User not found' });
  } catch (err) {
    console.error('Token verification error:', err);
    res.status(401).json({ message: 'Invalid or expired token' });
  }
}; 