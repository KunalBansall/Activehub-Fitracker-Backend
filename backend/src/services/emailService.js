const nodemailer = require('nodemailer');
const Admin = require('../models/Admin');

// Create transporter with enhanced logging
const createTransporter = () => {
  // console.log('Creating email transporter with the following credentials:');
  // console.log(`- Email User: ${process.env.EMAIL_USER}`);
  // console.log(`- Email Password: ${process.env.EMAIL_PASSWORD ? '******' : 'NOT SET'}`); // Don't log actual password
  // console.log(`- Email Service: ${process.env.EMAIL_SERVICE || 'gmail'}`);
  
  return nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    },
    debug: true, // Enable debug output
    logger: true // Log information about the email sending process
  });
};

const transporter = createTransporter();

// Generic email sending function with enhanced logging
const sendEmail = async (to, subject, html) => {
  try {
    console.log(`📧 SENDING EMAIL: To: ${to}, Subject: ${subject}`);
    
    // Verify email credentials are available
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      console.error('❌ EMAIL CREDENTIALS MISSING: Cannot send email without proper credentials');
      return false;
    }
    
    // Send the actual email
    const info = await transporter.sendMail({
      from: `"ActiveHub FlexTracker" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html
    });
    
    console.log(`✅ EMAIL SENT SUCCESSFULLY: ${info.messageId}`);
    // console.log(`📨 Preview URL: ${nodemailer.getTestMessageUrl(info) || 'No preview available'}`);
    
    return true;
  } catch (error) {
    console.error('❌ ERROR SENDING EMAIL:', error);
    console.error('Error details:', JSON.stringify(error, null, 2));
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

// This function is now defined at the top of the file
// and used to create the main transporter instance

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
    
    console.log(`📧 Sending workout summary email to ${member.email}`);
    
    return await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error(`Failed to send workout summary email to ${member.email}:`, error);
    return false;
  }
};

const sendInactivityNotification = async (member, gymName, message, senderEmail = null, styleOptions = {}) => {
  try {
    const subject = `We miss you at ${gymName}!`;
    
    // Create HTML content for the email
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h1 style="color: #333;">${gymName}</h1>
        </div>
        
        <h2 style="color: #e74c3c;">We Miss You!</h2>
        <p>Hi ${member.name || 'there'},</p>
        <p>It's been a while since we've seen you at ${gymName}. We hope everything is okay!</p>
        
        <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p>${message || 'We value your membership and would love to see you back soon. Is there anything we can help you with?'}</p>
        </div>
        
        <p>Remember, consistency is key to achieving your fitness goals. Even a short workout is better than no workout!</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL}/memberlogin" style="background-color: #e74c3c; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">Come back </a>
        </div>
        
        <p>If you're facing any challenges or have questions about your membership, please don't hesitate to reach out.</p>
        
        <p>We hope to see you soon!</p>
        <p>The ${gymName} Team</p>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #777; font-size: 12px;">
          <p>  ${new Date().getFullYear()} ${gymName}. All rights reserved.</p>
        </div>
      </div>
    `;
    
    console.log(` Sending inactivity notification to ${member.email}`);
    
    // Send the actual email
    await transporter.sendMail({
      from: senderEmail || process.env.EMAIL_USER,
      to: member.email,
      subject: subject,
      html: html
    });
    
    return true;
  } catch (error) {
    console.error('Error sending inactivity notification:', error);
    return false;
  }
};

/**
 * Format date for display in emails
 * @param {Date} date - Date to format
 * @returns {string} Formatted date string
 */
const formatDate = (date) => {
  if (!date) return 'N/A';
  try {
    return new Date(date).toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  } catch (e) {
    console.error('Error formatting date:', e);
    return date.toString();
  }
};

/**
 * Format currency for display in emails
 * @param {number} amount - Amount to format
 * @returns {string} Formatted currency string
 */
const formatCurrency = (amount) => {
  if (amount === null || amount === undefined) return 'N/A';
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount);
  } catch (e) {
    console.error('Error formatting currency:', e);
    return `₹${amount}`;
  }
};

/**
 * Send subscription cancellation email
 * @param {Object} admin - Admin user object
 * @param {Object} subscriptionDetails - Subscription details
 * @param {Date} activeUntil - Date until subscription remains active
 * @returns {Promise<boolean>} Success status
 */
const sendSubscriptionCancelledEmail = async (admin, subscriptionDetails, activeUntil) => {
  try {
    if (!admin || !admin.email) {
      console.error('Missing admin or email for subscription cancellation email');
      return false;
    }
    
    const subject = `Your ActiveHub Pro subscription has been cancelled`;
    
    const html = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); background: linear-gradient(to bottom, #ffffff, #f9f9f9);">
        <div style="text-align: center; margin-bottom: 25px;">
          <h1 style="color: #333; font-size: 28px; margin-bottom: 5px;">ActiveHub</h1>
          <div style="width: 80px; height: 4px; background: linear-gradient(to right, #e74c3c, #ff9f43); margin: 0 auto;"></div>
        </div>
        
        <h2 style="color: #e74c3c; font-size: 24px; text-align: center;">Subscription Cancelled</h2>
        <p style="font-size: 16px; line-height: 1.6;">Dear <strong>${admin.name || admin.email}</strong>,</p>
        <p style="font-size: 16px; line-height: 1.6;">Your subscription to <strong>ActiveHub Pro</strong> has been cancelled.</p>
        
        <div style="background: linear-gradient(to right, #f9f9f9, #f1f1f1); padding: 20px; border-left: 4px solid #e74c3c; border-radius: 5px; margin: 25px 0;">
          <h3 style="color: #555; margin-top: 0;">Subscription Details:</h3>
          <p style="margin-bottom: 10px;"><strong>Subscription ID:</strong> ${subscriptionDetails.subscriptionId || 'N/A'}</p>
          <p style="margin-bottom: 10px;"><strong>Active Until:</strong> ${formatDate(activeUntil)}</p>
        </div>
        
        <div style="background-color: #f0f8ff; padding: 15px; border-radius: 5px; margin: 25px 0;">
          <p style="font-size: 16px; line-height: 1.6; margin: 0;">You will continue to have access to all ActiveHub Pro features until <strong>${formatDate(activeUntil)}</strong>.</p>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL}/admin/billing" style="background: linear-gradient(to right, #3498db, #2980b9); color: white; padding: 12px 25px; text-decoration: none; border-radius: 50px; font-weight: bold; display: inline-block; box-shadow: 0 4px 8px rgba(52, 152, 219, 0.3); transition: all 0.3s ease;">REACTIVATE SUBSCRIPTION</a>
        </div>
        
        <p style="font-size: 16px; line-height: 1.6;">If you did not request this cancellation or need any assistance, our support team is always here to help.</p>
        
        <p style="font-size: 16px; line-height: 1.6;">Thank you for using ActiveHub Pro!</p>
        
        <p style="font-size: 16px; line-height: 1.6;">Best regards,<br>The ActiveHub Team</p>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #777; font-size: 12px;">
          <p>© ${new Date().getFullYear()} ActiveHub. All rights reserved.</p>
        </div>
      </div>
    `;
    
    console.log(`📧 Sending subscription cancellation to ${admin.email}`);
    
    // Send the actual email
    const info = await transporter.sendMail({
      from: `"ActiveHub" <${process.env.EMAIL_USER}>`,
      to: admin.email,
      subject: subject,
      html: html
    });
    
    console.log(`✅ Subscription cancellation email sent to ${admin.email}, ID: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error('Error sending subscription cancelled email:', error);
    // Return false instead of throwing to prevent webhook handler failures
    return false;
  }
};

/**
 * Send payment failed email
 * @param {Object} admin - Admin user object
 * @param {Object} paymentDetails - Payment details
 * @param {Date} graceEndDate - End date of grace period
 * @returns {Promise<boolean>} Success status
 */
const sendPaymentFailedEmail = async (admin, paymentDetails, graceEndDate) => {
  try {
    if (!admin || !admin.email) {
      console.error('Missing admin or email for payment failed email');
      return false;
    }
    
    const subject = `Payment Failed - Action Required for Your ActiveHub Pro Subscription`;
    
    const html = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); background: linear-gradient(to bottom, #ffffff, #f9f9f9);">
        <div style="text-align: center; margin-bottom: 25px;">
          <h1 style="color: #333; font-size: 28px; margin-bottom: 5px;">ActiveHub</h1>
          <div style="width: 80px; height: 4px; background: linear-gradient(to right, #e74c3c, #ff9f43); margin: 0 auto;"></div>
        </div>
        
        <h2 style="color: #e74c3c; font-size: 24px; text-align: center;">Payment Failed</h2>
        <p style="font-size: 16px; line-height: 1.6;">Dear <strong>${admin.name || admin.email}</strong>,</p>
        <p style="font-size: 16px; line-height: 1.6;">We were unable to process your payment for your ActiveHub Pro subscription.</p>
        
        <div style="background: linear-gradient(to right, #f9f9f9, #f1f1f1); padding: 20px; border-left: 4px solid #e74c3c; border-radius: 5px; margin: 25px 0;">
          <h3 style="color: #555; margin-top: 0;">Payment Details:</h3>
          <p style="margin-bottom: 10px;"><strong>Payment ID:</strong> ${paymentDetails.paymentId || 'N/A'}</p>
          <p style="margin-bottom: 10px;"><strong>Subscription ID:</strong> ${paymentDetails.subscriptionId || 'N/A'}</p>
          ${paymentDetails.amount ? `<p style="margin-bottom: 10px;"><strong>Amount:</strong> ${formatCurrency(paymentDetails.amount)}</p>` : ''}
        </div>
        
        <div style="background-color: #fff3cd; padding: 20px; border-left: 4px solid #ffc107; border-radius: 5px; margin: 25px 0;">
          <p style="font-size: 16px; line-height: 1.6; margin: 0;"><strong>Important:</strong> Your subscription has been placed in a grace period until <strong>${formatDate(graceEndDate)}</strong>.</p>
          <p style="font-size: 16px; line-height: 1.6; margin-top: 10px;">You will continue to have access to all ActiveHub Pro features during this time.</p>
        </div>
        
        <h3 style="color: #333; font-size: 20px;">What You Need to Do:</h3>
        <ol style="font-size: 16px; line-height: 1.6; padding-left: 25px;">
          <li style="margin-bottom: 10px;">Check your payment method details in your account settings</li>
          <li style="margin-bottom: 10px;">Ensure your card has sufficient funds</li>
          <li style="margin-bottom: 10px;">Update your payment information if necessary</li>
        </ol>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL}/admin/billing" style="background: linear-gradient(to right, #e74c3c, #ff9f43); color: white; padding: 12px 25px; text-decoration: none; border-radius: 50px; font-weight: bold; display: inline-block; box-shadow: 0 4px 8px rgba(231, 76, 60, 0.3); transition: all 0.3s ease;">UPDATE PAYMENT METHOD</a>
        </div>
        
        <p style="font-size: 16px; line-height: 1.6;">If you need any assistance, our support team is always here to help.</p>
        
        <p style="font-size: 16px; line-height: 1.6;">Thank you for using ActiveHub Pro!</p>
        
        <p style="font-size: 16px; line-height: 1.6;">Best regards,<br>The ActiveHub Team</p>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #777; font-size: 12px;">
          <p>© ${new Date().getFullYear()} ActiveHub. All rights reserved.</p>
        </div>
      </div>
    `;
    
    console.log(`📧 Sending payment failed notification to ${admin.email}`);
    
    // Send the actual email
    const info = await transporter.sendMail({
      from: `"ActiveHub" <${process.env.EMAIL_USER}>`,
      to: admin.email,
      subject: subject,
      html: html
    });
    
    console.log(`✅ Payment failed email sent to ${admin.email}, ID: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error('Error sending payment failed email:', error);
    // Return false instead of throwing to prevent webhook handler failures
    return false;
  }
};

// Welcome email template for new gym owners/admins
const welcomeEmailTemplate = (admin) => {
  return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 650px; margin: 0 auto; padding: 20px; color: #333;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #3b82f6; margin-bottom: 5px;">Welcome to ActiveHub FitTracker!</h1>
        <p style="font-size: 18px; color: #4b5563;">Your Ultimate Gym Management Solution</p>
      </div>
      
      <div style="background-color: #f0f9ff; border-left: 4px solid #3b82f6; padding: 15px; margin-bottom: 25px;">
        <p style="font-size: 16px; margin: 0;">Hi ${admin.username},</p>
        <p style="margin-top: 10px;">Thank you for choosing ActiveHub FitTracker for your gym "${admin.gymName}"! We're excited to have you on board and can't wait to help you streamline your gym operations.</p>
      </div>
      
      <h2 style="color: #2563eb; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">Getting Started</h2>
      
      <div style="margin-bottom: 25px;">
        <p>Here are some key features to explore right away:</p>
        
        <ul style="padding-left: 20px; line-height: 1.6;">
          <li><strong>Member Management:</strong> Add, edit, and track all your gym members in one place</li>
          <li><strong>Attendance Tracking:</strong> Monitor member check-ins and analyze attendance patterns</li>
          <li><strong>Payment Processing:</strong> Manage subscriptions and track payment history</li>
          <li><strong>Workout Plans:</strong> Create personalized workout routines for your members</li>
          <li><strong>Analytics Dashboard:</strong> Get insights into your gym's performance with detailed reports</li>
        </ul>
      </div>
      
      <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; margin-bottom: 25px;">
        <p style="font-weight: bold; margin-top: 0;">Your 30-Day Free Trial</p>
        <p style="margin-bottom: 0;">You're currently on a 30-day free trial that gives you access to all premium features. Enjoy exploring everything ActiveHub has to offer!</p>
      </div>
      
      <h2 style="color: #2563eb; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">Need Help?</h2>
      
      <p>We're here to support you every step of the way:</p>
      
      <ul style="padding-left: 20px; line-height: 1.6;">
        <li>Check out our <a href="#" style="color: #2563eb; text-decoration: none; font-weight: bold;">Knowledge Base</a> for tutorials and guides</li>
        <li>Email us at <a href="mailto:activehubfitracker@gmail.com" style="color: #2563eb; text-decoration: none; font-weight: bold;">activehubfitracker@gmail.com</a> with any questions</li>
        <li>Call our support team at <strong>+91 9050207670</strong> during business hours</li>
      </ul>
      
      <div style="background-color: #ecfdf5; border-radius: 8px; padding: 20px; margin: 30px 0; text-align: center;">
        <p style="font-size: 18px; font-weight: bold; margin-top: 0; color: #059669;">A Note from Our Development Team</p>
        <p style="font-style: italic; margin-bottom: 0;">
          "We built ActiveHub FitTracker with passion and dedication to help gym owners like you succeed. 
          We're constantly improving our platform based on feedback from users like you. 
          Don't hesitate to share your thoughts and suggestions with us!"
        </p>
        <p style="margin-top: 15px; margin-bottom: 0;">- The ActiveHub Development Team</p>
      </div>
      
      <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #6b7280; font-size: 14px;">
        <p>
          ActiveHub FitTracker<br>
          Gurgaon , Haryana<br>
          ${new Date().getFullYear()} ActiveHub Fitracker 
        </p>
        <p>
          <a href="#" style="color: #6b7280; text-decoration: none; margin: 0 10px;">Privacy Policy</a> | 
          <a href="#" style="color: #6b7280; text-decoration: none; margin: 0 10px;">Terms of Service</a> | 
          <a href="#" style="color: #6b7280; text-decoration: none; margin: 0 10px;">Unsubscribe</a>
        </p>
      </div>
    </div>
  `;
};

// Send welcome email to new gym owners/admins
const sendWelcomeEmail = async (admin) => {
  try {
    const subject = `Welcome to ActiveHub FitTracker, ${admin.username}!`;
    const html = welcomeEmailTemplate(admin);
    
    return await sendEmail(admin.email, subject, html);
  } catch (error) {
    console.error('Error sending welcome email:', error);
    return false;
  }
};

/**
 * Send a weekly workout summary email to a member
 * @param {Object} member - Member object with name and email
 * @param {String} gymName - Name of the gym
 * @param {Object} workoutStats - Object containing workout statistics
 * @param {String} senderEmail - Optional sender email
 * @param {Object} styleOptions - Optional styling options
 * @returns {Promise<Boolean>} Success status
 */
const sendWorkoutSummaryEmail = async (member, gymName, workoutStats, senderEmail = null, styleOptions = {}) => {
  try {
    const {
      completedWorkouts = 0,
      totalWorkouts = 0,
      completionRate = 0,
      strongestDay = 'N/A',
      focusAreas = [],
      streakCount = 0,
      caloriesBurned = 0,
      minutesWorkedOut = 0,
      improvementAreas = []
    } = workoutStats;
    
    // Apply style options
    const {
      primaryColor = '#4A00E0',
      secondaryColor = '#8E2DE2',
      useMinimalistDesign = false
    } = styleOptions;
    
    // Format the completion rate as a percentage
    const formattedCompletionRate = `${Math.round(completionRate * 100)}%`;
    
    // Create a progress bar HTML based on completion rate
    const progressBarWidth = Math.round(completionRate * 100);
    const progressBarColor = progressBarWidth >= 80 ? '#10B981' : progressBarWidth >= 50 ? '#F59E0B' : '#EF4444';
    
    // Get a random encouragement message based on completion rate
    const encouragementMessages = {
      high: [
        "Amazing work this week! You're crushing it! 💪",
        "Incredible dedication! Keep up the momentum! 🔥",
        "You're on fire this week! Your consistency is paying off! ⚡"
      ],
      medium: [
        "Good progress this week! You're building momentum! 👍",
        "Solid effort! Every workout counts! 💯",
        "You're making progress! Keep pushing yourself! 🚀"
      ],
      low: [
        "Every workout matters! Let's aim higher next week! 🌟",
        "Small steps lead to big results. Let's keep moving forward! 🏃‍♂️",
        "Progress takes time. Let's make next week even better! 🌱"
      ]
    };
    
    let messageCategory = 'low';
    if (completionRate >= 0.8) messageCategory = 'high';
    else if (completionRate >= 0.5) messageCategory = 'medium';
    
    const encouragementMessage = encouragementMessages[messageCategory][
      Math.floor(Math.random() * encouragementMessages[messageCategory].length)
    ];
    
    // Format focus areas as a comma-separated list
    const formattedFocusAreas = focusAreas.length > 0 
      ? focusAreas.join(', ') 
      : 'General fitness';
    
    // Format improvement areas with bullet points
    const formattedImprovementAreas = improvementAreas.length > 0
      ? improvementAreas.map(area => `<li style="margin-bottom: 8px;">${area}</li>`).join('')
      : '<li style="margin-bottom: 8px;">Consistency in workout schedule</li>';
    
    const transporter = createTransporter();
    
    const mailOptions = {
      from: senderEmail || process.env.EMAIL_USER,
      to: member.email,
      subject: `${gymName} - Your Weekly Workout Summary 📊`,
      text: `Hey ${member.name},

Here's your workout summary for this week:

Completion Rate: ${formattedCompletionRate}
Completed Workouts: ${completedWorkouts}/${totalWorkouts}
Streak: ${streakCount} days
Strongest Day: ${strongestDay}
Focus Areas: ${formattedFocusAreas}
Total Time: ${minutesWorkedOut} minutes
Estimated Calories: ${caloriesBurned}

${encouragementMessage}

Areas to focus on next week:
${improvementAreas.join('\n')}

See you at the gym!

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
                    <td style="background: linear-gradient(to right, ${primaryColor}, ${secondaryColor}); padding: 35px 30px; text-align: center; color: white;">
                      <h1 style="margin: 0; font-size: 26px; font-weight: 600; letter-spacing: 0.5px;">Weekly Workout Summary</h1>
                      <p style="margin: 10px 0 0; font-size: 17px; opacity: 0.95;">Hey ${member.name}! 👋</p>
                    </td>
                  </tr>
                  
                  <!-- Main Content -->
                  <tr>
                    <td style="padding: 40px 30px;">
                      <!-- Progress Section -->
                      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 30px;">
                        <tr>
                          <td>
                            <h2 style="margin: 0 0 20px; color: #2d3748; font-size: 20px; text-align: center;">Your Weekly Progress</h2>
                            
                            <!-- Completion Rate -->
                            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 25px;">
                              <tr>
                                <td style="padding: 0 0 10px;">
                                  <p style="margin: 0; color: #4a5568; font-size: 16px; font-weight: 500;">Completion Rate</p>
                                </td>
                                <td style="text-align: right;">
                                  <p style="margin: 0; color: ${progressBarColor}; font-size: 16px; font-weight: 600;">${formattedCompletionRate}</p>
                                </td>
                              </tr>
                              <tr>
                                <td colspan="2">
                                  <div style="background-color: #e2e8f0; height: 10px; border-radius: 5px; overflow: hidden;">
                                    <div style="background-color: ${progressBarColor}; width: ${progressBarWidth}%; height: 100%;"></div>
                                  </div>
                                </td>
                              </tr>
                            </table>
                            
                            <!-- Stats Grid -->
                            <table width="100%" cellpadding="0" cellspacing="0" border="0">
                              <tr>
                                <!-- Completed Workouts -->
                                <td width="50%" style="padding: 15px; background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0;">
                                  <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                    <tr>
                                      <td style="padding-bottom: 10px;">
                                        <span style="display: inline-block; background-color: #ebf4ff; color: #3182ce; font-size: 20px; border-radius: 50%; width: 40px; height: 40px; text-align: center; line-height: 40px;">💪</span>
                                      </td>
                                    </tr>
                                    <tr>
                                      <td>
                                        <p style="margin: 0 0 5px; color: #718096; font-size: 14px;">Completed Workouts</p>
                                        <p style="margin: 0; color: #2d3748; font-size: 20px; font-weight: 600;">${completedWorkouts}/${totalWorkouts}</p>
                                      </td>
                                    </tr>
                                  </table>
                                </td>
                                
                                <!-- Streak -->
                                <td width="50%" style="padding: 15px; background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0;">
                                  <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                    <tr>
                                      <td style="padding-bottom: 10px;">
                                        <span style="display: inline-block; background-color: #fef3c7; color: #d97706; font-size: 20px; border-radius: 50%; width: 40px; height: 40px; text-align: center; line-height: 40px;">🔥</span>
                                      </td>
                                    </tr>
                                    <tr>
                                      <td>
                                        <p style="margin: 0 0 5px; color: #718096; font-size: 14px;">Current Streak</p>
                                        <p style="margin: 0; color: #2d3748; font-size: 20px; font-weight: 600;">${streakCount} days</p>
                                      </td>
                                    </tr>
                                  </table>
                                </td>
                              </tr>
                              
                              <tr>
                                <td colspan="2" style="height: 15px;"></td>
                              </tr>
                              
                              <tr>
                                <!-- Strongest Day -->
                                <td width="50%" style="padding: 15px; background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0;">
                                  <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                    <tr>
                                      <td style="padding-bottom: 10px;">
                                        <span style="display: inline-block; background-color: #fae5e5; color: #e53e3e; font-size: 20px; border-radius: 50%; width: 40px; height: 40px; text-align: center; line-height: 40px;">⭐</span>
                                      </td>
                                    </tr>
                                    <tr>
                                      <td>
                                        <p style="margin: 0 0 5px; color: #718096; font-size: 14px;">Strongest Day</p>
                                        <p style="margin: 0; color: #2d3748; font-size: 20px; font-weight: 600;">${strongestDay}</p>
                                      </td>
                                    </tr>
                                  </table>
                                </td>
                                
                                <!-- Focus Areas -->
                                <td width="50%" style="padding: 15px; background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0;">
                                  <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                    <tr>
                                      <td style="padding-bottom: 10px;">
                                        <span style="display: inline-block; background-color: #e6fffa; color: #319795; font-size: 20px; border-radius: 50%; width: 40px; height: 40px; text-align: center; line-height: 40px;">🎯</span>
                                      </td>
                                    </tr>
                                    <tr>
                                      <td>
                                        <p style="margin: 0 0 5px; color: #718096; font-size: 14px;">Focus Areas</p>
                                        <p style="margin: 0; color: #2d3748; font-size: 16px; font-weight: 600;">${formattedFocusAreas}</p>
                                      </td>
                                    </tr>
                                  </table>
                                </td>
                              </tr>
                              
                              <tr>
                                <td colspan="2" style="height: 15px;"></td>
                              </tr>
                              
                              <tr>
                                <!-- Time Spent -->
                                <td width="50%" style="padding: 15px; background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0;">
                                  <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                    <tr>
                                      <td style="padding-bottom: 10px;">
                                        <span style="display: inline-block; background-color: #e9f5e9; color: #38a169; font-size: 20px; border-radius: 50%; width: 40px; height: 40px; text-align: center; line-height: 40px;">⏱️</span>
                                      </td>
                                    </tr>
                                    <tr>
                                      <td>
                                        <p style="margin: 0 0 5px; color: #718096; font-size: 14px;">Time Spent</p>
                                        <p style="margin: 0; color: #2d3748; font-size: 20px; font-weight: 600;">${minutesWorkedOut} mins</p>
                                      </td>
                                    </tr>
                                  </table>
                                </td>
                                
                                <!-- Calories -->
                                <td width="50%" style="padding: 15px; background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0;">
                                  <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                    <tr>
                                      <td style="padding-bottom: 10px;">
                                        <span style="display: inline-block; background-color: #fed7e2; color: #d53f8c; font-size: 20px; border-radius: 50%; width: 40px; height: 40px; text-align: center; line-height: 40px;">🔥</span>
                                      </td>
                                    </tr>
                                    <tr>
                                      <td>
                                        <p style="margin: 0 0 5px; color: #718096; font-size: 14px;">Est. Calories</p>
                                        <p style="margin: 0; color: #2d3748; font-size: 20px; font-weight: 600;">${caloriesBurned}</p>
                                      </td>
                                    </tr>
                                  </table>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                      
                      <!-- Encouragement Message -->
                      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 30px;">
                        <tr>
                          <td style="background-color: #f8fafc; padding: 25px; border-radius: 12px; text-align: center;">
                            <p style="margin: 0; color: #4a5568; font-size: 18px; font-weight: 500; line-height: 1.6;">
                              ${encouragementMessage}
                            </p>
                          </td>
                        </tr>
                      </table>
                      
                      <!-- Areas to Focus -->
                      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 30px;">
                        <tr>
                          <td>
                            <h3 style="margin: 0 0 15px; color: #2d3748; font-size: 18px;">Areas to Focus Next Week:</h3>
                            <ul style="margin: 0; padding: 0 0 0 20px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                              ${formattedImprovementAreas}
                            </ul>
                          </td>
                        </tr>
                      </table>
                      
                      <!-- CTA Button -->
                      <table width="100%" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td align="center" style="padding: 15px 0 25px;">
                            <a href="${process.env.FRONTEND_URL || 'https://activehub.com'}/memberlogin" 
                               style="display: inline-block; background: linear-gradient(to right, ${primaryColor}, ${secondaryColor}); color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; text-transform: uppercase; letter-spacing: 0.5px; box-shadow: 0 5px 15px rgba(142, 45, 226, 0.25); transition: all 0.3s;">
                              View Full Details
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
                        See you at the gym!
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
    
    console.log(`📧 Sending workout summary email to ${member.email}`);
    
    return await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error(`Failed to send workout summary email to ${member.email}:`, error);
    return false;
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
  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatCurrency = (amount) => {
    return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); background: linear-gradient(to bottom, #ffffff, #f9f9f9);">
      <div style="text-align: center; margin-bottom: 25px;">
        <h1 style="color: #333; font-size: 28px; margin-bottom: 5px;">ActiveHub FitTracker</h1>
        <div style="width: 80px; height: 4px; background: linear-gradient(to right,rgb(28, 30, 148),rgb(119, 85, 239)); margin: 0 auto;"></div>
      </div>
      
      <h2 style="color: #27ae60; font-size: 24px; text-align: center;">Subscription Confirmed</h2>
      <p style="font-size: 16px; line-height: 1.6;">Dear <strong>${admin.name || admin.email}</strong>,</p>
      <p style="font-size: 16px; line-height: 1.6;">Thank you for subscribing to <strong>${planName}</strong>. Your subscription is now active.</p>
      
      <div style="background: linear-gradient(to right, #f9f9f9, #f1f1f1); padding: 20px; border-left: 4px solidrgb(88, 58, 236); border-radius: 5px; margin: 25px 0;">
        <h3 style="color: #555; margin-top: 0;">Subscription Details:</h3>
        <p style="margin-bottom: 10px;"><strong>Plan:</strong> ${planName}</p>
        <p style="margin-bottom: 10px;"><strong>Amount Paid:</strong> ${formatCurrency(amount)}</p>
        <p style="margin-bottom: 10px;"><strong>Payment ID:</strong> ${paymentDetails.razorpay_payment_id || 'N/A'}</p>
        <p style="margin-bottom: 10px;"><strong>Subscription ID:</strong> ${paymentDetails.razorpay_subscription_id || 'N/A'}</p>
        <p style="margin-bottom: 10px;"><strong>Payment Method:</strong> ${paymentDetails.method || 'Razorpay'}</p>
        <p style="margin-bottom: 10px;"><strong>Start Date:</strong> ${formatDate(startDate)}</p>
        <p style="margin-bottom: 10px;"><strong>End Date:</strong> ${formatDate(endDate)}</p>
      </div>
      
      <div style="background-color: #e8f5e9; padding: 15px; border-radius: 5px; margin: 25px 0; text-align: center;">
        <h3 style="color:rgb(55, 71, 109); margin-top: 0;">🎉 Subscription Successfully Activated</h3>
        <p style="font-style: italic; color: #555;">You now have full access to all ActiveHub Pro features!</p>
      </div>  
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${process.env.FRONTEND_URL}/subscription" style="background: linear-gradient(to right,rgb(55, 71, 109),rgb(88, 58, 236)); color: white; padding: 12px 25px; text-decoration: none; border-radius: 50px; font-weight: bold; display: inline-block; box-shadow: 0 4px 8px rgba(39, 174, 96, 0.3); transition: all 0.3s ease;">GO TO DASHBOARD</a>
      </div>
      
      <p style="font-size: 16px; line-height: 1.6;">You can manage your subscription anytime from your account settings.</p>
      
      <p style="font-size: 16px; line-height: 1.6;">If you have any questions or need assistance, our support team is always here to help.</p>
      
      <p style="font-size: 16px; line-height: 1.6;">Thank you for choosing ActiveHub Pro!</p>
      
      <p style="font-size: 16px; line-height: 1.6;">Best regards,<br>The ActiveHub Team</p>
      
      <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #777; font-size: 12px;">
        <p>© ${new Date().getFullYear()} ActiveHub. All rights reserved.</p>
      </div>
    </div>
  `;
};

/**
 * Send subscription confirmation email
 * @param {Object} admin - Admin user object
 * @param {Object} paymentDetails - Payment details
 * @param {String} planName - Subscription plan name
 * @param {Number} amount - Payment amount
 * @param {Date} startDate - Subscription start date
 * @param {Date} endDate - Subscription end date
 * @param {Boolean} isRenewal - Whether this is a renewal
 * @returns {Promise<boolean>} Success status
 */
const sendSubscriptionConfirmationEmail = async (admin, paymentDetails, planName, amount, startDate, endDate, isRenewal = false) => {
  try {
    if (!admin || !admin.email) {
      console.error('Missing admin or email for subscription confirmation email');
      return false;
    }
    
    const subject = isRenewal 
      ? `Your ActiveHub Pro subscription has been renewed` 
      : `Your ActiveHub Pro subscription is active`;
    
    // Use the template function to generate HTML
    const html = subscriptionConfirmationTemplate(admin, paymentDetails, planName, amount, startDate, endDate);
    
    console.log(`📧 Sending subscription confirmation to ${admin.email}`);
    
    // Send the actual email with improved formatting
    const info = await transporter.sendMail({
      from: `"ActiveHub" <${process.env.EMAIL_USER}>`,
      to: admin.email,
      subject: subject,
      html: html
    });
    
    console.log(`✅ Subscription confirmation email sent to ${admin.email}, ID: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error('Error sending subscription confirmation email:', error);
    // Return false instead of throwing to prevent webhook handler failures
    return false;
  }
};

module.exports = {
  sendEmail,
  sendOrderConfirmationEmail,
  sendAdminNotificationEmail,
  sendOrderStatusUpdateEmail,
  sendGeneralEmail,
  sendWorkoutMotivationEmail,
  sendWorkoutSummaryEmail,
  sendInactivityNotification,
  sendSubscriptionConfirmationEmail,
  subscriptionConfirmationTemplate,
  sendSubscriptionCancelledEmail,
  sendPaymentFailedEmail,
  sendWelcomeEmail
};