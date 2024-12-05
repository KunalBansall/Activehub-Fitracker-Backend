// middleware/auth.js
const Admin = require('../models/Admin');
const jwt = require('jsonwebtoken');
exports.authenticateAdmin = async (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    // console.log("Authorization Header:", req.header('Authorization')); // Debug log
    if (!token) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const admin = await Admin.findById(decoded.id);
        if (!admin) {
            return res.status(404).json({ message: 'Admin not found' });
        }

        req.admin = admin; // Attach admin info to the request
        next();
    } catch (err) {
        console.error("Token verification error:", err); // Debug log
        res.status(401).json({ message: 'Invalid token' });
    }
};
