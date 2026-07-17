# Requirements Clarification

This document captures the iterative Q&A process for refining the multiplayer poker game concept.

---

## Q1: Which poker variant(s) should the game support?

For example:
- **Texas Hold'em** (most popular — community cards, 2 hole cards)
- **Omaha** (4 hole cards, must use exactly 2)
- **Five-card draw**
- **Multiple variants** with a lobby selection

Should we focus on one variant to start, or design for multiple from the beginning?

**Answer:** Texas Hold'em only.

---

## Q2: How many players should a single table support?

Standard Texas Hold'em tables typically seat:
- **2 players** (heads-up)
- **6 players** (short-handed)
- **9-10 players** (full ring)

Should the game support a fixed table size, or allow configurable sizes? And do you envision multiple tables running simultaneously (like an online poker room), or a single table at a time?

**Answer:** 6 players per table. The server supports multiple rooms simultaneously, but each browser session is in only one room at a time.

---

## Q3: What kind of stakes/currency system should the game use?

Some options:
- **Play money** — players get free chips, no real value (like a casual/social game)
- **Real money** — actual financial transactions (adds significant legal/regulatory complexity)
- **Tournament style** — players buy in with a fixed amount, play until one player has all the chips
- **Configurable blinds** — room creator sets the blind levels

What's the intended model here? And should players have persistent chip balances across sessions, or does each room start fresh?

**Answer:** Play money — no real currency involved.

---

## Q4: How should players identify themselves and access the game?

Options include:
- **Anonymous/guest** — players just pick a display name when they join, no account needed
- **Simple accounts** — username/password registration with persistent profiles and chip history
- **OAuth/social login** — sign in with Google, GitHub, etc.

And for joining rooms:
- **Room codes** — creator gets a shareable code/link to invite friends (private games)
- **Public lobby** — players browse and join open rooms
- **Both** — rooms can be public or private

What feels right for your use case?

**Answer:** Anonymous/guest — players just pick a display name, no accounts. Rooms are joined via shareable room codes (private games only).

---

## Q5: What should happen when a player disconnects mid-hand?

Common approaches:
- **Auto-fold** — the disconnected player's hand is immediately folded
- **Timer/grace period** — give the player X seconds to reconnect before auto-folding
- **Sit out** — mark the player as sitting out; they post blinds but auto-fold until they return

Also, should a room persist if all players leave, or should it be destroyed? And what happens if the room creator leaves?

**Answer:** Sit out — disconnected players post blinds but auto-fold until they reconnect. If all players leave, the room is destroyed. No special handling if the room creator leaves (game continues normally).

---

## Q6: What "record" should the backend store, and for how long?

You mentioned storing a record. This could mean:
- **Hand history** — full log of every hand played (cards dealt, actions taken, pot sizes, winners)
- **Player stats** — aggregate stats like hands won, biggest pot, etc. (but since there are no accounts, these would be per-session only)
- **Room summary** — just a high-level record of who played and final chip counts

Since players are anonymous guests, long-term player tracking isn't really possible. Should the record be:
- Per-room (stored while room is alive, discarded after)?
- Exportable (players can download their hand history)?
- Persistent on the server for some retention period?

**Answer:** Player stats — aggregate statistics (hands won, biggest pot, etc.). Since players are anonymous/guest, these would be per-session stats visible during the game.

---

## Q7: What actions should players be able to take during a hand?

Standard Texas Hold'em actions are:
- **Fold**, **Check**, **Call**, **Bet**, **Raise**, **All-in**

Beyond the basics, should the game support:
- **Timed turns** — a countdown forcing players to act within X seconds?
- **Pre-action buttons** — "check/fold", "call any" that auto-execute when it's your turn?
- **Chat** — text chat between players at the table?
- **Emotes/reactions** — quick emoji-style reactions?

Which of these (if any) would you like included?

**Answer:** All standard actions (fold, check, call, bet, raise, all-in) with 30-second timed turns. No chat, no emotes/reactions.

---

## Q8: What should the frontend experience look like?

Some considerations:
- **Visual style** — minimalist/clean, realistic casino feel, or retro/pixel art?
- **Animations** — card dealing animations, chip movement, or keep it simple/snappy?
- **Responsiveness** — should it work well on mobile browsers, or desktop-only is fine?
- **Information displayed** — pot size, player chip counts, community cards, current blinds level — anything else you'd want visible?

What's your vision for the look and feel?

**Answer:** Minimalist/clean visual style. No animations. Desktop-only (no mobile support). Display: pot size, player chip counts, community cards, current blinds level — nothing else.

---

## Q9: How should anti-cheating be handled?

You mentioned the backend server should prevent cheating. Some approaches:
- **Server-authoritative game state** — all card dealing, hand evaluation, and pot calculations happen server-side; clients only see their own hole cards (this is the baseline)
- **Action validation** — server rejects invalid actions (e.g., betting more than your stack, acting out of turn)
- **Rate limiting** — prevent automated/bot play by limiting action speed
- **Collusion detection** — tracking suspicious patterns between players (more complex)

The server-authoritative model with action validation is standard and prevents most cheating. Should we go beyond that, or is that sufficient?

**Answer:** Server-authoritative game state (all dealing, hand evaluation, pot calculations server-side; clients only see their own hole cards) plus action validation (reject invalid actions). No rate limiting or collusion detection.

---

## Q10: What are your deployment and infrastructure preferences?

Some questions:
- **Hosting** — self-hosted (e.g., a single VPS), cloud provider (AWS, GCP, etc.), or containerized (Docker)?
- **Database** — any preference? (SQL like PostgreSQL, NoSQL like MongoDB, or even in-memory like Redis for ephemeral room state?)
- **Scalability** — is this for a small group of friends, or should it handle many concurrent rooms/players?
- **CI/CD** — any preference for build/deploy pipelines, or keep it simple with manual deploys?

**Answer:** Self-hosted on a laptop. SQLite database. Small scale (few concurrent rooms/players). Manual deployments, no CI/CD pipeline.

---

## Q11: How should a game session flow from start to finish?

Let me confirm the expected lifecycle:
1. A player creates a room and gets a room code
2. Other players join using the room code and pick a display name
3. The game starts — when? Options:
   - **Creator starts it manually** once enough players have joined
   - **Auto-start** when a minimum number of players join (e.g., 2)
4. Hands are played continuously until...?
   - Players leave voluntarily
   - A set number of hands are played
   - Blinds escalate until one player has all the chips (tournament-style)
5. Does the room end, or do players keep playing indefinitely?

How do you envision the start and end conditions?

**Answer:** Creator manually starts the game. Blinds escalate over time (tournament-style). The room continues until one player has all the chips (winner) or all players quit.

---

## Q12: How should the blind escalation work?

A few options:
- **Time-based** — blinds increase every X minutes (e.g., every 5 minutes)
- **Hand-based** — blinds increase every X hands dealt
- **Configurable** — room creator sets the escalation interval and starting blinds

And for the structure:
- **Fixed schedule** — e.g., 10/20 → 20/40 → 50/100 → 100/200 (doubling)
- **Configurable schedule** — creator picks starting blinds and escalation rate

Should the room creator configure these, or use a sensible default?

**Answer:** Hand-based blind escalation. Use a sensible default schedule (e.g., blinds double every X hands).

---

## Q13: How much should the room creator be able to configure?

Based on what we've discussed, the creator sets up a room. Should they be able to configure any of the following, or just use defaults?

- **Starting chip count** per player (e.g., 1000, 5000, 10000)
- **Starting blind level** (e.g., 10/20)
- **Hands per blind level** (e.g., every 10 hands)
- **Max players** (fixed at 6, or allow fewer?)

Or would you prefer all of these are hardcoded defaults to keep the UI simple?

**Answer:** All hardcoded defaults — no configuration options for the room creator. Keep the UI simple.

---

## Q14: What happens when a player is eliminated (loses all chips)?

Options:
- **Spectator mode** — eliminated players can watch the rest of the game
- **Kicked from room** — eliminated players are removed and returned to a landing page
- **Re-buy option** — eliminated players can buy back in (less tournament-like)

Which do you prefer?

**Answer:** Spectator mode — eliminated players can continue watching the game until it ends.

---

## Q15: Are there any other features or constraints I haven't asked about?

Here's a quick summary of what we've established so far:
- Texas Hold'em, 6-player tables, multiple rooms via room codes
- Anonymous guests (display name only), play money, tournament-style
- 30-second turn timer, all standard actions, no chat/emotes
- Minimalist desktop-only UI showing pot, chips, community cards, blinds
- Server-authoritative with action validation
- SQLite, self-hosted, small scale
- Hardcoded defaults, hand-based blind escalation
- Spectator mode for eliminated players
- Room ends when one player wins or all leave

Anything else you'd like to add? For example:
- Sound effects?
- Showdown behavior (auto-show cards, or option to muck)?
- Side pots (when a player goes all-in with less than others)?
- Any specific tech you want to avoid?

Or does this feel complete enough to move forward?

**Answer:** Nothing else to add. Requirements clarification is complete. Showdown behavior, side pots, and sound effects will use standard/sensible defaults (auto-show at showdown, proper side pot handling, no sound effects).

