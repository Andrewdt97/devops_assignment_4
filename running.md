# Running the Poker Server

This guide covers starting the server and connecting to it, either locally or from other devices on your network.

## Prerequisites

- Node.js 20+ (see `.nvmrc`)

## 1. Install dependencies

```bash
npm install
```

## 2. Start the server

```bash
npm start
```

This runs `node server.js`, which starts an Express + WebSocket server on port `3000` by default. You should see:

```
Poker server listening on http://localhost:3000
```

### Custom port

Override the port with the `PORT` environment variable:

```bash
PORT=8080 npm start
```

## 3. Connect to the server

### From the same machine

Open a browser and go to:

```
http://localhost:3000
```

### From other devices on the same network

Other players can connect over LAN using your machine's local IP address instead of `localhost`.

1. Find your local IP:
   - macOS: `ipconfig getifaddr en0` (or `en1` for Wi-Fi, depending on your setup)
2. Have other players open:

   ```
   http://<your-local-ip>:3000
   ```

   For example: `http://192.168.1.42:3000`

Make sure your machine's firewall allows incoming connections on the port you're using.

## 4. Play

1. Enter a display name and click **Create Room** to start a new table, or enter a room code and click **Join Room** to join an existing one.
2. Share the 6-character room code with other players so they can join.
3. Once 2–8 players have joined, the room creator clicks **Start Game**.
4. Betting rounds proceed automatically; use the action buttons (fold, check, call, raise) on your turn.

## Stopping the server

Press `Ctrl+C` in the terminal where the server is running.

## Troubleshooting

- **Port already in use**: another process is using port 3000. Either stop it or start the poker server on a different port with `PORT=<other-port> npm start`.
- **Other players can't connect**: double check they're on the same network and using your machine's LAN IP (not `localhost`), and that your firewall isn't blocking the port.
- **Stats not saving**: game stats are written to `data/stats.json`, created automatically on the first completed game. Ensure the process has write permission to the `data/` directory.
