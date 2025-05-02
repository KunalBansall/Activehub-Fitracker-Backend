const Admin = require('../models/Admin');

/**
 * Middleware to check subscription status and enforce restrictions accordingly
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 * @returns {void}
 */
const checkSubscription = async (req, res, next) => {
  try {
    // Skip subscription check for auth and public routes
    if (
      req.path.startsWith('/api/auth') || 
      req.path.startsWith('/api/public') ||
      req.path === '/api' ||
      req.path === '/'
    ) {
      return next();
    }

    // Extract adminId from JWT token (set by auth middleware)
    const adminId = req.admin?.id;
    if (!adminId) {
      return next(); // Let auth middleware handle unauthenticated requests
    }

    // Get admin with subscription details
    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    // Allow superadmin and owner to bypass subscription restrictions
    if (admin.role === 'superadmin' || admin.role === 'owner') {
      return next();
    }

    // Allow subscription-related routes regardless of status
    if (req.path.startsWith('/api/subscription')) {
      return next();
    }

    // Check subscription status and apply appropriate restrictions
    const now = new Date();

    switch (admin.subscriptionStatus) {
      case 'trial':
        // Check if trial has ended (shouldn't happen due to cron, but just in case)
        if (admin.trialEndDate < now) {
          admin.subscriptionStatus = 'grace';
          await admin.save();
          // Continue to grace period restrictions
        } else {
          // Full access during trial
          return next();
        }
        break;

      case 'grace':
        // Check if grace period has ended (shouldn't happen due to cron, but just in case)
        if (admin.graceEndDate < now) {
          admin.subscriptionStatus = 'expired';
          await admin.save();
          // Continue to expired restrictions
        } else {
          // Read-only access for safe routes during grace period
          if (req.method === 'GET') {
            return next();
          } else {
            return res.status(403).json({
              message: 'Your free trial has ended. You are in a grace period with read-only access. Please subscribe to regain full access.',
              subscriptionStatus: 'grace',
              graceEndDate: admin.graceEndDate
            });
          }
        }
        break;

      case 'active':
        // Check if subscription has ended (shouldn't happen due to cron, but just in case)
        if (admin.subscriptionEndDate && admin.subscriptionEndDate < now) {
          admin.subscriptionStatus = 'expired';
          await admin.save();
          // Continue to expired restrictions
        } else {
          // Full access for active subscription
          return next();
        }
        break;

      case 'expired':
      case 'cancelled':
        // No access for expired or cancelled subscriptions
        return res.status(403).json({
          message: 'Your subscription has expired. Please renew to regain access.',
          subscriptionStatus: admin.subscriptionStatus
        });

      default:
        // Unknown status, deny access
        return res.status(403).json({
          message: 'Subscription status error. Please contact support.',
          subscriptionStatus: admin.subscriptionStatus
        });
    }

    // If we've fallen through, likely transitioning from grace to expired
    return res.status(403).json({
      message: 'Your subscription has expired. Please renew to regain access.',
      subscriptionStatus: admin.subscriptionStatus
    });
    
  } catch (error) {
    console.error('Subscription check error:', error);
    return res.status(500).json({ message: 'Internal server error during subscription check' });
  }
};

module.exports = checkSubscription; 