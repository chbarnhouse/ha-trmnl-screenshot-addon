#!/usr/bin/env node

const http = require('http');

const PORT = 3000;

const server = http.createServer((req, res) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      timestamp: new Date().toISOString(),
      addon: 'TRMNL Screenshot Minimal'
    }));
  } else if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>TRMNL Screenshot Addon</title>
          <style>
            body { font-family: Arial; margin: 40px; }
            .status { padding: 10px; background: #e8f5e9; border-radius: 4px; }
          </style>
        </head>
        <body>
          <h1>TRMNL Screenshot Addon</h1>
          <div class="status">
            <p><strong>Status:</strong> Running</p>
            <p><strong>Version:</strong> 0.1.0 (Minimal)</p>
            <p><strong>Started:</strong> ${new Date().toISOString()}</p>
          </div>
          <h2>Endpoints</h2>
          <ul>
            <li><a href="/health">/health</a> - Health check</li>
            <li>/ - This page</li>
          </ul>
        </body>
      </html>
    `);
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found', path: req.url }));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`======================================`);
  console.log(`TRMNL Screenshot Addon Started`);
  console.log(`======================================`);
  console.log(`Listening on http://0.0.0.0:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

server.on('error', (err) => {
  console.error(`Server error: ${err.message}`);
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
