const mongoose = require('mongoose');

// Schema for individual exercises
const exerciseSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  sets: {
    type: Number,
    required: true,
    min: 1
  },
  reps: {
    type: String, // Can be a range like "8-10" or specific like "12"
    required: true
  },
  restTime: {
    type: Number, // Rest time in seconds
    required: true
  },
  completed: {
    type: String,
    enum: ['completed', 'skipped', 'rescheduled', 'pending'],
    default: 'pending'
  },
  alternativeExercise: {
    type: String,
    trim: true
  },
  equipmentRequired: {
    type: [String],
    default: []
  },
  notes: {
    type: String
  }
});

// Schema for daily workouts
const dailyWorkoutSchema = new mongoose.Schema({
  day: {
    type: String,
    enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    required: true
  },
  focus: {
    type: String,
    required: true,
    trim: true
  },
  completed: {
    type: Boolean,
    default: false
  },
  exercises: [exerciseSchema],
  warmup: {
    type: [String],
    default: []
  },
  cooldown: {
    type: [String],
    default: []
  },
  memberNotes: {
    type: String
  }
});

// Main workout plan schema
const workoutPlanSchema = new mongoose.Schema({
  memberId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Member',
    required: true
  },
  gymId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  startDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  endDate: {
    type: Date,
    required: true
  },
  goal: {
    type: String,
    enum: ['muscle_gain', 'fat_loss', 'strength', 'endurance', 'general_fitness'],
    required: true
  },
  experienceLevel: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced'],
    required: true
  },
  preferredWorkoutDays: {
    type: [String],
    enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    default: []
  },
  accessType: {
    type: String,
    enum: ['gym', 'home', 'both'],
    required: true
  },
  dailyWorkouts: [dailyWorkoutSchema],
  active: {
    type: Boolean,
    default: true
  },
  consistency: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  completedWorkouts: {
    type: Number,
    default: 0
  },
  missedWorkouts: {
    type: Number,
    default: 0
  },
  injuries: {
    type: [String],
    default: []
  },
  limitations: {
    type: [String],
    default: []
  },
  weeklyHistory: {
    type: [{
      weekEndingDate: Date,
      completedWorkouts: Number,
      missedWorkouts: Number,
      consistency: Number,
      dailyWorkouts: []
    }],
    default: []
  }
}, {
  timestamps: true
});

// Pre-save middleware to calculate consistency
workoutPlanSchema.pre('save', function(next) {
  if (this.dailyWorkouts && this.dailyWorkouts.length > 0) {
    const totalWorkouts = this.dailyWorkouts.length;
    const completedWorkouts = this.dailyWorkouts.filter(workout => workout.completed).length;
    
    this.completedWorkouts = completedWorkouts;
    this.missedWorkouts = this.preferredWorkoutDays.length - completedWorkouts;
    
    if (totalWorkouts > 0) {
      this.consistency = Math.round((completedWorkouts / totalWorkouts) * 100);
    }
  }
  next();
});

module.exports = mongoose.model('WorkoutPlan', workoutPlanSchema); 