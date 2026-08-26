// Your to-do list — the data, and the four functions the agent can call.
//
// THIS IS THE FILE YOU WILL EDIT DURING THE WORKSHOP.
//
// The agent doesn't touch this list directly. When you say "add milk",
// the agent decides to call addItem({ text: "buy milk" }), Deepgram sends
// that request over the WebSocket, and the code in this file runs — right
// here in your browser. Whatever string these functions return is what the
// agent gets back, and what it uses to answer you out loud.

// The list starts with a few items so there's something to talk about.
export let todos = [
  { id: 1, text: 'Water the cactus — it has been eight months', done: false },
  { id: 2, text: "Return the minotaur's staple gun", done: false },
  { id: 3, text: "Rename all my variables from 'thing2' to something responsible", done: false },
  { id: 4, text: 'Cancel the free trial from 2019', done: false },
  { id: 5, text: 'Back up the laptop before it senses fear', done: false },
  { id: 6, text: 'Finally read the terms and conditions', done: false },
  { id: 7, text: 'Teach my to-do list to listen', done: false },
];

let nextId = 8;

// The UI registers a callback here so the on-screen list re-renders
// whenever a function changes the data.
let onChange = null;
export function setOnChange(callback) {
  onChange = callback;
}
function notifyChange() {
  if (onChange) onChange(todos);
}

// Find a to-do whose text loosely matches what the agent heard.
// "the cactus one" should match "Water the cactus — it has been eight months".
function findTodo(itemText) {
  const lower = itemText.toLowerCase();
  const words = lower.split(/\s+/).filter((w) => w.length > 2);
  return (
    todos.find((t) => t.text.toLowerCase().includes(lower)) ||
    todos.find((t) => words.some((w) => t.text.toLowerCase().includes(w)))
  );
}

// --- The four functions the agent can call ---
// Each one returns a plain sentence (not JSON, not markdown) because the
// agent reads the result and speaks — nobody wants to hear "curly brace".

function addItem({ text }) {
  todos.push({ id: nextId++, text, done: false });
  notifyChange();
  return `Added "${text}". The list now has ${todos.length} items.`;
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
  if (todo.done) {
    return `"${todo.text}" was already done. Double-checking counts as productivity.`;
  }
  todo.done = true;
  notifyChange();
  return `Marked "${todo.text}" as done. Nice.`;
}

function deleteItem({ item }) {
  const index = todos.findIndex((t) => t === findTodo(item));
  if (index === -1) {
    return `I couldn't find anything matching "${item}" to delete.`;
  }
  const [removed] = todos.splice(index, 1);
  notifyChange();
  return `Deleted "${removed.text}". It's like it never existed.`;
}

// --- Dispatch map: function name → handler ---
// When Deepgram sends a FunctionCallRequest, agent.js looks up the
// function's name here and runs it with the parsed arguments.
export const FUNCTION_HANDLERS = Object.assign(Object.create(null), {
  addItem: (args) => addItem(args),
  listItems: () => listItems(),
  completeItem: (args) => completeItem(args),
  deleteItem: (args) => deleteItem(args),
});

// --- Function definitions: what the agent is told it can do ---
// These descriptions are read by the LLM, not by users. The clearer the
// description, the better the agent picks the right function.
export const FUNCTION_DEFINITIONS = [
  {
    name: 'addItem',
    description:
      'Adds a new item to the to-do list. Call this when the user wants to add, remember, or note down a task.',
    parameters: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The task to add, as a short phrase (e.g. "buy oat milk")',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'listItems',
    description:
      'Reads back the full to-do list. Call this when the user asks what is on the list, what is left, or what they have to do.',
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
          description: 'Words from the task to mark done (e.g. "the cactus one" or "water the cactus")',
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
          description: 'Words from the task to delete (e.g. "the staple gun one")',
        },
      },
      required: ['item'],
    },
  },
];
