const crypto = require('crypto');

/**
 * Generate a test signature for Razorpay webhook testing
 * 
 * Usage:
 * 1. Set your webhook secret in the .env file as RAZORPAY_WEBHOOK_SECRET
 * 2. Run this script with: node src/utils/testWebhook.js
 * 3. Copy the generated signature and use it in your Postman request
 */

// Load environment variables
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

// Test payload (same as what you're sending)
const payload = {
  "event": "payment.captured",
  "payload": {
    "payment": {
      "entity": {
        "id": "pay_test_12345",
        "amount": 19900,
        "currency": "INR",
        "status": "captured",
        "email": "gymowner@example.com",
        "notes": {
          "adminId": "6811ece1010c47ec9d994ab8"
        }
      }
    }
  }
};

// Get webhook secret from environment variables
const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

if (!webhookSecret) {
  console.error('❌ Error: RAZORPAY_WEBHOOK_SECRET not found in .env file');
  process.exit(1);
}

// Convert payload to string
const payloadString = JSON.stringify(payload);

// Generate signature
const signature = crypto
  .createHmac('sha256', webhookSecret)
  .update(payloadString)
  .digest('hex');

console.log('\n🔐 Razorpay Webhook Test Signature Generator 🔐\n');
console.log('📝 Test Payload:');
console.log(JSON.stringify(payload, null, 2));
console.log('\n🔑 Generated Signature:');
console.log(signature);
console.log('\n📋 Instructions:');
console.log('1. Send a POST request to: http://localhost:3000/api/webhook/razorpay?testMode=true');
console.log('2. Set Content-Type header to: application/json');
console.log('3. Add x-razorpay-signature header with the value above');
console.log('4. Include the test payload in the request body');
console.log('\n✅ This will create a test webhook event in your database\n');

module.exports = {
  generateTestSignature: (payload, secret) => {
    const payloadString = JSON.stringify(payload);
    return crypto
      .createHmac('sha256', secret)
      .update(payloadString)
      .digest('hex');
  }
};
