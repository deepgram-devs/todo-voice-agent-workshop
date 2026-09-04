// Deepgram Voice Agent connection: WebSocket, Settings, events, functions.
//
// This file is the heart of the voice layer. Reading it top to bottom is
// Module 2 of the workshop. You won't need to edit it for the core modules.

import { FUNCTION_DEFINITIONS, FUNCTION_HANDLERS } from './todos.js';

// Connection states
export const States = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONFIGURING: 'configuring',
  CONNECTED: 'connected',
  ERROR: 'error',
};

let ws = null;
let keepAliveInterval = null;
let state = States.DISCONNECTED;

// Callbacks the app registers
let onStateChange = null;
let onAudioReceived = null;
let onDebugMessage = null;
let onFunctionCalled = null;
let onConversationText = null;

export function setCallbacks({ onState, onAudio, onDebug, onFunction, onText }) {
  onStateChange = onState;
  onAudioReceived = onAudio;
  onDebugMessage = onDebug;
  onFunctionCalled = onFunction;
  onConversationText = onText;
}

function setState(newState) {
  state = newState;
  if (onStateChange) onStateChange(newState);
}

function debug(tag, text) {
  if (onDebugMessage) onDebugMessage(tag, text);
}

// --- Connection ---

export function connect(apiKey) {
  if (ws) disconnect();

  setState(States.CONNECTING);

  // We connect to OUR server (server.js), which relays to Deepgram.
  // That way the API key can live in .env instead of the browser.
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const params = apiKey ? `?apiKey=${encodeURIComponent(apiKey)}` : '';
  const url = `${protocol}//${window.location.host}/agent${params}`;

  const socket = new WebSocket(url);
  socket.binaryType = 'arraybuffer';
  ws = socket;

  socket.onopen = () => {
    debug('system', 'WebSocket connected, waiting for Welcome...');
    startKeepAlive();
  };

  socket.onmessage = (event) => {
    if (socket !== ws) return; // a connection we've already moved on from
    if (event.data instanceof ArrayBuffer) {
      // Binary frames are the agent's voice: raw audio to play
      if (onAudioReceived) onAudioReceived(event.data);
      return;
    }

    // Text frames are JSON events
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      debug('error', `Failed to parse message: ${event.data}`);
      return;
    }

    handleMessage(msg);
  };

  socket.onclose = (event) => {
    if (socket !== ws) return; // closed by us, or superseded by a newer connection
    debug('system', `Connection closed: ${event.code} ${event.reason}`);
    cleanup();
    setState(States.DISCONNECTED);
  };

  socket.onerror = () => {
    if (socket !== ws) return;
    debug('error', 'WebSocket error');
    cleanup();
    setState(States.ERROR);
  };
}

export function disconnect() {
  if (ws) {
    ws.close();
  }
  cleanup();
  setState(States.DISCONNECTED);
}

export function isConnected() {
  return state === States.CONNECTED;
}

// Send binary audio (microphone chunks) to the agent
export function sendAudio(arrayBuffer) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(arrayBuffer);
  }
}

// Send TYPED text to the agent. The agent treats it exactly as if you had
// spoken it — same functions, same reply, same voice on the way back.
export function sendTextMessage(text) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(
      JSON.stringify({
        type: 'InjectUserMessage',
        content: text,
      })
    );
    // No log line here on purpose: the agent echoes your text back as a
    // ConversationText event, and that is what lands in the event log.
  }
}

// --- Message handling ---

function handleMessage(msg) {
  switch (msg.type) {
    case 'Welcome':
      debug('system', `Welcome received (request_id: ${msg.request_id})`);
      sendSettings();
      setState(States.CONFIGURING);
      break;

    case 'SettingsApplied':
      debug('system', 'Settings applied — the agent is listening');
      setState(States.CONNECTED);
      break;

    case 'ConversationText':
      // The transcript, both directions. It goes to the chat bubbles AND the
      // event log, so the log reads as one story.
      debug(msg.role === 'user' ? 'user' : 'agent', msg.content);
      if (onConversationText) onConversationText(msg.role, msg.content);
      break;

    case 'EndOfTurn':
      // Flux STT decided you were finished. The LLM's turn starts now.
      debug('system', 'End of turn — Flux STT decided you were finished');
      break;

    case 'UserStartedSpeaking':
      // Barge-in: you started talking, so the agent must stop.
      debug('system', 'You started speaking — any agent audio stops here (barge-in)');
      if (onAudioReceived) onAudioReceived(null); // null = stop playback
      break;

    case 'AgentThinking':
      debug('system', 'Agent thinking...');
      break;

    case 'AgentStartedSpeaking':
      if (msg.total_latency) {
        debug('system', `Agent speaking (latency: ${msg.total_latency.toFixed(2)}s)`);
      } else {
        debug('system', 'Agent speaking');
      }
      break;

    case 'LatencyReport':
      // Several arrive per turn, one per stage. The one carrying
      // total_latency is the number to watch: from the end of your turn to
      // the agent's first sound.
      if (msg.total_latency !== undefined) {
        debug('system', `Agent speaking (latency: ${msg.total_latency.toFixed(2)}s)`);
      }
      break;

    case 'AgentAudioDone':
      debug('system', 'Agent finished speaking');
      break;

    case 'FunctionCallRequest':
      handleFunctionCalls(msg);
      break;

    case 'PromptUpdated':
      debug('system', 'Prompt updated — new personality is live');
      break;

    case 'SpeakUpdated':
      debug('system', 'Voice updated');
      break;

    case 'ThinkUpdated':
      debug('system', 'Think provider updated');
      break;

    case 'InjectionRefused':
      debug('system', `Injection refused: ${msg.message || ''}`);
      break;

    case 'Error':
      debug('error', `Error: ${msg.description || msg.message || JSON.stringify(msg)}`);
      break;

    case 'Warning':
      debug('error', `Warning: ${msg.description || msg.message || JSON.stringify(msg)}`);
      break;

    case 'History':
    case 'FunctionCallResponse':
      // Bookkeeping echoes from the API — safe to ignore
      break;

    default:
      debug('system', `Unknown message: ${msg.type}`);
  }
}

// When the agent decides it needs one of YOUR functions, Deepgram sends a
// FunctionCallRequest. We run the matching handler from todos.js and send
// the result back as a FunctionCallResponse. Until that response arrives,
// the agent has nothing to say — that silence is called "dead air".
function handleFunctionCalls(msg) {
  const functions = msg.functions || [];

  for (const fn of functions) {
    const handler = FUNCTION_HANDLERS[fn.name];
    debug('function', `Agent is calling ${fn.name}(${fn.arguments || ''})`);

    let result;
    if (handler) {
      try {
        const args = fn.arguments ? JSON.parse(fn.arguments) : {};
        result = handler(args);
      } catch (err) {
        result = `Error executing ${fn.name}: ${err.message}`;
        debug('error', result);
      }
    } else {
      result = `Unknown function: ${fn.name}`;
      debug('error', result);
    }

    // Notify app that a function was called (for UI updates)
    if (onFunctionCalled) onFunctionCalled(fn.name, result);

    // Send the result back so the agent can answer
    const response = {
      type: 'FunctionCallResponse',
      id: fn.id,
      name: fn.name,
      content: typeof result === 'string' ? result : JSON.stringify(result),
    };

    debug('function', `Result: ${response.content.substring(0, 100)}${response.content.length > 100 ? '...' : ''}`);

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(response));
    }
  }
}

// --- Settings: everything the agent needs to know, in one message ---

const AGENT_PROMPT = `You are the voice of the user's to-do list. Help them add items, hear what's on the list, mark things done, and delete things — using the functions you've been given.

Rules:
- When the user wants to add a task, call addItem. Rephrase their words into a short task if needed.
- When they ask what's on the list or what's left, call listItems.
- When they say they finished something, call completeItem.
- When they want something gone, call deleteItem.
- Always confirm what you did, briefly.
- Be warm and a little dry. You may be gently unimpressed by how long items have been on the list, but never mean, and never guilt-trip.
- Keep responses to one or two short sentences — this is a spoken conversation.
- NEVER use markdown, asterisks, bullet points, numbered-list formatting, or emoji. Your words are read aloud exactly as written.`;

const GREETING = "Hi! I'm your to-do list. Ask me what's on it, or give me something new to remember.";

function sendSettings() {
  const settings = {
    type: 'Settings',
    audio: {
      input: {
        encoding: 'linear16',
        sample_rate: 16000,
      },
      output: {
        encoding: 'linear16',
        sample_rate: 24000,
        container: 'none',
      },
    },
    agent: {
      // LISTEN: Flux turns your speech into text, and decides when your
      // turn is over (so the agent knows when to reply — and when to shut
      // up if you interrupt).
      listen: {
        provider: {
          type: 'deepgram',
          model: 'flux-general-en',
          version: 'v2',
        },
      },
      // THINK: the LLM. Managed by Deepgram — no second API key needed.
      think: {
        provider: {
          type: 'open_ai',
          model: 'gpt-4o-mini',
          temperature: 0.7,
        },
        prompt: AGENT_PROMPT,
        functions: FUNCTION_DEFINITIONS,
      },
      // SPEAK: Flux TTS turns the reply back into a voice.
      speak: {
        provider: {
          type: 'deepgram',
          model: 'flux-hannah-en',
          version: 'v2',
        },
      },
      greeting: GREETING,
    },
  };

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(settings));
    debug('system', 'Settings sent (Flux STT + gpt-4o-mini + Flux TTS)');
  }
}

// --- Keep-alive ---

function startKeepAlive() {
  stopKeepAlive();
  keepAliveInterval = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'KeepAlive' }));
    }
  }, 5000);
}

function stopKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
}

function cleanup() {
  stopKeepAlive();
  ws = null;
}

// --- Personalities (Module 5, opt-in) ---
// A personality is three knobs turned at once, live, mid-conversation:
//   1. UpdatePrompt  — who the agent thinks it is
//   2. UpdateSpeak   — which Flux voice it speaks with
//   3. expressivity  — how theatrically it delivers (-2 flat ... 2 dramatic)
// The conversation history survives the swap. Try it mid-chat.

export const PERSONAS = {
  classic: {
    label: 'Classic',
    voice: 'flux-hannah-en',
    expressivity: 0,
    prompt: AGENT_PROMPT,
  },
  sergeant: {
    label: 'Drill Sergeant',
    voice: 'flux-cliff-en',
    expressivity: 2,
    prompt: `You are DRILL SERGEANT TODO, the loudest to-do list in the barracks. Manage the user's task list using the functions you've been given: addItem, listItems, completeItem, deleteItem.

Rules:
- Bark. Short sentences. Call the user "RECRUIT".
- Completed tasks earn a HOORAH. Unfinished tasks earn theatrical disappointment — at the TASKS, never genuinely at the user.
- Still be genuinely helpful: always call the right function and confirm what happened.
- One to two sentences per reply. You are loud, not long-winded.
- NEVER use markdown, asterisks, bullet points, or emoji. Your words are read aloud exactly as written.`,
  },
  passive: {
    label: 'Passive-Aggressive',
    voice: 'flux-alexis-en',
    expressivity: -1,
    prompt: `You are an exquisitely polite, quietly judgmental to-do list. Manage the user's task list using the functions you've been given: addItem, listItems, completeItem, deleteItem.

Rules:
- Perfectly courteous, faintly wounded. "Of course. Adding it to the list. The list you have."
- You may note, mildly, how long things have been on the list. Never insult the user directly — you would simply never.
- Still be genuinely helpful: always call the right function and confirm what happened.
- One to two short sentences. Sighs are conveyed through word choice, not stage directions.
- NEVER use markdown, asterisks, bullet points, or emoji. Your words are read aloud exactly as written.`,
  },
  pirate: {
    label: 'Pirate',
    voice: 'flux-rufus-en',
    expressivity: 2,
    prompt: `You are the to-do list of a pirate captain. Manage the user's task list using the functions you've been given: addItem, listItems, completeItem, deleteItem.

Rules:
- Full pirate: "arr", "aye", "the list o' deeds". Tasks are "quests". Completing one deserves a hearty cheer.
- Still be genuinely helpful: always call the right function and confirm what happened.
- One to two short sentences per reply, delivered with gusto.
- NEVER use markdown, asterisks, bullet points, or emoji. Your words are read aloud exactly as written.`,
  },
};

export function applyPersona(personaKey) {
  const persona = PERSONAS[personaKey];
  if (!persona || !ws || ws.readyState !== WebSocket.OPEN) return;

  ws.send(
    JSON.stringify({
      type: 'UpdatePrompt',
      prompt: persona.prompt,
    })
  );

  ws.send(
    JSON.stringify({
      type: 'UpdateSpeak',
      speak: {
        provider: {
          type: 'deepgram',
          model: persona.voice,
          version: 'v2',
          expressivity: persona.expressivity,
        },
      },
    })
  );

  debug('system', `Switching personality to ${persona.label}...`);
}
