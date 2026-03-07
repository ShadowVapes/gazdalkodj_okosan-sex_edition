import { SUPABASE_URL, SUPABASE_ANON_KEY, DEMO_MODE } from './config.js';

const supabase = !DEMO_MODE && window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

const els = {
  connectionStatus: document.getElementById('connectionStatus'),
  loadErrorBox: document.getElementById('loadErrorBox'),
  lobbyScreen: document.getElementById('lobbyScreen'),
  gameScreen: document.getElementById('gameScreen'),
  playerName: document.getElementById('playerName'),
  roomCodeInput: document.getElementById('roomCodeInput'),
  createRoomBtn: document.getElementById('createRoomBtn'),
  joinRoomBtn: document.getElementById('joinRoomBtn'),
  refreshLobbyBtn: document.getElementById('refreshLobbyBtn'),
  leaveRoomBtn: document.getElementById('leaveRoomBtn'),
  leaveGameBtn: document.getElementById('leaveGameBtn'),
  backToLobbyBtn: document.getElementById('backToLobbyBtn'),
  startGameBtn: document.getElementById('startGameBtn'),
  rollBtn: document.getElementById('rollBtn'),
  roomLobbyPanel: document.getElementById('roomLobbyPanel'),
  roomCodeTitle: document.getElementById('roomCodeTitle'),
  lobbyPlayers: document.getElementById('lobbyPlayers'),
  lobbyMeta: document.getElementById('lobbyMeta'),
  gameRoomTitle: document.getElementById('gameRoomTitle'),
  gamePlayers: document.getElementById('gamePlayers'),
  turnInfo: document.getElementById('turnInfo'),
  diceInfo: document.getElementById('diceInfo'),
  actionInfo: document.getElementById('actionInfo'),
  logList: document.getElementById('logList'),
  board: document.getElementById('board'),
};

const state = {
  isBusy: false,
  room: null,
  players: [],
  logs: [],
  tiles: [],
  cards: [],
  config: {
    starting_money: 3000,
    start_bonus: 400,
    win_money: 10000,
    required_items: 4,
  },
  session: loadSession(),
  refreshTimer: null,
};

const GRID_SIZE = 11;
const pathCells = buildPathCells(GRID_SIZE);

init();

async function init() {
  bindEvents();
  renderBoard();

  if (!supabase) {
    setStatus('Nincs beállítva a Supabase');
    setAction('Az assets/config.js fájlban add meg a saját Project URL-t és Publishable/anon kulcsot.');
    showLoadError('Ez a csomag alapból üres configgal jön. Ha előzőleg már beállítottad, ne írd felül az assets/config.js fájlt.');
    disableMainButtons(true);
    return;
  }

  setStatus('Kapcsolat ellenőrzése...');

  try {
    await loadStaticData();
    disableMainButtons(false);
    setStatus('Kapcsolódva');
  } catch (error) {
    console.error(error);
    const message = readableError(error);
    setStatus('Betöltési hiba');
    setAction(message);
    showLoadError(`Nem sikerült beolvasni a játék alapadatait. Részlet: ${message}`);
    disableMainButtons(false);
  }

  if (state.session?.roomCode && state.session?.playerId) {
    els.playerName.value = state.session.playerName || '';
    await refreshRoom();
  }
}

function bindEvents() {
  els.createRoomBtn?.addEventListener('click', createRoom);
  els.joinRoomBtn?.addEventListener('click', joinRoom);
  els.refreshLobbyBtn?.addEventListener('click', refreshRoom);
  els.startGameBtn?.addEventListener('click', startGame);
  els.rollBtn?.addEventListener('click', rollDice);
  els.leaveRoomBtn?.addEventListener('click', leaveRoom);
  els.leaveGameBtn?.addEventListener('click', leaveRoom);
  els.backToLobbyBtn?.addEventListener('click', () => showScreen('lobby'));
}

function disableMainButtons(disabled) {
  els.createRoomBtn.disabled = disabled;
  els.joinRoomBtn.disabled = disabled;
  els.startGameBtn.disabled = disabled;
  els.rollBtn.disabled = disabled;
}

function buildPathCells(size) {
  const cells = [];
  for (let col = size; col >= 1; col -= 1) cells.push({ row: size, col });
  for (let row = size - 1; row >= 1; row -= 1) cells.push({ row, col: 1 });
  for (let col = 2; col <= size; col += 1) cells.push({ row: 1, col });
  for (let row = 2; row <= size - 1; row += 1) cells.push({ row, col: size });
  return cells;
}

async function loadStaticData() {
  const [configRes, tileRes, cardRes] = await Promise.all([
    supabase.from('game_config').select('key, value'),
    supabase.from('game_tiles').select('*').order('sort_order', { ascending: true }),
    supabase.from('game_cards').select('*').order('id', { ascending: true }),
  ]);

  const warnings = [];

  if (configRes.error) {
    warnings.push(`game_config: ${readableError(configRes.error)}`);
    state.config = { ...fallbackConfig() };
  } else {
    state.config = readConfig(configRes.data || []);
  }

  if (tileRes.error || !(tileRes.data || []).length) {
    warnings.push(tileRes.error ? `game_tiles: ${readableError(tileRes.error)}` : 'game_tiles üres');
    state.tiles = fallbackTiles();
  } else {
    state.tiles = tileRes.data || [];
  }

  if (cardRes.error) {
    warnings.push(`game_cards: ${readableError(cardRes.error)}`);
    state.cards = fallbackCards();
  } else {
    state.cards = cardRes.data || [];
  }

  renderBoard();

  if (warnings.length) {
    showLoadError(`Az oldal betöltött, de néhány alap adat helyi mintából jött: ${warnings.join(' | ')}`);
    setStatus('Kapcsolódva, részleges fallbackkel');
  } else {
    hideLoadError();
  }
}

function fallbackConfig() {
  return {
    starting_money: 3000,
    start_bonus: 400,
    win_money: 10000,
    required_items: 4,
  };
}

function fallbackTiles() {
  return [
    { sort_order: 0, name: 'Start', kind: 'start', amount: 0, price: 0, card_group: null, effect: {} },
    { sort_order: 1, name: 'Fizetés', kind: 'money', amount: 600, price: 0, card_group: null, effect: {} },
    { sort_order: 2, name: 'Szerencse', kind: 'card', amount: 0, price: 0, card_group: 'chance', effect: {} },
    { sort_order: 3, name: 'Konyhaszék', kind: 'shop', amount: 0, price: 400, card_group: null, effect: { item: 'Konyhaszék', price: 400 } },
    { sort_order: 4, name: 'Villanyszámla', kind: 'money', amount: -350, price: 0, card_group: null, effect: {} },
    { sort_order: 5, name: 'Pihenő', kind: 'neutral', amount: 0, price: 0, card_group: null, effect: {} },
    { sort_order: 6, name: 'Kimaradsz', kind: 'skip', amount: 1, price: 0, card_group: null, effect: { skip_turns: 1 } },
    { sort_order: 7, name: 'Szerencse', kind: 'card', amount: 0, price: 0, card_group: 'chance', effect: {} },
    { sort_order: 8, name: 'Asztal', kind: 'shop', amount: 0, price: 900, card_group: null, effect: { item: 'Asztal', price: 900 } },
    { sort_order: 9, name: 'Bónusz', kind: 'money', amount: 800, price: 0, card_group: null, effect: {} },
    { sort_order: 10, name: 'Lépj előre', kind: 'move', amount: 2, price: 0, card_group: null, effect: { move_steps: 2 } },
    { sort_order: 11, name: 'Tv', kind: 'shop', amount: 0, price: 1300, card_group: null, effect: { item: 'Tv', price: 1300 } },
    { sort_order: 12, name: 'Szerencse', kind: 'card', amount: 0, price: 0, card_group: 'chance', effect: {} },
    { sort_order: 13, name: 'Adó', kind: 'money', amount: -700, price: 0, card_group: null, effect: {} },
    { sort_order: 14, name: 'Ágy', kind: 'shop', amount: 0, price: 1600, card_group: null, effect: { item: 'Ágy', price: 1600 } },
    { sort_order: 15, name: 'Jutalom', kind: 'money', amount: 1200, price: 0, card_group: null, effect: {} },
    { sort_order: 16, name: 'Vissza 2', kind: 'move', amount: -2, price: 0, card_group: null, effect: { move_steps: -2 } },
    { sort_order: 17, name: 'Szerencse', kind: 'card', amount: 0, price: 0, card_group: 'chance', effect: {} },
    { sort_order: 18, name: 'Hűtő', kind: 'shop', amount: 0, price: 2000, card_group: null, effect: { item: 'Hűtő', price: 2000 } },
    { sort_order: 19, name: 'Fizu', kind: 'money', amount: 1000, price: 0, card_group: null, effect: {} },
  ];
}

function fallbackCards() {
  return [
    { card_group: 'chance', title: 'Fizetésemelés', body: 'Kapsz plusz pénzt.', amount: 700, skip_turns: 0, move_steps: 0, effect: {} },
    { card_group: 'chance', title: 'Bírság', body: 'Váratlan kiadás.', amount: -500, skip_turns: 0, move_steps: 0, effect: {} },
    { card_group: 'chance', title: 'Lépj előre', body: 'Haladj még 3 mezőt.', amount: 0, skip_turns: 0, move_steps: 3, effect: {} },
    { card_group: 'chance', title: 'Kimaradsz', body: 'Pihensz egy kört.', amount: 0, skip_turns: 1, move_steps: 0, effect: {} },
    { card_group: 'chance', title: 'Ajándék rádió', body: 'Kaptál egy tárgyat.', amount: 0, skip_turns: 0, move_steps: 0, effect: { item: 'Rádió' } },
  ];
}

function readConfig(rows) {
  const merged = fallbackConfig();

  for (const row of rows) {
    if (!row?.key) continue;
    const raw = row.value;
    const value = typeof raw === 'object' && raw !== null && 'value' in raw ? raw.value : raw;
    merged[row.key] = Number.isFinite(Number(value)) ? Number(value) : value;
  }

  return merged;
}

function getPlayerName() {
  return (els.playerName.value || '').trim();
}

function normalizeCode(value) {
  return (value || '').trim().toUpperCase();
}

function requireName() {
  const name = getPlayerName();
  if (!name) {
    alert('Adj meg egy játékosnevet.');
    return null;
  }
  return name;
}

function randomRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 5; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

async function createRoom() {
  const playerName = requireName();
  if (!playerName || state.isBusy) return;

  state.isBusy = true;
  try {
    setStatus('Szoba létrehozása...');
    const roomCode = randomRoomCode();

    const roomInsert = await supabase
      .from('rooms')
      .insert({ code: roomCode, status: 'lobby', turn_index: 0, turn_no: 1 })
      .select('*')
      .single();

    if (roomInsert.error) throw roomInsert.error;

    const room = roomInsert.data;
    const playerInsert = await supabase
      .from('room_players')
      .insert({
        room_id: room.id,
        name: playerName,
        seat_no: 0,
        money: Number(state.config.starting_money || 3000),
        is_host: true,
        inventory: [],
      })
      .select('*')
      .single();

    if (playerInsert.error) throw playerInsert.error;

    const hostUpdate = await supabase
      .from('rooms')
      .update({ host_player_id: playerInsert.data.id })
      .eq('id', room.id);

    if (hostUpdate.error) throw hostUpdate.error;

    await addLog(room.id, `${playerName} létrehozta a szobát.`);
    saveSession({ roomCode, playerId: playerInsert.data.id, playerName });
    await refreshRoom();
    setStatus('Szoba létrehozva');
  } catch (error) {
    console.error(error);
    const message = readableError(error);
    alert(`Nem sikerült létrehozni a szobát: ${message}`);
    setStatus('Szobalétrehozás sikertelen');
    setAction(message);
  } finally {
    state.isBusy = false;
  }
}

async function joinRoom() {
  const playerName = requireName();
  const roomCode = normalizeCode(els.roomCodeInput.value);
  if (!playerName || !roomCode || state.isBusy) {
    if (!roomCode) alert('Adj meg szobakódot.');
    return;
  }

  state.isBusy = true;
  try {
    const roomRes = await supabase.from('rooms').select('*').eq('code', roomCode).maybeSingle();
    if (roomRes.error) throw roomRes.error;
    if (!roomRes.data) throw new Error('Nincs ilyen szoba.');
    if (roomRes.data.status === 'finished') throw new Error('Ez a szoba már befejeződött.');

    const playersRes = await supabase
      .from('room_players')
      .select('*')
      .eq('room_id', roomRes.data.id)
      .order('seat_no', { ascending: true });

    if (playersRes.error) throw playersRes.error;
    const seatNo = playersRes.data?.length || 0;

    const insertRes = await supabase
      .from('room_players')
      .insert({
        room_id: roomRes.data.id,
        name: playerName,
        seat_no: seatNo,
        money: Number(state.config.starting_money || 3000),
        is_host: false,
        inventory: [],
      })
      .select('*')
      .single();

    if (insertRes.error) throw insertRes.error;

    await addLog(roomRes.data.id, `${playerName} csatlakozott a szobához.`);
    saveSession({ roomCode, playerId: insertRes.data.id, playerName });
    await refreshRoom();
    setStatus('Csatlakozva');
  } catch (error) {
    console.error(error);
    const message = readableError(error);
    alert(`Nem sikerült csatlakozni: ${message}`);
    setStatus('Csatlakozás sikertelen');
    setAction(message);
  } finally {
    state.isBusy = false;
  }
}

async function refreshRoom() {
  if (!state.session?.roomCode || !state.session?.playerId) return;

  const roomRes = await supabase.from('rooms').select('*').eq('code', state.session.roomCode).maybeSingle();
  if (roomRes.error) {
    console.error(roomRes.error);
    setAction(readableError(roomRes.error));
    return;
  }

  if (!roomRes.data) {
    clearSession();
    renderEmptyState();
    return;
  }

  state.room = roomRes.data;

  const [playersRes, logsRes] = await Promise.all([
    supabase.from('room_players').select('*').eq('room_id', state.room.id).order('seat_no', { ascending: true }),
    supabase.from('room_logs').select('*').eq('room_id', state.room.id).order('created_at', { ascending: false }).limit(25),
  ]);

  if (playersRes.error) {
    console.error(playersRes.error);
    setAction(readableError(playersRes.error));
  }
  if (logsRes.error) console.error(logsRes.error);

  state.players = playersRes.data || [];
  state.logs = logsRes.data || [];

  renderRoom();
  ensureRefreshLoop();
}

function ensureRefreshLoop() {
  if (state.refreshTimer) return;
  state.refreshTimer = setInterval(refreshRoom, 2200);
}

function stopRefreshLoop() {
  if (!state.refreshTimer) return;
  clearInterval(state.refreshTimer);
  state.refreshTimer = null;
}

function getMe() {
  return state.players.find((player) => player.id === state.session?.playerId) || null;
}

function getActivePlayer() {
  if (!state.players.length || !state.room) return null;
  const idx = Number(state.room.turn_index || 0) % state.players.length;
  return state.players[idx] || null;
}

function showScreen(which) {
  const gameActive = which === 'game';
  els.lobbyScreen.classList.toggle('hidden', gameActive);
  els.gameScreen.classList.toggle('hidden', !gameActive);
}

function renderRoom() {
  if (!state.room) {
    renderEmptyState();
    return;
  }

  const me = getMe();
  const activePlayer = getActivePlayer();
  const isHost = Boolean(me?.is_host);

  els.roomLobbyPanel.classList.remove('hidden');
  els.roomCodeTitle.textContent = state.room.code;
  els.gameRoomTitle.textContent = `Szoba: ${state.room.code}`;
  els.roomCodeInput.value = state.room.code;

  const lobbyHtml = state.players.map((player) => playerCardHtml(player, activePlayer?.id === player.id)).join('');
  const emptyHtml = '<div class="meta-box">Még nincs játékos.</div>';
  els.lobbyPlayers.innerHTML = lobbyHtml || emptyHtml;
  els.gamePlayers.innerHTML = lobbyHtml || emptyHtml;

  els.lobbyMeta.innerHTML = `
    <div class="notice">Állapot: <strong class="mono">${escapeHtml(state.room.status)}</strong></div>
    <div class="notice top-gap">Játékosok: <strong class="mono">${state.players.length}</strong></div>
    <div class="notice top-gap">Kör: <strong class="mono">${state.room.turn_no || 1}</strong></div>
    <div class="notice top-gap">Te: <strong class="mono">${escapeHtml(me?.name || '-')}</strong></div>
  `;

  els.startGameBtn.disabled = !(isHost && state.room.status === 'lobby' && state.players.length >= 2);

  const yourTurn = activePlayer?.id === me?.id;
  els.rollBtn.disabled = !(state.room.status === 'playing' && yourTurn);
  els.turnInfo.textContent = state.room.status === 'playing'
    ? `Aktív játékos: ${activePlayer?.name || '-'} | Kör: ${state.room.turn_no || 1}`
    : state.room.status === 'finished'
      ? 'A játék véget ért.'
      : 'A játék még nem indult el.';

  const lastLog = state.logs[0]?.entry || 'Még nincs esemény.';
  setAction(lastLog);
  els.diceInfo.textContent = state.room.last_roll ? `Dobás: ${state.room.last_roll}` : '-';
  renderLogs();
  renderBoard();

  if (state.room.status === 'playing' || state.room.status === 'finished') {
    showScreen('game');
  } else {
    showScreen('lobby');
  }

  if (state.room.status === 'finished') {
    els.rollBtn.disabled = true;
  }
}

function playerCardHtml(player, isActive) {
  const me = player.id === state.session?.playerId;
  const items = Array.isArray(player.inventory) ? player.inventory.length : 0;
  const classes = ['player-card'];
  if (me) classes.push('me');
  if (isActive) classes.push('active-turn');
  return `
    <div class="${classes.join(' ')}">
      <div class="player-topline">
        <div class="player-name">${escapeHtml(player.name || 'Névtelen')}</div>
        <div class="player-sub">${player.is_host ? 'HOST' : 'JÁTÉKOS'}</div>
      </div>
      <div class="player-meta">
        <span>Pénz: ${Number(player.money || 0)} Ft</span>
        <span>Mező: ${Number(player.position || 0)}</span>
      </div>
      <div class="player-meta">
        <span>Kimaradás: ${Number(player.skip_turns || 0)}</span>
        <span>Tárgyak: ${items}</span>
      </div>
    </div>
  `;
}

function renderLogs() {
  els.logList.innerHTML = state.logs.map((row) => `
    <div class="log-item">
      <strong>${escapeHtml(row.entry || '')}</strong>
      <div class="log-time">${row.created_at ? new Date(row.created_at).toLocaleString('hu-HU') : '-'}</div>
    </div>
  `).join('') || '<div class="meta-box">Még nincs napló.</div>';
}

function renderBoard() {
  const boardMap = new Map();
  state.tiles.forEach((tile, index) => {
    const coord = pathCells[index % pathCells.length];
    boardMap.set(`${coord.row}-${coord.col}`, { tile, index });
  });

  const pawnsByPos = new Map();
  state.players.forEach((player, index) => {
    const pos = Number(player.position || 0) % Math.max(state.tiles.length, 1);
    if (!pawnsByPos.has(pos)) pawnsByPos.set(pos, []);
    pawnsByPos.get(pos).push({ player, index });
  });

  const activePlayer = getActivePlayer();
  const cells = [];
  for (let row = 1; row <= GRID_SIZE; row += 1) {
    for (let col = 1; col <= GRID_SIZE; col += 1) {
      const key = `${row}-${col}`;
      const info = boardMap.get(key);

      if (row > 1 && row < GRID_SIZE && col > 1 && col < GRID_SIZE) {
        if (row === 2 && col === 2) {
          cells.push(`
            <div class="board-cell center">
              <h2>Gazdálkodj Okosan</h2>
              <p>Egyszerű társasjáték kinézet, külön lobbyval és külön játéktérrel.</p>
              <div class="center-mini">Aktív játékos: ${escapeHtml(activePlayer?.name || '-')}</div>
              <div class="center-mini">Cél: ${Number(state.config.required_items || 4)} tárgy vagy ${Number(state.config.win_money || 10000)} Ft</div>
            </div>
          `);
        }
        continue;
      }

      if (!info) {
        cells.push('<div class="board-cell"></div>');
        continue;
      }

      const pawns = pawnsByPos.get(info.index) || [];
      const kindClass = `tile-${sanitizeCssClass(info.tile.kind || 'neutral')}`;
      cells.push(`
        <div class="board-cell path ${kindClass}">
          <div class="tile-index">#${info.index}</div>
          <div class="tile-title">${escapeHtml(info.tile.name || `Mező ${info.index}`)}</div>
          <div class="tile-kind">${escapeHtml(info.tile.kind || 'neutral')}</div>
          <div class="pawn-list">
            ${pawns.map((entry) => `<div class="pawn pawn-${entry.index % 6}" title="${escapeHtml(entry.player.name)}">${escapeHtml(entry.player.name.slice(0, 1).toUpperCase())}</div>`).join('')}
          </div>
        </div>
      `);
    }
  }

  els.board.innerHTML = cells.join('');
}

async function startGame() {
  const me = getMe();
  if (!me?.is_host || !state.room || state.room.status !== 'lobby') return;
  if (state.players.length < 2) {
    alert('Legalább 2 játékos kell a kezdéshez.');
    return;
  }

  const orderedPlayers = [...state.players].sort((a, b) => a.seat_no - b.seat_no);
  for (const player of orderedPlayers) {
    const res = await supabase
      .from('room_players')
      .update({
        position: 0,
        money: Number(state.config.starting_money || 3000),
        skip_turns: 0,
        inventory: [],
      })
      .eq('id', player.id);

    if (res.error) {
      alert(readableError(res.error));
      return;
    }
  }

  const updateRes = await supabase
    .from('rooms')
    .update({ status: 'playing', turn_index: 0, turn_no: 1, last_roll: null })
    .eq('id', state.room.id);

  if (updateRes.error) {
    alert(readableError(updateRes.error));
    return;
  }

  await addLog(state.room.id, 'A játék elindult.');
  await refreshRoom();
}

async function rollDice() {
  const me = getMe();
  const activePlayer = getActivePlayer();
  if (!me || !activePlayer || me.id !== activePlayer.id || state.room?.status !== 'playing') return;

  const workingPlayer = { ...me };
  if (Number(workingPlayer.skip_turns || 0) > 0) {
    await supabase
      .from('room_players')
      .update({ skip_turns: Number(workingPlayer.skip_turns) - 1 })
      .eq('id', workingPlayer.id);
    await addLog(state.room.id, `${workingPlayer.name} kimarad egy kört.`);
    await advanceTurn();
    await refreshRoom();
    return;
  }

  const roll = Math.floor(Math.random() * 6) + 1;
  const tileCount = Math.max(state.tiles.length, 1);
  const previousPos = Number(workingPlayer.position || 0);
  let nextPos = previousPos + roll;
  let money = Number(workingPlayer.money || 0);
  let inventory = Array.isArray(workingPlayer.inventory) ? [...workingPlayer.inventory] : [];
  let skipTurns = Number(workingPlayer.skip_turns || 0);
  const logParts = [`${workingPlayer.name} dobott: ${roll}.`];

  if (nextPos >= tileCount) {
    nextPos %= tileCount;
    const bonus = Number(state.config.start_bonus || 0);
    money += bonus;
    logParts.push(`Áthaladt a starton és kapott ${bonus} Ft-ot.`);
  }

  const result = applyTileEffect({ position: nextPos, money, inventory, skipTurns, logParts });

  const updatePlayer = await supabase
    .from('room_players')
    .update({
      position: result.position,
      money: result.money,
      inventory: result.inventory,
      skip_turns: result.skipTurns,
    })
    .eq('id', workingPlayer.id);

  if (updatePlayer.error) {
    alert(readableError(updatePlayer.error));
    return;
  }

  const isWinner = checkWin(result);
  const roomUpdate = await supabase
    .from('rooms')
    .update({ last_roll: roll, status: isWinner ? 'finished' : 'playing' })
    .eq('id', state.room.id);

  if (roomUpdate.error) {
    alert(readableError(roomUpdate.error));
    return;
  }

  await addLog(state.room.id, result.logParts.join(' '));

  if (isWinner) {
    await addLog(state.room.id, `${workingPlayer.name} megnyerte a játékot!`);
  } else {
    await advanceTurn();
  }

  await refreshRoom();
}

function applyTileEffect({ position, money, inventory, skipTurns, logParts }) {
  const tile = state.tiles[position];
  if (!tile) return { position, money, inventory, skipTurns, logParts };

  logParts.push(`Rálépett: ${tile.name || 'ismeretlen mező'}.`);
  const extra = parseObject(tile.effect);

  switch (tile.kind) {
    case 'money': {
      const amount = Number(tile.amount || extra.amount || 0);
      money += amount;
      logParts.push(amount >= 0 ? `Kapott ${amount} Ft-ot.` : `Fizetett ${Math.abs(amount)} Ft-ot.`);
      break;
    }
    case 'skip': {
      const count = Number(extra.skip_turns || tile.amount || 1);
      skipTurns += count;
      logParts.push(`${count} kör kimaradás.`);
      break;
    }
    case 'move': {
      const steps = Number(extra.move_steps || tile.amount || 0);
      const tileCount = Math.max(state.tiles.length, 1);
      position = ((position + steps) % tileCount + tileCount) % tileCount;
      logParts.push(`Továbblép ${steps} mezőt.`);
      break;
    }
    case 'card': {
      const group = tile.card_group || extra.card_group || 'chance';
      const card = randomCard(group);
      if (card) {
        const cardEffect = parseObject(card.effect);
        money += Number(card.amount || cardEffect.amount || 0);
        skipTurns += Number(card.skip_turns || cardEffect.skip_turns || 0);
        const moveSteps = Number(card.move_steps || cardEffect.move_steps || 0);
        if (moveSteps) {
          const tileCount = Math.max(state.tiles.length, 1);
          position = ((position + moveSteps) % tileCount + tileCount) % tileCount;
        }
        if (cardEffect.item) inventory.push(cardEffect.item);
        logParts.push(`Kártya: ${card.title}. ${card.body || ''}`.trim());
      } else {
        logParts.push('Nem volt húzható kártya.');
      }
      break;
    }
    case 'shop': {
      const item = extra.item || tile.name;
      const price = Number(tile.price || extra.price || 0);
      const alreadyOwn = inventory.includes(item);
      if (!alreadyOwn && price > 0 && money >= price) {
        money -= price;
        inventory.push(item);
        logParts.push(`Megvette: ${item} (${price} Ft).`);
      } else if (alreadyOwn) {
        logParts.push(`Már megvan neki: ${item}.`);
      } else {
        logParts.push(`Nem tudta megvenni: ${item}.`);
      }
      break;
    }
    default:
      logParts.push('Semmi extra nem történt.');
      break;
  }

  return { position, money, inventory, skipTurns, logParts };
}

function randomCard(group) {
  const filtered = state.cards.filter((card) => (card.card_group || 'chance') === group);
  if (!filtered.length) return null;
  return filtered[Math.floor(Math.random() * filtered.length)];
}

function checkWin(result) {
  const needMoney = Number(state.config.win_money || 10000);
  const needItems = Number(state.config.required_items || 4);
  return Number(result.money || 0) >= needMoney || (Array.isArray(result.inventory) && result.inventory.length >= needItems);
}

async function advanceTurn() {
  const nextIndex = (Number(state.room.turn_index || 0) + 1) % Math.max(state.players.length, 1);
  const nextTurnNo = nextIndex === 0 ? Number(state.room.turn_no || 1) + 1 : Number(state.room.turn_no || 1);
  await supabase.from('rooms').update({ turn_index: nextIndex, turn_no: nextTurnNo }).eq('id', state.room.id);
}

async function addLog(roomId, entry) {
  await supabase.from('room_logs').insert({ room_id: roomId, entry });
}

async function leaveRoom() {
  const me = getMe();
  if (me?.id) {
    await supabase.from('room_players').delete().eq('id', me.id);
    if (me.is_host && state.room?.id) {
      const playersRes = await supabase.from('room_players').select('*').eq('room_id', state.room.id).order('seat_no');
      const remaining = playersRes.data || [];
      if (!remaining.length) {
        await supabase.from('rooms').delete().eq('id', state.room.id);
      } else {
        await supabase.from('room_players').update({ is_host: true }).eq('id', remaining[0].id);
        await supabase.from('rooms').update({ host_player_id: remaining[0].id }).eq('id', state.room.id);
      }
    }
  }

  clearSession();
  renderEmptyState();
  stopRefreshLoop();
}

function renderEmptyState() {
  state.room = null;
  state.players = [];
  state.logs = [];
  els.roomLobbyPanel.classList.add('hidden');
  els.roomCodeTitle.textContent = '---';
  els.gameRoomTitle.textContent = 'Szoba: ---';
  els.lobbyPlayers.innerHTML = '';
  els.gamePlayers.innerHTML = '';
  els.lobbyMeta.innerHTML = '';
  els.logList.innerHTML = '';
  els.turnInfo.textContent = 'Kör információk...';
  els.diceInfo.textContent = '-';
  setAction('Hozz létre vagy lépj be egy szobába.');
  renderBoard();
  showScreen('lobby');
}

function setStatus(message) {
  els.connectionStatus.textContent = message;
}

function setAction(message) {
  els.actionInfo.textContent = message;
}

function showLoadError(message) {
  if (!els.loadErrorBox) return;
  els.loadErrorBox.textContent = message;
  els.loadErrorBox.classList.remove('hidden');
}

function hideLoadError() {
  if (!els.loadErrorBox) return;
  els.loadErrorBox.classList.add('hidden');
  els.loadErrorBox.textContent = '';
}

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem('go_session') || 'null');
  } catch {
    return null;
  }
}

function saveSession(session) {
  state.session = session;
  localStorage.setItem('go_session', JSON.stringify(session));
}

function clearSession() {
  state.session = null;
  localStorage.removeItem('go_session');
}

function parseObject(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function readableError(error) {
  if (!error) return 'Ismeretlen hiba.';
  if (typeof error === 'string') return error;
  return error.message || error.details || JSON.stringify(error);
}

function sanitizeCssClass(value) {
  return String(value || 'neutral').toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
}
