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
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid ad ID' });
    }
    
    // Check if ad exists
    const ad = await Ad.findById(id);
    if (!ad) {
      return res.status(404).json({ message: 'Ad not found' });
    }
    
    // Create view record
    const adView = new AdView({
      adId: id,
      userId: user._id,
      role,
      clicked: false
    });
    
    await adView.save();
    
    res.status(201).json({ 
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

// Track a click on the ad
exports.recordClick = async (req, res) => {
  try {
    const { id } = req.params;
    const { role, user } = req;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid ad ID' });
    }
    
    // Check if ad exists
    const ad = await Ad.findById(id);
    if (!ad) {
      return res.status(404).json({ message: 'Ad not found' });
    }
    
    // Try to find an existing view record
    let adView = await AdView.findOne({
      adId: id,
      userId: user._id,
      role
    });
    
    if (adView) {
      // Update existing record
      adView.clicked = true;
      await adView.save();
    } else {
      // Create new record with clicked=true
      adView = new AdView({
        adId: id,
        userId: user._id,
        role,
        clicked: true
      });
      await adView.save();
    }
    
    res.status(200).json({ 
      message: 'Ad click recorded successfully' 
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
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid ad ID' });
    }
    
    // Find and delete the ad
    const ad = await Ad.findByIdAndDelete(id);
    
    if (!ad) {
      return res.status(404).json({ message: 'Ad not found' });
    }
    
    // Also delete all related view records
    await AdView.deleteMany({ adId: id });
    
    res.status(200).json({ 
      message: 'Ad deleted successfully',
      id
    });
  } catch (error) {
    console.error('Error deleting ad:', error);
    res.status(500).json({ 
      message: 'Error deleting ad',
      error: error.message 
    });
  }
}; 