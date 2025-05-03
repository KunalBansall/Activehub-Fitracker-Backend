/**
 * Utility functions for handling dates in a timezone-safe manner
 * Used primarily for subscription date calculations
 */

/**
 * Get the current date in UTC, set to the start of the day
 * @returns {Date} Current date in UTC
 */
const getCurrentDateUTC = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

/**
 * Add the specified number of months to a date
 * Handles edge cases like month boundaries correctly
 * 
 * @param {Date|string} date - The starting date (Date object or ISO string)
 * @param {number} months - Number of months to add
 * @returns {Date} New date with added months
 */
const addMonths = (date, months) => {
  const result = new Date(date);
  const currentMonth = result.getUTCMonth();
  const targetMonth = currentMonth + months;
  
  result.setUTCMonth(targetMonth);
  
  // Handle cases where the day doesn't exist in the target month (e.g., Jan 31 -> Feb 28)
  if (result.getUTCMonth() !== ((targetMonth) % 12)) {
    // If the month rolled over unexpectedly, set to the last day of the previous month
    result.setUTCDate(0);
  }
  
  return result;
};

/**
 * Format a date to an ISO string (YYYY-MM-DD)
 * 
 * @param {Date|string} date - The date to format
 * @returns {string} Formatted date string
 */
const formatDate = (date) => {
  const d = new Date(date);
  return d.toISOString().split('T')[0];
};

/**
 * Calculates subscription start and end dates based on user status
 * 
 * @param {string} status - Current subscription status ('trial', 'grace', etc)
 * @param {Date|string|null} trialEndDate - Date when trial period ends (if applicable)
 * @param {Date|string|null} graceEndDate - Date when grace period ends (if applicable)
 * @returns {{startDate: Date, endDate: Date}} Object containing calculated start and end dates
 */
const calculateSubscriptionDates = (status, trialEndDate, graceEndDate) => {
  let startDate = getCurrentDateUTC(); // Default to today
  let endDate;
  
  if (status === 'trial' && trialEndDate) {
    // If in trial, subscription starts on the trial end date
    startDate = new Date(trialEndDate);
  } else if (status === 'grace' && graceEndDate) {
    // If in grace period, subscription starts on the grace end date
    startDate = new Date(graceEndDate);
  }
  
  // End date is always 1 month (30 days) after start date
  endDate = addMonths(startDate, 1);
  
  return { startDate, endDate };
};

/**
 * Compare two dates to see if the first is after the second
 * Handles null values safely
 * 
 * @param {Date|string|null} date1 - First date to compare
 * @param {Date|string|null} date2 - Second date to compare
 * @returns {boolean} True if date1 is after date2, false otherwise
 */
const isDateAfter = (date1, date2) => {
  if (!date1 || !date2) return false;
  
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  
  return d1 > d2;
};

module.exports = {
  getCurrentDateUTC,
  addMonths,
  formatDate,
  calculateSubscriptionDates,
  isDateAfter
}; 