'use strict';

const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { createRoom, joinRoom, leaveRoom, rejoinRoom, getRoomByPlayerId } = require('./room-manager');
const { startGame, handleAction, handleDisconnect } = require('./game-engine');
const { handleChatMessage } = require('./chat');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

function handleMessage(ws, playerId, msg) {
  switch (msg.type) {
    case 'create':
      createRoom(playerId, ws, msg.displayName || 'Player');
      break;

    case 'join':
      joinRoom(msg.roomCode, playerId, ws, msg.displayName || 'Player');
      break;

    case 'leave': {
      const room = getRoomByPlayerId(playerId);
      if (room) leaveRoom(room.code, playerId);
      break;
    }

    case 'rejoin':
      rejoinRoom(msg.roomCode, msg.playerId || playerId, ws);
      // After rejoin, check if this player needs a turn notification resent
      {
        const room = getRoomByPlayerId(msg.playerId || playerId);
        if (room && room._pendingTurnResend) {
          delete room._pendingTurnResend;
          const { getValidActions, TURN_TIMEOUT_MS } = require('./game-engine');
          const validActions = getValidActions(room);
          ws.send(JSON.stringify({
            type: 'yourTurn',
            validActions,
            timeRemaining: TURN_TIMEOUT_MS / 1000,
          }));
        }
      }
      break;

    case 'start': {
      const room = getRoomByPlayerId(playerId);
      if (!room) {
        ws.send(JSON.stringify({ type: 'error', message: 'Not in a room' }));
        break;
      }
      const player = room.players.find((p) => p.id === playerId);
      if (!player || !player.isCreator) {
        ws.send(JSON.stringify({ type: 'error', message: 'Only the room creator can start the game' }));
        break;
      }
      startGame(room);
      break;
    }

    case 'action': {
      const room = getRoomByPlayerId(playerId);
      if (!room) {
        ws.send(JSON.stringify({ type: 'error', message: 'Not in a room' }));
        break;
      }
      const result = handleAction(room, playerId, msg);
      if (result && result.error) {
        ws.send(JSON.stringify({ type: 'error', message: result.error }));
      }
      break;
    }

    case 'chat': {
      const room = getRoomByPlayerId(playerId);
      if (!room) {
        ws.send(JSON.stringify({ type: 'error', message: 'Not in a room' }));
        break;
      }
      handleChatMessage(room, playerId, msg.text);
      break;
    }

    default:
      ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${msg.type}` }));
      break;
  }
}

function createApp() {
  const app = express();

  // Serve static files from public/
  app.use(express.static(PUBLIC_DIR));

  // Create HTTP server from Express app
  const server = http.createServer(app);

  // Attach WebSocket server
  const wss = new WebSocketServer({ server });
  const clients = new Map();

  wss.on('connection', (ws) => {
    let playerId = crypto.randomUUID();
    clients.set(playerId, ws);

    // Send welcome message
    ws.send(JSON.stringify({ type: 'connected', playerId }));

    ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch (e) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
        return;
      }

      // On rejoin, adopt the old playerId so disconnect tracking works correctly
      if (msg.type === 'rejoin' && msg.playerId && msg.playerId !== playerId) {
        clients.delete(playerId);
        playerId = msg.playerId;
        clients.set(playerId, ws);
      }

      handleMessage(ws, playerId, msg);
    });

    ws.on('close', () => {
      clients.delete(playerId);
      // Handle disconnection
      const room = getRoomByPlayerId(playerId);
      if (room) {
        handleDisconnect(room, playerId);
      }
    });
  });

  return { app, server, wss, clients, handleMessage };
}

if (require.main === module) {
  const { server } = createApp();
  server.listen(PORT, () => {
    console.log(`Poker server listening on http://localhost:${PORT}`);
  });
}

module.exports = { createApp };
