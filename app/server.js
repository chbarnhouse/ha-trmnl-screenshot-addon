/**
 * TRMNL Screenshot Addon Server
 * Main application server with API and web UI
 */

const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const ScreenshotService = require('./screenshot-service');
const ProfileManager = require('./profile-manager');

class ScreenshotServer {
  constructor(options = {}) {
    this.app = express();
    this.port = options.port || 5001;
    this.dataPath = options.dataPath || '/data';
    this.haUrl = options.haUrl || 'http://homeassistant.local:8123';
    this.haToken = options.haToken || process.env.SUPERVISOR_TOKEN || '';

    // Initialize services
    this.screenshotService = new ScreenshotService({
      screenshotPath: path.join(this.dataPath, 'screenshots')
    });

    this.profileManager = new ProfileManager(this.dataPath);

    // Ensure screenshot directory exists
    const screenshotDir = path.join(this.dataPath, 'screenshots');
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }

    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(bodyParser.json({ limit: '10kb' }));
    this.app.use(bodyParser.urlencoded({ limit: '10kb', extended: false }));

    // Request logging
    this.app.use((req, res, next) => {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
      next();
    });

    // CORS headers
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
      }

      next();
    });
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        addon: 'TRMNL Screenshot',
        version: '0.2.0',
        browser_ready: this.screenshotService.browser !== null,
        profiles: Object.keys(this.profileManager.profiles).length
      });
    });

    // API Routes
    this.app.post('/api/screenshot', this.handleCaptureScreenshot.bind(this));
    this.app.get('/api/screenshot/latest', this.handleGetLatestScreenshot.bind(this));
    this.app.get('/api/screenshots', this.handleListScreenshots.bind(this));
    this.app.get('/api/screenshot/:filename', this.handleGetScreenshot.bind(this));
    this.app.delete('/api/screenshot/:filename', this.handleDeleteScreenshot.bind(this));

    // Profile Routes
    this.app.post('/api/profiles', this.handleCreateProfile.bind(this));
    this.app.get('/api/profiles', this.handleListProfiles.bind(this));
    this.app.get('/api/profiles/:id', this.handleGetProfile.bind(this));
    this.app.put('/api/profiles/:id', this.handleUpdateProfile.bind(this));
    this.app.delete('/api/profiles/:id', this.handleDeleteProfile.bind(this));
    this.app.post('/api/profiles/:id/capture', this.handleCaptureProfile.bind(this));

    // Web UI
    this.app.get('/', (req, res) => {
      res.send(this.getWebUI());
    });

    // 404
    this.app.use((req, res) => {
      res.status(404).json({ error: 'Not found', path: req.path });
    });
  }

  // Request Handlers

  async handleCaptureScreenshot(req, res) {
    try {
      const { url, width = 800, height = 480, theme = 'light', format = 'png' } = req.body;

      if (!url) {
        return res.status(400).json({ error: 'URL is required' });
      }

      const result = await this.screenshotService.captureScreenshot({
        url,
        width: parseInt(width) || 800,
        height: parseInt(height) || 480,
        theme: theme || 'light',
        haToken: this.haToken,
        outputFormat: format || 'png'
      });

      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('[Server] Capture error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  async handleGetLatestScreenshot(req, res) {
    try {
      const screenshots = this.screenshotService.getScreenshots(1);

      if (screenshots.length === 0) {
        return res.status(404).json({ error: 'No screenshots available' });
      }

      const filename = screenshots[0].filename;
      const buffer = this.screenshotService.getScreenshot(filename);

      if (!buffer) {
        return res.status(404).json({ error: 'Screenshot not found' });
      }

      res.contentType('image/png');
      res.send(buffer);
    } catch (error) {
      console.error('[Server] Error getting screenshot:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  handleListScreenshots(req, res) {
    try {
      const limit = parseInt(req.query.limit) || 20;
      const screenshots = this.screenshotService.getScreenshots(limit);

      res.json({
        total: screenshots.length,
        screenshots: screenshots.map(s => ({
          filename: s.filename,
          size: s.size,
          created: s.created,
          url: `/api/screenshot/${s.filename}`
        }))
      });
    } catch (error) {
      console.error('[Server] Error listing screenshots:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  handleGetScreenshot(req, res) {
    try {
      const { filename } = req.params;
      const buffer = this.screenshotService.getScreenshot(filename);

      if (!buffer) {
        return res.status(404).json({ error: 'Screenshot not found' });
      }

      const ext = path.extname(filename).toLowerCase();
      const contentType = ext === '.bmp' ? 'image/bmp' : 'image/png';

      res.contentType(contentType);
      res.send(buffer);
    } catch (error) {
      console.error('[Server] Error getting screenshot:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  handleDeleteScreenshot(req, res) {
    try {
      const { filename } = req.params;
      const deleted = this.screenshotService.deleteScreenshot(filename);

      if (deleted) {
        res.json({ success: true, message: 'Screenshot deleted' });
      } else {
        res.status(404).json({ error: 'Screenshot not found' });
      }
    } catch (error) {
      console.error('[Server] Error deleting screenshot:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  async handleCreateProfile(req, res) {
    try {
      const { valid, errors } = this.profileManager.validateProfile(req.body);

      if (!valid) {
        return res.status(400).json({ errors });
      }

      const profile = this.profileManager.createProfile(req.body);
      res.status(201).json(profile);
    } catch (error) {
      console.error('[Server] Error creating profile:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  handleListProfiles(req, res) {
    try {
      const enabledOnly = req.query.enabled === 'true';
      const profiles = this.profileManager.getAllProfiles(enabledOnly);

      res.json({
        total: profiles.length,
        profiles
      });
    } catch (error) {
      console.error('[Server] Error listing profiles:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  handleGetProfile(req, res) {
    try {
      const { id } = req.params;
      const profile = this.profileManager.getProfile(id);

      if (!profile) {
        return res.status(404).json({ error: 'Profile not found' });
      }

      res.json(profile);
    } catch (error) {
      console.error('[Server] Error getting profile:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  handleUpdateProfile(req, res) {
    try {
      const { id } = req.params;

      const profile = this.profileManager.getProfile(id);
      if (!profile) {
        return res.status(404).json({ error: 'Profile not found' });
      }

      const updated = this.profileManager.updateProfile(id, req.body);
      res.json(updated);
    } catch (error) {
      console.error('[Server] Error updating profile:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  handleDeleteProfile(req, res) {
    try {
      const { id } = req.params;
      const deleted = this.profileManager.deleteProfile(id);

      if (deleted) {
        res.json({ success: true, message: 'Profile deleted' });
      } else {
        res.status(404).json({ error: 'Profile not found' });
      }
    } catch (error) {
      console.error('[Server] Error deleting profile:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  async handleCaptureProfile(req, res) {
    try {
      const { id } = req.params;
      const profile = this.profileManager.getProfile(id);

      if (!profile) {
        return res.status(404).json({ error: 'Profile not found' });
      }

      const result = await this.screenshotService.captureScreenshot({
        url: profile.url,
        width: profile.width,
        height: profile.height,
        theme: profile.theme,
        haToken: this.haToken,
        outputFormat: profile.outputFormat
      });

      this.profileManager.recordCapture(id, result.success);

      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('[Server] Error capturing profile:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  getWebUI() {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TRMNL Screenshot Addon</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      margin: 0;
      padding: 20px;
      background: #f5f5f5;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    header {
      background: white;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    h1 { margin: 0; color: #333; }
    .status-bar {
      display: flex;
      gap: 20px;
      margin-top: 10px;
      font-size: 14px;
      color: #666;
    }
    .tabs {
      display: flex;
      gap: 10px;
      margin: 20px 0;
      border-bottom: 2px solid #ddd;
    }
    .tab-btn {
      padding: 10px 20px;
      background: none;
      border: none;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      color: #666;
      border-bottom: 3px solid transparent;
      margin-bottom: -2px;
    }
    .tab-btn.active {
      color: #2196F3;
      border-bottom-color: #2196F3;
    }
    .tab-content { display: none; }
    .tab-content.active { display: block; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 20px;
      margin: 20px 0;
    }
    .card {
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .card h3 { margin: 0 0 10px 0; color: #333; }
    .card-info {
      font-size: 13px;
      color: #666;
      margin: 5px 0;
    }
    .btn {
      padding: 8px 16px;
      background: #2196F3;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      margin-right: 5px;
    }
    .btn:hover { background: #1976D2; }
    .btn.secondary {
      background: #757575;
    }
    .btn.secondary:hover {
      background: #616161;
    }
    input, select, textarea {
      width: 100%;
      padding: 8px;
      margin: 5px 0 10px 0;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-family: inherit;
    }
    form { max-width: 500px; }
    .form-group { margin-bottom: 15px; }
    label { display: block; font-weight: 500; margin-bottom: 5px; color: #333; }
    .alert {
      padding: 10px;
      margin: 10px 0;
      border-radius: 4px;
    }
    .alert.error {
      background: #ffebee;
      color: #c62828;
      border-left: 4px solid #c62828;
    }
    .alert.success {
      background: #e8f5e9;
      color: #2e7d32;
      border-left: 4px solid #2e7d32;
    }
    .screenshot-preview {
      max-width: 100%;
      height: auto;
      border: 1px solid #ddd;
      border-radius: 4px;
      margin-top: 10px;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>📸 TRMNL Screenshot Addon</h1>
      <div class="status-bar">
        <span>Status: <span id="status">Loading...</span></span>
        <span>Profiles: <span id="profile-count">0</span></span>
        <span>Screenshots: <span id="screenshot-count">0</span></span>
      </div>
    </header>

    <div class="tabs">
      <button class="tab-btn active" onclick="switchTab('overview')">Overview</button>
      <button class="tab-btn" onclick="switchTab('profiles')">Profiles</button>
      <button class="tab-btn" onclick="switchTab('screenshots')">Screenshots</button>
      <button class="tab-btn" onclick="switchTab('capture')">Capture Now</button>
    </div>

    <div id="overview" class="tab-content active">
      <div class="card">
        <h3>Welcome to TRMNL Screenshot Addon</h3>
        <p>This addon captures Home Assistant dashboards and stores them for display on TRMNL e-ink devices.</p>
        <div class="card-info">
          <strong>Features:</strong>
          <ul>
            <li>Capture any Home Assistant view or dashboard</li>
            <li>Create reusable capture profiles with custom settings</li>
            <li>Support for PNG, JPEG, and BMP3 formats</li>
            <li>Automatic theme support (light/dark)</li>
            <li>API for integration with automations</li>
          </ul>
        </div>
      </div>
    </div>

    <div id="profiles" class="tab-content">
      <div class="card">
        <h3>Create New Profile</h3>
        <form onsubmit="createProfile(event)">
          <div class="form-group">
            <label>Profile Name</label>
            <input type="text" id="profile-name" placeholder="My Dashboard" required>
          </div>
          <div class="form-group">
            <label>URL</label>
            <input type="text" id="profile-url" placeholder="http://homeassistant.local:8123/lovelace/0" required>
          </div>
          <div class="form-group">
            <label>Width (px)</label>
            <input type="number" id="profile-width" value="800" min="100" max="4000">
          </div>
          <div class="form-group">
            <label>Height (px)</label>
            <input type="number" id="profile-height" value="480" min="100" max="4000">
          </div>
          <div class="form-group">
            <label>Theme</label>
            <select id="profile-theme">
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
          <div class="form-group">
            <label>Output Format</label>
            <select id="profile-format">
              <option value="png">PNG</option>
              <option value="jpeg">JPEG</option>
              <option value="bmp3">BMP3 (TRMNL)</option>
            </select>
          </div>
          <div class="form-group">
            <label>Refresh Interval (seconds, 0 = manual)</label>
            <input type="number" id="profile-refresh" value="0" min="0">
          </div>
          <div id="create-message"></div>
          <button type="submit" class="btn">Create Profile</button>
        </form>
      </div>

      <h3>Your Profiles</h3>
      <div id="profiles-list" class="grid"></div>
    </div>

    <div id="screenshots" class="tab-content">
      <h3>Recent Screenshots</h3>
      <div id="screenshots-list" class="grid"></div>
    </div>

    <div id="capture" class="tab-content">
      <div class="card">
        <h3>Capture Screenshot Now</h3>
        <form onsubmit="captureNow(event)">
          <div class="form-group">
            <label>URL</label>
            <input type="text" id="capture-url" placeholder="http://homeassistant.local:8123/lovelace/0" required>
          </div>
          <div class="form-group">
            <label>Width (px)</label>
            <input type="number" id="capture-width" value="800" min="100" max="4000">
          </div>
          <div class="form-group">
            <label>Height (px)</label>
            <input type="number" id="capture-height" value="480" min="100" max="4000">
          </div>
          <div class="form-group">
            <label>Theme</label>
            <select id="capture-theme">
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
          <div class="form-group">
            <label>Format</label>
            <select id="capture-format">
              <option value="png">PNG</option>
              <option value="jpeg">JPEG</option>
              <option value="bmp3">BMP3 (TRMNL)</option>
            </select>
          </div>
          <div id="capture-message"></div>
          <button type="submit" class="btn">Capture</button>
        </form>
        <div id="capture-preview"></div>
      </div>
    </div>
  </div>

  <script>
    function switchTab(tabName) {
      document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
      document.getElementById(tabName).classList.add('active');
      event.target.classList.add('active');

      if (tabName === 'profiles') loadProfiles();
      if (tabName === 'screenshots') loadScreenshots();
    }

    function updateStatus() {
      fetch('/health')
        .then(r => r.json())
        .then(data => {
          document.getElementById('status').textContent = data.status === 'ok' ? '✅ Running' : '❌ Error';
          document.getElementById('profile-count').textContent = data.profiles;
        })
        .catch(() => document.getElementById('status').textContent = '❌ Unavailable');
    }

    async function loadProfiles() {
      try {
        const res = await fetch('/api/profiles');
        const data = await res.json();
        const list = document.getElementById('profiles-list');
        list.innerHTML = data.profiles.map(p => \`
          <div class="card">
            <h3>\${p.name}</h3>
            <div class="card-info"><strong>URL:</strong> \${p.url}</div>
            <div class="card-info"><strong>Size:</strong> \${p.width}x\${p.height}</div>
            <div class="card-info"><strong>Last Run:</strong> \${p.lastSuccess || 'Never'}</div>
            <button class="btn" onclick="captureProfile('\${p.id}')">Capture Now</button>
            <button class="btn secondary" onclick="deleteProfile('\${p.id}')">Delete</button>
          </div>
        \`).join('');
      } catch (error) {
        console.error('Error loading profiles:', error);
      }
    }

    async function loadScreenshots() {
      try {
        const res = await fetch('/api/screenshots');
        const data = await res.json();
        const list = document.getElementById('screenshots-list');
        list.innerHTML = data.screenshots.map(s => \`
          <div class="card">
            <h3>\${s.filename}</h3>
            <div class="card-info"><strong>Size:</strong> \${(s.size / 1024).toFixed(2)} KB</div>
            <div class="card-info"><strong>Created:</strong> \${new Date(s.created).toLocaleString()}</div>
            <img class="screenshot-preview" src="\${s.url}" alt="Screenshot">
            <button class="btn secondary" onclick="deleteScreenshot('\${s.filename}')">Delete</button>
          </div>
        \`).join('');
        document.getElementById('screenshot-count').textContent = data.total;
      } catch (error) {
        console.error('Error loading screenshots:', error);
      }
    }

    async function createProfile(event) {
      event.preventDefault();
      const profile = {
        name: document.getElementById('profile-name').value,
        url: document.getElementById('profile-url').value,
        width: parseInt(document.getElementById('profile-width').value),
        height: parseInt(document.getElementById('profile-height').value),
        theme: document.getElementById('profile-theme').value,
        outputFormat: document.getElementById('profile-format').value,
        refreshInterval: parseInt(document.getElementById('profile-refresh').value)
      };

      try {
        const res = await fetch('/api/profiles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(profile)
        });

        const msg = document.getElementById('create-message');
        if (res.ok) {
          msg.innerHTML = '<div class="alert success">Profile created successfully!</div>';
          event.target.reset();
          loadProfiles();
        } else {
          msg.innerHTML = '<div class="alert error">Failed to create profile</div>';
        }
      } catch (error) {
        document.getElementById('create-message').innerHTML = '<div class="alert error">Error: ' + error.message + '</div>';
      }
    }

    async function captureProfile(id) {
      try {
        const res = await fetch(\`/api/profiles/\${id}/capture\`, { method: 'POST' });
        if (res.ok) {
          alert('Screenshot captured!');
          loadProfiles();
          loadScreenshots();
        }
      } catch (error) {
        alert('Capture failed: ' + error.message);
      }
    }

    async function captureNow(event) {
      event.preventDefault();
      const capture = {
        url: document.getElementById('capture-url').value,
        width: parseInt(document.getElementById('capture-width').value),
        height: parseInt(document.getElementById('capture-height').value),
        theme: document.getElementById('capture-theme').value,
        format: document.getElementById('capture-format').value
      };

      try {
        const res = await fetch('/api/screenshot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(capture)
        });

        const msg = document.getElementById('capture-message');
        if (res.ok) {
          const data = await res.json();
          msg.innerHTML = '<div class="alert success">Screenshot captured: ' + data.filename + '</div>';
          document.getElementById('capture-preview').innerHTML = '<img class="screenshot-preview" src="/api/screenshot/' + data.filename + '">';
          updateStatus();
        } else {
          msg.innerHTML = '<div class="alert error">Capture failed</div>';
        }
      } catch (error) {
        document.getElementById('capture-message').innerHTML = '<div class="alert error">Error: ' + error.message + '</div>';
      }
    }

    async function deleteScreenshot(filename) {
      if (!confirm('Delete this screenshot?')) return;
      try {
        await fetch(\`/api/screenshot/\${filename}\`, { method: 'DELETE' });
        loadScreenshots();
      } catch (error) {
        alert('Delete failed: ' + error.message);
      }
    }

    async function deleteProfile(id) {
      if (!confirm('Delete this profile?')) return;
      try {
        await fetch(\`/api/profiles/\${id}\`, { method: 'DELETE' });
        loadProfiles();
      } catch (error) {
        alert('Delete failed: ' + error.message);
      }
    }

    // Initial load
    updateStatus();
    setInterval(updateStatus, 10000);
  </script>
</body>
</html>
    `;
  }

  async start() {
    try {
      const initialized = await this.screenshotService.initialize();

      if (!initialized) {
        console.warn('[Server] Browser initialization failed, continuing anyway...');
      }

      this.server = this.app.listen(this.port, '0.0.0.0', () => {
        console.log(`\n${'='.repeat(50)}`);
        console.log('TRMNL Screenshot Addon Started');
        console.log(`${'='.repeat(50)}`);
        console.log(`✓ Server running on port ${this.port}`);
        console.log(`✓ Web UI: http://localhost:${this.port}`);
        console.log(`✓ Health: http://localhost:${this.port}/health`);
        console.log(`✓ API: http://localhost:${this.port}/api`);
        console.log(`✓ Home Assistant URL: ${this.haUrl}`);
        console.log(`✓ Data path: ${this.dataPath}`);
        console.log(`\n`);
      });

      // Graceful shutdown
      process.on('SIGTERM', () => this.shutdown());
      process.on('SIGINT', () => this.shutdown());
    } catch (error) {
      console.error('[Server] Failed to start:', error.message);
      process.exit(1);
    }
  }

  async shutdown() {
    console.log('\n[Server] Shutting down gracefully...');
    await this.screenshotService.close();

    if (this.server) {
      this.server.close(() => {
        console.log('[Server] Shutdown complete');
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  }
}

module.exports = ScreenshotServer;
