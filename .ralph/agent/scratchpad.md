# Bug Hunt - Multiplayer Poker

## Analysis Complete - Bugs Found

### Critical Bugs:

1. **Side pot calculation includes folded players' bets** - In `calculatePots()`, the `allContributors` variable includes folded players (`filter(p => p.totalBetThisHand > 0)`), but when counting `contributors.length` to multiply by the contribution level, this inflates the pot amount incorrectly. Folded players' contributions are real money in the pot, so including them in calculating pot size is actually correct - but the `eligible` list (who can WIN) correctly excludes them. This is actually OK.

2. **`dealerIndex` rotation bug in `startNextHand()`** - After eliminating players with 0 chips, the players array shrinks. Then `room.dealerIndex = room.dealerIndex % room.players.length` uses the NEW shorter array. But `dealerIndex` might have pointed to a different logical player before removal. The dealer button could skip players or land on the wrong player. However the modulo prevents out-of-bounds - the main issue is that the dealer may be the wrong person after elimination, but it's not a crash bug.

3. **`room.spectators` not initialized on room creation** - Looking at room-manager.js line 25... Actually it IS initialized: `spectators: []`. OK.

4. **CRITICAL: `handleDisconnect` imports `rooms` with require inside function** - In game-engine.js line ~380: `const { rooms } = require('./room-manager');` This is a circular dependency issue. room-manager requires game-engine (via server.js which requires both), and game-engine requires room-manager. In Node.js, circular requires can lead to partially loaded modules. However, since the require is inside the function body (not at module top level), it will work because by the time handleDisconnect is called, both modules are fully loaded. But it's still fragile.

5. **CRITICAL BUG: `isBettingRoundComplete` doesn't account for the big blind preflop option** - During preflop, the big blind player hasn't been given a chance to act. After everyone calls the big blind amount, `isBettingRoundComplete` returns true because all active players have `hasActed = true` and `currentBet === room.currentBet`. But wait - the big blind is the one who posted the blind, and their `hasActed` is reset to false at the end of `dealHand()`. So actually the big blind WILL get a turn because their `hasActed` is false. Let me re-check...

   Actually looking more carefully: In `dealHand()`, after posting blinds, the code does:
   ```
   for (const p of room.players) { p.hasActed = false; }
   ```
   So the big blind's `hasActed` is false. When others call, `isBettingRoundComplete` checks that ALL active players have `hasActed = true`. Since BB's `hasActed` is false, betting won't be considered complete until BB acts. This is correct.

6. **BUG: `postBlind` doesn't add player to pot's eligible list** - The `room.pots[0].eligible` array is never populated during the hand. In `dealHand()`, pots are reset to `[{ amount: 0, eligible: [] }]` but eligible is never filled. The `calculatePots()` function in `resolveShowdown()` recalculates pots from scratch using `totalBetThisHand`, so `room.pots[0].eligible` is just used for tracking the pot total amount. The `eligible` field on `room.pots[0]` is essentially unused - pot total is used for `awardPotToLastPlayer()`. This is fine.

7. **BUG: `awardPotToLastPlayer` uses `room.pots.reduce((sum, p) => sum + p.amount, 0)` but only the main pot (`pots[0]`) is ever tracked** - Since all bet amounts go to `room.pots[0].amount`, there's only ever one pot object in the array during play. Side pots are calculated at showdown. So this works correctly.

8. **CRITICAL BUG: Race condition in `handleAction` - action validation checks `validActions.includes(actionBase)` but `actionBase` is always just `action`** - The line says:
   ```js
   const actionBase = action === 'bet' || action === 'raise' ? action : action;
   ```
   This is a no-op! It always evaluates to `action`. The ternary does nothing. This is dead code but not a functional bug.

9. **CRITICAL BUG: In `handleAction` for 'call', chips are added to `room.pots[0].amount` even if there are side pots** - As mentioned above, there's only one pot tracked during play (pots[0]). This is fine.

10. **REAL BUG: `compareHands` comparison in `resolveShowdown` sorts descending but uses `compareHands(b.hand, a.hand)`** - Let me check: `eligible.sort((a, b) => compareHands(b.hand, a.hand))` and `compareHands(a, b) = a.score - b.score`. So `compareHands(b.hand, a.hand)` = `b.hand.score - a.hand.score`. This means if b > a, the result is positive, so b comes after a... wait no. In `.sort(compareFn)`, if compareFn(a, b) returns positive, b comes first. So `sort((a, b) => b.score - a.score)` puts highest score first. This is correct.

11. **REAL BUG: `startNextHand` - `finalPosition` calculation is wrong** - When eliminating players:
    ```js
    const eliminated = room.players.filter((p) => p.chips === 0);
    for (const p of eliminated) {
      room.spectators.push({...finalPosition: room.players.length...});
      db.setFinalPosition(room.sessionId, p.id, room.players.length);
    }
    ```
    If multiple players are eliminated in the same hand, they ALL get `room.players.length` as their position. Then `room.players = room.players.filter(p => p.chips > 0)` removes them. They should get different positions or at least a shared position. This is a minor issue - they tied for last.

12. **REAL BUG: `evaluate5` - Wheel straight flush detection is after normal straight flush check** - If cards are [14,5,4,3,2] of same suit, `isStrait` checks if each consecutive pair differs by 1: 14-5=9 ≠ 1, so `isStrait` is false. Then we check `isFlush && isWheel` — this correctly catches the wheel straight flush. ✓

13. **REAL BUG (CRITICAL): `calculatePots()` doesn't include contributions from FOLDED players** - The variable `allContributors = room.players.filter(p => (p.totalBetThisHand || 0) > 0)` DOES include folded players because there's no `!p.folded` filter. So folded player contributions ARE counted in the pot calculation. Good.

    Wait, let me re-examine. Actually: `const contributors = allContributors.filter((p) => (p.totalBetThisHand || 0) >= level)`. This counts everyone who bet at least `level` (including folded players). The pot amount at each level = `contribution * contributors.length`. This correctly accounts for all money put into the pot. ✓

14. **REAL BUG: The dealer rotation in `startNextHand` is wrong** - 
    ```js
    room.dealerIndex = room.dealerIndex % room.players.length;
    const nextDealer = (room.dealerIndex + 1) % room.players.length;
    room.dealerIndex = nextDealer;
    ```
    After players are eliminated and the array shrinks, if dealerIndex was e.g. 5 and now there are only 3 players, it becomes 5%3=2, then (2+1)%3=0. The issue is that the dealer button might not correctly track which player was dealer, since players were removed from the array and indices shifted.

15. **ACTUAL CRITICAL BUG: `nextActivePlayer` in heads-up logic is wrong for preflop** - In `dealHand()`:
    ```js
    if (numActive === 2) {
      sbIndex = room.dealerIndex;
      bbIndex = nextActivePlayer(room, room.dealerIndex);
    }
    ```
    `nextActivePlayer(room, room.dealerIndex)` finds the next player after dealer who is `!folded && !allIn && chips > 0`. But at this point in `dealHand`, all players with chips > 0 have `folded = false` (set earlier in the function based on chips). The issue: `nextActivePlayer` checks `p.chips > 0`, but we haven't posted blinds yet so chips are still at their pre-blind values. This should be fine.

16. **ACTUAL BUG: `handleAction` doesn't validate bet/raise minimum amounts** - A player can bet 1 chip (below the big blind minimum) and the server will accept it. The `betAmount` defaults to `getBlinds(room.blindLevel).big` only if `amount` is falsy (0, null, undefined), but any positive number is accepted without validation.

17. **ACTUAL BUG (CONFIRMED): The timer display is not properly synced** - When the client reconnects (`rejoin`), the `yourTurn` message is never re-sent if it's still their turn. The `rejoinRoom()` function only calls `sendFilteredState()` which sends room state but NOT the `yourTurn` message. So a player who reconnects during their turn won't see the action buttons.

18. **CONFIRMED BUG: The `spectators` array in `room-manager.js` `broadcastRoomState` iterates spectators, but spectators pushed in `startNextHand` don't have a properly set `ws`** - Actually looking at it, the spectator object includes `ws: p.ws` from the player object. If the player is still connected, this should work.

19. **CONFIRMED BUG: `handleDisconnect` only checks `room.players` but disconnected spectators aren't handled** - `getRoomByPlayerId` DOES find spectators, but `handleDisconnect` only looks in `room.players`. If a spectator disconnects, `player` will be undefined, and nothing happens. Their `ws` reference will become stale. Not a crash, but when broadcasting to spectators, stale ws refs would fail silently (readyState check prevents actual errors).

20. **CONFIRMED BUG: The `leaveBtn` only exists in gameOverScreen** - Looking at the HTML, the leave button is only in the game over screen. There's no way to leave from the waiting room or during the game (other than closing the browser).

---

## CRITICAL/SIGNIFICANT bugs to fix:

1. **Timer/turn not re-sent on rejoin** - If a player reconnects during their turn, they won't see action buttons
2. **No minimum bet/raise validation** - Bets below big blind are accepted
3. **`actionBase` is a no-op (dead code)** - Trivial but shows intent was different
4. **`handleDisconnect` doesn't clean up spectator ws** - Stale websocket references
5. **`startNextHand` elimination position is same for all eliminated in one hand** - Minor correctness issue
6. **Dealer rotation after elimination can skip players or be incorrect** - Because players are removed from array, index semantics change
