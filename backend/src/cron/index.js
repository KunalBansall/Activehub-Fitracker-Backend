const cron = require('node-cron');
const checkInactiveMembers = require('./inactivityCheck');
const checkWorkoutEngagement = require('./workoutEngagement');

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
  
  // Weekly workout engagement check - Runs every Sunday at 10 PM
  cron.schedule('0 22 * * 0', async () => {
    console.log('Running weekly workout engagement check...');
    try {
      await checkWorkoutEngagement();
    } catch (error) {
      console.error('Error in workout engagement check cron job:', error);
    }
  });
  
  // TEST MODE: Run the workout engagement check immediately for testing
  // Set this to true to test the feature without waiting for Sunday
  const testMode = false; // Set to false for production - only run on Sundays
  
  if (testMode) {
    console.log('🧪 TEST MODE: Running workout engagement check immediately for testing...');
    setTimeout(async () => {
      try {
        await checkWorkoutEngagement();
        console.log('✅ Test workout engagement check completed');
      } catch (error) {
        console.error('❌ Error in test workout engagement check:', error);
      }
    }, 5000); // Wait 5 seconds after server start
  }
  
  console.log('All cron jobs have been scheduled');
};

module.exports = setupCronJobs; 