const Member = require('../models/Member');
const Admin = require('../models/Admin');
const WorkoutPlan = require('../models/WorkoutPlan');
const { sendWorkoutMotivationEmail, sendWorkoutSummaryEmail } = require('./emailService');

/**
 * Calculate workout statistics for a member based on their workout plans
 * @param {ObjectId} memberId - Member ID
 * @param {Date} startDate - Start date for the period to analyze
 * @param {Date} endDate - End date for the period to analyze
 * @returns {Promise<Object>} Workout statistics
 */
const calculateWorkoutStats = async (memberId, startDate, endDate) => {
  try {
    // Get all workout plans for the member that were active during the period
    const workoutPlans = await WorkoutPlan.find({
      memberId,
      startDate: { $lte: endDate },
      endDate: { $gte: startDate }
    });

    if (!workoutPlans || workoutPlans.length === 0) {
      return {
        completedWorkouts: 0,
        totalWorkouts: 0,
        completionRate: 0,
        strongestDay: 'N/A',
        focusAreas: [],
        streakCount: 0,
        caloriesBurned: 0,
        minutesWorkedOut: 0,
        improvementAreas: ['Start your fitness journey']
      };
    }

    // Initialize counters
    let completedWorkouts = 0;
    let totalWorkouts = 0;
    let streakCount = 0;
    let caloriesBurned = 0;
    let minutesWorkedOut = 0;
    
    // Track focus areas
    const focusAreasCount = {};
    
    // Track day completion
    const dayCompletionCount = {
      'Monday': 0,
      'Tuesday': 0,
      'Wednesday': 0,
      'Thursday': 0,
      'Friday': 0,
      'Saturday': 0,
      'Sunday': 0
    };
    
    // Process each workout plan
    for (const plan of workoutPlans) {
      if (plan.days && plan.days.length > 0) {
        // Count total and completed workouts
        totalWorkouts += plan.days.length;
        
        for (const day of plan.days) {
          // Count completed days
          if (day.completed) {
            completedWorkouts++;
            dayCompletionCount[day.day]++;
            
            // Track focus areas
            if (day.focus) {
              focusAreasCount[day.focus] = (focusAreasCount[day.focus] || 0) + 1;
            }
            
            // Estimate calories and time
            // Assume average workout burns 300 calories and takes 45 minutes
            caloriesBurned += 300;
            minutesWorkedOut += 45;
            
            // Basic streak calculation (this is simplified)
            streakCount++;
          }
        }
      }
    }
    
    // Calculate completion rate
    const completionRate = totalWorkouts > 0 ? completedWorkouts / totalWorkouts : 0;
    
    // Determine strongest day
    let strongestDay = 'N/A';
    let maxCompletions = 0;
    
    for (const [day, count] of Object.entries(dayCompletionCount)) {
      if (count > maxCompletions) {
        maxCompletions = count;
        strongestDay = day;
      }
    }
    
    // Get top focus areas
    const focusAreas = Object.entries(focusAreasCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([area]) => area);
    
    // Determine improvement areas based on completion rate
    const improvementAreas = [];
    
    if (completionRate < 0.5) {
      improvementAreas.push('Consistency in workout schedule');
      improvementAreas.push('Setting achievable workout goals');
    } else if (completionRate < 0.8) {
      improvementAreas.push('Completing all planned workouts');
    }
    
    // Add variety suggestion if focus areas are limited
    if (focusAreas.length <= 1) {
      improvementAreas.push('Adding variety to workout routine');
    }
    
    // If no improvement areas were added, add a general one
    if (improvementAreas.length === 0) {
      improvementAreas.push('Maintaining your excellent progress');
    }
    
    return {
      completedWorkouts,
      totalWorkouts,
      completionRate,
      strongestDay,
      focusAreas,
      streakCount,
      caloriesBurned,
      minutesWorkedOut,
      improvementAreas
    };
  } catch (error) {
    console.error('Error calculating workout stats:', error);
    return {
      completedWorkouts: 0,
      totalWorkouts: 0,
      completionRate: 0,
      strongestDay: 'N/A',
      focusAreas: [],
      streakCount: 0,
      caloriesBurned: 0,
      minutesWorkedOut: 0,
      improvementAreas: ['Technical issues prevented analysis']
    };
  }
};

/**
 * Send workout summary emails to members with workout plans
 * @returns {Promise<number>} Number of emails sent
 */
const sendWeeklyWorkoutSummaryEmails = async () => {
  try {
    console.log('🏋️‍♂️ Starting weekly workout summary email process...');
    
    // Get current date and calculate the start of the week (last Sunday)
    const today = new Date();
    const endDate = today;
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 7); // One week ago
    
    console.log(`📅 Generating workout summaries for period: ${startDate.toDateString()} to ${endDate.toDateString()}`);
    
    // Find members who have workout plans
    // First, get all workout plans that were active during the period
    const workoutPlans = await WorkoutPlan.find({
      startDate: { $lte: endDate },
      endDate: { $gte: startDate }
    }).distinct('memberId');
    
    console.log(`💪 Found ${workoutPlans.length} members with active workout plans`);
    
    // Get all members with workout plans
    const members = await Member.find({ _id: { $in: workoutPlans } });
    console.log(`👥 Found ${members.length} members to process`);
    
    let successCount = 0;
    const failedMembers = [];
    
    // Process each member
    for (const member of members) {
      try {
        // Skip members without email
        if (!member.email) {
          console.log(`⚠️ Member ${member._id} has no email. Skipping.`);
          continue;
        }
        
        console.log(`🏃‍♂️ Processing workout summary for member: ${member.name} (${member.email})`);
        
        // Get the gym name for this member
        let gymName = 'Your Gym';
        try {
          const gym = await Admin.findById(member.gymId);
          if (gym && gym.gymName) {
            gymName = gym.gymName;
          }
        } catch (gymError) {
          console.error(`⚠️ Error fetching gym for member ${member._id}:`, gymError);
        }
        
        // Calculate workout stats for this member
        const workoutStats = await calculateWorkoutStats(member._id, startDate, endDate);
        
        // Send the email
        const emailSent = await sendWorkoutSummaryEmail(member, gymName, workoutStats);
        
        if (emailSent) {
          console.log(`✅ Workout summary email sent to ${member.email}`);
          successCount++;
        } else {
          console.error(`❌ Failed to send workout summary email to ${member.email}`);
          failedMembers.push(member.email);
        }
        
        // Add a delay to avoid overwhelming the email service
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (memberError) {
        console.error(`❌ Error processing member ${member._id}:`, memberError);
        failedMembers.push(member.email || member._id);
      }
    }
    
    console.log(`✅ Weekly workout summary emails completed. Successfully sent ${successCount} of ${members.length} emails.`);
    
    if (failedMembers.length > 0) {
      console.log('⚠️ Failed to send emails to the following members:');
      failedMembers.forEach((email, index) => {
        console.log(`  ${index + 1}. ${email}`);
      });
    }
    
    return successCount;
  } catch (error) {
    console.error('❌ Error sending weekly workout summary emails:', error);
    return 0;
  }
};

/**
 * Send workout motivation emails to members with low engagement
 * @returns {Promise<number>} Number of emails sent
 */
const sendWorkoutMotivationEmails = async () => {
  try {
    console.log('🔔 Starting workout motivation email process...');
    
    // Get current date and calculate the start of the week (last Sunday)
    const today = new Date();
    const endDate = today;
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 7); // One week ago
    
    console.log(`📅 Analyzing workout engagement for period: ${startDate.toDateString()} to ${endDate.toDateString()}`);
    
    // Find members who have workout plans
    // First, get all workout plans that were active during the period
    const workoutPlans = await WorkoutPlan.find({
      startDate: { $lte: endDate },
      endDate: { $gte: startDate }
    }).distinct('memberId');
    
    console.log(`💪 Found ${workoutPlans.length} members with active workout plans`);
    
    // Get all members with workout plans
    const members = await Member.find({ _id: { $in: workoutPlans } });
    console.log(`👥 Found ${members.length} members to process`);
    
    let successCount = 0;
    const failedMembers = [];
    
    // Process each member
    for (const member of members) {
      try {
        // Skip members without email
        if (!member.email) {
          console.log(`⚠️ Member ${member._id} has no email. Skipping.`);
          continue;
        }
        
        // Calculate workout stats for this member
        const workoutStats = await calculateWorkoutStats(member._id, startDate, endDate);
        
        // Only send motivation emails to members with low engagement (less than 50% completion)
        if (workoutStats.completionRate < 0.5) {
          console.log(`🏃‍♂️ Sending motivation email to low-engagement member: ${member.name} (${member.email})`);
          
          // Get the gym name for this member
          let gymName = 'Your Gym';
          try {
            const gym = await Admin.findById(member.gymId);
            if (gym && gym.gymName) {
              gymName = gym.gymName;
            }
          } catch (gymError) {
            console.error(`⚠️ Error fetching gym for member ${member._id}:`, gymError);
          }
          
          // Send the motivation email
          const emailSent = await sendWorkoutMotivationEmail(member, gymName);
          
          if (emailSent) {
            console.log(`✅ Workout motivation email sent to ${member.email}`);
            successCount++;
          } else {
            console.error(`❌ Failed to send workout motivation email to ${member.email}`);
            failedMembers.push(member.email);
          }
          
          // Add a delay to avoid overwhelming the email service
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          console.log(`🏆 Member ${member.name} has good engagement (${Math.round(workoutStats.completionRate * 100)}%). No motivation email needed.`);
        }
      } catch (memberError) {
        console.error(`❌ Error processing member ${member._id}:`, memberError);
        failedMembers.push(member.email || member._id);
      }
    }
    
    console.log(`✅ Workout motivation emails completed. Successfully sent ${successCount} emails to low-engagement members.`);
    
    if (failedMembers.length > 0) {
      console.log('⚠️ Failed to send emails to the following members:');
      failedMembers.forEach((email, index) => {
        console.log(`  ${index + 1}. ${email}`);
      });
    }
    
    return successCount;
  } catch (error) {
    console.error('❌ Error sending workout motivation emails:', error);
    return 0;
  }
};

module.exports = {
  calculateWorkoutStats,
  sendWeeklyWorkoutSummaryEmails,
  sendWorkoutMotivationEmails
};
