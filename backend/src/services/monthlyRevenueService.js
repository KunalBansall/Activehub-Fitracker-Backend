const Admin = require('../models/Admin');
const Member = require('../models/Member');
const Order = require('../models/Order');
const GymSettings = require('../models/GymSettings');
const MonthlyRevenue = require('../models/MonthlyRevenue');
const nodemailer = require('nodemailer');
// Use regular puppeteer for local development
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const writeFileAsync = promisify(fs.writeFile);
const mkdirAsync = promisify(fs.mkdir);

/**
 * Check if today is the last day of the month
 * @returns {boolean}
 */
const isLastDayOfMonth = () => {
  const today = new Date();
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return today.getDate() === lastDayOfMonth.getDate();
};

/**
 * Get revenue data for a specific month and year
 * @param {ObjectId} gymId - The gym's ID
 * @param {number} month - Month (0-11)
 * @param {number} year - Year
 * @returns {Promise<Object>} Revenue data
 */
const getMonthlyRevenue = async (gymId, month, year) => {
  // First day of the month
  const startDate = new Date(year, month, 1);
  startDate.setHours(0, 0, 0, 0);
  
  // Last day of the month
  const endDate = new Date(year, month + 1, 0);
  endDate.setHours(23, 59, 59, 999);
  
  // Get membership revenue
  const membershipRevenue = await Member.aggregate([
    {
      $match: {
        gymId,
        feeStatus: 'paid',
        createdAt: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$fees' }
      }
    }
  ]);
  
  // Get shop revenue from delivered orders
  const shopRevenue = await Order.aggregate([
    {
      $match: {
        gymId,
        status: 'delivered',
        createdAt: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$totalAmount' }
      }
    }
  ]);
  
  // Calculate totals
  const totalMembershipRevenue = membershipRevenue[0]?.total || 0;
  const totalShopRevenue = shopRevenue[0]?.total || 0;
  const totalRevenue = totalMembershipRevenue + totalShopRevenue;
  
  return {
    membershipRevenue: totalMembershipRevenue,
    shopRevenue: totalShopRevenue,
    totalRevenue
  };
};

/**
 * Calculate growth percentages comparing to previous month
 * @param {number} current - Current month value
 * @param {number} previous - Previous month value
 * @returns {number} Growth percentage
 */
const calculateGrowth = (current, previous) => {
  if (!previous) return 0;
  return parseFloat(((current - previous) / previous * 100).toFixed(2));
};

/**
 * Generate HTML for the monthly report email
 * @param {Object} data - Revenue data and gym info
 * @returns {string} HTML content
 */
const generateReportHtml = (data) => {
  const {
    gymName,
    month,
    year,
    membershipRevenue,
    shopRevenue,
    totalRevenue,
    membershipGrowth,
    shopGrowth,
    totalGrowth,
    revenueGoal,
    goalAchieved
  } = data;
  
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };
  
  const getGrowthEmoji = (growth) => {
    if (growth > 10) return '🚀';
    if (growth > 0) return '📈';
    if (growth < 0) return '📉';
    return '➡️';
  };
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Monthly Revenue Report</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          line-height: 1.6;
          color: #333;
          margin: 0;
          padding: 0;
          background-color: #f8fafc;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background-color: #fff;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .header {
          background-color: #2563eb;
          color: white;
          padding: 24px;
          text-align: center;
        }
        .header h1 {
          margin: 0;
          font-size: 22px;
          font-weight: 600;
        }
        .header p {
          margin: 5px 0 0;
          opacity: 0.9;
          font-size: 14px;
        }
        .content {
          padding: 30px;
        }
        .summary-card {
          margin-bottom: 25px;
          text-align: center;
        }
        .total-revenue {
          font-size: 36px;
          font-weight: 700;
          color: #2563eb;
          margin: 0;
        }
        .growth-indicator {
          display: inline-block;
          margin-top: 8px;
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 14px;
          font-weight: 500;
        }
        .positive {
          background-color: #ecfdf5;
          color: #047857;
        }
        .negative {
          background-color: #fef2f2;
          color: #b91c1c;
        }
        .neutral {
          background-color: #f1f5f9;
          color: #64748b;
        }
        .divider {
          height: 1px;
          background-color: #e2e8f0;
          margin: 25px 0;
        }
        .revenue-sources {
          display: flex;
          gap: 20px;
          margin-bottom: 30px;
        }
        .revenue-source {
          flex: 1;
          padding: 15px;
          background-color: #f8fafc;
          border-radius: 8px;
          text-align: center;
        }
        .source-label {
          font-size: 14px;
          color: #64748b;
          margin-bottom: 8px;
        }
        .source-amount {
          font-size: 22px;
          font-weight: 600;
          color: #334155;
          margin: 0;
        }
        .goal-container {
          background-color: #f8fafc;
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 20px;
        }
        .goal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }
        .goal-title {
          font-weight: 600;
          color: #334155;
        }
        .goal-percentage {
          font-weight: 600;
          color: ${goalAchieved ? '#047857' : '#b45309'};
        }
        .progress-container {
          height: 8px;
          background-color: #e2e8f0;
          border-radius: 4px;
          overflow: hidden;
        }
        .progress-bar {
          height: 100%;
          background-color: ${goalAchieved ? '#10b981' : '#f59e0b'};
          width: ${Math.min(100, (totalRevenue / revenueGoal) * 100)}%;
        }
        .footer {
          background-color: #f8fafc;
          padding: 20px;
          text-align: center;
          color: #64748b;
          font-size: 13px;
          border-top: 1px solid #e2e8f0;
        }
        @media (max-width: 600px) {
          .revenue-sources {
            flex-direction: column;
            gap: 10px;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${gymName} - Monthly Report</h1>
          <p>${monthNames[month]} ${year}</p>
        </div>
        
        <div class="content">
          <div class="summary-card">
            <p class="total-revenue">${formatCurrency(totalRevenue)}</p>
            <div class="growth-indicator ${totalGrowth > 0 ? 'positive' : totalGrowth < 0 ? 'negative' : 'neutral'}">
              ${getGrowthEmoji(totalGrowth)} ${totalGrowth > 0 ? '+' : ''}${totalGrowth}% from last month
            </div>
          </div>
          
          <div class="revenue-sources">
            <div class="revenue-source">
              <div class="source-label">Membership</div>
              <p class="source-amount">${formatCurrency(membershipRevenue)}</p>
            </div>
            <div class="revenue-source">
              <div class="source-label">Shop Sales</div>
              <p class="source-amount">${formatCurrency(shopRevenue)}</p>
            </div>
          </div>
          
          ${revenueGoal > 0 ? `
          <div class="goal-container">
            <div class="goal-header">
              <div class="goal-title">${goalAchieved ? '🎉 Goal Achieved' : '🎯 Revenue Goal'}</div>
              <div class="goal-percentage">${Math.round((totalRevenue / revenueGoal) * 100)}%</div>
            </div>
            <div class="progress-container">
              <div class="progress-bar"></div>
            </div>
            <div style="margin-top: 8px; font-size: 14px; color: #64748b;">
              ${formatCurrency(totalRevenue)} of ${formatCurrency(revenueGoal)}
            </div>
          </div>
          ` : ''}
        </div>
        
        <div class="footer">
          <p>This is an automated report from ActiveHub FlexTracker.</p>
          <p>You're receiving this because you enabled monthly revenue reports.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

/**
 * Generate a PDF report from HTML
 * @param {string} html - HTML content
 * @param {string} outputPath - Path to save the PDF
 * @returns {Promise<string>} Path to the generated PDF
 */
const generatePdfReport = async (html, outputPath) => {
  let browser = null;
  
  try {
    // Configure browser options based on environment
    const isProduction = process.env.NODE_ENV === 'production';
    const options = {
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu'
      ]
    };
    
    // Launch browser with enhanced options for production
    browser = await puppeteer.launch(options);
    
    const page = await browser.newPage();
    await page.setContent(html);
    
    // Make sure the directory exists
    const dir = path.dirname(outputPath);
    await mkdirAsync(dir, { recursive: true });
    
    await page.pdf({
      path: outputPath,
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20px',
        bottom: '20px',
        left: '20px',
        right: '20px'
      }
    });
    
    return outputPath;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
};

/**
 * Send monthly revenue report email
 * @param {Object} admin - Admin object with email
 * @param {string} html - HTML content
 * @param {string|null} pdfPath - Path to PDF attachment (or null if no PDF)
 * @param {string} month - Month name
 * @param {number} year - Year
 * @returns {Promise<boolean>} Success status
 */
const sendReportEmail = async (admin, html, pdfPath, month, year) => {
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  
  const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    }
  });
  
  // Create mail options
  const mailOptions = {
    from: `"ActiveHub FlexTracker" <${process.env.EMAIL_USER}>`,
    to: admin.email,
    subject: `Monthly Revenue Report - ${monthNames[month]} ${year}`,
    html: html
  };
  
  try {
    // If PDF is needed, generate it temporarily
    let tempPdfPath = null;
    
    if (pdfPath === null) {
      // Create a temporary directory for PDFs if it doesn't exist
      const tempDir = path.join(__dirname, '../temp');
      await mkdirAsync(tempDir, { recursive: true });
      
      // Generate a temporary filename
      tempPdfPath = path.join(tempDir, `temp-report-${admin._id}-${Date.now()}.pdf`);
      
      // Generate the PDF
      await generatePdfReport(html, tempPdfPath);
      
      // Add the PDF attachment to mail options
      mailOptions.attachments = [
        {
          filename: `revenue-report-${monthNames[month]}-${year}.pdf`,
          path: tempPdfPath,
          contentType: 'application/pdf'
        }
      ];
    } else if (pdfPath) {
      // Use the provided PDF path if one was specified
      mailOptions.attachments = [
        {
          filename: `revenue-report-${monthNames[month]}-${year}.pdf`,
          path: pdfPath,
          contentType: 'application/pdf'
        }
      ];
    }
    
    // Send the email
    await transporter.sendMail(mailOptions);
    
    // Delete the temporary PDF file if we created one
    if (tempPdfPath) {
      fs.unlink(tempPdfPath, (err) => {
        if (err) {
          console.error(`Error deleting temporary PDF file: ${err}`);
        }
      });
    }
    
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
};

/**
 * Process the monthly revenue report for a gym
 * @param {Object} admin - Admin document
 * @returns {Promise<boolean>} Success status
 */
const processGymMonthlyReport = async (admin) => {
  try {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    
    // Calculate previous month (for growth calculation)
    const previousMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const previousYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    
    // Get gym settings
    const gymSettings = await GymSettings.findOne({ gymId: admin._id });
    
    // Skip if monthly reports are disabled
    if (!gymSettings || !gymSettings.enableMonthlyReports) {
      return false;
    }
    
    // Get current month revenue data
    const currentRevenue = await getMonthlyRevenue(admin._id, currentMonth, currentYear);
    
    // Get previous month revenue data for comparison
    const previousRevenue = await getMonthlyRevenue(admin._id, previousMonth, previousYear);
    
    // Calculate growth percentages
    const membershipGrowth = calculateGrowth(currentRevenue.membershipRevenue, previousRevenue.membershipRevenue);
    const shopGrowth = calculateGrowth(currentRevenue.shopRevenue, previousRevenue.shopRevenue);
    const totalGrowth = calculateGrowth(currentRevenue.totalRevenue, previousRevenue.totalRevenue);
    
    // Get monthly revenue goal
    const revenueGoal = gymSettings.monthlyRevenueGoal || 0;
    const goalAchieved = revenueGoal > 0 && currentRevenue.totalRevenue >= revenueGoal;
    
    // Create or update monthly revenue record
    const monthlyRevenue = await MonthlyRevenue.findOneAndUpdate(
      {
        gymId: admin._id,
        month: currentMonth,
        year: currentYear
      },
      {
        $set: {
          membershipRevenue: currentRevenue.membershipRevenue,
          shopRevenue: currentRevenue.shopRevenue,
          totalRevenue: currentRevenue.totalRevenue,
          membershipGrowth,
          shopGrowth,
          totalGrowth,
          revenueGoal,
          goalAchieved
        }
      },
      { upsert: true, new: true }
    );
    
    // Generate HTML report
    const reportHtml = generateReportHtml({
      gymName: admin.gymName || 'Your Gym',
      month: currentMonth,
      year: currentYear,
      membershipRevenue: currentRevenue.membershipRevenue,
      shopRevenue: currentRevenue.shopRevenue,
      totalRevenue: currentRevenue.totalRevenue,
      membershipGrowth,
      shopGrowth,
      totalGrowth,
      revenueGoal,
      goalAchieved
    });
    
    // Skip PDF generation and send the email with just the HTML content
    const emailSent = await sendReportEmail(admin, reportHtml, null, currentMonth, currentYear);
    
    console.log(`Monthly revenue report processed for ${admin.gymName || admin.email} (${admin._id}). Email sent: ${emailSent}`);
    
    return true;
  } catch (error) {
    console.error(`Error processing monthly report for gym ${admin._id}:`, error);
    return false;
  }
};

/**
 * Main function to process monthly revenue reports for all gyms
 */
const processMonthlyReports = async () => {
  try {
    // Only run on the last day of the month
    if (!isLastDayOfMonth()) {
      console.log('Not the last day of the month. Skipping monthly reports.');
      return;
    }
    
    console.log('Processing monthly revenue reports...');
    
    // Get all gym admins
    const admins = await Admin.find();
    
    if (!admins || admins.length === 0) {
      console.log('No gyms found to process reports for.');
      return;
    }
    
    // Process reports for each gym
    const results = await Promise.all(
      admins.map(admin => processGymMonthlyReport(admin))
    );
    
    const successful = results.filter(result => result).length;
    console.log(`Monthly reports completed. Processed ${successful} of ${admins.length} gyms.`);
  } catch (error) {
    console.error('Error processing monthly revenue reports:', error);
  }
};

module.exports = {
  processMonthlyReports,
  processGymMonthlyReport,
  isLastDayOfMonth,
  generateReportHtml,
  generatePdfReport
}; 