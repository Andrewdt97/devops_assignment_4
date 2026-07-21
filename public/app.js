// Poker Game Client
(function () {
  'use strict';

  let ws = null;
  let playerId = null;
  let roomCode = null;
  let gameState = null;
  let timerInterval = null;
  let timeRemaining = 0;

  // --- DOM Elements ---
  const screens = {
    landing: document.getElementById('landing'),
    waitingRoom: document.getElementById('waitingRoom'),
    gameScreen: document.getElementById('gameScreen'),
    gameOverScreen: document.getElementById('gameOverScreen'),
  };

  const els = {
    displayName: document.getElementById('displayName'),
    createBtn: document.getElementById('createBtn'),
    joinBtn: document.getElementById('joinBtn'),
    roomCodeInput: document.getElementById('roomCodeInput'),
    errorMsg: document.getElementById('errorMsg'),
    roomCodeDisplay: document.getElementById('roomCodeDisplay'),
    copyCode: document.getElementById('copyCode'),
    playerList: document.getElementById('playerList'),
    startBtn: document.getElementById('startBtn'),
    waitingMsg: document.getElementById('waitingMsg'),
    blindInfo: document.getElementById('blindInfo'),
    handInfo: document.getElementById('handInfo'),
    potInfo: document.getElementById('potInfo'),
    communityCards: document.getElementById('communityCards'),
    potDisplay: document.getElementById('potDisplay'),
    seats: document.getElementById('seats'),
    playerHand: document.getElementById('playerHand'),
    actions: document.getElementById('actions'),
    timerBar: document.getElementById('timerBar'),
    timerFill: document.getElementById('timerFill'),
    winnerAnnouncement: document.getElementById('winnerAnnouncement'),
    finalStandings: document.getElementById('finalStandings'),
    leaveBtn: document.getElementById('leaveBtn'),
    notification: document.getElementById('notification'),
    chatPanel: document.getElementById('chatPanel'),
    chatMessages: document.getElementById('chatMessages'),
    chatInput: document.getElementById('chatInput'),
    chatSendBtn: document.getElementById('chatSendBtn'),
  };

  // --- WebSocket Connection ---
  function connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.onopen = () => {
      console.log('Connected to server');
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      handleMessage(msg);
    };

    ws.onclose = () => {
      console.log('Disconnected');
      // Attempt reconnection after 2 seconds
      setTimeout(() => {
        connect();
      }, 2000);
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
    };
  }

  function send(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  // --- Message Handler ---
  function handleMessage(msg) {
    switch (msg.type) {
      case 'connected':
        playerId = msg.playerId;
        // Try to rejoin if we have stored room info
        const storedRoom = sessionStorage.getItem('roomCode');
        const storedPlayer = sessionStorage.getItem('playerId');
        if (storedRoom && storedPlayer) {
          send({ type: 'rejoin', roomCode: storedRoom, playerId: storedPlayer });
        }
        break;

      case 'roomCreated':
        roomCode = msg.roomCode;
        sessionStorage.setItem('roomCode', roomCode);
        sessionStorage.setItem('playerId', playerId);
        showScreen('waitingRoom');
        els.roomCodeDisplay.textContent = roomCode;
        break;

      case 'roomState':
        gameState = msg.state;
        roomCode = msg.state.code;
        sessionStorage.setItem('roomCode', roomCode);
        sessionStorage.setItem('playerId', playerId);
        renderState(msg.state);
        break;

      case 'yourTurn':
        timeRemaining = msg.timeRemaining;
        renderActions(msg.validActions);
        startTimerDisplay();
        break;

      case 'showdown':
        renderShowdown(msg);
        break;

      case 'handWon':
        showNotification(`${msg.displayName} wins ${msg.potWon} chips! (${msg.reason})`);
        break;

      case 'gameOver':
        renderGameOver(msg);
        break;

      case 'error':
        showError(msg.message);
        break;

      case 'chatMessage':
        appendChatMessage(msg);
        break;

      default:
        console.log('Unknown message:', msg);
    }
  }

  // --- Screen Management ---
  function showScreen(name) {
    Object.values(screens).forEach((s) => s.classList.add('hidden'));
    if (screens[name]) screens[name].classList.remove('hidden');
    // Show chat panel in waiting room and game screen, hide otherwise
    if (name === 'waitingRoom' || name === 'gameScreen') {
      els.chatPanel.classList.remove('hidden');
    } else {
      els.chatPanel.classList.add('hidden');
      // Clear chat messages when leaving a room
      els.chatMessages.innerHTML = '';
    }
  }

  // --- Rendering ---
  function renderState(state) {
    if (state.phase === 'waiting') {
      showScreen('waitingRoom');
      renderWaitingRoom(state);
    } else if (state.phase === 'gameOver') {
      // Handled by gameOver message
    } else {
      showScreen('gameScreen');
      renderGame(state);
    }
  }

  function renderWaitingRoom(state) {
    els.roomCodeDisplay.textContent = state.code;
    els.playerList.innerHTML = state.players
      .map(
        (p) =>
          `<div class="player-item">
            <span>${escapeHtml(p.displayName)}</span>
            ${p.isCreator ? '<span class="creator-badge">👑 Host</span>' : ''}
          </div>`
      )
      .join('');

    // Show start button only to creator with 2+ players
    const me = state.players.find((p) => p.id === state.playerId);
    if (me && me.isCreator && state.players.length >= 2) {
      els.startBtn.classList.remove('hidden');
    } else {
      els.startBtn.classList.add('hidden');
    }

    els.waitingMsg.textContent =
      state.players.length < 2
        ? 'Waiting for at least 1 more player...'
        : `${state.players.length} players ready`;
  }

  function renderGame(state) {
    // Game info
    const blindLevel = state.blindLevel || 0;
    const small = 10 * Math.pow(2, blindLevel);
    els.blindInfo.textContent = `Blinds: ${small}/${small * 2}`;
    els.handInfo.textContent = `Hand #${state.handNumber || 1}`;
    const totalPot = state.pots ? state.pots.reduce((s, p) => s + p.amount, 0) : 0;
    els.potInfo.textContent = `Pot: ${totalPot}`;

    // Community cards
    els.communityCards.innerHTML = (state.communityCards || [])
      .map((c) => renderCard(c))
      .join('');

    // Pot display
    els.potDisplay.textContent = totalPot > 0 ? `💰 ${totalPot}` : '';

    // Seats
    els.seats.innerHTML = state.players
      .map((p, i) => renderSeat(p, i, state))
      .join('');

    // Player hand
    const me = state.players.find((p) => p.id === state.playerId);
    if (me && me.cards && me.cards[0] !== 'back') {
      els.playerHand.innerHTML = me.cards.map((c) => renderCard(c)).join('');
    } else {
      els.playerHand.innerHTML = '';
    }

    // Clear actions if not our turn
    if (state.activePlayerIndex < 0 || state.players[state.activePlayerIndex]?.id !== state.playerId) {
      els.actions.innerHTML = '';
      els.timerBar.classList.add('hidden');
    }
  }

  function renderSeat(player, index, state) {
    const isActive = index === state.activePlayerIndex;
    const isDealer = index === state.dealerIndex;
    let classes = 'seat';
    if (isActive) classes += ' active';
    if (player.folded) classes += ' folded';
    if (isDealer) classes += ' dealer';

    let status = '';
    if (player.folded) status = 'Folded';
    else if (player.allIn) status = 'ALL IN';
    else if (player.sittingOut) status = 'Sitting Out';

    return `<div class="${classes}">
      <div class="seat-name">${escapeHtml(player.displayName)}</div>
      <div class="seat-chips">💰 ${player.chips}</div>
      ${player.currentBet > 0 ? `<div class="seat-bet">Bet: ${player.currentBet}</div>` : ''}
      ${status ? `<div class="seat-status">${status}</div>` : ''}
    </div>`;
  }

  function renderCard(card) {
    if (!card || card === 'back') {
      return '<div class="card back">🂠</div>';
    }
    const rankStr = rankToString(card.rank);
    const suitStr = suitToSymbol(card.suit);
    const colorClass = card.suit === 'h' || card.suit === 'd' ? 'red' : 'black';
    return `<div class="card ${colorClass}">${rankStr}${suitStr}</div>`;
  }

  function rankToString(rank) {
    if (rank === 14) return 'A';
    if (rank === 13) return 'K';
    if (rank === 12) return 'Q';
    if (rank === 11) return 'J';
    return String(rank);
  }

  function suitToSymbol(suit) {
    const map = { h: '♥', d: '♦', c: '♣', s: '♠' };
    return map[suit] || suit;
  }

  function renderActions(validActions) {
    if (!validActions || validActions.length === 0) {
      els.actions.innerHTML = '';
      return;
    }

    let html = '';
    for (const action of validActions) {
      switch (action) {
        case 'fold':
          html += '<button class="fold-btn" data-action="fold">Fold</button>';
          break;
        case 'check':
          html += '<button class="check-btn" data-action="check">Check</button>';
          break;
        case 'call':
          html += '<button class="call-btn" data-action="call">Call</button>';
          break;
        case 'bet':
          html += `<div class="bet-input-group">
            <input type="number" id="betAmount" min="1" placeholder="Amount">
            <button class="bet-btn" data-action="bet">Bet</button>
          </div>`;
          break;
        case 'raise':
          html += `<div class="bet-input-group">
            <input type="number" id="raiseAmount" min="1" placeholder="Amount">
            <button class="raise-btn" data-action="raise">Raise</button>
          </div>`;
          break;
        case 'allIn':
          html += '<button class="allin-btn" data-action="allIn">All In</button>';
          break;
      }
    }
    els.actions.innerHTML = html;

    // Attach event listeners
    els.actions.querySelectorAll('button[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        let amount;
        if (action === 'bet') {
          const input = document.getElementById('betAmount');
          amount = input ? Number(input.value) : undefined;
        } else if (action === 'raise') {
          const input = document.getElementById('raiseAmount');
          amount = input ? Number(input.value) : undefined;
        }
        send({ type: 'action', action, amount });
        els.actions.innerHTML = '';
        els.timerBar.classList.add('hidden');
        stopTimerDisplay();
      });
    });
  }

  function startTimerDisplay() {
    els.timerBar.classList.remove('hidden');
    els.timerFill.style.width = '100%';
    els.timerFill.className = 'timer-fill';

    let remaining = timeRemaining;
    stopTimerDisplay();

    timerInterval = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        stopTimerDisplay();
        els.timerBar.classList.add('hidden');
        return;
      }
      const pct = (remaining / timeRemaining) * 100;
      els.timerFill.style.width = `${pct}%`;

      if (pct < 20) {
        els.timerFill.className = 'timer-fill critical';
      } else if (pct < 50) {
        els.timerFill.className = 'timer-fill warning';
      }
    }, 1000);
  }

  function stopTimerDisplay() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function renderShowdown(msg) {
    let text = 'Showdown! ';
    if (msg.winners && msg.winners.length > 0) {
      text += msg.winners.map((w) => `${w.displayName} wins ${w.potWon} with ${w.hand}`).join(', ');
    }
    showNotification(text);
  }

  function renderGameOver(msg) {
    showScreen('gameOverScreen');
    stopTimerDisplay();

    if (msg.winner) {
      els.winnerAnnouncement.textContent = `${msg.winner.displayName} wins with ${msg.winner.chips} chips!`;
    }

    if (msg.finalStandings && msg.finalStandings.length > 0) {
      let html = '<table><tr><th>#</th><th>Player</th></tr>';
      msg.finalStandings.sort((a, b) => a.position - b.position);
      for (const s of msg.finalStandings) {
        html += `<tr><td>${s.position}</td><td>${escapeHtml(s.displayName)}</td></tr>`;
      }
      html += '</table>';
      els.finalStandings.innerHTML = html;
    }
  }

  // --- Utilities ---
  function showError(msg) {
    els.errorMsg.textContent = msg;
    showNotification(msg);
    setTimeout(() => {
      els.errorMsg.textContent = '';
    }, 5000);
  }

  function showNotification(msg) {
    els.notification.textContent = msg;
    els.notification.classList.remove('hidden');
    setTimeout(() => {
      els.notification.classList.add('hidden');
    }, 4000);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // --- Chat ---
  function appendChatMessage(msg) {
    const div = document.createElement('div');
    div.classList.add('msg');
    if (msg.system) {
      div.classList.add('system');
      div.textContent = msg.text;
    } else {
      const sender = document.createElement('span');
      sender.classList.add('sender');
      sender.textContent = msg.from.displayName + ': ';
      div.appendChild(sender);
      div.appendChild(document.createTextNode(msg.text));
    }
    els.chatMessages.appendChild(div);
    els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
  }

  function sendChatMessage() {
    const text = els.chatInput.value.trim();
    if (!text) return;
    send({ type: 'chat', text });
    els.chatInput.value = '';
  }

  // --- Event Listeners ---
  els.createBtn.addEventListener('click', () => {
    const name = els.displayName.value.trim();
    if (!name) {
      showError('Please enter a display name');
      return;
    }
    send({ type: 'create', displayName: name });
  });

  els.joinBtn.addEventListener('click', () => {
    const name = els.displayName.value.trim();
    const code = els.roomCodeInput.value.trim().toUpperCase();
    if (!name) {
      showError('Please enter a display name');
      return;
    }
    if (!code || code.length !== 6) {
      showError('Please enter a valid 6-character room code');
      return;
    }
    send({ type: 'join', roomCode: code, displayName: name });
  });

  els.startBtn.addEventListener('click', () => {
    send({ type: 'start' });
  });

  els.copyCode.addEventListener('click', () => {
    if (roomCode) {
      navigator.clipboard.writeText(roomCode).then(() => {
        showNotification('Room code copied!');
      });
    }
  });

  els.leaveBtn.addEventListener('click', () => {
    send({ type: 'leave' });
    sessionStorage.removeItem('roomCode');
    sessionStorage.removeItem('playerId');
    showScreen('landing');
  });

  // Handle Enter key on inputs
  els.displayName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') els.createBtn.click();
  });
  els.roomCodeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') els.joinBtn.click();
  });

  // Chat event listeners
  els.chatSendBtn.addEventListener('click', sendChatMessage);
  els.chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChatMessage();
  });

  // --- Init ---
  connect();
})();
