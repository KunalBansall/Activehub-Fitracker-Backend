const {join} = require('path');

/**
 * @type {import('puppeteer').Configuration}
 */
module.exports = {
  // Skip Chrome download during install
  skipDownload: true,
  // Use system Chrome on Render
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable',
  cacheDirectory: join(process.env.HOME || __dirname, '.cache', 'puppeteer'),
}; 