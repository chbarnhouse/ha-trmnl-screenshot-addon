/**
 * Profile Manager
 * Manages capture profiles/configurations
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class ProfileManager {
  constructor(dataPath = '/data') {
    this.dataPath = dataPath;
    this.profilesPath = path.join(dataPath, 'profiles.json');
    this.profiles = {};

    this.loadProfiles();
  }

  loadProfiles() {
    try {
      if (fs.existsSync(this.profilesPath)) {
        const data = fs.readFileSync(this.profilesPath, 'utf8');
        this.profiles = JSON.parse(data);
        console.log(`[ProfileManager] Loaded ${Object.keys(this.profiles).length} profiles`);
      } else {
        this.profiles = {};
        this.saveProfiles();
      }
    } catch (error) {
      console.error('[ProfileManager] Failed to load profiles:', error.message);
      this.profiles = {};
    }
  }

  saveProfiles() {
    try {
      fs.writeFileSync(this.profilesPath, JSON.stringify(this.profiles, null, 2), 'utf8');
    } catch (error) {
      console.error('[ProfileManager] Failed to save profiles:', error.message);
      throw error;
    }
  }

  /**
   * Create a new capture profile
   */
  createProfile(config = {}) {
    const id = crypto.randomBytes(8).toString('hex');

    const profile = {
      id,
      name: config.name || `Profile ${id.substring(0, 4)}`,
      url: config.url || 'http://homeassistant.local:8123/lovelace/default',
      width: config.width || 800,
      height: config.height || 480,
      theme: config.theme || 'light',
      refreshInterval: config.refreshInterval || 0,
      outputFormat: config.outputFormat || 'png',
      enabled: config.enabled !== false,
      description: config.description || '',
      created: new Date().toISOString(),
      lastRun: null,
      lastSuccess: null,
      failureCount: 0
    };

    this.profiles[id] = profile;
    this.saveProfiles();

    return profile;
  }

  /**
   * Update a profile
   */
  updateProfile(id, updates = {}) {
    if (!this.profiles[id]) {
      throw new Error(`Profile not found: ${id}`);
    }

    const profile = this.profiles[id];

    // Only allow updating specific fields
    const allowedFields = [
      'name', 'url', 'width', 'height', 'theme',
      'refreshInterval', 'outputFormat', 'enabled', 'description'
    ];

    for (const field of allowedFields) {
      if (field in updates) {
        profile[field] = updates[field];
      }
    }

    profile.modified = new Date().toISOString();

    this.saveProfiles();
    return profile;
  }

  /**
   * Delete a profile
   */
  deleteProfile(id) {
    if (!this.profiles[id]) {
      return false;
    }

    delete this.profiles[id];
    this.saveProfiles();
    return true;
  }

  /**
   * Get all profiles
   */
  getAllProfiles(enabledOnly = false) {
    const profiles = Object.values(this.profiles);

    if (enabledOnly) {
      return profiles.filter(p => p.enabled);
    }

    return profiles;
  }

  /**
   * Get a specific profile
   */
  getProfile(id) {
    return this.profiles[id] || null;
  }

  /**
   * Record a capture attempt
   */
  recordCapture(id, success = true, error = null) {
    if (!this.profiles[id]) {
      return;
    }

    const profile = this.profiles[id];
    profile.lastRun = new Date().toISOString();

    if (success) {
      profile.lastSuccess = new Date().toISOString();
      profile.failureCount = 0;
    } else {
      profile.failureCount = (profile.failureCount || 0) + 1;
    }

    this.saveProfiles();
  }

  /**
   * Get profiles that need to be captured based on refresh interval
   */
  getProfilesToCapture() {
    const now = new Date().getTime();
    const toCapture = [];

    for (const profile of Object.values(this.profiles)) {
      if (!profile.enabled || profile.refreshInterval <= 0) {
        continue;
      }

      const intervalMs = profile.refreshInterval * 1000;
      const lastRun = profile.lastRun ? new Date(profile.lastRun).getTime() : 0;
      const nextRun = lastRun + intervalMs;

      if (now >= nextRun) {
        toCapture.push(profile);
      }
    }

    return toCapture;
  }

  /**
   * Validate a profile configuration
   */
  validateProfile(config) {
    const errors = [];

    if (!config.url || typeof config.url !== 'string') {
      errors.push('URL is required and must be a string');
    }

    if (!config.name || typeof config.name !== 'string') {
      errors.push('Name is required and must be a string');
    }

    if (config.width && (typeof config.width !== 'number' || config.width < 100 || config.width > 4000)) {
      errors.push('Width must be a number between 100 and 4000');
    }

    if (config.height && (typeof config.height !== 'number' || config.height < 100 || config.height > 4000)) {
      errors.push('Height must be a number between 100 and 4000');
    }

    if (config.theme && !['light', 'dark'].includes(config.theme)) {
      errors.push('Theme must be either "light" or "dark"');
    }

    if (config.refreshInterval && (typeof config.refreshInterval !== 'number' || config.refreshInterval < 0)) {
      errors.push('Refresh interval must be a non-negative number');
    }

    if (config.outputFormat && !['png', 'jpeg', 'bmp3', 'bmp'].includes(config.outputFormat)) {
      errors.push('Output format must be one of: png, jpeg, bmp3, bmp');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

module.exports = ProfileManager;
