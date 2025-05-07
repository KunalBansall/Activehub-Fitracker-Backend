const mongoose = require('mongoose');

const webhookDataSchema = new mongoose.Schema({
  // Basic event information
  event: { type: String, required: true },
  eventType: { type: String, required: true }, // Categorized event type (payment, subscription, etc.)
  
  // Identifiers
  razorpay_payment_id: { type: String, index: true },
  razorpay_order_id: { type: String, index: true },
  razorpay_subscription_id: { type: String, index: true },
  
  // Gym/Admin information
  adminId: { type: String, index: true }, // Link to the gym/admin
  gymName: { type: String }, // For easier identification in owner dashboard
  email: { type: String }, // Customer email if available
  
  // Financial information
  amount: { type: Number },
  currency: { type: String, default: 'INR' },
  status: { type: String },
  customer_id: { type: String },
  planName: { type: String }, // Store the plan name
  planId: { type: String }, // Razorpay plan ID
  
  // Full data storage
  payload: { type: mongoose.Schema.Types.Mixed, required: true }, // Complete webhook payload
  rawPayload: { type: String }, // JSON string of the complete raw payload
  
  // Processing status
  processed: { type: Boolean, default: false },
  duplicate: { type: Boolean, default: false },
  issueFlag: { type: Boolean, default: false }, // Flag for issues that need attention
  errorReason: { type: String }, // Reason for issue flag
  
  // Timestamps
  receivedAt: { type: Date, default: Date.now }, // When webhook was received
  processedAt: { type: Date }, // When webhook was processed
  createdAt: { type: Date, default: Date.now }, // Database record creation time
  
  // Owner dashboard visibility
  ownerView: { type: Boolean, default: true }, // Visible in owner dashboard
  testMode: { type: Boolean, default: false }, // If triggered from Postman or test
  note: { type: String }, // Additional notes for debugging
  
  // Subscription specific fields
  subscriptionData: {
    eventType: { type: String }, // subscription.created, subscription.renewed, subscription.cancelled
    subscriptionId: { type: String },
    status: { type: String },
    adminId: { type: String },
    startDate: { type: Date },
    endDate: { type: Date },
    createdAt: { type: Date }
  }
});

const WebhookData = mongoose.model('WebhookData', webhookDataSchema);

module.exports = WebhookData;
