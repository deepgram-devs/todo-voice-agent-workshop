# Teach Your To-Do List to Listen

A to-do list you can talk to. Add items, hear what's on the list, mark things
done, and delete things — by speaking (or typing) to an AI voice agent built
on the [Deepgram Voice Agent API](https://developers.deepgram.com/docs/voice-agent).

This is the starter code for the workshop guide at
**[workshops.deepgram.com/voice-agent-js](https://workshops.deepgram.com/voice-agent-js/overview)**.
The guide explains every step — this README just gets you running.

## What you need

1. **Node.js 18 or newer.** Check with `node --version`. If that prints an
   error or a number below 18, install Node from [nodejs.org](https://nodejs.org/)
   (the "LTS" button) and reopen your terminal.
2. **A free Deepgram API key.** Sign up at
   [console.deepgram.com/signup](https://console.deepgram.com/signup?jump=keys) —
   no credit card, and new accounts get $200 of free credit. Copy the key it
   gives you somewhere safe.
3. **Headphones with a microphone** if you're in a room with other people —
   otherwise the agent will hear itself (and your neighbors).

No microphone, or don't want to talk out loud? Everything also works through
the typed input box in the app.

## Get it running (about 3 minutes)

Copy and paste these one at a time into your terminal:

```bash
git clone https://github.com/deepgram-devs/todo-voice-agent-workshop.git
cd todo-voice-agent-workshop
npm install
```

(No git? Download the ZIP from the green **Code** button on GitHub, unzip it,
and `cd` into the folder instead.)

Create a file named `.env` in the project folder containing your API key:

```bash
echo "DEEPGRAM_API_KEY=paste_your_key_here" > .env
```

Then start it:

```bash
npm start
```

Open **http://localhost:3000** in your browser and click **Connect**. Your
browser will ask permission to use the microphone — click **Allow**. The
agent says hello. Say hello back. That's it — you're running.

> Skipped the `.env` step? You can paste your key into the box in the app
> instead. The `.env` way is better (the key stays out of the browser), but
> both work for the workshop.

## Try saying

- "What's on my list?"
- "Add buy oat milk to the list"
- "I finally watered the cactus" *(marks it done — once you've built that, see below)*
- "Delete the staple gun one"
- …and while it's reading the whole list back: **just start talking.** It stops. That's barge-in.

## Branches

| Branch | What it is |
|---|---|
| `start` | Where the workshop begins. `addItem` and `listItems` work; `completeItem` and `deleteItem` are marked gaps **you** fill in (Module 3 of the guide). |
| `complete` | Every gap filled — the finished workshop state. Peek anytime you're stuck. |

You're probably on `start` right now (it's the default). To see the finished
version: `git checkout complete`, then refresh the browser.

## How it works

```
Your browser (mic + speaker + your functions)
      │  audio + JSON over one WebSocket
      ▼
server.js (Express — keeps your API key out of the browser)
      │
      ▼
Deepgram Voice Agent API (wss://agent.deepgram.com/v1/agent/converse)
   Listen: Flux (flux-general-en)  ·  Think: gpt-4o-mini  ·  Speak: Flux TTS (flux-hannah-en)
```

The agent can't touch your list directly. It asks to call one of the four
functions defined in [`public/js/todos.js`](public/js/todos.js); the code runs
in **your** browser, and the agent speaks whatever your function returns.

```
public/
├── js/
│   ├── todos.js   ← the list + the four functions. THE FILE YOU EDIT.
│   ├── agent.js   ← WebSocket, Settings, events, personalities
│   ├── audio.js   ← mic capture and voice playback
│   ├── ui.js      ← rendering
│   └── app.js     ← wires it all together
├── css/
│   ├── theme.css  ← brand tokens (the only file that knows about colors)
│   └── styles.css
└── index.html
server.js          ← local server + WebSocket proxy (no edits needed)
```

## When something doesn't work

| What you see | What's happening | Fix |
|---|---|---|
| Browser never asks about the microphone | Permission was denied earlier | Click the icon by the address bar → allow microphone → refresh. Or just use the typed input box. |
| Agent connects but never hears you | Wrong input device | System sound settings → set your headset as the input device → refresh. |
| "Connection closed: 4001" | No API key found | Create the `.env` file (see above) and restart `npm start`, or paste the key into the app. |
| Connects then immediately closes | Key invalid or out of credit | Check the key at [console.deepgram.com](https://console.deepgram.com/) and paste it freshly — no quotes, no spaces. |
| Robotic noise or echo | Agent hearing itself through your speakers | Wear headphones, or mute while it talks. |
| `EADDRINUSE` / port 3000 busy | Another app has the port | `PORT=3001 npm start`, then open http://localhost:3001. |
| Everything hangs on "Connecting…" | Network blocks WebSockets | Try another network (phone hotspot works). Conference wifi is a known enemy. |

## Security notes

Built for **local workshop use**. Before deploying anywhere public, add
authentication and rate limiting to the WebSocket proxy in `server.js` and
serve over HTTPS — pasting a key into the browser sends it as a cleartext
query parameter over `ws://`. Prefer the `.env` route.

## License

MIT — see [LICENSE](LICENSE).
