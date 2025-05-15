const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const workoutController = require('../controllers/workoutController');
const { authenticateAdmin } = require('../middleware/auth');
const { authenticateMember } = require('../middleware/authMember');
const {restrictWriteAccess} = require("../middleware/subscriptionAccess");
const { testWorkoutEmailAndReset } = require('../cron/index');

// Validation for workout plan creation
const workoutPlanValidation = [
  body('name').notEmpty().withMessage('Workout plan name is required'),
  body('goal')
    .isIn(['muscle_gain', 'fat_loss', 'strength', 'endurance', 'general_fitness'])
    .withMessage('Invalid goal'),
  body('experienceLevel')
    .isIn(['beginner', 'intermediate', 'advanced'])
    .withMessage('Invalid experience level'),
  body('accessType')
    .isIn(['gym', 'home', 'both'])
    .withMessage('Invalid access type'),
  body('startDate')
    .isISO8601()
    .withMessage('Invalid start date format'),
  body('endDate')
    .isISO8601()
    .withMessage('Invalid end date format'),
  body('dailyWorkouts')
    .isArray()
    .withMessage('Daily workouts must be an array'),
  body('dailyWorkouts.*.day')
    .isIn(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'])
    .withMessage('Invalid day'),
  body('dailyWorkouts.*.focus')
    .notEmpty()
    .withMessage('Workout focus is required'),
  body('dailyWorkouts.*.exercises')
    .isArray()
    .withMessage('Exercises must be an array'),
  body('dailyWorkouts.*.exercises.*.name')
    .notEmpty()
    .withMessage('Exercise name is required'),
  body('dailyWorkouts.*.exercises.*.sets')
    .isInt({ min: 1 })
    .withMessage('Sets must be at least 1'),
  body('dailyWorkouts.*.exercises.*.reps')
    .notEmpty()
    .withMessage('Reps are required'),
  body('dailyWorkouts.*.exercises.*.restTime')
    .isInt({ min: 0 })
    .withMessage('Rest time must be a positive number')
];

// Admin routes - protected with admin middleware
router.use('/admin', authenticateAdmin);

// Create a workout plan for a member
router.post('/admin/member/:memberId/plan', restrictWriteAccess, workoutPlanValidation, workoutController.createWorkoutPlan);

// Update a workout plan
router.put('/admin/plan/:planId',restrictWriteAccess, workoutController.updateWorkoutPlan);

// Delete a workout plan
router.delete('/admin/plan/:planId', workoutController.deleteWorkoutPlan);

// Get all workout plans for a gym
router.get('/admin/plans', workoutController.getGymWorkoutPlans);

// Get all workout plans for a member
router.get('/admin/member/:memberId/plans', workoutController.getMemberWorkoutPlans);

// Test endpoint for workout email and reset functionality
router.post('/admin/test-workout-email-reset', async (req, res) => {
  try {
    console.log('🧪 Testing workout email and reset functionality...');
    const result = await testWorkoutEmailAndReset();
    res.status(200).json({
      success: true,
      message: 'Workout email and reset test completed successfully',
      result
    });
  } catch (error) {
    console.error('❌ Error in test endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Error running workout email and reset test',
      error: error.message
    });
  }
});

// Member routes - protected with member middleware
router.use('/member', authenticateMember);

// Get current workout plan for a member
router.get('/member/plan', workoutController.getMemberWorkoutPlan);

// Get today's workout
router.get('/member/today', workoutController.getTodaysWorkout);

// Update exercise status (completed, skipped, rescheduled)
router.put('/member/exercise-status', [
  body('planId').notEmpty().withMessage('Plan ID is required'),
  body('dayIndex').isInt({ min: 0 }).withMessage('Day index must be a non-negative integer'),
  body('exerciseIndex').isInt({ min: 0 }).withMessage('Exercise index must be a non-negative integer'),
  body('status').isIn(['completed', 'skipped', 'rescheduled', 'pending']).withMessage('Invalid status')
], workoutController.updateExerciseStatus);

// Add member notes to a workout day
router.put('/member/notes', [
  body('planId').notEmpty().withMessage('Plan ID is required'),
  body('dayIndex').isInt({ min: 0 }).withMessage('Day index must be a non-negative integer'),
  body('notes').notEmpty().withMessage('Notes are required')
], workoutController.addMemberNotes);

module.exports = router; 