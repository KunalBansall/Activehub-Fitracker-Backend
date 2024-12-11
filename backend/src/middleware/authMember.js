// middleware/authMember.js
const Member = require('../models/Member');
const jwt = require('jsonwebtoken');

// Middleware for authenticating a member
exports.authenticateMember = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
               
    console.log(req.headers.authorization);  // Log the incoming token for inspection

    if (!token) {
      return res.status(401).json({ message: 'Authentication token is missing' });
    }
  
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const member = await Member.findById(decoded.id);
  
      if (!member) {
        return res.status(404).json({ message: 'Member not found' });
      }
  
      req.member = member; // Attach member object to the request
      next();
    } catch (err) {
      res.status(401).json({ message: 'Invalid or expired token', error: err.message });
    }
  };