const cron = require('node-cron');
const checkInactiveMembers = require('./inactivityCheck');
const checkSubscriptionStatuses = require('./subscriptionStatusCheck');
const { processMonthlyReports } = require('../services/monthlyRevenueService');

/**
 * Setup all cron jobs for the application
 */
const setupCronJobs = () => {
  // Check for inactive members daily at 9 AM
  cron.schedule('0 9 * * *', () => {
    console.log('Running scheduled inactive members check...');
    checkInactiveMembers();
  });

  // Process monthly revenue reports at 8:00 PM on the last day of each month
  // The "28-31" pattern will run on days 28,29,30,31 of each month,
  // but our internal isLastDayOfMonth() function checks if it's actually the last day
  // This is a more reliable approach than trying to determine the last day in the cron pattern
  cron.schedule('0 20 28-31 * *', () => {
    console.log('Checking for monthly revenue reports...');
    processMonthlyReports();
  });

  // Also run reports at 11:30 PM on the last day as a backup in case the earlier job fails
  cron.schedule('30 23 28-31 * *', () => {
    console.log('Running backup monthly revenue report check...');
    processMonthlyReports();
  });

  // Check subscription statuses daily at midnight
  cron.schedule('0 0 * * *', () => {
    console.log('Running scheduled subscription status check...');
    checkSubscriptionStatuses();
  });

  console.log('Cron jobs scheduled successfully');
};

module.exports = setupCronJobs; 