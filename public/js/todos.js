// Your to-do list — the data, and the functions the agent can call.
//
// THIS IS THE `challenges` BRANCH: every challenge from the guide's
// Challenges page is solved here, and CHALLENGES.md in the repo root walks
// through each one. Look for the CHALLENGE markers below.
//
// The agent doesn't touch this list directly. When you say "add milk",
// the agent decides to call addItem({ items: ["buy milk"] }), Deepgram sends
// that request over the WebSocket, and the code in this file runs — right
// here in your browser. Whatever string these functions return is what the
// agent gets back, and what it uses to answer you out loud.

// The list starts with a few items so there's something to talk about.
const DEFAULT_TODOS = [
  { id: 1, text: 'Water the cactus — it has been eight months', done: false },
  { id: 2, text: "Return the minotaur's staple gun", done: false },
  { id: 3, text: "Rename all my variables from 'thing2' to something responsible", done: false },
  { id: 4, text: 'Cancel the free trial from 2019', done: false },
  { id: 5, text: 'Back up the laptop before it senses fear', done: false },
  { id: 6, text: 'Finally read the terms and conditions', done: false },
  { id: 7, text: 'Teach my to-do list to listen', done: false },
];

// CHALLENGE "Make it remember": load from localStorage if there's a saved
// list, otherwise start from the defaults. Saving happens in notifyChange().
const STORAGE_KEY = 'todos';

function loadTodos() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {
    // Private windows and locked-down browsers can throw here. Fall through.
  }
  return DEFAULT_TODOS.map((t) => ({ ...t }));
}

export let todos = loadTodos();

// nextId has to survive a reload too, or new items collide with old ones.
let nextId = todos.reduce((max, t) => Math.max(max, t.id), 0) + 1;

// The UI registers a callback here so the on-screen list re-renders
// whenever a function changes the data.
let onChange = null;
export function setOnChange(callback) {
  onChange = callback;
}
function notifyChange() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  } catch {
    // Storage unavailable — the list still works, it just won't persist.
  }
  if (onChange) onChange(todos);
}

// CHALLENGE "The third one": listItems numbers the list from 1, so people
// say "the third one" or "number 2". Turn that into a position when we can.
// Deliberately NOT in this table: "one" — "the cactus one" isn't position 1.
const ORDINALS = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
  sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
};

function positionFrom(itemText) {
  const lower = itemText.toLowerCase();
  const digits = lower.match(/\b(\d+)\b/);
  if (digits) return Number(digits[1]);
  for (const word of lower.split(/\W+/)) {
    if (ORDINALS[word]) return ORDINALS[word];
  }
  return null;
}

// Words that appear in almost every item and mean nothing on their own.
// Without this list, "the staple gun one" matches "Water THE cactus" first.
const FILLER_WORDS = new Set(['the', 'one', 'and', 'that', 'this', 'item', 'task', 'thing', 'from', 'with']);

// Find a to-do whose text loosely matches what the agent heard.
// "the cactus one" should match "Water the cactus — it has been eight months".
// "the third one" should match whatever is third right now.
function findTodo(itemText) {
  const position = positionFrom(itemText);
  if (position && todos[position - 1]) return todos[position - 1];

  const lower = String(itemText ?? '').toLowerCase().trim();
  if (!lower) return undefined; // nothing to match — never fall through to "the first item"
  const exact = todos.find((t) => t.text.toLowerCase().includes(lower));
  if (exact) return exact;

  // Otherwise: the item sharing the most meaningful words with what was said.
  const words = lower.split(/\W+/).filter((w) => w.length > 2 && !FILLER_WORDS.has(w));
  let best = null;
  let bestScore = 0;
  for (const t of todos) {
    const text = t.text.toLowerCase();
    const score = words.filter((w) => text.includes(w)).length;
    if (score > bestScore) {
      best = t;
      bestScore = score;
    }
  }
  return best;
}

// Turn ["milk", "eggs", "bread"] into: "milk", "eggs" and "bread"
function spokenList(tasks) {
  const quoted = tasks.map((t) => `"${t}"`);
  if (quoted.length === 1) return quoted[0];
  return `${quoted.slice(0, -1).join(', ')} and ${quoted.at(-1)}`;
}

// --- The functions the agent can call ---
// Each one returns a plain sentence (not JSON, not markdown) because the
// agent reads the result and speaks — nobody wants to hear "curly brace".

// CHALLENGE "Milk, eggs, and bread": one call can now carry several tasks.
// `text` is still accepted so the old single-item shape keeps working.
function addItem({ items, text }) {
  const tasks = (items ?? (text ? [text] : [])).filter(Boolean);
  if (tasks.length === 0) {
    return "I didn't catch what to add. Could you say it again?";
  }
  for (const task of tasks) {
    todos.push({ id: nextId++, text: task, done: false });
  }
  notifyChange();
  return `Added ${spokenList(tasks)}. The list now has ${todos.length} items.`;
}

function listItems() {
  if (todos.length === 0) {
    return 'The list is empty. Suspiciously empty.';
  }
  const lines = todos.map((t, i) => `${i + 1}. ${t.text}${t.done ? ' (done)' : ''}`);
  const doneCount = todos.filter((t) => t.done).length;
  return `There are ${todos.length} items, ${doneCount} done. ${lines.join('. ')}`;
}

function completeItem({ item }) {
  const todo = findTodo(item);
  if (!todo) {
    return `I couldn't find anything matching "${item}" on the list.`;
  }
  todo.done = true;
  notifyChange();
  return `Marked "${todo.text}" as done. Nice.`;
}

// CHALLENGE "Undo that": remember what we deleted, and where it was.
let lastDeleted = null;

// CHALLENGE "Cover the dead air": this function is `async` so it CAN be
// slow. Uncomment the await below to fake a three-second database lookup,
// then listen for the filler agent.js sends while it waits.
async function deleteItem({ item }) {
  // await new Promise((resolve) => setTimeout(resolve, 3000)); // pretend lookup

  const index = todos.findIndex((t) => t === findTodo(item));
  if (index === -1) {
    return `I couldn't find anything matching "${item}" to delete.`;
  }
  const [removed] = todos.splice(index, 1);
  lastDeleted = { todo: removed, index };
  notifyChange();
  return `Deleted "${removed.text}". Say undo if that was a mistake.`;
}

function undoDelete() {
  if (!lastDeleted) {
    return "There's nothing to undo — nothing has been deleted recently.";
  }
  const { todo, index } = lastDeleted;
  todos.splice(Math.min(index, todos.length), 0, todo);
  lastDeleted = null;
  notifyChange();
  return `Brought back "${todo.text}". It's like it never left.`;
}

// CHALLENGE "Make it remember", the reset: hand the agent a way back to the
// original seven, so nobody has to open the browser console.
function resetList() {
  todos.length = 0;
  todos.push(...DEFAULT_TODOS.map((t) => ({ ...t })));
  nextId = 8;
  lastDeleted = null;
  notifyChange();
  return 'Reset the list to the original seven items. The cactus is thirsty again.';
}

// --- Dispatch map: function name → handler ---
// When Deepgram sends a FunctionCallRequest, agent.js looks up the
// function's name here and runs it with the parsed arguments.
export const FUNCTION_HANDLERS = Object.assign(Object.create(null), {
  addItem: (args) => addItem(args),
  listItems: () => listItems(),
  completeItem: (args) => completeItem(args),
  deleteItem: (args) => deleteItem(args),
  undoDelete: () => undoDelete(),
  resetList: () => resetList(),
});

// --- Function definitions: what the agent is told it can do ---
// These descriptions are read by the LLM, not by users. The clearer the
// description, the better the agent picks the right function.
export const FUNCTION_DEFINITIONS = [
  {
    name: 'addItem',
    description:
      'Adds one or more items to the to-do list. Call this when the user wants to add, remember, or note down tasks. If they name several tasks in one breath, send them all in a single call.',
    parameters: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: { type: 'string' },
          description: 'The tasks to add, each as a short phrase (e.g. ["buy oat milk", "call the plumber"])',
        },
        text: {
          type: 'string',
          description: 'A single task to add. Prefer items.',
        },
      },
      required: [],
    },
  },
  {
    name: 'listItems',
    description:
      'Reads back the full to-do list, numbered. Call this when the user asks what is on the list, what is left, or what they have to do.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'completeItem',
    description:
      'Marks an item on the to-do list as done. Call this when the user says they finished, completed, or did a task.',
    parameters: {
      type: 'object',
      properties: {
        item: {
          type: 'string',
          description:
            'Words from the task to mark done (e.g. "the cactus one"), or its position as the list was read back (e.g. "the third one", "number 2"). Pass the user\'s words through; do not resolve the position yourself.',
        },
      },
      required: ['item'],
    },
  },
  {
    name: 'deleteItem',
    description:
      'Removes an item from the to-do list entirely. Call this when the user wants to delete, remove, or forget a task.',
    parameters: {
      type: 'object',
      properties: {
        item: {
          type: 'string',
          description:
            'Words from the task to delete (e.g. "the staple gun one"), or its position as the list was read back (e.g. "the third one", "number 2"). Pass the user\'s words through; do not resolve the position yourself.',
        },
      },
      required: ['item'],
    },
  },
  {
    name: 'undoDelete',
    description:
      'Restores the most recently deleted item to where it was. Call this when the user says undo, bring that back, or that they deleted something by mistake.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'resetList',
    description:
      'Throws away the current list and restores the original example items. Call this only when the user explicitly asks to reset or start over.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];
