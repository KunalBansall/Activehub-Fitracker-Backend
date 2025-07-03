const crypto = require('crypto');
const Trainer = require('../models/trainer');
const Member = require('../models/member');
const { promisify } = require('util');
const jwt = require('jsonwebtoken');
const emailService = require('../services/emailService');

const signToken = id => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not defined in environment variables');
  }
  
  // Set default expiration to 30 days if not specified
  const expiresIn = process.env.JWT_EXPIRES_IN || '30d';
  
  return jwt.sign(
    { id, role: 'trainer' },
    process.env.JWT_SECRET,
    { expiresIn }
  );
};

const createSendToken = (trainer, statusCode, res) => {
  const token = signToken(trainer._id);
  
  // Remove password from output
  trainer.password = undefined;
  
  res.status(statusCode).json({
    status: 'success',
    token,
    data: {
      trainer
    }
  });
};

// @desc    Create a new trainer (Admin only)
// @route   POST /api/trainers
// @access  Private/Admin
exports.createTrainer = async (req, res) => {
  try {
    // Only allow admins to create trainers
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        status: 'fail',
        message: 'You do not have permission to perform this action. Admin access required.'
      });
    }

    const { name, email, phone, image, assignedToAll, assignedMembers } = req.body;
    
    // Validate required fields
    if (!name || !email || !phone) {
      return res.status(400).json({
        status: 'fail',
        message: 'Please provide name, email, and phone number'
      });
    }
    
    // Check if trainer with email already exists
    const existingTrainer = await Trainer.findOne({ email });
    if (existingTrainer) {
      return res.status(400).json({
        status: 'fail',
        message: 'A trainer with this email already exists'
      });
    }
    
    // Create new trainer with admin's ID as gymId
    const newTrainer = await Trainer.create({
      name,
      email,
      phone,
      image: image || '',
      gymId: req.user._id,
      assignedToAll: assignedToAll || false,
      assignedMembers: assignedToAll ? [] : (assignedMembers || [])
    });

    // Generate password reset token
    const resetToken = newTrainer.createPasswordResetToken();
    await newTrainer.save({ validateBeforeSave: false });

    // Send email with password setup link
    const resetURL = `${process.env.FRONTEND_URL}/trainer/set-password/${resetToken}`;
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Welcome to ActiveHub FitTracker!</h2>
        <p>Hello ${newTrainer.name},</p>
        <p>Your trainer account has been created by the gym administrator.</p>
        <p>Please set your password by clicking the button below:</p>
        <div style="text-align: center; margin: 25px 0;">
          <a href="${resetURL}" style="background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">
            Set Your Password
          </a>
        </div>
        <p>Or copy and paste this link into your browser:</p>
        <p style="word-break: break-all;">${resetURL}</p>
        <p>If you did not request this, please ignore this email.</p>
        <p>Best regards,<br>The ActiveHub Team</p>
      </div>
    `;

    // Send email using the email service
    const emailResult = await emailService.sendGeneralEmail(
      newTrainer.email,
      'Your ActiveHub FitTracker Trainer Account',
      `Please set your password by visiting: ${resetURL}`,
      emailHtml
    );

    if (emailResult) {
      return res.status(201).json({
        status: 'success',
        message: 'Trainer created successfully. Password setup email sent.',
        data: {
          trainer: newTrainer
        }
      });
    } else {
      console.error('Error sending email:', emailResult.error);
      // Still return success but note that email wasn't sent
      return res.status(201).json({
        status: 'success',
        message: 'Trainer created successfully, but failed to send password setup email. Please contact support.',
        data: {
          trainer: newTrainer,
          resetToken: resetToken // Only for development
        }
      });
    }
  } catch (err) {
    console.error('Error creating trainer:', err);
    res.status(400).json({
      status: 'fail',
      message: err.message
    });
  }
};

// @desc    Set trainer password
// @route   POST /api/trainers/set-password/:token
// @access  Public
exports.setPassword = async (req, res) => {
  try {
    // 1) Get user based on the token
    const hashedToken = crypto
      .createHash('sha256')
      .update(req.params.token)
      .digest('hex');

    const trainer = await Trainer.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    });

    // 2) If token has not expired, and there is user, set the new password
    if (!trainer) {
      return res.status(400).json({
        status: 'fail',
        message: 'Token is invalid or has expired'
      });
    }
    
    // 3) Set the new password
    trainer.password = req.body.password;
    trainer.passwordResetToken = undefined;
    trainer.passwordResetExpires = undefined;
    await trainer.save();

    // 4) Log the user in, send JWT
    createSendToken(trainer, 200, res);
  } catch (err) {
    console.error('Error setting password:', err);
    res.status(400).json({
      status: 'fail',
      message: err.message
    });
  }
};

// @desc    Login trainer
// @route   POST /api/trainers/login
// @access  Public
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1) Check if email and password exist
    if (!email || !password) {
      return res.status(400).json({
        status: 'fail',
        message: 'Please provide email and password!'
      });
    }
    
    // 2) Check if trainer exists and password is correct
    const trainer = await Trainer.findOne({ email, active: { $ne: false } }).select('+password');
    
    if (!trainer || !(await trainer.correctPassword(password, trainer.password))) {
      return res.status(401).json({
        status: 'fail',
        message: 'Incorrect email or password'
      });
    }

    // 3) If everything ok, send token to client
    createSendToken(trainer, 200, res);
  } catch (err) {
    console.error('Login error:', err);
    res.status(400).json({
      status: 'fail',
      message: err.message
    });
  }
};

// @desc    Get assigned members for trainer
// @route   GET /api/trainers/assigned-members
// @access  Private/Trainer
exports.getAssignedMembers = async (req, res) => {
  try {
    // Get the trainer ID from the authenticated user
    const trainerId = req.user.id;

    // Find the trainer and populate the assignedMembers
    const trainer = await Trainer.findById(trainerId).populate({
      path: 'assignedMembers',
      select: 'name email phone membershipType membershipStatus lastAttendance'
    });

    if (!trainer) {
      return res.status(404).json({
        status: 'fail',
        message: 'Trainer not found'
      });
    }

    res.status(200).json({
      status: 'success',
      results: trainer.assignedMembers.length,
      data: {
        members: trainer.assignedMembers
      }
    });
  } catch (error) {
    console.error('Error getting assigned members:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
};

// @desc    Get members assigned to the current trainer
// @route   GET /api/trainers/me/members
// @access  Private/Trainer
exports.getMyMembers = async (req, res) => {
  try {
    // Get the trainer ID from the authenticated user
    const trainerId = req.user.id;

    // Find the trainer and populate the assignedMembers with more details
    const trainer = await Trainer.findById(trainerId).populate({
      path: 'assignedMembers',
      select: 'name email phone profileImage membershipType membershipStatus lastAttendance'
    });

    if (!trainer) {
      return res.status(404).json({
        status: 'fail',
        message: 'Trainer not found'
      });
    }

    res.status(200).json({
      status: 'success',
      results: trainer.assignedMembers.length,
      data: {
        members: trainer.assignedMembers
      }
    });
  } catch (error) {
    console.error('Error getting my members:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error',
      error: error.message
    });
  }
};

// @desc    Get all trainers (Admin only)
// @route   GET /api/trainers
// @access  Private/Admin
exports.getAllTrainers = async (req, res) => {
  try {
    // Only allow admins to view all trainers
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        status: 'fail',
        message: 'You do not have permission to perform this action'
      });
    }

    // Find trainers that belong to the current admin
    const trainers = await Trainer.find({ gymId: req.user._id });

    res.status(200).json({
      status: 'success',
      results: trainers.length,
      data: {
        trainers
      }
    });
  } catch (err) {
    console.error('Error getting trainers:', err);
    res.status(400).json({
      status: 'fail',
      message: err.message
    });
  }
};

// @desc    Delete a trainer (Admin only)
// @route   DELETE /api/trainers/:id
// @access  Private/Admin
// @desc    Update a trainer (Admin only)
// @route   PATCH /api/trainers/:id
// @access  Private/Admin
exports.updateTrainer = async (req, res) => {
  try {
    // Only allow admins to update trainers
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        status: 'fail',
        message: 'You do not have permission to perform this action. Admin access required.'
      });
    }

    const { id } = req.params;
    const { name, email, phoneNumber, specialization, image, assignedMembers } = req.body;

    // Find the trainer by ID
    const trainer = await Trainer.findById(id);
    if (!trainer) {
      return res.status(404).json({
        status: 'fail',
        message: 'No trainer found with that ID'
      });
    }

    // Update trainer fields
    if (name) trainer.name = name;
    if (email) trainer.email = email;
    if (phoneNumber) trainer.phoneNumber = phoneNumber;
    if (specialization) trainer.specialization = specialization;
    if (image) trainer.image = image;
    
    // Update assigned members if provided
    if (Array.isArray(assignedMembers)) {
      trainer.assignedMembers = assignedMembers;
    }

    // Save the updated trainer
    const updatedTrainer = await trainer.save();

    res.status(200).json({
      status: 'success',
      data: {
        trainer: updatedTrainer
      }
    });
  } catch (error) {
    console.error('Error updating trainer:', error);
    
    // Handle duplicate key error (e.g., duplicate email)
    if (error.code === 11000) {
      return res.status(400).json({
        status: 'fail',
        message: 'Email already exists',
        field: 'email'
      });
    }
    
    res.status(500).json({
      status: 'error',
      message: 'An error occurred while updating the trainer',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

exports.deleteTrainer = async (req, res) => {
  try {
    // Only allow admins to delete trainers
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        status: 'fail',
        message: 'You do not have permission to perform this action. Admin access required.'
      });
    }

    const trainer = await Trainer.findByIdAndDelete(req.params.id);

    if (!trainer) {
      return res.status(404).json({
        status: 'fail',
        message: 'No trainer found with that ID'
      });
    }

    res.status(204).json({
      status: 'success',
      data: null
    });
  } catch (err) {
    console.error('Error deleting trainer:', err);
    res.status(400).json({
      status: 'fail',
      message: err.message
    });
  }
};

// @desc    Protect routes - verify JWT token for both admin and trainer
// @access  Private
exports.protect = async (req, res, next) => {
  try {
    // 1) Getting token and check if it's there
    let token;
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        status: 'fail',
        message: 'You are not logged in! Please log in to get access.'
      });
    }

    // 2) Verification token
    const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

    // 3) Check if user is admin or trainer
    let currentUser;
    
    // First try to find admin
    const Admin = require('../models/Admin');
    currentUser = await Admin.findById(decoded.id);
    
    // If not admin, try to find trainer
    if (!currentUser) {
      currentUser = await Trainer.findById(decoded.id);
    }

    if (!currentUser) {
      return res.status(401).json({
        status: 'fail',
        message: 'The user belonging to this token no longer exists.'
      });
    }

    // 4) Check if user changed password after the token was issued
    if (currentUser.changedPasswordAfter && currentUser.changedPasswordAfter(decoded.iat)) {
      return res.status(401).json({
        status: 'fail',
        message: 'User recently changed password! Please log in again.'
      });
    }

    // GRANT ACCESS TO PROTECTED ROUTE
    req.user = currentUser;
    req.user.role = currentUser.constructor.modelName.toLowerCase(); // 'admin' or 'trainer'
    next();
  } catch (err) {
    console.error('Protect middleware error:', err);
    res.status(401).json({
      status: 'fail',
      message: 'You are not logged in! Please log in to get access.'
    });
  }
};

// @desc    Restrict routes to specific roles
// @access  Private
exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        status: 'fail',
        message: 'You do not have permission to perform this action'
      });
    }
    next();
  };
};