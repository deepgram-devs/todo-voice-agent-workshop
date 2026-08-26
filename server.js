// Local server for the workshop.
//
// It does two jobs:
//   1. Serves the frontend files from public/
//   2. Proxies a WebSocket between your browser and Deepgram, so your
//      API key can stay on the server (in .env) instead of in the browser.
//
// You will not need to edit this file during the workshop.

const fs = require('fs');
const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');

// Load .env file if it exists (no dependency needed)
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^\s*([\w]+)\s*=\s*(.+)\s*$/);
    if (match) process.env[match[1]] = match[2];
  }
}

const PORT = process.env.PORT || 3000;
const DG_AGENT_URL = 'wss://agent.deepgram.com/v1/agent/converse';
const SERVER_API_KEY = process.env.DEEPGRAM_API_KEY || null;

const app = express();
const server = http.createServer(app);

// Serve static files from public/
app.use(express.static(path.join(__dirname, 'public')));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Let the frontend know if a server-side API key is configured
app.get('/api/config', (_req, res) => {
  res.json({ hasApiKey: !!SERVER_API_KEY });
});

// WebSocket server on /agent path
const wss = new WebSocket.Server({ server, path: '/agent' });

wss.on('connection', (browserWs, req) => {
  // Use API key from query param, or fall back to server-side .env key
  const url = new URL(req.url, `http://${req.headers.host}`);
  const apiKey = url.searchParams.get('apiKey') || SERVER_API_KEY;

  if (!apiKey) {
    browserWs.close(4001, 'No API key provided (set DEEPGRAM_API_KEY in .env or pass via frontend)');
    return;
  }

  console.log('[ws] Browser connected, opening Deepgram connection...');

  // Open connection to Deepgram Voice Agent
  const dgWs = new WebSocket(DG_AGENT_URL, {
    headers: {
      'Authorization': `Token ${apiKey}`,
    },
  });

  let dgReady = false;
  const queue = [];

  dgWs.on('open', () => {
    console.log('[dg] Connected to Deepgram');
    dgReady = true;
    // Flush queued messages
    for (const msg of queue) {
      dgWs.send(msg);
    }
    queue.length = 0;
  });

  dgWs.on('message', (data, isBinary) => {
    // Forward everything from Deepgram to the browser
    if (browserWs.readyState === WebSocket.OPEN) {
      browserWs.send(data, { binary: isBinary });
    }
  });

  dgWs.on('close', (code, reason) => {
    console.log(`[dg] Deepgram closed: ${code} ${reason}`);
    if (browserWs.readyState === WebSocket.OPEN) {
      browserWs.close(code, reason.toString());
    }
  });

  dgWs.on('error', (err) => {
    console.error('[dg] Deepgram error:', err.message);
    if (browserWs.readyState === WebSocket.OPEN) {
      browserWs.close(4002, 'Deepgram connection error');
    }
  });

  // Forward everything from browser to Deepgram
  browserWs.on('message', (data, isBinary) => {
    if (dgReady && dgWs.readyState === WebSocket.OPEN) {
      dgWs.send(data, { binary: isBinary });
    } else {
      queue.push(data);
    }
  });

  browserWs.on('close', () => {
    console.log('[ws] Browser disconnected');
    if (dgWs.readyState === WebSocket.OPEN) {
      dgWs.close();
    }
  });

  browserWs.on('error', (err) => {
    console.error('[ws] Browser error:', err.message);
    if (dgWs.readyState === WebSocket.OPEN) {
      dgWs.close();
    }
  });
});

server.listen(PORT, () => {
  console.log(`To-do voice agent running at http://localhost:${PORT}`);
});
