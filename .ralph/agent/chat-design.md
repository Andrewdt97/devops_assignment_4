# Room-Based Chat — Design Document

## Overview

Add a live in-game chat to the multiplayer poker game. Chat is scoped per-room: messages sent by any player or spectator in a room are visible to all other participants in that room. System messages (player join/leave, game events) are interspersed with user messages for context.

---

## 1. Protocol

All chat communication uses the existing WebSocket connection. No new transport required.

### 1.1 Client → Server

```json
{
  "type": "chat",
  "text": "Nice hand!"
}
```

| Field  | Type   | Constraints                        |
|--------|--------|------------------------------------|
| `type` | string | Must be `"chat"`                   |
| `text` | string | 1–200 characters, trimmed, non-empty after trim |

### 1.2 Server → Client (user message)

```json
{
  "type": "chatMessage",
  "id": "msg-1737372000-a1b2",
  "from": {
    "playerId": "uuid-...",
    "displayName": "Alice"
  },
  "text": "Nice hand!",
  "timestamp": 1737372000000
}
```

### 1.3 Server → Client (system message)

```json
{
  "type": "chatMessage",
  "id": "msg-1737372001-c3d4",
  "from": null,
  "system": true,
  "text": "Bob joined the room",
  "timestamp": 1737372001000
}
```

### 1.4 Server → Client (error, chat-specific)

```json
{
  "type": "error",
  "message": "Message too long (max 200 characters)"
}
```

---

## 2. Server Implementation

### 2.1 New case in `handleMessage` (server.js)

```js
case 'chat': {
  const room = getRoomByPlayerId(playerId);
  if (!room) {
    ws.send(JSON.stringify({ type: 'error', message: 'Not in a room' }));
    break;
  }
  handleChatMessage(room, playerId, msg.text);
  break;
}
```

### 2.2 Chat handler module (`chat.js`)

A small module responsible for validation, rate limiting, and broadcasting:

```js
'use strict';

const crypto = require('crypto');

// Rate limit: max 5 messages per 10 seconds per player
const RATE_LIMIT_WINDOW_MS = 10_000;
const RATE_LIMIT_MAX = 5;
const MAX_MESSAGE_LENGTH = 200;

const rateLimitMap = new Map(); // playerId -> [timestamps]

function generateMessageId() {
  const ts = Math.floor(Date.now() / 1000);
  const hex = crypto.randomBytes(2).toString('hex');
  return `msg-${ts}-${hex}`;
}

function handleChatMessage(room, playerId, text) {
  // Find sender
  const sender = room.players.find(p => p.id === playerId)
    || room.spectators.find(p => p.id === playerId);
  if (!sender) return;

  // Validate text
  if (typeof text !== 'string') {
    sender.ws.send(JSON.stringify({ type: 'error', message: 'Invalid message' }));
    return;
  }
  const trimmed = text.trim();
  if (trimmed.length === 0) return; // silently ignore empty
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    sender.ws.send(JSON.stringify({
      type: 'error',
      message: `Message too long (max ${MAX_MESSAGE_LENGTH} characters)`
    }));
    return;
  }

  // Rate limit check
  if (!checkRateLimit(playerId)) {
    sender.ws.send(JSON.stringify({
      type: 'error',
      message: 'Sending messages too fast. Please wait.'
    }));
    return;
  }

  // Broadcast to all room participants
  const chatMsg = {
    type: 'chatMessage',
    id: generateMessageId(),
    from: {
      playerId: sender.id,
      displayName: sender.displayName,
    },
    text: trimmed,
    timestamp: Date.now(),
  };

  broadcastToRoom(room, chatMsg);
}

function broadcastSystemMessage(room, text) {
  const chatMsg = {
    type: 'chatMessage',
    id: generateMessageId(),
    from: null,
    system: true,
    text,
    timestamp: Date.now(),
  };
  broadcastToRoom(room, chatMsg);
}

function broadcastToRoom(room, msg) {
  const json = JSON.stringify(msg);
  const allReceivers = [...room.players, ...room.spectators];
  for (const p of allReceivers) {
    if (p.ws && p.ws.readyState === 1) {
      p.ws.send(json);
    }
  }
}

function checkRateLimit(playerId) {
  const now = Date.now();
  let timestamps = rateLimitMap.get(playerId);
  if (!timestamps) {
    timestamps = [];
    rateLimitMap.set(playerId, timestamps);
  }
  // Remove expired entries
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  while (timestamps.length > 0 && timestamps[0] < cutoff) {
    timestamps.shift();
  }
  if (timestamps.length >= RATE_LIMIT_MAX) {
    return false;
  }
  timestamps.push(now);
  return true;
}

module.exports = { handleChatMessage, broadcastSystemMessage };
```

### 2.3 System messages (integration points)

Add `broadcastSystemMessage(room, text)` calls in existing code:

| Location | Trigger | Message |
|----------|---------|---------|
| `room-manager.js` → `joinRoom` | Player joins | `"Alice joined the room"` |
| `room-manager.js` → `leaveRoom` | Player leaves | `"Alice left the room"` |
| `game-engine.js` → `startGame` | Game starts | `"Game started! Hand #1"` |
| `game-engine.js` → hand won | Hand completes | `"Alice wins 450 chips"` |
| `game-engine.js` → `handleDisconnect` | Player disconnects | `"Alice disconnected"` |
| `room-manager.js` → `rejoinRoom` | Player reconnects | `"Alice reconnected"` |

---

## 3. Client Implementation

### 3.1 HTML additions (index.html)

Add a chat panel inside both `#waitingRoom` and `#gameScreen`:

```html
<!-- Chat Panel (shared component, placed in both screens) -->
<div class="chat-panel" id="chatPanel">
  <div class="chat-messages" id="chatMessages"></div>
  <div class="chat-input-row">
    <input type="text" id="chatInput" placeholder="Type a message…"
           maxlength="200" autocomplete="off">
    <button id="chatSendBtn">Send</button>
  </div>
</div>
```

### 3.2 CSS additions (style.css)

```css
/* Chat Panel */
.chat-panel {
  position: fixed;
  bottom: 0;
  right: 0;
  width: 300px;
  max-height: 350px;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary, #1a1a2e);
  border: 1px solid var(--border, #333);
  border-radius: 8px 0 0 0;
  z-index: 100;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  max-height: 280px;
  font-size: 0.85rem;
}

.chat-messages .msg {
  margin-bottom: 4px;
  word-wrap: break-word;
}

.chat-messages .msg .sender {
  font-weight: bold;
  color: #4ecdc4;
}

.chat-messages .msg.system {
  color: #888;
  font-style: italic;
}

.chat-input-row {
  display: flex;
  border-top: 1px solid var(--border, #333);
}

.chat-input-row input {
  flex: 1;
  padding: 6px 8px;
  border: none;
  background: transparent;
  color: inherit;
  outline: none;
}

.chat-input-row button {
  padding: 6px 12px;
  border: none;
  background: #4ecdc4;
  color: #000;
  cursor: pointer;
  font-weight: bold;
}

.chat-input-row button:hover {
  background: #45b7aa;
}
```

### 3.3 Client JS (app.js additions)

```js
// --- Chat ---
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const chatSendBtn = document.getElementById('chatSendBtn');

function handleChatMessage(msg) {
  const div = document.createElement('div');
  div.classList.add('msg');
  if (msg.system) {
    div.classList.add('system');
    div.textContent = msg.text;
  } else {
    const sender = document.createElement('span');
    sender.classList.add('sender');
    sender.textContent = msg.from.displayName + ': ';
    div.appendChild(sender);
    div.appendChild(document.createTextNode(msg.text));
  }
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

chatSendBtn.addEventListener('click', () => {
  const text = chatInput.value.trim();
  if (!text) return;
  send({ type: 'chat', text });
  chatInput.value = '';
});

chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') chatSendBtn.click();
});
```

Add to the `handleMessage` switch:
```js
case 'chatMessage':
  handleChatMessage(msg);
  break;
```

### 3.4 Chat panel visibility

- Hidden on the landing screen
- Visible in waiting room and game screens
- Clear messages when player leaves a room

---

## 4. Validation & Safety

| Concern | Mitigation |
|---------|-----------|
| XSS | Client uses `document.createTextNode` (no innerHTML for user text) |
| Message length | Server rejects > 200 chars |
| Spam/flooding | Server-side rate limit: 5 msgs / 10s per player |
| Empty messages | Trimmed; empty after trim is silently dropped |
| Not in room | Server checks room membership before broadcasting |
| Type coercion | Server validates `text` is a string |

---

## 5. Message History

Chat messages are ephemeral (not persisted). Players who join mid-game or reconnect do not see prior messages. This keeps the implementation simple and avoids storage concerns. A future enhancement could buffer the last N messages per room.

---

## 6. Future Enhancements (out of scope)

- Message history buffer (last 50 messages replayed on rejoin)
- Emoji reactions
- Muting/blocking players
- Chat commands (e.g., `/sit-out`, `/stats`)
- Typing indicators
- Collapsible/minimizable chat panel

---

## 7. Implementation Tasks

1. **Create `chat.js` module** — validation, rate limiting, broadcast logic
2. **Wire into server.js** — add `chat` case to `handleMessage`
3. **Add system messages** — integrate `broadcastSystemMessage` into room-manager and game-engine
4. **Client UI** — HTML chat panel, CSS styling, JS message handling
5. **Tests** — unit tests for rate limiting, validation; integration test for end-to-end chat flow

---

## 8. File Changes Summary

| File | Change |
|------|--------|
| `chat.js` (new) | Chat handler module |
| `server.js` | Add `chat` case, import chat module |
| `room-manager.js` | Add system message calls for join/leave/rejoin |
| `game-engine.js` | Add system message calls for game events |
| `public/index.html` | Add chat panel HTML |
| `public/style.css` | Add chat panel styles |
| `public/app.js` | Add chatMessage handler, send logic, DOM setup |
| `test/chat.test.js` (new) | Chat feature tests |
