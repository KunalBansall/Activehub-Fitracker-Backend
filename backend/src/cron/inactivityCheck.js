const Member = require('../models/Member');
const Admin = require('../models/Admin');
const GymSettings = require('../models/GymSettings');
const { sendInactivityNotification } = require('../services/emailService');

/**
 * Helper function to calculate threshold date excluding Sundays
 * @param {number} days - Number of days to go back
 * @returns {Date} - Date threshold excluding Sundays
 */
const calculateThresholdExcludingSundays = (days) => {
  const result = new Date();
  let daysToGoBack = days;
  
  while (daysToGoBack > 0) {
    result.setDate(result.getDate() - 1);
    // Skip counting Sundays (0 = Sunday in JavaScript's getDay())
    if (result.getDay() !== 0) {
      daysToGoBack--;
    }
  }
  
  return result;
};

/**
 * Cron job to check for inactive members and send notifications
 * Runs daily to find members who haven't visited in the configured timeframe
 * Skips processing on Sundays and excludes Sundays from inactivity calculations
 */
const checkInactiveMembers = async () => {
  try {
    console.log('Starting inactive members check...');
    
    // Skip processing on Sundays
    const today = new Date();
    if (today.getDay() === 0) { // 0 = Sunday
      console.log('Today is Sunday. Skipping inactivity check and notifications.');
      return;
    }
    
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
      
      // Calculate threshold dates, excluding Sundays
      const inactivityDate = calculateThresholdExcludingSundays(inactivityThreshold);
      const cooldownDate = calculateThresholdExcludingSundays(notificationCooldown);
      
      console.log(`Checking for members who haven't visited since: ${inactivityDate.toISOString()} (excluding Sundays)`);
      
      // Find inactive members with no recent notifications
      const inactiveMembers = await Member.find({
        gymId: gymId,
        status: 'active', // Only check active members
        $and: [
          {
            $or: [
              { lastVisit: { $lt: inactivityDate } },
              { lastVisit: null }
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
      
      // Send notifications to each inactive member
      let successCount = 0;
      let errorCount = 0;
      
      for (const member of inactiveMembers) {
        try {
          await sendInactivityNotification(member, gymName, customMessage, senderEmail);
          
          // Update the lastNotificationSent timestamp
          member.lastNotificationSent = new Date();
          await member.save();
          
          successCount++;
          console.log(`Successfully sent notification to ${member.name} (${member.email}) from ${senderEmail}`);
        } catch (error) {
          errorCount++;
          console.error(`Failed to send notification to ${member.name} (${member.email}):`, error.message);
        }
      }
      
      console.log(`Completed sending notifications for gym ${gymName}: ${successCount} success, ${errorCount} errors`);
    }
    
    console.log('Inactive members check completed');
  } catch (error) {
    console.error('Error in inactive members check job:', error);
  }
};

module.exports = checkInactiveMembers; 