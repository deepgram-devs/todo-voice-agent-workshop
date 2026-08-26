// Audio pipeline: microphone capture and agent audio playback

const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;

let audioContext = null;
let micStream = null;
let scriptProcessor = null;
let sourceNode = null;

// Playback state
let playbackContext = null;
let nextPlayTime = 0;
let currentSources = [];

// Callback to send audio data over WebSocket
let onAudioData = null;

export function setAudioCallback(callback) {
  onAudioData = callback;
}

// --- Microphone Capture ---

export async function startMicrophone() {
  if (micStream) return; // Already running

  micStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      sampleRate: INPUT_SAMPLE_RATE,
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
    },
  });

  audioContext = new AudioContext({ sampleRate: INPUT_SAMPLE_RATE });
  sourceNode = audioContext.createMediaStreamSource(micStream);

  // ScriptProcessorNode: simpler than AudioWorklet for workshop purposes.
  // Note: ScriptProcessorNode is deprecated; AudioWorklet is the modern replacement.
  scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);

  scriptProcessor.onaudioprocess = (event) => {
    if (!onAudioData) return;

    const float32 = event.inputBuffer.getChannelData(0);
    const int16 = float32ToInt16(float32);
    onAudioData(int16.buffer);
  };

  sourceNode.connect(scriptProcessor);
  scriptProcessor.connect(audioContext.destination);
}

export function stopMicrophone() {
  if (scriptProcessor) {
    scriptProcessor.disconnect();
    scriptProcessor = null;
  }
  if (sourceNode) {
    sourceNode.disconnect();
    sourceNode = null;
  }
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  if (micStream) {
    micStream.getTracks().forEach(track => track.stop());
    micStream = null;
  }
}

export function isMicActive() {
  return micStream !== null;
}

// --- Audio Playback ---
// Writes raw PCM Int16 samples directly into AudioBuffers instead of
// using WAV headers + decodeAudioData. This avoids click/pop artifacts
// at chunk boundaries and is more efficient.

function getPlaybackContext() {
  if (!playbackContext || playbackContext.state === 'closed') {
    playbackContext = new AudioContext({ sampleRate: OUTPUT_SAMPLE_RATE });
  }
  return playbackContext;
}

export function playAudioChunk(arrayBuffer) {
  const ctx = getPlaybackContext();

  // Convert raw Int16 PCM bytes to Float32 samples
  const int16 = new Int16Array(arrayBuffer);
  const numSamples = int16.length;
  if (numSamples === 0) return;

  const audioBuffer = ctx.createBuffer(1, numSamples, OUTPUT_SAMPLE_RATE);
  const channelData = audioBuffer.getChannelData(0);
  for (let i = 0; i < numSamples; i++) {
    channelData[i] = int16[i] / 32768;
  }

  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(ctx.destination);

  // Schedule sequential playback with a small overlap to prevent gaps
  const now = ctx.currentTime;
  if (nextPlayTime < now) {
    nextPlayTime = now;
  }

  source.start(nextPlayTime);
  nextPlayTime += audioBuffer.duration;

  currentSources.push(source);
  source.onended = () => {
    const idx = currentSources.indexOf(source);
    if (idx !== -1) currentSources.splice(idx, 1);
  };
}

// Stop all playing audio (barge-in)
export function stopPlayback() {
  for (const source of currentSources) {
    try { source.stop(); } catch {}
  }
  currentSources = [];
  nextPlayTime = 0;
}

export function closePlayback() {
  stopPlayback();
  if (playbackContext && playbackContext.state !== 'closed') {
    playbackContext.close();
    playbackContext = null;
  }
}

// --- Utility Functions ---

// Convert Float32Array to Int16Array (linear16)
function float32ToInt16(float32) {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return int16;
}
