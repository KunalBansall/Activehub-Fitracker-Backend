const cron = require('node-cron');
const checkInactiveMembers = require('./inactivityCheck');
const checkSubscriptionStatuses = require('./subscriptionStatusCheck');
const { setupMonthlyRevenueJob } = require('./monthlyRevenueJob');
const { processMonthlyReports, isLastDayOfMonth, isFirstDayOfMonth } = require('../services/monthlyRevenueService');
const { sendWeeklyWorkoutSummaryEmails, sendWorkoutMotivationEmails, resetWeeklyWorkoutProgress } = require('../services/workoutEmailService');

const TZ = 'Asia/Kolkata'; // Delhi timezone
const schedule = (pattern, task) => cron.schedule(pattern, task, { timezone: TZ });

/**
 * Force run the monthly reports regardless of date
 * For testing or manual triggering
 */
const forceRunMonthlyReports = async () => {
  console.log('🔄 Manually triggering monthly revenue reports...');
  try {
    await processMonthlyReports(true); // Pass true to force run regardless of date
    console.log('✅ Manual monthly reports completed successfully');
    return true;
  } catch (error) {
    console.error('❌ Error running manual monthly reports:', error);
    return false;
  }
};

// Test function removed - functionality now runs automatically via cron job every Sunday

/**
 * Setup all cron jobs for the application
 */
const setupCronJobs = () => {
  // Check for inactive members daily at 9 AM
  schedule('0 9 * * *', () => {
    console.log('Running scheduled inactive members check...');
    checkInactiveMembers();
  });

  // Run a daily check at 8:00 PM to see if it's the last day of the month
  // This approach is more reliable than the previous 28-31 pattern
  schedule('0 20 * * *', async () => {
    console.log('Checking if today is the last day of the month...');
    if (isLastDayOfMonth()) {
      console.log('✅ Today is the last day of the month. Running monthly reports...');
      try {
        const successCount = await processMonthlyReports();
        console.log(`✅ Monthly reports completed. Successfully sent to ${successCount} gyms.`);
      } catch (error) {
        console.error('❌ Error running monthly reports:', error);
      }
    } else {
      console.log('❌ Today is not the last day of the month. Skipping monthly reports.');
    }
  });

  // Also run a backup check at 11:30 PM every day
  // This ensures we don't miss the last day due to any timezone or date calculation issues
  schedule('30 23 * * *', () => {
    console.log('Running backup check for monthly reports...');
    if (isLastDayOfMonth()) {
      console.log('✅ Today is the last day of the month. Running backup monthly reports...');
      processMonthlyReports();
    } else {
      console.log('❌ Today is not the last day of the month. Skipping backup monthly reports.');
    }
  });
  
  // Send workout summary emails every Sunday at 9:00 AM and then reset workout progress
  schedule('0 9 * * 0', async () => {
    console.log('🏃‍♂️ Starting Sunday workout summary emails and progress reset...');
    try {
      // First, send the weekly summary emails
      const emailCount = await sendWeeklyWorkoutSummaryEmails();
      console.log(`✅ Workout summary emails completed. Sent ${emailCount} emails.`);
      
      // Then, reset the workout progress for the new week
      const resetCount = await resetWeeklyWorkoutProgress();
      console.log(`✅ Workout progress reset completed. Reset ${resetCount} workout plans.`);
    } catch (error) {
      console.error('❌ Error in Sunday workout process:', error);
    }
  });
  
  // Send workout motivation emails every Sunday at 6:00 PM
  // This is sent later in the day to members with low engagement
  schedule('0 18 * * 0', async () => {
    console.log('💪 Starting Sunday workout motivation emails for low-engagement members...');
    try {
      const successCount = await sendWorkoutMotivationEmails();
      console.log(`✅ Workout motivation emails completed. Sent ${successCount} emails.`);
    } catch (error) {
      console.error('❌ Error sending workout motivation emails:', error);
    }
  });

  // Check subscription statuses daily at midnight
  schedule('0 0 * * *', () => {
    console.log('Running scheduled subscription status check...');
    checkSubscriptionStatuses();
  });

  // Setup monthly revenue archiving job (runs on 1st day of each month)
  setupMonthlyRevenueJob();

  console.log('Cron jobs scheduled successfully');
};

module.exports = {
  setupCronJobs,
  forceRunMonthlyReports
}; 