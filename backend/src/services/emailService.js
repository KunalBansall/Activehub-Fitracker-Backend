const nodemailer = require('nodemailer');
const Admin = require('../models/Admin');

// Create transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Generic email sending function
const sendEmail = async (to, subject, html) => {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to,
      subject,
      html
    });
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
};

// Email templates
const orderConfirmationTemplate = (order, member) => {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Order Confirmation</h2>
      <p>Dear ${member.name},</p>
      <p>Thank you for your order! Here are your order details:</p>
      
      <div style="background-color: #f9f9f9; padding: 20px; border-radius: 5px; margin: 20px 0;">
        <h3 style="color: #444;">Order #${order._id}</h3>
        <p><strong>Order Date:</strong> ${new Date(order.createdAt).toLocaleDateString()}</p>
        <p><strong>Status:</strong> ${order.status}</p>
        
        <h4 style="color: #555;">Order Items:</h4>
        <ul style="list-style: none; padding: 0;">
          ${order.products.map(item => `
            <li style="margin-bottom: 10px; padding: 10px; background-color: white; border-radius: 3px;">
              <strong>${item.name}</strong><br>
              Quantity: ${item.quantity}<br>
              Price: ₹${item.price}
            </li>
          `).join('')}
        </ul>
        
        <p style="font-size: 18px; font-weight: bold; margin-top: 20px;">
          Total Amount: ₹${order.totalAmount}
        </p>
      </div>
      
      <p>We'll notify you when your order status changes.</p>
      <p>If you have any questions, please don't hesitate to contact us.</p>
      
      <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
        <p style="color: #666; font-size: 14px;">
          Best regards,<br>
          ActiveHub Team
        </p>
      </div>
    </div>
  `;
};

const adminNotificationTemplate = (order, member, admin) => {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">New Order Received</h2>
      <p>Dear ${admin.name},</p>
      <p>A new order has been placed for products in your gym.</p>
      
      <div style="background-color: #f9f9f9; padding: 20px; border-radius: 5px; margin: 20px 0;">
        <h3 style="color: #444;">Order #${order._id}</h3>
        <p><strong>Order Date:</strong> ${new Date(order.createdAt).toLocaleDateString()}</p>
        <p><strong>Status:</strong> ${order.status}</p>
        
        <h4 style="color: #555;">Member Information:</h4>
        <p>
          Name: ${member.name}<br>
          Email: ${member.email}<br>
          Phone: ${member.phone || 'Not provided'}
        </p>
        
        <h4 style="color: #555;">Order Items:</h4>
        <ul style="list-style: none; padding: 0;">
          ${order.products.map(item => `
            <li style="margin-bottom: 10px; padding: 10px; background-color: white; border-radius: 3px;">
              <strong>${item.name}</strong><br>
              Quantity: ${item.quantity}<br>
              Price: ₹${item.price}
            </li>
          `).join('')}
        </ul>
        
        <p style="font-size: 18px; font-weight: bold; margin-top: 20px;">
          Total Amount: ₹${order.totalAmount}
        </p>
      </div>
      
      <p>Please process this order as soon as possible.</p>
      
      <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
        <p style="color: #666; font-size: 14px;">
          This is an automated message from your ActiveHub system.
        </p>
      </div>
    </div>
  `;
};

const orderStatusUpdateTemplate = (order, member) => {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Order Status Update</h2>
      <p>Dear ${member.name},</p>
      <p>Your order status has been updated:</p>
      
      <div style="background-color: #f9f9f9; padding: 20px; border-radius: 5px; margin: 20px 0;">
        <h3 style="color: #444;">Order #${order._id}</h3>
        <p><strong>New Status:</strong> ${order.status}</p>
        <p><strong>Order Date:</strong> ${new Date(order.createdAt).toLocaleDateString()}</p>
        
        <h4 style="color: #555;">Order Items:</h4>
        <ul style="list-style: none; padding: 0;">
          ${order.products.map(item => `
            <li style="margin-bottom: 10px; padding: 10px; background-color: white; border-radius: 3px;">
              <strong>${item.name}</strong><br>
              Quantity: ${item.quantity}<br>
              Price: ₹${item.price}
            </li>
          `).join('')}
        </ul>
        
        <p style="font-size: 18px; font-weight: bold; margin-top: 20px;">
          Total Amount: ₹${order.totalAmount}
        </p>
      </div>
      
      <p>If you have any questions about your order, please don't hesitate to contact us.</p>
      
      <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
        <p style="color: #666; font-size: 14px;">
          Best regards,<br>
          ActiveHub Team
        </p>
      </div>
    </div>
  `;
};

// Send emails
const sendOrderConfirmationEmail = async (order, member) => {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: member.email,
      subject: `Order Confirmation - Order #${order._id}`,
      html: orderConfirmationTemplate(order, member)
    });
  } catch (error) {
    console.error('Error sending order confirmation email:', error);
  }
};

const sendAdminNotificationEmail = async (order, member) => {
  try {
    // Find the gym admin
    const admin = await Admin.findById(order.gymId);
    if (!admin || !admin.email) {
      console.error('Admin not found or email not available for gym:', order.gymId);
      return;
    }

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: admin.email,
      subject: `New Order Received - Order #${order._id}`,
      html: adminNotificationTemplate(order, member, admin)
    });
  } catch (error) {
    console.error('Error sending admin notification email:', error);
  }
};

const sendOrderStatusUpdateEmail = async (order, member) => {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: member.email,
      subject: `Order Status Update - Order #${order._id}`,
      html: orderStatusUpdateTemplate(order, member)
    });
  } catch (error) {
    console.error('Error sending order status update email:', error);
  }
};

const createTransporter = () => {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  });
};

// Function to send general emails
const sendGeneralEmail = async (to, subject, text, html) => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to,
      subject,
      text,
      html,
    };
    
    return await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error("Email sending failed:", error);
    throw error;
  }
};

// Function to send workout motivation emails to members with low engagement
const sendWorkoutMotivationEmail = async (member, gymName, senderEmail = null, styleOptions = {}) => {
  try {
    // Get a random motivational quote
    const motivationalQuotes = [
      { quote: "The only bad workout is the one that didn't happen.", author: "Unknown" },
      { quote: "You don't have to be great to start, but you have to start to be great.", author: "Zig Ziglar" },
      { quote: "The difference between try and triumph is a little umph.", author: "Marvin Phillips" },
      { quote: "Your body can stand almost anything. It's your mind that you have to convince.", author: "Unknown" },
      { quote: "Strength does not come from the body. It comes from the will.", author: "Gandhi" },
      { quote: "Don't count the days, make the days count.", author: "Muhammad Ali" },
      { quote: "The hard days are what make you stronger.", author: "Aly Raisman" },
      { quote: "Fall seven times, stand up eight.", author: "Japanese Proverb" },
      { quote: "What hurts today makes you stronger tomorrow.", author: "Jay Cutler" },
      { quote: "It's going to be a journey. It's not a sprint to get in shape.", author: "Kerri Walsh Jennings" }
    ];
    
    const randomQuote = motivationalQuotes[Math.floor(Math.random() * motivationalQuotes.length)];
    
    const transporter = createTransporter();
    
    // Curated fitness tips for low engagement members
    const fitnessTips = [
      "Start with just 10 minutes if you're not feeling it – often you'll end up doing more once you begin.",
      "Remember: consistency beats perfection. Even a quick workout is better than no workout.",
      "Try working out first thing in the morning – it boosts your metabolism all day!",
      "Find a workout buddy or join a group class for extra accountability.",
      "Set a specific time for your workouts and treat them like important meetings."
    ];
    
    const randomTip = fitnessTips[Math.floor(Math.random() * fitnessTips.length)];
    
    // Apply minimalist design if requested
    const {
      useMinimalistDesign = false,
      gradientStart = '#4A00E0',
      gradientEnd = '#8E2DE2'
    } = styleOptions;
    
    // Choose gradient based on design style
    const headerGradient = useMinimalistDesign
      ? `linear-gradient(to right, ${gradientStart}, ${gradientEnd})`
      : 'linear-gradient(to right, #4A00E0, #8E2DE2)';
    
    const quoteBoxGradient = useMinimalistDesign
      ? `#f8fafc`
      : `linear-gradient(135deg, #8E2DE2 0%, #4A00E0 100%)`;
    
    const quoteBoxTextColor = useMinimalistDesign ? '#2d3748' : 'white';
    
    const ctaButtonGradient = useMinimalistDesign
      ? gradientStart
      : `linear-gradient(to right, #8E2DE2, #4A00E0)`;
    
    const mailOptions = {
      from: senderEmail || process.env.EMAIL_USER,
      to: member.email,
      subject: `${gymName} - Fresh Week, Fresh Start! 💪`,
      text: `Hey ${member.name},

Last week's workouts didn't go as planned — but that's totally okay!

"${randomQuote.quote}" - ${randomQuote.author}

This week is a fresh start. Here's a quick tip:
${randomTip}

You've got this! See you at the gym.

Best regards,
${gymName} Team`,
      html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap" rel="stylesheet">
        </head>
        <body style="margin: 0; padding: 0; font-family: 'Poppins', Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; background-color: #f5f7fa; color: #2d3748;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f5f7fa;">
            <tr>
              <td align="center" style="padding: 40px 0;">
                <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 25px rgba(0, 0, 0, 0.05);">
                  <!-- Header -->
                  <tr>
                    <td style="background: linear-gradient(to right, #4A00E0, #8E2DE2); padding: 35px 30px; text-align: center; color: white;">
                      <h1 style="margin: 0; font-size: 26px; font-weight: 600; letter-spacing: 0.5px;">Fresh Week, Fresh Start!</h1>
                      <p style="margin: 10px 0 0; font-size: 17px; opacity: 0.95;">Hey ${member.name}! 👋</p>
                    </td>
                  </tr>
                  
                  <!-- Main Content -->
                  <tr>
                    <td style="padding: 40px 30px;">
                      <p style="margin: 0 0 25px; color: #4a5568; font-size: 17px; line-height: 1.6; text-align: center;">
                        Last week's workouts didn't go as planned — but that's totally okay!
                      </p>
                      
                      <!-- Quote Box -->
                      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 35px;">
                        <tr>
                          <td style="background-color: #8E2DE2; background-image: linear-gradient(135deg, #8E2DE2 0%, #4A00E0 100%); padding: 0; border-radius: 12px; box-shadow: 0 8px 20px rgba(142, 45, 226, 0.2);">
                            <!-- Quote Background Pattern -->
                            <table width="100%" cellpadding="0" cellspacing="0" border="0">
                              <tr>
                                <td style="padding: 30px; position: relative;">
                                  <!-- Quotation Mark -->
                                  <div style="position: absolute; top: 15px; left: 20px; font-size: 60px; color: rgba(255,255,255,0.15); font-family: Georgia, serif; line-height: 1;">"</div>
                                  
                                  <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                    <tr>
                                      <td align="center" style="padding: 10px 10px 0;">
                                        <p style="font-style: italic; font-size: 19px; line-height: 1.6; margin: 0; font-weight: 500; color: white; text-align: center; letter-spacing: 0.2px;">
                                          ${randomQuote.quote}
                                        </p>
                                      </td>
                                    </tr>
                                    <tr>
                                      <td align="right" style="padding: 10px 15px 0;">
                                        <p style="margin: 10px 0 0; font-size: 14px; opacity: 0.9; color: white; font-weight: 300;">— ${randomQuote.author}</p>
                                      </td>
                                    </tr>
                                  </table>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                      
                      <!-- Tip Box -->
                      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 35px;">
                        <tr>
                          <td style="background-color: #f8fafc; padding: 28px; border-radius: 12px; border-left: 5px solid #805AD5;">
                            <h3 style="margin: 0 0 12px; color: #805AD5; font-size: 16px; text-transform: uppercase; letter-spacing: 0.5px;">THIS WEEK'S PRO TIP</h3>
                            <p style="margin: 0; color: #4a5568; font-size: 16px; line-height: 1.6;">
                              ${randomTip}
                            </p>
                          </td>
                        </tr>
                      </table>
                      
                      <!-- CTA Button -->
                      <table width="100%" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td align="center" style="padding: 15px 0 25px;">
                            <a href="${process.env.FRONTEND_URL}/memberlogin" 
                               style="display: inline-block; background: linear-gradient(to right, #8E2DE2, #4A00E0); color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; text-transform: uppercase; letter-spacing: 0.5px; box-shadow: 0 5px 15px rgba(142, 45, 226, 0.25); transition: all 0.3s;">
                              Start Fresh Today
                            </a>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td style="background-color: #f8fafc; padding: 30px; text-align: center; border-top: 1px solid #edf2f7;">
                      <p style="margin: 0 0 10px; color: #4a5568; font-size: 15px; font-weight: 500;">
                        You've got this! See you at the gym.
                      </p>
                      <p style="margin: 0 0 20px; color: #2d3748; font-weight: 600; font-size: 16px;">
                        ${gymName} Team
                      </p>
                      <p style="margin: 0; font-size: 13px; color: #718096;">
                        If you have any questions, just reply to this email.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
    };
    
    return await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error(`Failed to send workout motivation email to ${member.email}:`, error);
    throw error;
  }
};

// Function to send weekly workout summary emails
const sendWorkoutSummaryEmail = async (member, gymName, workoutStats, senderEmail = null, styleOptions = {}) => {
  try {
    const { totalWorkouts, completedWorkouts, completionPercentage } = workoutStats;
    
    const transporter = createTransporter();
    
    // Apply minimalist design if requested
    const {
      useMinimalistDesign = false,
      highGradientStart = '#00b09b',
      highGradientEnd = '#96c93d',
      mediumGradientStart = '#F2994A',
      mediumGradientEnd = '#F2C94C',
      lowGradientStart = '#e74c3c',
      lowGradientEnd = '#e67e22'
    } = styleOptions;
    
    // Personalized messages based on completion percentage
    let motivationalMessage = '';
    let gradientStart = lowGradientStart;
    let gradientEnd = lowGradientEnd;
    let emoji = '🚀';
    let progressColorClass = 'low';
    
    if (completionPercentage >= 80) {
      motivationalMessage = "Amazing job! You're crushing your fitness goals!";
      gradientStart = highGradientStart;
      gradientEnd = highGradientEnd;
      emoji = '🔥';
      progressColorClass = 'high';
    } else if (completionPercentage >= 60) {
      motivationalMessage = "Great work this week! Keep up the momentum!";
      gradientStart = highGradientStart;
      gradientEnd = highGradientEnd;
      emoji = '💪';
      progressColorClass = 'high';
    } else if (completionPercentage >= 40) {
      motivationalMessage = "You're making progress! Let's aim higher next week!";
      gradientStart = mediumGradientStart;
      gradientEnd = mediumGradientEnd;
      emoji = '👊';
      progressColorClass = 'medium';
    } else {
      motivationalMessage = "Every step counts! Let's focus on making next week even better!";
      gradientStart = lowGradientStart;
      gradientEnd = lowGradientEnd;
      emoji = '🚀';
      progressColorClass = 'low';
    }
    
    // Upcoming week motivation
    const weeklyMotivations = [
      "Next week is a new opportunity to push your limits!",
      "Remember why you started — focus on your 'why' next week!",
      "Small progress each day adds up to big results!",
      "Challenge yourself to do just 5% more next week!",
      "Your future self will thank you for not giving up!"
    ];
    
    const randomMotivation = weeklyMotivations[Math.floor(Math.random() * weeklyMotivations.length)];
    
    // Get current day and calculate next week's date range
    const today = new Date();
    const nextMonday = new Date(today);
    nextMonday.setDate(today.getDate() + (1 + 7 - today.getDay()) % 7);
    
    const nextSunday = new Date(nextMonday);
    nextSunday.setDate(nextMonday.getDate() + 6);
    
    // Format dates nicely
    const nextMondayFormatted = nextMonday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const nextSundayFormatted = nextSunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    
    const mailOptions = {
      from: senderEmail || process.env.EMAIL_USER,
      to: member.email,
      subject: `${gymName} - Your Weekly Workout Recap ${emoji}`,
      text: `Hey ${member.name}, here's your weekly workout summary:
      
Total Workouts Assigned: ${totalWorkouts}
Workouts Completed: ${completedWorkouts}
Completion Rate: ${completionPercentage}%

${motivationalMessage}

NEXT WEEK (${nextMondayFormatted} - ${nextSundayFormatted}):
${randomMotivation}

Have a great week ahead!`,
      html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap" rel="stylesheet">
        </head>
        <body style="margin: 0; padding: 0; font-family: 'Poppins', Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; background-color: #f5f7fa; color: #2d3748;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f5f7fa;">
            <tr>
              <td align="center" style="padding: 40px 0;">
                <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 25px rgba(0, 0, 0, 0.05);">
                  
                  <!-- Header -->
                  <tr>
                    <td style="background-image: linear-gradient(to right, ${gradientStart}, ${gradientEnd}); padding: 35px 30px; text-align: center; color: white;">
                      <table width="100%" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td align="center">
                            <table cellpadding="0" cellspacing="0" border="0">
                              <tr>
                                <td>
                                  <h1 style="margin: 0; font-size: 26px; font-weight: 600; letter-spacing: 0.5px;">Weekly Workout Recap</h1>
                                </td>
                                <td style="padding-left: 10px; vertical-align: middle;">
                                  <span style="font-size: 28px;">${emoji}</span>
                                </td>
                              </tr>
                            </table>
                            <p style="color: rgba(255,255,255,0.95); margin: 10px 0 0; font-size: 16px;">
                              ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                            </p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  
                  <!-- Intro -->
                  <tr>
                    <td style="padding: 35px 30px 15px;">
                      <table width="100%" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td align="center">
                            <p style="color: #4a5568; font-size: 18px; margin: 0; line-height: 1.5;">
                              Hey <strong style="color: #2d3748;">${member.name}</strong>, here's how you did this week!
                            </p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  
                  <!-- Progress Circle -->
                  <tr>
                    <td style="padding: 10px 30px 25px;">
                      <table width="100%" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td align="center">
                            <div style="width: 150px; height: 150px; position: relative; margin: 0 auto;">
                              <svg viewBox="0 0 36 36" width="150" height="150" style="transform: rotate(-90deg);">
                                <!-- Background Circle -->
                                <circle cx="18" cy="18" r="16" fill="none" stroke="#edf2f7" stroke-width="3.5"></circle>
                                
                                <!-- Progress Circle -->
                                <circle cx="18" cy="18" r="16" fill="none" 
                                  stroke="${progressColorClass === 'high' ? '#00b09b' : progressColorClass === 'medium' ? '#F2994A' : '#e74c3c'}" 
                                  stroke-width="3.5" 
                                  stroke-dasharray="${completionPercentage}, 100"
                                  stroke-linecap="round"></circle>
                              </svg>
                              <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; flex-direction: column;">
                                <span style="font-size: 36px; font-weight: bold; color: #2d3748;">${completionPercentage}%</span>
                                <span style="font-size: 13px; color: #718096; text-transform: uppercase; letter-spacing: 0.5px;">COMPLETION</span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  
                  <!-- Stats Grid -->
                  <tr>
                    <td style="padding: 0 30px 25px;">
                      <table width="100%" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td width="50%" style="padding-right: 10px;">
                            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8fafc; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.03);">
                              <tr>
                                <td align="center" style="padding: 25px 15px;">
                                  <p style="font-size: 14px; color: #718096; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 8px;">Assigned</p>
                                  <p style="font-size: 34px; font-weight: 600; color: #2d3748; margin: 0 0 8px;">${totalWorkouts}</p>
                                  <p style="font-size: 12px; color: #a0aec0; text-transform: uppercase; letter-spacing: 0.5px; margin: 0;">WORKOUTS</p>
                                </td>
                              </tr>
                            </table>
                          </td>
                          <td width="50%" style="padding-left: 10px;">
                            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8fafc; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.03);">
                              <tr>
                                <td align="center" style="padding: 25px 15px;">
                                  <p style="font-size: 14px; color: #718096; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 8px;">Completed</p>
                                  <p style="font-size: 34px; font-weight: 600; color: ${progressColorClass === 'high' ? '#00b09b' : progressColorClass === 'medium' ? '#F2994A' : '#e74c3c'}; margin: 0 0 8px;">${completedWorkouts}</p>
                                  <p style="font-size: 12px; color: #a0aec0; text-transform: uppercase; letter-spacing: 0.5px; margin: 0;">WORKOUTS</p>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  
                  <!-- Motivational Message -->
                  <tr>
                    <td style="padding: 0 30px 25px;">
                      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8fafc; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.03);">
                        <tr>
                          <td align="center" style="padding: 25px 20px;">
                            <p style="font-size: 18px; font-weight: 500; color: #2d3748; margin: 0; line-height: 1.5;">
                              ${motivationalMessage}
                            </p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  
                  <!-- Next Week Preview -->
                  <tr>
                    <td style="padding: 0 30px 30px;">
                      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-image: linear-gradient(135deg, #667eea, #764ba2); border-radius: 12px; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.2);">
                        <tr>
                          <td style="padding: 30px 25px; color: white;">
                            <h3 style="font-size: 16px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 15px; font-weight: 600; opacity: 0.95;">Coming Up: ${nextMondayFormatted} - ${nextSundayFormatted}</h3>
                            <table cellpadding="0" cellspacing="0" border="0" width="100%">
                              <tr>
                                <td width="30" valign="top" style="padding-right: 15px;">
                                  <div style="font-size: 24px;">💡</div>
                                </td>
                                <td>
                                  <p style="font-size: 16px; margin: 0; line-height: 1.6; font-weight: 400;">${randomMotivation}</p>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  
                  <!-- CTA Button -->
                  <tr>
                    <td style="padding: 10px 30px 40px;">
                      <table width="100%" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td align="center">
                            <a href="${process.env.FRONTEND_URL}/memberlogin" 
                              style="display: inline-block; background-image: linear-gradient(to right, ${gradientStart}, ${gradientEnd}); color: white; 
                              padding: 16px 35px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; text-transform: uppercase; letter-spacing: 1px; box-shadow: 0 5px 15px rgba(0,0,0,0.1);">
                              View Full Workout Plan
                            </a>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td style="background-color: #f8fafc; padding: 30px; text-align: center; border-top: 1px solid #edf2f7;">
                      <p style="color: #4a5568; font-size: 15px; font-weight: 500; margin: 0 0 10px;">
                        Have a great week ahead!
                      </p>
                      <p style="color: #2d3748; font-size: 16px; font-weight: 600; margin: 0 0 20px;">
                        The ${gymName} Team
                      </p>
                      <p style="font-size: 13px; color: #718096; margin: 0;">
                        Questions? Reply to this email or contact us directly.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
    };
    
    return await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error(`Failed to send workout summary email to ${member.email}:`, error);
    throw error;
  }
};

// Function specifically for inactivity notifications
const sendInactivityNotification = async (member, gymName, message, senderEmail = null, styleOptions = {}) => {
  try {
    // Replace placeholders in custom message
    const personalizedMessage = message.replace(/{{name}}/g, member.name);
    
    const transporter = createTransporter();
    
    // Use provided gradient colors or default to the current vibrant colors
    const {
      useMinimalistDesign = false,
      gradientStart = '#6366F1',
      gradientEnd = '#4F46E5'
    } = styleOptions;
    
    // Choose box shadow intensity based on design style
    const boxShadowIntensity = useMinimalistDesign ? '0 2px 8px rgba(0, 0, 0, 0.03)' : '0 4px 25px rgba(0, 0, 0, 0.05)';
    
    // Choose border radius based on design style
    const borderRadius = useMinimalistDesign ? '8px' : '16px';
    
    // Motivational element style
    const motivationalBgColor = useMinimalistDesign 
      ? '#f8fafc' 
      : `linear-gradient(to right, rgba(99, 102, 241, 0.1), rgba(79, 70, 229, 0.1))`;
    
    const borderLeftColor = useMinimalistDesign ? '#4a5568' : '#6366F1';
    
    // CTA button style
    const ctaBgColor = useMinimalistDesign 
      ? '#4a5568' 
      : `linear-gradient(to right, ${gradientStart}, ${gradientEnd})`;
    
    const ctaBoxShadow = useMinimalistDesign 
      ? '0 2px 5px rgba(0, 0, 0, 0.1)' 
      : '0 5px 15px rgba(79, 70, 229, 0.2)';
    
    const mailOptions = {
      from: senderEmail || process.env.EMAIL_USER,
      to: member.email,
      subject: `${gymName} - We miss you at the gym!`,
      text: personalizedMessage,
      html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap" rel="stylesheet">
        </head>
        <body style="margin: 0; padding: 0; font-family: 'Poppins', Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; background-color: #f5f7fa; color: #2d3748;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f5f7fa;">
            <tr>
              <td align="center" style="padding: 40px 0;">
                <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: white; border-radius: ${borderRadius}; overflow: hidden; box-shadow: ${boxShadowIntensity};">
                  <!-- Header -->
                  <tr>
                    <td style="background-image: linear-gradient(135deg, ${gradientStart}, ${gradientEnd}); padding: 35px 30px; text-align: center;">
                      <table width="100%" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td align="center">
                            <table cellpadding="0" cellspacing="0" border="0">
                              <tr>
                                <td>
                                  <h1 style="margin: 0; font-size: 26px; font-weight: 600; letter-spacing: 0.5px; color: white;">We Miss You!</h1>
                                </td>
                                <td style="padding-left: 10px; vertical-align: middle;">
                                  <span style="font-size: 28px;">👋</span>
                                </td>
                              </tr>
                            </table>
                            <p style="color: rgba(255, 255, 255, 0.9); font-size: 17px; margin: 10px 0 0;">Dear ${member.name}</p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>

                  <!-- Main Content -->
                  <tr>
                    <td style="padding: 40px 30px 20px;">
                      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8fafc; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.03);">
                        <tr>
                          <td style="padding: 30px;">
                            <p style="color: #4a5568; font-size: 17px; line-height: 1.6; margin: 0 0 20px;">
                              ${personalizedMessage}
                            </p>
                            
                            <!-- Motivational Element -->
                            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 25px 0;">
                              <tr>
                                <td style="padding: 25px; background-image: ${motivationalBgColor}; border-radius: 8px; border-left: 4px solid ${borderLeftColor};">
                                  <table cellpadding="0" cellspacing="0" border="0" width="100%">
                                    <tr>
                                      <td width="40" valign="top" style="padding-right: 15px;">
                                        <div style="font-size: 28px;">💪</div>
                                      </td>
                                      <td>
                                        <p style="font-size: 16px; color: #4a5568; margin: 0; font-weight: 500; line-height: 1.6;">
                                          Even a short workout is better than no workout! Your fitness journey is a marathon, not a sprint.
                                        </p>
                                      </td>
                                    </tr>
                                  </table>
                                </td>
                              </tr>
                            </table>
                            
                            <!-- CTA Button -->
                            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 30px 0 10px;">
                              <tr>
                                <td align="center">
                                  <a href="${process.env.FRONTEND_URL}/memberlogin" 
                                    style="display: inline-block; background-image: ${ctaBgColor}; color: white; padding: 16px 35px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px; text-transform: uppercase; letter-spacing: 1px; box-shadow: ${ctaBoxShadow};">
                                    Visit Your Dashboard
                                  </a>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  
                  <!-- Benefits Section -->
                  <tr>
                    <td style="padding: 0 30px 40px;">
                      <table width="100%" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td align="center" style="padding-bottom: 20px;">
                            <h3 style="margin: 0; color: #4a5568; font-size: 18px; font-weight: 600;">Remember the Benefits of Regular Exercise</h3>
                          </td>
                        </tr>
                        <tr>
                          <td>
                            <table width="100%" cellpadding="0" cellspacing="0" border="0">
                              <tr>
                                <td width="33%" style="padding: 0 10px;">
                                  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);">
                                    <tr>
                                      <td align="center" style="padding: 20px 15px;">
                                        <div style="font-size: 30px; margin-bottom: 10px;">🧠</div>
                                        <p style="margin: 0; color: #4a5568; font-weight: 500; font-size: 15px;">Improved Mental Health</p>
                                      </td>
                                    </tr>
                                  </table>
                                </td>
                                <td width="33%" style="padding: 0 10px;">
                                  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);">
                                    <tr>
                                      <td align="center" style="padding: 20px 15px;">
                                        <div style="font-size: 30px; margin-bottom: 10px;">❤️</div>
                                        <p style="margin: 0; color: #4a5568; font-weight: 500; font-size: 15px;">Better Heart Health</p>
                                      </td>
                                    </tr>
                                  </table>
                                </td>
                                <td width="33%" style="padding: 0 10px;">
                                  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);">
                                    <tr>
                                      <td align="center" style="padding: 20px 15px;">
                                        <div style="font-size: 30px; margin-bottom: 10px;">🔋</div>
                                        <p style="margin: 0; color: #4a5568; font-weight: 500; font-size: 15px;">Increased Energy</p>
                                      </td>
                                    </tr>
                                  </table>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td style="background-color: #f8fafc; padding: 30px; text-align: center; border-top: 1px solid #edf2f7;">
                      <p style="margin: 0 0 10px; color: #4a5568; font-size: 15px; font-weight: 500;">
                        We hope to see you soon!
                      </p>
                      <p style="margin: 0 0 20px; color: #2d3748; font-size: 16px; font-weight: 600;">
                        ${gymName} Team
                      </p>
                      <p style="margin: 0; font-size: 13px; color: #718096;">
                        If you have any questions, just reply to this email.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
    };
    
    return await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error(`Failed to send inactivity notification to ${member.email}:`, error);
    throw error;
  }
};

/**
 * Generates a subscription confirmation email template
 * @param {Object} admin - The admin object
 * @param {Object} paymentDetails - Payment details from Razorpay
 * @param {string} planName - Name of the subscription plan
 * @param {number} amount - Amount paid
 * @param {Date} startDate - Subscription start date
 * @param {Date} endDate - Subscription end date
 * @returns {string} HTML email template
 */
const subscriptionConfirmationTemplate = (admin, paymentDetails, planName, amount, startDate, endDate) => {
  const formattedStartDate = new Date(startDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  
  const formattedEndDate = new Date(endDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  
  const invoiceDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  
  const invoiceNumber = `INV-${Date.now().toString().slice(-8)}-${Math.floor(Math.random() * 1000)}`;
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Subscription Confirmation</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          line-height: 1.6;
          color: #333;
          margin: 0;
          padding: 0;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .header {
          background-color: #1a56db;
          color: white;
          padding: 20px;
          text-align: center;
          border-radius: 5px 5px 0 0;
        }
        .content {
          background-color: #f9fafb;
          padding: 30px;
          border-radius: 0 0 5px 5px;
          border: 1px solid #e5e7eb;
          border-top: none;
        }
        .logo {
          font-size: 24px;
          font-weight: bold;
          margin-bottom: 10px;
        }
        .invoice-box {
          background-color: white;
          border: 1px solid #e5e7eb;
          border-radius: 5px;
          padding: 20px;
          margin-top: 20px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }
        .invoice-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 20px;
          border-bottom: 1px solid #e5e7eb;
          padding-bottom: 15px;
        }
        .invoice-details {
          margin-bottom: 20px;
        }
        .invoice-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
        }
        .invoice-table th {
          background-color: #f3f4f6;
          padding: 10px;
          text-align: left;
          border-bottom: 1px solid #e5e7eb;
        }
        .invoice-table td {
          padding: 10px;
          border-bottom: 1px solid #e5e7eb;
        }
        .invoice-total {
          text-align: right;
          font-weight: bold;
          font-size: 18px;
          margin-top: 20px;
        }
        .button {
          display: inline-block;
          background-color: #1a56db;
          color: white;
          text-decoration: none;
          padding: 10px 20px;
          border-radius: 5px;
          margin-top: 20px;
          font-weight: bold;
        }
        .footer {
          text-align: center;
          margin-top: 30px;
          color: #6b7280;
          font-size: 14px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">ActiveHub FlexTracker</div>
          <div>Subscription Confirmation</div>
        </div>
        <div class="content">
          <h2>Thank you for your subscription!</h2>
          <p>Dear ${admin.username || admin.email},</p>
          <p>Your subscription to <strong>${planName}</strong> has been successfully processed. You now have full access to all features of ActiveHub FlexTracker.</p>
          
          <div class="invoice-box">
            <div class="invoice-header">
              <div>
                <h3>INVOICE</h3>
                <div>Invoice #: ${invoiceNumber}</div>
                <div>Date: ${invoiceDate}</div>
              </div>
              <div>
                <strong>ActiveHub FlexTracker</strong><br>
                activehubfitracker@gmail.com<br>
                https://activehubfitracker.onrender.com/
              </div>
            </div>
            
            <div class="invoice-details">
              <strong>Bill To:</strong><br>
              ${admin.username || ''}<br>
              ${admin.email}<br>
              ${admin.gymName || 'Your Gym'}<br>
            </div>
            
            <table class="invoice-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Period</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>${planName} Subscription</td>
                  <td>${formattedStartDate} to ${formattedEndDate}</td>
                  <td>₹${amount.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
            
            <div class="invoice-total">
              Total: ₹${amount.toFixed(2)}
            </div>
            
            <div style="margin-top: 20px; font-size: 14px;">
              <strong>Payment Information:</strong><br>
              Payment ID: ${paymentDetails.razorpay_payment_id || paymentDetails.paymentId || 'N/A'}<br>
              Subscription ID: ${paymentDetails.razorpay_subscription_id || paymentDetails.subscriptionId || 'N/A'}<br>
              Payment Method: ${paymentDetails.method || 'Online Payment'}<br>
              Status: Paid
            </div>
          </div>
          
          <p>Your subscription will automatically renew on <strong>${formattedEndDate}</strong>.</p>
          
          <p>To manage your subscription or view billing information, please visit your account settings:</p>
          
          <a href="${process.env.FRONTEND_URL}/subscription" class="button" style="display: inline-block; background-color: #1a56db; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 5px; margin-top: 20px; font-weight: bold; text-shadow: 0 1px 1px rgba(0, 0, 0, 0.2);">Manage Subscription</a>
          
          <div class="footer">
            <p>If you have any questions, please contact our support team at activehubfitracker@gmail.com</p>
            <p>&copy; ${new Date().getFullYear()} ActiveHub FlexTracker. All rights reserved.</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
};

/**
 * Sends a subscription confirmation email with invoice
 * @param {Object} admin - Admin object
 * @param {Object} paymentDetails - Payment details
 * @param {string} planName - Name of the plan
 * @param {number} amount - Amount paid
 * @param {Date} startDate - Subscription start date
 * @param {Date} endDate - Subscription end date
 * @returns {Promise<boolean>} Success status
 */
const sendSubscriptionConfirmationEmail = async (admin, paymentDetails, planName, amount, startDate, endDate) => {
  try {
    const transporter = nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE || 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD || process.env.EMAIL_PASS
      }
    });
    
    const html = subscriptionConfirmationTemplate(admin, paymentDetails, planName, amount, startDate, endDate);
    
    await transporter.sendMail({
      from: `"ActiveHub FlexTracker" <${process.env.EMAIL_USER}>`,
      to: admin.email,
      subject: 'Subscription Confirmation and Invoice',
      html: html
    });
    
    console.log(`Subscription confirmation email sent to ${admin.email}`);
    return true;
  } catch (error) {
    console.error('Error sending subscription confirmation email:', error);
    return false;
  }
};

module.exports = {
  sendEmail,
  sendOrderConfirmationEmail,
  sendAdminNotificationEmail,
  sendOrderStatusUpdateEmail,
  sendGeneralEmail,
  sendInactivityNotification,
  sendWorkoutMotivationEmail,
  sendWorkoutSummaryEmail,
  sendSubscriptionConfirmationEmail
}; 