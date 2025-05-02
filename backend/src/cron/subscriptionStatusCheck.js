const Admin = require('../models/Admin');
const nodemailer = require('nodemailer');

/**
 * Check and update subscription statuses for all admins
 * - Trial -> Grace (when trial period ends)
 * - Grace -> Expired (when grace period ends)
 * - Also send email notifications for upcoming expirations
 */
const checkSubscriptionStatuses = async () => {
  try {
    console.log('Running subscription status check...');
    const now = new Date();
    
    // Find admins whose trial is about to end in 7 days
    const trialEndingSoon = await Admin.find({
      subscriptionStatus: 'trial',
      trialEndDate: {
        $gt: now,
        $lt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
      }
    });
    
    // Find admins whose trial is about to end in 1 day
    const trialEndingTomorrow = await Admin.find({
      subscriptionStatus: 'trial',
      trialEndDate: {
        $gt: now,
        $lt: new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000) // 1 day from now
      }
    });
    
    // Find admins whose trial has ended
    const trialEnded = await Admin.find({
      subscriptionStatus: 'trial',
      trialEndDate: { $lt: now }
    });
    
    // Find admins whose grace period is about to end in 1 day
    const graceEndingTomorrow = await Admin.find({
      subscriptionStatus: 'grace',
      graceEndDate: {
        $gt: now,
        $lt: new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000) // 1 day from now
      }
    });
    
    // Find admins whose grace period has ended
    const graceEnded = await Admin.find({
      subscriptionStatus: 'grace',
      graceEndDate: { $lt: now }
    });
    
    // Update subscription statuses
    for (const admin of trialEnded) {
      admin.subscriptionStatus = 'grace';
      await admin.save();
      await sendTrialEndedEmail(admin);
      console.log(`Admin ${admin.email} subscription updated: trial -> grace`);
    }
    
    for (const admin of graceEnded) {
      admin.subscriptionStatus = 'expired';
      await admin.save();
      await sendGraceEndedEmail(admin);
      console.log(`Admin ${admin.email} subscription updated: grace -> expired`);
    }
    
    // Send notifications
    for (const admin of trialEndingSoon) {
      await sendTrialEndingSoonEmail(admin, 7);
    }
    
    for (const admin of trialEndingTomorrow) {
      await sendTrialEndingSoonEmail(admin, 1);
    }
    
    for (const admin of graceEndingTomorrow) {
      await sendGraceEndingSoonEmail(admin);
    }
    
    console.log('Subscription status check completed');
  } catch (error) {
    console.error('Error in subscription status check:', error);
  }
};

/**
 * Send email notification for trial ending soon
 */
const sendTrialEndingSoonEmail = async (admin, daysLeft) => {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    }
  });
  
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: admin.email,
    subject: `Your Free Trial Ends in ${daysLeft} Day${daysLeft > 1 ? 's' : ''}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border-radius: 5px; box-shadow: 0 0 10px rgba(0,0,0,0.1);">
        <h2>Your Free Trial is Ending Soon</h2>
        <p>Hello ${admin.username},</p>
        <p>Your ActiveHub FitTracker free trial will expire in <strong>${daysLeft} day${daysLeft > 1 ? 's' : ''}</strong>.</p>
        <p>To continue using all features of ActiveHub FitTracker, please subscribe to one of our plans.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL}/subscription" 
             style="background-color: #4CAF50; color: white; padding: 12px 20px; text-decoration: none; border-radius: 4px; font-weight: bold;">
            View Subscription Plans
          </a>
        </div>
        <p>If you don't subscribe, your account will enter a 3-day grace period with limited functionality, after which access will be restricted.</p>
        <p>Thank you for using ActiveHub FitTracker!</p>
      </div>
    `
  };
  
  try {
    await transporter.sendMail(mailOptions);
    console.log(`Trial ending soon email sent to ${admin.email}`);
  } catch (error) {
    console.error(`Error sending trial ending soon email to ${admin.email}:`, error);
  }
};

/**
 * Send email notification for trial ended, entered grace period
 */
const sendTrialEndedEmail = async (admin) => {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    }
  });
  
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: admin.email,
    subject: 'Your Free Trial Has Ended',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border-radius: 5px; box-shadow: 0 0 10px rgba(0,0,0,0.1);">
        <h2>Your Free Trial Has Ended</h2>
        <p>Hello ${admin.username},</p>
        <p>Your ActiveHub FitTracker free trial has ended. Your account is now in a 3-day grace period with limited functionality.</p>
        <p>To restore full access to all features, please subscribe to one of our plans.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL}/subscription" 
             style="background-color: #4CAF50; color: white; padding: 12px 20px; text-decoration: none; border-radius: 4px; font-weight: bold;">
            Subscribe Now
          </a>
        </div>
        <p>After the grace period ends, you will lose access to your dashboard until you subscribe.</p>
        <p>Thank you for using ActiveHub FitTracker!</p>
      </div>
    `
  };
  
  try {
    await transporter.sendMail(mailOptions);
    console.log(`Trial ended email sent to ${admin.email}`);
  } catch (error) {
    console.error(`Error sending trial ended email to ${admin.email}:`, error);
  }
};

/**
 * Send email notification for grace period ending soon
 */
const sendGraceEndingSoonEmail = async (admin) => {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    }
  });
  
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: admin.email,
    subject: 'Final Warning: Your Grace Period Ends Tomorrow',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border-radius: 5px; box-shadow: 0 0 10px rgba(0,0,0,0.1);">
        <h2 style="color: #FF5733;">Final Warning: Grace Period Ending</h2>
        <p>Hello ${admin.username},</p>
        <p>Your ActiveHub FitTracker grace period ends tomorrow. After this, you will lose access to your dashboard.</p>
        <p>To avoid disruption, please subscribe to one of our plans immediately.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL}/subscription" 
             style="background-color: #FF5733; color: white; padding: 12px 20px; text-decoration: none; border-radius: 4px; font-weight: bold;">
            Subscribe Now
          </a>
        </div>
        <p>Don't lose your data and access to your gym management system!</p>
        <p>Thank you for using ActiveHub FitTracker!</p>
      </div>
    `
  };
  
  try {
    await transporter.sendMail(mailOptions);
    console.log(`Grace ending soon email sent to ${admin.email}`);
  } catch (error) {
    console.error(`Error sending grace ending soon email to ${admin.email}:`, error);
  }
};

/**
 * Send email notification for grace period ended
 */
const sendGraceEndedEmail = async (admin) => {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    }
  });
  
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: admin.email,
    subject: 'Access Restricted: Your Grace Period Has Ended',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border-radius: 5px; box-shadow: 0 0 10px rgba(0,0,0,0.1);">
        <h2 style="color: #C70039;">Access Restricted</h2>
        <p>Hello ${admin.username},</p>
        <p>Your ActiveHub FitTracker grace period has ended. Your access to the dashboard has been restricted.</p>
        <p>To restore access and continue managing your gym, please subscribe to one of our plans.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL}/subscription" 
             style="background-color: #C70039; color: white; padding: 12px 20px; text-decoration: none; border-radius: 4px; font-weight: bold;">
            Subscribe Now
          </a>
        </div>
        <p>Your data is still safe and will be available once you subscribe.</p>
        <p>Thank you for using ActiveHub FitTracker!</p>
      </div>
    `
  };
  
  try {
    await transporter.sendMail(mailOptions);
    console.log(`Grace ended email sent to ${admin.email}`);
  } catch (error) {
    console.error(`Error sending grace ended email to ${admin.email}:`, error);
  }
};

module.exports = checkSubscriptionStatuses; 