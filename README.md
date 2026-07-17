# Multiplayer Poker

A real-time multiplayer Texas Hold'em poker game built with Node.js, Express, and WebSockets.

## Features

- Create and join rooms with a 6-character room code
- 2–8 players per table
- Full Texas Hold'em rules: preflop, flop, turn, river, showdown
- Side pots and all-in handling
- Automatic blind progression
- Player disconnection/reconnection support
- Persistent game stats (hands played, wins, biggest pot, peak chips)

## Prerequisites

- Node.js 20+

## Setup

```bash
npm install
```

## Running

```bash
npm start
```

The server starts on `http://localhost:3000` (override with the `PORT` environment variable).

## How to Play

1. Open `http://localhost:3000` in your browser.
2. Enter a display name and click **Create Room** to start a new table.
3. Share the 6-character room code with friends.
4. Other players open the same URL, enter their name and the room code, then click **Join Room**.
5. The room creator clicks **Start Game** once 2–8 players have joined.
6. Play proceeds automatically through betting rounds. Use the action buttons to fold, check, call, or raise.

## Project Structure

```
server.js          – Express HTTP server + WebSocket handling
room-manager.js    – Room creation, joining, leaving, reconnection
game-engine.js     – Full game loop: dealing, betting, phases, showdown, side pots
hand-evaluator.js  – 5/7-card hand evaluation and comparison
db.js              – Stats persistence (JSON file in data/)
public/
  index.html       – Game UI
  style.css        – Styling
  app.js           – Client-side WebSocket logic and rendering
```

## Stats Persistence

Game statistics are written to `data/stats.json` (created automatically on first game). Stats include session history, per-player hands played/won, biggest pots, and final positions.

## Environment Variables

| Variable | Default | Description          |
|----------|---------|----------------------|
| `PORT`   | `3000`  | HTTP server port     |

## License

ISC
