const Member = require('../models/Member');
const Order = require('../models/Order');
const GymSettings = require('../models/GymSettings');
const MonthlyRevenue = require('../models/MonthlyRevenue');
const { processGymMonthlyReport } = require('../services/monthlyRevenueService');

/**
 * Get revenue overview for the admin dashboard
 * Calculates total membership revenue, shop revenue, expected revenue,
 * collected revenue, and remaining revenue to be collected
 */
exports.getRevenueOverview = async (req, res) => {
  try {
    const adminGymId = req.admin._id;

    // Get all members data for calculating expected revenue (total members * fees)
    const membersData = await Member.find({ gymId: adminGymId });
    
    // Calculate membership expected revenue (sum of all members' fees)
    const membershipExpectedRevenue = membersData.reduce((total, member) => total + member.fees, 0);
    
    // Get total shop revenue (all orders regardless of status)
    const totalShopResult = await Order.aggregate([
      { $match: { gymId: adminGymId } },
      { $group: {
          _id: null,
          totalShopRevenue: { $sum: '$totalAmount' }
        }
      }
    ]);
    
    // Get membership revenue (sum of all member fees with paid status)
    const membershipResult = await Member.aggregate([
      { $match: { gymId: adminGymId } },
      { $group: {
          _id: null,
          totalMembershipRevenue: { $sum: '$fees' },
          collectedMembershipRevenue: {
            $sum: {
              $cond: [{ $eq: ['$feeStatus', 'paid'] }, '$fees', 0]
            }
          },
          pendingMembershipRevenue: {
            $sum: {
              $cond: [{ $eq: ['$feeStatus', 'due'] }, '$fees', 0]
            }
          }
        }
      }
    ]);

    // Get collected shop revenue (from delivered orders only)
    const collectedShopResult = await Order.aggregate([
      { $match: { 
          gymId: adminGymId,
          status: 'delivered'
        } 
      },
      { $group: {
          _id: null,
          collectedShopRevenue: { $sum: '$totalAmount' }
        }
      }
    ]);

    // Extract values or set defaults
    const totalMembershipRevenue = membershipResult[0]?.totalMembershipRevenue || 0;
    const collectedMembershipRevenue = membershipResult[0]?.collectedMembershipRevenue || 0;
    const pendingMembershipRevenue = membershipResult[0]?.pendingMembershipRevenue || 0;
    const totalShopRevenue = totalShopResult[0]?.totalShopRevenue || 0;
    const collectedShopRevenue = collectedShopResult[0]?.collectedShopRevenue || 0;
    
    // Calculate totals
    const totalExpectedRevenue = membershipExpectedRevenue + totalShopRevenue;
    const totalCollectedRevenue = collectedMembershipRevenue + collectedShopRevenue;
    const remainingRevenue = Math.max(0, totalExpectedRevenue - totalCollectedRevenue);

    res.json({
      totalMembershipRevenue,
      totalShopRevenue,
      collectedShopRevenue,
      totalExpectedRevenue,
      totalCollectedRevenue,
      remainingRevenue,
      pendingMembershipRevenue,
      collectedMembershipRevenue
    });
  } catch (error) {
    console.error('Error getting revenue overview:', error);
    res.status(500).json({ message: 'Failed to get revenue overview' });
  }
};

/**
 * Get revenue trends based on selected interval (weekly or monthly)
 * Groups revenue data by the selected interval for trend analysis
 */
exports.getRevenueTrends = async (req, res) => {
  try {
    const adminGymId = req.admin._id;
    const { interval = 'monthly' } = req.query;
    
    // Set format based on interval
    let dateFormat = '%Y-%m';
    let periodLabel = 'month';
    
    if (interval === 'weekly') {
      dateFormat = '%Y-%U';
      periodLabel = 'week';
    }

    // Get membership revenue trends
    const membershipTrends = await Member.aggregate([
      { $match: { gymId: adminGymId } },
      {
        $group: {
          _id: {
            period: { $dateToString: { format: dateFormat, date: '$createdAt' } }
          },
          membershipRevenue: { $sum: '$fees' }
        }
      },
      { $sort: { '_id.period': 1 } },
      {
        $project: {
          _id: 0,
          period: '$_id.period',
          membershipRevenue: 1
        }
      }
    ]);

    // Get shop revenue trends (from delivered orders only)
    const shopTrends = await Order.aggregate([
      { 
        $match: { 
          gymId: adminGymId,
          status: 'delivered'
        } 
      },
      {
        $group: {
          _id: {
            period: { $dateToString: { format: dateFormat, date: '$createdAt' } }
          },
          shopRevenue: { $sum: '$totalAmount' }
        }
      },
      { $sort: { '_id.period': 1 } },
      {
        $project: {
          _id: 0,
          period: '$_id.period',
          shopRevenue: 1
        }
      }
    ]);

    // Merge the results
    const periodsSet = new Set([
      ...membershipTrends.map(item => item.period),
      ...shopTrends.map(item => item.period)
    ]);
    
    const mergedResults = Array.from(periodsSet).map(period => {
      const membershipData = membershipTrends.find(item => item.period === period) || { membershipRevenue: 0 };
      const shopData = shopTrends.find(item => item.period === period) || { shopRevenue: 0 };
      
      // Format the period label based on interval
      let formattedPeriod = period;
      if (interval === 'weekly') {
        const [year, week] = period.split('-');
        formattedPeriod = `Week ${week}, ${year}`;
      } else if (interval === 'monthly') {
        const date = new Date(period + '-01');
        formattedPeriod = date.toLocaleString('default', { month: 'long', year: 'numeric' });
      }
      
      return {
        period: formattedPeriod,
        membershipRevenue: membershipData.membershipRevenue,
        shopRevenue: shopData.shopRevenue
      };
    }).sort((a, b) => {
      // Sort results by original period string
      const periodA = membershipTrends.find(item => item.period.includes(a.period.split(',')[0]))?.period || 
                     shopTrends.find(item => item.period.includes(a.period.split(',')[0]))?.period || '';
      const periodB = membershipTrends.find(item => item.period.includes(b.period.split(',')[0]))?.period || 
                     shopTrends.find(item => item.period.includes(b.period.split(',')[0]))?.period || '';
      return periodA.localeCompare(periodB);
    });

    res.json(mergedResults);
  } catch (error) {
    console.error('Error getting revenue trends:', error);
    res.status(500).json({ message: 'Failed to get revenue trends' });
  }
};

/**
 * Get all monthly revenue reports for a gym
 */
exports.getMonthlyReports = async (req, res) => {
  try {
    const adminGymId = req.admin._id;
    
    // Get all monthly reports for this gym, sorted by date
    const reports = await MonthlyRevenue.find({ gymId: adminGymId })
      .sort({ year: -1, month: -1 })
      .lean();
    
    // Format the results for easier consumption
    const formattedReports = reports.map(report => {
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
      
      return {
        ...report,
        monthName: monthNames[report.month],
        period: `${monthNames[report.month]} ${report.year}`,
        formattedDate: new Date(report.year, report.month, 1).toISOString().split('T')[0]
      };
    });
    
    res.json(formattedReports);
  } catch (error) {
    console.error('Error getting monthly reports:', error);
    res.status(500).json({ message: 'Failed to get monthly reports' });
  }
};

/**
 * Get detailed revenue report for a specific month
 */
exports.getMonthlyReportDetail = async (req, res) => {
  try {
    const adminGymId = req.admin._id;
    const { year, month } = req.params;
    const { format } = req.query; // Optional 'pdf' format parameter
    
    // Convert params to numbers
    const yearNum = parseInt(year, 10);
    const monthNum = parseInt(month, 10);
    
    if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 0 || monthNum > 11) {
      return res.status(400).json({ message: 'Invalid year or month' });
    }
    
    // Get the monthly report
    const report = await MonthlyRevenue.findOne({
      gymId: adminGymId,
      year: yearNum,
      month: monthNum
    });
    
    if (!report) {
      return res.status(404).json({ message: 'Report not found for the specified month' });
    }
    
    // Format the response
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    
    const formattedReport = {
      ...report.toObject(),
      monthName: monthNames[report.month],
      period: `${monthNames[report.month]} ${report.year}`
    };
    
    // If PDF format is requested, generate it on demand
    if (format === 'pdf') {
      const Admin = require('../models/Admin');
      const admin = await Admin.findById(adminGymId);
      
      if (!admin) {
        return res.status(404).json({ message: 'Gym admin not found' });
      }
      
      // Import the required functions from the service
      const { generateReportHtml, generatePdfReport } = require('../services/monthlyRevenueService');
      
      // Create temporary directory for PDF
      const fs = require('fs');
      const path = require('path');
      const { promisify } = require('util');
      const mkdirAsync = promisify(fs.mkdir);
      
      const tempDir = path.join(__dirname, '../temp');
      await mkdirAsync(tempDir, { recursive: true });
      
      // Generate HTML content
      const htmlContent = generateReportHtml({
        gymName: admin.gymName || 'Your Gym',
        month: monthNum,
        year: yearNum,
        membershipRevenue: report.membershipRevenue,
        shopRevenue: report.shopRevenue,
        totalRevenue: report.totalRevenue,
        membershipGrowth: report.membershipGrowth,
        shopGrowth: report.shopGrowth,
        totalGrowth: report.totalGrowth,
        revenueGoal: report.revenueGoal,
        goalAchieved: report.goalAchieved
      });
      
      // Generate PDF
      const pdfPath = path.join(tempDir, `report-${adminGymId}-${Date.now()}.pdf`);
      await generatePdfReport(htmlContent, pdfPath);
      
      // Send the PDF as a download
      return res.download(pdfPath, `${monthNames[monthNum]}-${yearNum}-revenue-report.pdf`, (err) => {
        // Delete the temporary file after download completes or fails
        fs.unlink(pdfPath, (unlinkErr) => {
          if (unlinkErr) {
            console.error('Error deleting temporary PDF file:', unlinkErr);
          }
        });
        
        if (err) {
          console.error('Error sending PDF:', err);
          res.status(500).json({ message: 'Error generating PDF report' });
        }
      });
    }
    
    // Default JSON response
    res.json(formattedReport);
  } catch (error) {
    console.error('Error getting monthly report detail:', error);
    res.status(500).json({ message: 'Failed to get monthly report detail' });
  }
};

/**
 * Generate monthly report on demand
 */
exports.generateMonthlyReport = async (req, res) => {
  try {
    const admin = req.admin;
    
    // Generate the report for the current month
    const result = await processGymMonthlyReport(admin);
    
    if (result) {
      res.json({ 
        success: true, 
        message: 'Monthly revenue report generated and sent successfully'
      });
    } else {
      res.status(400).json({ 
        success: false, 
        message: 'Failed to generate monthly report. Make sure reports are enabled in settings.'
      });
    }
  } catch (error) {
    console.error('Error generating monthly report:', error);
    res.status(500).json({ 
      success: false, 
      message: 'An error occurred while generating the report'
    });
  }
}; 