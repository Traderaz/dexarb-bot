/**
 * Web Server for Bot Control
 * Provides REST API to start/stop bot and close positions
 * Secured with API key authentication
 */

const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.WEB_PORT || 3000;
const API_KEY = process.env.WEB_API_KEY || 'CHANGE_ME_IN_PRODUCTION';

let botProcess = null;
let botLogs = [];
const MAX_LOGS = 500;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Authentication middleware
function authenticate(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  
  if (apiKey !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  next();
}

// Apply auth to all /api routes
app.use('/api', authenticate);

// API Endpoints

// Get bot status
app.get('/api/status', (req, res) => {
  res.json({
    running: botProcess !== null,
    pid: botProcess?.pid || null,
    uptime: botProcess ? Math.floor((Date.now() - botProcess.startTime) / 1000) : 0,
    logs: botLogs.slice(-50) // Last 50 log lines
  });
});

// Start bot
app.post('/api/start', (req, res) => {
  if (botProcess) {
    return res.status(400).json({ error: 'Bot is already running' });
  }
  
  try {
    // Start bot process
    botProcess = spawn('node', ['dist/index.js'], {
      cwd: __dirname,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    botProcess.startTime = Date.now();
    
    // Capture stdout
    botProcess.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          botLogs.push({ timestamp: new Date().toISOString(), type: 'info', message: line });
          if (botLogs.length > MAX_LOGS) botLogs.shift();
        }
      });
    });
    
    // Capture stderr
    botProcess.stderr.on('data', (data) => {
      const lines = data.toString().split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          botLogs.push({ timestamp: new Date().toISOString(), type: 'error', message: line });
          if (botLogs.length > MAX_LOGS) botLogs.shift();
        }
      });
    });
    
    // Handle process exit
    botProcess.on('close', (code) => {
      botLogs.push({ 
        timestamp: new Date().toISOString(), 
        type: 'info', 
        message: `Bot exited with code ${code}` 
      });
      botProcess = null;
    });
    
    res.json({ success: true, message: 'Bot started', pid: botProcess.pid });
  } catch (error) {
    res.status(500).json({ error: 'Failed to start bot: ' + error.message });
  }
});

// Stop bot
app.post('/api/stop', (req, res) => {
  if (!botProcess) {
    return res.status(400).json({ error: 'Bot is not running' });
  }
  
  try {
    botProcess.kill('SIGTERM');
    botLogs.push({ 
      timestamp: new Date().toISOString(), 
      type: 'info', 
      message: 'Bot stop requested' 
    });
    
    // Force kill after 10 seconds if still running
    setTimeout(() => {
      if (botProcess) {
        botProcess.kill('SIGKILL');
        botProcess = null;
      }
    }, 10000);
    
    res.json({ success: true, message: 'Bot stop signal sent' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to stop bot: ' + error.message });
  }
});

// Close all positions (emergency)
app.post('/api/close-all', async (req, res) => {
  try {
    // Import the emergency close script
    const { closeAllPositions } = require('./emergency-close-api.js');
    
    const result = await closeAllPositions();
    
    res.json({ 
      success: true, 
      message: 'Emergency close initiated',
      result 
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to close positions: ' + error.message 
    });
  }
});

// Get logs (paginated)
app.get('/api/logs', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const offset = parseInt(req.query.offset) || 0;
  
  res.json({
    total: botLogs.length,
    logs: botLogs.slice(-limit - offset, -offset || undefined)
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Web server running on port ${PORT}`);
  console.log(`🔐 API Key: ${API_KEY === 'CHANGE_ME_IN_PRODUCTION' ? '⚠️  CHANGE THIS!' : '✓ Set'}`);
  console.log(`📱 Access at: http://localhost:${PORT}`);
});

