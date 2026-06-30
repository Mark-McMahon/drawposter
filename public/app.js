'use strict';

// ---------- connection ----------
let ws = null;
let state = null;       // latest StateView from server
let myId = null;
let myCode = null;
let reconnectTimer = null;

function wsUrl() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}`;
}

function connect(onOpen) {
  ws = new WebSocket(wsUrl());
  ws.addEventListener('open', () => {
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    if (onOpen) onOpen();
  });
  ws.addEventListener('message', (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    handleServer(msg);
  });
  ws.addEventListener('close', () => {
    if (myCode) toast('Connection lost — reconnecting…', true);
  });
}

function send(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function handleServer(msg) {
  switch (msg.t) {
    case 'joined':
      myId = msg.playerId; myCode = msg.code;
      showGame();
      break;
    case 'state':
      state = msg;
      render();
      break;
    case 'error':
      toast(msg.message, true);
      // re-enable a possibly-disabled start button etc. by re-rendering
      render();
      break;
    case 'kicked':
      toast('You were removed from the room.', true);
      backHome();
      break;
    default:
      break;
  }
}

// ---------- home ----------
const $ = (sel) => document.querySelector(sel);

function nameValue() {
  const n = $('#nameInput').value.trim();
  return n;
}

$('#createBtn').addEventListener('click', () => {
  const name = nameValue();
  if (!name) { homeErr('Enter a name first.'); return; }
  homeErr('');
  connect(() => send({ t: 'create', name }));
});

$('#joinBtn').addEventListener('click', () => doJoin());
$('#codeInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(); });
$('#nameInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#createBtn').click(); });

function doJoin() {
  const name = nameValue();
  const code = $('#codeInput').value.replace(/\D/g, '').slice(0, 6);
  if (!name) { homeErr('Enter a name first.'); return; }
  if (code.length !== 6) { homeErr('Enter the 6-digit room code.'); return; }
  homeErr('');
  connect(() => send({ t: 'join', code, name }));
}

function homeErr(t) { $('#homeError').textContent = t; }

$('#leaveBtn').addEventListener('click', () => {
  send({ t: 'leave' });
  if (ws) ws.close();
  backHome();
});
$('#copyBtn').addEventListener('click', () => {
  if (!myCode) return;
  navigator.clipboard?.writeText(myCode).then(() => toast('Code copied'));
});

function showGame() {
  $('#home').classList.add('hidden');
  $('#game').classList.remove('hidden');
  $('#roomCode').textContent = myCode;
}
function backHome() {
  myCode = null; myId = null; state = null; lastPhase = null;
  $('#game').classList.add('hidden');
  $('#home').classList.remove('hidden');
}

// ---------- toast ----------
let toastTimer = null;
function toast(text, isErr) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.toggle('err', !!isErr);
  el.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2600);
}

// ---------- render dispatch ----------
let lastPhase = null;
const main = () => $('#main');

function me() { return state ? state.players.find((p) => p.id === myId) : null; }

function render() {
  if (!state) return;
  updateTopbar();
  if (state.phase !== lastPhase) {
    buildSkeleton(state.phase);
    lastPhase = state.phase;
  }
  switch (state.phase) {
    case 'lobby': renderLobby(); break;
    case 'playing': renderPlaying(); break;
    case 'guessing': renderPlaying(); renderGuessing(); break;
    case 'reveal': renderReveal(); break;
  }
}

function updateTopbar() {
  const badge = $('#roleBadge');
  const self = state.self;
  let txt = 'Lobby', cls = '';
  if (state.phase === 'lobby') { txt = `${state.players.filter(p=>p.connected).length} in lobby`; }
  else if (self.role === 'imposter') { txt = 'You are the IMPOSTER'; cls = 'imposter'; }
  else if (self.role === 'innocent') { txt = 'You are innocent'; cls = 'innocent'; }
  else { txt = 'Spectating'; }
  badge.textContent = txt;
  badge.className = 'role-badge ' + cls;
}

// ---------- skeletons ----------
function buildSkeleton(phase) {
  removeGuessOverlay();
  if (phase === 'lobby') {
    main().innerHTML = `
      <h2 class="section-title">Players</h2>
      <div id="lobbyPlayers" class="player-list"></div>
      <h2 class="section-title">Settings</h2>
      <div id="lobbySettings"></div>
      <div id="lobbyStart" class="action-bar"></div>`;
  } else if (phase === 'playing' || phase === 'guessing') {
    main().innerHTML = `
      <div class="play-grid">
        <aside class="play-side">
          <div class="side-panel">
            <div class="side-head"><span>Players &amp; votes</span><span id="thr" class="thr"></span></div>
            <div id="voteList" class="vote-list"></div>
            <div class="side-foot">
              <button id="abstainBtn" class="btn tiny block ghost">Clear my vote</button>
              <p class="side-note">Tap a player to vote them out.</p>
            </div>
          </div>
        </aside>
        <section class="play-main">
          <div class="wordbar">
            <div id="turnWho" class="turn-who"></div>
            <div id="rolePanel" class="rolechip"></div>
            <div id="timer" class="timer">--</div>
          </div>
          <div id="canvasWrap" class="canvas-wrap">
            <canvas id="board"></canvas>
            <div id="canvasHint" class="canvas-hint hidden"></div>
          </div>
        </section>
      </div>`;
    setupCanvas();
    $('#abstainBtn').addEventListener('click', () => send({ t: 'vote', target: null }));
  } else if (phase === 'reveal') {
    main().innerHTML = `<div id="revealRoot"></div>`;
  }
}

// ---------- lobby ----------
function renderLobby() {
  const isHost = state.self.isHost;
  // players
  const pl = $('#lobbyPlayers');
  pl.innerHTML = '';
  for (const p of state.players) {
    const row = document.createElement('div');
    row.className = 'player-row';
    row.innerHTML = `
      <span class="swatch" style="background:${p.color}"></span>
      <span class="pname">${esc(p.name)}</span>
      ${p.isHost ? '<span class="tag host">host</span>' : ''}
      ${p.id === myId ? '<span class="tag you">you</span>' : ''}
      ${!p.connected ? '<span class="tag dc">offline</span>' : ''}`;
    if (isHost && p.id !== myId) {
      const k = document.createElement('button');
      k.className = 'btn tiny ghost';
      k.textContent = 'kick';
      k.onclick = () => send({ t: 'kick', playerId: p.id });
      row.appendChild(k);
    }
    pl.appendChild(row);
  }

  // settings
  const s = state.settings;
  const sEl = $('#lobbySettings');
  const disabled = !isHost;
  sEl.innerHTML = `
    <div class="settings">
      ${segRow('Imposters', 'How many hidden imposters', 'imposterCount', [['1',1],['2',2]], s.imposterCount, disabled)}
      ${segRow('Category hint', 'Tell the imposter the category', 'hint', [['Off',false],['On',true]], s.hint, disabled)}
      ${segRow('Decoy word', 'Give the imposter a close wrong word', 'decoy', [['Off',false],['On',true]], s.decoy, disabled)}
      ${segRow('Turn timer', 'Seconds per stroke', 'turnSeconds', [['15s',15],['20s',20]], s.turnSeconds, disabled)}
      <div class="set-row" style="flex-direction:column;align-items:stretch">
        <div><div class="label">Categories</div><div class="sub">Words are drawn from these</div></div>
        <div class="cats" id="catChips"></div>
      </div>
    </div>
    ${isHost ? '' : '<p class="note">Only the host can change settings.</p>'}`;

  // segmented control handlers
  sEl.querySelectorAll('[data-seg]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (disabled) return;
      const key = btn.getAttribute('data-seg');
      const val = JSON.parse(btn.getAttribute('data-val'));
      send({ t: 'settings', settings: { [key]: val } });
    });
  });

  // category chips
  const chips = $('#catChips');
  chips.innerHTML = '';
  for (const c of state.allCategories) {
    const on = s.categories.includes(c);
    const chip = document.createElement('button');
    chip.className = 'chip' + (on ? ' on' : '');
    chip.textContent = c;
    if (isHost) chip.onclick = () => {
      let next = on ? s.categories.filter((x) => x !== c) : [...s.categories, c];
      if (next.length === 0) { toast('Keep at least one category', true); return; }
      send({ t: 'settings', settings: { categories: next } });
    };
    chips.appendChild(chip);
  }

  // start button
  const startEl = $('#lobbyStart');
  const count = state.players.filter((p) => p.connected).length;
  if (isHost) {
    const canStart = count >= 3;
    startEl.innerHTML = `<button id="startBtn" class="btn primary big" ${canStart ? '' : 'disabled'}>
      ${canStart ? 'Start round' : `Need ${3 - count} more player${3 - count === 1 ? '' : 's'}`}</button>`;
    $('#startBtn').onclick = () => send({ t: 'start' });
  } else {
    startEl.innerHTML = `<p class="note" style="text-align:center">Waiting for the host to start…</p>`;
  }
}

function segRow(label, sub, key, opts, current, disabled) {
  const buttons = opts.map(([txt, val]) =>
    `<button data-seg="${key}" data-val='${JSON.stringify(val)}' class="${val === current ? 'on' : ''}">${txt}</button>`
  ).join('');
  return `<div class="set-row">
    <div><div class="label">${label}</div><div class="sub">${sub}</div></div>
    <div class="seg">${buttons}</div>
  </div>`;
}

// ---------- playing ----------
function renderPlaying() {
  const self = state.self;
  const amTurn = state.currentTurnId === myId && self.alive;
  const turnPlayer = state.players.find((p) => p.id === state.currentTurnId);

  // who is drawing (reinforces the highlighted row in the side panel)
  const tw = $('#turnWho');
  if (!state.currentTurnId) { tw.textContent = 'Waiting...'; tw.className = 'turn-who'; }
  else if (amTurn) { tw.innerHTML = 'Your turn &mdash; draw one stroke'; tw.className = 'turn-who you'; }
  else { tw.innerHTML = `<b>${esc(turnPlayer ? turnPlayer.name : '?')}</b> is drawing`; tw.className = 'turn-who'; }

  // your role / word
  const rp = $('#rolePanel');
  if (self.role === 'imposter') {
    let hint;
    if (self.decoy) hint = `<span class="hintline">draw: <span class="decoy">${esc(self.decoy)}</span></span>`;
    else if (self.category) hint = `<span class="hintline">category: <b>${esc(self.category)}</b></span>`;
    else hint = `<span class="hintline">no clue &mdash; blend in</span>`;
    rp.className = 'rolechip imp';
    rp.innerHTML = `<span class="label">you are the</span><span class="word">imposter</span>${hint}`;
  } else if (self.role === 'innocent') {
    rp.className = 'rolechip';
    rp.innerHTML = `<span class="label">your word</span><span class="word">${esc(self.word || '')}</span>`;
  } else {
    rp.className = 'rolechip';
    rp.innerHTML = `<span class="label">you are</span><span class="word" style="letter-spacing:0">spectating</span>`;
  }

  // canvas
  const wrap = $('#canvasWrap');
  wrap.classList.toggle('mydraw', amTurn);
  const hint = $('#canvasHint');
  if (amTurn) { hint.classList.remove('hidden'); hint.textContent = 'Draw one continuous stroke'; }
  else hint.classList.add('hidden');
  resizeCanvas();
  redraw();

  // threshold + votes
  $('#thr').textContent = `${state.threshold} to vote out · ${state.livingCount} alive`;
  renderVoteList();

  // timer
  startTimerLoop();
}

function renderVoteList() {
  const list = $('#voteList');
  list.innerHTML = '';
  const myVote = (state.players.find((p) => p.id === myId) || {}).votingFor;
  const iAmAlive = state.self.alive;
  const topScore = Math.max(0, ...state.players.map((p) => p.score || 0));
  for (const p of state.players) {
    const wins = p.score || 0;
    const isLeader = wins > 0 && wins === topScore;
    const winsBadge = wins > 0
      ? `<span class="wins${isLeader ? ' leader' : ''}" title="${wins} win${wins === 1 ? '' : 's'}">&#9733; ${wins}</span>`
      : '';
    const isDrawing = p.id === state.currentTurnId;
    const isMine = myVote === p.id;
    const targetable = iAmAlive && p.alive && p.connected && p.id !== myId;
    const row = document.createElement('div');
    row.className = 'vote-row'
      + (!p.alive || !p.connected ? ' dead' : '')
      + (isMine ? ' mine' : '')
      + (isDrawing ? ' drawing' : '')
      + (targetable ? ' votable' : ' disabled');
    const voters = state.players.filter((v) => v.votingFor === p.id);
    const voterSwatches = voters
      .slice(0, 3)
      .map((v) => `<span class="swatch" style="background:${v.color}"></span>`).join('');
    const hot = p.votesReceived > 0 && p.votesReceived >= state.threshold;
    const sub = [];
    if (p.id === myId) sub.push('you');
    if (p.isHost) sub.push('host');
    if (!p.connected) sub.push('offline');
    else if (!p.alive) sub.push('out');
    const cta = targetable
      ? (isMine ? '<span class="vote-cta voted">Voted</span>' : '<span class="vote-cta">Vote</span>')
      : '';
    // second line only appears when there's something to act on or show —
    // keeps dead/offline/quiet rows to a single compact identity line.
    const showBar = targetable || p.votesReceived > 0;
    const bar = showBar ? `
      <div class="vote-bar">
        <span class="vote-meter">
          <span class="vlabel">votes</span>
          <span class="voters">${voterSwatches}</span>
          <span class="vote-num ${hot ? 'hot' : ''}">${p.votesReceived}</span>
        </span>
        ${cta}
      </div>` : '';
    row.innerHTML = `
      <div class="vote-id">
        <span class="swatch" style="background:${p.color}"></span>
        <span class="pname ${!p.alive ? 'dead' : ''}"><span class="nm">${esc(p.name)}</span>${sub.length ? `<small>${sub.join(' &middot; ')}</small>` : ''}</span>
        ${winsBadge}
        ${isDrawing ? '<span class="drawing-tag" title="Drawing now" aria-label="drawing"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M14 6l4 4"/></svg></span>' : ''}
      </div>
      ${bar}`;
    if (targetable) {
      row.onclick = () => send({ t: 'vote', target: isMine ? null : p.id });
    }
    list.appendChild(row);
  }

  // "Clear my vote" only matters once you've actually voted
  const abstain = $('#abstainBtn');
  if (abstain) abstain.classList.toggle('hidden', !myVote);
}

// ---------- canvas ----------
let canvas = null, ctx = null, drawing = false, curStroke = null;

function setupCanvas() {
  canvas = $('#board');
  ctx = canvas.getContext('2d');
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointerleave', onUp);
  window.addEventListener('resize', () => { if (canvas) { resizeCanvas(); redraw(); } });
}

function canDraw() {
  return state && state.phase === 'playing' && state.currentTurnId === myId && state.self.alive;
}

function ptFromEvent(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: clamp01((e.clientX - r.left) / r.width),
    y: clamp01((e.clientY - r.top) / r.height),
  };
}

function onDown(e) {
  if (!canDraw()) return;
  e.preventDefault();
  drawing = true;
  curStroke = [ptFromEvent(e)];
  canvas.setPointerCapture?.(e.pointerId);
  redraw();
}
function onMove(e) {
  if (!drawing) return;
  e.preventDefault();
  const p = ptFromEvent(e);
  const last = curStroke[curStroke.length - 1];
  if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 0.003) {
    curStroke.push(p);
    redraw();
  }
}
function onUp(e) {
  if (!drawing) return;
  drawing = false;
  const stroke = curStroke || [];
  curStroke = null;
  if (stroke.length >= 1 && canDraw()) {
    send({ t: 'stroke', points: stroke });
  }
  redraw();
}

function resizeCanvas() {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const r = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width * dpr));
  const h = Math.max(1, Math.round(r.height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w; canvas.height = h;
  }
}

function drawStroke(points, color) {
  if (!points || points.length === 0) return;
  const w = canvas.width, h = canvas.height;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, w * 0.007);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (points.length === 1) {
    // a dot
    ctx.arc(points[0].x * w, points[0].y * h, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    return;
  }
  ctx.moveTo(points[0].x * w, points[0].y * h);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x * w, points[i].y * h);
  ctx.stroke();
}

function redraw() {
  if (!ctx || !canvas || !state) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const s of state.strokes) drawStroke(s.points, s.color);
  if (curStroke) {
    const meP = me();
    drawStroke(curStroke, meP ? meP.color : '#000');
  }
}

// ---------- timer loop ----------
let timerRAF = null;
function startTimerLoop() {
  if (timerRAF) return;
  const tick = () => {
    timerRAF = null;
    if (!state || (state.phase !== 'playing')) { updateTimer(); return; }
    updateTimer();
    timerRAF = requestAnimationFrame(tick);
  };
  timerRAF = requestAnimationFrame(tick);
}
function updateTimer() {
  const el = document.getElementById('timer');
  if (!el) return;
  if (!state || state.phase !== 'playing' || !state.turnEndsAt) { el.textContent = '--'; el.classList.remove('low'); return; }
  const remaining = Math.max(0, state.turnEndsAt - Date.now());
  const secs = Math.ceil(remaining / 1000);
  el.textContent = secs + 's';
  el.classList.toggle('low', secs <= 5);
}

// ---------- guessing ----------
function renderGuessing() {
  const amGuesser = state.guessingId === myId;
  const guesser = state.players.find((p) => p.id === state.guessingId);
  let ov = document.getElementById('guessOverlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'guessOverlay';
    ov.className = 'overlay';
    document.body.appendChild(ov);
  }
  if (amGuesser) {
    ov.innerHTML = `
      <div class="card guess-card">
        <h2>You were caught!</h2>
        <p class="tagline">Steal the win &mdash; type the secret word.</p>
        <input id="guessInput" type="text" maxlength="40" placeholder="the secret word…" autocomplete="off" />
        <div class="actions">
          <button id="guessSkipBtn" class="btn ghost">Give up</button>
          <button id="guessBtn" class="btn primary">Guess</button>
        </div>
      </div>`;
    const input = document.getElementById('guessInput');
    input.focus();
    const submit = () => {
      const w = input.value.trim();
      if (!w) return;
      send({ t: 'guess', word: w });
    };
    document.getElementById('guessBtn').onclick = submit;
    input.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
    document.getElementById('guessSkipBtn').onclick = () => send({ t: 'guessSkip' });
  } else {
    ov.innerHTML = `
      <div class="card guess-card">
        <h2>Imposter caught!</h2>
        <p class="tagline"><b>${esc(guesser ? guesser.name : 'They')}</b> is taking a last-chance guess at the word...</p>
      </div>`;
  }
}
function removeGuessOverlay() {
  const ov = document.getElementById('guessOverlay');
  if (ov) ov.remove();
}

// ---------- reveal ----------
function renderReveal() {
  removeGuessOverlay();
  const r = state.result;
  const self = state.self;
  const root = $('#revealRoot');
  if (!r) { root.innerHTML = ''; return; }

  const mySide = self.role === 'imposter' ? 'imposters' : self.role === 'innocent' ? 'innocents' : null;
  const iWon = mySide && mySide === r.winner;
  const heroClass = mySide == null ? 'neutral' : (iWon ? 'win' : 'lose');
  const winnerLabel = r.winner === 'imposters' ? 'Imposters win' : 'The group wins';

  // sorted scoreboard
  const sorted = [...state.players].sort((a, b) => b.score - a.score);

  root.innerHTML = `
    <div class="result-hero ${heroClass}">
      <h2>${winnerLabel}${mySide ? (iWon ? ' &mdash; you win' : ' &mdash; you lose') : ''}</h2>
      <div class="reason">${esc(r.reason)}</div>
    </div>
    <div class="reveal-art">
      <div class="reveal-word">The word was <b>${esc(r.word)}</b></div>
      <div class="canvas-wrap reveal-canvas"><canvas id="revealBoard"></canvas></div>
      ${r.guess ? `<div class="reveal-guess"><b>${esc(r.guesser || 'The imposter')}</b> guessed &ldquo;${esc(r.guess)}&rdquo; &mdash; wrong</div>` : ''}
      <button id="saveBtn" class="btn ghost">Save picture</button>
    </div>
    <h2 class="section-title">Scoreboard</h2>
    <div class="scoreboard" id="scoreboard"></div>
    <div id="nextActions" class="action-bar"></div>`;

  // scoreboard rows — ranked by wins, with the leader(s) crowned
  const sb = $('#scoreboard');
  sb.innerHTML = '';
  const topScore = sorted.length ? sorted[0].score : 0;
  let rank = 0, prevScore = null, seen = 0;
  for (const p of sorted) {
    seen++;
    if (prevScore === null || p.score !== prevScore) { rank = seen; prevScore = p.score; }
    const isLeader = p.score > 0 && p.score === topScore;
    const row = document.createElement('div');
    row.className = 'score-row' + (isLeader ? ' leader' : '');
    row.innerHTML = `
      <span class="rank">${rank}</span>
      <span class="swatch" style="background:${p.color}"></span>
      <span class="pname ${!p.alive ? 'dead' : ''}">${esc(p.name)}${p.id === myId ? ' (you)' : ''}${isLeader ? ' <span class="crown" title="Most wins">&#9733;</span>' : ''}</span>
      ${p.role ? `<span class="role-pill ${p.role}">${p.role}</span>` : ''}
      <span class="pts">${p.score}<small>${p.score === 1 ? 'win' : 'wins'}</small></span>`;
    sb.appendChild(row);
  }

  // reveal canvas
  const rc = $('#revealBoard');
  const rctx = rc.getContext('2d');
  const drawReveal = () => {
    const dpr = window.devicePixelRatio || 1;
    const rect = rc.getBoundingClientRect();
    rc.width = Math.round(rect.width * dpr);
    rc.height = Math.round(rect.height * dpr);
    rctx.clearRect(0, 0, rc.width, rc.height);
    const strokes = state.revealStrokes || state.strokes || [];
    for (const s of strokes) {
      rctx.strokeStyle = s.color; rctx.fillStyle = s.color;
      rctx.lineWidth = Math.max(2, rc.width * 0.007);
      rctx.lineCap = 'round'; rctx.lineJoin = 'round';
      rctx.beginPath();
      if (s.points.length === 1) {
        rctx.arc(s.points[0].x * rc.width, s.points[0].y * rc.height, rctx.lineWidth / 2, 0, Math.PI * 2);
        rctx.fill(); continue;
      }
      rctx.moveTo(s.points[0].x * rc.width, s.points[0].y * rc.height);
      for (let i = 1; i < s.points.length; i++) rctx.lineTo(s.points[i].x * rc.width, s.points[i].y * rc.height);
      rctx.stroke();
    }
  };
  requestAnimationFrame(drawReveal);

  $('#saveBtn').onclick = () => {
    // composite onto white so the PNG isn't transparent
    const out = document.createElement('canvas');
    out.width = rc.width; out.height = rc.height;
    const octx = out.getContext('2d');
    octx.fillStyle = '#ffffff'; octx.fillRect(0, 0, out.width, out.height);
    octx.drawImage(rc, 0, 0);
    const a = document.createElement('a');
    a.href = out.toDataURL('image/png');
    a.download = `drawposter-${r.word}.png`;
    a.click();
  };

  // next round / waiting
  const na = $('#nextActions');
  if (self.isHost) {
    na.innerHTML = `<button id="nextBtn" class="btn primary big">Start next round</button>`;
    $('#nextBtn').onclick = () => send({ t: 'start' });
  } else {
    na.innerHTML = `<p class="note" style="text-align:center;width:100%">Waiting for the host to start the next round…</p>`;
  }
}

// ---------- utils ----------
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
