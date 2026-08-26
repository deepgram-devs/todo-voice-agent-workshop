// DOM rendering. No voice logic lives here — just what you see.

const todoList = document.getElementById('todoList');
const todoCount = document.getElementById('todoCount');
const conversation = document.getElementById('conversation');
const eventLog = document.getElementById('eventLog');
const statusPill = document.getElementById('statusPill');
const primaryBtn = document.getElementById('primaryBtn');

// --- To-do list ---

export function renderTodos(todos) {
  todoList.innerHTML = '';
  for (const todo of todos) {
    const li = document.createElement('li');
    li.className = todo.done ? 'todo done' : 'todo';

    const mark = document.createElement('span');
    mark.className = 'todo-mark';
    mark.setAttribute('aria-hidden', 'true');
    mark.textContent = todo.done ? '✓' : '';

    const text = document.createElement('span');
    text.className = 'todo-text';
    text.textContent = todo.text;

    const srStatus = document.createElement('span');
    srStatus.className = 'sr-only';
    srStatus.textContent = todo.done ? ' (done)' : ' (not done)';

    li.append(mark, text, srStatus);
    todoList.appendChild(li);
  }
  const doneCount = todos.filter((t) => t.done).length;
  todoCount.textContent = `${doneCount} of ${todos.length} done`;
}

// --- Conversation (chat bubbles) ---

export function addConversationMessage(role, content) {
  const bubble = document.createElement('div');
  bubble.className = role === 'user' ? 'bubble user' : 'bubble agent';

  const who = document.createElement('span');
  who.className = 'bubble-who';
  who.textContent = role === 'user' ? 'You' : 'Agent';

  const text = document.createElement('p');
  text.textContent = content;

  bubble.append(who, text);
  conversation.appendChild(bubble);
  conversation.scrollTop = conversation.scrollHeight;
}

// --- Event log (the "what is actually happening" panel) ---

export function addEventMessage(tag, text) {
  const line = document.createElement('div');
  line.className = `event event-${tag}`;

  const time = new Date().toLocaleTimeString([], {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  line.textContent = `${time} [${tag}] ${text}`;
  eventLog.appendChild(line);
  eventLog.scrollTop = eventLog.scrollHeight;
}

// --- Status + primary button ---

export function updateStatus(state) {
  statusPill.dataset.state = state;
  const labels = {
    disconnected: 'Disconnected',
    connecting: 'Connecting…',
    configuring: 'Configuring…',
    connected: 'Connected',
    error: 'Error',
  };
  statusPill.textContent = labels[state] || state;
}

export function setPrimaryButtonState(mode) {
  primaryBtn.dataset.mode = mode;
  const labels = {
    disconnected: 'Connect',
    connecting: 'Connecting…',
    listening: 'Listening — click to mute',
    muted: 'Muted — click to unmute',
  };
  primaryBtn.textContent = labels[mode] || mode;
  primaryBtn.disabled = mode === 'connecting';
}

export function setActivePersona(key) {
  for (const btn of document.querySelectorAll('.persona-btn')) {
    const isActive = btn.dataset.persona === key;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
  }
}
