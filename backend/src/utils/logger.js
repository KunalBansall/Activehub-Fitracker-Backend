/**
 * Simple logger utility for the application
 * Provides consistent logging format with timestamps and log levels
 */

// Log levels with color codes
const LOG_LEVELS = {
  INFO: '\x1b[36m%s\x1b[0m', // Cyan
  WARN: '\x1b[33m%s\x1b[0m', // Yellow
  ERROR: '\x1b[31m%s\x1b[0m', // Red
  DEBUG: '\x1b[90m%s\x1b[0m', // Gray
  SUCCESS: '\x1b[32m%s\x1b[0m' // Green
};

// Get formatted timestamp for logs
const getTimestamp = () => {
  return new Date().toISOString();
};

// Format log message with timestamp
const formatLogMessage = (message) => {
  return `[${getTimestamp()}] ${message}`;
};

// Logger methods
const logger = {
  /**
   * Log informational message
   * @param {string} message - Message to log
   */
  info: (message) => {
    console.log(LOG_LEVELS.INFO, formatLogMessage(`INFO: ${message}`));
  },

  /**
   * Log warning message
   * @param {string} message - Message to log
   */
  warn: (message) => {
    console.log(LOG_LEVELS.WARN, formatLogMessage(`WARNING: ${message}`));
  },

  /**
   * Log error message
   * @param {string} message - Message to log
   * @param {Error} [error] - Optional error object
   */
  error: (message, error) => {
    console.log(LOG_LEVELS.ERROR, formatLogMessage(`ERROR: ${message}`));
    if (error) {
      console.error(error);
    }
  },

  /**
   * Log debug message (only in development environment)
   * @param {string} message - Message to log
   */
  debug: (message) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(LOG_LEVELS.DEBUG, formatLogMessage(`DEBUG: ${message}`));
    }
  },

  /**
   * Log success message
   * @param {string} message - Message to log
   */
  success: (message) => {
    console.log(LOG_LEVELS.SUCCESS, formatLogMessage(`SUCCESS: ${message}`));
  }
};

module.exports = logger;
