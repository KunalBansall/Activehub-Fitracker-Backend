const crypto = require("crypto");
const razorpay = require("../utils/razorpay");
const Payment = require("../models/Payments");
const Admin = require("../models/Admin");
const dateUtils = require("../utils/dateUtils");

/**
 * Handles Razorpay webhook events
 * This controller verifies the webhook signature and processes different payment events
 */
module.exports = async (req, res) => {
  try {
    // Get the Razorpay signature from headers
    const razorpaySignature = req.headers["x-razorpay-signature"];
    
    if (!razorpaySignature) {
      console.log("❌ Webhook Error: Missing Razorpay signature");
      return res.status(400).json({ message: "Missing signature" });
    }

    // Get the webhook secret from environment variables
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    
    if (!webhookSecret) {
      console.error("❌ Webhook Error: Webhook secret not configured");
      return res.status(500).json({ message: "Webhook configuration error" });
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
      console.log("⚠️ Webhook signature mismatch");
      return res.status(400).json({ message: "Invalid signature" });
    }

    // Parse the request body if it's a buffer
    const payload = JSON.parse(requestBody);
    
    // Extract event and data
    const event = payload.event;
    const data = payload.payload;

    // Log the event (without sensitive payment details)
    console.log(`📣 Razorpay webhook received: ${event}`);
    
    // Handle different events
    switch (event) {
      case "payment.success":
      case "payment.captured":
        await handlePaymentSuccess(data);
        break;
      
      case "payment.failed":
        await handlePaymentFailed(data);
        break;
      
      case "subscription.activated":
        await handleSubscriptionActivated(data);
        break;
      
      case "subscription.charged":
        await handleSubscriptionCharged(data);
        break;
      
      case "subscription.halted":
        await handleSubscriptionHalted(data);
        break;
      
      case "subscription.cancelled":
        await handleSubscriptionCancelled(data);
        break;
      
      default:
        console.log(`📩 Unhandled Razorpay event: ${event}`);
    }

    // Always respond with 200 OK for valid webhooks
    return res.status(200).json({ status: "success" });
  } catch (error) {
    console.error("❌ Webhook processing error:", error);
    return res.status(500).json({ message: "Webhook processing failed" });
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