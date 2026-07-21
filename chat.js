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
    if (sender.ws && sender.ws.readyState === 1) {
      sender.ws.send(JSON.stringify({ type: 'error', message: 'Invalid message' }));
    }
    return;
  }
  const trimmed = text.trim();
  if (trimmed.length === 0) return; // silently ignore empty
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    if (sender.ws && sender.ws.readyState === 1) {
      sender.ws.send(JSON.stringify({
        type: 'error',
        message: `Message too long (max ${MAX_MESSAGE_LENGTH} characters)`,
      }));
    }
    return;
  }

  // Rate limit check
  if (!checkRateLimit(playerId)) {
    if (sender.ws && sender.ws.readyState === 1) {
      sender.ws.send(JSON.stringify({
        type: 'error',
        message: 'Sending messages too fast. Please wait.',
      }));
    }
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

function clearRateLimit(playerId) {
  rateLimitMap.delete(playerId);
}

module.exports = { handleChatMessage, broadcastSystemMessage, clearRateLimit };
