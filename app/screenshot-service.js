/**
 * Screenshot Service
 * Handles capturing and processing screenshots using Playwright
 */

const { chromium } = require('playwright');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class ScreenshotService {
  constructor(options = {}) {
    this.browser = null;
    this.options = {
      screenshotPath: options.screenshotPath || '/data/screenshots',
      timeout: options.timeout || 30000,
      imageQuality: options.imageQuality || 90,
      maxConcurrent: options.maxConcurrent || 3,
      ...options
    };

    this.activeCaptures = 0;
    this.captureQueue = [];
  }

  async initialize() {
    try {
      console.log('[ScreenshotService] Initializing Playwright browser...');
      this.browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-gpu',
          '--disable-dev-shm-usage',
          '--disable-software-rasterizer',
          '--disable-extensions'
        ]
      });
      console.log('[ScreenshotService] Browser initialized successfully');
      return true;
    } catch (error) {
      console.error('[ScreenshotService] Failed to initialize browser:', error.message);
      return false;
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Capture a screenshot of a given URL
   */
  async captureScreenshot(options = {}) {
    const {
      url,
      width = 800,
      height = 480,
      theme = 'light',
      haToken = null,
      outputFormat = 'png'
    } = options;

    if (!this.browser) {
      return {
        success: false,
        error: 'Browser not initialized'
      };
    }

    // Wait for available slot if at max concurrent
    while (this.activeCaptures >= this.options.maxConcurrent) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.activeCaptures++;

    try {
      const context = await this.browser.createBrowserContext();
      const page = await context.newPage();

      // Set viewport
      await page.setViewportSize({ width, height });

      // Apply theme
      if (theme === 'dark') {
        await page.emulateMedia({ colorScheme: 'dark' });
      }

      // Add auth header if token provided
      if (haToken) {
        await page.setExtraHTTPHeaders({
          'Authorization': `Bearer ${haToken}`
        });
      }

      // Navigate to URL
      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: this.options.timeout
      });

      // Wait for page to stabilize
      await page.waitForTimeout(1000);

      // Capture screenshot
      const screenshotBuffer = await page.screenshot({ type: 'png', fullPage: false });

      // Process image if needed
      let finalBuffer = screenshotBuffer;
      if (outputFormat === 'bmp3' || outputFormat === 'bmp') {
        finalBuffer = await this.convertToBMP3(screenshotBuffer);
      } else if (outputFormat === 'jpeg') {
        finalBuffer = await sharp(screenshotBuffer)
          .jpeg({ quality: this.options.imageQuality })
          .toBuffer();
      }

      // Generate filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const hash = crypto.randomBytes(4).toString('hex');
      const filename = `screenshot-${timestamp}-${hash}.${outputFormat === 'bmp3' ? 'bmp' : outputFormat}`;
      const filepath = path.join(this.options.screenshotPath, filename);

      // Save to disk
      fs.writeFileSync(filepath, finalBuffer);

      // Cleanup
      await page.close();
      await context.close();

      return {
        success: true,
        filename: filename,
        filepath: filepath,
        size: finalBuffer.length,
        width: width,
        height: height,
        format: outputFormat,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('[ScreenshotService] Capture failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    } finally {
      this.activeCaptures--;
    }
  }

  /**
   * Convert PNG to BMP3 format for TRMNL devices
   * Uses 1-bit monochrome or 2-bit grayscale
   */
  async convertToBMP3(pngBuffer, bitDepth = 1) {
    try {
      let processed = sharp(pngBuffer).greyscale();

      if (bitDepth === 1) {
        // 1-bit monochrome with dithering
        processed = processed
          .threshold(128)
          .png({
            colors: 2,
            dither: 1  // Floyd-Steinberg dithering
          });
      } else if (bitDepth === 2) {
        // 2-bit grayscale (4 colors)
        processed = processed
          .png({
            colors: 4
          });
      }

      return await processed.toBuffer();
    } catch (error) {
      console.error('[ScreenshotService] BMP3 conversion failed:', error.message);
      throw error;
    }
  }

  /**
   * Get list of captured screenshots
   */
  getScreenshots(limit = 20) {
    try {
      if (!fs.existsSync(this.options.screenshotPath)) {
        return [];
      }

      const files = fs.readdirSync(this.options.screenshotPath)
        .filter(f => f.startsWith('screenshot-'))
        .map(f => {
          const filepath = path.join(this.options.screenshotPath, f);
          const stats = fs.statSync(filepath);
          return {
            filename: f,
            filepath: filepath,
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime
          };
        })
        .sort((a, b) => b.modified - a.modified)
        .slice(0, limit);

      return files;
    } catch (error) {
      console.error('[ScreenshotService] Failed to list screenshots:', error.message);
      return [];
    }
  }

  /**
   * Get a specific screenshot file
   */
  getScreenshot(filename) {
    const filepath = path.join(this.options.screenshotPath, filename);

    // Prevent directory traversal
    if (!filepath.startsWith(this.options.screenshotPath)) {
      return null;
    }

    if (fs.existsSync(filepath)) {
      return fs.readFileSync(filepath);
    }

    return null;
  }

  /**
   * Delete a screenshot
   */
  deleteScreenshot(filename) {
    const filepath = path.join(this.options.screenshotPath, filename);

    // Prevent directory traversal
    if (!filepath.startsWith(this.options.screenshotPath)) {
      return false;
    }

    try {
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
        return true;
      }
    } catch (error) {
      console.error('[ScreenshotService] Failed to delete screenshot:', error.message);
    }

    return false;
  }

  /**
   * Cleanup old screenshots
   */
  cleanupOldScreenshots(maxAgeHours = 24, maxCount = 50) {
    try {
      const files = fs.readdirSync(this.options.screenshotPath)
        .filter(f => f.startsWith('screenshot-'))
        .map(f => {
          const filepath = path.join(this.options.screenshotPath, f);
          const stats = fs.statSync(filepath);
          return {
            filename: f,
            filepath: filepath,
            modified: stats.mtime
          };
        })
        .sort((a, b) => b.modified - a.modified);

      const now = Date.now();
      const maxAgeMs = maxAgeHours * 60 * 60 * 1000;

      let deleted = 0;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // Delete if older than max age or exceeds max count
        if (i >= maxCount || now - file.modified.getTime() > maxAgeMs) {
          try {
            fs.unlinkSync(file.filepath);
            deleted++;
          } catch (err) {
            console.error(`Failed to delete ${file.filename}:`, err.message);
          }
        }
      }

      if (deleted > 0) {
        console.log(`[ScreenshotService] Cleaned up ${deleted} old screenshots`);
      }

      return deleted;
    } catch (error) {
      console.error('[ScreenshotService] Cleanup failed:', error.message);
      return 0;
    }
  }
}

module.exports = ScreenshotService;
