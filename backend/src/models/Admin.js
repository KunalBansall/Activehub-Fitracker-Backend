const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const gymPhotoSchema = new mongoose.Schema({
  url: {
    type: String,
    required: true
  },
  publicId: {
    type: String,
    required: true
  }
}, { _id: true });

const adminSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  gymName: {
    type: String,
    required: true,
    trim: true
  },
  gymAddress: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String
  },
  gymType: {
    type: String,
    required: true,
    enum: ['Fitness Center', 'CrossFit Box', 'Yoga Studio', 'Martial Arts', 'Other']
  },
  role: {
    type: String,
    enum: ["admin", "owner"],
    default: "admin",  // Default role is "admin"
  },
  profilePhotoUrl: {
    type: String,
  },
  profilePhotoId: {
    type: String,
  },
  photos: [gymPhotoSchema]
}, {
  timestamps: true
});

// Hash password before saving
adminSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password
adminSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('Admin', adminSchema);