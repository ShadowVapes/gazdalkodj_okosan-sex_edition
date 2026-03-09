import { SUPABASE_URL, SUPABASE_ANON_KEY, DEMO_MODE } from './config.js';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = (s) => document.querySelector(s);

const refs = {
  lobbyScreen: $('#lobbyScreen'),
  gameScreen: $('#gameScreen'),
  roomPanel: $('#roomPanel'),
  playerNameInput: $('#playerNameInput'),
  roomCodeInput: $('#roomCodeInput'),
  createRoomBtn: $('#createRoomBtn'),
  joinRoomBtn: $('#joinRoomBtn'),
  refreshLobbyBtn: $('#refreshLobbyBtn'),
  leaveRoomBtn: $('#leaveRoomBtn'),
  leaveGameBtn: $('#leaveGameBtn'),
  startGameBtn: $('#startGameBtn'),
  lobbyError: $('#lobbyError'),
  roomCodeTitle: $('#roomCodeTitle'),
  lobbyPlayers: $('#lobbyPlayers'),
  lobbyMeta: $('#lobbyMeta'),
  roomTitleGame: $('#roomTitleGame'),
  board: $('#board'),
  overlay: $('#overlay'),
  playersPanel: $('#playersPanel'),
  logPanel: $('#logPanel'),
  turnInfo: $('#turnInfo'),
  actionInfo: $('#actionInfo'),
  diceBtn: $('#diceBtn'),
  deckBtn: $('#deckBtn'),
  diceInfo: $('#diceInfo'),
  connectionPill: $('#connectionPill'),
  gameTitle: $('#gameTitle'),
  gameSubtitle: $('#gameSubtitle'),
};

const STORAGE = {
  clientId: 'gp_base_client_id',
  playerName: 'gp_base_player_name',
  roomCode: 'gp_base_room_code',
};

const state = {
  clientId: localStorage.getItem(STORAGE.clientId) || crypto.randomUUID(),
  room: null,
  roomPlayers: [],
  config: {},
  configRows: [],
  items: [],
  itemMap: new Map(),
  tiles: [],
  tileMap: new Map(),
  pathTiles: [],
  pathIndexByTileId: new Map(),
  cardsByGroup: new Map(),
  pollTimer: null,
  finalizeTimer: null,
  defsTimer: null,
  lastFlashKey: '',
  currentOverlayKey: '',
};
localStorage.setItem(STORAGE.clientId, state.clientId);

const colors = ['#ff8a8a', '#71b8ff', '#65d697', '#ff92d0', '#e8bb63', '#b39bff'];

function num(v, fb = 0) { const n = Number(v); return Number.isFinite(n) ? n : fb; }
function txt(v, fb = '') { return v == null ? fb : String(v); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function nowIso() { return new Date().toISOString(); }
function getCfg(key, fb) { return state.config[key] === undefined ? fb : state.config[key]; }
function parseCfgValue(value) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (parsed && typeof parsed === 'object' && 'value' in parsed) return parsed.value;
  } catch {}
  return value;
}
function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
function setStatus(msg, bad = false) {
  refs.connectionPill.textContent = msg;
  refs.connectionPill.style.background = bad ? 'rgba(214,91,116,0.22)' : 'rgba(70,98,160,0.28)';
}
function showError(msg) {
  refs.lobbyError.textContent = msg;
  refs.lobbyError.classList.remove('hidden');
}
function clearError() {
  refs.lobbyError.textContent = '';
  refs.lobbyError.classList.add('hidden');
}
function getPlayerName() {
  const name = txt(refs.playerNameInput.value || localStorage.getItem(STORAGE.playerName)).trim();
  if (!name) {
    showError('Adj meg egy játékosnevet.');
    return null;
  }
  localStorage.setItem(STORAGE.playerName, name);
  refs.playerNameInput.value = name;
  return name.slice(0, 24);
}
function getGameState() { return state.room?.state || null; }
function getMePlayer(gameState = getGameState()) {
  return gameState?.players?.find((p) => p.clientId === state.clientId) || null;
}
function getCurrentPlayer(gameState = getGameState()) {
  return gameState?.players?.[num(gameState.turnIndex, 0)] || null;
}
function getCurrentTile(position) { return state.pathTiles[num(position, 0)] || null; }
function randCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
function logEntry(text) {
  return { id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, text, ts: Date.now() };
}
function withLog(gameState, text) {
  const logs = [...(gameState.logs || []), logEntry(text)].slice(-40);
  return { ...gameState, logs };
}
function boardPalette(kind, accent, textColor) {
  if (accent) return { bg: accent, fg: textColor || '#fff' };
  const map = {
    start: { bg: 'linear-gradient(180deg, #8b6427, #4a3310)', fg: '#fff4dd' },
    money: { bg: 'linear-gradient(180deg, #2f8a59, #175231)', fg: '#effff5' },
    card: { bg: 'linear-gradient(180deg, #9b56be, #5c2d88)', fg: '#fff3ff' },
    shop: { bg: 'linear-gradient(180deg, #906327, #53370f)', fg: '#fff7e8' },
    gift: { bg: 'linear-gradient(180deg, #4964cf, #233585)', fg: '#eef2ff' },
    move: { bg: 'linear-gradient(180deg, #665cc6, #332d73)', fg: '#f4f2ff' },
    skip: { bg: 'linear-gradient(180deg, #a2455b, #602538)', fg: '#fff0f3' },
    neutral: { bg: 'linear-gradient(180deg, #405275, #1d2741)', fg: '#eef4ff' },
  };
  return map[kind] || map.neutral;
}

function buildCardsByGroup(cards) {
  const map = new Map();
  cards.forEach((card) => {
    const key = txt(card.card_group, 'chance');
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(card);
  });
  return map;
}

function computeRingPositions(count, cols, rows) {
  const ring = [];
  for (let x = 0; x < cols; x += 1) ring.push([x, 0]);
  for (let y = 1; y < rows; y += 1) ring.push([cols - 1, y]);
  for (let x = cols - 2; x >= 0; x -= 1) ring.push([x, rows - 1]);
  for (let y = rows - 2; y > 0; y -= 1) ring.push([0, y]);
  return Array.from({ length: count }, (_, i) => ring[i % ring.length]);
}

function buildPathTiles(rawTiles) {
  const tiles = [...rawTiles].sort((a, b) => num(a.sort_order) - num(b.sort_order));
  const byId = new Map(tiles.map((t) => [t.id, t]));
  const start = tiles.find((t) => t.kind === 'start') || tiles[0];
  if (!start) return [];
  const path = [];
  const seen = new Set();
  let current = start;
  while (current && !seen.has(current.id) && path.length < tiles.length) {
    seen.add(current.id);
    path.push(current);
    current = byId.get(current.next_tile_id) || null;
    if (!current && path.length < tiles.length) current = tiles.find((t) => !seen.has(t.id)) || null;
  }
  tiles.forEach((t) => { if (!seen.has(t.id)) path.push(t); });
  const cols = Math.max(6, num(getCfg('board_cols', 10), 10));
  const rows = Math.max(6, num(getCfg('board_rows', 10), 10));
  const autoPos = computeRingPositions(path.length, cols, rows);
  return path.map((tile, index) => ({
    ...tile,
    path_index: index,
    board_x: Number.isFinite(num(tile.board_x, NaN)) ? num(tile.board_x) : autoPos[index][0],
    board_y: Number.isFinite(num(tile.board_y, NaN)) ? num(tile.board_y) : autoPos[index][1],
  }));
}

async function loadDefinitions() {
  const [cfgRes, itemRes, tileRes, cardRes] = await Promise.all([
    supabase.from('game_config').select('*').order('key'),
    supabase.from('game_items').select('*').order('sort_order').order('id'),
    supabase.from('game_tiles').select('*').order('sort_order').order('id'),
    supabase.from('game_cards').select('*').order('sort_order').order('id'),
  ]);
  const failed = [cfgRes, itemRes, tileRes, cardRes].find((r) => r.error);
  if (failed) throw failed.error;

  state.configRows = cfgRes.data || [];
  state.config = {};
  state.configRows.forEach((row) => { state.config[row.key] = parseCfgValue(row.value); });
  state.items = itemRes.data || [];
  state.itemMap = new Map(state.items.map((item) => [item.id, item]));
  state.tiles = tileRes.data || [];
  state.tileMap = new Map(state.tiles.map((tile) => [tile.id, tile]));
  state.pathTiles = buildPathTiles(state.tiles);
  state.pathIndexByTileId = new Map(state.pathTiles.map((tile) => [tile.id, tile.path_index]));
  state.cardsByGroup = buildCardsByGroup(cardRes.data || []);
  refs.gameTitle.textContent = txt(getCfg('game_title', 'Gazdálkodj Pajkosan'));
  refs.gameSubtitle.textContent = txt(getCfg('game_subtitle', 'Stabil alapverzió.'));
  renderBoard();
}

function ensureBoardCss() {
  refs.board.style.setProperty('--cols', Math.max(6, num(getCfg('board_cols', 10), 10)));
  refs.board.style.setProperty('--rows', Math.max(6, num(getCfg('board_rows', 10), 10)));
}

function renderBoard() {
  ensureBoardCss();
  refs.board.innerHTML = '';
  state.pathTiles.forEach((tile) => {
    const palette = boardPalette(tile.kind, tile.accent_color, tile.text_color);
    const el = document.createElement('div');
    el.className = 'tile';
    el.dataset.tileId = String(tile.id);
    el.style.gridColumn = String(num(tile.board_x, 0) + 1);
    el.style.gridRow = String(num(tile.board_y, 0) + 1);
    el.style.setProperty('--tile-bg', palette.bg);
    el.style.setProperty('--tile-text', palette.fg);
    el.innerHTML = `
      <div>
        <div class="tile-short">${escapeHtml(tile.short_name || tile.kind || 'MEZŐ')}</div>
        <div class="tile-name">${escapeHtml(tile.name || 'Mező')}</div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:end;gap:10px">
        <div class="token-row"></div>
        <div class="tile-icon">${escapeHtml(tile.icon || '⬢')}</div>
      </div>
    `;
    refs.board.appendChild(el);
  });
  renderDynamic();
}

function showGame() {
  refs.lobbyScreen.classList.add('hidden');
  refs.gameScreen.classList.remove('hidden');
}
function showLobby() {
  refs.gameScreen.classList.add('hidden');
  refs.lobbyScreen.classList.remove('hidden');
}

function renderRoomPanel() {
  if (!state.room) {
    refs.roomPanel.classList.add('hidden');
    return;
  }
  refs.roomPanel.classList.remove('hidden');
  refs.roomCodeTitle.textContent = state.room.code;
  refs.roomTitleGame.textContent = `Szoba: ${state.room.code}`;
  refs.lobbyPlayers.innerHTML = '';
  state.roomPlayers.forEach((p) => {
    const row = document.createElement('div');
    row.className = `player-card ${p.client_id === state.clientId ? 'me' : ''}`;
    row.innerHTML = `<strong>${escapeHtml(p.name)}</strong><div class="muted">Seat ${p.seat_no + 1}${state.room.host_client_id === p.client_id ? ' • host' : ''}</div>`;
    refs.lobbyPlayers.appendChild(row);
  });
  refs.lobbyMeta.innerHTML = `<div>Státusz: <strong>${escapeHtml(state.room.status || 'lobby')}</strong></div><div>Játékosok: <strong>${state.roomPlayers.length}</strong></div>`;
  refs.startGameBtn.disabled = state.room.host_client_id !== state.clientId || state.room.status !== 'lobby' || state.roomPlayers.length < 2;
}

function getDisplayedPosition(player, gameState = getGameState()) {
  const anim = gameState?.animation;
  if (!anim || anim.actorClientId !== player.clientId || !Array.isArray(anim.path) || !anim.path.length) return player.position;
  const elapsed = Date.now() - num(anim.startedAt, 0);
  const stepMs = Math.max(220, num(anim.stepMs, 420));
  const stepIndex = Math.min(anim.path.length - 1, Math.floor(elapsed / stepMs));
  return anim.path[stepIndex];
}

function renderPawns() {
  refs.board.querySelectorAll('.token-row').forEach((row) => { row.innerHTML = ''; });
  const gameState = getGameState();
  if (!gameState?.players?.length) return;
  gameState.players.forEach((player, index) => {
    const pos = getDisplayedPosition(player, gameState);
    const tile = state.pathTiles[pos];
    if (!tile) return;
    const tokenRow = refs.board.querySelector(`.tile[data-tile-id="${tile.id}"] .token-row`);
    if (!tokenRow) return;
    const pawn = document.createElement('div');
    pawn.className = 'pawn';
    pawn.title = player.name;
    pawn.style.background = player.color || colors[index % colors.length];
    tokenRow.appendChild(pawn);
  });
}

function flashArrival(gameState = getGameState()) {
  const flash = gameState?.flash;
  if (!flash) return;
  const key = `${flash.id}:${flash.tileIndex}`;
  if (state.lastFlashKey === key) return;
  state.lastFlashKey = key;
  const tile = state.pathTiles[flash.tileIndex];
  const el = tile ? refs.board.querySelector(`.tile[data-tile-id="${tile.id}"]`) : null;
  if (!el) return;
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
}

function renderPlayersPanel() {
  const gameState = getGameState();
  refs.playersPanel.innerHTML = '';
  if (!gameState?.players?.length) {
    refs.playersPanel.innerHTML = '<div class="log-entry">Még nem indult el a játék.</div>';
    return;
  }
  const current = getCurrentPlayer(gameState);
  gameState.players.forEach((p) => {
    const tile = getCurrentTile(p.position);
    const items = p.inventory.map((id) => state.itemMap.get(id)).filter(Boolean);
    const el = document.createElement('div');
    el.className = `player-card ${p.clientId === state.clientId ? 'me' : ''} ${current?.clientId === p.clientId ? 'active' : ''}`;
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:center">
        <strong>${escapeHtml(p.name)}</strong>
        <span style="color:${escapeHtml(p.color || '#fff')}">●</span>
      </div>
      <div class="muted">Pénz: ${escapeHtml(String(p.money))} ${escapeHtml(txt(getCfg('currency_name', 'Ft')))}</div>
      <div class="muted">Mező: ${escapeHtml(tile?.name || '-')} ${p.skipTurns ? `• kimarad ${p.skipTurns}` : ''}</div>
      <div class="muted">Tárgyak: ${items.length ? items.map((item) => `${item.icon} ${item.name}`).join(', ') : 'nincs'}</div>
    `;
    refs.playersPanel.appendChild(el);
  });
}

function renderLogs() {
  const logs = getGameState()?.logs || [];
  refs.logPanel.innerHTML = '';
  if (!logs.length) {
    refs.logPanel.innerHTML = '<div class="log-entry">Még nincs esemény.</div>';
    return;
  }
  logs.slice().reverse().forEach((entry) => {
    const el = document.createElement('div');
    el.className = 'log-entry';
    el.textContent = entry.text;
    refs.logPanel.appendChild(el);
  });
}

function renderTurnUi() {
  const gameState = getGameState();
  if (!gameState?.players?.length) {
    refs.turnInfo.textContent = 'Várakozás…';
    refs.actionInfo.textContent = '-';
    refs.diceInfo.textContent = 'Dobásra várunk.';
    refs.diceBtn.disabled = true;
    refs.deckBtn.classList.add('disabled');
    refs.deckBtn.disabled = true;
    return;
  }
  const current = getCurrentPlayer(gameState);
  const me = getMePlayer(gameState);
  const myTurn = current?.clientId === state.clientId;
  refs.turnInfo.textContent = `${current?.name || '-'} köre`;
  refs.actionInfo.textContent = phaseLabel(gameState);
  refs.diceInfo.textContent = gameState.lastRoll ? `Utolsó dobás: ${gameState.lastRoll}` : 'Dobásra várunk.';
  refs.diceBtn.disabled = !(gameState.phase === 'await_roll' && myTurn);
  const canDraw = gameState.phase === 'await_draw' && myTurn;
  refs.deckBtn.disabled = !canDraw;
  refs.deckBtn.classList.toggle('disabled', !canDraw);
  if (me && myTurn && gameState.phase === 'await_roll' && me.skipTurns > 0) {
    refs.actionInfo.textContent = `Kimaradsz még ${me.skipTurns} körből`;
  }
}

function phaseLabel(gameState) {
  switch (gameState.phase) {
    case 'await_roll': return 'Dobásra várunk';
    case 'moving': return 'Mozgás folyamatban';
    case 'await_draw': return 'Paklihúzás';
    case 'overlay': return 'Esemény feldolgozása';
    case 'shop': return 'Vásárlás';
    case 'finished': return 'Vége';
    default: return gameState.phase || '-';
  }
}

function renderOverlay() {
  const overlay = getGameState()?.overlay;
  const key = JSON.stringify(overlay || null);
  if (!overlay) {
    refs.overlay.classList.add('hidden');
    refs.overlay.innerHTML = '';
    state.currentOverlayKey = '';
    return;
  }
  if (state.currentOverlayKey === key) return;
  state.currentOverlayKey = key;
  refs.overlay.classList.remove('hidden');
  refs.overlay.innerHTML = '';
  const meTurn = getCurrentPlayer()?.clientId === state.clientId;
  const card = document.createElement('div');
  card.className = 'overlay-card';
  card.innerHTML = `
    <div class="overlay-title">
      <div class="big-icon">${escapeHtml(overlay.icon || '✨')}</div>
      <div><div class="eyebrow">${escapeHtml(overlay.tag || 'ESEMÉNY')}</div><h3>${escapeHtml(overlay.title || 'Esemény')}</h3></div>
    </div>
    <div class="overlay-body">${escapeHtml(overlay.body || '')}</div>
    <div class="option-grid" id="overlayOptions"></div>
    <div class="row-actions" id="overlayActions"></div>
  `;
  refs.overlay.appendChild(card);
  const optionsEl = card.querySelector('#overlayOptions');
  const actionsEl = card.querySelector('#overlayActions');

  if (overlay.type === 'shop' && Array.isArray(overlay.options)) {
    overlay.options.forEach((opt) => {
      const item = state.itemMap.get(opt.itemId);
      if (!item) return;
      const btn = document.createElement('button');
      btn.className = `item-option ${opt.disabled ? 'disabled' : ''}`;
      btn.disabled = !meTurn || !!opt.disabled;
      btn.innerHTML = `
        <div style="font-size:30px">${escapeHtml(item.icon || '🎁')}</div>
        <strong>${escapeHtml(item.name)}</strong>
        <div class="muted">${escapeHtml(item.description || '')}</div>
        <div class="option-price">${escapeHtml(String(item.price))} ${escapeHtml(txt(getCfg('currency_name', 'Ft')))}</div>
      `;
      btn.addEventListener('click', () => chooseShopItem(item.id));
      optionsEl.appendChild(btn);
    });
  }

  if (overlay.type === 'message' || overlay.type === 'card' || overlay.type === 'tile') {
    const ok = document.createElement('button');
    ok.className = 'btn success';
    ok.textContent = overlay.buttonLabel || 'Rendben';
    ok.disabled = !meTurn;
    ok.addEventListener('click', () => handleOverlayOk());
    actionsEl.appendChild(ok);
  }

  if (overlay.type === 'shop') {
    const skip = document.createElement('button');
    skip.className = 'btn';
    skip.textContent = 'Nem veszek semmit';
    skip.disabled = !meTurn;
    skip.addEventListener('click', () => chooseShopItem(null));
    actionsEl.appendChild(skip);
  }
}

function renderDynamic() {
  renderRoomPanel();
  renderPawns();
  renderPlayersPanel();
  renderLogs();
  renderTurnUi();
  renderOverlay();
  flashArrival();
}

function pickRandom(arr) {
  if (!arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function toIdArray(value) {
  if (Array.isArray(value)) return value.map((v) => num(v)).filter(Boolean);
  if (typeof value === 'string') {
    try { return JSON.parse(value).map((v) => num(v)).filter(Boolean); } catch {}
  }
  return [];
}

function getTileShopOptions(tile, playerMoney) {
  const ids = toIdArray(tile.buy_item_ids);
  const items = ids.length ? ids.map((id) => state.itemMap.get(id)).filter(Boolean) : [];
  return items.slice(0, Math.max(1, num(tile.buy_pick_limit, 1))).map((item) => ({ itemId: item.id, disabled: item.price > playerMoney }));
}

function getCardShopOptions(card, playerMoney) {
  const ids = toIdArray(card.buy_item_ids);
  const items = ids.length ? ids.map((id) => state.itemMap.get(id)).filter(Boolean) : [];
  return items.slice(0, Math.max(1, num(card.buy_pick_limit, 1))).map((item) => ({ itemId: item.id, disabled: item.price > playerMoney }));
}

function getGiftItemIds(source) {
  return toIdArray(source.gift_item_ids);
}

function getMovePath(from, steps) {
  const total = state.pathTiles.length;
  const count = Math.abs(steps);
  const dir = steps >= 0 ? 1 : -1;
  const path = [];
  let pos = from;
  let passedStart = 0;
  for (let i = 0; i < count; i += 1) {
    const next = (pos + dir + total) % total;
    if (dir > 0 && next === 0) passedStart += 1;
    pos = next;
    path.push(pos);
  }
  return { path, to: pos, passedStart };
}

function cloneState() {
  return JSON.parse(JSON.stringify(getGameState() || {}));
}

async function saveRoomState(gameState, roomStatus = state.room?.status) {
  const res = await supabase.from('rooms').update({ state: gameState, status: roomStatus, updated_at: nowIso() }).eq('id', state.room.id).select().single();
  if (res.error) throw res.error;
  state.room = res.data;
  renderDynamic();
}

function makeBaseGameState() {
  const startingMoney = num(getCfg('starting_money', 3000), 3000);
  const players = state.roomPlayers.map((p, index) => ({
    clientId: p.client_id,
    name: p.name,
    money: startingMoney,
    position: 0,
    inventory: [],
    skipTurns: 0,
    color: colors[index % colors.length],
  }));
  return {
    phase: 'await_roll',
    turnIndex: 0,
    players,
    logs: [logEntry('A játék elindult.')],
    lastRoll: null,
    animation: null,
    pending: null,
    overlay: null,
    flash: null,
  };
}

async function startGame() {
  if (!state.room || state.room.host_client_id !== state.clientId) return;
  const gameState = makeBaseGameState();
  await saveRoomState(gameState, 'playing');
  showGame();
}

async function createRoom() {
  clearError();
  const name = getPlayerName();
  if (!name) return;
  try {
    let code = randCode();
    for (let i = 0; i < 12; i += 1) {
      const check = await supabase.from('rooms').select('id').eq('code', code).maybeSingle();
      if (!check.data) break;
      code = randCode();
    }
    const roomRes = await supabase.from('rooms').insert({ code, status: 'lobby', host_client_id: state.clientId, state: { phase: 'lobby', logs: [] }, updated_at: nowIso() }).select().single();
    if (roomRes.error) throw roomRes.error;
    const playerRes = await supabase.from('room_players').insert({ room_id: roomRes.data.id, client_id: state.clientId, name, seat_no: 0, last_seen: nowIso() });
    if (playerRes.error) throw playerRes.error;
    localStorage.setItem(STORAGE.roomCode, code);
    await refreshRoom(code);
  } catch (err) {
    showError(err.message || 'Nem sikerült a létrehozás.');
  }
}

async function joinRoom() {
  clearError();
  const name = getPlayerName();
  if (!name) return;
  const code = txt(refs.roomCodeInput.value).trim().toUpperCase();
  if (!code) return showError('Adj meg szobakódot.');
  try {
    const roomRes = await supabase.from('rooms').select('*').eq('code', code).maybeSingle();
    if (roomRes.error) throw roomRes.error;
    if (!roomRes.data) throw new Error('Nincs ilyen szoba.');
    const playersRes = await supabase.from('room_players').select('*').eq('room_id', roomRes.data.id).order('seat_no');
    if (playersRes.error) throw playersRes.error;
    const existing = (playersRes.data || []).find((p) => p.client_id === state.clientId);
    if (!existing) {
      if (roomRes.data.status === 'playing') throw new Error('A játék már fut. Ugyanazzal a böngészővel lehet visszacsatlakozni.');
      const nextSeat = (playersRes.data || []).length;
      const ins = await supabase.from('room_players').insert({ room_id: roomRes.data.id, client_id: state.clientId, name, seat_no: nextSeat, last_seen: nowIso() });
      if (ins.error) throw ins.error;
    } else {
      await supabase.from('room_players').update({ name, last_seen: nowIso() }).eq('id', existing.id);
    }
    localStorage.setItem(STORAGE.roomCode, code);
    await refreshRoom(code);
  } catch (err) {
    showError(err.message || 'Nem sikerült a csatlakozás.');
  }
}

async function refreshRoom(code = localStorage.getItem(STORAGE.roomCode)) {
  if (!code) return;
  const roomRes = await supabase.from('rooms').select('*').eq('code', code).maybeSingle();
  if (roomRes.error) throw roomRes.error;
  if (!roomRes.data) {
    state.room = null;
    state.roomPlayers = [];
    localStorage.removeItem(STORAGE.roomCode);
    refs.roomPanel.classList.add('hidden');
    showLobby();
    return;
  }
  const playersRes = await supabase.from('room_players').select('*').eq('room_id', roomRes.data.id).order('seat_no');
  if (playersRes.error) throw playersRes.error;
  state.room = roomRes.data;
  state.roomPlayers = playersRes.data || [];
  const meRow = state.roomPlayers.find((p) => p.client_id === state.clientId);
  if (meRow) await supabase.from('room_players').update({ last_seen: nowIso() }).eq('id', meRow.id);
  renderDynamic();
  if (state.room.status === 'playing' || state.room.status === 'finished') showGame(); else showLobby();
}

async function leaveRoom() {
  if (!state.room) return;
  const meRow = state.roomPlayers.find((p) => p.client_id === state.clientId);
  if (meRow) await supabase.from('room_players').delete().eq('id', meRow.id);
  if (state.room.host_client_id === state.clientId) {
    const stillRes = await supabase.from('room_players').select('*').eq('room_id', state.room.id).order('seat_no');
    const still = stillRes.data || [];
    if (still.length) {
      await supabase.from('rooms').update({ host_client_id: still[0].client_id, updated_at: nowIso() }).eq('id', state.room.id);
    } else {
      await supabase.from('rooms').delete().eq('id', state.room.id);
    }
  }
  state.room = null;
  state.roomPlayers = [];
  localStorage.removeItem(STORAGE.roomCode);
  showLobby();
  refs.roomPanel.classList.add('hidden');
  renderDynamic();
}

function makeAnimationState(gameState, player, roll, reason = 'roll') {
  const from = player.position;
  const move = getMovePath(from, roll);
  const stepMs = Math.max(200, num(getCfg('animation_ms_per_step', 430), 430));
  return {
    ...gameState,
    phase: 'moving',
    lastRoll: roll,
    overlay: null,
    animation: {
      id: crypto.randomUUID(),
      actorClientId: player.clientId,
      from,
      to: move.to,
      path: move.path,
      steps: roll,
      passedStart: move.passedStart,
      startedAt: Date.now(),
      stepMs,
      reason,
    },
    pending: { type: 'arrive_tile', source: reason, finalPosition: move.to },
  };
}

async function rollDice() {
  const gameState = cloneState();
  const current = getCurrentPlayer(gameState);
  const me = getMePlayer(gameState);
  if (!current || current.clientId !== state.clientId || gameState.phase !== 'await_roll') return;
  if (!me) return;
  if (me.skipTurns > 0) return;
  const roll = Math.floor(Math.random() * 6) + 1;
  let nextState = makeAnimationState(gameState, me, roll, 'roll');
  nextState = withLog(nextState, `${me.name} dobott: ${roll}.`);
  await saveRoomState(nextState, 'playing');
}

function nextTurn(gameState) {
  const total = gameState.players.length;
  let turnIndex = gameState.turnIndex;
  const players = gameState.players.map((p) => ({ ...p }));
  let advanced = 0;
  while (advanced < total) {
    turnIndex = (turnIndex + 1) % total;
    const player = players[turnIndex];
    if (player.skipTurns > 0) {
      player.skipTurns -= 1;
      gameState = withLog({ ...gameState, players }, `${player.name} kimarad egy kört.`);
      advanced += 1;
      continue;
    }
    break;
  }
  return { ...gameState, turnIndex, players, phase: 'await_roll', overlay: null, pending: null, animation: null };
}

function makeOverlay(type, source, body, extra = {}) {
  return {
    id: crypto.randomUUID(),
    type,
    title: source.name || source.title || 'Esemény',
    body,
    icon: source.icon || '✨',
    tag: type === 'card' ? 'KÁRTYA' : type === 'shop' ? 'VÁSÁRLÁS' : 'MEZŐ',
    ...extra,
  };
}

function grantGiftItems(player, source) {
  const ids = getGiftItemIds(source);
  const pool = ids.length ? ids : state.items.filter((i) => i.active).map((i) => i.id);
  const count = Math.max(1, num(source.gift_count, 1));
  const given = [];
  for (let i = 0; i < count; i += 1) {
    const picked = pickRandom(pool);
    if (picked) {
      player.inventory.push(picked);
      given.push(picked);
    }
  }
  return given;
}

function resolveImmediateSource(gameState, player, source, type = 'tile') {
  const playerIndex = gameState.players.findIndex((p) => p.clientId === player.clientId);
  const players = gameState.players.map((p) => ({ ...p, inventory: [...p.inventory] }));
  const livePlayer = players[playerIndex];
  let nextState = { ...gameState, players, animation: null, pending: null, flash: { id: crypto.randomUUID(), tileIndex: livePlayer.position } };

  if (type === 'tile' && source.kind === 'card') {
    nextState.phase = 'await_draw';
    nextState.overlay = makeOverlay('tile', source, `${source.description || 'Húzz a pakliból.'}\nA pakli a kocka alatt van.` , { buttonLabel: 'Oké' });
    nextState.pending = { type: 'wait_for_draw', group: source.card_group || 'chance', tileId: source.id };
    return nextState;
  }

  if ((type === 'tile' && source.kind === 'shop') || (type === 'card' && toIdArray(source.buy_item_ids).length)) {
    const options = type === 'tile' ? getTileShopOptions(source, livePlayer.money) : getCardShopOptions(source, livePlayer.money);
    nextState.phase = 'shop';
    nextState.overlay = makeOverlay('shop', source, source.description || source.body || 'Válassz, mit vennél.', { options });
    nextState.pending = { type: 'shop', sourceType: type, sourceId: source.id };
    return nextState;
  }

  if (num(source.amount, 0) !== 0) {
    livePlayer.money += num(source.amount, 0);
    const word = num(source.amount, 0) > 0 ? 'kapott' : 'fizetett';
    nextState = withLog(nextState, `${livePlayer.name} ${word} ${Math.abs(num(source.amount, 0))} ${txt(getCfg('currency_name', 'Ft'))}.`);
  }
  if (num(source.skip_turns, 0) > 0) {
    livePlayer.skipTurns += num(source.skip_turns, 0);
    nextState = withLog(nextState, `${livePlayer.name} ${num(source.skip_turns, 0)} körből kimarad.`);
  }
  const gifts = getGiftItemIds(source).length ? grantGiftItems(livePlayer, source) : [];
  if (gifts.length) {
    const names = gifts.map((id) => state.itemMap.get(id)?.name).filter(Boolean).join(', ');
    nextState = withLog(nextState, `${livePlayer.name} ajándékot kapott: ${names}.`);
  }
  if (num(source.move_steps, 0) !== 0) {
    nextState.phase = 'overlay';
    nextState.overlay = makeOverlay(type === 'card' ? 'card' : 'tile', source, `${source.body || source.description || ''}` || `${num(source.move_steps, 0) > 0 ? 'Lépj előre' : 'Lépj vissza'} ${Math.abs(num(source.move_steps, 0))} mezőt.`, { buttonLabel: 'Tovább' });
    nextState.pending = { type: 'move_again', steps: num(source.move_steps, 0), sourceType: type, sourceId: source.id };
    return nextState;
  }

  const bodyParts = [];
  if (source.description) bodyParts.push(source.description);
  if (source.body) bodyParts.push(source.body);
  if (num(source.amount, 0) > 0) bodyParts.push(`Kaptál ${num(source.amount, 0)} ${txt(getCfg('currency_name', 'Ft'))}-ot.`);
  if (num(source.amount, 0) < 0) bodyParts.push(`Fizettél ${Math.abs(num(source.amount, 0))} ${txt(getCfg('currency_name', 'Ft'))}-ot.`);
  if (num(source.skip_turns, 0) > 0) bodyParts.push(`${num(source.skip_turns, 0)} körből kimaradsz.`);
  if (gifts.length) bodyParts.push(`Ajándék: ${gifts.map((id) => state.itemMap.get(id)?.name).filter(Boolean).join(', ')}.`);
  if (!bodyParts.length) bodyParts.push('Ezen a mezőn most nincs további teendő.');

  nextState.phase = 'overlay';
  nextState.overlay = makeOverlay(type === 'card' ? 'card' : 'tile', source, bodyParts.join(' '), { buttonLabel: 'Rendben' });
  nextState.pending = { type: 'end_turn_ready' };
  return nextState;
}

async function finalizeAnimationIfNeeded() {
  const gameState = getGameState();
  if (!gameState?.animation || gameState.phase !== 'moving') return;
  const anim = gameState.animation;
  const endTime = num(anim.startedAt, 0) + (Math.max(1, anim.path?.length || 0) * Math.max(200, num(anim.stepMs, 420))) + 80;
  if (Date.now() < endTime) return;
  const current = getCurrentPlayer(gameState);
  if (!current) return;
  const nextState = cloneState();
  const player = nextState.players.find((p) => p.clientId === anim.actorClientId);
  if (!player) return;
  player.position = num(anim.to, player.position);

  if (anim.reason === 'roll') {
    const landedStart = player.position === 0 && num(anim.steps, 0) > 0;
    const passBonus = num(getCfg('pass_start_bonus', 400), 400);
    const landBonus = num(getCfg('land_start_bonus', 800), 800);
    if (landedStart) {
      player.money += landBonus;
      nextState.logs.push(logEntry(`${player.name} pontosan startra érkezett: +${landBonus} ${txt(getCfg('currency_name', 'Ft'))}.`));
    } else if (num(anim.passedStart, 0) > 0) {
      player.money += passBonus * num(anim.passedStart, 0);
      nextState.logs.push(logEntry(`${player.name} áthaladt a starton: +${passBonus * num(anim.passedStart, 0)} ${txt(getCfg('currency_name', 'Ft'))}.`));
    }
  }

  const tile = getCurrentTile(player.position);
  if (!tile) return;
  const resolved = resolveImmediateSource({ ...nextState, animation: null }, player, tile, 'tile');
  await saveRoomState(resolved, 'playing');
}

async function handleOverlayOk() {
  const gameState = cloneState();
  const current = getCurrentPlayer(gameState);
  if (!current || current.clientId !== state.clientId) return;
  const pending = gameState.pending || { type: 'end_turn_ready' };

  if (pending.type === 'wait_for_draw') {
    // close helper overlay, keep await_draw
    gameState.overlay = null;
    await saveRoomState(gameState, 'playing');
    return;
  }

  if (pending.type === 'move_again') {
    const player = getMePlayer(gameState);
    if (!player) return;
    let nextState = makeAnimationState(gameState, player, num(pending.steps, 0), 'chain_move');
    nextState = withLog(nextState, `${player.name} ${num(pending.steps, 0) > 0 ? 'előre' : 'vissza'} lép ${Math.abs(num(pending.steps, 0))} mezőt.`);
    await saveRoomState(nextState, 'playing');
    return;
  }

  if (pending.type === 'end_turn_ready') {
    const nextState = nextTurn({ ...gameState, overlay: null, pending: null, animation: null });
    await saveRoomState(nextState, 'playing');
  }
}

async function drawCard() {
  const gameState = cloneState();
  const current = getCurrentPlayer(gameState);
  if (!current || current.clientId !== state.clientId || gameState.phase !== 'await_draw') return;
  const pending = gameState.pending;
  const group = pending?.group || 'chance';
  const cards = state.cardsByGroup.get(group) || state.cardsByGroup.get('chance') || [];
  const card = pickRandom(cards);
  if (!card) return;
  let nextState = resolveImmediateSource(gameState, current, card, 'card');
  nextState = withLog(nextState, `${current.name} húzott egy kártyát: ${card.title}.`);
  await saveRoomState(nextState, 'playing');
}

async function chooseShopItem(itemId) {
  const gameState = cloneState();
  const current = getCurrentPlayer(gameState);
  if (!current || current.clientId !== state.clientId || gameState.phase !== 'shop') return;
  const players = gameState.players.map((p) => ({ ...p, inventory: [...p.inventory] }));
  const player = players.find((p) => p.clientId === state.clientId);
  const sourceInfo = gameState.pending || {};
  let source = null;
  if (sourceInfo.sourceType === 'tile') source = state.tileMap.get(sourceInfo.sourceId);
  if (sourceInfo.sourceType === 'card') {
    const cards = [...(state.cardsByGroup.get('chance') || [])];
    source = cards.find((c) => c.id === sourceInfo.sourceId) || null;
  }
  let body = 'Nem vettél semmit.';
  if (itemId) {
    const item = state.itemMap.get(itemId);
    if (!item) return;
    if (player.money < item.price) return;
    player.money -= num(item.price, 0);
    player.inventory.push(item.id);
    body = `Megvetted: ${item.icon} ${item.name}.`;
    gameState.logs.push(logEntry(`${player.name} megvette: ${item.name}.`));
  }
  const nextState = {
    ...gameState,
    players,
    phase: 'overlay',
    overlay: makeOverlay('message', source || { name: 'Vásárlás', icon: '🛒' }, body, { buttonLabel: 'Rendben' }),
    pending: { type: 'end_turn_ready' },
  };
  await saveRoomState(nextState, 'playing');
}


async function autoSkipIfNeeded() {
  const gameState = getGameState();
  const current = getCurrentPlayer(gameState);
  if (!gameState || gameState.phase !== 'await_roll' || !current || num(current.skipTurns, 0) <= 0) return;
  const nextState = nextTurn(cloneState());
  await saveRoomState(nextState, 'playing');
}

async function tick() {
  try {
    if (localStorage.getItem(STORAGE.roomCode)) await refreshRoom(localStorage.getItem(STORAGE.roomCode));
    await finalizeAnimationIfNeeded();
    await autoSkipIfNeeded();
    setStatus('Kapcsolódva');
  } catch (err) {
    console.error(err);
    setStatus('Kapcsolati hiba', true);
  }
}

async function init() {
  try {
    if (DEMO_MODE) setStatus('Config hiányzik', true);
    refs.playerNameInput.value = localStorage.getItem(STORAGE.playerName) || '';
    refs.roomCodeInput.value = localStorage.getItem(STORAGE.roomCode) || '';
    await loadDefinitions();
    const remembered = localStorage.getItem(STORAGE.roomCode);
    if (remembered) {
      try { await refreshRoom(remembered); } catch (err) { console.warn(err); }
    }
    state.pollTimer = setInterval(tick, 900);
    state.defsTimer = setInterval(async () => {
      try { await loadDefinitions(); } catch (err) { console.warn(err); }
    }, 7000);
    renderDynamic();
    setStatus('Kapcsolódva');
  } catch (err) {
    console.error(err);
    setStatus('Betöltési hiba', true);
    showError('Nem sikerült betölteni az adatokat. Futtasd le a mellékelt SQL-t.');
  }
}

refs.createRoomBtn.addEventListener('click', createRoom);
refs.joinRoomBtn.addEventListener('click', joinRoom);
refs.refreshLobbyBtn.addEventListener('click', () => refreshRoom());
refs.leaveRoomBtn.addEventListener('click', leaveRoom);
refs.leaveGameBtn.addEventListener('click', leaveRoom);
refs.startGameBtn.addEventListener('click', startGame);
refs.diceBtn.addEventListener('click', rollDice);
refs.deckBtn.addEventListener('click', drawCard);

init();
