// Pre-flight check: `npm run verify`
//
// Starts the local server, connects to the live Deepgram Voice Agent API
// through it, and exercises the whole loop with no microphone involved:
// Settings, the greeting, typed input (InjectUserMessage), the
// function-calling round trip using the real handlers from todos.js, and
// the personality swap (UpdatePrompt + UpdateSpeak).
//
// Facilitators: run this the morning of a workshop, on the venue wifi.
// If it prints PASS, the room is going to be fine.
//
// Needs DEEPGRAM_API_KEY in .env (or the environment).

import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import WebSocket from 'ws';
import { FUNCTION_DEFINITIONS, FUNCTION_HANDLERS } from './public/js/todos.js';

const PORT = process.env.PORT || 3000;

console.log('[verify] starting server...');
const server = spawn(process.execPath, ['server.js'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: process.env,
});
server.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));

// Wait for the health endpoint
let up = false;
for (let i = 0; i < 20 && !up; i++) {
  await wait(250);
  try {
    const r = await fetch(`http://localhost:${PORT}/health`);
    up = r.ok;
  } catch {}
}
if (!up) {
  console.error('[verify] FAIL — server never came up on port', PORT);
  server.kill();
  process.exit(1);
}

const seen = new Set();
let audioBytes = 0;
const functionCalls = [];
const convo = [];
let phase = 'settings';
let agentDoneCount = 0;

const ws = new WebSocket(`ws://localhost:${PORT}/agent`);
ws.binaryType = 'arraybuffer';

const deadline = setTimeout(() => finish('timed out after 90s'), 90000);

function finish(err) {
  clearTimeout(deadline);
  try { ws.close(); } catch {}
  server.kill();
  console.log('\n[verify] events seen:', [...seen].join(', '));
  console.log('[verify] audio bytes received:', audioBytes);
  console.log('[verify] function calls:', functionCalls.map((f) => f.name).join(', ') || 'none');
  if (err) {
    console.error('\n[verify] RESULT: FAIL —', err);
    process.exit(1);
  }
  console.log('\n[verify] RESULT: PASS — the whole loop works.');
  process.exit(0);
}

const settings = {
  type: 'Settings',
  audio: {
    input: { encoding: 'linear16', sample_rate: 16000 },
    output: { encoding: 'linear16', sample_rate: 24000, container: 'none' },
  },
  agent: {
    listen: { provider: { type: 'deepgram', model: 'flux-general-en', version: 'v2' } },
    think: {
      provider: { type: 'open_ai', model: 'gpt-4o-mini', temperature: 0.7 },
      prompt:
        "You are the voice of the user's to-do list. Use the provided functions. Confirm actions briefly, in one or two short sentences. Never use markdown; your words are spoken aloud.",
      functions: FUNCTION_DEFINITIONS,
    },
    speak: { provider: { type: 'deepgram', model: 'flux-hannah-en', version: 'v2' } },
    greeting: "Hi! I'm your to-do list.",
  },
};

ws.on('message', (data, isBinary) => {
  if (isBinary) {
    audioBytes += data.byteLength ?? data.length;
    return;
  }
  const msg = JSON.parse(data.toString());
  seen.add(msg.type);

  switch (msg.type) {
    case 'Welcome':
      console.log('[verify] Welcome — sending Settings');
      ws.send(JSON.stringify(settings));
      break;
    case 'SettingsApplied':
      console.log('[verify] SettingsApplied (Flux STT v2 + gpt-4o-mini + Flux TTS v2 accepted)');
      break;
    case 'ConversationText':
      convo.push(msg);
      console.log(`[verify] ${msg.role}: ${msg.content}`);
      break;
    case 'FunctionCallRequest':
      for (const fn of msg.functions || []) {
        const args = fn.arguments ? JSON.parse(fn.arguments) : {};
        const result = FUNCTION_HANDLERS[fn.name]
          ? FUNCTION_HANDLERS[fn.name](args)
          : `Unknown function: ${fn.name}`;
        functionCalls.push({ name: fn.name, args, result });
        console.log(`[verify] ${fn.name}(${fn.arguments}) → "${result}"`);
        ws.send(JSON.stringify({ type: 'FunctionCallResponse', id: fn.id, name: fn.name, content: result }));
      }
      break;
    case 'PromptUpdated':
      console.log('[verify] PromptUpdated');
      break;
    case 'SpeakUpdated':
      console.log('[verify] SpeakUpdated (Flux voice + expressivity accepted)');
      break;
    case 'AgentAudioDone':
      agentDoneCount++;
      advance();
      break;
    case 'Error':
      finish(`API error: ${JSON.stringify(msg)}`);
      break;
  }
});

function advance() {
  if (phase === 'settings' && agentDoneCount >= 1) {
    phase = 'add';
    console.log('[verify] typed input: "Add buy oat milk to my list"');
    ws.send(JSON.stringify({ type: 'InjectUserMessage', content: 'Add buy oat milk to my list' }));
  } else if (phase === 'add' && agentDoneCount >= 2) {
    phase = 'persona';
    console.log('[verify] applying personality swap (UpdatePrompt + UpdateSpeak)');
    ws.send(
      JSON.stringify({
        type: 'UpdatePrompt',
        prompt:
          'You are the to-do list of a pirate captain. Use the provided functions. Full pirate voice. One or two short sentences. Never use markdown.',
      })
    );
    ws.send(
      JSON.stringify({
        type: 'UpdateSpeak',
        speak: { provider: { type: 'deepgram', model: 'flux-rufus-en', version: 'v2', expressivity: 2 } },
      })
    );
    setTimeout(() => {
      console.log('[verify] typed input: "What is on my list?"');
      ws.send(JSON.stringify({ type: 'InjectUserMessage', content: 'What is on my list?' }));
    }, 1500);
  } else if (phase === 'persona' && agentDoneCount >= 3) {
    if (!functionCalls.some((f) => f.name === 'addItem')) return finish('addItem was never called');
    if (!functionCalls.some((f) => f.name === 'listItems')) return finish('listItems was never called');
    if (!seen.has('PromptUpdated')) return finish('PromptUpdated never received');
    if (!seen.has('SpeakUpdated')) return finish('SpeakUpdated never received');
    if (audioBytes < 100000) return finish(`suspiciously little audio: ${audioBytes} bytes`);
    finish(null);
  }
}

ws.on('close', (code, reason) => {
  if (phase !== 'persona') finish(`connection closed early: ${code} ${reason}`);
});
ws.on('error', (e) => finish(`websocket error: ${e.message}`));
