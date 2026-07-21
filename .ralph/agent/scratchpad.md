# Chat Feature Design — Scratchpad

## Objective
Design a live, room-based chat for this poker game.

## Understanding
- The game uses Express + ws (WebSocket) for real-time communication
- Players are organized into rooms (room-manager.js)
- All messages flow through a central `handleMessage(ws, playerId, msg)` switch in server.js
- The client is a vanilla JS SPA (public/app.js) with screen-based UI
- Room state is broadcast to all players via `broadcastRoomState`
- Messages are simple JSON `{ type: ..., ... }`

## Design Approach
The chat feature should:
1. Leverage the existing WebSocket connection (no new transport)
2. Be scoped to rooms — messages only reach players/spectators in the same room
3. Be minimal — integrate cleanly with the existing code patterns
4. Support system messages (player joined/left, game events) alongside user messages
5. Include basic safety (message length limits, rate limiting, sanitization)

## Plan
1. Write a design document (`.ralph/agent/chat-design.md`) covering:
   - Protocol (message types, payloads)
   - Server handling (new `chat` message type in handleMessage)
   - Client UI (chat panel, input, message rendering)
   - Rate limiting & validation
   - System messages
2. Create implementation tasks for future iterations
