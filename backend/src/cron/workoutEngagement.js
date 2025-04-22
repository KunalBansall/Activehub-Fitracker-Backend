const Member = require('../models/Member');
const Admin = require('../models/Admin');
const WorkoutPlan = require('../models/WorkoutPlan');
const notificationService = require('../services/notificationService');

/**
 * Helper function to reset weekly workout progress
 * Updates workout plans by marking exercises as 'pending' for the new week
 * @param {string} workoutPlanId - The ID of the workout plan to reset
 */
const resetWeeklyWorkoutProgress = async (workoutPlanId) => {
  try {
    const workoutPlan = await WorkoutPlan.findById(workoutPlanId);
    if (!workoutPlan) {
      console.log(`Workout plan ${workoutPlanId} not found.`);
      return;
    }
    
    // For each daily workout, reset the completed flag and exercise status
    for (const dailyWorkout of workoutPlan.dailyWorkouts) {
      dailyWorkout.completed = false;
      
      // Reset each exercise to pending
      for (const exercise of dailyWorkout.exercises) {
        exercise.completed = 'pending';
      }
    }
    
    // Save the updated workout plan
    await workoutPlan.save();
    console.log(`Reset weekly progress for workout plan: ${workoutPlan.name}`);
  } catch (error) {
    console.error(`Error resetting workout plan ${workoutPlanId}:`, error);
  }
};

/**
 * Cron job to check workout engagement and send motivational emails
 * Runs every Sunday night to review the week's progress
 * Sends motivational emails if engagement is below 40%
 * Sends weekly summary emails to all members with workout plans
 * This feature is automatically enabled for all gyms
 */
const checkWorkoutEngagement = async () => {
  try {
    // Verify it's Sunday before proceeding
    const today = new Date();
    const isSunday = today.getDay() === 0;
    
    console.log(`Starting weekly workout engagement check... [Day: ${today.toLocaleDateString('en-US', { weekday: 'long' })}]`);
    
    if (!isSunday) {
      console.log('Today is not Sunday. Skipping workout engagement check.');
      return;
    }
    
    // Get all active workout plans
    const activePlans = await WorkoutPlan.find({ active: true })
      .populate({
        path: 'memberId',
        select: 'name email status gymId',
        match: { status: 'active' } // Only consider active members
      });
    
    if (activePlans.length === 0) {
      console.log('No active workout plans found. Skipping check.');
      return;
    }
    
    console.log(`Found ${activePlans.length} active workout plans to process.`);
    
    // Keep track of statistics
    let motivationEmailsSent = 0;
    let summaryEmailsSent = 0;
    let plansReset = 0;
    
    // Group plans by gym for easier processing
    const plansByGym = {};
    
    for (const plan of activePlans) {
      // Skip if the member is not active or doesn't exist
      if (!plan.memberId) {
        console.log(`Skipping plan ${plan._id} - Member not found or not active.`);
        continue;
      }
      
      // Initialize gym grouping if needed
      if (!plansByGym[plan.gymId]) {
        plansByGym[plan.gymId] = [];
      }
      
      plansByGym[plan.gymId].push(plan);
    }
    
    // Process each gym
    for (const [gymId, gymPlans] of Object.entries(plansByGym)) {
      // Get gym details for emails
      const gym = await Admin.findById(gymId);
      if (!gym) {
        console.log(`Gym with ID ${gymId} not found. Skipping plans for this gym.`);
        continue;
      }
      
      const gymName = gym.gymName || 'Your Gym';
      console.log(`Processing ${gymPlans.length} plans for gym: ${gymName}`);
      
      // Prepare data for emails
      const lowEngagementMembers = [];
      const memberDataForSummaries = [];
      
      // Process each plan in this gym
      for (const plan of gymPlans) {
        const member = plan.memberId;
        const memberName = member.name;
        
        // Calculate engagement statistics
        const dailyWorkouts = plan.dailyWorkouts || [];
        const applicableWorkouts = dailyWorkouts.filter(workout => 
          ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].includes(workout.day)
        );
        
        if (applicableWorkouts.length === 0) {
          console.log(`No applicable workouts found for member ${memberName}. Skipping.`);
          continue;
        }
        
        const totalWorkouts = applicableWorkouts.length;
        const completedWorkouts = applicableWorkouts.filter(workout => workout.completed).length;
        const completionPercentage = Math.round((completedWorkouts / totalWorkouts) * 100);
        
        console.log(`Member: ${memberName}, Completion: ${completedWorkouts}/${totalWorkouts} (${completionPercentage}%)`);
        
        // Workout stats for emails
        const workoutStats = {
          totalWorkouts,
          completedWorkouts,
          completionPercentage
        };
        
        // If engagement is low, add to motivation email list
        if (completionPercentage < 40) {
          lowEngagementMembers.push(member);
        }
        
        // Add to summary email list
        memberDataForSummaries.push({
          member,
          workoutStats
        });
        
        // Reset workout progress for the new week
        try {
          await resetWeeklyWorkoutProgress(plan._id);
          plansReset++;
        } catch (error) {
          console.error(`Failed to reset workout progress for ${memberName}:`, error.message);
        }
      }
      
      // Send motivation emails to low engagement members using the notification service
      if (lowEngagementMembers.length > 0) {
        try {
          console.log(`Sending motivation emails to ${lowEngagementMembers.length} members with low engagement...`);
          const motivationResults = await notificationService.sendWorkoutMotivationEmails(lowEngagementMembers, {
            name: gymName
          });
          motivationEmailsSent += motivationResults.filter(r => r.success).length;
        } catch (error) {
          console.error(`Error sending motivation emails for gym ${gymName}:`, error);
        }
      }
      
      // Send summary emails to all members using the notification service
      if (memberDataForSummaries.length > 0) {
        try {
          console.log(`Sending workout summary emails to ${memberDataForSummaries.length} members...`);
          const summaryResults = await notificationService.sendWorkoutSummaryEmails(memberDataForSummaries, {
            name: gymName
          });
          summaryEmailsSent += summaryResults.filter(r => r.success).length;
        } catch (error) {
          console.error(`Error sending summary emails for gym ${gymName}:`, error);
        }
      }
    }
    
    console.log('Workout engagement check completed:');
    console.log(`- Motivation emails sent: ${motivationEmailsSent}`);
    console.log(`- Summary emails sent: ${summaryEmailsSent}`);
    console.log(`- Workout plans reset: ${plansReset}`);
    
  } catch (error) {
    console.error('Error in workout engagement check job:', error);
  }
};

module.exports = checkWorkoutEngagement; 