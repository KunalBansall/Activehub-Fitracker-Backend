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
              Price: $${item.price}
            </li>
          `).join('')}
        </ul>
        
        <p style="font-size: 18px; font-weight: bold; margin-top: 20px;">
          Total Amount: $${order.totalAmount}
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
              Price: $${item.price}
            </li>
          `).join('')}
        </ul>
        
        <p style="font-size: 18px; font-weight: bold; margin-top: 20px;">
          Total Amount: $${order.totalAmount}
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
              Price: $${item.price}
            </li>
          `).join('')}
        </ul>
        
        <p style="font-size: 18px; font-weight: bold; margin-top: 20px;">
          Total Amount: $${order.totalAmount}
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

module.exports = {
  sendEmail,
  sendOrderConfirmationEmail,
  sendAdminNotificationEmail,
  sendOrderStatusUpdateEmail
}; 