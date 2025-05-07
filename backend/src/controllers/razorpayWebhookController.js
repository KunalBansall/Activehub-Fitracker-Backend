const crypto = require("crypto");
const razorpay = require("../utils/razorpay");
const Payment = require("../models/Payments");
const Admin = require("../models/Admin");
const WebhookData = require("../models/WebhookEvent");
const dateUtils = require("../utils/dateUtils");
// Import webhook utilities
const { storeWebhookEvent, markWebhookProcessed, isWebhookDuplicate } = require("../utils/webhookUtils");
// Import event handlers
const { handleRazorpayEvent } = require("../utils/webhookHandlers");

/**
 * Handles Razorpay webhook events
 * This controller verifies the webhook signature and processes different payment events
 * Implements comprehensive logging and error handling for owner visibility
 */
module.exports = async (req, res) => {
  // Track webhook processing start time
  const receivedAt = new Date();
  
  // Check if this is a test request
  const isTestMode = req.headers["x-test-mode"] === "true" || req.query.testMode === "true";
  
  try {
    // Get the Razorpay signature from headers
    const razorpaySignature = req.headers["x-razorpay-signature"];
    
    if (!razorpaySignature) {
      console.log("❌ Webhook Error: Missing Razorpay signature");
      
      // Store the failed request for owner visibility
      await storeWebhookEvent(
        { event: "webhook.error", payload: { error: "Missing signature", headers: req.headers } },
        isTestMode
      );
      
      return res.status(400).json({
        success: false,
        message: "Missing signature – possible security issue",
        error: "x-razorpay-signature header is required"
      });
    }

    // Get the webhook secret from environment variables
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    
    if (!webhookSecret) {
      console.error("❌ Webhook Error: Webhook secret not configured");
      
      // Store the configuration error for owner visibility
      await storeWebhookEvent(
        { event: "webhook.error", payload: { error: "Webhook secret not configured" } },
        isTestMode
      );
      
      return res.status(500).json({
        success: false,
        message: "Webhook configuration error",
        error: "RAZORPAY_WEBHOOK_SECRET not configured"
      });
    }

    // Get the raw request body
    const rawBody = req.body;
    
    // Create a string from the raw body
    let requestBody;
    if (Buffer.isBuffer(rawBody)) {
      requestBody = rawBody.toString('utf8');
    } else if (typeof rawBody === 'object') {
      requestBody = JSON.stringify(rawBody);
    } else {
      requestBody = rawBody;
    }

    // Verify the Razorpay signature
    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(requestBody)
      .digest("hex");
    
    if (expectedSignature !== razorpaySignature) {
      console.log("⚠️ Webhook signature mismatch – possible spoofed request");
      
      // Store the signature mismatch for owner visibility
      await storeWebhookEvent(
        {
          event: "webhook.error",
          payload: {
            error: "Invalid signature – possible spoofed request",
            receivedSignature: razorpaySignature.substring(0, 10) + '...' // Only store part of the signature for security
          }
        },
        isTestMode
      );
      
      return res.status(400).json({
        success: false,
        message: "Invalid signature – possible spoofed request",
        error: "Signature verification failed"
      });
    }

    // Parse the request body if it's a string
    let payload;
    try {
      payload = typeof requestBody === 'string' ? JSON.parse(requestBody) : requestBody;
    } catch (parseError) {
      console.error("❌ Webhook Error: Invalid JSON payload", parseError);
      
      // Store the parsing error for owner visibility
      await storeWebhookEvent(
        {
          event: "webhook.error",
          payload: {
            error: "Invalid JSON payload",
            body: requestBody.substring(0, 100) + '...' // Only store part of the body
          }
        },
        isTestMode
      );
      
      return res.status(400).json({
        success: false,
        message: "Invalid JSON payload",
        error: parseError.message
      });
    }
    
    // Extract event and data
    const event = payload.event;
    const data = payload.payload;

    // Log the event (without sensitive payment details)
    console.log(`📣 Razorpay webhook received: ${event}`);
    
    // Check for duplicate event before processing
    const paymentId = data?.payment?.entity?.id;
    const subscriptionId = data?.subscription?.entity?.id;
    const eventId = paymentId || subscriptionId;
    
    if (eventId) {
      const isDuplicate = await isWebhookDuplicate(eventId, event);
      
      if (isDuplicate) {
        console.log(`🔄 Duplicate event detected: ${event} for ID ${eventId}. Logging but skipping processing.`);
        
        // Store the duplicate event with flag for owner visibility
        const webhookRecord = await storeWebhookEvent(payload, isTestMode);
        
        // Mark as duplicate
        await WebhookData.findByIdAndUpdate(webhookRecord._id, {
          duplicate: true,
          note: `Duplicate event: ${event} for ID ${eventId}`,
          processedAt: new Date()
        });
        
        return res.status(200).json({
          success: true,
          message: "Webhook processed successfully (duplicate event)",
          duplicate: true
        });
      }
    }
    
    // Store the webhook event data
    const webhookRecord = await storeWebhookEvent(payload, isTestMode);
    
    // Extract and store subscription data if it's a subscription event
    if (event.startsWith('subscription.')) {
      const subscriptionData = {
        eventType: event,
        subscriptionId: data.subscription?.entity?.id || data.id,
        status: data.subscription?.entity?.status || data.status,
        adminId: data.subscription?.entity?.notes?.adminId || data.notes?.adminId,
        startDate: data.subscription?.entity?.start_at ? new Date(data.subscription.entity.start_at * 1000) : null,
        endDate: data.subscription?.entity?.end_at ? new Date(data.subscription.entity.end_at * 1000) : null,
        createdAt: new Date()
      };

      // Extract plan name from the payload
      const planName = data.subscription?.entity?.plan_name || 
                      data.plan_name || 
                      data.subscription?.entity?.plan?.item?.name ||
                      'Unknown Plan';

      // Update the webhook record with subscription data and plan name
      await WebhookData.findByIdAndUpdate(webhookRecord._id, {
        subscriptionData,
        planName
      });
    }
    
    // Process the event with our centralized event handler
    try {
      const success = await handleRazorpayEvent(event, data);
      
      if (success) {
        // Mark the webhook as processed
        await WebhookData.findByIdAndUpdate(webhookRecord._id, {
          processed: true,
          processedAt: new Date(),
          note: `Successfully processed ${event}`
        });
        console.log(`✅ Webhook processed successfully: ${event}`);
      } else {
        // Update with processing failure
        await WebhookData.findByIdAndUpdate(webhookRecord._id, {
          issueFlag: true,
          errorReason: `Failed to process ${event}`,
          note: `Event handler returned false for ${event}`
        });
        console.log(`⚠️ Webhook processing failed: ${event}`);
      }
    } catch (processingError) {
      // Log processing error and update webhook record
      console.error(`❌ Error processing webhook ${event}:`, processingError);
      
      await WebhookData.findByIdAndUpdate(webhookRecord._id, {
        issueFlag: true,
        errorReason: `Error: ${processingError.message}`,
        note: `Exception during processing: ${processingError.message.substring(0, 200)}`
      });
    }
    
    // Calculate processing time
    const processingTime = new Date() - receivedAt;
    
    // Always return a 200 response to Razorpay to acknowledge receipt
    return res.status(200).json({
      success: true,
      message: "Webhook processed successfully",
      webhookId: webhookRecord._id,
      event: event,
      processingTimeMs: processingTime
    });
  } catch (error) {
    console.error("❌ Webhook Error:", error);
    
    // Try to log the error even if processing failed
    try {
      await storeWebhookEvent(
        {
          event: "webhook.error",
          payload: {
            error: error.message,
            stack: error.stack,
            requestHeaders: req.headers
          }
        },
        isTestMode
      );
    } catch (logError) {
      console.error("Failed to log webhook error:", logError);
    }
    
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

/**
 * Handle successful payment event
 */
async function handlePaymentSuccess(data) {
  try {
    // Extract payment details
    const paymentEntity = data.payment?.entity || data;
    const paymentId = paymentEntity.id;
    
    // Log payment success (without sensitive details)
    console.log(`✅ Payment successful: ${paymentId}`);
    
    // Update payment record in database
    const payment = await Payment.findOneAndUpdate(
      { razorpay_payment_id: paymentId },
      { 
        status: "completed",
        amount: paymentEntity.amount / 100, // Convert from paisa to rupees
        method: paymentEntity.method || "razorpay"
      },
      { new: true }
    );

    // If payment not found, it might be a new payment - create a record
    if (!payment && paymentEntity.notes && paymentEntity.notes.adminId) {
      // Create new payment record
      const newPayment = new Payment({
        adminId: paymentEntity.notes.adminId,
        razorpay_payment_id: paymentId,
        razorpay_subscription_id: paymentEntity.subscription_id,
        status: "completed",
        amount: paymentEntity.amount / 100,
        method: paymentEntity.method || "razorpay"
      });
      
      await newPayment.save();
      
      // Update admin subscription status
      if (paymentEntity.notes.adminId) {
        await updateAdminSubscription(paymentEntity.notes.adminId, paymentEntity);
      }
    } else if (payment && payment.adminId) {
      // Update admin subscription status for existing payment
      await updateAdminSubscription(payment.adminId, paymentEntity);
    }
  } catch (error) {
    console.error("Error handling payment success:", error);
  }
}

/**
 * Handle failed payment event
 */
async function handlePaymentFailed(data) {
  try {
    const paymentEntity = data.payment?.entity || data;
    const paymentId = paymentEntity.id;
    
    console.log(`❌ Payment failed: ${paymentId}`);
    
    // Update payment record as failed
    await Payment.updateOne(
      { razorpay_payment_id: paymentId },
      { status: "failed" }
    );
    
    // Find the admin associated with this payment
    const payment = await Payment.findOne({ razorpay_payment_id: paymentId });
    
    if (payment && payment.adminId) {
      // Set grace period (7 days from now)
      const graceEndDate = new Date();
      graceEndDate.setDate(graceEndDate.getDate() + 7);
      
      // Update admin status to grace period
      await Admin.findByIdAndUpdate(
        payment.adminId,
        {
          subscriptionStatus: "grace",
          graceEndDate: graceEndDate
        }
      );
      
      console.log(`Admin ${payment.adminId} moved to grace period until ${graceEndDate}`);
    }
  } catch (error) {
    console.error("Error handling payment failure:", error);
  }
}

/**
 * Handle subscription activated event
 */
async function handleSubscriptionActivated(data) {
  try {
    const subscriptionEntity = data.subscription?.entity || data;
    const subscriptionId = subscriptionEntity.id;
    
    console.log(`🔁 Subscription activated: ${subscriptionId}`);
    
    // Find admin by subscription ID
    const admin = await Admin.findOne({ razorpaySubscriptionId: subscriptionId });
    
    if (admin) {
      // Calculate subscription dates
      const { startDate, endDate } = calculateSubscriptionDates(admin);
      
      // Update admin subscription status
      await Admin.findByIdAndUpdate(
        admin._id,
        {
          subscriptionStatus: "active",
          subscriptionEndDate: endDate
        }
      );
      
      console.log(`Admin ${admin._id} subscription activated. End date: ${endDate.toISOString()}`);
    }
  } catch (error) {
    console.error("Error handling subscription activation:", error);
  }
}

/**
 * Handle subscription charged event
 */
async function handleSubscriptionCharged(data) {
  try {
    const subscriptionEntity = data.subscription?.entity || data;
    const subscriptionId = subscriptionEntity.id;
    const paymentId = data.payment?.entity?.id;
    
    console.log(`💰 Subscription charged: ${subscriptionId}`);
    
    // Find admin by subscription ID
    const admin = await Admin.findOne({ razorpaySubscriptionId: subscriptionId });
    
    if (admin) {
      // For recurring charges, startDate is the previous subscriptionEndDate
      const startDate = admin.subscriptionEndDate 
        ? new Date(admin.subscriptionEndDate) 
        : new Date();
      
      // Calculate new end date by adding 1 month to the start date
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 1);
      
      // Update admin subscription
      await Admin.findByIdAndUpdate(
        admin._id,
        {
          subscriptionEndDate: endDate,
          $push: { 
            paymentHistory: {
              paymentId: paymentId || `recurring-${Date.now()}`,
              amount: subscriptionEntity.amount / 100,
              plan: "ActiveHub Pro",
              startDate: startDate,
              endDate: endDate,
              status: "completed",
              createdAt: new Date()
            }
          }
        }
      );
      
      console.log(`Admin ${admin._id} subscription extended. End date: ${endDate.toISOString()}`);
    }
  } catch (error) {
    console.error("Error handling subscription charged:", error);
  }
}

/**
 * Handle subscription halted event
 */
async function handleSubscriptionHalted(data) {
  try {
    const subscriptionEntity = data.subscription?.entity || data;
    const subscriptionId = subscriptionEntity.id;
    
    console.log(`⏸️ Subscription halted: ${subscriptionId}`);
    
    // Find admin by subscription ID
    const admin = await Admin.findOne({ razorpaySubscriptionId: subscriptionId });
    
    if (admin) {
      // Set grace period (7 days from now)
      const graceEndDate = new Date();
      graceEndDate.setDate(graceEndDate.getDate() + 7);
      
      // Update admin status to grace period
      await Admin.findByIdAndUpdate(
        admin._id,
        {
          subscriptionStatus: "grace",
          graceEndDate: graceEndDate
        }
      );
      
      console.log(`Admin ${admin._id} moved to grace period until ${graceEndDate}`);
    }
  } catch (error) {
    console.error("Error handling subscription halted:", error);
  }
}

/**
 * Handle subscription cancelled event
 */
async function handleSubscriptionCancelled(data) {
  try {
    const subscriptionEntity = data.subscription?.entity || data;
    const subscriptionId = subscriptionEntity.id;
    
    console.log(`🛑 Subscription cancelled: ${subscriptionId}`);
    
    // Find admin by subscription ID
    const admin = await Admin.findOne({ razorpaySubscriptionId: subscriptionId });
    
    if (admin) {
      // Update admin status to cancelled
      await Admin.findByIdAndUpdate(
        admin._id,
        {
          subscriptionStatus: "cancelled"
        }
      );
      
      console.log(`Admin ${admin._id} subscription cancelled`);
    }
  } catch (error) {
    console.error("Error handling subscription cancelled:", error);
  }
}

/**
 * Helper function to calculate subscription dates
 */
function calculateSubscriptionDates(admin) {
  // For calculation of dates
  let startDate, endDate;
  
  if (admin.subscriptionStatus === 'trial' && admin.trialEndDate) {
    // If in trial, start from trial end date
    startDate = new Date(admin.trialEndDate);
  } else {
    // Otherwise start from now
    startDate = new Date();
  }
  
  // End date is 1 month from start date
  endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + 1);
  
  return { startDate, endDate };
}

/**
 * Update admin subscription based on payment
 */
async function updateAdminSubscription(adminId, paymentEntity) {
  try {
    const admin = await Admin.findById(adminId);
    
    if (!admin) {
      console.error(`Admin not found for payment ${paymentEntity.id}`);
      return;
    }
    
    // Calculate subscription dates
    const { startDate, endDate } = calculateSubscriptionDates(admin);
    
    // Update admin's subscription status
    await Admin.findByIdAndUpdate(
      adminId,
      {
        subscriptionStatus: "active",
        subscriptionEndDate: endDate,
        $push: { 
          paymentHistory: {
            paymentId: paymentEntity.id,
            amount: paymentEntity.amount / 100,
            plan: "ActiveHub Pro",
            startDate: startDate,
            endDate: endDate,
            status: "completed",
            createdAt: new Date()
          }
        }
      }
    );
    
    console.log(`Admin ${adminId} subscription updated. End date: ${endDate.toISOString()}`);
  } catch (error) {
    console.error(`Error updating admin subscription: ${error.message}`);
  }
} 