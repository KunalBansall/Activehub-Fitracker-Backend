const mongoose = require('mongoose');
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

// Month names for formatting
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// Format currency consistently
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
};

/**
 * Check if today is the first day of the month
 * @returns {boolean} True if today is the first day of the month
 */
const isFirstDayOfMonth = () => {
  const today = new Date();
  return today.getDate() === 1;
};

/**
 * Check if today is the last day of the month
 * Improved to be more reliable with timezone considerations
 * @returns {boolean} True if today is the last day of the month
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
 * Get comprehensive revenue data for a specific month and year
 * @param {ObjectId} gymId - The gym's ID
 * @param {number} month - Month (0-11)
 * @param {number} year - Year
 * @returns {Promise<Object>} Detailed revenue data
 */
const getCurrentMonthRevenueData = async (gymId, month, year) => {
  // First day of the month
  const startDate = new Date(year, month, 1);
  startDate.setHours(0, 0, 0, 0);
  
  // Last day of the month
  const endDate = new Date(year, month + 1, 0);
  endDate.setHours(23, 59, 59, 999);
  
  // Get expected membership revenue (all active members)
  const expectedMembershipRevenue = await Member.aggregate([
    {
      $match: {
        gymId,
        status: 'active',
        createdAt: { $lte: endDate }
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$fees' }
      }
    }
  ]);
  
  // Get collected membership revenue (only paid members)
  const collectedMembershipRevenue = await Member.aggregate([
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
  
  // Get expected shop revenue (all orders)
  const expectedShopRevenue = await Order.aggregate([
    {
      $match: {
        gymId,
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
  
  // Get collected shop revenue (only delivered orders)
  const collectedShopRevenue = await Order.aggregate([
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
  const totalExpectedMembershipRevenue = expectedMembershipRevenue[0]?.total || 0;
  const totalCollectedMembershipRevenue = collectedMembershipRevenue[0]?.total || 0;
  const pendingMembershipRevenue = totalExpectedMembershipRevenue - totalCollectedMembershipRevenue;
  
  const totalExpectedShopRevenue = expectedShopRevenue[0]?.total || 0;
  const totalCollectedShopRevenue = collectedShopRevenue[0]?.total || 0;
  const pendingShopRevenue = totalExpectedShopRevenue - totalCollectedShopRevenue;
  
  const totalExpectedRevenue = totalExpectedMembershipRevenue + totalExpectedShopRevenue;
  const totalCollectedRevenue = totalCollectedMembershipRevenue + totalCollectedShopRevenue;
  const totalRemainingRevenue = pendingMembershipRevenue + pendingShopRevenue;
  
  // Calculate collection rate
  const collectionRate = totalExpectedRevenue > 0 
    ? Math.round((totalCollectedRevenue / totalExpectedRevenue) * 100) 
    : 100;
  
  return {
    // Expected revenue
    expectedMembershipRevenue: totalExpectedMembershipRevenue,
    expectedShopRevenue: totalExpectedShopRevenue,
    totalExpectedRevenue,
    
    // Collected revenue
    collectedMembershipRevenue: totalCollectedMembershipRevenue,
    collectedShopRevenue: totalCollectedShopRevenue,
    totalCollectedRevenue,
    
    // Pending revenue
    pendingMembershipRevenue,
    pendingShopRevenue,
    totalRemainingRevenue,
    
    // Collection rate
    collectionRate
  };
};

/**
 * Get simple revenue data for a specific month and year (legacy support)
 * @param {ObjectId} gymId - The gym's ID
 * @param {number} month - Month (0-11)
 * @param {number} year - Year
 * @returns {Promise<Object>} Revenue data
 */
const getMonthlyRevenue = async (gymId, month, year) => {
  const revenueData = await getCurrentMonthRevenueData(gymId, month, year);
  
  return {
    membershipRevenue: revenueData.collectedMembershipRevenue,
    shopRevenue: revenueData.collectedShopRevenue,
    totalRevenue: revenueData.totalCollectedRevenue
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
 * Archive the current month's revenue data
 * @param {string} gymId - The gym's ID
 * @returns {Promise<Object>} The archived revenue data
 */
const archiveCurrentMonthRevenue = async (gymId) => {
  try {
    // Get the previous month (we're archiving the month that just ended)
    const today = new Date();
    let month, year;
    
    if (today.getDate() === 1) {
      // If today is the 1st of the month, we archive the previous month
      if (today.getMonth() === 0) { // January
        month = 11; // December
        year = today.getFullYear() - 1;
      } else {
        month = today.getMonth() - 1;
        year = today.getFullYear();
      }
    } else {
      // For testing or manual archiving, use current month
      month = today.getMonth();
      year = today.getFullYear();
    }
    
    // Get the month name
    const monthName = `${MONTH_NAMES[month]} ${year}`;
    
    // Get the revenue data for the month
    const revenueData = await getCurrentMonthRevenueData(gymId, month, year);
    
    // Get gym settings for revenue goal
    const gymSettings = await GymSettings.findOne({ gymId });
    const revenueGoal = gymSettings?.monthlyRevenueGoal || 0;
    const goalAchieved = revenueData.totalCollectedRevenue >= revenueGoal;
    
    // Get previous month's data for growth calculation
    let previousMonthData;
    if (month === 0) { // January
      previousMonthData = await MonthlyRevenue.findOne({ 
        gymId, 
        month: 11, // December
        year: year - 1 
      });
    } else {
      previousMonthData = await MonthlyRevenue.findOne({ 
        gymId, 
        month: month - 1, 
        year 
      });
    }
    
    // Calculate growth rates
    const membershipGrowth = calculateGrowth(
      revenueData.collectedMembershipRevenue,
      previousMonthData?.collectedMembershipRevenue || 0
    );
    
    const shopGrowth = calculateGrowth(
      revenueData.collectedShopRevenue,
      previousMonthData?.collectedShopRevenue || 0
    );
    
    const totalGrowth = calculateGrowth(
      revenueData.totalCollectedRevenue,
      previousMonthData?.totalCollectedRevenue || 0
    );
    
    // Create or update the monthly revenue record
    const monthlyRevenue = await MonthlyRevenue.findOneAndUpdate(
      { gymId, month, year },
      {
        gymId,
        month,
        year,
        monthName,
        // Expected revenue
        expectedMembershipRevenue: revenueData.expectedMembershipRevenue,
        expectedShopRevenue: revenueData.expectedShopRevenue,
        totalExpectedRevenue: revenueData.totalExpectedRevenue,
        // Collected revenue
        collectedMembershipRevenue: revenueData.collectedMembershipRevenue,
        collectedShopRevenue: revenueData.collectedShopRevenue,
        totalCollectedRevenue: revenueData.totalCollectedRevenue,
        // Pending revenue
        pendingMembershipRevenue: revenueData.pendingMembershipRevenue,
        pendingShopRevenue: revenueData.pendingShopRevenue,
        totalRemainingRevenue: revenueData.totalRemainingRevenue,
        // Growth metrics
        membershipGrowth,
        shopGrowth,
        totalGrowth,
        // Goal tracking
        revenueGoal,
        goalAchieved,
        // Collection rate
        collectionRate: revenueData.collectionRate,
        // Metadata
        archivedAt: new Date(),
        emailSent: false
      },
      { new: true, upsert: true }
    );
    
    return monthlyRevenue;
  } catch (error) {
    console.error('Error archiving monthly revenue:', error);
    throw error;
  }
};

/**
 * Initialize a new month's revenue tracking
 * @param {string} gymId - The gym's ID
 * @returns {Promise<void>}
 */
const initializeNewMonth = async (gymId) => {
  try {
    // No action needed here as we calculate current month data on-the-fly
    // The archiving process already saves the previous month's data
    console.log(`New month initialized for gym ${gymId}`);
  } catch (error) {
    console.error('Error initializing new month:', error);
    throw error;
  }
};

/**
 * Generate HTML for the monthly report email
 * @param {Object} data - Revenue data and gym info
 * @returns {string} HTML content
 */
const generateReportHtml = (data) => {
  const {
    gymName,
    monthName,
    collectedMembershipRevenue,
    collectedShopRevenue,
    totalCollectedRevenue,
    expectedMembershipRevenue,
    expectedShopRevenue,
    totalExpectedRevenue,
    pendingMembershipRevenue,
    totalRemainingRevenue,
    membershipGrowth,
    shopGrowth,
    totalGrowth,
    revenueGoal,
    goalAchieved,
    collectionRate
  } = data;
  
  const getGrowthEmoji = (growth) => {
    if (growth > 10) return '🚀';
    if (growth > 0) return '📈';
    if (growth < 0) return '📉';
    return '➡️';
  };
  
  // Calculate percentages for the revenue breakdown chart
  const totalRevenueNonZero = totalCollectedRevenue || 1; // Prevent division by zero
  const membershipPercentage = Math.round((collectedMembershipRevenue / totalRevenueNonZero) * 100);
  const shopPercentage = Math.round((collectedShopRevenue / totalRevenueNonZero) * 100);
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${gymName} - Revenue Report for ${monthName}</title>
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
            <ul style="padding-left: 20px; color: var(--text-medium);">
              ${totalGrowth > 10 ? `<li>Outstanding growth of ${totalGrowth}% compared to last month!</li>` : ''}
              ${totalGrowth > 0 && totalGrowth <= 10 ? `<li>Positive growth trend with ${totalGrowth}% increase.</li>` : ''}
              ${totalGrowth < 0 ? `<li>Revenue decreased by ${Math.abs(totalGrowth)}% compared to last month.</li>` : ''}
              ${collectionRate < 80 ? `<li>Your collection rate is ${collectionRate}%. Consider following up on pending payments.</li>` : ''}
              ${collectionRate >= 95 ? `<li>Excellent collection rate of ${collectionRate}%!</li>` : ''}
              ${membershipGrowth > shopGrowth ? `<li>Membership revenue is growing faster than shop revenue.</li>` : ''}
              ${shopGrowth > membershipGrowth ? `<li>Shop revenue is growing faster than membership revenue.</li>` : ''}
              ${goalAchieved ? `<li>Congratulations on achieving your revenue goal!</li>` : ''}
              ${!goalAchieved && collectionRate > 90 ? `<li>You're on track with a high collection rate, but still below your revenue goal.</li>` : ''}
            </ul>
              ${revenueGoal > 0 && !goalAchieved && (totalCollectedRevenue / revenueGoal) > 0.8 ? `<li>You're close to reaching your monthly revenue goal!</li>` : ''}
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
    console.error('Error in processMonthlyReports:', error);
    return 0;
  }
};

/**
 * Get archived monthly revenue data
 * @param {string} gymId - The gym's ID
 * @param {number} month - Month (0-11), optional - if not provided, returns all months
 * @param {number} year - Year, optional - if not provided, returns all years
 * @returns {Promise<Array>} Array of monthly revenue data
 */
const getArchivedMonthlyRevenue = async (gymId, month, year) => {
  try {
    const query = { gymId };
    
    if (month !== undefined && year !== undefined) {
      query.month = month;
      query.year = year;
      return await MonthlyRevenue.findOne(query);
    }
    
    if (year !== undefined) {
      query.year = year;
    }
    
    // Return all archived data for the gym, sorted by date (newest first)
    return await MonthlyRevenue.find(query).sort({ year: -1, month: -1 });
  } catch (error) {
    console.error('Error getting archived monthly revenue:', error);
    throw error;
  }
};

/**
 * Send monthly revenue report email to gym admin
 * @param {string} gymId - The gym's ID
 * @param {string} adminEmail - Admin's email address
 * @param {Object} monthlyRevenueData - The monthly revenue data to include in the email
 * @returns {Promise<boolean>} - True if email sent successfully, false otherwise
 */
const sendMonthlyReportEmail = async (gymId, adminEmail, monthlyRevenueData) => {
  try {
    if (!adminEmail) {
      console.error('No admin email provided for sending monthly report');
      return false;
    }
    
    // Get gym settings for email configuration
    const gymSettings = await GymSettings.findOne({ gymId });
    
    if (!gymSettings) {
      console.error(`No gym settings found for gym ${gymId}`);
      return false;
    }
    
    // Get gym details
    const gymDetails = await Admin.findById(gymId);
    const gymName = gymDetails?.gymName || 'Your Gym';
    
    // If no revenue data is provided, get the current month's data
    const revenueData = monthlyRevenueData || await getCurrentMonthRevenueData(gymId);
    
    if (!revenueData) {
      console.error(`Failed to get revenue data for gym ${gymId}`);
      return false;
    }
    
    // Generate HTML content for the email
    const htmlContent = await generateReportHtml(gymId, revenueData, gymName);
    
    // Configure email transport
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: process.env.EMAIL_PORT || 587,
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
    
    // Get the current date and month name
    const currentDate = new Date();
    const monthName = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(currentDate);
    const year = currentDate.getFullYear();
    
    // Send the email
    const mailOptions = {
      from: `"${gymName} Revenue Report" <${process.env.EMAIL_USER}>`,
      to: adminEmail,
      subject: `Monthly Revenue Report - ${monthName} ${year}`,
      html: htmlContent,
      attachments: [
        // You could add PDF attachments here if needed
      ]
    };
    
    const info = await transporter.sendMail(mailOptions);
    console.log(`📧 Monthly revenue report email sent to ${adminEmail}: ${info.messageId}`);
    
    return true;
  } catch (error) {
    console.error('Error sending monthly report email:', error);
    return false;
  }
};

module.exports = {
  getMonthlyRevenue,
  getCurrentMonthRevenueData,
  calculateGrowth,
  generateReportHtml,
  archiveCurrentMonthRevenue,
  initializeNewMonth,
  sendMonthlyReportEmail,
  processMonthlyReports,
  getArchivedMonthlyRevenue,
  isFirstDayOfMonth,
  isLastDayOfMonth
};