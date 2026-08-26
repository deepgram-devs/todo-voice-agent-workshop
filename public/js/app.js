// Entry point — wires the modules together.
//
//   todos.js  →  the data and the four functions (you edit this one)
//   agent.js  →  the Deepgram Voice Agent connection
//   audio.js  →  microphone in, agent voice out
//   ui.js     →  everything on screen

import { todos, setOnChange } from './todos.js';
import {
  renderTodos,
  addConversationMessage,
  addEventMessage,
  updateStatus,
  setPrimaryButtonState,
  setActivePersona,
} from './ui.js';
import {
  startMicrophone,
  stopMicrophone,
  isMicActive,
  setAudioCallback,
  playAudioChunk,
  stopPlayback,
  closePlayback,
} from './audio.js';
import {
  connect,
  disconnect,
  sendAudio,
  sendTextMessage,
  setCallbacks,
  applyPersona,
  isConnected,
  States,
} from './agent.js';

// --- Initial render ---

renderTodos(todos);
setOnChange(renderTodos);

const primaryBtn = document.getElementById('primaryBtn');
const endBtn = document.getElementById('endBtn');
const apiKeyInput = document.getElementById('apiKeyInput');
const typedForm = document.getElementById('typedForm');
const typedInput = document.getElementById('typedInput');

// Check if the server already has an API key from .env
let serverHasKey = false;
fetch('/api/config')
  .then((r) => r.json())
  .then((config) => {
    if (config.hasApiKey) {
      serverHasKey = true;
      apiKeyInput.placeholder = 'API key loaded from server .env';
      apiKeyInput.disabled = true;
      addEventMessage('system', 'API key detected on server — no need to enter one');
    }
  })
  .catch(() => {});

let connected = false;

// --- Agent callbacks ---

setCallbacks({
  onState: (state) => {
    updateStatus(state);

    if (state === States.CONNECTING || state === States.CONFIGURING) {
      setPrimaryButtonState('connecting');
      endBtn.hidden = true;
    } else if (state === States.CONNECTED) {
      connected = true;
      endBtn.hidden = false;
      startMicrophone()
        .then(() => setPrimaryButtonState('listening'))
        .catch((err) => {
          // No mic? No problem — the typed box below works either way.
          addEventMessage('error', `Microphone unavailable: ${err.message}`);
          addEventMessage('system', 'You can still talk to the agent with the typed input below.');
          setPrimaryButtonState('muted');
        });
    } else if (state === States.DISCONNECTED || state === States.ERROR) {
      connected = false;
      endBtn.hidden = true;
      setPrimaryButtonState('disconnected');
      if (isMicActive()) stopMicrophone();
      closePlayback();
    }
  },

  onAudio: (arrayBuffer) => {
    if (arrayBuffer === null) {
      stopPlayback(); // barge-in
      return;
    }
    playAudioChunk(arrayBuffer);
  },

  onDebug: (tag, text) => {
    addEventMessage(tag, text);
  },

  onText: (role, content) => {
    addConversationMessage(role, content);
  },

  onFunction: () => {
    renderTodos(todos);
  },
});

// Microphone chunks go straight to the agent
setAudioCallback((audioBuffer) => {
  sendAudio(audioBuffer);
});

// --- Primary button: connect / mute / unmute ---

primaryBtn.addEventListener('click', async () => {
  if (!connected) {
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey && !serverHasKey) {
      addEventMessage('error', 'Add your Deepgram API key to .env (or paste it above), then connect.');
      apiKeyInput.focus();
      return;
    }
    connect(apiKey || '');
  } else if (isMicActive()) {
    stopMicrophone();
    setPrimaryButtonState('muted');
  } else {
    try {
      await startMicrophone();
      setPrimaryButtonState('listening');
    } catch (err) {
      addEventMessage('error', `Microphone error: ${err.message}`);
    }
  }
});

endBtn.addEventListener('click', () => {
  disconnect();
  if (isMicActive()) stopMicrophone();
});

apiKeyInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !connected) {
    primaryBtn.click();
  }
});

// --- Typed input: the no-microphone path ---
// Works in a loud room, with mic permission denied, or if you'd just
// rather not talk out loud. Same agent, same functions, same reply.

typedForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = typedInput.value.trim();
  if (!text) return;
  if (!isConnected()) {
    addEventMessage('error', 'Connect first, then send.');
    return;
  }
  sendTextMessage(text);
  typedInput.value = '';
});

// --- Personality buttons (Module 5, opt-in) ---

for (const btn of document.querySelectorAll('.persona-btn')) {
  btn.addEventListener('click', () => {
    if (!isConnected()) {
      addEventMessage('error', 'Connect first — personalities are applied to a live conversation.');
      return;
    }
    applyPersona(btn.dataset.persona);
    setActivePersona(btn.dataset.persona);
  });
}
