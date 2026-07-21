'use strict';

const rooms = new Map();
const { broadcastSystemMessage } = require('./chat');

function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  // Ensure uniqueness
  if (rooms.has(code)) return generateRoomCode();
  return code;
}

function createRoom(playerId, ws, displayName) {
  const roomCode = generateRoomCode();
  const room = {
    code: roomCode,
    phase: 'waiting',
    players: [
      {
        id: playerId,
        ws,
        displayName,
        chips: 1000,
        cards: null,
        currentBet: 0,
        folded: false,
        allIn: false,
        sittingOut: false,
        isCreator: true,
      },
    ],
    spectators: [],
    deck: [],
    communityCards: [],
    pots: [{ amount: 0, eligible: [] }],
    dealerIndex: 0,
    activePlayerIndex: -1,
    currentBet: 0,
    blindLevel: 0,
    handNumber: 0,
    handsThisLevel: 0,
    timer: null,
    sessionId: null,
  };
  rooms.set(roomCode, room);
  ws.send(JSON.stringify({ type: 'roomCreated', roomCode }));
  broadcastRoomState(room);
  return room;
}

function joinRoom(roomCode, playerId, ws, displayName) {
  const room = rooms.get(roomCode);
  if (!room) {
    ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
    return null;
  }
  if (room.phase !== 'waiting') {
    ws.send(JSON.stringify({ type: 'error', message: 'Game already in progress' }));
    return null;
  }
  if (room.players.length >= 8) {
    ws.send(JSON.stringify({ type: 'error', message: 'Room is full' }));
    return null;
  }
  const nameTaken = room.players.some((p) => p.displayName === displayName);
  if (nameTaken) {
    ws.send(JSON.stringify({ type: 'error', message: 'Display name already taken' }));
    return null;
  }

  room.players.push({
    id: playerId,
    ws,
    displayName,
    chips: 1000,
    cards: null,
    currentBet: 0,
    folded: false,
    allIn: false,
    sittingOut: false,
    isCreator: false,
  });

  broadcastSystemMessage(room, `${displayName} joined the room`);
  broadcastRoomState(room);
  return room;
}

function leaveRoom(roomCode, playerId) {
  const room = rooms.get(roomCode);
  if (!room) return;

  const leavingPlayer = room.players.find((p) => p.id === playerId)
    || room.spectators.find((p) => p.id === playerId);
  const leavingName = leavingPlayer ? leavingPlayer.displayName : 'A player';

  room.players = room.players.filter((p) => p.id !== playerId);
  room.spectators = room.spectators.filter((p) => p.id !== playerId);

  if (room.players.length === 0 && room.spectators.length === 0) {
    if (room.timer) clearTimeout(room.timer);
    rooms.delete(roomCode);
    return;
  }

  broadcastSystemMessage(room, `${leavingName} left the room`);
  broadcastRoomState(room);
}

function rejoinRoom(roomCode, playerId, ws) {
  const room = rooms.get(roomCode);
  if (!room) {
    ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
    return null;
  }

  const player = room.players.find((p) => p.id === playerId);
  if (!player) {
    // Check spectators
    const spec = room.spectators.find((p) => p.id === playerId);
    if (spec) {
      spec.ws = ws;
      sendFilteredState(room, spec);
      return room;
    }
    ws.send(JSON.stringify({ type: 'error', message: 'Player not found in room' }));
    return null;
  }

  player.ws = ws;
  player.sittingOut = false;
  sendFilteredState(room, player);

  broadcastSystemMessage(room, `${player.displayName} reconnected`);

  // If it's this player's turn, re-send the yourTurn message so they see action buttons
  const playerIndex = room.players.indexOf(player);
  if (playerIndex === room.activePlayerIndex && room.phase !== 'waiting' && room.phase !== 'gameOver' && room.phase !== 'showdown') {
    // Defer to allow game-engine to send yourTurn (avoid circular dep)
    room._pendingTurnResend = playerId;
  }

  return room;
}

function getRoom(roomCode) {
  return rooms.get(roomCode);
}

function getRoomByPlayerId(playerId) {
  for (const room of rooms.values()) {
    const player = room.players.find((p) => p.id === playerId);
    if (player) return room;
    const spec = room.spectators.find((p) => p.id === playerId);
    if (spec) return room;
  }
  return null;
}

function broadcastRoomState(room) {
  const allReceivers = [...room.players, ...room.spectators];
  for (const p of allReceivers) {
    if (p.ws && p.ws.readyState === 1) {
      sendFilteredState(room, p);
    }
  }
}

function sendFilteredState(room, player) {
  const state = filterRoomState(room, player.id);
  if (player.ws && player.ws.readyState === 1) {
    player.ws.send(JSON.stringify({ type: 'roomState', state }));
  }
}

function filterRoomState(room, playerId) {
  const isShowdown = room.phase === 'showdown' || room.phase === 'gameOver';
  return {
    code: room.code,
    phase: room.phase,
    players: room.players.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      chips: p.chips,
      currentBet: p.currentBet,
      folded: p.folded,
      allIn: p.allIn,
      sittingOut: p.sittingOut,
      isCreator: p.isCreator,
      cards: p.id === playerId || isShowdown ? p.cards : (p.cards ? ['back', 'back'] : null),
    })),
    spectators: room.spectators.map((p) => ({
      id: p.id,
      displayName: p.displayName,
    })),
    communityCards: room.communityCards,
    pots: room.pots,
    dealerIndex: room.dealerIndex,
    activePlayerIndex: room.activePlayerIndex,
    currentBet: room.currentBet,
    blindLevel: room.blindLevel,
    handNumber: room.handNumber,
    playerId,
  };
}

module.exports = {
  createRoom,
  joinRoom,
  leaveRoom,
  rejoinRoom,
  getRoom,
  getRoomByPlayerId,
  broadcastRoomState,
  rooms,
};
