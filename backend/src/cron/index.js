const cron = require('node-cron');
const checkInactiveMembers = require('./inactivityCheck');
const checkSubscriptionStatuses = require('./subscriptionStatusCheck');
const { setupMonthlyRevenueJob } = require('./monthlyRevenueJob');
const { processMonthlyReports, isLastDayOfMonth, isFirstDayOfMonth } = require('../services/monthlyRevenueService');
const { sendWeeklyWorkoutSummaryEmails, sendWorkoutMotivationEmails } = require('../services/workoutEmailService');

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

/**
 * Setup all cron jobs for the application
 */
const setupCronJobs = () => {
  // Check for inactive members daily at 9 AM
  cron.schedule('0 9 * * *', () => {
    console.log('Running scheduled inactive members check...');
    checkInactiveMembers();
  });

  // Run a daily check at 8:00 PM to see if it's the last day of the month
  // This approach is more reliable than the previous 28-31 pattern
  cron.schedule('0 20 * * *', async () => {
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
  cron.schedule('30 23 * * *', () => {
    console.log('Running backup check for monthly reports...');
    if (isLastDayOfMonth()) {
      console.log('✅ Today is the last day of the month. Running backup monthly reports...');
      processMonthlyReports();
    } else {
      console.log('❌ Today is not the last day of the month. Skipping backup monthly reports.');
    }
  });
  
  // Send workout summary emails every Sunday at 9:00 AM
  cron.schedule('0 9 * * 0', async () => {
    console.log('🏃‍♂️ Starting Sunday workout summary emails...');
    try {
      const successCount = await sendWeeklyWorkoutSummaryEmails();
      console.log(`✅ Workout summary emails completed. Sent ${successCount} emails.`);
    } catch (error) {
      console.error('❌ Error sending workout summary emails:', error);
    }
  });
  
  // Send workout motivation emails every Sunday at 6:00 PM
  // This is sent later in the day to members with low engagement
  cron.schedule('0 18 * * 0', async () => {
    console.log('💪 Starting Sunday workout motivation emails for low-engagement members...');
    try {
      const successCount = await sendWorkoutMotivationEmails();
      console.log(`✅ Workout motivation emails completed. Sent ${successCount} emails.`);
    } catch (error) {
      console.error('❌ Error sending workout motivation emails:', error);
    }
  });

  // Check subscription statuses daily at midnight
  cron.schedule('0 0 * * *', () => {
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