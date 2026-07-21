# Requirements Clarification

Questions and answers to refine the room-based chat feature for the multiplayer poker game.

---

## Q1: What is the scope of chat visibility?

Should chat messages be visible only to players in the same room, or do you also want any of the following?

- **Room-only chat** — all messages go to everyone at the table
- **Private/whisper messages** — players can DM each other within the room
- **Spectator chat** — if spectators are ever added, a separate channel for them

**Answer:** Room-only chat. All messages are broadcast to every player at the table.

---

## Q2: Should chat messages persist, or are they ephemeral?

Options:

- **Ephemeral** — messages only exist in memory; if you refresh the page or reconnect, previous messages are gone
- **Session-persistent** — messages are kept in memory for the duration of the room's lifetime, so reconnecting players see chat history
- **Stored permanently** — messages are saved to disk (like the stats in `data/stats.json`)

**Answer:** Session-persistent. Messages are kept in memory for the room's lifetime. Reconnecting players see the chat history from the current session.

---

## Q3: Should there be any moderation or content filtering?

For example:

- **No moderation** — anything goes, players are trusted
- **Basic profanity filter** — automatically mask common offensive words
- **Rate limiting** — prevent spam (e.g., max N messages per minute)
- **Mute/block** — allow players to mute others in chat

**Answer:** No moderation. Players are trusted.

---

## Q4: Should game events appear in the chat feed?

Some poker apps mix system messages into the chat, such as:

- "Player X folded"
- "Player Y won the pot ($500)"
- "New hand dealt"
- "Player Z joined the room"

Should the chat display these game events inline, or should it be purely player-typed messages?

**Answer:** Yes, game events should appear inline in the chat feed alongside player messages.

---

## Q5: Where should the chat UI be positioned relative to the game?

Options:

- **Side panel** — a dedicated column alongside the poker table (always visible)
- **Bottom panel** — a chat strip below the game area (always visible)
- **Collapsible/toggleable panel** — can be shown or hidden so it doesn't take up space during play
- **Overlay/popup** — a floating chat window on top of the game

**Answer:** Collapsible/toggleable panel. Can be shown or hidden so it doesn't take up space during play.

---

## Q6: Should there be any message length limit?

For example:

- **No limit** — players can send messages of any length
- **Short limit** (e.g., 200 characters) — keeps chat quick and readable, like a poker table chat
- **Moderate limit** (e.g., 500 characters) — allows longer messages but prevents walls of text

**Answer:** No limit. Players can send messages of any length.

---

## Q7: Should the chat show timestamps on messages?

Options:

- **No timestamps** — just player name and message, keeps it clean
- **Relative timestamps** — "2m ago", "just now"
- **Absolute timestamps** — "6:04 PM"

**Answer:** No timestamps. Just player name and message.

---

## Q8: Should there be any notification when the chat panel is collapsed?

For example:

- **Unread badge/counter** — show a number indicating new messages since collapse
- **Brief toast/popup** — flash a snippet of the latest message
- **No notification** — if the panel is collapsed, you just miss messages until you open it

**Answer:** No notification. If the panel is collapsed, messages are missed until the player opens it.

---

## Q9: Which game events should appear in the chat?

You mentioned game events should show inline. Should all of these appear, or just a subset?

- Player joined/left the room
- Game started
- New hand dealt
- Player actions (fold, check, call, raise)
- Phase transitions (flop, turn, river)
- Showdown results (who won, pot amount)
- All-in events

**Answer:** All of them. Every game event listed should appear inline in the chat.

---

## Q10: Should game event messages be visually distinct from player messages?

For example:

- **Same styling** — game events look just like chat messages but from "System" or "Dealer"
- **Different styling** — italicized, different color, or different background to distinguish them from player chat
- **No preference** — up to implementation

**Answer:** Different styling. Game events should be visually distinct from player messages. Implementation will choose appropriate styling (e.g., italicized, muted color, different background).

---

## Q11: Should the chat be available before the game starts (in the lobby/waiting phase)?

Options:

- **Yes** — players can chat as soon as they join the room, even before the game begins
- **No** — chat only becomes active once the game starts

**Answer:** Yes. Players can chat as soon as they join the room, even before the game begins.

---

## Q12: Are there any concerns about the chat being used to share hand information (collusion)?

For example, in some poker games, players could tell each other what cards they have. Do you want any safeguards, or is this a casual/trusted environment where that's not a concern?

**Answer:** Not a concern. This is a casual/trusted environment — no collusion safeguards needed.


