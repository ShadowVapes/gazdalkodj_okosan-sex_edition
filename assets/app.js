
import { SUPABASE_URL, SUPABASE_ANON_KEY, DEMO_MODE } from './config.js';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const STORAGE = {
  clientId: 'gp_rewrite_client_id',
  playerName: 'gp_rewrite_player_name',
  roomCode: 'gp_rewrite_room_code',
};

const refs = {
  lobbyScreen: $('#lobbyScreen'),
  gameScreen: $('#gameScreen'),
  playerNameInput: $('#playerNameInput'),
  roomCodeInput: $('#roomCodeInput'),
  createRoomBtn: $('#createRoomBtn'),
  joinRoomBtn: $('#joinRoomBtn'),
  refreshLobbyBtn: $('#refreshLobbyBtn'),
  leaveRoomBtn: $('#leaveRoomBtn'),
  backToLobbyBtn: $('#backToLobbyBtn'),
  leaveGameBtn: $('#leaveGameBtn'),
  startGameBtn: $('#startGameBtn'),
  lobbyError: $('#lobbyError'),
  roomPanel: $('#roomPanel'),
  roomCodeTitle: $('#roomCodeTitle'),
  lobbyPlayers: $('#lobbyPlayers'),
  lobbyMeta: $('#lobbyMeta'),
  gameRoomTitle: $('#gameRoomTitle'),
  board: $('#board'),
  diceBtn: $('#diceBtn'),
  diceLabel: $('#diceLabel'),
  drawDeckBtn: $('#drawDeckBtn'),
  overlay: $('#overlay'),
  actionInfo: $('#actionInfo'),
  turnInfo: $('#turnInfo'),
  playersPanel: $('#playersPanel'),
  logPanel: $('#logPanel'),
  connectionStatus: $('#connectionStatus'),
  titleMain: $('#titleMain'),
  subtitleMain: $('#subtitleMain'),
};

const state = {
  clientId: localStorage.getItem(STORAGE.clientId) || crypto.randomUUID(),
  room: null,
  roomPlayers: [],
  configRows: [],
  config: {},
  items: [],
  itemMap: new Map(),
  tiles: [],
  tilesById: new Map(),
  pathTiles: [],
  cards: [],
  cardsByGroup: new Map(),
  lastFlashEventId: null,
  lastOverlayHash: '',
  overlaySelection: new Set(),
  pollHandle: null,
  defsHandle: null,
  tickHandle: null,
  busy: false,
};

localStorage.setItem(STORAGE.clientId, state.clientId);

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function text(value, fallback = '') {
  return value == null ? fallback : String(value);
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function setStatus(msg, bad = false) {
  refs.connectionStatus.textContent = msg;
  refs.connectionStatus.style.background = bad ? 'rgba(135,37,53,.35)' : '#1b2649';
}
function showError(msg) {
  refs.lobbyError.textContent = msg;
  refs.lobbyError.classList.remove('hidden');
}
function clearError() {
  refs.lobbyError.classList.add('hidden');
  refs.lobbyError.textContent = '';
}
function randCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
function nowIso() {
  return new Date().toISOString();
}
function getCfg(key, fallback) {
  const raw = state.config[key];
  if (raw === undefined) return fallback;
  return raw;
}
function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}
function hashText(value) {
  let h = 0;
  const str = String(value || '');
  for (let i = 0; i < str.length; i += 1) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return String(h);
}
function parseEffect(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}
function getPalette(kind, accent, textColor) {
  if (accent) return { bg: accent, fg: textColor || '#ffffff' };
  const table = {
    start: { bg: 'linear-gradient(180deg, #8a6620, #3b2b0a)', fg: '#fff3d0' },
    money: { bg: 'linear-gradient(180deg, #315c3e, #183120)', fg: '#ecfff2' },
    card: { bg: 'linear-gradient(180deg, #6a2d55, #301626)', fg: '#fff0fa' },
    shop: { bg: 'linear-gradient(180deg, #7d6126, #39290c)', fg: '#fff5df' },
    skip: { bg: 'linear-gradient(180deg, #683444, #301522)', fg: '#ffeef3' },
    move: { bg: 'linear-gradient(180deg, #4a4186, #201d41)', fg: '#f5f0ff' },
    neutral: { bg: 'linear-gradient(180deg, #32476f, #16233c)', fg: '#eef5ff' },
  };
  return table[kind] || table.neutral;
}
function ensureName() {
  const name = (refs.playerNameInput.value || localStorage.getItem(STORAGE.playerName) || '').trim();
  if (!name) {
    showError('Adj meg egy játékosnevet.');
    return null;
  }
  localStorage.setItem(STORAGE.playerName, name);
  refs.playerNameInput.value = name;
  return name.slice(0, 24);
}
function getMeRow() {
  return state.roomPlayers.find((p) => p.client_id === state.clientId) || null;
}
function getRoomState() {
  return state.room?.state || null;
}
function getCurrentPlayer(gameState = getRoomState()) {
  if (!gameState?.players?.length) return null;
  return gameState.players[gameState.turnIndex] || null;
}
function getPlayerColor(index) {
  const colors = ['#ff8a8a', '#71b8ff', '#65d697', '#ff92d0', '#e8bb63', '#b39bff'];
  return colors[index % colors.length];
}

function computeRingPositions(count, cols, rows) {
  const left = 0;
  const top = 0;
  const right = Math.max(0, cols - 1);
  const bottom = Math.max(0, rows - 1);
  const ring = [];
  for (let x = left; x <= right; x += 1) ring.push([x, top]);
  for (let y = top + 1; y <= bottom; y += 1) ring.push([right, y]);
  for (let x = right - 1; x >= left; x -= 1) ring.push([x, bottom]);
  for (let y = bottom - 1; y > top; y -= 1) ring.push([left, y]);
  const unique = [];
  const seen = new Set();
  ring.forEach(([x, y]) => {
    const key = `${x},${y}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push([x, y]);
    }
  });
  if (!unique.length) unique.push([0, 0]);
  return Array.from({ length: count }, (_, i) => unique[i % unique.length]);
}

function buildPathTiles(rawTiles) {
  const tiles = [...rawTiles].sort((a, b) => num(a.sort_order) - num(b.sort_order) || num(a.id) - num(b.id));
  const byId = new Map(tiles.map((t) => [t.id, t]));
  let start = tiles.find((t) => t.kind === 'start') || tiles[0] || null;
  if (!start) return [];
  const path = [];
  const visited = new Set();
  let current = start;
  while (current && !visited.has(current.id) && path.length < tiles.length) {
    visited.add(current.id);
    path.push(current);
    current = byId.get(current.next_tile_id) || null;
    if (!current && path.length < tiles.length) {
      current = tiles.find((t) => !visited.has(t.id)) || null;
    }
  }
  if (path.length < tiles.length) {
    tiles.forEach((t) => {
      if (!visited.has(t.id)) path.push(t);
    });
  }
  const cols = Math.max(8, num(getCfg('board_cols', 12), 12));
  const rows = Math.max(8, num(getCfg('board_rows', 12), 12));
  const autoPositions = computeRingPositions(path.length, cols, rows);
  return path.map((tile, index) => {
    const clone = { ...tile };
    clone.path_index = index;
    clone.board_x = Number.isFinite(num(tile.board_x, NaN)) ? num(tile.board_x) : autoPositions[index][0];
    clone.board_y = Number.isFinite(num(tile.board_y, NaN)) ? num(tile.board_y) : autoPositions[index][1];
    return clone;
  });
}

function buildCardsByGroup(cards) {
  const map = new Map();
  cards.forEach((card) => {
    const key = text(card.card_group || 'chance', 'chance');
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(card);
  });
  return map;
}

async function loadDefinitions() {
  const [cfgRes, itemRes, tileRes, cardRes] = await Promise.all([
    supabase.from('game_config').select('*').order('key'),
    supabase.from('game_items').select('*').order('sort_order', { ascending: true }).order('id', { ascending: true }),
    supabase.from('game_tiles').select('*').order('sort_order', { ascending: true }).order('id', { ascending: true }),
    supabase.from('game_cards').select('*').order('sort_order', { ascending: true }).order('id', { ascending: true }),
  ]);
  const failed = [cfgRes, itemRes, tileRes, cardRes].find((r) => r.error);
  if (failed) {
    setStatus('Definíció betöltési hiba', true);
    throw failed.error;
  }

  state.configRows = cfgRes.data || [];
  state.config = {};
  state.configRows.forEach((row) => {
    const parsed = parseEffect(row.value);
    state.config[row.key] = parsed.value;
  });

  state.items = itemRes.data || [];
  state.itemMap = new Map(state.items.map((item) => [item.id, item]));

  state.tiles = tileRes.data || [];
  state.tilesById = new Map(state.tiles.map((tile) => [tile.id, tile]));
  state.pathTiles = buildPathTiles(state.tiles);

  state.cards = cardRes.data || [];
  state.cardsByGroup = buildCardsByGroup(state.cards);

  refs.titleMain.textContent = text(getCfg('game_title', 'Gazdálkodj Pajkosan'));
  refs.subtitleMain.textContent = text(getCfg('game_subtitle', 'Újraírt verzió.'));
  renderBoard();
}

function ensureBoardCssSize() {
  const cols = Math.max(8, num(getCfg('board_cols', 12), 12));
  const rows = Math.max(8, num(getCfg('board_rows', 12), 12));
  refs.board.style.setProperty('--cols', cols);
  refs.board.style.setProperty('--rows', rows);
}

function renderBoard() {
  ensureBoardCssSize();
  refs.board.innerHTML = '';
  state.pathTiles.forEach((tile) => {
    const palette = getPalette(tile.kind, tile.accent_color, tile.text_color);
    const el = document.createElement('div');
    el.className = `tile ${tile.kind || 'neutral'}`;
    el.dataset.pathIndex = String(tile.path_index);
    el.style.gridColumn = String(num(tile.board_x, 0) + 1);
    el.style.gridRow = String(num(tile.board_y, 0) + 1);
    el.style.setProperty('--tile-bg', palette.bg);
    el.style.setProperty('--tile-text', palette.fg);
    el.innerHTML = `
      <div class="tile-top">
        <div>
          <div class="tile-short">${escapeHtml(text(tile.short_name || tile.name || 'Mező'))}</div>
          <div class="tile-name">${escapeHtml(text(tile.name || ''))}</div>
        </div>
        <div class="tile-icon">${escapeHtml(text(tile.icon || '⬢'))}</div>
      </div>
      <div class="token-row"></div>
    `;
    refs.board.appendChild(el);
  });
  renderDynamicBits();
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function createRoom() {
  clearError();
  const name = ensureName();
  if (!name) return;
  refs.createRoomBtn.disabled = true;
  try {
    let code = randCode();
    for (let i = 0; i < 12; i += 1) {
      const exists = await supabase.from('rooms').select('id').eq('code', code).maybeSingle();
      if (!exists.data) break;
      code = randCode();
    }

    const roomInsert = await supabase.from('rooms').insert({
      code,
      status: 'lobby',
      host_client_id: state.clientId,
      state: { status: 'lobby', logs: [] },
      updated_at: nowIso(),
    }).select().single();

    if (roomInsert.error) throw roomInsert.error;

    const playerInsert = await supabase.from('room_players').insert({
      room_id: roomInsert.data.id,
      client_id: state.clientId,
      name,
      seat_no: 0,
      last_seen: nowIso(),
    }).select().single();

    if (playerInsert.error) throw playerInsert.error;

    localStorage.setItem(STORAGE.roomCode, code);
    await refreshRoom(code);
  } catch (err) {
    showError(err.message || 'Nem sikerült a szoba létrehozása.');
  } finally {
    refs.createRoomBtn.disabled = false;
  }
}

async function joinRoom() {
  clearError();
  const name = ensureName();
  if (!name) return;
  const code = text(refs.roomCodeInput.value).trim().toUpperCase();
  if (!code) {
    showError('Adj meg szobakódot.');
    return;
  }
  refs.joinRoomBtn.disabled = true;
  try {
    const roomRes = await supabase.from('rooms').select('*').eq('code', code).maybeSingle();
    if (roomRes.error) throw roomRes.error;
    if (!roomRes.data) throw new Error('Nincs ilyen szoba.');

    const playersRes = await supabase.from('room_players').select('*').eq('room_id', roomRes.data.id).order('seat_no', { ascending: true });
    if (playersRes.error) throw playersRes.error;
    const existing = (playersRes.data || []).find((p) => p.client_id === state.clientId);

    if (!existing) {
      if (roomRes.data.status === 'playing') throw new Error('A játék már elindult. Reconnect csak ugyanazzal a böngészővel megy.');
      const nextSeat = (playersRes.data || []).length;
      const insertRes = await supabase.from('room_players').insert({
        room_id: roomRes.data.id,
        client_id: state.clientId,
        name,
        seat_no: nextSeat,
        last_seen: nowIso(),
      });
      if (insertRes.error) throw insertRes.error;
    } else {
      await supabase.from('room_players').update({ name, last_seen: nowIso() }).eq('id', existing.id);
    }

    localStorage.setItem(STORAGE.roomCode, code);
    await refreshRoom(code);
  } catch (err) {
    showError(err.message || 'Nem sikerült a csatlakozás.');
  } finally {
    refs.joinRoomBtn.disabled = false;
  }
}

async function refreshRoom(code = localStorage.getItem(STORAGE.roomCode)) {
  if (!code) return;
  setStatus('Szinkron…');
  const roomRes = await supabase.from('rooms').select('*').eq('code', code).maybeSingle();
  if (roomRes.error) {
    setStatus('Szoba lekérési hiba', true);
    throw roomRes.error;
  }
  if (!roomRes.data) {
    state.room = null;
    state.roomPlayers = [];
    localStorage.removeItem(STORAGE.roomCode);
    renderLobbyOnly();
    return;
  }

  const playersRes = await supabase.from('room_players').select('*').eq('room_id', roomRes.data.id).order('seat_no', { ascending: true });
  if (playersRes.error) throw playersRes.error;

  state.room = roomRes.data;
  state.roomPlayers = playersRes.data || [];
  const me = getMeRow();
  if (me) {
    await supabase.from('room_players').update({ last_seen: nowIso() }).eq('id', me.id);
  }
  setStatus('Kapcsolódva');
  renderEverything();
}

function renderLobbyOnly() {
  refs.lobbyScreen.classList.add('active');
  refs.gameScreen.classList.add('hidden');
  refs.gameScreen.classList.remove('active');
  refs.roomPanel.classList.add('hidden');
  refs.overlay.classList.add('hidden');
}

function showGameScreen() {
  refs.lobbyScreen.classList.remove('active');
  refs.gameScreen.classList.remove('hidden');
  refs.gameScreen.classList.add('active');
}

function renderEverything() {
  if (!state.room) {
    renderLobbyOnly();
    return;
  }
  refs.roomPanel.classList.remove('hidden');
  refs.roomCodeTitle.textContent = state.room.code;
  refs.gameRoomTitle.textContent = `Szoba: ${state.room.code}`;

  refs.lobbyPlayers.innerHTML = '';
  state.roomPlayers.forEach((player, index) => {
    const el = document.createElement('div');
    el.className = `player-card ${player.client_id === state.clientId ? 'me' : ''}`;
    el.innerHTML = `<strong>${escapeHtml(player.name)}</strong><div class="tiny muted-text">Seat #${index + 1}${state.room.host_client_id === player.client_id ? ' • Host' : ''}</div>`;
    refs.lobbyPlayers.appendChild(el);
  });

  refs.lobbyMeta.innerHTML = `
    <div>Státusz: <strong>${escapeHtml(state.room.status || 'lobby')}</strong></div>
    <div>Játékosok: <strong>${state.roomPlayers.length}</strong></div>
    <div>Host: <strong>${escapeHtml((state.roomPlayers.find((p) => p.client_id === state.room.host_client_id) || {}).name || '-')}</strong></div>
  `;

  const isHost = state.room.host_client_id === state.clientId;
  refs.startGameBtn.disabled = !isHost || state.room.status !== 'lobby' || state.roomPlayers.length < 2;

  if (state.room.status === 'playing' || state.room.status === 'finished') showGameScreen();
  renderDynamicBits();
}

function renderDynamicBits() {
  renderPlayersPanel();
  renderLogs();
  renderPawns();
  renderTurnUi();
  renderOverlay();
}

function renderPlayersPanel() {
  refs.playersPanel.innerHTML = '';
  const gameState = getRoomState();
  if (!gameState?.players?.length) {
    refs.playersPanel.innerHTML = '<div class="log-entry">Még nem indult el a játék.</div>';
    return;
  }
  const current = getCurrentPlayer(gameState);
  gameState.players.forEach((player, index) => {
    const items = player.inventory.map((id) => state.itemMap.get(id)).filter(Boolean);
    const el = document.createElement('div');
    el.className = `player-card ${player.clientId === state.clientId ? 'me' : ''} ${current?.clientId === player.clientId && gameState.phase !== 'finished' ? 'active' : ''}`;
    el.innerHTML = `
      <div class="row" style="justify-content:space-between;gap:10px">
        <strong>${escapeHtml(player.name)}</strong>
        <span class="tiny" style="color:${player.color || getPlayerColor(index)}">●</span>
      </div>
      <div class="tiny muted-text">Pénz: ${escapeHtml(String(player.money))} ${escapeHtml(text(getCfg('currency_name', 'Ft')))}</div>
      <div class="tiny muted-text">Pozíció: ${escapeHtml(String(player.position + 1))}${player.skipTurns ? ` • Kimarad: ${player.skipTurns}` : ''}</div>
      <div class="tiny muted-text">Tárgyak: ${items.length ? items.map((item) => `${item.icon} ${item.name}`).join(', ') : 'nincs'}</div>
    `;
    refs.playersPanel.appendChild(el);
  });
}

function renderLogs() {
  const logs = getRoomState()?.logs || [];
  refs.logPanel.innerHTML = '';
  const list = logs.slice(-30).reverse();
  if (!list.length) {
    refs.logPanel.innerHTML = '<div class="log-entry">Még nincs esemény.</div>';
    return;
  }
  list.forEach((entry) => {
    const el = document.createElement('div');
    el.className = 'log-entry';
    el.textContent = entry.text;
    refs.logPanel.appendChild(el);
  });
}

function getDisplayedPosition(player) {
  const gameState = getRoomState();
  const anim = gameState?.animation;
  if (!anim || anim.actorClientId !== player.clientId || !Array.isArray(anim.path) || !anim.path.length) return player.position;
  const elapsed = Date.now() - num(anim.startedAt, 0);
  const stepMs = Math.max(80, num(anim.stepMs, 220));
  const stepIndex = Math.min(anim.path.length - 1, Math.max(0, Math.floor(elapsed / stepMs)));
  return anim.path[stepIndex];
}

function renderPawns() {
  $$('.token-row', refs.board);
  refs.board.querySelectorAll('.token-row').forEach((row) => { row.innerHTML = ''; });
  const gameState = getRoomState();
  if (!gameState?.players?.length) return;

  gameState.players.forEach((player, index) => {
    const pos = getDisplayedPosition(player);
    const cell = refs.board.querySelector(`.tile[data-path-index="${pos}"] .token-row`);
    if (!cell) return;
    const token = document.createElement('div');
    token.className = 'token';
    token.textContent = String(index + 1);
    token.style.background = player.color || getPlayerColor(index);
    token.title = player.name;
    cell.appendChild(token);
  });

  if (gameState.event?.flashId && state.lastFlashEventId !== gameState.event.flashId) {
    state.lastFlashEventId = gameState.event.flashId;
    const tile = refs.board.querySelector(`.tile[data-path-index="${gameState.event.flashTileIndex}"]`);
    if (tile) {
      tile.classList.remove('flash');
      void tile.offsetWidth;
      tile.classList.add('flash');
    }
  }
}

function renderTurnUi() {
  const gameState = getRoomState();
  if (!gameState?.players?.length) {
    refs.turnInfo.textContent = 'A játék még nem indult el.';
    refs.actionInfo.textContent = '-';
    refs.diceLabel.textContent = 'A játék indulására várunk.';
    refs.drawDeckBtn.classList.add('disabled');
    refs.drawDeckBtn.disabled = true;
    return;
  }
  const current = getCurrentPlayer(gameState);
  const isMyTurn = current?.clientId === state.clientId;
  const me = gameState.players.find((p) => p.clientId === state.clientId);
  refs.turnInfo.textContent = gameState.phase === 'finished'
    ? `Nyertes: ${gameState.winnerName || '-'}`
    : `${current?.name || '-'} köre • ${gameState.turnNo || 1}. kör`;

  const canRoll = isMyTurn && gameState.phase === 'roll';
  refs.diceBtn.disabled = !canRoll;
  refs.diceBtn.classList.toggle('rolling', gameState.phase === 'animating');
  refs.diceLabel.textContent = canRoll
    ? 'Te jössz. Kattints a kockára.'
    : gameState.phase === 'draw'
      ? (isMyTurn ? 'Most húzhatsz a pakliból.' : 'Valaki épp kártyát húzhat.')
      : gameState.phase === 'buy'
        ? (isMyTurn ? 'Válassz tárgyat a kártyán.' : 'Valaki épp vásárolhat.')
        : gameState.phase === 'finished'
          ? `A játék véget ért.`
          : `${current?.name || '-'} lép.`;

  refs.actionInfo.textContent = me
    ? `Pénz: ${me.money} ${text(getCfg('currency_name', 'Ft'))} • Tárgyak: ${me.inventory.length}`
    : '-';

  const canDraw = isMyTurn && gameState.phase === 'draw';
  refs.drawDeckBtn.disabled = !canDraw;
  refs.drawDeckBtn.classList.toggle('disabled', !canDraw);
}

function renderOverlay() {
  const gameState = getRoomState();
  if (!gameState?.event) {
    refs.overlay.classList.add('hidden');
    refs.overlay.innerHTML = '';
    state.overlaySelection.clear();
    return;
  }
  const event = gameState.event;
  const hash = hashText(JSON.stringify(event) + gameState.phase);
  const isBuy = gameState.phase === 'buy' && gameState.pending?.offers?.length;
  if (hash === state.lastOverlayHash && !isBuy) return;
  state.lastOverlayHash = hash;

  if (isBuy) {
    const current = getCurrentPlayer(gameState);
    const canAct = current?.clientId === state.clientId;
    const pickLimit = Math.max(1, num(gameState.pending.pickLimit, 1));
    const offers = gameState.pending.offers.map((id) => state.itemMap.get(id)).filter(Boolean);
    const options = offers.map((item) => `
      <label class="buy-option">
        <input type="checkbox" data-buy-id="${item.id}" ${state.overlaySelection.has(item.id) ? 'checked' : ''} ${!canAct ? 'disabled' : ''}>
        <div class="item-icon">${escapeHtml(text(item.icon || '🎁'))}</div>
        <div>
          <strong>${escapeHtml(item.name)}</strong>
          <div class="tiny muted-text">${escapeHtml(item.blurb || '')}</div>
          <div class="tiny muted-text">Ár: ${item.price} ${escapeHtml(text(getCfg('currency_name', 'Ft')))}</div>
        </div>
      </label>
    `).join('');

    refs.overlay.innerHTML = `
      <div class="overlay-card">
        <div class="overlay-head">
          <div>
            <div class="overlay-kind">VÁSÁRLÁS</div>
            <h3 class="overlay-title">${escapeHtml(event.title || 'Vásárlás')}</h3>
          </div>
          <div class="overlay-icon">${escapeHtml(event.icon || '🛒')}</div>
        </div>
        <div class="overlay-body">
          <div class="overlay-text">${escapeHtml(event.text || '')}</div>
          <div class="tiny muted-text" style="margin-top:8px">Maximum ennyit választhatsz: ${pickLimit}</div>
          <div class="buy-list">${options || '<div class="log-entry">Nincs elérhető tárgy.</div>'}</div>
          <div class="overlay-actions">
            <button id="confirmBuyBtn" class="btn success" ${!canAct ? 'disabled' : ''}>Kiválasztottak megvétele</button>
            <button id="skipBuyBtn" class="btn">Kihagyom</button>
          </div>
        </div>
      </div>
    `;
    refs.overlay.classList.remove('hidden');

    refs.overlay.querySelectorAll('[data-buy-id]').forEach((box) => {
      box.addEventListener('change', () => {
        const id = num(box.dataset.buyId);
        if (box.checked) state.overlaySelection.add(id);
        else state.overlaySelection.delete(id);
        while (state.overlaySelection.size > pickLimit) {
          const first = state.overlaySelection.values().next().value;
          state.overlaySelection.delete(first);
          const el = refs.overlay.querySelector(`[data-buy-id="${first}"]`);
          if (el) el.checked = false;
        }
      });
    });
    $('#confirmBuyBtn')?.addEventListener('click', () => handleBuyConfirm(false));
    $('#skipBuyBtn')?.addEventListener('click', () => handleBuyConfirm(true));
    return;
  }

  refs.overlay.innerHTML = `
    <div class="overlay-card">
      <div class="overlay-head">
        <div>
          <div class="overlay-kind">${escapeHtml(event.kind || 'ESEMÉNY')}</div>
          <h3 class="overlay-title">${escapeHtml(event.title || 'Esemény')}</h3>
        </div>
        <div class="overlay-icon">${escapeHtml(event.icon || '✨')}</div>
      </div>
      <div class="overlay-body">
        <div class="overlay-text">${escapeHtml(event.text || '')}</div>
      </div>
    </div>
  `;
  refs.overlay.classList.remove('hidden');
}

function addLog(gameState, textLine) {
  if (!gameState.logs) gameState.logs = [];
  gameState.logs.push({ text: textLine, at: Date.now() });
  gameState.logs = gameState.logs.slice(-60);
}

function activePlayerIndex(gameState, clientId) {
  return (gameState.players || []).findIndex((p) => p.clientId === clientId);
}

function getPathLength() {
  return state.pathTiles.length;
}

function buildMovePath(fromPos, steps) {
  const total = getPathLength();
  const dir = steps >= 0 ? 1 : -1;
  const count = Math.abs(steps);
  const path = [];
  let passStartCount = 0;
  let current = fromPos;
  for (let i = 0; i < count; i += 1) {
    const next = ((current + dir) % total + total) % total;
    if (dir > 0 && next === 0) passStartCount += 1;
    current = next;
    path.push(current);
  }
  return { path, finalPosition: current, passStartCount };
}

function resolveItemPool(effect, actorInventory = []) {
  let ids = [];
  if (effect.gift_all_items || effect.buy_all_items) {
    ids = state.items.map((item) => item.id);
  } else if (Array.isArray(effect.item_ids)) {
    ids = effect.item_ids;
  } else if (Array.isArray(effect.gift_item_ids) || Array.isArray(effect.buy_item_ids)) {
    ids = [...(effect.gift_item_ids || []), ...(effect.buy_item_ids || [])];
  }
  return ids
    .map((id) => state.itemMap.get(id))
    .filter(Boolean)
    .filter((item, index, arr) => arr.findIndex((other) => other.id === item.id) === index)
    .filter((item) => !actorInventory.includes(item.id));
}

function normalizeSourceEffect(source, sourceType = 'tile') {
  const effect = parseEffect(source.effect);
  const normalized = {
    amount: num(source.amount ?? effect.amount, 0),
    skip_turns: num(source.skip_turns ?? effect.skip_turns, 0),
    move_steps: num(source.move_steps ?? effect.move_steps, 0),
    card_group: text(source.card_group || effect.card_group || 'chance'),
    note: text(effect.note || source.description || source.body || ''),
    gift_all_items: Boolean(effect.gift_all_items),
    gift_item_ids: Array.isArray(effect.gift_item_ids) ? effect.gift_item_ids.map((x) => num(x)).filter(Boolean) : [],
    gift_count: num(effect.gift_count, 0),
    buy_all_items: Boolean(effect.buy_all_items),
    buy_item_ids: Array.isArray(effect.buy_item_ids) ? effect.buy_item_ids.map((x) => num(x)).filter(Boolean) : [],
    buy_pick_limit: Math.max(1, num(effect.buy_pick_limit, 1)),
  };
  if (sourceType === 'tile') {
    if (source.kind === 'shop' && source.item_id && !normalized.buy_item_ids.length && !normalized.buy_all_items) normalized.buy_item_ids = [source.item_id];
    if (source.kind !== 'shop' && source.item_id && !normalized.gift_item_ids.length && !normalized.buy_item_ids.length) normalized.gift_item_ids = [source.item_id];
  }
  if (sourceType === 'card' && source.item_id && !normalized.gift_item_ids.length && !normalized.buy_item_ids.length) {
    normalized.gift_item_ids = [source.item_id];
  }
  return normalized;
}

function sampleItems(pool, count) {
  const copy = [...pool];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return count > 0 ? copy.slice(0, count) : copy;
}

function grantGiftItems(actor, effect) {
  const sourceIds = effect.gift_all_items ? state.items.map((item) => item.id) : effect.gift_item_ids;
  const pool = sourceIds.map((id) => state.itemMap.get(id)).filter(Boolean).filter((item) => !actor.inventory.includes(item.id));
  if (!pool.length) return [];
  const count = num(effect.gift_count, 0);
  const gifts = sampleItems(pool, count > 0 ? Math.min(count, pool.length) : pool.length);
  gifts.forEach((item) => actor.inventory.push(item.id));
  return gifts;
}

function buildBuyOffers(actor, effect) {
  const sourceIds = effect.buy_all_items ? state.items.map((item) => item.id) : effect.buy_item_ids;
  return sourceIds
    .map((id) => state.itemMap.get(id))
    .filter(Boolean)
    .filter((item, index, arr) => arr.findIndex((other) => other.id === item.id) === index)
    .filter((item) => !actor.inventory.includes(item.id));
}

function checkWinner(gameState, actor) {
  const requiredItems = state.items.filter((item) => item.required);
  const requiredCount = Math.max(1, num(getCfg('required_items_to_win', requiredItems.length || 1), requiredItems.length || 1));
  const ownedRequired = actor.inventory.filter((id) => (state.itemMap.get(id)?.required)).length;
  if (actor.money >= num(getCfg('win_money', 10000), 10000) || ownedRequired >= requiredCount) {
    gameState.phase = 'finished';
    gameState.winnerClientId = actor.clientId;
    gameState.winnerName = actor.name;
    gameState.status = 'finished';
    addLog(gameState, `${actor.name} megnyerte a játékot!`);
    gameState.event = {
      id: crypto.randomUUID(),
      kind: 'GYŐZELEM',
      title: `${actor.name} nyert!`,
      text: ownedRequired >= requiredCount ? 'Megvan elég kötelező tárgy.' : 'Elérte a nyerő pénzt.',
      icon: '🏆',
      until: Date.now() + 9999999,
    };
    return true;
  }
  return false;
}

function startAnimation(gameState, actor, steps, causeLabel, chainDepth = 0) {
  const { path, finalPosition, passStartCount } = buildMovePath(actor.position, steps);
  if (!path.length) return false;
  const stepMs = Math.max(100, num(getCfg('pawn_step_ms', 220), 220));
  const startedAt = Date.now();
  gameState.phase = 'animating';
  gameState.animation = {
    actorClientId: actor.clientId,
    path,
    stepMs,
    startedAt,
    resolveAt: startedAt + path.length * stepMs + 80,
    label: causeLabel,
  };
  gameState.pending = {
    type: 'arrival',
    targetPosition: finalPosition,
    passStartCount,
    landedOnStart: finalPosition === 0,
    chainDepth,
    causeLabel,
  };
  return true;
}

function eventObject({ kind, title, text, icon, flashTileIndex }) {
  return {
    id: crypto.randomUUID(),
    kind,
    title,
    text,
    icon,
    until: Date.now() + Math.max(1200, num(getCfg('event_overlay_ms', 2600), 2600)),
    flashTileIndex,
    flashId: crypto.randomUUID(),
  };
}

function applySourceEffects(gameState, actor, source, sourceType) {
  const effect = normalizeSourceEffect(source, sourceType);
  const messages = [];
  if (effect.amount) {
    actor.money += effect.amount;
    messages.push(`${effect.amount > 0 ? '+' : ''}${effect.amount} ${text(getCfg('currency_name', 'Ft'))}`);
  }
  if (effect.skip_turns) {
    actor.skipTurns += effect.skip_turns;
    messages.push(`${effect.skip_turns} kör kimaradás`);
  }
  const gifts = grantGiftItems(actor, effect);
  if (gifts.length) {
    messages.push(`Ajándék: ${gifts.map((item) => `${item.icon} ${item.name}`).join(', ')}`);
  }

  const sourceTitle = sourceType === 'card' ? source.title : source.name;
  const sourceText = sourceType === 'card' ? source.body : source.description;

  if (effect.move_steps) {
    gameState.phase = 'chain_wait';
    gameState.pending = {
      type: 'chain_move',
      moveSteps: effect.move_steps,
      chainDepth: num(gameState.pending?.chainDepth, 0) + 1,
      sourceLabel: sourceTitle,
    };
    gameState.event = eventObject({
      kind: sourceType === 'card' ? 'KÁRTYA' : 'MEZŐ',
      title: sourceTitle,
      text: `${sourceText || ''}${sourceText ? '\n\n' : ''}${effect.move_steps > 0 ? `Lépj előre ${effect.move_steps} mezőt.` : `Lépj vissza ${Math.abs(effect.move_steps)} mezőt.`}`,
      icon: source.icon || (sourceType === 'card' ? '💌' : '✨'),
      flashTileIndex: actor.position,
    });
    addLog(gameState, `${actor.name}: ${sourceTitle} (${effect.move_steps > 0 ? '+' : ''}${effect.move_steps} lépés)`);
    return;
  }

  const offers = buildBuyOffers(actor, effect);
  if (offers.length) {
    gameState.phase = 'buy';
    gameState.pending = {
      type: 'buy',
      offers: offers.map((item) => item.id),
      pickLimit: effect.buy_pick_limit,
      sourceType,
      sourceId: source.id,
    };
    gameState.event = {
      id: crypto.randomUUID(),
      kind: 'VÁSÁRLÁS',
      title: sourceTitle,
      text: sourceText || 'Válassz a megvehető tárgyak közül.',
      icon: source.icon || '🛒',
      flashTileIndex: actor.position,
      flashId: crypto.randomUUID(),
    };
    addLog(gameState, `${actor.name} vásárlási mezőre / kártyára ért: ${sourceTitle}`);
    return;
  }

  const baseText = [sourceText || '', messages.join('\n')].filter(Boolean).join('\n\n') || 'Semmi extra nem történt.';
  gameState.phase = 'turn_advance';
  gameState.event = eventObject({
    kind: sourceType === 'card' ? 'KÁRTYA' : 'MEZŐ',
    title: sourceTitle,
    text: baseText,
    icon: source.icon || (sourceType === 'card' ? '💌' : '✨'),
    flashTileIndex: actor.position,
  });
  addLog(gameState, `${actor.name}: ${sourceTitle}${messages.length ? ` — ${messages.join(', ')}` : ''}`);
}

function resolveArrival(gameState) {
  const pending = gameState.pending;
  if (!pending || pending.type !== 'arrival') return;
  const actor = getCurrentPlayer(gameState);
  if (!actor) return;

  actor.position = pending.targetPosition;
  const passBonus = Math.max(0, num(getCfg('start_pass_bonus', 400), 400));
  const landBonus = Math.max(0, num(getCfg('start_land_bonus', 800), 800));

  const arrivalMessages = [];
  if (pending.passStartCount) {
    const total = pending.passStartCount * passBonus;
    actor.money += total;
    arrivalMessages.push(`Start áthaladás: +${total} ${text(getCfg('currency_name', 'Ft'))}`);
  }
  if (pending.landedOnStart) {
    actor.money += landBonus;
    arrivalMessages.push(`Start mezőre érkeztél: +${landBonus} ${text(getCfg('currency_name', 'Ft'))}`);
  }

  gameState.animation = null;

  const tile = state.pathTiles[actor.position];
  if (!tile) {
    gameState.phase = 'turn_advance';
    gameState.event = eventObject({
      kind: 'MEZŐ',
      title: 'Ismeretlen mező',
      text: 'A célmező nem található.',
      icon: '❓',
      flashTileIndex: actor.position,
    });
    return;
  }

  const preface = arrivalMessages.length ? `${arrivalMessages.join('\n')}\n\n` : '';

  if (tile.kind === 'card') {
    gameState.phase = 'draw';
    gameState.pending = {
      type: 'draw',
      cardGroup: tile.card_group || 'chance',
      chainDepth: pending.chainDepth || 0,
    };
    gameState.event = {
      id: crypto.randomUUID(),
      kind: 'MEZŐ',
      title: tile.name,
      text: `${preface}${tile.description || 'Húzz a pakliból.'}`,
      icon: tile.icon || '💌',
      flashTileIndex: actor.position,
      flashId: crypto.randomUUID(),
    };
    addLog(gameState, `${actor.name} kártya mezőre lépett.`);
    return;
  }

  if (arrivalMessages.length) {
    tile.description = `${preface}${tile.description || ''}`.trim();
  }
  applySourceEffects(gameState, actor, tile, 'tile');
  if (checkWinner(gameState, actor)) return;
}

function advanceTurn(gameState) {
  if (gameState.phase === 'finished') return;
  let nextIndex = gameState.turnIndex;
  let nextTurn = num(gameState.turnNo, 1);
  for (let i = 0; i < gameState.players.length; i += 1) {
    nextIndex = (nextIndex + 1) % gameState.players.length;
    if (nextIndex === 0) nextTurn += 1;
    const candidate = gameState.players[nextIndex];
    if (candidate.skipTurns > 0) {
      candidate.skipTurns -= 1;
      addLog(gameState, `${candidate.name} kimarad egy kört.`);
      continue;
    }
    gameState.turnIndex = nextIndex;
    gameState.turnNo = nextTurn;
    gameState.phase = 'roll';
    gameState.pending = null;
    gameState.event = null;
    return;
  }
  gameState.phase = 'roll';
  gameState.pending = null;
  gameState.event = null;
}

async function saveGameState(gameState, roomStatus = null) {
  if (!state.room) return;
  const payload = {
    state: gameState,
    updated_at: nowIso(),
  };
  if (roomStatus) payload.status = roomStatus;
  else if (gameState.phase === 'finished') payload.status = 'finished';
  const res = await supabase.from('rooms').update(payload).eq('id', state.room.id);
  if (res.error) throw res.error;
}

async function startGame() {
  if (!state.room || state.room.host_client_id !== state.clientId) return;
  if (state.roomPlayers.length < 2) return;
  const startingMoney = Math.max(0, num(getCfg('starting_money', 3000), 3000));
  const players = state.roomPlayers.map((player, index) => ({
    clientId: player.client_id,
    name: player.name,
    seatNo: index,
    position: 0,
    money: startingMoney,
    skipTurns: 0,
    inventory: [],
    color: getPlayerColor(index),
  }));
  const gameState = {
    status: 'playing',
    phase: 'roll',
    turnIndex: 0,
    turnNo: 1,
    players,
    logs: [{ text: 'A játék elindult.', at: Date.now() }],
    event: null,
    pending: null,
    animation: null,
    winnerClientId: null,
    winnerName: '',
  };
  refs.startGameBtn.disabled = true;
  try {
    await saveGameState(gameState, 'playing');
    await refreshRoom();
  } catch (err) {
    showError(err.message || 'Nem sikerült a játék indítása.');
  }
}

async function rollDice() {
  const gameState = getRoomState();
  const actor = getCurrentPlayer(gameState);
  if (!actor || actor.clientId !== state.clientId || gameState.phase !== 'roll') return;
  const roll = 1 + Math.floor(Math.random() * 6);
  const nextState = deepClone(gameState);
  const nextActor = nextState.players[nextState.turnIndex];
  const started = startAnimation(nextState, nextActor, roll, `Dobás: ${roll}`, 0);
  if (!started) return;
  addLog(nextState, `${nextActor.name} dobott: ${roll}.`);
  nextState.lastRoll = roll;
  await saveGameState(nextState);
  await refreshRoom();
}

async function drawCard() {
  const gameState = getRoomState();
  const actor = getCurrentPlayer(gameState);
  if (!actor || actor.clientId !== state.clientId || gameState.phase !== 'draw') return;
  const pending = gameState.pending || {};
  const pool = state.cardsByGroup.get(pending.cardGroup || 'chance') || [];
  if (!pool.length) return;
  const card = pool[Math.floor(Math.random() * pool.length)];
  const nextState = deepClone(gameState);
  const nextActor = nextState.players[nextState.turnIndex];
  nextState.pending = { ...(nextState.pending || {}), sourceCardId: card.id };
  applySourceEffects(nextState, nextActor, card, 'card');
  checkWinner(nextState, nextActor);
  await saveGameState(nextState);
  await refreshRoom();
}

async function handleBuyConfirm(skip = false) {
  const gameState = getRoomState();
  const actor = getCurrentPlayer(gameState);
  if (!actor || actor.clientId !== state.clientId || gameState.phase !== 'buy') return;
  const nextState = deepClone(gameState);
  const nextActor = nextState.players[nextState.turnIndex];
  const pending = nextState.pending || {};
  const pickLimit = Math.max(1, num(pending.pickLimit, 1));
  const chosen = skip ? [] : Array.from(state.overlaySelection).slice(0, pickLimit);
  const bought = [];
  for (const id of chosen) {
    const item = state.itemMap.get(id);
    if (!item) continue;
    if (nextActor.inventory.includes(id)) continue;
    if (nextActor.money < item.price) continue;
    nextActor.money -= item.price;
    nextActor.inventory.push(id);
    bought.push(item);
  }
  addLog(nextState, bought.length
    ? `${nextActor.name} megvette: ${bought.map((item) => `${item.icon} ${item.name}`).join(', ')}`
    : `${nextActor.name} nem vett tárgyat.`);
  state.overlaySelection.clear();
  nextState.phase = 'turn_advance';
  nextState.pending = null;
  nextState.event = eventObject({
    kind: 'VÁSÁRLÁS',
    title: bought.length ? 'Sikeres vásárlás' : 'Kihagyott vásárlás',
    text: bought.length
      ? `Megvett tárgyak:\n${bought.map((item) => `${item.icon} ${item.name}`).join('\n')}`
      : 'Most nem vásároltál semmit.',
    icon: bought.length ? '🛍️' : '🫥',
    flashTileIndex: nextActor.position,
  });
  checkWinner(nextState, nextActor);
  await saveGameState(nextState);
  await refreshRoom();
}

async function leaveRoom() {
  if (!state.room) return;
  const myRow = getMeRow();
  if (myRow) await supabase.from('room_players').delete().eq('id', myRow.id);
  const remainingRes = await supabase.from('room_players').select('*').eq('room_id', state.room.id).order('seat_no', { ascending: true });
  const remaining = remainingRes.data || [];
  if (!remaining.length) {
    await supabase.from('rooms').delete().eq('id', state.room.id);
  } else if (state.room.host_client_id === state.clientId) {
    await supabase.from('rooms').update({ host_client_id: remaining[0].client_id, updated_at: nowIso() }).eq('id', state.room.id);
  }
  localStorage.removeItem(STORAGE.roomCode);
  state.room = null;
  state.roomPlayers = [];
  renderLobbyOnly();
}

async function maybeHostMaintenance() {
  if (!state.room || state.room.host_client_id !== state.clientId) return;
  const gameState = getRoomState();
  if (!gameState || gameState.phase === 'roll' || gameState.phase === 'draw' || gameState.phase === 'buy' || gameState.phase === 'finished') return;

  const now = Date.now();
  const nextState = deepClone(gameState);
  let changed = false;

  if (nextState.phase === 'animating' && nextState.animation && now >= num(nextState.animation.resolveAt, 0)) {
    resolveArrival(nextState);
    changed = true;
  } else if (nextState.phase === 'chain_wait' && nextState.event && now >= num(nextState.event.until, 0)) {
    const actor = getCurrentPlayer(nextState);
    const pending = nextState.pending || {};
    if (actor && num(pending.chainDepth, 0) < 6) {
      startAnimation(nextState, actor, num(pending.moveSteps, 0), pending.sourceLabel || 'Mozgatás', num(pending.chainDepth, 0));
      changed = true;
    } else {
      nextState.phase = 'turn_advance';
      changed = true;
    }
  } else if (nextState.phase === 'turn_advance' && nextState.event && now >= num(nextState.event.until, 0)) {
    advanceTurn(nextState);
    changed = true;
  }

  if (changed) {
    await saveGameState(nextState, nextState.phase === 'finished' ? 'finished' : 'playing');
    await refreshRoom();
  }
}

async function syncLoop() {
  const roomCode = localStorage.getItem(STORAGE.roomCode);
  if (!roomCode || state.busy) return;
  state.busy = true;
  try {
    await refreshRoom(roomCode);
    await maybeHostMaintenance();
  } catch (err) {
    setStatus(err.message || 'Szinkron hiba', true);
  } finally {
    state.busy = false;
  }
}

function bindEvents() {
  refs.playerNameInput.value = localStorage.getItem(STORAGE.playerName) || '';
  refs.roomCodeInput.value = localStorage.getItem(STORAGE.roomCode) || '';
  refs.createRoomBtn.addEventListener('click', createRoom);
  refs.joinRoomBtn.addEventListener('click', joinRoom);
  refs.refreshLobbyBtn.addEventListener('click', () => refreshRoom().catch((err) => showError(err.message || 'Frissítési hiba.')));
  refs.leaveRoomBtn.addEventListener('click', () => leaveRoom().catch((err) => showError(err.message || 'Kilépési hiba.')));
  refs.backToLobbyBtn.addEventListener('click', () => {
    refs.gameScreen.classList.add('hidden');
    refs.lobbyScreen.classList.add('active');
  });
  refs.leaveGameBtn.addEventListener('click', () => leaveRoom().catch((err) => showError(err.message || 'Kilépési hiba.')));
  refs.startGameBtn.addEventListener('click', startGame);
  refs.diceBtn.addEventListener('click', rollDice);
  refs.drawDeckBtn.addEventListener('click', drawCard);
  refs.playerNameInput.addEventListener('change', () => localStorage.setItem(STORAGE.playerName, refs.playerNameInput.value.trim()));
  refs.roomCodeInput.addEventListener('input', () => { refs.roomCodeInput.value = refs.roomCodeInput.value.toUpperCase(); });
}

async function init() {
  bindEvents();
  try {
    if (DEMO_MODE) setStatus('Demo config', true);
    await loadDefinitions();
    const rememberedRoom = localStorage.getItem(STORAGE.roomCode);
    if (rememberedRoom) {
      await refreshRoom(rememberedRoom);
    } else {
      renderLobbyOnly();
    }
    state.pollHandle = window.setInterval(syncLoop, Math.max(450, num(getCfg('poll_ms', 750), 750)));
    state.defsHandle = window.setInterval(() => {
      loadDefinitions().catch(() => {});
    }, 6000);
    state.tickHandle = window.setInterval(renderDynamicBits, 120);
  } catch (err) {
    setStatus('Indítási hiba', true);
    showError(`Indítási hiba: ${err.message || err}`);
  }
}

init();
