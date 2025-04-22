const Member = require('../models/Member');
const emailService = require('./emailService');

/**
 * Service for handling member notifications
 */
class NotificationService {
  /**
   * Send inactivity notifications to members
   * @param {Array} inactiveMembers - Array of inactive member objects
   * @param {Object} gym - Gym object containing name and other details
   * @returns {Promise<Array>} - Array of results from notification sending
   */
  async sendInactivityNotifications(inactiveMembers, gym) {
    console.log(`Sending inactivity notifications to ${inactiveMembers.length} members`);
    
    const results = [];
    
    for (const member of inactiveMembers) {
      try {
        // Default message with personalization - more minimalist approach
        const message = `
          We've noticed you haven't visited ${gym.name} recently. We miss seeing you!
          
          Regular exercise is key to achieving your fitness goals, and we're here to support you every step of the way.
          
          Is there anything we can help with? Perhaps you'd like to schedule a session with one of our trainers or try a new class?
          
          Hope to see you back soon!
        `;
        
        // Send email notification using the emailService
        // Using a minimalist design with less vibrant colors
        const result = await emailService.sendInactivityNotification(
          member, 
          gym.name, 
          message, 
          null, 
          { 
            useMinimalistDesign: true, 
            gradientStart: '#4a5568', 
            gradientEnd: '#2d3748' 
          }
        );
        
        // Update the member's lastNotificationSent date
        await Member.findByIdAndUpdate(member._id, {
          $set: { lastNotificationSent: new Date() }
        });
        
        results.push({
          memberId: member._id,
          email: member.email,
          success: true,
          messageId: result.messageId
        });
        
        console.log(`Successfully sent inactivity notification to ${member.email}`);
        
      } catch (error) {
        console.error(`Failed to send inactivity notification to ${member.email}:`, error);
        
        results.push({
          memberId: member._id,
          email: member.email,
          success: false,
          error: error.message
        });
      }
    }
    
    return results;
  }
  
  /**
   * Send workout motivation emails to members with low engagement
   * @param {Array} members - Array of member objects
   * @param {Object} gym - Gym object containing name and other details
   * @returns {Promise<Array>} - Array of results from notification sending
   */
  async sendWorkoutMotivationEmails(members, gym) {
    console.log(`Sending workout motivation emails to ${members.length} members`);
    
    const results = [];
    
    for (const member of members) {
      try {
        // Send workout motivation email using the emailService
        // Using a more minimalist design with less vibrant colors
        const result = await emailService.sendWorkoutMotivationEmail(
          member, 
          gym.name, 
          null, 
          { 
            useMinimalistDesign: true, 
            gradientStart: '#4a5568', 
            gradientEnd: '#2d3748'
          }
        );
        
        // Update the member's lastNotificationSent date
        await Member.findByIdAndUpdate(member._id, {
          $set: { lastNotificationSent: new Date() }
        });
        
        results.push({
          memberId: member._id,
          email: member.email,
          success: true,
          messageId: result.messageId
        });
        
        console.log(`Successfully sent workout motivation email to ${member.email}`);
        
      } catch (error) {
        console.error(`Failed to send workout motivation email to ${member.email}:`, error);
        
        results.push({
          memberId: member._id,
          email: member.email,
          success: false,
          error: error.message
        });
      }
    }
    
    return results;
  }
  
  /**
   * Send weekly workout summary emails to members
   * @param {Array} memberData - Array of objects containing member and their workout stats
   * @param {Object} gym - Gym object containing name and other details
   * @returns {Promise<Array>} - Array of results from notification sending
   */
  async sendWorkoutSummaryEmails(memberData, gym) {
    console.log(`Sending workout summary emails to ${memberData.length} members`);
    
    const results = [];
    
    for (const data of memberData) {
      const { member, workoutStats } = data;
      
      try {
        // Send workout summary email using the emailService
        // Using a minimalist design with less vibrant colors
        const result = await emailService.sendWorkoutSummaryEmail(
          member, 
          gym.name, 
          workoutStats, 
          null, 
          { 
            useMinimalistDesign: true,
            // Override the default colorful gradients with minimalist colors
            highGradientStart: '#4a5568',
            highGradientEnd: '#2d3748',
            mediumGradientStart: '#718096',
            mediumGradientEnd: '#4a5568',
            lowGradientStart: '#a0aec0',
            lowGradientEnd: '#718096'
          }
        );
        
        results.push({
          memberId: member._id,
          email: member.email,
          success: true,
          messageId: result.messageId
        });
        
        console.log(`Successfully sent workout summary email to ${member.email}`);
        
      } catch (error) {
        console.error(`Failed to send workout summary email to ${member.email}:`, error);
        
        results.push({
          memberId: member._id,
          email: member.email,
          success: false,
          error: error.message
        });
      }
    }
    
    return results;
  }
}

module.exports = new NotificationService(); 