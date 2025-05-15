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
    
    // Check if user has viewed this ad recently (within 30 minutes)
    // This helps prevent duplicate view counts from component re-renders
    const thirtyMinutesAgo = new Date();
    thirtyMinutesAgo.setMinutes(thirtyMinutesAgo.getMinutes() - 30);
    
    console.log(`Checking for recent views of ad ${id} by user ${user._id} in the last 30 minutes`);
    
    const existingRecentView = await AdView.findOne({
      adId: id,
      userId: user._id,
      role,
      viewedAt: { $gte: thirtyMinutesAgo }
    });
    
    if (existingRecentView) {
      // View already recorded recently, just return success
      // Skip duplicate view recording
      console.log(`View already recorded recently for ad: ${id}, User: ${user._id}`);
      return res.status(200).json({ 
        message: 'Ad view already recorded recently' 
      });
    }
    
    // Create a new view record
    const adView = new AdView({
      adId: id,
      userId: user._id,
      role,
      viewedAt: new Date(),
      deviceInfo: deviceInfo || {
        userAgent: req.headers['user-agent'],
        path: req.headers['referer'] || 'unknown'
      }
    });
    
    await adView.save();
    console.log(`Created new view record: ${adView._id}`);
    
    // Verify the view was recorded by checking the database again
    const verifyRecord = await AdView.findById(adView._id);
    if (!verifyRecord) {
      console.error(`Failed to verify view record: ${adView._id}`);
    } else {
      console.log(`Verified view record exists: ${adView._id}`);
    }
    
    res.status(200).json({ 
      message: 'Ad view recorded successfully',
      adViewId: adView._id
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
    
    console.log(`Recording ad click - ID: ${id}, User: ${user._id}, Role: ${role}, Type: ${clickType}`);
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      console.warn(`Invalid ad ID format: ${id}`);
      return res.status(400).json({ message: 'Invalid ad ID' });
    }
    
    // Check if ad exists
    const ad = await Ad.findById(id);
    if (!ad) {
      console.warn(`Ad not found with ID: ${id}`);
      return res.status(404).json({ message: 'Ad not found' });
    }
    
    // For click tracking, we'll create a new record for each click
    // This ensures accurate click counting in analytics
    // First, check if there's a recent view to associate with
    let recentView = await AdView.findOne({
      adId: id,
      userId: user._id,
      role
    }).sort({ viewedAt: -1 });
    
    // Always create a new record for clicks to ensure accurate counting
    console.log(`Creating new click record for ad: ${id}`);
    
    // Create a new AdView record with clicked=true
    const adView = new AdView({
      adId: id,
      userId: user._id,
      role,
      clicked: true,
      clickType: clickType,
      clickedAt: new Date(),
      viewedAt: recentView ? recentView.viewedAt : new Date(), // Use the original view time if available
      deviceInfo: deviceInfo || {
        userAgent: req.headers['user-agent'],
        path: req.headers['referer'] || 'unknown'
      }
    });
    
    await adView.save();
    console.log(`Created new click record: ${adView._id}`);
    
    // If this is the first click, also update the original view record
    if (recentView && !recentView.clicked) {
      recentView.clicked = true;
      recentView.clickType = clickType;
      recentView.clickedAt = new Date();
      await recentView.save();
      console.log(`Also updated original view record: ${recentView._id}`);
    } else {
      console.log(`No previous view found for ad: ${id}`);
    }
    
    // Verify the click was recorded by checking the database again
    const verifyRecord = await AdView.findById(adView._id);
    if (!verifyRecord || !verifyRecord.clicked) {
      console.error(`Failed to verify click record: ${adView._id}`);
    } else {
      console.log(`Verified click record exists and is marked as clicked: ${adView._id}`);
    }
    
    res.status(200).json({ 
      message: 'Ad click recorded successfully',
      clickType: clickType,
      adViewId: adView._id
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
    
    console.log(`Generating ad analytics - StartDate: ${startDate || 'none'}, EndDate: ${endDate || 'none'}, AdId: ${adId || 'all'}`);
    
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
    console.log(`Found ${ads.length} total ads in the system`);
    
    // Get a count of all ad views for verification
    const totalViewsCount = await AdView.countDocuments({...dateFilter, ...adFilter});
    const totalClicksCount = await AdView.countDocuments({...dateFilter, ...adFilter, clicked: true});
    console.log(`Raw counts - Total Views: ${totalViewsCount}, Total Clicks: ${totalClicksCount}`);
    
    // Filter setup complete
    
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
    
    // Combine all ad stats (including ads with no views)
    const allAdStats = ads.map(ad => {
      const stat = adStats.find(s => s.adId.toString() === ad._id.toString());
      if (stat) {
        return {
          ...stat,
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

    // Create default overall stats if none exist
    const defaultOverallStats = { 
      totalViews: totalViewsCount, 
      totalClicks: totalClicksCount, 
      uniqueUsers: 0, 
      ctr: totalViewsCount > 0 ? (totalClicksCount / totalViewsCount) * 100 : 0 
    };
    
    // Use aggregation results or fall back to raw counts if aggregation returned no results
    const finalOverallStats = overallStats[0] || defaultOverallStats;
    
    console.log('Final analytics data:', {
      overallStats: finalOverallStats,
      adStatsCount: adStats.length,
      dailyStatsCount: dailyStats.length,
      audienceStatsCount: audienceStats.length
    });
    
    res.status(200).json({
      success: true,
      overall: finalOverallStats,
      adStats: allAdStats,
      dailyStats: dailyStats,
      audienceStats: audienceStats
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