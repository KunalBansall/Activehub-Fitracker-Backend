const WorkoutPlan = require('../models/WorkoutPlan');
const Member = require('../models/Member');
const { validationResult } = require('express-validator');

// Helper function to get motivational quotes based on consistency
const getMotivationalQuote = (consistency) => {
  if (consistency >= 90) {
    return "Outstanding commitment! You're in the top tier of consistency.";
  } else if (consistency >= 75) {
    return "Great work keeping up with your workouts! Stay strong!";
  } else if (consistency >= 50) {
    return "You're making good progress! Keep pushing to reach your goals.";
  } else if (consistency >= 25) {
    return "Every workout counts! Let's build momentum this week.";
  } else {
    return "Today is a perfect day to restart your fitness journey!";
  }
};

// Get workout plan for a member
exports.getMemberWorkoutPlan = async (req, res) => {
  try {
    const memberId = req.member._id;
    
    // Find the active workout plan for the member
    const workoutPlan = await WorkoutPlan.findOne({ 
      memberId, 
      active: true,
      endDate: { $gte: new Date() }
    }).sort({ createdAt: -1 });
    
    if (!workoutPlan) {
      return res.status(404).json({ message: 'No active workout plan found' });
    }

    // Add a motivational quote based on consistency
    const motivationalQuote = getMotivationalQuote(workoutPlan.consistency);
    
    // Return the workout plan with the motivational quote
    res.status(200).json({
      workoutPlan,
      motivationalQuote
    });
  } catch (err) {
    console.error('Error getting workout plan:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Create a new workout plan for a member
exports.createWorkoutPlan = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { memberId } = req.params;
    const gymId = req.admin._id;
    
    // Check if the member exists and belongs to this gym
    const member = await Member.findOne({ _id: memberId, gymId });
    if (!member) {
      return res.status(404).json({ message: 'Member not found or not associated with this gym' });
    }
    
    // Set any existing plans to inactive
    await WorkoutPlan.updateMany(
      { memberId, active: true },
      { $set: { active: false } }
    );
    
    // Create the new workout plan
    const workoutPlan = await WorkoutPlan.create({
      ...req.body,
      memberId,
      gymId,
      active: true
    });
    
    res.status(201).json({
      message: 'Workout plan created successfully',
      workoutPlan
    });
  } catch (err) {
    console.error('Error creating workout plan:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Update a workout plan
exports.updateWorkoutPlan = async (req, res) => {
  try {
    const { planId } = req.params;
    const gymId = req.admin._id;
    
    // Find the workout plan and ensure it belongs to this gym
    const workoutPlan = await WorkoutPlan.findOne({ _id: planId, gymId });
    if (!workoutPlan) {
      return res.status(404).json({ message: 'Workout plan not found or not associated with this gym' });
    }
    
    // Update the workout plan
    Object.keys(req.body).forEach(key => {
      workoutPlan[key] = req.body[key];
    });
    
    await workoutPlan.save();
    
    res.status(200).json({
      message: 'Workout plan updated successfully',
      workoutPlan
    });
  } catch (err) {
    console.error('Error updating workout plan:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Delete a workout plan
exports.deleteWorkoutPlan = async (req, res) => {
  try {
    const { planId } = req.params;
    const gymId = req.admin._id;
    
    // Find the workout plan and ensure it belongs to this gym
    const workoutPlan = await WorkoutPlan.findOneAndDelete({ _id: planId, gymId });
    if (!workoutPlan) {
      return res.status(404).json({ message: 'Workout plan not found or not associated with this gym' });
    }
    
    res.status(200).json({
      message: 'Workout plan deleted successfully'
    });
  } catch (err) {
    console.error('Error deleting workout plan:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Get all workout plans for a gym
exports.getGymWorkoutPlans = async (req, res) => {
  try {
    const gymId = req.admin._id;
    
    // Find all workout plans for this gym
    const workoutPlans = await WorkoutPlan.find({ gymId }).populate('memberId', 'name email');
    
    res.status(200).json(workoutPlans);
  } catch (err) {
    console.error('Error getting gym workout plans:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Get all workout plans for a member (admin access)
exports.getMemberWorkoutPlans = async (req, res) => {
  try {
    const { memberId } = req.params;
    const gymId = req.admin._id;
    
    // Check if the member exists and belongs to this gym
    const member = await Member.findOne({ _id: memberId, gymId });
    if (!member) {
      return res.status(404).json({ message: 'Member not found or not associated with this gym' });
    }
    
    // Find all workout plans for this member
    const workoutPlans = await WorkoutPlan.find({ memberId, gymId });
    
    res.status(200).json(workoutPlans);
  } catch (err) {
    console.error('Error getting member workout plans:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Update exercise status (completed, skipped, rescheduled)
exports.updateExerciseStatus = async (req, res) => {
  try {
    const memberId = req.member._id;
    const { planId, dayIndex, exerciseIndex, status } = req.body;
    
    // Find the workout plan
    const workoutPlan = await WorkoutPlan.findOne({ _id: planId, memberId, active: true });
    if (!workoutPlan) {
      return res.status(404).json({ message: 'Workout plan not found' });
    }
    
    // Update the exercise status
    if (workoutPlan.dailyWorkouts[dayIndex] && workoutPlan.dailyWorkouts[dayIndex].exercises[exerciseIndex]) {
      workoutPlan.dailyWorkouts[dayIndex].exercises[exerciseIndex].completed = status;
      
      // If all exercises are completed, mark the day as completed
      const allExercisesCompleted = workoutPlan.dailyWorkouts[dayIndex].exercises.every(
        exercise => exercise.completed === 'completed'
      );
      
      if (allExercisesCompleted) {
        workoutPlan.dailyWorkouts[dayIndex].completed = true;
      } else if (status === 'rescheduled') {
        // Handle rescheduling logic here
        // For now, we'll just mark it as not completed
        workoutPlan.dailyWorkouts[dayIndex].completed = false;
      }
      
      await workoutPlan.save();
      
      res.status(200).json({
        message: 'Exercise status updated successfully',
        workoutPlan
      });
    } else {
      res.status(404).json({ message: 'Exercise not found' });
    }
  } catch (err) {
    console.error('Error updating exercise status:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Add member notes to a workout day
exports.addMemberNotes = async (req, res) => {
  try {
    const memberId = req.member._id;
    const { planId, dayIndex, notes } = req.body;
    
    // Find the workout plan
    const workoutPlan = await WorkoutPlan.findOne({ _id: planId, memberId, active: true });
    if (!workoutPlan) {
      return res.status(404).json({ message: 'Workout plan not found' });
    }
    
    // Add the notes to the workout day
    if (workoutPlan.dailyWorkouts[dayIndex]) {
      workoutPlan.dailyWorkouts[dayIndex].memberNotes = notes;
      await workoutPlan.save();
      
      res.status(200).json({
        message: 'Notes added successfully',
        workoutPlan
      });
    } else {
      res.status(404).json({ message: 'Workout day not found' });
    }
  } catch (err) {
    console.error('Error adding member notes:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Get today's workout for a member
exports.getTodaysWorkout = async (req, res) => {
  try {
    const memberId = req.member._id;
    
    // Find the active workout plan for the member
    const workoutPlan = await WorkoutPlan.findOne({ 
      memberId, 
      active: true,
      endDate: { $gte: new Date() }
    });
    
    if (!workoutPlan) {
      return res.status(404).json({ message: 'No active workout plan found' });
    }
    
    // Get today's day of the week
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const today = days[new Date().getDay()];
    
    // Find today's workout
    const todaysWorkout = workoutPlan.dailyWorkouts.find(workout => workout.day === today);
    
    if (!todaysWorkout) {
      return res.status(404).json({ 
        message: 'No workout scheduled for today',
        restDay: true
      });
    }
    
    // Get a motivational quote based on consistency
    const motivationalQuote = getMotivationalQuote(workoutPlan.consistency);
    
    res.status(200).json({
      workoutPlan: workoutPlan._id,
      todaysWorkout,
      motivationalQuote
    });
  } catch (err) {
    console.error('Error getting today\'s workout:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}; 