// middleware/verifyOwner.js
const Admin = require('../models/Admin');
const jwt = require('jsonwebtoken');

exports.verifyOwner = async (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ message: 'Authorization token is missing' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const admin = await Admin.findById(decoded.id);

    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    // Check if admin has owner role or if email matches OWNER_EMAIL
    if (admin.role === 'owner' || admin.email === process.env.OWNER_EMAIL) {
      req.admin = admin; // Attach admin to request
      next();
    } else {
      return res.status(403).json({ message: 'Access denied. Owner privileges required.' });
    }
  } catch (err) {
    console.error('Token verification error:', err);
    res.status(401).json({ message: 'Invalid or expired token' });
  }
}; 