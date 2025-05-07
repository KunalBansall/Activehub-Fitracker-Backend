const WebhookData = require('../models/WebhookEvent');
const Admin = require('../models/Admin');

/**
 * Extract admin ID from Razorpay webhook payload
 * @param {Object} payload - The webhook payload
 * @returns {String|null} The admin ID if found
 */
const extractAdminId = (payload) => {
  // Try to extract adminId from various locations in the payload
  const paymentEntity = payload.payment?.entity || {};
  const subscriptionEntity = payload.subscription?.entity || {};
  const orderEntity = payload.order?.entity || {};
  
  // Check notes field in various entities
  const notes = {
    ...paymentEntity.notes,
    ...subscriptionEntity.notes,
    ...orderEntity.notes
  };
  
  // Look for adminId in notes
  return notes?.adminId || 
         notes?.admin_id || 
         paymentEntity.notes?.adminId || 
         subscriptionEntity.notes?.adminId || 
         orderEntity.notes?.adminId || 
         null;
};

/**
 * Categorize event type for easier filtering
 * @param {String} event - The Razorpay event name
 * @returns {String} Categorized event type
 */
const categorizeEventType = (event) => {
  if (event.startsWith('payment.')) return 'payment';
  if (event.startsWith('subscription.')) return 'subscription';
  if (event.startsWith('order.')) return 'order';
  if (event.startsWith('refund.')) return 'refund';
  return 'other';
};

/**
 * Check if the webhook event has issues that need attention
 * @param {Object} webhookData - The webhook data object
 * @returns {Object} Issue flag and reason
 */
const checkForIssues = (webhookData) => {
  const issues = {
    issueFlag: false,
    reason: null
  };
  
  // Check for missing adminId
  if (!webhookData.adminId && (webhookData.eventType === 'payment' || webhookData.eventType === 'subscription')) {
    issues.issueFlag = true;
    issues.reason = 'Missing adminId';
    return issues;
  }
  
  // Check for failed payments
  if (webhookData.eventType === 'payment' && webhookData.status === 'failed') {
    issues.issueFlag = true;
    issues.reason = 'Failed payment';
    return issues;
  }
  
  // Check for failed subscriptions
  if (webhookData.eventType === 'subscription' && 
      (webhookData.status === 'halted' || webhookData.status === 'cancelled')) {
    issues.issueFlag = true;
    issues.reason = `Subscription ${webhookData.status}`;
    return issues;
  }
  
  return issues;
};

/**
 * Store a Razorpay webhook event in the database with enhanced tracking
 * @param {Object} eventData - The webhook event data from Razorpay
 * @param {Boolean} isTest - Whether this is a test webhook
 * @returns {Promise<Object>} The saved webhook data object
 */
const storeWebhookEvent = async (eventData, isTest = false) => {
  try {
    // Extract event type and categorize
    const event = eventData.event || 'unknown_event';
    const eventType = categorizeEventType(event);
    
    // Extract data from payload
    const payload = eventData.payload || {};
    const paymentData = payload.payment?.entity || {};
    const subscriptionData = payload.subscription?.entity || {};
    const orderData = payload.order?.entity || {};
    
    // Extract adminId
    const adminId = extractAdminId(payload);
    
    // Get gym details if adminId is available
    let gymName = null;
    let email = null;
    
    if (adminId) {
      try {
        const admin = await Admin.findById(adminId).select('gymName email');
        if (admin) {
          gymName = admin.gymName;
          email = admin.email;
        }
      } catch (err) {
        console.log(`Could not find gym details for adminId: ${adminId}`);
      }
    }
    
    // Create webhook data object with enhanced fields
    const webhookData = new WebhookData({
      // Basic event information
      event,
      eventType,
      
      // Identifiers
      razorpay_payment_id: paymentData.id || null,
      razorpay_order_id: orderData.id || paymentData.order_id || null,
      razorpay_subscription_id: subscriptionData.id || paymentData.subscription_id || null,
      
      // Gym/Admin information
      adminId,
      gymName,
      email: email || paymentData.email || subscriptionData.customer_email || null,
      
      // Financial information
      amount: paymentData.amount ? paymentData.amount / 100 : null, // Convert from paisa to rupees
      currency: paymentData.currency || subscriptionData.currency || 'INR',
      status: paymentData.status || subscriptionData.status || null,
      customer_id: paymentData.customer_id || subscriptionData.customer_id || null,
      planName: subscriptionData.plan_id ? `Plan ${subscriptionData.plan_id}` : null,
      planId: subscriptionData.plan_id || null,
      
      // Full data storage
      payload: eventData, // Store the complete event data for reference
      rawPayload: JSON.stringify(eventData), // Store raw payload as string
      
      // Processing status
      processed: false, // Initially mark as unprocessed
      
      // Timestamps
      receivedAt: new Date(),
      createdAt: new Date(),
      
      // Owner dashboard visibility
      ownerView: true,
      testMode: isTest
    });
    
    // Check for issues
    const issues = checkForIssues(webhookData);
    webhookData.issueFlag = issues.issueFlag;
    webhookData.errorReason = issues.reason;
    
    // Save to database
    const savedData = await webhookData.save();
    console.log(`📝 Webhook event logged: ${event} (Payment ID: ${paymentData.id || 'N/A'}, Admin ID: ${adminId || 'Unknown'})`);
    
    return savedData;
  } catch (error) {
    console.error('Error storing webhook data:', error);
    // Don't throw the error - we don't want webhook processing to fail if storage fails
    return null;
  }
};

/**
 * Mark a webhook event as processed
 * @param {String} webhookId - The ID of the webhook record
 * @returns {Promise<Boolean>} Success status
 */
const markWebhookProcessed = async (webhookId) => {
  try {
    await WebhookData.findByIdAndUpdate(webhookId, { processed: true });
    return true;
  } catch (error) {
    console.error('Error marking webhook as processed:', error);
    return false;
  }
};

/**
 * Check if a webhook event has already been processed (for deduplication)
 * @param {String} paymentId - Razorpay payment ID
 * @param {String} event - Event type
 * @returns {Promise<Boolean>} Whether the event has been processed before
 */
const isWebhookDuplicate = async (paymentId, event) => {
  if (!paymentId) return false;
  
  try {
    const exists = await WebhookData.findOne({ 
      razorpay_payment_id: paymentId,
      event: event,
      processed: true
    });
    
    return !!exists;
  } catch (error) {
    console.error('Error checking for duplicate webhook:', error);
    return false; // Default to processing the webhook if check fails
  }
};

module.exports = {
  storeWebhookEvent,
  markWebhookProcessed,
  isWebhookDuplicate
}; 