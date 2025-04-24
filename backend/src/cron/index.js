const cron = require('node-cron');
const checkInactiveMembers = require('./inactivityCheck');
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

  // Process monthly revenue reports at midnight on the last day of each month
  // The "28-31" pattern will run on days 28,29,30,31 of each month,
  // but our function checks if it's the actual last day
  cron.schedule('0 0 28-31 * *', () => {
    console.log('Checking for monthly revenue reports...');
    processMonthlyReports();
  });

  console.log('Cron jobs scheduled successfully');
};

module.exports = setupCronJobs; 