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
        console.log(`Creating subscription with ${trialPeriodDays} trial days remaining for admin ${admin._id}`);
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
      console.log(`Warning: Calculated end date (${endDate.toISOString()}) differs from Razorpay next_due_on (${razorpayNextDueDate.toISOString()}) by more than 1 day`);
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
  
    console.log(`Admin ${adminId} subscription status updated to active. Start: ${startDate.toISOString()}, End: ${endDate.toISOString()}`);

    // Send confirmation email with invoice details
    try {
      const paymentDetails = {
        razorpay_payment_id,
        razorpay_subscription_id,
        method: "Razorpay"
      };
      
      await sendSubscriptionConfirmationEmail(
        admin,
        paymentDetails,
        "ActiveHub Pro",
        199, // Current plan price
        startDate,
        endDate
      );
      
      console.log(`Subscription confirmation email sent to ${admin.email}`);
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

exports.handleWebhook = async (req, res) => {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers["x-razorpay-signature"];
    
    const payload = JSON.stringify(req.body);
    
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");
    
    if (expectedSignature !== signature) {
      console.log("⚠️ Webhook signature mismatch");
      return res.status(400).send("Invalid signature");
    }
  
    const event = req.body.event;
    const data = req.body.payload;
    
    try {
      switch (event) {
        case "payment.authorized":
          console.log("✅ Payment authorized", data);
          // Mark the payment as authorized but still not captured
          break;
  
        case "payment.captured":
          console.log("✅ Payment captured", data);
          // Update payment status as captured (successful payment)
          const paymentDetails = data.payment.entity;
          
          // Update payment record
          await Payment.updateOne(
            { razorpay_payment_id: paymentDetails.id },
            { 
              status: "completed",
              amount: paymentDetails.amount / 100, // Convert from paisa to rupees
              method: paymentDetails.method
            }
          );
          
          // Find the subscription ID associated with this payment
          const payment = await Payment.findOne({ razorpay_payment_id: paymentDetails.id });
          
          if (payment && payment.razorpay_subscription_id) {
            // Get subscription details from Razorpay
            const subscriptionId = payment.razorpay_subscription_id;
            
            try {
              const subscription = await razorpay.subscriptions.fetch(subscriptionId);
              
              // Find admin to check current status
              const admin = await Admin.findById(payment.adminId);
              
              if (!admin) {
                console.error(`Admin not found for payment ${paymentDetails.id}`);
                break;
              }
              
              // Calculate subscription dates using our utility function
              const { startDate, endDate } = dateUtils.calculateSubscriptionDates(
                admin.subscriptionStatus,
                admin.trialEndDate,
                admin.graceEndDate
              );
              
              // Get next due date from Razorpay
              const razorpayNextDueDate = new Date(subscription.next_due_on * 1000);
              
              // Check for significant mismatches between our calculation and Razorpay's
              if (Math.abs(endDate.getTime() - razorpayNextDueDate.getTime()) > 24 * 60 * 60 * 1000) {
                console.log(`Warning: Webhook - Calculated end date (${endDate.toISOString()}) differs from Razorpay next_due_on (${razorpayNextDueDate.toISOString()}) by more than 1 day`);
              }
              
              // Update admin's subscription status
              await Admin.findByIdAndUpdate(
                payment.adminId,
                {
                  subscriptionStatus: "active",
                  subscriptionEndDate: endDate,
                  $push: { 
                    paymentHistory: {
                      paymentId: paymentDetails.id,
                      amount: paymentDetails.amount / 100,
                      plan: "ActiveHub Pro",
                      startDate: startDate,
                      endDate: endDate,
                      status: "completed",
                      createdAt: new Date()
                    }
                  }
                },
                { new: true }
              );
              
              console.log(`Admin ${payment.adminId} subscription updated after payment capture. Start: ${startDate.toISOString()}, End: ${endDate.toISOString()}`);
            } catch (error) {
              console.error("Error fetching subscription from Razorpay:", error);
            }
          }
          break;
  
        case "subscription.activated":
          console.log("🔁 Subscription activated", data);
          
          // Get subscription details
          const activatedSubscription = data.subscription.entity;
          
          // Find admin by subscription ID
          const adminToUpdate = await Admin.findOne({ 
            razorpaySubscriptionId: activatedSubscription.id 
          });
          
          if (adminToUpdate) {
            // Calculate subscription dates using our utility function
            const { startDate, endDate } = dateUtils.calculateSubscriptionDates(
              adminToUpdate.subscriptionStatus,
              adminToUpdate.trialEndDate,
              adminToUpdate.graceEndDate
            );
            
            // Get next due date from Razorpay
            const razorpayNextDueDate = new Date(activatedSubscription.next_due_on * 1000);
            
            // Check for significant mismatches between our calculation and Razorpay
            if (Math.abs(endDate.getTime() - razorpayNextDueDate.getTime()) > 24 * 60 * 60 * 1000) {
              console.log(`Warning: Activation - Calculated end date (${endDate.toISOString()}) differs from Razorpay next_due_on (${razorpayNextDueDate.toISOString()}) by more than 1 day`);
            }
            
            // Update admin subscription status
            await Admin.findByIdAndUpdate(
              adminToUpdate._id,
              {
                subscriptionStatus: "active",
                subscriptionEndDate: endDate
              }
            );
            
            console.log(`Admin ${adminToUpdate._id} subscription activated. Start: ${startDate.toISOString()}, End: ${endDate.toISOString()}`);
          }
          break;
  
        case "subscription.charged":
          console.log("💰 Subscription charged", data);
          
          // Update subscription end date for recurring billing
          const chargedSubscription = data.subscription.entity;
          const paymentId = data.payment?.entity?.id;
          
          // Find admin by subscription ID
          const subscribedAdmin = await Admin.findOne({ 
            razorpaySubscriptionId: chargedSubscription.id 
          });
          
          if (subscribedAdmin) {
            // For recurring charges, startDate is the previous subscriptionEndDate
            const startDate = subscribedAdmin.subscriptionEndDate 
              ? new Date(subscribedAdmin.subscriptionEndDate) 
              : dateUtils.getCurrentDateUTC();
            
            // Calculate new end date by adding 1 month to the start date
            const endDate = dateUtils.addMonths(startDate, 1);
            
            // Get next due date from Razorpay
            const razorpayNextDueDate = chargedSubscription.next_due_on
              ? new Date(chargedSubscription.next_due_on * 1000)
              : dateUtils.addMonths(dateUtils.getCurrentDateUTC(), 1);
              
            // Check for significant mismatches between our calculation and Razorpay
            if (Math.abs(endDate.getTime() - razorpayNextDueDate.getTime()) > 24 * 60 * 60 * 1000) {
              console.log(`Warning: Charged - Calculated end date (${endDate.toISOString()}) differs from Razorpay next_due_on (${razorpayNextDueDate.toISOString()}) by more than 1 day`);
            }
            
            // Update admin subscription
            await Admin.findByIdAndUpdate(
              subscribedAdmin._id,
              {
                subscriptionEndDate: endDate,
                $push: { 
                  paymentHistory: {
                    paymentId: paymentId || `recurring-${Date.now()}`,
                    amount: chargedSubscription.amount / 100,
                    plan: "ActiveHub Pro",
                    startDate: startDate,
                    endDate: endDate,
                    status: "completed",
                    createdAt: new Date()
                  }
                }
              }
            );
            
            console.log(`Admin ${subscribedAdmin._id} subscription extended. Start: ${startDate.toISOString()}, End: ${endDate.toISOString()}`);
          }
          break;
  
        case "payment.failed":
          console.log("❌ Payment failed", data);
          
          const failedPaymentDetails = data.payment.entity;
          
          // Update payment record as failed
          await Payment.updateOne(
            { razorpay_payment_id: failedPaymentDetails.id },
            { status: "failed" }
          );
          
          // Find the subscription associated with this payment
          const failedPayment = await Payment.findOne({ 
            razorpay_payment_id: failedPaymentDetails.id 
          });
          
          if (failedPayment && failedPayment.razorpay_subscription_id) {
            // Get admin by subscription ID
            const admin = await Admin.findOne({
              razorpaySubscriptionId: failedPayment.razorpay_subscription_id
            });
            
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
          }
          break;
  
        case "subscription.halted":
          console.log("⏸️ Subscription halted", data);
          
          // Handle subscription halted (all retries failed)
          const haltedSubscription = data.subscription.entity;
          
          // Find admin by subscription ID
          const haltedAdmin = await Admin.findOne({ 
            razorpaySubscriptionId: haltedSubscription.id 
          });
          
          if (haltedAdmin) {
            // Set grace period (7 days from now)
            const graceEndDate = new Date();
            graceEndDate.setDate(graceEndDate.getDate() + 7);
            
            // Update admin status to grace period
            await Admin.findByIdAndUpdate(
              haltedAdmin._id,
              {
                subscriptionStatus: "grace",
                graceEndDate: graceEndDate
              }
            );
            
            console.log(`Admin ${haltedAdmin._id} moved to grace period until ${graceEndDate}`);
          }
          break;
  
        case "subscription.cancelled":
          console.log("🛑 Subscription cancelled", data);
          
          // Handle subscription cancellation
          const cancelledSubscription = data.subscription.entity;
          
          // Find admin by subscription ID
          const cancelledAdmin = await Admin.findOne({ 
            razorpaySubscriptionId: cancelledSubscription.id 
          });
          
          if (cancelledAdmin) {
            // Update admin status to cancelled
            await Admin.findByIdAndUpdate(
              cancelledAdmin._id,
              {
                subscriptionStatus: "cancelled"
              }
            );
            
            console.log(`Admin ${cancelledAdmin._id} subscription cancelled`);
          }
          break;
  
        default:
          console.log("📩 Unhandled event:", event);
      }
  
      res.status(200).json({ status: "Webhook received" });
    } catch (err) {
      console.error("Webhook error:", err);
      res.status(500).send("Webhook handler failed");
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
    if (admin.subscriptionStatus !== 'active' || !admin.razorpaySubscriptionId) {
      return res.status(400).json({ 
        message: "No active subscription found to cancel" 
      });
    }

    const subscriptionId = admin.razorpaySubscriptionId;

    // Cancel subscription with Razorpay
    // Setting cancel_at_cycle_end to true will cancel the subscription at the end of the current billing cycle
    await razorpay.subscriptions.cancel(subscriptionId, {
      cancel_at_cycle_end: true
    });

    // Update admin's subscription status to indicate cancellation pending
    await Admin.findByIdAndUpdate(adminId, {
      subscriptionStatus: "active", // Keep as active until the end date
      $push: {
        paymentHistory: {
          paymentId: `cancel-${Date.now()}`,
          amount: 0,
          plan: "ActiveHub Pro - Cancellation",
          startDate: new Date(),
          endDate: admin.subscriptionEndDate,
          status: "cancellation_scheduled",
          createdAt: new Date()
        }
      }
    });

    console.log(`Admin ${adminId} subscription cancelled at cycle end: ${subscriptionId}`);

    res.status(200).json({ 
      message: "Subscription cancellation scheduled. Your subscription will remain active until the end of your current billing period.", 
      endDate: admin.subscriptionEndDate 
    });
  } catch (err) {
    console.error("Cancel subscription error:", err);
    res.status(500).json({ message: "Failed to cancel subscription", error: err.message });
  }
};
  