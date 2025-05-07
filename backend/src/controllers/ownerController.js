const WebhookData = require('../models/WebhookEvent');
const Admin = require('../models/Admin');
const Payment = require('../models/Payments');
const Member = require('../models/Member');

/**
 * Get analytics summary for the owner dashboard
 */
exports.getAnalytics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Build date filter for aggregations
    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
      if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
    }

    // Get total revenue from successful payments
    const totalRevenue = await Payment.aggregate([
      { $match: { status: 'completed', ...dateFilter } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    // Get monthly revenue chart data
    const monthlyRevenueChart = await Payment.aggregate([
      { $match: { status: 'completed', ...dateFilter } },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          total: { $sum: '$amount' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
      {
        $project: {
          _id: 0,
          month: {
            $dateToString: {
              format: '%Y-%m',
              date: {
                $dateFromParts: {
                  year: '$_id.year',
                  month: '$_id.month'
                }
              }
            }
          },
          total: 1
        }
      }
    ]);

    // Get payment statistics
    const paymentStats = await Payment.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          total: { $sum: '$amount' }
        }
      }
    ]);

    // Get subscription statistics
    const subscriptionStats = await WebhookData.aggregate([
      {
        $match: {
          'subscriptionData.eventType': { 
            $in: ['subscription.created', 'subscription.renewed', 'subscription.cancelled'] 
          },
          ...dateFilter
        }
      },
      {
        $group: {
          _id: '$subscriptionData.eventType',
          count: { $sum: 1 }
        }
      }
    ]);

    // Get top plans with plan names
    const topPlans = await WebhookData.aggregate([
      { 
        $match: { 
          planName: { $exists: true, $ne: null },
          ...dateFilter
        } 
      },
      { 
        $group: { 
          _id: '$planName',
          count: { $sum: 1 }
        } 
      },
      { $sort: { count: -1 } },
      { $limit: 5 },
      {
        $project: {
          _id: 0,
          planName: '$_id',
          count: 1
        }
      }
    ]);

    // Get top paying gyms
    const topPayingGyms = await Payment.aggregate([
      { $match: { status: 'completed', ...dateFilter } },
      {
        $lookup: {
          from: 'admins',
          localField: 'adminId',
          foreignField: '_id',
          as: 'admin'
        }
      },
      { $unwind: '$admin' },
      {
        $group: {
          _id: '$adminId',
          gymName: { $first: '$admin.gymName' },
          total: { $sum: '$amount' }
        }
      },
      { $sort: { total: -1 } },
      { $limit: 5 }
    ]);

    // Format the response
    const response = {
      totalRevenue: totalRevenue[0]?.total || 0,
      monthlyRevenueChart,
      totalPayments: {
        captured: paymentStats.find(p => p._id === 'completed')?.count || 0,
        failed: paymentStats.find(p => p._id === 'failed')?.count || 0
      },
      totalRefunds: {
        count: paymentStats.find(p => p._id === 'refunded')?.count || 0,
        amount: paymentStats.find(p => p._id === 'refunded')?.total || 0
      },
      subscriptionStats: {
        created: subscriptionStats.find(s => s._id === 'subscription.created')?.count || 0,
        renewed: subscriptionStats.find(s => s._id === 'subscription.renewed')?.count || 0,
        cancelled: subscriptionStats.find(s => s._id === 'subscription.cancelled')?.count || 0
      },
      topPlans,
      topPayingGyms
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ message: 'Error fetching analytics data' });
  }
};

/**
 * Get webhook logs with filtering and pagination
 */
exports.getWebhookLogs = async (req, res) => {
  try {
    const {
      eventType,
      status,
      adminId,
      startDate,
      endDate,
      limit = 50,
      page = 1
    } = req.query;

    // Build filter object
    const filter = {};
    if (eventType) filter.event = eventType;
    if (status) filter.status = status;
    if (adminId) filter.customer_id = adminId;
    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) filter.timestamp.$gte = new Date(startDate);
      if (endDate) filter.timestamp.$lte = new Date(endDate);
    }

    // Get total count for pagination
    const totalCount = await WebhookData.countDocuments(filter);

    // Get paginated results
    const webhooks = await WebhookData.find(filter)
      .sort({ timestamp: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    res.json({
      webhooks,
      totalCount,
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalCount / limit)
    });
  } catch (error) {
    console.error('Error fetching webhook logs:', error);
    res.status(500).json({ message: 'Error fetching webhook logs' });
  }
};

/**
 * Get all gyms with additional statistics for owner dashboard
 */
exports.getAllGyms = async (req, res) => {
  try {
    const { search } = req.query;
    
    // Build query filter
    let filter = {};
    if (search) {
      // Search in multiple fields using regex for case-insensitive search
      filter = {
        $or: [
          { gymName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } }
        ]
      };
    }
    
    // Get all gyms with basic info
    const gyms = await Admin.find(filter).select('gymName email phone createdAt subscription');
    
    // Get additional stats for each gym
    const gymsWithStats = await Promise.all(gyms.map(async (gym) => {
      // Get total revenue for this gym
      const revenueData = await Payment.aggregate([
        { $match: { adminId: gym._id, status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
      ]);
      
      const totalRevenue = revenueData.length > 0 ? revenueData[0].total : 0;
      const paymentCount = revenueData.length > 0 ? revenueData[0].count : 0;
      
      // Get member count for this gym
      const memberCount = await Member.countDocuments({ gymId: gym._id });
      
      // Create a copy of the gym object to avoid modifying the original
      const gymData = {
        _id: gym._id,
        gymName: gym.gymName,
        email: gym.email,
        phone: gym.phone,
        createdAt: gym.createdAt,
        subscription: gym.subscription ? { ...gym.subscription } : {},
        totalRevenue,
        paymentCount
      };
      
      // Update the subscription object with the member count
      if (gymData.subscription) {
        gymData.subscription.memberCount = memberCount;
      } else {
        gymData.subscription = { memberCount, status: 'inactive' };
      }
      
      return gymData;
    }));
    
    res.status(200).json({
      success: true,
      gyms: gymsWithStats
    });
  } catch (error) {
    console.error('Error getting gyms:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch gyms',
      error: error.message
    });
  }
};

/**
 * Get payments for a specific gym
 */
exports.getGymPayments = async (req, res) => {
  try {
    const { adminId } = req.query;
    
    if (!adminId) {
      return res.status(400).json({
        success: false,
        message: 'Admin ID is required'
      });
    }

    // Verify the gym exists
    const gym = await Admin.findById(adminId);
    if (!gym) {
      return res.status(404).json({
        success: false,
        message: 'Gym not found'
      });
    }

    // Get payments for this gym
    const payments = await Payment.find({ adminId })
      .sort({ createdAt: -1 })
      .limit(50); // Limit to most recent 50 payments
    
    res.status(200).json({
      success: true,
      payments: payments.map(payment => ({
        _id: payment._id,
        amount: payment.amount,
        status: payment.status,
        paymentMethod: payment.paymentMethod || 'Online',
        createdAt: payment.createdAt,
        description: payment.description || 'Payment'
      }))
    });
  } catch (error) {
    console.error('Error getting gym payments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch gym payments',
      error: error.message
    });
  }
};

/**
 * Get webhook logs for a specific gym
 */
exports.getGymWebhooks = async (req, res) => {
  try {
    const { adminId } = req.query;
    
    if (!adminId) {
      return res.status(400).json({
        success: false,
        message: 'Admin ID is required'
      });
    }

    // Verify the gym exists
    const gym = await Admin.findById(adminId);
    if (!gym) {
      return res.status(404).json({
        success: false,
        message: 'Gym not found'
      });
    }

    // Get webhook logs for this gym
    const webhooks = await WebhookData.find({ adminId })
      .sort({ createdAt: -1 })
      .limit(50); // Limit to most recent 50 webhook events
    
    res.status(200).json({
      success: true,
      webhooks
    });
  } catch (error) {
    console.error('Error getting gym webhooks:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch gym webhooks',
      error: error.message
    });
  }
};

/**
 * Get detailed webhook data with advanced filtering and analytics
 */
exports.getDetailedWebhookLogs = async (req, res) => {
  try {
    const {
      event,           // Filter by event type (e.g., payment.captured)
      eventType,       // Filter by category (payment, subscription)
      status,          // Filter by status
      gymName,         // Filter by gym name
      adminId,         // Filter by specific gym ID
      issueFlag,       // Filter for issues only
      startDate,       // Filter by date range
      endDate,         // Filter by date range
      sortBy = 'receivedAt', // Default sort field
      sortOrder = 'desc',    // Default sort order
      page = 1,              // Pagination
      limit = 20             // Items per page
    } = req.query;

    // Build filter object
    const filter = {};
    
    // Event filters
    if (event) filter.event = { $regex: event, $options: 'i' };
    if (eventType) filter.eventType = eventType;
    
    // Status filter
    if (status) filter.status = status;
    
    // Gym filters
    if (gymName) filter.gymName = { $regex: gymName, $options: 'i' };
    if (adminId) filter.adminId = adminId;
    
    // Issue flag
    if (issueFlag === 'true') filter.issueFlag = true;
    
    // Date range
    if (startDate || endDate) {
      filter.receivedAt = {};
      if (startDate) filter.receivedAt.$gte = new Date(startDate);
      if (endDate) {
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999); // End of the day
        filter.receivedAt.$lte = endDateTime;
      }
    }
    
    // Only show owner-viewable webhooks
    filter.ownerView = true;
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Determine sort direction
    const sortDirection = sortOrder === 'asc' ? 1 : -1;
    
    // Create sort object
    const sort = {};
    sort[sortBy] = sortDirection;
    
    // Get total count for pagination
    const totalCount = await WebhookData.countDocuments(filter);
    
    // Fetch webhooks with pagination and sorting
    const webhooks = await WebhookData.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();
    
    // Calculate analytics if requested
    let analytics = null;
    if (req.query.includeAnalytics === 'true') {
      // Get payment success rate
      const paymentEvents = await WebhookData.aggregate([
        { $match: { eventType: 'payment', ...filter } },
        { $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]);
      
      // Calculate success rate
      const successCount = paymentEvents.find(item => item._id === 'captured')?.count || 0;
      const failedCount = paymentEvents.find(item => item._id === 'failed')?.count || 0;
      const totalPayments = successCount + failedCount;
      
      // Get event counts by type
      const eventCounts = await WebhookData.aggregate([
        { $match: filter },
        { $group: {
            _id: '$eventType',
            count: { $sum: 1 }
          }
        }
      ]);
      
      // Get average processing time
      const processingTimeAgg = await WebhookData.aggregate([
        { $match: { processedAt: { $exists: true }, ...filter } },
        { $project: {
            processingTime: { $subtract: ['$processedAt', '$receivedAt'] }
          }
        },
        { $group: {
            _id: null,
            avgTime: { $avg: '$processingTime' }
          }
        }
      ]);
      
      // Get webhook counts by day (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const dailyCounts = await WebhookData.aggregate([
        { 
          $match: { 
            receivedAt: { $gte: sevenDaysAgo },
            ...filter 
          } 
        },
        {
          $group: {
            _id: { 
              year: { $year: '$receivedAt' },
              month: { $month: '$receivedAt' },
              day: { $dayOfMonth: '$receivedAt' }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
      ]);
      
      // Format daily counts for chart
      const formattedDailyCounts = dailyCounts.map(item => ({
        date: `${item._id.year}-${item._id.month.toString().padStart(2, '0')}-${item._id.day.toString().padStart(2, '0')}`,
        count: item.count
      }));
      
      // Assemble analytics object
      analytics = {
        paymentSuccessRate: totalPayments > 0 ? (successCount / totalPayments) * 100 : 0,
        eventCounts: eventCounts.map(item => ({ type: item._id || 'unknown', count: item.count })),
        averageProcessingTimeMs: processingTimeAgg[0]?.avgTime || 0,
        dailyWebhookCounts: formattedDailyCounts,
        totalIssues: await WebhookData.countDocuments({ issueFlag: true, ...filter })
      };
    }
    
    // Return response
    res.status(200).json({
      success: true,
      webhooks,
      pagination: {
        total: totalCount,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(totalCount / parseInt(limit))
      },
      analytics
    });
  } catch (error) {
    console.error('Error getting detailed webhook logs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch webhook data',
      error: error.message
    });
  }
};

/**
 * Get detailed webhook analytics
 */
exports.getWebhookAnalytics = async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      adminId,
      gymName
    } = req.query;
    
    // Build filter object
    const filter = {};
    
    // Gym filters
    if (gymName) filter.gymName = { $regex: gymName, $options: 'i' };
    if (adminId) filter.adminId = adminId;
    
    // Date range
    if (startDate || endDate) {
      filter.receivedAt = {};
      if (startDate) filter.receivedAt.$gte = new Date(startDate);
      if (endDate) {
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999); // End of the day
        filter.receivedAt.$lte = endDateTime;
      }
    }
    
    // Only show owner-viewable webhooks
    filter.ownerView = true;
    
    // Get total count
    const totalCount = await WebhookData.countDocuments(filter);
    
    // Get payment success vs failure counts
    const paymentStatusCounts = await WebhookData.aggregate([
      { $match: { eventType: 'payment', ...filter } },
      { $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    // Get subscription status counts
    const subscriptionStatusCounts = await WebhookData.aggregate([
      { $match: { eventType: 'subscription', ...filter } },
      { $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    // Get event type counts
    const eventTypeCounts = await WebhookData.aggregate([
      { $match: filter },
      { $group: {
          _id: '$eventType',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);
    
    // Get gym-wise webhook counts
    const gymCounts = await WebhookData.aggregate([
      { $match: filter },
      { $group: {
          _id: '$gymName',
          count: { $sum: 1 },
          issueCount: { $sum: { $cond: [{ $eq: ['$issueFlag', true] }, 1, 0] } }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);
    
    // Get daily webhook counts for trend analysis
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const dailyCounts = await WebhookData.aggregate([
      { 
        $match: { 
          receivedAt: { $gte: thirtyDaysAgo },
          ...filter 
        } 
      },
      {
        $group: {
          _id: { 
            year: { $year: '$receivedAt' },
            month: { $month: '$receivedAt' },
            day: { $dayOfMonth: '$receivedAt' }
          },
          total: { $sum: 1 },
          success: { 
            $sum: { 
              $cond: [
                { $in: ['$status', ['captured', 'authorized', 'active']] },
                1,
                0
              ]
            }
          },
          failed: { 
            $sum: { 
              $cond: [
                { $in: ['$status', ['failed', 'halted']] },
                1,
                0
              ]
            }
          }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
    ]);
    
    // Format daily counts for chart
    const formattedDailyCounts = dailyCounts.map(item => ({
      date: `${item._id.year}-${item._id.month.toString().padStart(2, '0')}-${item._id.day.toString().padStart(2, '0')}`,
      total: item.total,
      success: item.success,
      failed: item.failed
    }));
    
    // Get hourly distribution for peak analysis
    const hourlyDistribution = await WebhookData.aggregate([
      { $match: filter },
      {
        $group: {
          _id: { $hour: '$receivedAt' },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    // Calculate average processing time by event type
    const processingTimeByType = await WebhookData.aggregate([
      { $match: { processedAt: { $exists: true }, ...filter } },
      { $project: {
          eventType: 1,
          processingTime: { $subtract: ['$processedAt', '$receivedAt'] }
        }
      },
      { $group: {
          _id: '$eventType',
          avgTime: { $avg: '$processingTime' },
          minTime: { $min: '$processingTime' },
          maxTime: { $max: '$processingTime' }
        }
      },
      { $sort: { avgTime: -1 } }
    ]);
    
    // Return analytics data
    res.status(200).json({
      success: true,
      analytics: {
        totalWebhooks: totalCount,
        paymentStatusCounts,
        subscriptionStatusCounts,
        eventTypeCounts,
        gymCounts,
        dailyTrends: formattedDailyCounts,
        hourlyDistribution,
        processingTimeByType,
        issueCount: await WebhookData.countDocuments({ issueFlag: true, ...filter }),
        duplicateCount: await WebhookData.countDocuments({ duplicate: true, ...filter }),
        testModeCount: await WebhookData.countDocuments({ testMode: true, ...filter })
      }
    });
  } catch (error) {
    console.error('Error getting webhook analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch webhook analytics',
      error: error.message
    });
  }
};

/**
 * Replay a webhook event (for testing and debugging)
 */
exports.replayWebhook = async (req, res) => {
  try {
    const { webhookId } = req.params;
    
    if (!webhookId) {
      return res.status(400).json({
        success: false,
        message: 'Webhook ID is required'
      });
    }
    
    // Find the webhook event
    const webhook = await WebhookData.findById(webhookId);
    if (!webhook) {
      return res.status(404).json({
        success: false,
        message: 'Webhook event not found'
      });
    }
    
    // Create a new webhook event with the same payload but marked as a replay
    const replayEvent = new WebhookData({
      // Basic event information
      event: webhook.event,
      eventType: webhook.eventType,
      
      // Identifiers
      razorpay_payment_id: webhook.razorpay_payment_id,
      razorpay_order_id: webhook.razorpay_order_id,
      razorpay_subscription_id: webhook.razorpay_subscription_id,
      
      // Gym/Admin information
      adminId: webhook.adminId,
      gymName: webhook.gymName,
      email: webhook.email,
      
      // Financial information
      amount: webhook.amount,
      currency: webhook.currency || 'INR',
      status: webhook.status,
      customer_id: webhook.customer_id,
      planName: webhook.planName,
      planId: webhook.planId,
      
      // Full data storage - REQUIRED FIELD
      payload: webhook.payload || {}, // Use original payload or empty object if not available
      rawPayload: webhook.rawPayload,
      
      // Processing status
      processed: false,
      duplicate: false,
      issueFlag: false,
      
      // Timestamps
      receivedAt: new Date(),
      createdAt: new Date(),
      
      // Owner dashboard visibility
      ownerView: true,
      testMode: true, // Mark as test mode
      note: `Replay of webhook ${webhookId} at ${new Date().toISOString()}`,
      
      // Subscription specific fields
      subscriptionData: webhook.subscriptionData
    });
    
    await replayEvent.save();
    
    // Process the webhook (implementation would depend on your webhook processing logic)
    // This is a simplified example
    const processingStart = new Date();
    
    // Here you would call your webhook processing logic
    // For example: await processWebhookPayload(replayEvent);
    
    // Update the event with processing info
    replayEvent.processedAt = new Date();
    replayEvent.processingTimeMs = replayEvent.processedAt - processingStart;
    await replayEvent.save();
    
    res.status(200).json({
      success: true,
      message: 'Webhook replayed successfully',
      webhookId: replayEvent._id
    });
  } catch (error) {
    console.error('Error replaying webhook:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to replay webhook',
      error: error.message
    });
  }
};

/**
 * Get subscription history for a specific gym
 */
exports.getGymSubscriptions = async (req, res) => {
  try {
    const { adminId } = req.query;
    
    if (!adminId) {
      return res.status(400).json({
        success: false,
        message: 'Admin ID is required'
      });
    }

    // Verify the gym exists
    const gym = await Admin.findById(adminId);
    if (!gym) {
      return res.status(404).json({
        success: false,
        message: 'Gym not found'
      });
    }

    // For now, we'll return a mock subscription history
    // In a real implementation, you would fetch this from a SubscriptionHistory model
    const currentDate = new Date();
    const subscriptions = [
      {
        _id: '1',
        plan: 'Basic Plan',
        status: 'expired',
        startDate: new Date(currentDate.getFullYear() - 1, currentDate.getMonth(), 1),
        endDate: new Date(currentDate.getFullYear() - 1, currentDate.getMonth() + 3, 0),
        amount: 5999,
        createdAt: new Date(currentDate.getFullYear() - 1, currentDate.getMonth(), 1)
      },
      {
        _id: '2',
        plan: 'Premium Plan',
        status: 'active',
        startDate: new Date(currentDate.getFullYear(), currentDate.getMonth() - 2, 1),
        endDate: new Date(currentDate.getFullYear(), currentDate.getMonth() + 10, 0),
        amount: 9999,
        createdAt: new Date(currentDate.getFullYear(), currentDate.getMonth() - 2, 1)
      }
    ];
    
    res.status(200).json({
      success: true,
      subscriptions
    });
  } catch (error) {
    console.error('Error getting gym subscriptions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch gym subscriptions',
      error: error.message
    });
  }
};