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
    type: Date,
    default: null
  },
  autoCompleted: {
    type: Boolean,
    default: false,
    description: 'Indicates if this session was automatically closed because of a new day check-in'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Attendance', attendanceSchema);