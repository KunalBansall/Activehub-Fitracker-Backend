const Member = require('../models/Member');
const Admin = require('../models/Admin');
const WorkoutPlan = require('../models/WorkoutPlan');
const Attendance = require('../models/Attendance');
const { sendWorkoutMotivationEmail, sendWorkoutSummaryEmail } = require('./emailService');

/**
 * Calculate the current streak for a member based on their attendance records
 * @param {ObjectId} memberId - Member ID
 * @returns {Promise<number>} Current streak count
 */
const calculateMemberStreak = async (memberId) => {
  try {
    // Get all attendance records for the member, sorted by entry time (descending)
    const attendanceRecords = await Attendance.find({ memberId })
      .sort({ entryTime: -1 })
      .exec();
    
    if (!attendanceRecords || attendanceRecords.length === 0) {
      return 0; // No attendance records found
    }
    
    // Check if there's an attendance record for today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayAttendance = attendanceRecords.find(record => {
      const recordDate = new Date(record.entryTime);
      recordDate.setHours(0, 0, 0, 0);
      return recordDate.getTime() === today.getTime();
    });
    
    // Initialize streak calculation
    let streak = todayAttendance ? 1 : 0;
    let checkDate = new Date(today);
    
    if (!todayAttendance) {
      checkDate.setDate(checkDate.getDate() - 1);
    }
    
    // Check consecutive days backwards
    while (true) {
      // Look for attendance on this date
      const dateAttendance = attendanceRecords.find(record => {
        const recordDate = new Date(record.entryTime);
        recordDate.setHours(0, 0, 0, 0);
        return recordDate.getTime() === checkDate.getTime();
      });
      
      // If no attendance on this date, break the streak
      if (!dateAttendance) break;
      
      // Move to the previous day
      checkDate.setDate(checkDate.getDate() - 1);
      
      // If we found attendance for this day, increment streak
      if (dateAttendance) streak++;
    }
    
    // Adjust streak if we didn't have attendance today
    if (!todayAttendance && streak > 0) streak--;
    
    return streak;
  } catch (error) {
    console.error('Error calculating member streak:', error);
    return 0;
  }
};

/**
 * Calculate the monthly visits for a member based on their attendance records
 * @param {ObjectId} memberId - Member ID
 * @returns {Promise<number>} Monthly visits count
 */
const calculateMonthlyVisits = async (memberId) => {
  try {
    // Get the current month's start and end dates
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
    
    // Count attendance records for the current month
    const monthlyAttendance = await Attendance.countDocuments({
      memberId,
      entryTime: {
        $gte: firstDayOfMonth,
        $lte: lastDayOfMonth
      }
    });
    
    return monthlyAttendance;
  } catch (error) {
    console.error('Error calculating monthly visits:', error);
    return 0;
  }
};

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
        daysRemaining: 0,
        monthlyVisits: 0,
        improvementAreas: ['Start your fitness journey']
      };
    }

    // Initialize counters
    let completedWorkouts = 0;
    let totalWorkouts = 0;
    let streakCount = 0;
    let caloriesBurned = 0;
    let minutesWorkedOut = 0;
    let daysRemaining = 0;
    
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
      // Use the actual completedWorkouts from the workout plan if available
      if (typeof plan.completedWorkouts === 'number') {
        completedWorkouts = plan.completedWorkouts;
      }
      
      // Use the actual consistency from the workout plan if available
      if (typeof plan.consistency === 'number') {
        // We'll use this later to calculate the completion rate
      }
      
      // Calculate days remaining in the workout plan
      if (plan.dailyWorkouts && plan.dailyWorkouts.length > 0) {
        // Count total workouts from dailyWorkouts
        totalWorkouts = plan.dailyWorkouts.length;
        
        // Count remaining days (not completed workouts)
        let remainingDays = 0;
        for (const workout of plan.dailyWorkouts) {
          if (!workout.completed) {
            remainingDays++;
          }
        }
        daysRemaining = remainingDays;
        
        // Process each daily workout
        for (const workout of plan.dailyWorkouts) {
          // Track focus areas
          if (workout.focus) {
            focusAreasCount[workout.focus] = (focusAreasCount[workout.focus] || 0) + 1;
          }
          
          // Track day completion for determining strongest day
          if (workout.completed) {
            dayCompletionCount[workout.day]++;
            
            // Estimate calories and time
            // Assume average workout burns 300 calories and takes 45 minutes
            caloriesBurned += 300;
            minutesWorkedOut += 45;
          }
        }
      } else if (plan.days && plan.days.length > 0) {
        // Fallback to the old days array if dailyWorkouts is not available
        totalWorkouts = plan.days.length;
        
        // Count remaining days
        let remainingDays = 0;
        for (const day of plan.days) {
          if (!day.completed) {
            remainingDays++;
          }
        }
        daysRemaining = remainingDays;
        
        // Process each day
        for (const day of plan.days) {
          if (day.completed) {
            // Only increment if we didn't get the value from plan.completedWorkouts
            if (typeof plan.completedWorkouts !== 'number') {
              completedWorkouts++;
            }
            
            dayCompletionCount[day.day]++;
            
            // Track focus areas
            if (day.focus) {
              focusAreasCount[day.focus] = (focusAreasCount[day.focus] || 0) + 1;
            }
            
            // Estimate calories and time
            caloriesBurned += 300;
            minutesWorkedOut += 45;
          }
        }
      }
      
      // Get the current streak directly from the plan
      // This ensures we use the same streak value that's shown on the dashboard
      if (plan.currentStreak !== undefined && plan.currentStreak !== null) {
        streakCount = plan.currentStreak;
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
    
    // Get monthly visits directly from the most recent workout plan
    // This ensures we use the same monthly visits value that's shown on the dashboard
    let monthlyVisits = 0;
    
    // Find the most recent workout plan
    if (workoutPlans.length > 0) {
      // Sort plans by endDate (most recent first)
      const sortedPlans = [...workoutPlans].sort((a, b) => 
        new Date(b.endDate) - new Date(a.endDate)
      );
      
      const mostRecentPlan = sortedPlans[0];
      
      // Check if the plan has a monthlyVisits property
      if (mostRecentPlan.monthlyVisits !== undefined && mostRecentPlan.monthlyVisits !== null) {
        monthlyVisits = mostRecentPlan.monthlyVisits;
      } else {
        // Fallback: count completed workouts in the current month
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();
        
        if (mostRecentPlan.dailyWorkouts && mostRecentPlan.dailyWorkouts.length > 0) {
          for (const workout of mostRecentPlan.dailyWorkouts) {
            if (workout.completed) {
              monthlyVisits++;
            }
          }
        }
      }
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
      daysRemaining,
      monthlyVisits,
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
      daysRemaining: 0,
      monthlyVisits: 0,
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
        
        // Calculate streak and monthly visits based on attendance records
        // This ensures the values match what's shown on the dashboard
        try {
          // Calculate current streak from attendance records
          const attendanceStreak = await calculateMemberStreak(member._id);
          workoutStats.streakCount = attendanceStreak;
          
          // Calculate monthly visits from attendance records
          const monthlyVisitsCount = await calculateMonthlyVisits(member._id);
          workoutStats.monthlyVisits = monthlyVisitsCount;
          
          console.log(`📊 Using attendance-based values - Streak: ${workoutStats.streakCount}, Monthly Visits: ${workoutStats.monthlyVisits}`);
        } catch (error) {
          console.error(`❌ Error calculating attendance-based stats for ${member.email}:`, error);
          
          // Fallback to plan values if attendance calculation fails
          const latestPlan = await WorkoutPlan.findOne({ 
            memberId: member._id,
            active: true
          }).sort({ endDate: -1 });
          
          if (latestPlan) {
            // Override the streak count and monthly visits with the values from the latest plan
            if (latestPlan.currentStreak !== undefined && latestPlan.currentStreak !== null) {
              workoutStats.streakCount = latestPlan.currentStreak;
            }
            
            if (latestPlan.monthlyVisits !== undefined && latestPlan.monthlyVisits !== null) {
              workoutStats.monthlyVisits = latestPlan.monthlyVisits;
            } else if (member.monthlyVisits !== undefined && member.monthlyVisits !== null) {
              // If the plan doesn't have monthly visits, try to get it from the member
              workoutStats.monthlyVisits = member.monthlyVisits;
            }
            
            console.log(`⚠️ Fallback to plan values - Streak: ${workoutStats.streakCount}, Monthly Visits: ${workoutStats.monthlyVisits}`);
          }
        }
        
        // Log the final values being used in the email
        console.log(`📊 Final values for email - Streak: ${workoutStats.streakCount}, Monthly Visits: ${workoutStats.monthlyVisits}`);
        
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
 * Reset workout progress for all active workout plans
 * This function resets the exercise completion status for all exercises in active workout plans
 * It should be called after sending the weekly summary emails
 * @returns {Promise<number>} Number of workout plans reset
 */
const resetWeeklyWorkoutProgress = async () => {
  try {
    console.log('🔄 Starting weekly workout progress reset...');
    
    // Find all active workout plans
    const activePlans = await WorkoutPlan.find({
      active: true,
      endDate: { $gte: new Date() }
    });
    
    console.log(`📋 Found ${activePlans.length} active workout plans to reset`);
    
    let resetCount = 0;
    const failedResets = [];
    
    // Process each workout plan
    for (const plan of activePlans) {
      try {
        console.log(`🔄 Resetting workout plan: ${plan.name} for member ${plan.memberId}`);
        
        // Store the previous week's progress data for historical tracking
        const previousWeekData = {
          weekEndingDate: new Date(),
          completedWorkouts: plan.completedWorkouts,
          missedWorkouts: plan.missedWorkouts,
          consistency: plan.consistency,
          dailyWorkouts: JSON.parse(JSON.stringify(plan.dailyWorkouts)) // Deep copy
        };
        
        // Add to history if it doesn't exist
        if (!plan.weeklyHistory) {
          plan.weeklyHistory = [];
        }
        
        // Add the current week's data to history
        plan.weeklyHistory.push(previousWeekData);
        
        // Limit history to last 12 weeks
        if (plan.weeklyHistory.length > 12) {
          plan.weeklyHistory = plan.weeklyHistory.slice(-12);
        }
        
        // Reset exercise completion status for all exercises
        let exercisesReset = 0;
        
        for (const dailyWorkout of plan.dailyWorkouts) {
          // Reset the daily workout completion status
          dailyWorkout.completed = false;
          
          // Reset each exercise in the daily workout
          for (const exercise of dailyWorkout.exercises) {
            if (exercise.completed !== 'pending') {
              exercise.completed = 'pending';
              exercisesReset++;
            }
          }
        }
        
        // Reset the overall statistics
        plan.completedWorkouts = 0;
        plan.missedWorkouts = 0;
        plan.consistency = 0;
        
        // Save the updated workout plan
        await plan.save();
        
        console.log(`✅ Reset ${exercisesReset} exercises in workout plan for member ${plan.memberId}`);
        resetCount++;
      } catch (planError) {
        console.error(`❌ Error resetting workout plan ${plan._id}:`, planError);
        failedResets.push(plan._id);
      }
    }
    
    console.log(`✅ Weekly workout progress reset completed. Successfully reset ${resetCount} of ${activePlans.length} plans.`);
    
    if (failedResets.length > 0) {
      console.log('⚠️ Failed to reset the following workout plans:');
      failedResets.forEach((planId, index) => {
        console.log(`  ${index + 1}. ${planId}`);
      });
    }
    
    return resetCount;
  } catch (error) {
    console.error('❌ Error resetting weekly workout progress:', error);
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
  sendWorkoutMotivationEmails,
  resetWeeklyWorkoutProgress
};
