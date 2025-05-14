const Ad = require('../models/Ad');
const AdView = require('../models/AdView');
const mongoose = require('mongoose');

// Create a new ad (owner only)
exports.createAd = async (req, res) => {
  try {
    const {
      title,
      description,
      contentType,
      mediaUrl,
      ctaUrl,
      targetAudience,
      gyms,
      placement,
      active,
      expiresAt
    } = req.body;

    // Validate required fields
    if (!title || !contentType || !mediaUrl || !targetAudience || !expiresAt) {
      return res.status(400).json({
        message: 'Missing required fields'
      });
    }

    // Create new ad
    const ad = new Ad({
      title,
      description,
      contentType,
      mediaUrl,
      ctaUrl,
      targetAudience,
      gyms: gyms || [],
      placement,
      active: active !== undefined ? active : true,
      expiresAt: new Date(expiresAt)
    });

    await ad.save();
    res.status(201).json({ 
      message: 'Ad created successfully',
      ad 
    });
  } catch (error) {
    console.error('Error creating ad:', error);
    res.status(500).json({ 
      message: 'Error creating ad',
      error: error.message 
    });
  }
};

// Fetch all ads regardless of status (owner only)
exports.getAllAds = async (req, res) => {
  try {
    // Fetch all ads without filtering
    const ads = await Ad.find()
      .sort({ createdAt: -1 }); // Most recent first
    
    res.json({ ads });
  } catch (error) {
    console.error('Error fetching all ads:', error);
    res.status(500).json({ 
      message: 'Error fetching all ads',
      error: error.message 
    });
  }
};

// Fetch active ads for current user based on role and gym
exports.getAds = async (req, res) => {
  try {
    const { role, gymId } = req;
    const currentDate = new Date();
    
    // Build filter based on user role and gym
    const filter = {
      active: true,
      createdAt: { $lte: currentDate },
      expiresAt: { $gte: currentDate },
      $or: [
        { targetAudience: role },
        { targetAudience: 'both' }
      ]
    };
    
    // If there are ads targeted to specific gyms, only include those that match the user's gym
    // or ads that target all gyms (empty gyms array)
    const ads = await Ad.find({
      ...filter,
      $or: [
        { gyms: { $size: 0 } }, // Empty array means target all gyms
        { gyms: gymId }
      ]
    });
    
    res.json({ ads });
  } catch (error) {
    console.error('Error fetching ads:', error);
    res.status(500).json({ 
      message: 'Error fetching ads',
      error: error.message 
    });
  }
};

// Update an ad (owner only)
exports.updateAd = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid ad ID' });
    }
    
    const updates = {};
    const allowedUpdates = [
      'title', 'description', 'contentType', 'mediaUrl', 
      'ctaUrl', 'targetAudience', 'gyms', 'placement', 'active', 'expiresAt'
    ];
    
    // Only add fields that are provided in the request
    Object.keys(req.body).forEach(key => {
      if (allowedUpdates.includes(key)) {
        updates[key] = req.body[key];
      }
    });
    
    // Convert dates if provided
    if (updates.expiresAt) {
      updates.expiresAt = new Date(updates.expiresAt);
    }
    
    const ad = await Ad.findByIdAndUpdate(
      id, 
      updates,
      { new: true, runValidators: true }
    );
    
    if (!ad) {
      return res.status(404).json({ message: 'Ad not found' });
    }
    
    res.json({ 
      message: 'Ad updated successfully',
      ad 
    });
  } catch (error) {
    console.error('Error updating ad:', error);
    res.status(500).json({ 
      message: 'Error updating ad',
      error: error.message 
    });
  }
};

// Record that user viewed an ad
exports.recordView = async (req, res) => {
  try {
    const { id } = req.params;
    const { role, user } = req;
    const { deviceInfo } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid ad ID' });
    }
    
    // Check if ad exists
    const ad = await Ad.findById(id);
    if (!ad) {
      return res.status(404).json({ message: 'Ad not found' });
    }
    
    // Check if a view was already recorded in the last 15 minutes for this user and ad
    // This prevents duplicate view counts when the same ad is shown multiple times in a short period
    // But still allows for multiple views in the same day
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const existingRecentView = await AdView.findOne({
      adId: id,
      userId: user._id,
      role,
      viewedAt: { $gt: fifteenMinutesAgo }
    });
    
    if (existingRecentView) {
      // View already recorded recently, just return success
      console.log(`Ad view already recorded recently for ad ${id} by ${role} ${user._id}`);
      return res.status(200).json({ 
        message: 'Ad view already recorded recently' 
      });
    }
    
    // Create new view record
    const adView = new AdView({
      adId: id,
      userId: user._id,
      role,
      clicked: false,
      viewedAt: new Date(),
      deviceInfo: deviceInfo || {
        userAgent: req.headers['user-agent'],
        path: req.headers['referer'] || 'unknown'
      }
    });
    
    await adView.save();
    console.log(`New view recorded for ad ${id} by ${role} ${user._id}`);
    
    res.status(200).json({ 
      message: 'Ad view recorded successfully' 
    });
  } catch (error) {
    console.error('Error recording ad view:', error);
    res.status(500).json({ 
      message: 'Error recording ad view',
      error: error.message 
    });
  }
};

// Record that user clicked an ad
exports.recordClick = async (req, res) => {
  try {
    const { id } = req.params;
    const { role, user } = req;
    const { clickType = 'cta', deviceInfo } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid ad ID' });
    }
    
    // Check if ad exists
    const ad = await Ad.findById(id);
    if (!ad) {
      return res.status(404).json({ message: 'Ad not found' });
    }
    
    // Find the most recent view for this ad and user
    // We'll update it to mark it as clicked
    let adView = await AdView.findOne({
      adId: id,
      userId: user._id,
      role
    }).sort({ viewedAt: -1 });
    
    if (adView) {
      // Update the existing view record
      adView.clicked = true;
      adView.clickType = clickType;
      adView.clickedAt = new Date();
      
      // Add device info if not already present
      if (!adView.deviceInfo && deviceInfo) {
        adView.deviceInfo = deviceInfo;
      }
      
      await adView.save();
      
      // Log for debugging
      console.log(`Click (${clickType}) recorded for ad ${id} by ${role} ${user._id}`);
    } else {
      // No previous view found, create a new record with clicked=true
      // This handles cases where the click happens without a prior view record
      // But still allows for multiple views in the same day
      const adView = new AdView({
        adId: id,
        userId: user._id,
        role,
        clicked: true,
        clickType: clickType,
        clickedAt: new Date(),
        viewedAt: new Date(), // Set viewedAt to the same time as clickedAt
        deviceInfo: deviceInfo || {
          userAgent: req.headers['user-agent'],
          path: req.headers['referer'] || 'unknown'
        }
      });
      await adView.save();
      
      // Log for debugging
      console.log(`New click record (${clickType}) created for ad ${id} by ${role} ${user._id}`);
    }
    
    res.status(200).json({ 
      message: 'Ad click recorded successfully',
      clickType: clickType
    });
  } catch (error) {
    console.error('Error recording ad click:', error);
    res.status(500).json({ 
      message: 'Error recording ad click',
      error: error.message 
    });
  }
};

// Delete an ad (owner only)
exports.deleteAd = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if ad exists
    const ad = await Ad.findById(id);
    if (!ad) {
      return res.status(404).json({ message: 'Ad not found' });
    }

    // Delete the ad
    await Ad.findByIdAndDelete(id);

    // Delete associated views
    await AdView.deleteMany({ adId: id });

    res.status(200).json({ 
      message: 'Ad deleted successfully' 
    });
  } catch (error) {
    console.error('Error deleting ad:', error);
    res.status(500).json({ 
      message: 'Error deleting ad',
      error: error.message 
    });
  }
};

// Get comprehensive ad analytics (owner only)
exports.getAdAnalytics = async (req, res) => {
  try {
    const { startDate, endDate, adId } = req.query;
    
    // Build date filter for aggregations
    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.viewedAt = {};
      if (startDate) dateFilter.viewedAt.$gte = new Date(startDate);
      if (endDate) {
        // Add one day to endDate to include the entire day
        const endDateObj = new Date(endDate);
        endDateObj.setDate(endDateObj.getDate() + 1);
        dateFilter.viewedAt.$lte = endDateObj;
      }
    }
    
    // Build ad filter
    const adFilter = {};
    if (adId && mongoose.Types.ObjectId.isValid(adId)) {
      adFilter.adId = new mongoose.Types.ObjectId(adId);
    }
    
    // Get all ads for reference
    const ads = await Ad.find();
    
    // Log the filters being used
    console.log('Analytics query filters:', { dateFilter, adFilter });
    
    // Get overall analytics
    const overallStats = await AdView.aggregate([
      { $match: { ...dateFilter, ...adFilter } },
      { 
        $group: {
          _id: null,
          totalViews: { $sum: 1 },
          totalClicks: { $sum: { $cond: ["$clicked", 1, 0] } },
          uniqueUsers: { $addToSet: "$userId" }
        }
      },
      {
        $project: {
          _id: 0,
          totalViews: 1,
          totalClicks: 1,
          uniqueUsers: { $size: "$uniqueUsers" },
          ctr: {
            $cond: [
              { $eq: ["$totalViews", 0] },
              0,
              { $multiply: [{ $divide: ["$totalClicks", "$totalViews"] }, 100] }
            ]
          }
        }
      }
    ]);
    
    // Get per-ad analytics
    const adStats = await AdView.aggregate([
      { $match: { ...dateFilter, ...adFilter } },
      { 
        $group: {
          _id: "$adId",
          views: { $sum: 1 },
          clicks: { $sum: { $cond: ["$clicked", 1, 0] } },
          uniqueUsers: { $addToSet: "$userId" }
        }
      },
      {
        $project: {
          adId: "$_id",
          _id: 0,
          views: 1,
          clicks: 1,
          uniqueUsers: { $size: "$uniqueUsers" },
          ctr: {
            $cond: [
              { $eq: ["$views", 0] },
              0,
              { $multiply: [{ $divide: ["$clicks", "$views"] }, 100] }
            ]
          }
        }
      }
    ]);
    
    // Get analytics by day
    const dailyStats = await AdView.aggregate([
      { $match: { ...dateFilter, ...adFilter } },
      {
        $group: {
          _id: {
            year: { $year: "$viewedAt" },
            month: { $month: "$viewedAt" },
            day: { $dayOfMonth: "$viewedAt" },
            adId: "$adId"
          },
          views: { $sum: 1 },
          clicks: { $sum: { $cond: ["$clicked", 1, 0] } }
        }
      },
      {
        $project: {
          _id: 0,
          date: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: {
                $dateFromParts: {
                  year: "$_id.year",
                  month: "$_id.month",
                  day: "$_id.day"
                }
              }
            }
          },
          adId: "$_id.adId",
          views: 1,
          clicks: 1
        }
      },
      { $sort: { date: 1 } }
    ]);
    
    // Get analytics by audience type
    const audienceStats = await AdView.aggregate([
      { $match: { ...dateFilter, ...adFilter } },
      {
        $group: {
          _id: {
            role: "$role",
            adId: "$adId"
          },
          views: { $sum: 1 },
          clicks: { $sum: { $cond: ["$clicked", 1, 0] } }
        }
      },
      {
        $project: {
          _id: 0,
          role: "$_id.role",
          adId: "$_id.adId",
          views: 1,
          clicks: 1,
          ctr: {
            $cond: [
              { $eq: ["$views", 0] },
              0,
              { $multiply: [{ $divide: ["$clicks", "$views"] }, 100] }
            ]
          }
        }
      }
    ]);
    
    // Ensure all ads have stats, even if they have no views
    // This ensures that new ads or ads with no views/clicks still appear in the analytics
    const allAdStats = ads.map(ad => {
      const existingStat = adStats.find(stat => stat.adId.toString() === ad._id.toString());
      
      if (existingStat) {
        return {
          ...existingStat,
          title: ad.title,
          placement: ad.placement || 'Unknown',
          targetAudience: ad.targetAudience,
          active: ad.active,
          createdAt: ad.createdAt,
          expiresAt: ad.expiresAt
        };
      } else {
        // Create a default stat for ads with no views
        return {
          adId: ad._id,
          views: 0,
          clicks: 0,
          uniqueUsers: 0,
          ctr: 0,
          title: ad.title,
          placement: ad.placement || 'Unknown',
          targetAudience: ad.targetAudience,
          active: ad.active,
          createdAt: ad.createdAt,
          expiresAt: ad.expiresAt
        };
      }
    });
    
    // Log the number of records found
    console.log(`Analytics results: ${overallStats.length ? overallStats[0].totalViews : 0} views, ${allAdStats.length} ads`);
    
    res.status(200).json({
      success: true,
      overall: overallStats[0] || {
        totalViews: 0,
        totalClicks: 0,
        uniqueUsers: 0,
        ctr: 0
      },
      adStats: allAdStats,
      dailyStats,
      audienceStats
    });
  } catch (error) {
    console.error('Error fetching ad analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch ad analytics',
      error: error.message
    });
  }
};