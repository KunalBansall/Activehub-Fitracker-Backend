const GymSettings = require("../models/GymSettings");
const checkInactiveMembers = require("../cron/inactivityCheck");

// Get gym settings
exports.getGymSettings = async (req, res) => {
  try {
    const adminId = req.admin._id;
    
    let settings = await GymSettings.findOne({ gymId: adminId });
    
    // If settings don't exist yet, create default settings
    if (!settings) {
      settings = await GymSettings.create({
        gymId: adminId,
        smartInactivityAlerts: false,
        inactivityThresholdDays: 2,
        notificationCooldownDays: 3,
        customInactivityMessage: "Hey {{name}}! We've missed you at the gym. Let's get back on track 💪"
      });
    }
    
    res.status(200).json(settings);
  } catch (error) {
    console.error("Error fetching gym settings:", error);
    res.status(500).json({ message: "Failed to fetch gym settings" });
  }
};

// Update gym settings
exports.updateGymSettings = async (req, res) => {
  try {
    const adminId = req.admin._id;
    const { 
      smartInactivityAlerts, 
      inactivityThresholdDays, 
      notificationCooldownDays,
      customInactivityMessage
    } = req.body;
    
    // Validate input
    if (inactivityThresholdDays && (inactivityThresholdDays < 1 || inactivityThresholdDays > 14)) {
      return res.status(400).json({ 
        message: "Inactivity threshold must be between 1 and 14 days" 
      });
    }
    
    if (notificationCooldownDays && (notificationCooldownDays < 1 || notificationCooldownDays > 14)) {
      return res.status(400).json({ 
        message: "Notification cooldown must be between 1 and 14 days" 
      });
    }
    
    // Get previous settings to check if smartInactivityAlerts was just enabled
    const previousSettings = await GymSettings.findOne({ gymId: adminId });
    const wasEnabled = previousSettings?.smartInactivityAlerts || false;
    
    // Update or create settings
    const settings = await GymSettings.findOneAndUpdate(
      { gymId: adminId },
      { 
        $set: {
          smartInactivityAlerts: smartInactivityAlerts !== undefined ? smartInactivityAlerts : undefined,
          inactivityThresholdDays: inactivityThresholdDays !== undefined ? inactivityThresholdDays : undefined,
          notificationCooldownDays: notificationCooldownDays !== undefined ? notificationCooldownDays : undefined,
          customInactivityMessage: customInactivityMessage !== undefined ? customInactivityMessage : undefined
        }
      },
      { new: true, upsert: true, omitUndefined: true }
    );
    
    // Create admin log for the settings change
    const AdminLog = require("../models/AdminLog");
    await AdminLog.create({
      adminId,
      action: "update-settings",
      details: {
        smartInactivityAlerts: settings.smartInactivityAlerts,
        inactivityThresholdDays: settings.inactivityThresholdDays,
        notificationCooldownDays: settings.notificationCooldownDays
      },
      ipAddress: req.ip,
      deviceInfo: req.headers["user-agent"],
      timestamp: new Date()
    });
    
    // If inactivity alerts were just enabled, run the check immediately
    if (settings.smartInactivityAlerts && !wasEnabled) {
      // Run the check in the background to avoid slowing down the response
      setTimeout(async () => {
        try {
          console.log("Running immediate inactive members check after enabling feature...");
          await checkInactiveMembers();
          console.log("Immediate inactive members check completed");
        } catch (error) {
          console.error("Error running immediate inactive members check:", error);
        }
      }, 0);
    }
    
    res.status(200).json({
      ...settings.toObject(),
      message: settings.smartInactivityAlerts && !wasEnabled 
        ? "Settings updated successfully. Notifications will be sent to inactive members immediately." 
        : "Settings updated successfully"
    });
  } catch (error) {
    console.error("Error updating gym settings:", error);
    res.status(500).json({ message: "Failed to update gym settings" });
  }
}; 