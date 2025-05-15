const razorpay = require("../utils/razorpay");
const crypto = require("crypto");
const Payment = require("../models/Payments");
const { admin } = require("googleapis/build/src/apis/admin");
const Admin = require("../models/Admin");
const { sendSubscriptionConfirmationEmail } = require("../services/emailService");
const dateUtils = require("../utils/dateUtils");

exports.createSubscription = async (req, res) => {
    try {
      const admin = req.admin;
      
      // Calculate trial period days if user is in trial
      const trialPeriodDays = admin.subscriptionStatus === 'trial' && admin.trialEndDate 
        ? Math.max(0, Math.ceil((new Date(admin.trialEndDate) - new Date()) / (1000 * 60 * 60 * 24)))
        : 0;
      
      // Get subscription configuration based on user status
      const subscriptionConfig = {
        plan_id: process.env.RAZORPAY_PLAN_ID,
        customer_notify: 1, // Razorpay will send an email to customer
        total_count: 12,     // Auto-renews for 12 months (can cancel anytime)
        quantity: 1,
        notes: {
          adminId: admin._id.toString(),
          email: admin.email,
          subscriptionStatus: admin.subscriptionStatus,
          trialEndDate: admin.trialEndDate ? new Date(admin.trialEndDate).toISOString() : null,
        },
      };
      
      // If user is in trial, add trial_period_days to the subscription
      if (trialPeriodDays > 0) {

        subscriptionConfig.start_at = Math.floor(new Date(admin.trialEndDate).getTime() / 1000); // Unix timestamp
      }
  
      // Create the subscription with proper settings
      const subscription = await razorpay.subscriptions.create(subscriptionConfig);
      
      // Calculate our dates using our utility
      const { startDate, endDate } = dateUtils.calculateSubscriptionDates(
        admin.subscriptionStatus,
        admin.trialEndDate,
        admin.graceEndDate
      );
  
      res.status(200).json({
        subscriptionId: subscription.id,
        planId: subscription.plan_id,
        subscriptionLink: `https://rzp.io/rzp/${subscription.id}`,
        customerId: subscription.customer_id,
        nextDueOn: new Date(subscription.next_due_on * 1000).toLocaleString(),
        createdAt: new Date(subscription.created_at * 1000).toLocaleString(),
        status: subscription.status,
        // Include our calculated dates in the response
        calculatedStartDate: startDate.toISOString(),
        calculatedEndDate: endDate.toISOString(),
        trialPeriodDays: trialPeriodDays
      });
    } catch (err) {
      console.error("Error creating subscription:", err);
      res.status(500).json({ message: "Subscription creation failed", error: err.message || err });
    }
};


exports.verifySubscription = async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_subscription_id, razorpay_signature } = req.body;

    const generated_signature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_payment_id + "|" + razorpay_subscription_id)
      .digest("hex");

    if (generated_signature !== razorpay_signature) {
      return res.status(400).json({ message: "Signature verification failed" });
    }

    const adminId = req.admin._id;
    const admin = await Admin.findById(adminId);

    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    const payment = new Payment({
      adminId,
      razorpay_payment_id,
      razorpay_subscription_id,
      razorpay_signature,
      status: "completed", // or "initiated" initially, then update later via webhook
      amount: 199, // Current plan price
    });
    
    await payment.save();
    
    // Calculate subscription dates using our utility function
    const { startDate, endDate } = dateUtils.calculateSubscriptionDates(
      admin.subscriptionStatus,
      admin.trialEndDate,
      admin.graceEndDate
    );
    
    // Get the subscription details from Razorpay to align with next_due_on
    const subscription = await razorpay.subscriptions.fetch(razorpay_subscription_id);
    const razorpayNextDueDate = new Date(subscription.next_due_on * 1000);
    
    // Ensure our end date aligns with Razorpay's next_due_on
    // Note: We prioritize our calculated end date, but log any mismatch for debugging
    if (Math.abs(endDate.getTime() - razorpayNextDueDate.getTime()) > 24 * 60 * 60 * 1000) {

    }
    
    // Update the admin's subscription status
    await Admin.findByIdAndUpdate(adminId, { 
      subscriptionStatus: "active",
      razorpaySubscriptionId: razorpay_subscription_id,
      subscriptionEndDate: endDate,
      // Add payment to history
      $push: { 
        paymentHistory: {
          paymentId: razorpay_payment_id,
          amount: 199, // Current plan price
          plan: "ActiveHub Pro",
          startDate: startDate,
          endDate: endDate,
          status: "completed"
        }
      }
    });
  


    // Send confirmation email with invoice details
    try {
      const paymentDetails = {
        razorpay_payment_id,
        razorpay_subscription_id,
        method: "Razorpay"
      };
      
      const { sendSubscriptionConfirmationEmail } = require("../services/emailService");
      
      await sendSubscriptionConfirmationEmail(
        admin,
        paymentDetails,
        "ActiveHub Pro",
        199, // Current plan price
        startDate,
        endDate
      );
      

    } catch (emailError) {
      console.error("Error sending confirmation email:", emailError);
      // Continue processing even if email fails
    }

    res.status(200).json({ message: "Payment verified and saved" });
  } catch (err) {
    console.error("Payment verify error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

exports.getPaymentHistory = async (req, res) => {
  try {
    const adminId = req.admin._id;
    const admin = await Admin.findById(adminId);
    
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }
    
    // Return payment history from admin document
    res.status(200).json(admin.paymentHistory || []);
  } catch (err) {
    console.error("Error fetching payment history:", err);
    res.status(500).json({ message: "Failed to fetch payment history" });
  }
};

exports.cancelSubscription = async (req, res) => {
  try {
    const adminId = req.admin._id;
    const admin = await Admin.findById(adminId);

    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    // Check if admin has an active subscription
    if (admin.subscriptionStatus !== 'active' && admin.subscriptionStatus !== 'trial' || !admin.razorpaySubscriptionId) {
      return res.status(400).json({ 
        message: "No active subscription found to cancel" 
      });
    }

    const subscriptionId = admin.razorpaySubscriptionId;
    let isCancelledDirectly = false;

    try {
      // Try to cancel subscription with Razorpay
      // Setting cancel_at_cycle_end to true will cancel the subscription at the end of the current billing cycle
      await razorpay.subscriptions.cancel(subscriptionId, {
        cancel_at_cycle_end: true
      });
    } catch (razorpayError) {
      // If we can't cancel through Razorpay (e.g., during trial period)
      // This is common during trial periods, so we handle it gracefully
      isCancelledDirectly = true;
    }

    // Calculate end date - if in trial, use trial end date, otherwise use subscription end date
    const endDate = admin.trialEndDate && new Date(admin.trialEndDate) > new Date() 
      ? admin.trialEndDate 
      : admin.subscriptionEndDate;

    // Update admin's subscription status
    const updateData = isCancelledDirectly 
      ? {
          subscriptionStatus: "cancelled",
          $push: {
            paymentHistory: {
              paymentId: `cancel-${Date.now()}`,
              amount: 0,
              plan: "ActiveHub Pro - Cancellation",
              startDate: new Date(),
              endDate: endDate,
              status: "cancelled",
              createdAt: new Date()
            }
          }
        }
      : {
          subscriptionStatus: "active", // Keep as active until the end date
          $push: {
            paymentHistory: {
              paymentId: `cancel-${Date.now()}`,
              amount: 0,
              plan: "ActiveHub Pro - Cancellation",
              startDate: new Date(),
              endDate: endDate,
              status: "cancellation_scheduled",
              createdAt: new Date()
            }
          }
        };

    await Admin.findByIdAndUpdate(adminId, updateData);

    // Send cancellation email
    try {
      const { sendSubscriptionCancelledEmail } = require("../services/emailService");
      
      await sendSubscriptionCancelledEmail(
        admin,
        { subscriptionId },
        endDate
      );
    } catch (emailError) {
      console.error("Error sending cancellation email:", emailError);
      // Continue processing even if email fails
    }

    const message = isCancelledDirectly
      ? "Your subscription has been cancelled."
      : "Subscription cancellation scheduled. Your subscription will remain active until the end of your current billing period.";

    res.status(200).json({ 
      message: message, 
      endDate: endDate 
    });
  } catch (err) {
    console.error("Cancel subscription error:", err);
    res.status(500).json({ message: "Failed to cancel subscription", error: err.message });
  }
};
  