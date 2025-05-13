const DeveloperAnnouncement = require('../models/DeveloperAnnouncement');
const Admin = require('../models/Admin');
const emailService = require('../services/emailService');

/**
 * Create a new developer announcement
 * @route POST /api/owner/announcements
 * @access Owner only
 */
exports.createAnnouncement = async (req, res) => {
  try {
    const { title, message, type, sendEmail, mediaUrl, mediaType, targetAudience } = req.body;
    
    // Create the announcement
    const announcement = new DeveloperAnnouncement({
      title,
      message,
      type: type || 'info',
      mediaUrl: mediaUrl || null,
      mediaType: mediaType || null,
      targetAudience: targetAudience || 'all'
    });
    
    await announcement.save();
    
    // If sendEmail is true, send email notification to targeted admins
    if (sendEmail) {
      // Build query based on targetAudience
      let query = {};
      
      if (targetAudience === 'trial') {
        query = { 
          subscriptionStatus: 'trial',
          subscriptionEndDate: { $gte: new Date() }
        };
      } else if (targetAudience === 'active') {
        query = { 
          subscriptionStatus: 'active',
          subscriptionEndDate: { $gte: new Date() }
        };
      } else if (targetAudience === 'expired') {
        query = { 
          $or: [
            { subscriptionEndDate: { $lt: new Date() } },
            { subscriptionStatus: 'cancelled',
             subscriptionStatus: 'expired',

             }
          ]
        };
      }
      // For 'all', we don't need to add any filters to the query
      
      // Get targeted admin emails
      const admins = await Admin.find(query, 'email gymName').lean();
      
      // Prepare media HTML if available
      let mediaHtml = '';
      if (mediaUrl) {
        if (mediaType === 'image') {
          mediaHtml = `<img src="${mediaUrl}" alt="Announcement image" style="max-width: 100%; margin: 10px 0; border-radius: 4px;" />`;
        } else if (mediaType === 'video') {
          mediaHtml = `<video controls style="max-width: 100%; margin: 10px 0; border-radius: 4px;"><source src="${mediaUrl}" type="video/mp4">Your browser does not support the video tag.</video>`;
        }
      }
      
      // Send email to each admin
      for (const admin of admins) {
        try {
          await emailService.sendEmail(
            admin.email,
            `📢 New Message from ActiveHub Developer: ${title}`,
            `
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
              </head>
              <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f9fafb;">
                <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); margin-top: 20px; margin-bottom: 20px;">
                  <!-- Header -->
                  <div style="background: linear-gradient(90deg, #4f46e5 0%, #7c3aed 100%); padding: 20px; text-align: center;">
                    <h1 style="color: white; margin: 0; font-size: 24px;">ActiveHub FitTracker</h1>
                    <p style="color: rgba(255, 255, 255, 0.9); margin: 5px 0 0 0; font-size: 16px;">Developer Announcement</p>
                  </div>
                  
                  <!-- Content -->
                  <div style="padding: 30px 25px;">
                    <div style="background-color: ${type === 'info' ? '#eff6ff' : type === 'warning' ? '#fffbeb' : '#f0fdf4'}; border-left: 4px solid ${type === 'info' ? '#3b82f6' : type === 'warning' ? '#f59e0b' : '#10b981'}; padding: 15px; margin-bottom: 20px; border-radius: 0 4px 4px 0;">
                      <h2 style="color: #1f2937; margin-top: 0; margin-bottom: 10px; font-size: 20px;">${title}</h2>
                      <p style="color: #4b5563; line-height: 1.6; margin: 0; white-space: pre-line;">${message}</p>
                    </div>
                    
                    ${mediaHtml ? `<div style="margin: 25px 0; text-align: center;">${mediaHtml}</div>` : ''}
                    
                    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                      <p style="color: #6b7280; font-size: 14px; margin: 0;">To view all announcements and updates, please visit your admin dashboard.</p>
                    </div>
                  </div>
                  
                  <!-- Footer -->
                  <div style="background-color: #f3f4f6; padding: 15px; text-align: center;">
                    <p style="color: #6b7280; font-size: 12px; margin: 0;">
                      &copy; ${new Date().getFullYear()} ActiveHub FitTracker. All rights reserved.
                    </p>
                    <p style="color: #6b7280; font-size: 12px; margin: 5px 0 0 0;">
                      This is an automated message. Please do not reply to this email.
                    </p>
                  </div>
                </div>
              </body>
              </html>
            `
          );
        } catch (emailError) {
          console.error(`Failed to send email to ${admin.email}:`, emailError);
          // Continue with other emails even if one fails
        }
      }
    }
    
    res.status(201).json({ 
      success: true, 
      announcement,
      message: 'Announcement created successfully' + (sendEmail ? ' and emails sent to all admins' : '')
    });
  } catch (error) {
    console.error('Error creating developer announcement:', error);
    res.status(500).json({ success: false, message: 'Error creating announcement' });
  }
};

/**
 * Get all developer announcements
 * @route GET /api/owner/announcements
 * @access Owner only
 */
exports.getOwnerAnnouncements = async (req, res) => {
  try {
    const announcements = await DeveloperAnnouncement.find()
      .sort({ createdAt: -1 })
      .lean();
    
    res.status(200).json(announcements);
  } catch (error) {
    console.error('Error fetching developer announcements:', error);
    res.status(500).json({ success: false, message: 'Error fetching announcements' });
  }
};

/**
 * Update a developer announcement
 * @route PUT /api/owner/announcements/:id
 * @access Owner only
 */
exports.updateAnnouncement = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, message, type, visible, mediaUrl, mediaType, targetAudience } = req.body;
    
    const announcement = await DeveloperAnnouncement.findByIdAndUpdate(
      id,
      { 
        title, 
        message, 
        type, 
        visible,
        mediaUrl: mediaUrl || null,
        mediaType: mediaType || null,
        targetAudience: targetAudience || 'all'
      },
      { new: true, runValidators: true }
    );
    
    if (!announcement) {
      return res.status(404).json({ success: false, message: 'Announcement not found' });
    }
    
    res.status(200).json({ success: true, announcement });
  } catch (error) {
    console.error('Error updating developer announcement:', error);
    res.status(500).json({ success: false, message: 'Error updating announcement' });
  }
};

/**
 * Delete a developer announcement
 * @route DELETE /api/owner/announcements/:id
 * @access Owner only
 */
exports.deleteAnnouncement = async (req, res) => {
  try {
    const { id } = req.params;
    
    const announcement = await DeveloperAnnouncement.findByIdAndDelete(id);
    
    if (!announcement) {
      return res.status(404).json({ success: false, message: 'Announcement not found' });
    }
    
    res.status(200).json({ success: true, message: 'Announcement deleted successfully' });
  } catch (error) {
    console.error('Error deleting developer announcement:', error);
    res.status(500).json({ success: false, message: 'Error deleting announcement' });
  }
};

/**
 * Get all active developer announcements for admin dashboard
 * @route GET /api/announcements/developer
 * @access Admin only
 */
exports.getAdminAnnouncements = async (req, res) => {
  try {
    // Get the admin's subscription status from the request (added by middleware)
    const admin = req.admin;
    
    // Build query to filter announcements based on targetAudience
    const query = { visible: true };
    
    // Add targetAudience filter
    if (admin) {
      // Get admin's subscription status
      const subscriptionStatus = admin.subscriptionStatus;
      const subscriptionEndDate = admin.subscriptionEndDate ? new Date(admin.subscriptionEndDate) : null;
      const currentDate = new Date();
      
      // Filter announcements based on admin's status
      query.$or = [
        { targetAudience: 'all' }
      ];
      
      // Add active condition if admin has active subscription
      if (subscriptionStatus === 'active' && subscriptionEndDate && subscriptionEndDate > currentDate) {
        query.$or.push({ targetAudience: 'active' });
      }
      
      // Add trial condition if admin is on trial
      if (subscriptionStatus === 'trial' && subscriptionEndDate && subscriptionEndDate > currentDate) {
        query.$or.push({ targetAudience: 'trial' });
      }
      
      // Add expired condition if admin has expired or cancelled subscription
      if (subscriptionStatus === 'expired' || 
          subscriptionStatus === 'cancelled' || 
          (subscriptionEndDate && subscriptionEndDate < currentDate)) {
        query.$or.push({ targetAudience: 'expired' });
      }
    }
    
    const announcements = await DeveloperAnnouncement.find(query)
      .sort({ createdAt: -1 })
      .lean();
    
    res.status(200).json(announcements);
  } catch (error) {
    console.error('Error fetching developer announcements for admin:', error);
    res.status(500).json({ success: false, message: 'Error fetching announcements' });
  }
};
