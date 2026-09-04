# Challenges — worked solutions

This branch solves every challenge on the workshop guide's
[Challenges page](https://workshops.deepgram.com/voice-agent-js/challenges).
You're meant to arrive here *after* a genuine attempt — the page keeps its
hints at the bottom and this branch one step further away, on purpose. If
you've had your go, welcome. Each section below says what changed, where,
and why it's shaped the way it is.

**In a hurry?** Jump to [Just need it working? Paste-ready outs](#just-need-it-working-paste-ready-outs)
at the bottom — a 20-second version and a 2-minute version.

Run this branch the same way as any other:

```bash
git checkout challenges
npm start
```

Search the code for `CHALLENGE` to find every change.

---

## "The third one" — positions, not just words

**Where:** `public/js/todos.js` — `ORDINALS`, `positionFrom`, the top of
`findTodo`, and the `item` parameter descriptions.

`listItems` already numbers the list from 1, so "the third one" is a
perfectly natural thing to say. The fix has two halves, and the second is
the one people forget:

1. **Resolve the position in your code.** `positionFrom` looks for a digit
   (`"number 2"`) or an ordinal word (`"third"`) and `findTodo` tries that
   *before* matching text. Out-of-range positions fall through to the text
   match, so "the 2019 one" still finds the free trial.
2. **Tell the model to pass the words through.** The `item` parameter
   description now says a position is acceptable and asks the model *not*
   to resolve it. Without that, the LLM sometimes helpfully substitutes the
   item's text — which usually works, but you've lost control of it.

**The trap:** the word "one". "The cactus one" does not mean position 1, so
"one" is deliberately absent from `ORDINALS`. If you added number words
(one, two, three…) and everything started pointing at the cactus, that's
why.

## "Undo that" — a function that reverses another one

**Where:** `todos.js` — `lastDeleted`, the end of `deleteItem`,
`undoDelete`, plus a dispatch entry and a definition.

`deleteItem` already held the removed item in a variable for one line; the
whole trick is keeping it — and its `index` — in module-level state that
outlives the call. `undoDelete` then uses `splice` in its *insert* form
(`splice(index, 0, todo)`) to put it back where it was, and clears
`lastDeleted` so a second undo gets a sentence instead of a duplicate.

Two small choices worth noticing: `deleteItem`'s confirmation now *mentions*
undo ("Say undo if that was a mistake"), which is how users learn the
feature exists in a voice UI with no visible buttons; and the new function
has no parameters — the description alone ("undo", "bring that back",
"deleted by mistake") is what makes the model reach for it.

## "Milk, eggs, and bread" — one round trip instead of three

**Where:** `todos.js` — `addItem`, `spokenList`, and `addItem`'s definition.

Before the change, gpt-4o-mini called `addItem` three times for "add milk,
eggs, and bread" — three `FunctionCallRequest`s, three waits. The fix is a
schema change: an `items` parameter of `type: 'array'`, and a description
that says *when* to use it ("if they name several tasks in one breath, send
them all in a single call"). Tested against the live API: the same sentence
now produces exactly one request with `{"items":["milk","eggs","bread"]}`,
and "add call the plumber" still arrives as a single `text`.

`text` is kept as an optional parameter so the old shape keeps working —
worth doing whenever you change a function's contract. `spokenList` exists
because the return value is spoken: `"milk", "eggs" and "bread"` reads
aloud; `["milk","eggs","bread"]` does not.

## "Are you sure?" — a feature that lives entirely in the prompt

**Where:** `public/js/agent.js` — one rule in `AGENT_PROMPT`.

```
- Deleting is permanent. When the user asks to delete something, do NOT call
  deleteItem yet. Ask them to confirm, naming the item. Call deleteItem only
  after they have clearly said yes. If they say no, never mind, or change the
  subject, leave the list alone and say so.
```

No JavaScript changed. Tested live: "delete the cactus one" gets a
question and no `FunctionCallRequest`; "never mind" leaves the list alone;
"delete the staple gun one" → "yes, I'm sure" fires the call. The wording
matters — "confirm before deleting" on its own is read loosely by smaller
models. Say precisely *when* the function may be called and what to do on a
no. If your model still deletes immediately, make the rule more absolute,
not longer.

## "Make it remember" — two moments in a file's life

**Where:** `todos.js` — `DEFAULT_TODOS`, `loadTodos`, the `todos` and
`nextId` declarations, `notifyChange`, and `resetList`.

Persistence is two lines in the right places: **save** inside
`notifyChange()` (every change already goes through it) and **load** once,
at the top of the file, falling back to the defaults. Both are wrapped in
`try` because private windows and locked-down browsers can throw on
`localStorage`, and a to-do list that works-but-forgets beats one that
crashes.

The detail that bites: `nextId`. If it restarts at 8 after a reload, new
items collide with saved ones and the UI's checkboxes start toggling the
wrong rows. It's now derived from the loaded list. And `resetList` gives the
agent — and therefore the user — a spoken way back to the original seven,
so nobody has to open the browser console.

## "Cover the dead air" — filler while a function is slow

**Where:** `todos.js` — `deleteItem` is `async` with a commented-out fake
delay; `agent.js` — `handleFunctionCalls`.

To make it bad on purpose, uncomment the `await` at the top of `deleteItem`.
Then two discoveries, in the order you'd make them:

1. **The original `agent.js` didn't wait for promises.** It did
   `result = handler(args)` and then `typeof result === 'string'` — false
   for a Promise — so the agent was sent `"{}"` and tried to say it. The
   loop is now `async` and does `result = await handler(args)`. That alone
   fixes correctness; the silence remains.
2. **`InjectAgentMessage` fills the silence.** The
   [docs](https://developers.deepgram.com/docs/voice-agent-inject-agent-message)
   describe three `behavior` values. `default` is refused whenever a turn is
   in progress (it is — the agent is mid-turn waiting on you). `interrupt`
   would step on any narration the model already produced. `queue` is built
   for exactly this case: it speaks after whatever is already queued, and is
   never refused mid-turn. Tested live: the filler arrives as agent
   `ConversationText` before the function's result, gets spoken, and then
   the real confirmation follows.

The refinement in this branch: the filler is on a **400 ms timer** that the
handler's completion cancels, so fast functions (all of ours, normally)
never trigger it and you don't hear "one second" before every single add.
The simplest version — send the filler unconditionally as the request
arrives — is a fine first pass; this is where you'd go next.

---

## Break it on purpose

No solutions — these were observations. If you left one broken: the
`UserStartedSpeaking` case in `agent.js` should stop playback; handlers
should return strings; the last line of `AGENT_PROMPT` bans markdown; and
`eot_threshold` defaults to `0.7`.

## A bug you may have found on the way

If "delete the staple gun one" ever deleted the *cactus*, you found a real
bug in the original matcher: it treated "the" as a meaningful word, and
"the" appears in most items — so the first of them won. `findTodo` now
ignores filler words and picks the item sharing the *most* meaningful words
with what was said. The same fix is on the `start` and `complete` branches.

---

# Just need it working? Paste-ready outs

Two speeds. Both assume you did the guide's **Save your progress first** step
(a commit, or copies of `todos.js` and `agent.js`), so nothing you built is
at risk.

## The 20-second out: switch to this branch

Everything on this page solved at once, no pasting:

```bash
git checkout challenges
```

Refresh the browser and reconnect. To go back to your own code afterwards:

```bash
git checkout -
```

(No git — you downloaded the ZIP? Download this branch the same way:
<https://github.com/deepgram-devs/todo-voice-agent-workshop/archive/refs/heads/challenges.zip>,
unzip it next to your folder, and run `npm install` and `npm start` in it.)

## The 2-minute out: paste one challenge

Each block below is self-contained — it applies to the `complete` branch
code (your code after Module 3) without needing any other challenge. Paste,
save, refresh, reconnect. Every block was applied on its own to a fresh copy
of `complete` and checked before it was written here.

### "The third one"

Paste this **above** `findTodo` in `todos.js`:

```js
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
```

Make these the **first two lines inside** `findTodo`:

```js
  const position = positionFrom(itemText);
  if (position && todos[position - 1]) return todos[position - 1];
```

Then, in `FUNCTION_DEFINITIONS`, replace the `item` description for
`completeItem` with:

```js
description:
            'Words from the task to mark done (e.g. "the cactus one"), or its position as the list was read back (e.g. "the third one", "number 2"). Pass the user\'s words through; do not resolve the position yourself.',
```

and for `deleteItem` with:

```js
description:
            'Words from the task to delete (e.g. "the staple gun one"), or its position as the list was read back (e.g. "the third one", "number 2"). Pass the user\'s words through; do not resolve the position yourself.',
```

Say: *"mark the third one done"*.

### "Undo that"

In `todos.js`, **replace the whole `deleteItem` function** with this (it
adds the `lastDeleted` variable and the new `undoDelete` function too):

```js
let lastDeleted = null;

function deleteItem({ item }) {
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
```

Add this line to `FUNCTION_HANDLERS`, after the `deleteItem` entry:

```js
  undoDelete: () => undoDelete(),
```

Add this entry at the end of `FUNCTION_DEFINITIONS` (before the closing `];`):

```js
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
```

Say: *"delete the staple gun one"* … *"undo that"*.

### "Milk, eggs, and bread"

In `todos.js`, **replace the whole `addItem` function** with (the helper
comes along):

```js
// Turn ["milk", "eggs", "bread"] into: "milk", "eggs" and "bread"
function spokenList(tasks) {
  const quoted = tasks.map((t) => `"${t}"`);
  if (quoted.length === 1) return quoted[0];
  return `${quoted.slice(0, -1).join(', ')} and ${quoted.at(-1)}`;
}

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
```

Then **replace the whole `addItem` entry** in `FUNCTION_DEFINITIONS` with:

```js
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
```

Say: *"add milk, eggs, and bread"* and count the `FunctionCallRequest` lines.

### "Are you sure?"

In `agent.js`, inside `AGENT_PROMPT`, replace the line

```
- When they want something gone, call deleteItem.
```

with

```
- Deleting is permanent. When the user asks to delete something, do NOT call deleteItem yet. Ask them to confirm, naming the item. Call deleteItem only after they have clearly said yes. If they say no, never mind, or change the subject, leave the list alone and say so.
```

No JavaScript changes. Say: *"delete the cactus one"*, then *"never mind"*.

### "Make it remember"

Three edits in `todos.js`, top to bottom.

1. Change `export let todos = [` (the line above the seven items) to:

   ```js
   const DEFAULT_TODOS = [
   ```

2. Replace the line `let nextId = 8;` with:

```js
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
```

3. Replace the whole `notifyChange` function with:

```js
function notifyChange() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  } catch {
    // Storage unavailable — the list still works, it just won't persist.
  }
  if (onChange) onChange(todos);
}
```

Add something, refresh, reconnect, ask what's on the list. To get the
original seven back: in the browser console (F12),
`localStorage.removeItem('todos')`, then refresh.

### "Cover the dead air"

Two files. First, make it slow on purpose: in `todos.js`, replace the first
line of `deleteItem` with these two:

```js
async function deleteItem({ item }) {
  await new Promise((resolve) => setTimeout(resolve, 3000)); // pretend this is a slow lookup
```

Then in `agent.js`, replace the top of `handleFunctionCalls` — from
`function handleFunctionCalls(msg) {` down to `result = handler(args);` —
with:

```js
async function handleFunctionCalls(msg) {
  const functions = msg.functions || [];

  for (const fn of functions) {
    const handler = FUNCTION_HANDLERS[fn.name];
    debug('function', `Agent is calling ${fn.name}(${fn.arguments || ''})`);

    // Give the agent something to say while it waits for our answer.
    // 'queue' = after whatever it is already saying, and never refused mid-turn.
    ws.send(JSON.stringify({
      type: 'InjectAgentMessage',
      behavior: 'queue',
      message: 'One second, let me find that.',
    }));

    let result;
    if (handler) {
      try {
        const args = fn.arguments ? JSON.parse(fn.arguments) : {};
        result = await handler(args);
```

The rest of the function stays as it is. Say: *"delete the cactus one"*.
You'll hear "One second, let me find that", three seconds of nothing, then
the confirmation. (The solved branch refines this with a timer so the filler
only fires when a function is actually slow — see the section above.)
