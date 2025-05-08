/**
 * Script to manually run monthly reports
 * It can be run with the following options:
 * - No arguments: Run for current month if it's the last day of the month
 * - --force: Run regardless of the date for the current month
 * - --month=X: Run for a specific month (0-11)
 * - --year=YYYY: Run for a specific year
 */

// Load environment variables
require('dotenv').config();
const mongoose = require('mongoose');
const { processMonthlyReports } = require('../services/monthlyRevenueService');
const { createTransporter } = require('../services/emailService');

// Parse command line arguments
const args = process.argv.slice(2);
const force = args.includes('--force');
let month = null;
let year = null;

// Parse month and year arguments if provided
args.forEach(arg => {
  if (arg.startsWith('--month=')) {
    month = parseInt(arg.split('=')[1], 10);
    if (isNaN(month) || month < 0 || month > 11) {
      console.error('Invalid month. Must be between 0-11');
      process.exit(1);
    }
  }
  if (arg.startsWith('--year=')) {
    year = parseInt(arg.split('=')[1], 10);
    if (isNaN(year) || year < 2000 || year > 2100) {
      console.error('Invalid year. Must be between 2000-2100');
      process.exit(1);
    }
  }
});

// Connect to MongoDB
console.log('🚀 Starting monthly reports...');
if (force) console.log('⚠️ Force flag detected - running regardless of date');
if (month !== null) console.log(`📅 Month specified: ${month}`);
if (year !== null) console.log(`📅 Year specified: ${year}`);

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => {
  console.log('\nMongoDB connected successfully');
  console.log('✅ Database connected');
  console.log('📊 Triggering monthly reports...');
  
  // Run the monthly reports with the specified parameters
  processMonthlyReports(force, month, year)
    .then(successCount => {
      if (successCount > 0) {
        console.log(`✅ Monthly reports sent successfully to ${successCount} gyms!`);
      } else {
        console.log('⚠️ No monthly reports were sent. Check the logs for details.');
      }
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Error generating monthly reports:', error);
      process.exit(1);
    });
})
.catch(err => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});  

// Script execution is handled by the main code above
