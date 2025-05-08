const Payment = require('../models/Payments');
const Admin = require('../models/Admin');
const dateUtils = require('./dateUtils');
const { sendSubscriptionConfirmationEmail, sendSubscriptionCancelledEmail, sendPaymentFailedEmail } = require('../services/emailService');
const razorpay = require('./razorpay');

/**
 * Handle payment captured event
 * @param {Object} data - Payment event payload
 * @returns {Promise<void>}
 */
const handlePaymentCaptured = async (data) => {
  try {
    console.log("✅ Processing payment.captured event");
    const paymentEntity = data.payment?.entity || {};
    const paymentId = paymentEntity.id;
    
    if (!paymentId) {
      console.error("Missing payment ID in payment.captured event");
      return;
    }
    
    // Update payment record
    await Payment.updateOne(
      { razorpay_payment_id: paymentId },
      { 
        status: "completed",
        amount: paymentEntity.amount / 100, // Convert from paisa to rupees
        method: paymentEntity.method || "razorpay"
      }
    );
    
    // Find the payment to get admin and subscription details
    const payment = await Payment.findOne({ razorpay_payment_id: paymentId });
    
    if (!payment || !payment.adminId) {
      console.log(`No associated payment record found for payment ${paymentId}`);
      return;
    }
    
    // Get subscription details if available
    const subscriptionId = payment.razorpay_subscription_id;
    if (subscriptionId) {
      try {
        // Fetch subscription from Razorpay
        const subscription = await razorpay.subscriptions.fetch(subscriptionId);
        
        // Fetch admin details
        const admin = await Admin.findById(payment.adminId);
        
        if (!admin) {
          console.error(`Admin not found for payment ${paymentId}`);
          return;
        }
        
        // Calculate subscription dates
        const { startDate, endDate } = dateUtils.calculateSubscriptionDates(
          admin.subscriptionStatus,
          admin.trialEndDate,
          admin.graceEndDate
        );
        
        // Update admin subscription status
        await Admin.findByIdAndUpdate(
          payment.adminId,
          {
            subscriptionStatus: "active",
            subscriptionEndDate: endDate,
            razorpaySubscriptionId: subscriptionId,
            $push: { 
              paymentHistory: {
                paymentId: paymentId,
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
        
        console.log(`Admin ${payment.adminId} subscription activated/renewed until ${endDate.toISOString()}`);
        
        // Send confirmation email
        try {
          await sendSubscriptionConfirmationEmail(
            admin,
            {
              razorpay_payment_id: paymentId,
              razorpay_subscription_id: subscriptionId,
              method: paymentEntity.method || "Razorpay"
            },
            "ActiveHub Pro",
            paymentEntity.amount / 100,
            startDate,
            endDate
          );
          console.log(`Payment confirmation email sent to ${admin.email}`);
        } catch (emailError) {
          console.error(`Error sending confirmation email: ${emailError.message}`);
        }
      } catch (error) {
        console.error(`Error processing subscription for payment ${paymentId}:`, error);
      }
    }
  } catch (error) {
    console.error("Error handling payment.captured event:", error);
  }
};

/**
 * Handle payment failed event
 * @param {Object} data - Payment event payload
 * @returns {Promise<void>}
 */
const handlePaymentFailed = async (data) => {
  try {
    console.log("❌ Processing payment.failed event");
    const paymentEntity = data.payment?.entity || {};
    const paymentId = paymentEntity.id;
    
    if (!paymentId) {
      console.error("Missing payment ID in payment.failed event");
      return;
    }
    
    // Update payment record
    await Payment.updateOne(
      { razorpay_payment_id: paymentId },
      { status: "failed" }
    );
    
    // Find the payment to get admin and subscription details
    const payment = await Payment.findOne({ razorpay_payment_id: paymentId });
    
    if (!payment || !payment.adminId) {
      console.log(`No associated payment record found for payment ${paymentId}`);
      return;
    }
    
    // Get admin details
    const admin = await Admin.findById(payment.adminId);
    
    if (!admin) {
      console.error(`Admin not found for payment ${paymentId}`);
      return;
    }
    
    // If this is a subscription payment failure, update status
    if (payment.razorpay_subscription_id) {
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
      
      console.log(`Admin ${payment.adminId} moved to grace period until ${graceEndDate.toISOString()}`);
      
      // Send payment failed email
      try {
        await sendPaymentFailedEmail(
          admin,
          {
            paymentId: paymentId,
            subscriptionId: payment.razorpay_subscription_id,
            amount: paymentEntity.amount ? paymentEntity.amount / 100 : null
          },
          graceEndDate
        );
        console.log(`Payment failed email sent to ${admin.email}`);
      } catch (emailError) {
        console.error(`Error sending payment failed email: ${emailError.message}`);
      }
    }
  } catch (error) {
    console.error("Error handling payment.failed event:", error);
  }
};

/**
 * Handle subscription activated event
 * @param {Object} data - Subscription event payload
 * @returns {Promise<void>}
 */
const handleSubscriptionActivated = async (data) => {
  try {
    console.log("🔁 Processing subscription.activated event");
    const subscriptionEntity = data.subscription?.entity || {};
    const subscriptionId = subscriptionEntity.id;
    
    if (!subscriptionId) {
      console.error("Missing subscription ID in subscription.activated event");
      return;
    }
    
    // Find admin by subscription ID
    const admin = await Admin.findOne({ razorpaySubscriptionId: subscriptionId });
    
    if (!admin) {
      console.log(`No admin found with subscription ID ${subscriptionId}`);
      return;
    }
    
    // Calculate subscription dates
    const { startDate, endDate } = dateUtils.calculateSubscriptionDates(
      admin.subscriptionStatus,
      admin.trialEndDate,
      admin.graceEndDate
    );
    
    // Update admin subscription status
    await Admin.findByIdAndUpdate(
      admin._id,
      {
        subscriptionStatus: "active",
        subscriptionEndDate: endDate
      }
    );
    
    console.log(`Admin ${admin._id} subscription activated. End date: ${endDate.toISOString()}`);
  } catch (error) {
    console.error("Error handling subscription.activated event:", error);
  }
};

/**
 * Handle subscription charged event (recurring billing)
 * @param {Object} data - Subscription event payload
 * @returns {Promise<void>}
 */
const handleSubscriptionCharged = async (data) => {
  try {
    console.log("💰 Processing subscription.charged event");
    const subscriptionEntity = data.subscription?.entity || {};
    const subscriptionId = subscriptionEntity.id;
    const paymentId = data.payment?.entity?.id;
    
    if (!subscriptionId) {
      console.error("Missing subscription ID in subscription.charged event");
      return;
    }
    
    // Find admin by subscription ID
    const admin = await Admin.findOne({ razorpaySubscriptionId: subscriptionId });
    
    if (!admin) {
      console.log(`No admin found with subscription ID ${subscriptionId}`);
      return;
    }
    
    // For recurring charges, startDate is the previous subscriptionEndDate
    const startDate = admin.subscriptionEndDate 
      ? new Date(admin.subscriptionEndDate) 
      : dateUtils.getCurrentDateUTC();
    
    // Calculate new end date by adding 1 month to the start date
    const endDate = dateUtils.addMonths(startDate, 1);
    
    // Update admin subscription
    await Admin.findByIdAndUpdate(
      admin._id,
      {
        subscriptionStatus: "active",
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
    
    console.log(`Admin ${admin._id} subscription renewed. New end date: ${endDate.toISOString()}`);
    
    // Send renewal confirmation email
    try {
      await sendSubscriptionConfirmationEmail(
        admin,
        {
          razorpay_payment_id: paymentId || `recurring-${Date.now()}`,
          razorpay_subscription_id: subscriptionId,
          method: "Razorpay Recurring"
        },
        "ActiveHub Pro",
        subscriptionEntity.amount / 100,
        startDate,
        endDate,
        true // isRenewal flag
      );
      console.log(`Subscription renewal confirmation email sent to ${admin.email}`);
    } catch (emailError) {
      console.error(`Error sending renewal confirmation email: ${emailError.message}`);
    }
  } catch (error) {
    console.error("Error handling subscription.charged event:", error);
  }
};

/**
 * Handle subscription halted event (all retries failed)
 * @param {Object} data - Subscription event payload
 * @returns {Promise<void>}
 */
const handleSubscriptionHalted = async (data) => {
  try {
    console.log("⏸️ Processing subscription.halted event");
    const subscriptionEntity = data.subscription?.entity || {};
    const subscriptionId = subscriptionEntity.id;
    
    if (!subscriptionId) {
      console.error("Missing subscription ID in subscription.halted event");
      return;
    }
    
    // Find admin by subscription ID
    const admin = await Admin.findOne({ razorpaySubscriptionId: subscriptionId });
    
    if (!admin) {
      console.log(`No admin found with subscription ID ${subscriptionId}`);
      return;
    }
    
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
    
    console.log(`Admin ${admin._id} moved to grace period until ${graceEndDate.toISOString()}`);
    
    // Send subscription halted email
    try {
      await sendPaymentFailedEmail(
        admin,
        {
          subscriptionId: subscriptionId,
          amount: subscriptionEntity.amount ? subscriptionEntity.amount / 100 : null
        },
        graceEndDate
      );
      console.log(`Subscription halted email sent to ${admin.email}`);
    } catch (emailError) {
      console.error(`Error sending subscription halted email: ${emailError.message}`);
    }
  } catch (error) {
    console.error("Error handling subscription.halted event:", error);
  }
};

/**
 * Handle subscription cancelled event
 * @param {Object} data - Subscription event payload
 * @returns {Promise<void>}
 */
const handleSubscriptionCancelled = async (data) => {
  try {
    console.log("🛑 Processing subscription.cancelled event");
    const subscriptionEntity = data.subscription?.entity || {};
    const subscriptionId = subscriptionEntity.id;
    
    if (!subscriptionId) {
      console.error("Missing subscription ID in subscription.cancelled event");
      return;
    }
    
    // Find admin by subscription ID
    const admin = await Admin.findOne({ razorpaySubscriptionId: subscriptionId });
    
    if (!admin) {
      console.log(`No admin found with subscription ID ${subscriptionId}`);
      return;
    }
    
    // Determine end date - honor the current subscription until the end date
    const endDate = admin.subscriptionEndDate || new Date();
    
    // Update admin status to indicate cancellation
    await Admin.findByIdAndUpdate(
      admin._id,
      {
        subscriptionStatus: "cancelled",
        $push: {
          paymentHistory: {
            paymentId: `cancel-${Date.now()}`,
            amount: 0,
            plan: "ActiveHub Pro - Cancellation",
            startDate: new Date(),
            endDate: endDate,
            status: "cancellation_confirmed",
            createdAt: new Date()
          }
        }
      }
    );
    
    console.log(`Admin ${admin._id} subscription cancelled. Active until: ${endDate.toISOString()}`);
    
    // Send cancellation confirmation email
    try {
      await sendSubscriptionCancelledEmail(
        admin,
        {
          subscriptionId: subscriptionId
        },
        endDate
      );
      console.log(`Subscription cancellation email sent to ${admin.email}`);
    } catch (emailError) {
      console.error(`Error sending cancellation email: ${emailError.message}`);
    }
  } catch (error) {
    console.error("Error handling subscription.cancelled event:", error);
  }
};

/**
 * Handle subscription authenticated event
 * @param {Object} data - Subscription event payload
 * @returns {Promise<void>}
 */
const handleSubscriptionAuthenticated = async (data) => {
  try {
    console.log("🔐 Processing subscription.authenticated event");
    const subscriptionEntity = data.subscription?.entity || {};
    const subscriptionId = subscriptionEntity.id;
    
    if (!subscriptionId) {
      console.error("Missing subscription ID in subscription.authenticated event");
      return;
    }
    
    // Log the authentication success
    console.log(`Subscription ${subscriptionId} authenticated successfully`);
    
    // Find admin associated with this subscription
    const adminId = subscriptionEntity.notes?.adminId;
    if (adminId) {
      const admin = await Admin.findById(adminId);
      if (admin) {
        // Update admin record with authentication status
        await Admin.findByIdAndUpdate(
          adminId,
          {
            subscriptionAuthStatus: "authenticated",
            subscriptionAuthDate: new Date()
          }
        );
        console.log(`Admin ${adminId} subscription authentication status updated`);
      }
    }
  } catch (error) {
    console.error("Error handling subscription.authenticated event:", error);
  }
};

/**
 * Handle refund created event
 * @param {Object} data - Refund event payload
 * @returns {Promise<void>}
 */
const handleRefundCreated = async (data) => {
  try {
    console.log("💸 Processing refund.created event");
    const refundEntity = data.refund?.entity || {};
    const refundId = refundEntity.id;
    const paymentId = refundEntity.payment_id;
    
    if (!refundId || !paymentId) {
      console.error("Missing refund ID or payment ID in refund.created event");
      return;
    }
    
    // Find the payment record
    const payment = await Payment.findOne({ razorpay_payment_id: paymentId });
    
    if (!payment) {
      console.log(`No associated payment record found for payment ${paymentId}`);
      return;
    }
    
    // Update payment with refund information
    await Payment.findByIdAndUpdate(
      payment._id,
      {
        refundStatus: "initiated",
        refundId: refundId,
        refundAmount: refundEntity.amount / 100, // Convert from paisa to rupees
        refundReason: refundEntity.notes?.reason || "Refund initiated",
        refundCreatedAt: new Date()
      }
    );
    
    console.log(`Payment ${paymentId} updated with refund information`);
  } catch (error) {
    console.error("Error handling refund.created event:", error);
  }
};

/**
 * Handle refund processed event
 * @param {Object} data - Refund event payload
 * @returns {Promise<void>}
 */
const handleRefundProcessed = async (data) => {
  try {
    console.log("✅ Processing refund.processed event");
    const refundEntity = data.refund?.entity || {};
    const refundId = refundEntity.id;
    const paymentId = refundEntity.payment_id;
    
    if (!refundId || !paymentId) {
      console.error("Missing refund ID or payment ID in refund.processed event");
      return;
    }
    
    // Find the payment record
    const payment = await Payment.findOne({ razorpay_payment_id: paymentId });
    
    if (!payment) {
      console.log(`No associated payment record found for payment ${paymentId}`);
      return;
    }
    
    // Update payment with completed refund status
    await Payment.findByIdAndUpdate(
      payment._id,
      {
        refundStatus: "completed",
        refundProcessedAt: new Date(),
        status: "refunded" // Update the overall payment status
      }
    );
    
    console.log(`Refund for payment ${paymentId} has been processed successfully`);
    
    // If this was a subscription payment, update the admin's subscription status
    if (payment.razorpay_subscription_id && payment.adminId) {
      // Check if this was the most recent payment for this subscription
      const latestPayment = await Payment.findOne({
        razorpay_subscription_id: payment.razorpay_subscription_id,
        status: { $ne: "refunded" }
      }).sort({ createdAt: -1 });
      
      // If no other valid payments exist, update admin subscription status
      if (!latestPayment) {
        await Admin.findByIdAndUpdate(
          payment.adminId,
          {
            subscriptionStatus: "cancelled",
            subscriptionCancelReason: "Payment refunded",
            subscriptionEndDate: new Date() // End subscription immediately
          }
        );
        
        console.log(`Admin ${payment.adminId} subscription cancelled due to refund`);
      }
    }
  } catch (error) {
    console.error("Error handling refund.processed event:", error);
  }
};

/**
 * Handle Razorpay webhook events
 * @param {String} event - The event type
 * @param {Object} data - The event payload
 * @returns {Promise<boolean>} Success status
 */
const handleRazorpayEvent = async (event, data) => {
  try {
    switch (event) {
      case "payment.authorized":
        // Payment is authorized but not captured yet
        console.log("✅ Payment authorized, waiting for capture");
        break;
        
      case "payment.captured":
      case "payment.success":
        await handlePaymentCaptured(data);
        break;
        
      case "payment.failed":
        await handlePaymentFailed(data);
        break;
        
      case "subscription.created":
      case "subscription.activated":
        await handleSubscriptionActivated(data);
        break;
      
      case "subscription.authenticated":
        await handleSubscriptionAuthenticated(data);
        break;
        
      case "subscription.charged":
      case "subscription.renewed":
        await handleSubscriptionCharged(data);
        break;
        
      case "subscription.halted":
        await handleSubscriptionHalted(data);
        break;
        
      case "subscription.cancelled":
      case "subscription.completed":
        await handleSubscriptionCancelled(data);
        break;
      
      case "refund.created":
        await handleRefundCreated(data);
        break;
        
      case "refund.processed":
        await handleRefundProcessed(data);
        break;
        
      default:
        console.log(`📩 Unhandled Razorpay event: ${event}`);
        return false;
    }
    
    return true;
  } catch (error) {
    console.error(`Error handling Razorpay event ${event}:`, error);
    return false;
  }
};

module.exports = {
  handleRazorpayEvent,
  handlePaymentCaptured,
  handlePaymentFailed,
  handleSubscriptionActivated,
  handleSubscriptionAuthenticated,
  handleSubscriptionCharged,
  handleSubscriptionHalted,
  handleSubscriptionCancelled,
  handleRefundCreated,
  handleRefundProcessed
}; 