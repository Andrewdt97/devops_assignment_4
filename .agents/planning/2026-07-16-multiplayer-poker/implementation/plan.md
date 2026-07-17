# Implementation Plan

## Checklist

- [ ] Step 1: Project setup + HTTP static server
- [ ] Step 2: WebSocket server + connection management
- [ ] Step 3: Room Manager — create and join rooms
- [ ] Step 4: Game Engine — dealing and blind posting
- [ ] Step 5: Game Engine — betting round logic
- [ ] Step 6: Game Engine — phase transitions (flop, turn, river)
- [ ] Step 7: Hand Evaluator
- [ ] Step 8: Showdown + pot awarding
- [ ] Step 9: Side pots
- [ ] Step 10: Turn timer + auto-fold
- [ ] Step 11: Multi-hand flow — dealer rotation, blind escalation, elimination
- [ ] Step 12: Disconnection handling + reconnection
- [ ] Step 13: SQLite stats persistence
- [ ] Step 14: Client UI — table layout and game display
- [ ] Step 15: Client UI — player actions and interaction
- [ ] Step 16: End-to-end integration + polish

---

## Step 1: Project setup + HTTP static server

**Objective:** Bootstrap the project and serve a static "hello world" page over HTTP.

**Implementation guidance:**
- Initialize `package.json` with `name`, `version`, and `scripts.start`
- Install `ws` and `better-sqlite3` (the only two dependencies)
- Create `server.js` with Node's built-in `http` module
- Implement a static file handler (~15 lines) that serves files from `public/`
- Create `public/index.html` with a placeholder heading ("Poker Game")
- Create `public/style.css` (empty for now)
- Create `public/app.js` (empty for now)
- Handle 404 for missing files

**Test requirements:**
- Test that the server starts and listens on port 3000
- Test that requesting `/` serves `index.html`
- Test that requesting `/style.css` serves the CSS file
- Test that requesting `/nonexistent` returns 404
- Use `node:test` + `http.get()` for these tests

**Integration with previous work:** This is the starting point — no prior steps.

**Demo:** Run `node server.js`, open `http://localhost:3000` in a browser, see the placeholder page.

---

## Step 2: WebSocket server + connection management

**Objective:** Accept WebSocket connections alongside HTTP, parse JSON messages, and send responses.

**Implementation guidance:**
- Attach a `WebSocketServer` to the existing `http.Server` in `server.js`
- On connection, assign a UUID (`crypto.randomUUID()`) as the player ID
- Send a welcome message: `{ type: "connected", playerId }`
- Parse incoming messages as JSON; on parse error, send `{ type: "error", message: "Invalid message format" }`
- Create a message router (switch on `msg.type`) that will be extended in later steps
- For now, echo back unrecognized message types as errors

**Test requirements:**
- Test that a WebSocket connection receives a `connected` message with a `playerId`
- Test that sending valid JSON gets a response
- Test that sending invalid JSON returns an error message
- Test multiple simultaneous connections get unique playerIds
- Use `ws` client in tests to connect to the test server

**Integration with previous work:** Builds on Step 1's `http.Server` — the WebSocket server attaches to the same port.

**Demo:** Run server, open browser console, execute `new WebSocket('ws://localhost:3000')` — see the `connected` message logged.

---

## Step 3: Room Manager — create and join rooms

**Objective:** Players can create rooms (getting a code) and join rooms (by code + display name).

**Implementation guidance:**
- Create `room-manager.js` exporting: `createRoom(playerId, ws, displayName)`, `joinRoom(roomCode, playerId, ws, displayName)`, `leaveRoom(roomCode, playerId)`, `getRoom(roomCode)`
- Room codes: 6-character uppercase alphanumeric, randomly generated
- Room state object structure as defined in the design (start with `phase: 'waiting'`)
- Wire message types `create`, `join`, `leave` into the server's message router
- On `create`: create room, add creator as first player, send `{ type: "roomCreated", roomCode }`
- On `join`: validate room exists, not full (6), game not started, name not taken; add player; broadcast updated room state to all players
- On `leave`: remove player from room; if room is empty, destroy it
- Broadcast a `roomState` message to all clients in the room after any change

**Test requirements:**
- Test room creation returns a 6-character code
- Test joining a valid room succeeds and all players receive roomState
- Test joining a non-existent room returns an error
- Test joining a full room (6 players) returns an error
- Test duplicate display name returns an error
- Test leaving destroys an empty room
- Test that creator is flagged as `isCreator`

**Integration with previous work:** Message router from Step 2 dispatches to Room Manager functions. Room state uses the data model from the design.

**Demo:** Open two browser tabs. Tab 1 creates a room (gets a code). Tab 2 joins with that code. Both see a "waiting room" player list update in real-time.

---

## Step 4: Game Engine — dealing and blind posting

**Objective:** Creator can start the game. Cards are dealt, blinds are posted, and the first betting round begins.

**Implementation guidance:**
- Create `game-engine.js` with `startGame(room)`, `dealHand(room)`
- Implement a deck: array of 52 card objects `{ rank: 2-14, suit: 'h'|'d'|'c'|'s' }`, shuffled with Fisher-Yates
- `startGame`: validate 2+ players, set `phase` to `dealing`, call `dealHand`
- `dealHand`: shuffle deck, deal 2 cards to each player, post small/big blinds (deduct chips, set `currentBet`), set `activePlayerIndex` to first-to-act (left of big blind), set phase to `preflop`
- Wire `start` message type — only the creator can trigger it
- Broadcast filtered `roomState` (each player sees only their own cards)
- Implement the state-filtering function: replace other players' `cards` with `null` in the broadcast

**Test requirements:**
- Test that starting a game with 1 player fails
- Test that starting a game deals 2 cards to each player
- Test that small and big blinds are correctly deducted
- Test that `activePlayerIndex` is set to the correct position (left of big blind)
- Test that deck has 52 unique cards after creation
- Test Fisher-Yates shuffle produces a randomized deck
- Test state filtering hides other players' cards

**Integration with previous work:** `startGame` is triggered via the `start` message type through the Room Manager. The room state object from Step 3 is extended with game fields (deck, communityCards, pots, etc.).

**Demo:** Create a room with 3 players. Creator clicks "Start". All players see their own 2 hole cards, the pot shows the blind amounts, and the UI indicates whose turn it is.

---

## Step 5: Game Engine — betting round logic

**Objective:** Players can fold, check, call, bet, raise, and go all-in during their turn.

**Implementation guidance:**
- Add `handleAction(room, playerId, action)` to `game-engine.js`
- Implement `getValidActions(room)`: returns array of valid actions for the active player based on game state
- Action handlers:
  - `fold`: mark player as folded, advance turn
  - `check`: valid only if currentBet equals player's currentBet, advance turn
  - `call`: match the currentBet, advance turn
  - `bet`: valid only if no bet yet this round, set currentBet, advance turn
  - `raise`: increase currentBet, reset "last aggressor" tracking, advance turn
  - `allIn`: put all remaining chips in, mark player allIn
- Advance turn: move `activePlayerIndex` to next non-folded, non-allIn player
- Detect betting round complete: all active players have acted and bets are matched
- Wire `action` message type: validate it's the player's turn, validate action is legal, apply, broadcast

**Test requirements:**
- Test that acting out of turn returns an error
- Test that invalid actions (e.g., check when there's a bet) return an error
- Test fold marks player as folded and advances turn
- Test call deducts correct chips
- Test bet/raise sets new currentBet and deducts chips
- Test all-in puts entire stack at risk
- Test raise amount validation (minimum raise = previous raise size)
- Test betting round detection (all players acted + bets matched)
- Test that only valid actions are offered to each player

**Integration with previous work:** Extends the game engine from Step 4. The message router dispatches `action` messages. After each action, filtered roomState is broadcast to all players.

**Demo:** Start a 3-player game. Players take turns folding, calling, and raising. The pot increases, chip counts decrease, and the active player indicator moves correctly.

---

## Step 6: Game Engine — phase transitions (flop, turn, river)

**Objective:** When a betting round completes, community cards are dealt and the next phase begins.

**Implementation guidance:**
- Implement `advancePhase(room)`:
  - `preflop` → `flop`: deal 3 community cards, reset player bets, start new betting round
  - `flop` → `turn`: deal 1 community card, reset player bets, start new betting round
  - `turn` → `river`: deal 1 community card, reset player bets, start new betting round
  - `river` → `showdown`: proceed to showdown (Step 8)
- "Start new betting round": reset `currentBet` to 0, reset each player's `currentBet` to 0, set active player to first non-folded player left of dealer
- If only one player remains (all others folded), skip to pot award immediately
- If all remaining players are all-in, deal remaining community cards immediately and proceed to showdown

**Test requirements:**
- Test preflop → flop deals exactly 3 community cards
- Test flop → turn deals exactly 1 more community card (total 4)
- Test turn → river deals exactly 1 more community card (total 5)
- Test player bets are reset between rounds
- Test first-to-act is correct for post-flop rounds (first active player left of dealer)
- Test last-player-standing wins pot without showdown
- Test all-in scenario deals remaining community cards immediately

**Integration with previous work:** Called by Step 5's betting round completion detection. Uses the deck from Step 4. Showdown triggers Step 8 (not yet implemented — for now, log "showdown" and award pot to first remaining player as placeholder).

**Demo:** Play through a full hand: preflop betting → flop appears → more betting → turn appears → more betting → river appears → final betting round completes.

---

## Step 7: Hand Evaluator

**Objective:** Implement a complete Texas Hold'em hand evaluator that scores any 5-7 card hand.

**Implementation guidance:**
- Create `hand-evaluator.js` exporting: `evaluateHand(cards)`, `compareHands(a, b)`, `bestHand(sevenCards)`
- Card input: `{ rank: 2-14, suit: 'h'|'d'|'c'|'s' }`
- Scoring system: encode hand rank (0-9) in high bits + kickers in lower bits so numeric comparison works
  - Example: `rank * 10^10 + kicker1 * 10^8 + kicker2 * 10^6 + ...`
- Check hands top-down: straight flush → four of a kind → full house → flush → straight → three of a kind → two pair → one pair → high card
- `bestHand(sevenCards)`: generate all C(7,5)=21 combinations, evaluate each, return the highest score
- Handle edge cases: ace-low straight (A-2-3-4-5), ace-high straight (10-J-Q-K-A), kicker ordering

**Test requirements:**
- Test each hand rank is correctly identified (one test per rank minimum)
- Test hand comparison: flush beats straight, pair of aces beats pair of kings
- Test kicker comparison: pair of aces with king kicker beats pair of aces with queen kicker
- Test ace-low straight (wheel) is correctly identified and ranked below 6-high straight
- Test royal flush is correctly identified
- Test `bestHand` selects the best 5 from 7 cards
- Test tie detection (equal scores)
- Test at least 20-30 known hand scenarios

**Integration with previous work:** Will be called by Step 8's showdown logic. This step is independently testable — pure functions with no dependencies on game state.

**Demo:** Run the test suite — all hand evaluation tests pass. Can also demo via a REPL: `evaluateHand([...cards])` returns correct rankings.

---

## Step 8: Showdown + pot awarding

**Objective:** At showdown, evaluate all remaining players' hands, determine winner(s), award pot, and reveal cards.

**Implementation guidance:**
- Implement `resolveShowdown(room)` in `game-engine.js`:
  1. For each non-folded player, call `bestHand(player.cards + communityCards)`
  2. Compare all scores to find winner(s) (may be a tie → split pot)
  3. Award pot to winner (or split equally, with remainder to first position left of dealer)
  4. Reveal all remaining players' hole cards in the broadcast
- Update the `roomState` broadcast at showdown to include all hands and a `results` field:
  ```
  { type: "showdown", hands: [...], winner: "Alice", potWon: 300 }
  ```
- After showdown completes, transition to next hand (or gameOver if one player remains) — delegate to Step 11

**Test requirements:**
- Test that the correct winner is identified in a simple showdown (one clear winner)
- Test split pot: two players with equal hands each get half
- Test that all remaining players' cards are revealed at showdown
- Test pot is correctly transferred to winner's chips
- Test odd chip in split goes to correct player (first left of dealer)
- Test showdown after all-in with fewer community cards still evaluates correctly

**Integration with previous work:** Called by Step 6 when river betting completes (or when all-in and no more action). Uses the hand evaluator from Step 7. After pot award, will trigger Step 11's multi-hand flow.

**Demo:** Play a hand to showdown. See all players' cards revealed, the winning hand highlighted, and chips correctly transferred to the winner.

---

## Step 9: Side pots

**Objective:** Correctly handle side pots when players go all-in for different amounts.

**Implementation guidance:**
- Refactor pot management in `game-engine.js`:
  - Track pots as an array: `[{ amount, eligible: [playerIds] }]`
  - When a player goes all-in for less than the current bet, create a side pot
  - Implementation: sort all-in amounts, split the pot at each threshold
- Implement `calculatePots(room)`: called before showdown, restructures the pot array based on all-in amounts
- Update `resolveShowdown` to award each pot independently to the best eligible hand
- A player can only win from pots they're eligible for

**Test requirements:**
- Test 3-player scenario: player A all-in for 100, player B all-in for 300, player C calls 300
  - Main pot: 300 (100 from each, all eligible)
  - Side pot: 400 (200 from B + 200 from C, only B and C eligible)
- Test the shortest-stack player wins: they get the main pot, side pot goes to second-best hand among eligible
- Test multiple side pots (3+ all-in amounts)
- Test that folded players are not eligible for any pot
- Test split of a side pot between tied eligible players

**Integration with previous work:** Extends Step 8's showdown logic and Step 5's all-in handling. The pot structure from Step 4 is now an array instead of a single value.

**Demo:** Three-player game where one player goes all-in short. At showdown, pots are correctly split — the short-stack player can only win the main pot.

---

## Step 10: Turn timer + auto-fold

**Objective:** Enforce the 30-second turn timer; auto-fold players who don't act in time.

**Implementation guidance:**
- When it becomes a player's turn, start a `setTimeout(30000)` stored in `room.timer`
- When the player acts, `clearTimeout(room.timer)`
- On timeout: automatically fold the player, advance the turn
- Send `timeRemaining` in the `yourTurn` message so the client can display a countdown
- If the room is in `waiting` phase, no timer runs

**Test requirements:**
- Test that a timer is started when a player's turn begins
- Test that acting clears the timer (no auto-fold)
- Test that timeout triggers an auto-fold
- Test that after auto-fold, the game advances correctly
- Test timer does not run during `waiting` phase
- Use fake timers (or short timeouts) in tests to avoid 30-second waits

**Integration with previous work:** Wraps around Step 5's action handling. The timer is set after each call to advance turn. `clearTimeout` is called at the start of `handleAction`.

**Demo:** Start a game but don't act. After 30 seconds, the player auto-folds and the game advances to the next player.

---

## Step 11: Multi-hand flow — dealer rotation, blind escalation, elimination

**Objective:** After each hand, rotate the dealer, escalate blinds per schedule, eliminate busted players, and detect game over.

**Implementation guidance:**
- After showdown (or last-player-standing), implement `startNextHand(room)`:
  1. Check for eliminated players (chips === 0) → move to `spectators` array
  2. If only 1 player with chips remains → set `phase: 'gameOver'`, broadcast `gameOver` message
  3. Rotate `dealerIndex` to next active player
  4. Increment `handNumber` and `handsThisLevel`
  5. If `handsThisLevel >= HANDS_PER_LEVEL` (10): increment `blindLevel`, reset `handsThisLevel`
  6. Call `dealHand(room)` to start the next hand
- Blind level calculation: `small = STARTING_SMALL * 2^level`, `big = small * 2`
- Handle edge case: if big blind exceeds a player's stack, they go all-in for the blind
- Broadcast final stats on `gameOver`: player rankings (elimination order), session stats

**Test requirements:**
- Test dealer rotates clockwise after each hand
- Test eliminated player (0 chips) is moved to spectators
- Test game over when one player remains
- Test blind escalation after 10 hands
- Test blind level math: level 0=10/20, level 1=20/40, level 2=40/80, etc.
- Test player forced all-in if blind exceeds their stack
- Test spectator receives game state but cannot act
- Test elimination order is tracked correctly

**Integration with previous work:** Called after Step 8's showdown resolution. Connects back to Step 4's `dealHand`. Spectator mode ties into Step 3's room state broadcast (spectators receive state but have no valid actions).

**Demo:** Play multiple hands. Watch the dealer button rotate, blinds increase after 10 hands, and a player get eliminated into spectator mode. Play until one player wins and see the final results.

---

## Step 12: Disconnection handling + reconnection

**Objective:** Handle players disconnecting mid-game and reconnecting to their seat.

**Implementation guidance:**
- On WebSocket `close` event:
  - If in `waiting` phase: remove player from room (same as leave)
  - If game is in progress: set `player.sittingOut = true`, set `player.ws = null`
  - If it's the disconnected player's turn: auto-fold, advance turn
- On reconnection (client sends `{ type: "rejoin", roomCode, playerId }`):
  - Find player by `playerId` in the room
  - Reattach the new WebSocket to the player object
  - Set `player.sittingOut = false`
  - Send current room state immediately
- Sitting out behavior: player auto-folds every hand but still posts blinds (chips deducted)
- Client-side: on `onclose`, attempt reconnection with stored `playerId` after a short delay

**Test requirements:**
- Test disconnect during waiting phase removes player
- Test disconnect during game marks player as sittingOut
- Test disconnected player on their turn auto-folds
- Test reconnection restores the player's WebSocket and sittingOut flag
- Test sitting-out player posts blinds and auto-folds
- Test invalid playerId on rejoin returns error
- Test all-disconnect destroys room (after 5 second delay)

**Integration with previous work:** Hooks into WebSocket `close` events from Step 2. Affects turn advancement from Step 5 and blind posting from Step 4/11. Reconnection uses the `playerId` established in Step 2.

**Demo:** In a 3-player game, close one browser tab mid-hand. The game continues (that player auto-folds). Re-open the tab, rejoin with the player ID — seat is restored with current state.

---

## Step 13: SQLite stats persistence

**Objective:** Record per-session player statistics to SQLite.

**Implementation guidance:**
- Create `db.js`:
  - Open/create database at `./data/poker.db`
  - Enable WAL mode
  - Create tables if not exist (sessions, player_stats)
  - Export prepared statements: `insertSession`, `insertPlayer`, `incrementHands`, `recordWin`, `updatePeakChips`, `setFinalPosition`, `endSession`, `getSessionStats`
- Wire into game engine:
  - On game start: `insertSession` + `insertPlayer` for each player
  - On hand end: `incrementHands` for all participants, `recordWin` for winner, `updatePeakChips` for any player at new peak
  - On elimination: `setFinalPosition` (last eliminated = position 2, etc.)
  - On game over: `endSession` with winner name, query and broadcast final stats
- Stats sent to clients on `gameOver`: each player's hands played, hands won, biggest pot, peak chips, final position

**Test requirements:**
- Test database and tables are created on startup
- Test session insertion and retrieval
- Test player stats are incremented correctly after hand end
- Test peak chips is correctly tracked (only updates if current > stored)
- Test final position recording on elimination
- Test full session stats retrieval returns correct values
- Test that DB errors don't crash the game (graceful fallback)

**Integration with previous work:** Called from game engine (Steps 4, 8, 11). `sessionId` is stored in the room state object. The `gameOver` broadcast from Step 11 now includes stats from the database.

**Demo:** Play a full game to completion. After the winner is declared, see final stats displayed: hands played, hands won, biggest pot, peak chips, and final positions for all players.

---

## Step 14: Client UI — table layout and game display

**Objective:** Build the HTML/CSS/JS to display the poker table, players, community cards, and game info.

**Implementation guidance:**
- `public/index.html`:
  - Landing screen: display name input + create/join room buttons + room code input
  - Game screen: table layout with 6 player seats arranged in an oval
  - Each seat shows: name, chip count, current bet, fold/all-in/sitting-out status, dealer button indicator
  - Center area: community cards, pot total, blind level
  - Bottom: player's own hole cards (larger, highlighted)
- `public/style.css`:
  - Minimalist design — muted colors, clean typography
  - Desktop-only layout (min-width assumption, no responsive breakpoints)
  - Card display: simple rectangles with rank/suit text
  - Active player highlighted with border or subtle glow
- `public/app.js`:
  - Connect to WebSocket on page load
  - Render functions: `renderLanding()`, `renderTable(state)`, `renderPlayerSeat(player)`, `renderCommunityCards(cards)`, `renderPot(amount)`
  - On incoming `roomState`: re-render the entire table (simple full re-render, no diffing)
  - Show/hide screens based on game phase

**Test requirements:**
- Test that landing screen displays correctly with all input fields and buttons
- Test that game screen renders correct number of player seats
- Test that community cards display updates with each phase
- Test that only the current player's hole cards are visible
- Test that eliminated/spectating players see a "Spectating" indicator
- Manual testing: visual inspection in browser

**Integration with previous work:** Consumes the `roomState` messages defined in Steps 3-6. The WebSocket connection and message format from Step 2 drives all UI updates.

**Demo:** Open the browser, create/join a room. See a proper poker table layout with player names, chip counts, and a clean visual presentation. As the game progresses, community cards appear and player states update in real-time.

---

## Step 15: Client UI — player actions and interaction

**Objective:** Players can interact with the game: create rooms, join rooms, and take actions during their turn.

**Implementation guidance:**
- Landing screen interactions:
  - "Create Room" button → send `{ type: "create", displayName }`
  - "Join Room" button → send `{ type: "join", roomCode, displayName }`
  - Show room code after creation (with copy-to-clipboard)
  - "Start Game" button (visible only to creator when 2+ players joined)
- Game action UI:
  - Action buttons appear only on the player's turn (hidden otherwise)
  - Show only valid actions (received from server's `yourTurn` message)
  - Fold, Check, Call buttons: single click sends action
  - Bet/Raise: show a chip amount input (slider or text field) + confirm button
  - All-in button: single click
  - Countdown display: 30-second timer bar or number, synced to server's `timeRemaining`
- Error handling:
  - Display server error messages (invalid room code, room full, etc.) as brief notifications
  - Disable action buttons after sending an action (prevent double-click)
- Game over screen:
  - Show winner announcement
  - Display final stats table (from `gameOver` message)
  - "Leave" button to return to landing screen

**Test requirements:**
- Test create room flow: enter name → click create → see room code
- Test join room flow: enter name + code → click join → see waiting room
- Test action buttons only appear on player's turn
- Test bet/raise input validation (min raise, max stack)
- Test countdown timer decreases visually
- Test game over screen displays correct winner and stats
- Test error messages display and dismiss
- Manual testing: play a full game in the browser

**Integration with previous work:** Sends messages defined in the protocol (Steps 2-3). Reacts to `yourTurn`, `roomState`, `error`, and `gameOver` messages. The action buttons use `getValidActions` result from the server.

**Demo:** Play a full poker game entirely through the UI: create room, share code, join from another tab, start game, take turns betting/folding/raising, play to completion, see the winner screen with stats.

---

## Step 16: End-to-end integration + polish

**Objective:** Verify the entire system works together, fix edge cases, and clean up.

**Implementation guidance:**
- Run a full integration test: create room → join 3-4 players → play through multiple hands → eliminate players → declare winner → verify stats
- Fix any bugs discovered during full play-throughs
- Edge cases to verify:
  - Heads-up play (2 players: dealer is small blind, posts first, acts first preflop)
  - All players fold to big blind (big blind wins uncontested)
  - All-in on first action (immediate side pot)
  - Blind exceeds player's stack (forced all-in for blind)
  - Reconnection mid-hand and mid-betting-round
  - Multiple disconnections (game continues with sitting-out players until all disconnect)
- Polish:
  - Add a `README.md` with setup/run instructions
  - Verify `package.json` scripts work (`npm start`)
  - Ensure `data/` directory is created automatically if missing
  - Add basic error logging to server console

**Test requirements:**
- Full integration test: automated 4-player game from start to finish via WebSocket clients
- Heads-up blind posting and position test
- Stress test: rapid actions, immediate disconnects, rejoins
- Verify SQLite contains correct final stats after a completed game
- Test server gracefully handles unknown message types
- Test server startup when `data/poker.db` doesn't exist yet

**Integration with previous work:** This step touches all previous steps — it's the validation that everything works together as a cohesive system.

**Demo:** Full poker night experience: start the server, open 4 browser tabs, play a complete tournament from first hand to final winner, with realistic player actions including folds, raises, all-ins, and eliminations. Final stats are displayed and persisted in SQLite.

---

## Implementation Notes

- **Order matters:** Steps 1-6 build the core game loop incrementally. Step 7 (hand evaluator) can be developed in parallel since it's a pure function with no dependencies. Steps 14-15 (client UI) could also be started earlier if desired, but the demo experience improves with backend features in place.
- **Testing throughout:** Each step includes its own tests. Run the full test suite after each step to catch regressions.
- **Placeholder pattern:** Steps may use placeholder logic that gets replaced later (e.g., Step 6 has a placeholder showdown before Step 7-8 implement real evaluation). This is intentional to keep each step demoable.
- **Single `node:test` runner:** All tests use Node's built-in test runner. Run with `node --test test/`.
