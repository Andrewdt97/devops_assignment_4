'use strict';

// Hand ranks
const HAND_RANKS = {
  STRAIGHT_FLUSH: 8,
  FOUR_OF_A_KIND: 7,
  FULL_HOUSE: 6,
  FLUSH: 5,
  STRAIGHT: 4,
  THREE_OF_A_KIND: 3,
  TWO_PAIR: 2,
  ONE_PAIR: 1,
  HIGH_CARD: 0,
};

/**
 * Evaluate a 5-card hand.
 * Returns { rank, score, name }
 * Score is a numeric value for comparison (higher is better).
 */
function evaluate5(cards) {
  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);
  const suits = cards.map((c) => c.suit);

  const isFlush = suits.every((s) => s === suits[0]);
  const isStrait = isStraight(ranks);
  const isWheel = isWheelStraight(ranks);

  // Frequency counts
  const freq = {};
  for (const r of ranks) freq[r] = (freq[r] || 0) + 1;
  const counts = Object.values(freq).sort((a, b) => b - a);
  // Sort by frequency then rank
  const grouped = Object.entries(freq)
    .sort((a, b) => b[1] - a[1] || Number(b[0]) - Number(a[0]))
    .map(([r]) => Number(r));

  if (isFlush && isStrait) {
    const highCard = ranks[0];
    return { rank: HAND_RANKS.STRAIGHT_FLUSH, score: makeScore(8, ranks), name: highCard === 14 ? 'Royal Flush' : 'Straight Flush' };
  }
  if (isFlush && isWheel) {
    // A-2-3-4-5 flush — score with 5 high
    return { rank: HAND_RANKS.STRAIGHT_FLUSH, score: makeScore(8, [5, 4, 3, 2, 1]), name: 'Straight Flush' };
  }
  if (counts[0] === 4) {
    return { rank: HAND_RANKS.FOUR_OF_A_KIND, score: makeScore(7, grouped), name: 'Four of a Kind' };
  }
  if (counts[0] === 3 && counts[1] === 2) {
    return { rank: HAND_RANKS.FULL_HOUSE, score: makeScore(6, grouped), name: 'Full House' };
  }
  if (isFlush) {
    return { rank: HAND_RANKS.FLUSH, score: makeScore(5, ranks), name: 'Flush' };
  }
  if (isStrait) {
    return { rank: HAND_RANKS.STRAIGHT, score: makeScore(4, ranks), name: 'Straight' };
  }
  if (isWheel) {
    return { rank: HAND_RANKS.STRAIGHT, score: makeScore(4, [5, 4, 3, 2, 1]), name: 'Straight' };
  }
  if (counts[0] === 3) {
    return { rank: HAND_RANKS.THREE_OF_A_KIND, score: makeScore(3, grouped), name: 'Three of a Kind' };
  }
  if (counts[0] === 2 && counts[1] === 2) {
    return { rank: HAND_RANKS.TWO_PAIR, score: makeScore(2, grouped), name: 'Two Pair' };
  }
  if (counts[0] === 2) {
    return { rank: HAND_RANKS.ONE_PAIR, score: makeScore(1, grouped), name: 'One Pair' };
  }
  return { rank: HAND_RANKS.HIGH_CARD, score: makeScore(0, ranks), name: 'High Card' };
}

function isStraight(sortedRanks) {
  for (let i = 1; i < sortedRanks.length; i++) {
    if (sortedRanks[i - 1] - sortedRanks[i] !== 1) return false;
  }
  return true;
}

function isWheelStraight(sortedRanks) {
  // A-2-3-4-5 — sorted desc: [14, 5, 4, 3, 2]
  return sortedRanks[0] === 14 && sortedRanks[1] === 5 && sortedRanks[2] === 4 && sortedRanks[3] === 3 && sortedRanks[4] === 2;
}

function makeScore(handRank, kickers) {
  // Encode: handRank * 15^5 + k1*15^4 + k2*15^3 + ...
  let score = handRank * Math.pow(15, 5);
  for (let i = 0; i < kickers.length && i < 5; i++) {
    score += kickers[i] * Math.pow(15, 4 - i);
  }
  return score;
}

/**
 * Find the best 5-card hand from 7 cards.
 * Returns the evaluation of the best hand.
 */
function bestHand(sevenCards) {
  let best = null;
  const combos = combinations(sevenCards, 5);
  for (const combo of combos) {
    const result = evaluate5(combo);
    if (!best || result.score > best.score) {
      best = result;
      best.cards = combo;
    }
  }
  return best;
}

/**
 * Compare two hand evaluations. Returns positive if a > b, negative if a < b, 0 if tie.
 */
function compareHands(a, b) {
  return a.score - b.score;
}

/**
 * Generate all combinations of size k from array.
 */
function combinations(arr, k) {
  const results = [];
  function combine(start, combo) {
    if (combo.length === k) {
      results.push([...combo]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i]);
      combine(i + 1, combo);
      combo.pop();
    }
  }
  combine(0, []);
  return results;
}

module.exports = { evaluate5, bestHand, compareHands, HAND_RANKS, combinations };
