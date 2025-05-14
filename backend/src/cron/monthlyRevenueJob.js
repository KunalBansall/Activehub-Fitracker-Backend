const cron = require('node-cron');
const { processMonthlyReports, archiveCurrentMonthRevenue, initializeNewMonth, isFirstDayOfMonth } = require('../services/monthlyRevenueService');
const Admin = require('../models/Admin');

/**
 * Setup monthly revenue archiving and reporting cron job
 * Runs at 00:01 AM on the 1st day of each month
 */
const setupMonthlyRevenueJob = () => {
  console.log('🔄 Setting up monthly revenue archiving job...');

  // Monthly Revenue Processing - Run at 00:01 AM on the 1st day of each month
  // This will archive the previous month's data and initialize the new month
  cron.schedule('1 0 1 * *', async () => {
    try {
      console.log('🔄 Starting monthly revenue processing job');
      
      // Double-check it's the first day of the month
      if (!isFirstDayOfMonth()) {
        console.log('⚠️ Monthly revenue job triggered but it\'s not the first day of the month. Skipping.');
        return;
      }
      
      // Get all gym admins
      const admins = await Admin.find({ role: 'admin' });
      
      if (!admins || admins.length === 0) {
        console.log('⚠️ No gym admins found in the system for monthly revenue processing');
        return;
      }
      
      console.log(`🏋️ Found ${admins.length} gyms to process for monthly revenue archiving`);
      
      // Process each gym with a delay to avoid overwhelming the system
      for (const admin of admins) {
        try {
          // Archive the previous month's data
          console.log(`📊 Archiving revenue data for gym: ${admin.gymName || admin.email || admin._id}`);
          const archiveResult = await archiveCurrentMonthRevenue(admin._id, admin.email);
          
          if (archiveResult) {
            console.log(`✅ Successfully archived revenue data for ${admin.gymName || admin.email}`);
            
            // Initialize the new month
            const initResult = await initializeNewMonth(admin._id);
            
            if (initResult) {
              console.log(`🆕 Successfully initialized new month for ${admin.gymName || admin.email}`);
            } else {
              console.error(`❌ Failed to initialize new month for ${admin.gymName || admin.email}`);
            }
            
            // Generate and send monthly report email
            const reportResult = await processMonthlyReports();
            console.log(`📧 Monthly report processing completed with ${reportResult} successful reports`);
          } else {
            console.error(`❌ Failed to archive revenue data for ${admin.gymName || admin.email}`);
          }
          
          // Add a delay between processing each gym
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (gymError) {
          console.error(`🚨 Error processing gym ${admin.gymName || admin.email || admin._id}:`, gymError);
        }
      }
      
      console.log('✅ Monthly revenue processing job completed');
    } catch (error) {
      console.error('🚨 Error in monthly revenue processing job:', error);
    }
  }, {
    scheduled: true,
    timezone: "Asia/Kolkata" // Adjust timezone as needed
  });

  console.log('✅ Monthly revenue job has been set up');
};

module.exports = { setupMonthlyRevenueJob };
