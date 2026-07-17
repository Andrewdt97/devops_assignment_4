'use strict';

const { bestHand, compareHands } = require('./hand-evaluator');
const { broadcastRoomState } = require('./room-manager');
const db = require('./db');

const STARTING_SMALL_BLIND = 10;
const HANDS_PER_LEVEL = 10;
const TURN_TIMEOUT_MS = 30000;

// --- Deck ---

function createDeck() {
  const suits = ['h', 'd', 'c', 's'];
  const deck = [];
  for (const suit of suits) {
    for (let rank = 2; rank <= 14; rank++) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

function shuffleDeck(deck) {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

// --- Blinds ---

function getBlinds(level) {
  const small = STARTING_SMALL_BLIND * Math.pow(2, level);
  return { small, big: small * 2 };
}

// --- Game Start ---

function startGame(room) {
  if (room.players.length < 2) {
    const creator = room.players.find((p) => p.isCreator);
    if (creator && creator.ws) {
      creator.ws.send(JSON.stringify({ type: 'error', message: 'Need at least 2 players to start' }));
    }
    return false;
  }

  room.phase = 'dealing';
  room.handNumber = 0;
  room.handsThisLevel = 0;
  room.blindLevel = 0;
  room.dealerIndex = 0;

  // Reset all players
  for (const p of room.players) {
    p.chips = 1000;
    p.folded = false;
    p.allIn = false;
    p.cards = null;
    p.currentBet = 0;
  }

  // Persist session start
  room.sessionId = db.insertSession(room.code, room.players);

  dealHand(room);
  return true;
}

function dealHand(room) {
  // Reset per-hand state
  room.deck = shuffleDeck(createDeck());
  room.communityCards = [];
  room.pots = [{ amount: 0, eligible: [] }];
  room.currentBet = 0;
  room.lastRaiseSize = 0;

  for (const p of room.players) {
    p.cards = null;
    p.currentBet = 0;
    p.totalBetThisHand = 0;
    p.folded = p.chips === 0;
    p.allIn = false;
    p.hasActed = false;
  }

  // Deal 2 cards to each active player
  for (const p of room.players) {
    if (!p.folded) {
      p.cards = [room.deck.pop(), room.deck.pop()];
    }
  }

  // Post blinds
  const { small, big } = getBlinds(room.blindLevel);
  const numActive = room.players.filter((p) => !p.folded).length;

  let sbIndex, bbIndex;
  if (numActive === 2) {
    // Heads-up: dealer is small blind
    sbIndex = room.dealerIndex;
    bbIndex = nextActivePlayer(room, room.dealerIndex);
  } else {
    sbIndex = nextActivePlayer(room, room.dealerIndex);
    bbIndex = nextActivePlayer(room, sbIndex);
  }

  postBlind(room, sbIndex, small);
  postBlind(room, bbIndex, big);

  room.currentBet = big;

  // First to act: left of big blind
  room.activePlayerIndex = nextActivePlayer(room, bbIndex);
  room.phase = 'preflop';
  room.handNumber++;
  room.handsThisLevel++;

  // Track hands played
  if (room.sessionId) {
    const activeIds = room.players.filter((p) => !p.folded).map((p) => p.id);
    db.incrementHands(room.sessionId, activeIds);
  }

  // Reset hasActed for all
  for (const p of room.players) {
    p.hasActed = false;
  }

  broadcastRoomState(room);
  startTurnTimer(room);
}

function postBlind(room, playerIndex, amount) {
  const player = room.players[playerIndex];
  const actual = Math.min(amount, player.chips);
  player.chips -= actual;
  player.currentBet = actual;
  player.totalBetThisHand = (player.totalBetThisHand || 0) + actual;
  room.pots[0].amount += actual;
  if (player.chips === 0) {
    player.allIn = true;
  }
}

// --- Turn Management ---

function nextActivePlayer(room, fromIndex) {
  const n = room.players.length;
  let idx = (fromIndex + 1) % n;
  let count = 0;
  while (count < n) {
    const p = room.players[idx];
    if (!p.folded && !p.allIn && p.chips > 0) {
      return idx;
    }
    idx = (idx + 1) % n;
    count++;
  }
  // No active player found (everyone is folded or all-in)
  return -1;
}

function startTurnTimer(room) {
  if (room.timer) clearTimeout(room.timer);
  if (room.phase === 'waiting' || room.phase === 'gameOver' || room.phase === 'showdown') return;
  if (room.activePlayerIndex < 0) return;

  const player = room.players[room.activePlayerIndex];
  if (!player || player.folded || player.allIn) return;

  // Send yourTurn message
  sendYourTurn(room);

  room.timer = setTimeout(() => {
    // Auto-fold
    handleAction(room, player.id, { type: 'action', action: 'fold' });
  }, TURN_TIMEOUT_MS);
}

function sendYourTurn(room) {
  if (room.activePlayerIndex < 0) return;
  const player = room.players[room.activePlayerIndex];
  if (!player || !player.ws || player.ws.readyState !== 1) return;

  const validActions = getValidActions(room);
  player.ws.send(JSON.stringify({
    type: 'yourTurn',
    validActions,
    timeRemaining: TURN_TIMEOUT_MS / 1000,
  }));
}

// --- Actions ---

function getValidActions(room) {
  const player = room.players[room.activePlayerIndex];
  if (!player) return [];

  const actions = ['fold'];
  const toCall = room.currentBet - player.currentBet;

  if (toCall === 0) {
    actions.push('check');
  } else {
    actions.push('call');
  }

  // Can bet/raise if has enough chips
  const minRaise = Math.max(room.lastRaiseSize || getBlinds(room.blindLevel).big, room.currentBet - player.currentBet);
  if (player.chips > toCall) {
    if (room.currentBet === 0 || (room.currentBet === player.currentBet)) {
      actions.push('bet');
    } else {
      actions.push('raise');
    }
  }

  actions.push('allIn');

  return actions;
}

function handleAction(room, playerId, msg) {
  const playerIndex = room.players.findIndex((p) => p.id === playerId);
  if (playerIndex < 0) return { error: 'Player not in room' };

  if (playerIndex !== room.activePlayerIndex) {
    return { error: 'Not your turn' };
  }

  const player = room.players[playerIndex];
  const { action, amount } = msg;
  const validActions = getValidActions(room);

  // Validate action is allowed
  if (!validActions.includes(action) && action !== 'allIn') {
    return { error: `Invalid action: ${action}` };
  }

  if (room.timer) clearTimeout(room.timer);

  switch (action) {
    case 'fold':
      player.folded = true;
      player.hasActed = true;
      break;

    case 'check':
      if (room.currentBet !== player.currentBet) {
        return { error: 'Cannot check, there is a bet' };
      }
      player.hasActed = true;
      break;

    case 'call': {
      const toCall = Math.min(room.currentBet - player.currentBet, player.chips);
      player.chips -= toCall;
      player.currentBet += toCall;
      player.totalBetThisHand = (player.totalBetThisHand || 0) + toCall;
      room.pots[0].amount += toCall;
      if (player.chips === 0) player.allIn = true;
      player.hasActed = true;
      break;
    }

    case 'bet': {
      const minBet = getBlinds(room.blindLevel).big;
      const betAmount = Math.max(Number(amount) || minBet, minBet);
      const actual = Math.min(betAmount, player.chips);
      player.chips -= actual;
      player.currentBet += actual;
      player.totalBetThisHand = (player.totalBetThisHand || 0) + actual;
      room.pots[0].amount += actual;
      room.currentBet = player.currentBet;
      room.lastRaiseSize = actual;
      if (player.chips === 0) player.allIn = true;
      player.hasActed = true;
      // Reset other players' hasActed
      resetActedExcept(room, playerIndex);
      break;
    }

    case 'raise': {
      const minRaise = room.lastRaiseSize || getBlinds(room.blindLevel).big;
      const toCall = room.currentBet - player.currentBet;
      const minRaiseTotal = toCall + minRaise;
      const raiseAmount = Math.max(Number(amount) || minRaiseTotal, minRaiseTotal);
      const actual = Math.min(raiseAmount, player.chips);
      player.chips -= actual;
      player.currentBet += actual;
      player.totalBetThisHand = (player.totalBetThisHand || 0) + actual;
      room.pots[0].amount += actual;
      room.lastRaiseSize = player.currentBet - room.currentBet;
      room.currentBet = player.currentBet;
      if (player.chips === 0) player.allIn = true;
      player.hasActed = true;
      resetActedExcept(room, playerIndex);
      break;
    }

    case 'allIn': {
      const allInAmount = player.chips;
      player.currentBet += allInAmount;
      player.totalBetThisHand = (player.totalBetThisHand || 0) + allInAmount;
      room.pots[0].amount += allInAmount;
      player.chips = 0;
      player.allIn = true;
      if (player.currentBet > room.currentBet) {
        room.lastRaiseSize = player.currentBet - room.currentBet;
        room.currentBet = player.currentBet;
        resetActedExcept(room, playerIndex);
      }
      player.hasActed = true;
      break;
    }

    default:
      return { error: `Unknown action: ${action}` };
  }

  // Check if hand is over (one player left)
  const activePlayers = room.players.filter((p) => !p.folded);
  if (activePlayers.length === 1) {
    awardPotToLastPlayer(room, activePlayers[0]);
    return { ok: true };
  }

  // Check if betting round is complete
  if (isBettingRoundComplete(room)) {
    advancePhase(room);
  } else {
    // Advance to next player
    room.activePlayerIndex = nextActivePlayer(room, room.activePlayerIndex);
    if (room.activePlayerIndex === -1) {
      // Everyone is all-in — deal remaining cards
      dealRemainingAndShowdown(room);
    } else {
      broadcastRoomState(room);
      startTurnTimer(room);
    }
  }

  return { ok: true };
}

function resetActedExcept(room, exceptIndex) {
  for (let i = 0; i < room.players.length; i++) {
    if (i !== exceptIndex && !room.players[i].folded && !room.players[i].allIn) {
      room.players[i].hasActed = false;
    }
  }
}

function isBettingRoundComplete(room) {
  const active = room.players.filter((p) => !p.folded && !p.allIn);
  if (active.length === 0) return true;
  return active.every((p) => p.hasActed && p.currentBet === room.currentBet);
}

// --- Phase Transitions ---

function advancePhase(room) {
  if (room.timer) clearTimeout(room.timer);

  // Check if all remaining are all-in (or only one is active)
  const nonFolded = room.players.filter((p) => !p.folded);
  const canAct = nonFolded.filter((p) => !p.allIn && p.chips > 0);

  if (canAct.length <= 1 && nonFolded.length > 1) {
    // All-in scenario — deal remaining cards
    dealRemainingAndShowdown(room);
    return;
  }

  switch (room.phase) {
    case 'preflop':
      room.phase = 'flop';
      room.communityCards = [room.deck.pop(), room.deck.pop(), room.deck.pop()];
      break;
    case 'flop':
      room.phase = 'turn';
      room.communityCards.push(room.deck.pop());
      break;
    case 'turn':
      room.phase = 'river';
      room.communityCards.push(room.deck.pop());
      break;
    case 'river':
      resolveShowdown(room);
      return;
    default:
      return;
  }

  // Reset for new betting round
  room.currentBet = 0;
  room.lastRaiseSize = 0;
  for (const p of room.players) {
    p.currentBet = 0;
    p.hasActed = false;
  }

  // First to act: first active player left of dealer
  room.activePlayerIndex = nextActivePlayer(room, room.dealerIndex);
  if (room.activePlayerIndex === -1) {
    dealRemainingAndShowdown(room);
    return;
  }

  broadcastRoomState(room);
  startTurnTimer(room);
}

function dealRemainingAndShowdown(room) {
  if (room.timer) clearTimeout(room.timer);
  // Deal remaining community cards
  while (room.communityCards.length < 5) {
    room.communityCards.push(room.deck.pop());
  }
  resolveShowdown(room);
}

// --- Showdown ---

function resolveShowdown(room) {
  if (room.timer) clearTimeout(room.timer);
  room.phase = 'showdown';

  const nonFolded = room.players.filter((p) => !p.folded);

  // Calculate side pots
  const pots = calculatePots(room);

  // Evaluate hands
  const handResults = [];
  for (const p of nonFolded) {
    const allCards = [...(p.cards || []), ...room.communityCards];
    if (allCards.length >= 5) {
      const result = bestHand(allCards);
      handResults.push({ player: p, hand: result });
    } else {
      handResults.push({ player: p, hand: { score: 0, name: 'Unknown' } });
    }
  }

  // Award each pot
  const winners = [];
  for (const pot of pots) {
    const eligible = handResults.filter((h) => pot.eligible.includes(h.player.id));
    if (eligible.length === 0) continue;

    eligible.sort((a, b) => compareHands(b.hand, a.hand));
    const bestScore = eligible[0].hand.score;
    const potWinners = eligible.filter((h) => h.hand.score === bestScore);

    const share = Math.floor(pot.amount / potWinners.length);
    const remainder = pot.amount - share * potWinners.length;

    for (let i = 0; i < potWinners.length; i++) {
      potWinners[i].player.chips += share + (i === 0 ? remainder : 0);
      if (!winners.find((w) => w.id === potWinners[i].player.id)) {
        winners.push({
          id: potWinners[i].player.id,
          displayName: potWinners[i].player.displayName,
          hand: potWinners[i].hand.name,
          potWon: share + (i === 0 ? remainder : 0),
        });
      } else {
        const existing = winners.find((w) => w.id === potWinners[i].player.id);
        existing.potWon += share + (i === 0 ? remainder : 0);
      }

      // Record win and update peak chips
      if (room.sessionId) {
        db.recordWin(room.sessionId, potWinners[i].player.id, share + (i === 0 ? remainder : 0));
        db.updatePeakChips(room.sessionId, potWinners[i].player.id, potWinners[i].player.chips);
      }
    }
  }

  // Broadcast showdown results
  const showdownMsg = {
    type: 'showdown',
    hands: handResults.map((h) => ({
      playerId: h.player.id,
      displayName: h.player.displayName,
      hand: h.hand.name,
      cards: h.player.cards,
    })),
    winners,
    communityCards: room.communityCards,
  };

  for (const p of [...room.players, ...room.spectators]) {
    if (p.ws && p.ws.readyState === 1) {
      p.ws.send(JSON.stringify(showdownMsg));
    }
  }

  broadcastRoomState(room);

  // After a delay, start next hand or end game
  setTimeout(() => {
    startNextHand(room);
  }, 3000);
}

function awardPotToLastPlayer(room, winner) {
  if (room.timer) clearTimeout(room.timer);
  const totalPot = room.pots.reduce((sum, p) => sum + p.amount, 0);
  winner.chips += totalPot;
  room.pots = [{ amount: 0, eligible: [] }];

  // Record stats
  if (room.sessionId) {
    db.recordWin(room.sessionId, winner.id, totalPot);
    db.updatePeakChips(room.sessionId, winner.id, winner.chips);
  }

  // Broadcast
  const msg = {
    type: 'handWon',
    winnerId: winner.id,
    displayName: winner.displayName,
    potWon: totalPot,
    reason: 'All others folded',
  };
  for (const p of [...room.players, ...room.spectators]) {
    if (p.ws && p.ws.readyState === 1) {
      p.ws.send(JSON.stringify(msg));
    }
  }

  broadcastRoomState(room);

  setTimeout(() => {
    startNextHand(room);
  }, 2000);
}

// --- Side Pots ---

function calculatePots(room) {
  const nonFolded = room.players.filter((p) => !p.folded);

  // Get all unique bet levels from all-in players (using total bet this hand)
  const allInAmounts = room.players
    .filter((p) => p.allIn && !p.folded)
    .map((p) => p.totalBetThisHand || 0)
    .sort((a, b) => a - b);

  if (allInAmounts.length === 0) {
    // No side pots needed
    const totalPot = room.pots.reduce((sum, p) => sum + p.amount, 0);
    return [{ amount: totalPot, eligible: nonFolded.map((p) => p.id) }];
  }

  // Create pots at each threshold using totalBetThisHand
  const pots = [];
  let prevLevel = 0;

  const allContributors = room.players.filter((p) => (p.totalBetThisHand || 0) > 0);
  const uniqueLevels = [...new Set(allInAmounts)];

  for (const level of uniqueLevels) {
    const contribution = level - prevLevel;
    const eligible = nonFolded.filter((p) => (p.totalBetThisHand || 0) >= level).map((p) => p.id);
    const contributors = allContributors.filter((p) => (p.totalBetThisHand || 0) >= level);
    const potAmount = contribution * contributors.length;
    if (potAmount > 0) {
      pots.push({ amount: potAmount, eligible });
    }
    prevLevel = level;
  }

  // Remaining pot for players who bet more than the highest all-in
  const maxAllIn = Math.max(...allInAmounts);
  const remaining = allContributors
    .filter((p) => (p.totalBetThisHand || 0) > maxAllIn)
    .reduce((sum, p) => sum + ((p.totalBetThisHand || 0) - maxAllIn), 0);
  if (remaining > 0) {
    const eligible = nonFolded.filter((p) => (p.totalBetThisHand || 0) > maxAllIn).map((p) => p.id);
    pots.push({ amount: remaining, eligible });
  }

  // Verify total matches
  const calcTotal = pots.reduce((sum, p) => sum + p.amount, 0);
  const actualTotal = room.pots.reduce((sum, p) => sum + p.amount, 0);
  
  // If there's a discrepancy, use the simple approach
  if (calcTotal !== actualTotal) {
    return [{ amount: actualTotal, eligible: nonFolded.map((p) => p.id) }];
  }

  return pots;
}

// --- Multi-Hand Flow ---

function startNextHand(room) {
  if (room.timer) clearTimeout(room.timer);

  // Eliminate players with 0 chips
  const eliminated = room.players.filter((p) => p.chips === 0);
  const remainingCount = room.players.length - eliminated.length;

  // Assign positions: all players eliminated in same hand share the next position
  // Position = remainingCount + 1 (e.g., if 3 remain, eliminated get position 4)
  const eliminationPosition = remainingCount + 1;
  for (const p of eliminated) {
    room.spectators.push({
      id: p.id,
      ws: p.ws,
      displayName: p.displayName,
      finalPosition: eliminationPosition,
    });

    if (room.sessionId) {
      db.setFinalPosition(room.sessionId, p.id, eliminationPosition);
    }
  }

  // Track current dealer's ID before removing players so we can find them after
  const currentDealerId = room.players[room.dealerIndex] ? room.players[room.dealerIndex].id : null;

  room.players = room.players.filter((p) => p.chips > 0);

  // Check game over
  if (room.players.length <= 1) {
    room.phase = 'gameOver';
    const winner = room.players[0];

    // Record winner stats
    if (room.sessionId) {
      if (winner) {
        db.setFinalPosition(room.sessionId, winner.id, 1);
        db.endSession(room.sessionId, winner.displayName);
      } else {
        db.endSession(room.sessionId, null);
      }
    }

    const gameOverMsg = {
      type: 'gameOver',
      winner: winner ? { id: winner.id, displayName: winner.displayName, chips: winner.chips } : null,
      finalStandings: [
        ...(winner ? [{ displayName: winner.displayName, position: 1 }] : []),
        ...room.spectators.map((s, i) => ({ displayName: s.displayName, position: room.spectators.length - i + 1 })),
      ],
    };
    for (const p of [...room.players, ...room.spectators]) {
      if (p.ws && p.ws.readyState === 1) {
        p.ws.send(JSON.stringify(gameOverMsg));
      }
    }
    broadcastRoomState(room);
    return;
  }

  // Rotate dealer - find where the old dealer is (or the next player clockwise)
  let newDealerIndex = room.players.findIndex((p) => p.id === currentDealerId);
  if (newDealerIndex === -1) {
    // Dealer was eliminated; the next player in position takes over
    newDealerIndex = room.dealerIndex % room.players.length;
  }
  // Advance dealer to next player
  room.dealerIndex = (newDealerIndex + 1) % room.players.length;

  // Blind escalation
  if (room.handsThisLevel >= HANDS_PER_LEVEL) {
    room.blindLevel++;
    room.handsThisLevel = 0;
  }

  dealHand(room);
}

// --- Disconnection ---

function handleDisconnect(room, playerId) {
  if (!room) return;

  if (room.phase === 'waiting') {
    // Remove from room
    room.players = room.players.filter((p) => p.id !== playerId);
    if (room.players.length === 0) {
      const { rooms } = require('./room-manager');
      rooms.delete(room.code);
      return;
    }
    broadcastRoomState(room);
    return;
  }

  // Game in progress - check players first
  const player = room.players.find((p) => p.id === playerId);
  if (player) {
    player.sittingOut = true;
    player.ws = null;

    // If it's their turn, auto-fold
    const playerIndex = room.players.indexOf(player);
    if (playerIndex === room.activePlayerIndex) {
      handleAction(room, playerId, { type: 'action', action: 'fold' });
    }
    return;
  }

  // Check spectators - clear stale ws reference
  const spectator = room.spectators.find((p) => p.id === playerId);
  if (spectator) {
    spectator.ws = null;
  }
}

module.exports = {
  startGame,
  dealHand,
  handleAction,
  getValidActions,
  handleDisconnect,
  createDeck,
  shuffleDeck,
  getBlinds,
  TURN_TIMEOUT_MS,
};
