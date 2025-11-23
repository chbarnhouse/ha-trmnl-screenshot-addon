#!/usr/bin/env node

/**
 * TRMNL Screenshot Addon Entry Point
 */

const ScreenshotServer = require('./server');
const path = require('path');

// Configuration from environment
const config = {
  port: parseInt(process.env.PORT || 5001),
  dataPath: process.env.DATA_PATH || '/data',
  haUrl: process.env.HA_URL || 'http://homeassistant.local:8123',
  haToken: process.env.SUPERVISOR_TOKEN || process.env.HA_TOKEN || '',
  logLevel: process.env.LOG_LEVEL || 'info'
};

console.log('======================================');
console.log('TRMNL Screenshot Addon Initializing');
console.log('======================================');
console.log(`Node.js version: ${process.version}`);
console.log(`Data path: ${config.dataPath}`);
console.log(`Home Assistant URL: ${config.haUrl}`);
console.log(`Log level: ${config.logLevel}`);
if (config.haToken) {
  console.log('HA authentication token: provided');
} else {
  console.log('HA authentication token: not provided');
}
console.log('');

// Create and start server
const server = new ScreenshotServer(config);

server.start().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
