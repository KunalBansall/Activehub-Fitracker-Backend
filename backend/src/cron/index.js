const cron = require('node-cron');
const checkInactiveMembers = require('./inactivityCheck');

/**
 * Setup all cron jobs for the application
 */
const setupCronJobs = () => {
  // Daily inactive members check - Runs every day at 9 AM
  cron.schedule('0 9 * * *', async () => {
    console.log('Running daily inactive members check...');
    try {
      await checkInactiveMembers();
    } catch (error) {
      console.error('Error in inactive members check cron job:', error);
    }
  });
  
  console.log('All cron jobs have been scheduled');
};

module.exports = setupCronJobs; 