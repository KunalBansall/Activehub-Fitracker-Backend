const puppeteer = require('puppeteer');

/**
 * Get a configured Puppeteer browser instance that works in both development and production
 * @returns {Promise<import('puppeteer').Browser>}
 */
async function getBrowser() {
  // Production configuration for Render.com
  if (process.env.NODE_ENV === 'production') {
    return puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process', 
        '--disable-gpu'
      ],
      headless: "new",
    });
  } else {
    // Local development configuration
    return puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }
}

module.exports = { getBrowser }; 