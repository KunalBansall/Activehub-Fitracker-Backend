const Admin = require('../models/Admin');
const Member = require('../models/Member');
const Order = require('../models/Order');
const GymSettings = require('../models/GymSettings');
const MonthlyRevenue = require('../models/MonthlyRevenue');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const { getBrowser } = require('../utils/puppeteer');

// Promisify fs functions
const mkdirAsync = promisify(fs.mkdir);
const unlinkAsync = promisify(fs.unlink);
const writeFileAsync = promisify(fs.writeFile);

/**
 * Check if today is the last day of the month
 * Improved to be more reliable with timezone considerations
 * @returns {boolean}
 */
const isLastDayOfMonth = () => {
  // Get current date in local timezone
  const today = new Date();
  
  // Get the current date components
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();
  const currentDate = today.getDate();
  
  // Calculate the last day of the current month
  // By setting day to 0 of next month, we get the last day of current month
  const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  
  // Check if current date is the last day of the month
  return currentDate === lastDayOfMonth;
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
  
  // Calculate percentages for the revenue breakdown chart
  const totalRevenueNonZero = totalRevenue || 1; // Prevent division by zero
  const membershipPercentage = Math.round((membershipRevenue / totalRevenueNonZero) * 100);
  const shopPercentage = Math.round((shopRevenue / totalRevenueNonZero) * 100);
  
  // Format dates
  const formattedMonth = monthNames[month];
  const previousMonth = month === 0 ? monthNames[11] : monthNames[month - 1];
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${gymName} - Revenue Report for ${formattedMonth} ${year}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        
        :root {
          --primary-color: #4f46e5;
          --primary-light: #818cf8;
          --success-color: #10b981;
          --warning-color: #f59e0b;
          --danger-color: #ef4444;
          --text-dark: #1e293b;
          --text-medium: #475569;
          --text-light: #94a3b8;
          --bg-light: #f8fafc;
          --border-light: #e2e8f0;
          --card-bg: #ffffff;
        }
        
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        
        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          line-height: 1.6;
          color: var(--text-dark);
          background-color: var(--bg-light);
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }
        
        .container {
          max-width: 600px;
          margin: 0 auto;
          background-color: var(--card-bg);
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        }
        
        .header {
          background: linear-gradient(135deg, var(--primary-color), var(--primary-light));
          color: white;
          padding: 32px 24px;
          text-align: center;
          position: relative;
        }
        
        .header::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 40px;
          background: var(--card-bg);
          border-radius: 50% 50% 0 0 / 100% 100% 0 0;
          transform: translateY(50%);
        }
        
        .logo {
          width: 60px;
          height: 60px;
          margin: 0 auto 16px;
          background-color: rgba(255, 255, 255, 0.2);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
        }
        
        .header h1 {
          margin: 0;
          font-size: 24px;
          font-weight: 700;
          letter-spacing: -0.025em;
        }
        
        .header p {
          margin: 8px 0 0;
          opacity: 0.9;
          font-size: 16px;
          font-weight: 500;
        }
        
        .content {
          padding: 20px 24px 40px;
          position: relative;
          z-index: 1;
        }
        
        .card {
          background-color: var(--card-bg);
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          padding: 24px;
          margin-bottom: 24px;
          border: 1px solid var(--border-light);
        }
        
        .card-title {
          font-size: 16px;
          font-weight: 600;
          color: var(--text-medium);
          margin-bottom: 16px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .summary-card {
          text-align: center;
          padding: 32px 24px;
        }
        
        .total-revenue {
          font-size: 42px;
          font-weight: 700;
          color: var(--primary-color);
          margin: 0;
          letter-spacing: -0.025em;
        }
        
        .growth-indicator {
          display: inline-flex;
          align-items: center;
          margin-top: 12px;
          padding: 6px 14px;
          border-radius: 20px;
          font-size: 14px;
          font-weight: 500;
          gap: 6px;
        }
        
        .positive {
          background-color: rgba(16, 185, 129, 0.1);
          color: var(--success-color);
        }
        
        .negative {
          background-color: rgba(239, 68, 68, 0.1);
          color: var(--danger-color);
        }
        
        .neutral {
          background-color: rgba(148, 163, 184, 0.1);
          color: var(--text-medium);
        }
        
        .revenue-breakdown {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        
        .revenue-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        
        .revenue-label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 500;
        }
        
        .revenue-value {
          font-weight: 600;
          color: var(--text-dark);
        }
        
        .revenue-bar-container {
          height: 8px;
          background-color: var(--bg-light);
          border-radius: 4px;
          overflow: hidden;
          margin-top: 8px;
        }
        
        .revenue-bar {
          height: 100%;
          border-radius: 4px;
        }
        
        .membership-bar {
          background-color: var(--primary-color);
        }
        
        .shop-bar {
          background-color: var(--warning-color);
        }
        
        .comparison-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-top: 8px;
        }
        
        .comparison-item {
          background-color: var(--bg-light);
          border-radius: 8px;
          padding: 16px;
          text-align: center;
        }
        
        .comparison-label {
          font-size: 13px;
          color: var(--text-medium);
          margin-bottom: 8px;
        }
        
        .comparison-value {
          font-size: 20px;
          font-weight: 600;
          color: var(--text-dark);
          margin-bottom: 4px;
        }
        
        .comparison-growth {
          font-size: 13px;
          font-weight: 500;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
        }
        
        .goal-container {
          margin-top: 16px;
        }
        
        .goal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }
        
        .goal-title {
          font-weight: 600;
          color: var(--text-dark);
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .goal-percentage {
          font-weight: 600;
          color: ${goalAchieved ? 'var(--success-color)' : 'var(--warning-color)'};
        }
        
        .progress-container {
          height: 8px;
          background-color: var(--bg-light);
          border-radius: 4px;
          overflow: hidden;
        }
        
        .progress-bar {
          height: 100%;
          background-color: ${goalAchieved ? 'var(--success-color)' : 'var(--warning-color)'};
          width: ${Math.min(100, (totalRevenue / (revenueGoal || 1)) * 100)}%;
          border-radius: 4px;
        }
        
        .progress-labels {
          display: flex;
          justify-content: space-between;
          margin-top: 8px;
          font-size: 13px;
          color: var(--text-medium);
        }
        
        .footer {
          background-color: var(--bg-light);
          padding: 24px;
          text-align: center;
          color: var(--text-medium);
          font-size: 13px;
          border-top: 1px solid var(--border-light);
        }
        
        .footer p {
          margin: 4px 0;
        }
        
        .brand {
          font-weight: 600;
          color: var(--primary-color);
        }
        
        @media (max-width: 600px) {
          .container {
            border-radius: 0;
          }
          
          .comparison-grid {
            grid-template-columns: 1fr;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">💰</div>
          <h1>${gymName}</h1>
          <p>Revenue Report • ${formattedMonth} ${year}</p>
        </div>
        
        <div class="content">
          <div class="card summary-card">
            <p class="total-revenue">${formatCurrency(totalRevenue)}</p>
            <div class="growth-indicator ${totalGrowth > 0 ? 'positive' : totalGrowth < 0 ? 'negative' : 'neutral'}">
              ${getGrowthEmoji(totalGrowth)} ${totalGrowth > 0 ? '+' : ''}${totalGrowth}% vs ${previousMonth}
            </div>
          </div>
          
          <div class="card">
            <div class="card-title">📊 Revenue Breakdown</div>
            
            <div class="revenue-breakdown">
              <div>
                <div class="revenue-item">
                  <div class="revenue-label">
                    <span style="color: var(--primary-color)">●</span> Membership
                  </div>
                  <div class="revenue-value">${formatCurrency(membershipRevenue)}</div>
                </div>
                <div class="revenue-bar-container">
                  <div class="revenue-bar membership-bar" style="width: ${membershipPercentage}%"></div>
                </div>
              </div>
              
              <div>
                <div class="revenue-item">
                  <div class="revenue-label">
                    <span style="color: var(--warning-color)">●</span> Shop Sales
                  </div>
                  <div class="revenue-value">${formatCurrency(shopRevenue)}</div>
                </div>
                <div class="revenue-bar-container">
                  <div class="revenue-bar shop-bar" style="width: ${shopPercentage}%"></div>
                </div>
              </div>
            </div>
            
            <div class="comparison-grid">
              <div class="comparison-item">
                <div class="comparison-label">Membership</div>
                <div class="comparison-value">${formatCurrency(membershipRevenue)}</div>
                <div class="comparison-growth ${membershipGrowth > 0 ? 'positive' : membershipGrowth < 0 ? 'negative' : 'neutral'}">
                  ${getGrowthEmoji(membershipGrowth)} ${membershipGrowth > 0 ? '+' : ''}${membershipGrowth}%
                </div>
              </div>
              
              <div class="comparison-item">
                <div class="comparison-label">Shop Sales</div>
                <div class="comparison-value">${formatCurrency(shopRevenue)}</div>
                <div class="comparison-growth ${shopGrowth > 0 ? 'positive' : shopGrowth < 0 ? 'negative' : 'neutral'}">
                  ${getGrowthEmoji(shopGrowth)} ${shopGrowth > 0 ? '+' : ''}${shopGrowth}%
                </div>
              </div>
            </div>
          </div>
          
          ${revenueGoal > 0 ? `
          <div class="card">
            <div class="card-title">${goalAchieved ? '🎉 Goal Achieved!' : '🎯 Revenue Goal'}</div>
            
            <div class="goal-container">
              <div class="goal-header">
                <div class="goal-title">${goalAchieved ? 'Congratulations!' : 'Progress'}</div>
                <div class="goal-percentage">${Math.round((totalRevenue / revenueGoal) * 100)}%</div>
              </div>
              
              <div class="progress-container">
                <div class="progress-bar"></div>
              </div>
              
              <div class="progress-labels">
                <div>Current: ${formatCurrency(totalRevenue)}</div>
                <div>Goal: ${formatCurrency(revenueGoal)}</div>
              </div>
            </div>
          </div>
          ` : ''}
          
          <div class="card">
            <div class="card-title">💡 Insights</div>
            
            <ul style="padding-left: 20px; color: var(--text-medium);">
              ${totalGrowth > 10 ? `<li>Outstanding growth of ${totalGrowth}% compared to last month!</li>` : ''}
              ${totalGrowth > 0 && totalGrowth <= 10 ? `<li>Positive growth trend with ${totalGrowth}% increase.</li>` : ''}
              ${totalGrowth < 0 ? `<li>Revenue decreased by ${Math.abs(totalGrowth)}% compared to last month.</li>` : ''}
              ${membershipGrowth > shopGrowth ? `<li>Membership revenue is growing faster than shop sales.</li>` : ''}
              ${shopGrowth > membershipGrowth ? `<li>Shop sales are growing faster than membership revenue.</li>` : ''}
              ${revenueGoal > 0 && goalAchieved ? `<li>Congratulations on achieving your monthly revenue goal!</li>` : ''}
              ${revenueGoal > 0 && !goalAchieved && (totalRevenue / revenueGoal) > 0.8 ? `<li>You're close to reaching your monthly revenue goal!</li>` : ''}
            </ul>
          </div>
        </div>
        
        <div class="footer">
          <p><span class="brand">ActiveHub FlexTracker</span> • Monthly Revenue Report</p>
          <p>${formattedMonth} ${year}</p>
          <p style="margin-top: 12px; font-size: 12px;">This is an automated report. You're receiving this because you enabled monthly revenue reports.</p>
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
    // Create directory if it doesn't exist
    const dir = path.dirname(outputPath);
    await mkdirAsync(dir, { recursive: true });
    
    console.log(`📄 Generating PDF report at: ${outputPath}`);
    console.log(`💻 Using platform: ${process.platform}`);
    
    // Use our enhanced utility function to get a properly configured browser
    try {
      browser = await getBrowser();
      console.log('✅ Puppeteer browser launched successfully');
    } catch (browserError) {
      console.error('❌ Failed to launch Puppeteer browser:', browserError.message);
      
      // Try with a different approach for Windows
      if (process.platform === 'win32') {
        console.log('🛠 Trying alternative browser launch method for Windows...');
        const puppeteer = require('puppeteer');
        browser = await puppeteer.launch({
          headless: 'new',
          args: ['--no-sandbox']
        });
        console.log('✅ Alternative browser launch succeeded');
      } else {
        throw browserError; // Re-throw if not on Windows
      }
    }
    
    // Create a new page and set the content
    const page = await browser.newPage();
    await page.setContent(html, { 
      waitUntil: 'networkidle0',
      timeout: 30000 // Increase timeout to 30 seconds
    });
    
    // Set PDF options with better quality
    const pdfOptions = {
      path: outputPath,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: '20px',
        right: '20px',
        bottom: '20px',
        left: '20px'
      },
      // Improve PDF quality
      scale: 1.0,
      omitBackground: false
    };
    
    // Generate PDF with timeout handling
    console.log('💾 Generating PDF file...');
    await Promise.race([
      page.pdf(pdfOptions),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('PDF generation timeout')), 45000)
      )
    ]);
    
    console.log(`✅ PDF generated successfully at: ${outputPath}`);
    return outputPath;
  } catch (error) {
    console.error('❌ Error generating PDF report:', error.message);
    console.error('Stack trace:', error.stack);
    // Instead of throwing, return null to allow email to be sent without PDF
    return null;
  } finally {
    // Always close the browser to prevent memory leaks
    if (browser) {
      try {
        await browser.close();
        console.log('🔒 Browser closed successfully');
      } catch (closeError) {
        console.error('Error closing browser:', closeError.message);
      }
    }
  }
};

/**
 * Send monthly revenue report email
 * @param {Object} admin - Admin object with email
 * @param {string} html - HTML content
 * @param {string|null} pdfPath - Path to PDF attachment (or null if no PDF)
 * @param {number} month - Month index (0-11)
 * @param {number} year - Year
 * @returns {Promise<boolean>} Success status
 */
const sendReportEmail = async (admin, html, pdfPath, month, year) => {
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  
  // Skip if admin email is missing
  if (!admin.email) {
    console.error(`Cannot send report email: Admin ${admin._id} has no email address`);
    return false;
  }
  
  console.log(`📧 Preparing to send monthly report email to ${admin.email} for ${monthNames[month]} ${year}`);
  
  // Verify email credentials are available
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
    console.error('❌ EMAIL CREDENTIALS MISSING: Cannot send monthly report without proper credentials');
    console.log('Email User:', process.env.EMAIL_USER ? 'Set' : 'Not Set');
    console.log('Email Password:', process.env.EMAIL_PASSWORD ? 'Set' : 'Not Set');
    return false;
  }
  
  // Use the emailService's transporter instead of creating a new one
  const emailService = require('./emailService');
  const transporter = emailService.transporter; // Get the transporter directly
  
  // Create mail options
  const mailOptions = {
    from: `"ActiveHub FlexTracker" <${process.env.EMAIL_USER}>`,
    to: admin.email,
    subject: `Monthly Revenue Report - ${monthNames[month]} ${year}`,
    html: html,
    // Set high priority
    priority: 'high',
    headers: {
      'X-Priority': '1',
      'X-MSMail-Priority': 'High',
      'Importance': 'High'
    }
  };
  
  console.log(`📧 Mail options prepared for ${admin.email}:`);
  console.log(`- Subject: ${mailOptions.subject}`);
  console.log(`- From: ${mailOptions.from}`);
  console.log(`- To: ${mailOptions.to}`);
  
  try {
    // If PDF is needed, generate it temporarily
    let tempPdfPath = null;
    let pdfGenerationSuccessful = false;
    
    if (pdfPath === null) {
      try {
        // Create a temporary directory for PDFs if it doesn't exist
        const tempDir = path.join(__dirname, '../temp');
        await mkdirAsync(tempDir, { recursive: true });
        
        // Generate a temporary filename
        tempPdfPath = path.join(tempDir, `temp-report-${admin._id}-${Date.now()}.pdf`);
        
        // Generate the PDF
        console.log(`📝 Generating PDF report for ${admin.gymName || admin.email}`);
        const generatedPdfPath = await generatePdfReport(html, tempPdfPath);
        
        // Check if PDF was actually generated
        if (generatedPdfPath) {
          try {
            // Verify the file exists
            if (fs.existsSync(generatedPdfPath)) {
              console.log(`✅ PDF generated successfully at: ${generatedPdfPath}`);
              pdfGenerationSuccessful = true;
              
              // Add the PDF attachment to mail options
              mailOptions.attachments = [
                {
                  filename: `revenue-report-${monthNames[month]}-${year}.pdf`,
                  path: generatedPdfPath,
                  contentType: 'application/pdf'
                }
              ];
            } else {
              console.log(`⚠️ PDF generation reported success but file not found. Sending email without attachment.`);
              // Don't add attachments if PDF file doesn't exist
            }
          } catch (fsError) {
            console.error(`❌ Error checking if PDF file exists: ${fsError.message}`);
            console.log('Continuing with email sending without PDF attachment...');
          }
        } else {
          console.log(`⚠️ PDF generation did not return a valid path. Sending email without attachment.`);
        }
      } catch (pdfError) {
        console.error(`❌ Error generating PDF: ${pdfError.message}`);
        console.log('Continuing with email sending without PDF attachment...');
        // Don't add attachments if PDF generation failed
      }
    } else if (pdfPath && fs.existsSync(pdfPath)) {
      // Use the provided PDF path if one was specified and exists
      console.log(`✅ Using provided PDF at: ${pdfPath}`);
      mailOptions.attachments = [
        {
          filename: `revenue-report-${monthNames[month]}-${year}.pdf`,
          path: pdfPath,
          contentType: 'application/pdf'
        }
      ];
      pdfGenerationSuccessful = true;
    } else if (pdfPath) {
      console.log(`⚠️ Provided PDF path does not exist: ${pdfPath}. Sending email without attachment.`);
    }
    
    // Send the email with retry mechanism
    let retryCount = 0;
    const maxRetries = 3;
    let success = false;
    
    // Import nodemailer directly to ensure we have access to it
    const nodemailer = require('nodemailer');
    
    // Check if we have attachments and if they exist
    if (mailOptions.attachments && mailOptions.attachments.length > 0) {
      // Verify each attachment file exists
      const validAttachments = [];
      
      for (const attachment of mailOptions.attachments) {
        try {
          // Use the fs module that's already imported at the top of the file
          if (fs.existsSync(attachment.path)) {
            console.log(`✅ Verified attachment exists: ${attachment.path}`);
            validAttachments.push(attachment);
          } else {
            console.error(`❌ Attachment file not found: ${attachment.path}`);
          }
        } catch (err) {
          console.error(`❌ Error checking attachment: ${err.message}`);
        }
      }
      
      // Replace attachments with only valid ones
      if (validAttachments.length > 0) {
        mailOptions.attachments = validAttachments;
      } else {
        console.log(`⚠️ No valid attachments found. Sending email without attachments.`);
        delete mailOptions.attachments;
      }
    }
    
    // Create a dedicated transporter for this email
    const directTransporter = nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE || 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      },
      debug: false // Set to true only for debugging
    });
    
    console.log(`📧 Created new transporter for ${admin.email}`);
    console.log(`- Using email: ${process.env.EMAIL_USER}`);
    console.log(`- Email password set: ${process.env.EMAIL_PASSWORD ? 'Yes' : 'No'}`);
    
    // Try to send the email with retries
    while (!success && retryCount < maxRetries) {
      try {
        console.log(`📧 Sending email to ${admin.email} (attempt ${retryCount + 1}/${maxRetries})`);
        
        // Send the email using the direct transporter
        const info = await directTransporter.sendMail(mailOptions);
        console.log(`✅ Email sent with ID: ${info.messageId || 'unknown'}`);
        
        success = true;
        console.log(`✅ Monthly report email sent successfully to ${admin.email}`);
      } catch (sendError) {
        retryCount++;
        console.error(`❌ Error sending email (attempt ${retryCount}/${maxRetries}):`, sendError.message);
        
        // If this is the last retry and we have attachments, try without them
        if (retryCount >= maxRetries && mailOptions.attachments) {
          console.log(`⚠️ Final attempt: trying without attachments`);
          delete mailOptions.attachments;
          retryCount--; // Give one more chance
        } else if (retryCount >= maxRetries) {
          throw sendError; // Rethrow after all retries failed
        }
        
        console.log(`⏳ Retry attempt ${retryCount}/${maxRetries} after error: ${sendError.message}`);
        // Wait before retrying (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount)));
      }
    }
    
    // Delete the temporary PDF file if we created one
    if (tempPdfPath) {
      fs.unlink(tempPdfPath, (err) => {
        if (err) {
          console.error(`Error deleting temporary PDF file: ${err}`);
        } else {
          console.log(`Temporary PDF file deleted: ${tempPdfPath}`);
        }
      });
    }
    
    return true;
  } catch (error) {
    console.error(`🚨 Error sending monthly report email to ${admin.email}:`, error);
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
    // Validate admin object
    if (!admin || !admin._id) {
      console.error('Invalid admin object provided to processGymMonthlyReport');
      return false;
    }
    
    // Validate admin email
    if (!admin.email) {
      console.log(`⚠️ Skipping gym ${admin._id}: No email address found`);
      return false;
    }
    
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    
    // Calculate previous month (for growth calculation)
    const previousMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const previousYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    
    // Get gym settings with a default fallback
    let gymSettings;
    try {
      gymSettings = await GymSettings.findOne({ gymId: admin._id });
      
      // If no settings found, create default settings
      if (!gymSettings) {
        console.log(`⚠️ No gym settings found for ${admin.gymName || admin.email}. Creating default settings.`);
        gymSettings = {
          enableMonthlyReports: true,  // Enable by default
          monthlyRevenueGoal: 0       // No goal by default
        };
      }
    } catch (settingsError) {
      console.error(`Error fetching gym settings for ${admin._id}:`, settingsError);
      // Create default settings if there was an error
      gymSettings = {
        enableMonthlyReports: true,
        monthlyRevenueGoal: 0
      };
    }
    
    // Always send reports during manual runs, regardless of settings
    // This ensures all gyms get reports when manually triggered
    
    // Get current month revenue data with error handling
    let currentRevenue;
    try {
      currentRevenue = await getMonthlyRevenue(admin._id, currentMonth, currentYear);
    } catch (revenueError) {
      console.error(`Error getting current revenue for ${admin.gymName || admin.email}:`, revenueError);
      // Provide default values to continue processing
      currentRevenue = {
        membershipRevenue: 0,
        shopRevenue: 0,
        totalRevenue: 0
      };
    }
    
    // Get previous month revenue data with error handling
    let previousRevenue;
    try {
      previousRevenue = await getMonthlyRevenue(admin._id, previousMonth, previousYear);
    } catch (prevRevenueError) {
      console.error(`Error getting previous revenue for ${admin.gymName || admin.email}:`, prevRevenueError);
      // Provide default values to continue processing
      previousRevenue = {
        membershipRevenue: 0,
        shopRevenue: 0,
        totalRevenue: 0
      };
    }
    
    // Calculate growth percentages with safety checks
    const membershipGrowth = calculateGrowth(currentRevenue.membershipRevenue, previousRevenue.membershipRevenue);
    const shopGrowth = calculateGrowth(currentRevenue.shopRevenue, previousRevenue.shopRevenue);
    const totalGrowth = calculateGrowth(currentRevenue.totalRevenue, previousRevenue.totalRevenue);
    
    // Get monthly revenue goal with fallback
    const revenueGoal = (gymSettings.monthlyRevenueGoal || 0);
    const goalAchieved = revenueGoal > 0 && currentRevenue.totalRevenue >= revenueGoal;
    
    // Create or update monthly revenue record with error handling
    try {
      await MonthlyRevenue.findOneAndUpdate(
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
    } catch (dbError) {
      // Log error but continue processing to send email
      console.error(`Error saving monthly revenue record for ${admin.gymName || admin.email}:`, dbError);
    }
    
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
    
    if (emailSent) {
      console.log(`✅ Monthly revenue report successfully sent to ${admin.gymName || admin.email} (${admin._id})`);
    } else {
      console.error(`❌ Failed to send monthly report email to ${admin.gymName || admin.email} (${admin._id})`);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error(`❌ Error processing monthly report for gym ${admin._id || 'unknown'}:`, error);
    return false;
  }
};

/**
 * Main function to process monthly revenue reports for all gyms
 * This is run automatically on the last day of each month via cron job
 * @param {boolean} force - If true, run regardless of date (for manual triggering)
 * @param {number} specificMonth - Optional specific month to generate reports for (0-11)
 * @param {number} specificYear - Optional specific year to generate reports for
 * @returns {Promise<number>} Number of successfully processed reports
 */
const processMonthlyReports = async (force = false, specificMonth = null, specificYear = null) => {
  try {
    console.log('🔄 Starting monthly revenue reports process...');
    
    // Only run on the last day of the month unless forced
    if (!force && !isLastDayOfMonth()) {
      console.log('📅 Not the last day of the month. Skipping monthly reports.');
      return 0;
    }
    
    console.log('📊 Processing monthly revenue reports for all gyms...');
    
    const today = new Date();
    const currentMonth = specificMonth !== null ? specificMonth : today.getMonth();
    const currentYear = specificYear !== null ? specificYear : today.getFullYear();
    
    const monthName = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ][currentMonth];
    
    console.log(`📆 Generating reports for ${monthName} ${currentYear}`);
    
    // Get all gym admins with error handling
    let admins = [];
    try {
      admins = await Admin.find();
      
      // Validate the admin data
      admins = admins.filter(admin => admin && admin._id);
      
      if (!admins || admins.length === 0) {
        console.log('❌ No valid gyms found to process reports for.');
        return 0;
      }
    } catch (adminError) {
      console.error('🚨 Error fetching admin data:', adminError);
      return 0;
    }
    
    console.log(`🏋️ Found ${admins.length} gyms to process`);
    
    // Process reports for each gym with a delay between each to avoid overwhelming the email service
    const results = [];
    const failedGyms = [];
    
    // Use Promise.allSettled to process all gyms and continue even if some fail
    for (const admin of admins) {
      try {
        // Add more detailed logging
        console.log(`⏳ Processing gym: ${admin.gymName || admin.email || admin._id}`);
        console.log(`  - Email: ${admin.email || 'No email'}`);
        console.log(`  - ID: ${admin._id}`);
        
        // Process this gym's report
        const result = await processGymMonthlyReport(admin);
        results.push(result);
        
        if (!result) {
          failedGyms.push(admin.gymName || admin.email || admin._id);
        }
        
        // Add a delay between processing each gym to avoid overwhelming services
        await new Promise(resolve => setTimeout(resolve, 1500)); // Increased delay to 1.5 seconds
      } catch (gymError) {
        console.error(`🚨 Error processing gym ${admin.gymName || admin.email || admin._id}:`, gymError);
        results.push(false);
        failedGyms.push(admin.gymName || admin.email || admin._id);
      }
    }
    
    const successful = results.filter(result => result).length;
    console.log(`✅ Monthly reports completed. Successfully processed ${successful} of ${admins.length} gyms.`);
    
    // Log failed gyms for troubleshooting
    if (failedGyms.length > 0) {
      console.log('⚠️ The following gyms failed processing:');
      failedGyms.forEach((gym, index) => {
        console.log(`  ${index + 1}. ${gym}`);
      });
    }
    
    // Save a record of the report generation
    try {
      // You could create a model to store a record of report runs
      // For now, just log it
      console.log(`📝 Report generation complete: ${new Date().toISOString()}`);
      console.log(`   Month: ${monthName} ${currentYear}`);
      console.log(`   Total gyms: ${admins.length}`);
      console.log(`   Successful: ${successful}`);
      console.log(`   Failed: ${admins.length - successful}`);
    } catch (recordError) {
      console.error('Error saving report generation record:', recordError);
    }
    
    return successful;
  } catch (error) {
    console.error('🚨 Fatal error processing monthly revenue reports:', error);
    return 0;
  }
};

module.exports = {
  processMonthlyReports,
  processGymMonthlyReport,
  isLastDayOfMonth,
  generateReportHtml,
  generatePdfReport
}; 