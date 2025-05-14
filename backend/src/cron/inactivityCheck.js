const Member = require('../models/Member');
const Admin = require('../models/Admin');
const GymSettings = require('../models/GymSettings');
const notificationService = require('../services/notificationService');

/**
 * Helper function to calculate threshold date
 * @param {number} days - Number of days to go back
 * @returns {Date} - Date threshold
 */
const calculateThresholdDate = (days) => {
  const result = new Date();
  result.setDate(result.getDate() - days);
  return result;
};

/**
 * Cron job to check for inactive members and send notifications
 * Runs daily to find members who haven't visited in the configured timeframe
 */
const checkInactiveMembers = async () => {
  try {
    console.log('Starting inactive members check...');
    
    // Get all gyms with smartInactivityAlerts enabled
    const activeGymSettings = await GymSettings.find({ smartInactivityAlerts: true });
    
    if (activeGymSettings.length === 0) {
      console.log('No gyms have inactivity alerts enabled. Skipping check.');
      return;
    }
    
    // Process each gym with enabled alerts
    for (const gymSettings of activeGymSettings) {
      const gymId = gymSettings.gymId;
      
      // Get gym details for emails
      const gym = await Admin.findById(gymId);
      if (!gym) {
        console.log(`Gym with ID ${gymId} not found. Skipping.`);
        continue;
      }
      
      // Try to find the owner of this gym
      const ownerEmail = process.env.VITE_OWNER_EMAIL || process.env.OWNER_EMAIL;
      const gymOwner = await Admin.findOne({ 
        $or: [
          { email: ownerEmail },
          { role: 'owner' }
        ]
      });
      
      const senderEmail = gymOwner?.email || process.env.EMAIL_USER;
      const gymName = gym.gymName || 'Your Gym';
      const inactivityThreshold = gymSettings.inactivityThresholdDays || 2;
      const notificationCooldown = gymSettings.notificationCooldownDays || 3;
      const customMessage = gymSettings.customInactivityMessage || "Hey {{name}}! We've missed you at the gym. Let's get back on track 💪";
      
      // Calculate threshold dates
      const inactivityDate = calculateThresholdDate(inactivityThreshold);
      const cooldownDate = calculateThresholdDate(notificationCooldown);
      
      console.log(`Checking for members who haven't visited since: ${inactivityDate.toISOString()}`);
      
      // Find inactive members with no recent notifications
      // Check for both physical gym visits AND dashboard logins
      const inactiveMembers = await Member.find({
        gymId: gymId,
        status: 'active', // Only check active members
        $and: [
          {
            $or: [
              // Check if both lastVisit AND lastDashboardLogin are older than threshold
              { 
                $and: [
                  { lastVisit: { $lt: inactivityDate } },
                  { lastDashboardLogin: { $lt: inactivityDate } }
                ]
              },
              // Or if either is null
              { lastVisit: null },
              { lastDashboardLogin: null }
            ]
          },
          {
            $or: [
              { lastNotificationSent: null },
              { lastNotificationSent: { $lt: cooldownDate } }
            ]
          }
        ]
      });
      
      console.log(`Found ${inactiveMembers.length} inactive members for gym ${gymName}`);
      
      // For debugging, log each inactive member
      if (inactiveMembers.length > 0) {
        inactiveMembers.forEach(member => {
          console.log(`Inactive member: ${member.name}, Last visit: ${member.lastVisit ? member.lastVisit.toISOString() : 'Never'}, Last notification: ${member.lastNotificationSent ? member.lastNotificationSent.toISOString() : 'Never'}`);
        });
      }
      
      // Use the notification service to send emails to inactive members
      if (inactiveMembers.length > 0) {
        try {
          // Use notification service with custom message
          const results = await notificationService.sendInactivityNotifications(inactiveMembers, {
            name: gymName,
            customMessage
          });
          
          console.log(`Completed sending notifications for gym ${gymName}: ${results.filter(r => r.success).length} success, ${results.filter(r => !r.success).length} errors`);
        } catch (error) {
          console.error(`Error sending notifications for gym ${gymName}:`, error);
        }
      }
    }
    
    console.log('Inactive members check completed');
  } catch (error) {
    console.error('Error in inactive members check job:', error);
  }
};

module.exports = checkInactiveMembers; 