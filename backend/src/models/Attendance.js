const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  memberId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Member',
    required: true
  },
  entryTime: {
    type: Date,
    required: true,
    default: Date.now
  },
  exitTime: {
    type: Date
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Attendance', attendanceSchema);