const puppeteer = require('puppeteer');
const os = require('os');
const fs = require('fs');
const path = require('path');

/**
 * Get a configured Puppeteer browser instance that works across different environments
 * @returns {Promise<import('puppeteer').Browser>}
 */
async function getBrowser() {
  // Check if we're on Windows
  const isWindows = os.platform() === 'win32';
  console.log(`Current platform: ${os.platform()}`);
  
  // Windows-specific configuration
  if (isWindows) {
    console.log('Using Windows-specific Puppeteer configuration');
    try {
      // Use puppeteer-core's bundled Chromium on Windows
      return await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    } catch (error) {
      console.error('Error launching Puppeteer on Windows:', error.message);
      
      // Try to find Chrome in common Windows locations
      const possiblePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe')
      ];
      
      // Find the first path that exists
      let chromePath = null;
      for (const p of possiblePaths) {
        try {
          if (fs.existsSync(p)) {
            chromePath = p;
            console.log(`Found Chrome at: ${chromePath}`);
            break;
          }
        } catch (e) {
          // Ignore errors checking if file exists
        }
      }
      
      if (chromePath) {
        console.log(`Trying to launch Chrome from: ${chromePath}`);
        return await puppeteer.launch({
          executablePath: chromePath,
          headless: "new",
          args: ['--no-sandbox']
        });
      }
      
      // Last resort - try with minimal options
      console.log('Retrying with minimal options...');
      return await puppeteer.launch({
        headless: "new"
      });
    }
  }
  // Production configuration for Render.com
  else if (process.env.NODE_ENV === 'production') {
    console.log('Using production Puppeteer configuration');
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
  } 
  // Default configuration for other environments
  else {
    console.log('Using default Puppeteer configuration');
    try {
      return await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    } catch (error) {
      console.error('Error launching Puppeteer:', error.message);
      
      // If the first attempt fails, try with minimal options
      console.log('Retrying with minimal options...');
      return await puppeteer.launch({ headless: "new" });
    }
  }
}

module.exports = { getBrowser };