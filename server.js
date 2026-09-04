// Local server for the workshop.
//
// It does two jobs:
//   1. Serves the frontend files from public/
//   2. Proxies a WebSocket between your browser and Deepgram, so your
//      API key can stay on the server (in .env) instead of in the browser.
//
// You will not need to edit this file during the workshop.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocket, WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load the .env file if it exists (no dependency needed). It tolerates the
// ways a first-time terminal user actually ends up creating one: Windows
// PowerShell 5 writes UTF-16, cmd.exe keeps the quotes, some editors add a
// byte-order mark, and keys get pasted with stray spaces or quotes.
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  const raw = fs.readFileSync(file);
  let text;
  if (raw[0] === 0xff && raw[1] === 0xfe) {
    text = raw.subarray(2).toString('utf16le'); // UTF-16 LE with BOM (PowerShell 5's default)
  } else if (raw.length > 1 && raw[0] !== 0 && raw[1] === 0) {
    text = raw.toString('utf16le'); // UTF-16 LE without BOM
  } else {
    text = raw.toString('utf8').replace(/^﻿/, '');
  }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^["']|["']$/g, ''); // cmd.exe: echo "A=B" keeps the quotes
    const match = line.match(/^(?:export\s+)?(\w+)\s*=\s*(.*)$/);
    if (!match) continue;
    const value = match[2].trim().replace(/^["']|["']$/g, '').trim();
    if (value) process.env[match[1]] = value;
  }
}
loadEnv(path.join(__dirname, '.env'));

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

// The WebSocket library refuses to *send* some close codes: 1005 and 1006
// mean "no code was received" / "the connection just dropped", and only
// 1000-1014 and 3000-4999 may go on the wire. Relaying one of the others
// verbatim would throw and take the whole server down with it.
function relayClose(target, code, reason) {
  if (target.readyState !== WebSocket.OPEN) return;
  const sendable =
    (code >= 1000 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006) ||
    (code >= 3000 && code <= 4999);
  const text = String(reason ?? '').slice(0, 100);
  if (sendable) target.close(code, text);
  else target.close(1011, text || `Deepgram connection dropped (${code})`);
}

// WebSocket server on /agent path
const wss = new WebSocketServer({ server, path: '/agent' });

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
    // Flush anything the browser sent before Deepgram was ready
    for (const { data, isBinary } of queue) {
      dgWs.send(data, { binary: isBinary });
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
    relayClose(browserWs, code, reason);
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
      queue.push({ data, isBinary });
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
