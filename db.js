'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'stats.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadDb() {
  ensureDataDir();
  try {
    const data = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    return { sessions: [] };
  }
}

function saveDb(db) {
  ensureDataDir();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function insertSession(roomCode, players) {
  const db = loadDb();
  const session = {
    id: `session-${Date.now()}`,
    roomCode,
    startedAt: new Date().toISOString(),
    endedAt: null,
    winner: null,
    players: players.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      handsPlayed: 0,
      handsWon: 0,
      biggestPot: 0,
      peakChips: p.chips,
      finalPosition: null,
    })),
  };
  db.sessions.push(session);
  saveDb(db);
  return session.id;
}

function incrementHands(sessionId, playerIds) {
  const db = loadDb();
  const session = db.sessions.find((s) => s.id === sessionId);
  if (!session) return;
  for (const pid of playerIds) {
    const ps = session.players.find((p) => p.id === pid);
    if (ps) ps.handsPlayed++;
  }
  saveDb(db);
}

function recordWin(sessionId, playerId, potAmount) {
  const db = loadDb();
  const session = db.sessions.find((s) => s.id === sessionId);
  if (!session) return;
  const ps = session.players.find((p) => p.id === playerId);
  if (ps) {
    ps.handsWon++;
    if (potAmount > ps.biggestPot) ps.biggestPot = potAmount;
  }
  saveDb(db);
}

function updatePeakChips(sessionId, playerId, chips) {
  const db = loadDb();
  const session = db.sessions.find((s) => s.id === sessionId);
  if (!session) return;
  const ps = session.players.find((p) => p.id === playerId);
  if (ps && chips > ps.peakChips) {
    ps.peakChips = chips;
  }
  saveDb(db);
}

function setFinalPosition(sessionId, playerId, position) {
  const db = loadDb();
  const session = db.sessions.find((s) => s.id === sessionId);
  if (!session) return;
  const ps = session.players.find((p) => p.id === playerId);
  if (ps) ps.finalPosition = position;
  saveDb(db);
}

function endSession(sessionId, winnerName) {
  const db = loadDb();
  const session = db.sessions.find((s) => s.id === sessionId);
  if (!session) return;
  session.endedAt = new Date().toISOString();
  session.winner = winnerName;
  saveDb(db);
}

function getSessionStats(sessionId) {
  const db = loadDb();
  return db.sessions.find((s) => s.id === sessionId) || null;
}

module.exports = {
  insertSession,
  incrementHands,
  recordWin,
  updatePeakChips,
  setFinalPosition,
  endSession,
  getSessionStats,
  ensureDataDir,
};
