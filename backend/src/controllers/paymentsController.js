const razorpay = require("../utils/razorpay");
const crypto = require("crypto");
const Payment = require("../models/Payments");
const { admin } = require("googleapis/build/src/apis/admin");
const Admin = require("../models/Admin");
const { sendSubscriptionConfirmationEmail } = require("../services/emailService");

exports.createSubscription = async (req, res) => {
    try {
      const admin = req.admin;
  
      // Create the subscription with proper settings for recurring payments
      const subscription = await razorpay.subscriptions.create({
        plan_id: process.env.RAZORPAY_PLAN_ID,
        customer_notify: 1, // Razorpay will send an email to customer
        total_count: 12,     // Auto-renews for 12 months (can cancel anytime)
        quantity: 1,
        notes: {
          adminId: admin._id.toString(),
          email: admin.email,
        },
        // Remove start_at and expire_at to allow proper recurring subscription
      });
  
      res.status(200).json({
        subscriptionId: subscription.id,
        planId: subscription.plan_id,
        subscriptionLink: `https://rzp.io/rzp/${subscription.id}`,
        customerId: subscription.customer_id,
        nextDueOn: new Date(subscription.next_due_on * 1000).toLocaleString(),
        createdAt: new Date(subscription.created_at * 1000).toLocaleString(),
        status: subscription.status,
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
    
    // Calculate subscription end date (30 days from now)
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 30);
    
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
  
    console.log(`Admin ${adminId} subscription status updated to active`);

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
              
              // Calculate new subscription end date (30 days from now)
              const subscriptionEndDate = new Date();
              subscriptionEndDate.setDate(subscriptionEndDate.getDate() + 30);
              
              // Update admin's subscription status
              const admin = await Admin.findByIdAndUpdate(
                payment.adminId,
                {
                  subscriptionStatus: "active",
                  subscriptionEndDate: subscriptionEndDate,
                  $push: { 
                    paymentHistory: {
                      paymentId: paymentDetails.id,
                      amount: paymentDetails.amount / 100,
                      plan: "ActiveHub Pro",
                      startDate: new Date(),
                      endDate: subscriptionEndDate,
                      status: "completed",
                      createdAt: new Date()
                    }
                  }
                },
                { new: true }
              );
              
              console.log(`Admin ${payment.adminId} subscription updated after payment capture`);
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
            // Calculate subscription end date (30 days from now)
            const subscriptionEndDate = new Date();
            subscriptionEndDate.setDate(subscriptionEndDate.getDate() + 30);
            
            // Update admin subscription status
            await Admin.findByIdAndUpdate(
              adminToUpdate._id,
              {
                subscriptionStatus: "active",
                subscriptionEndDate: subscriptionEndDate
              }
            );
            
            console.log(`Admin ${adminToUpdate._id} subscription activated`);
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
            // Extend subscription end date by 30 days
            const oldEndDate = new Date(subscribedAdmin.subscriptionEndDate || new Date());
            const newEndDate = new Date(oldEndDate);
            newEndDate.setDate(newEndDate.getDate() + 30);
            
            // Update admin subscription
            await Admin.findByIdAndUpdate(
              subscribedAdmin._id,
              {
                subscriptionEndDate: newEndDate,
                $push: { 
                  paymentHistory: {
                    paymentId: paymentId || `recurring-${Date.now()}`,
                    amount: chargedSubscription.amount / 100,
                    plan: "ActiveHub Pro",
                    startDate: oldEndDate,
                    endDate: newEndDate,
                    status: "completed",
                    createdAt: new Date()
                  }
                }
              }
            );
            
            console.log(`Admin ${subscribedAdmin._id} subscription extended to ${newEndDate}`);
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
  