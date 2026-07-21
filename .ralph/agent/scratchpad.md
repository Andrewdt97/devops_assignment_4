# Bug Review: feat: add room-based chat with system messages (175188a)

## Analysis

Reviewed the full diff of commit 175188a which adds:
- `chat.js` module with message validation, rate limiting, broadcast
- System messages in `room-manager.js` (join/leave/reconnect)
- System messages in `game-engine.js` (game start, hand won, showdown, disconnect)
- Chat panel UI in client

## Bugs Found

### Bug 1: Missing system message on waiting-phase disconnect
In `game-engine.js` `handleDisconnect`, when a player disconnects during `'waiting'` phase, 
the player is removed from the array and `broadcastRoomState` is called, but no system 
message is sent. This is inconsistent with `leaveRoom` which does send a system message.

### Bug 2: Memory leak in rateLimitMap (chat.js)
The `rateLimitMap` (Map of playerId -> timestamps[]) never removes entries for players 
who permanently leave. On a long-running server with many transient players, this grows 
unbounded. Should clean up when a player leaves a room.

### Bug 3: Chat input keydown doesn't prevent default or stop propagation
The chat input's Enter key handler calls `sendChatMessage()` but doesn't call 
`e.preventDefault()`. While this doesn't cause visible issues currently (no form submission),
it's defensive to prevent the default so the Enter keystroke doesn't submit forms or 
trigger unintended behavior if the DOM structure changes.

## Plan
Fix all three bugs in the respective files.

## Iteration 2 - Verification

The three bugs identified were already fixed in commit cb36284. Verified:
1. All JS files pass syntax check (node -c)
2. All modules load without errors (no circular dep issues, exports correct)
3. The fixes are correct:
   - Bug 1: `handleDisconnect` now sends system message for waiting-phase disconnects
   - Bug 2: `clearRateLimit` exported and called in both `leaveRoom` and `handleDisconnect`
   - Bug 3: `e.preventDefault()` added to chat input Enter handler

No additional bugs found in secondary review. The code is solid:
- No XSS: client uses textContent/createTextNode
- Rate limiting is correctly implemented with sliding window
- Message validation exists for type, length, empty strings
- System messages are consistent across all state transitions

Ready to emit review.done.

## Iteration 3 - Re-verification for review.done

Received `review.blocked` because previous review.done was missing verification evidence.

Re-verified all fixes from commit cb36284:
1. `node -c` passes on all JS files (chat.js, game-engine.js, room-manager.js, public/app.js, server.js)
2. All modules load without errors (no circular deps, exports correct)
3. Server boots cleanly: "Poker server listening on http://localhost:3000"

Confirmed the 3 bugs are fixed:
- Bug 1: handleDisconnect now sends system message for waiting-phase disconnects (captures name before removal)
- Bug 2: clearRateLimit exported from chat.js, called in leaveRoom and handleDisconnect
- Bug 3: e.preventDefault() added to chat input Enter handler

No additional bugs found. Emitting review.done with proper evidence.
