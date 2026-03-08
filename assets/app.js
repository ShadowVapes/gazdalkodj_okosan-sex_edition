import { SUPABASE_URL, SUPABASE_ANON_KEY, DEMO_MODE } from './config.js';

const supabase = !DEMO_MODE && window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

const MIN_BOARD_TILES = 32;
const POLL_MS_PLAYING = 900;
const POLL_MS_LOBBY = 2200;

const els = {
  connectionStatus: document.getElementById('connectionStatus'),
  loadErrorBox: document.getElementById('loadErrorBox'),
  titleMain: document.getElementById('titleMain'),
  subtitleMain: document.getElementById('subtitleMain'),
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
  diceFace: document.getElementById('diceFace'),
  diceLabel: document.getElementById('diceLabel'),
  actionInfo: document.getElementById('actionInfo'),
  logList: document.getElementById('logList'),
  board: document.getElementById('board'),
  eventOverlay: document.getElementById('eventOverlay'),
  eventBanner: document.getElementById('eventBanner'),
  eventCard: document.getElementById('eventCard'),
  eventIcon: document.getElementById('eventIcon'),
  eventType: document.getElementById('eventType'),
  eventTitle: document.getElementById('eventTitle'),
  eventText: document.getElementById('eventText'),
};

const state = {
  isBusy: false,
  room: null,
  players: [],
  logs: [],
  tiles: [],
  cards: [],
  items: [],
  config: fallbackConfig(),
  session: loadSession(),
  refreshTimer: null,
  refreshDebounce: null,
  channel: null,
  boardTiles: [],
  visualPositions: {},
  highlightedTileIndex: null,
  diceValue: 1,
  lastSeenLogId: null,
  processedEventIds: new Set(),
  animationQueue: [],
  isAnimating: false,
};

init();

async function init() {
  bindEvents();
  renderDice(1);
  renderBoard();

  if (!supabase) {
    setStatus('Nincs beállítva a Supabase');
    setAction('Az assets/config.js fájlban add meg a saját Project URL-t és publikus kulcsot.');
    showLoadError('A csomag minta configgal jön. A saját assets/config.js fájlodat ne írd felül.');
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
    setStatus('Betöltési hiba');
    const message = readableError(error);
    showLoadError(`Nem sikerült beolvasni az alap adatokat. ${message}`);
    setAction(message);
    disableMainButtons(false);
  }

  if (state.session?.roomCode && state.session?.playerId) {
    els.playerName.value = state.session.playerName || '';
    await refreshRoom({ firstSync: true });
  }
}

function bindEvents() {
  els.createRoomBtn?.addEventListener('click', createRoom);
  els.joinRoomBtn?.addEventListener('click', joinRoom);
  els.refreshLobbyBtn?.addEventListener('click', () => refreshRoom());
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

async function loadStaticData() {
  const [configRes, itemRes, tileRes, cardRes] = await Promise.all([
    supabase.from('game_config').select('key, value'),
    supabase.from('game_items').select('*').order('sort_order', { ascending: true }),
    supabase.from('game_tiles').select('*').order('sort_order', { ascending: true }),
    supabase.from('game_cards').select('*').order('id', { ascending: true }),
  ]);

  const warnings = [];

  if (configRes.error) {
    warnings.push(`game_config: ${readableError(configRes.error)}`);
    state.config = fallbackConfig();
  } else {
    state.config = readConfig(configRes.data || []);
  }

  if (itemRes.error) {
    warnings.push(`game_items: ${readableError(itemRes.error)}`);
    state.items = fallbackItems();
  } else {
    state.items = itemRes.data?.length ? itemRes.data : fallbackItems();
  }

  if (tileRes.error || !tileRes.data?.length) {
    warnings.push(tileRes.error ? `game_tiles: ${readableError(tileRes.error)}` : 'game_tiles üres');
    state.tiles = fallbackTiles();
  } else {
    state.tiles = tileRes.data;
  }

  if (cardRes.error) {
    warnings.push(`game_cards: ${readableError(cardRes.error)}`);
    state.cards = fallbackCards();
  } else {
    state.cards = cardRes.data?.length ? cardRes.data : fallbackCards();
  }

  applyThemeTexts();
  state.boardTiles = buildPlayableTiles();
  renderBoard();

  if (warnings.length) {
    showLoadError(`Az oldal betöltött, de néhány adat helyi mintából jött: ${warnings.join(' | ')}`);
    setStatus('Kapcsolódva, részleges fallback');
  } else {
    hideLoadError();
  }
}

function applyThemeTexts() {
  els.titleMain.textContent = String(state.config.game_title || 'Gazdálkodj Pajkosan');
  els.subtitleMain.textContent = String(state.config.game_subtitle || 'Egyszerű, vicces felnőttes paródia társasjáték.');
}

function fallbackConfig() {
  return {
    game_title: 'Gazdálkodj Pajkosan',
    game_subtitle: 'Egyszerű, vicces felnőttes paródia társasjáték.',
    currency_name: 'Ft',
    starting_money: 3000,
    start_bonus: 400,
    win_money: 10000,
    required_items: 4,
    center_text: 'Szedd össze a szükséges tárgyakat vagy gyűjts elég pénzt.',
    lobby_note: 'Az egész csak poén, társasjátékos paródia hangulattal.',
  };
}

function fallbackItems() {
  return [
    { id: 1, sort_order: 0, name: 'Szatén párna', category: 'szoba', price: 450, icon: '🛏️', required: true, blurb: 'A hangulat alapja.', effect: {} },
    { id: 2, sort_order: 1, name: 'Parfüm', category: 'stílus', price: 650, icon: '🧴', required: true, blurb: 'Ettől minden kacérabb.', effect: {} },
    { id: 3, sort_order: 2, name: 'Pezsgő', category: 'ital', price: 900, icon: '🍾', required: true, blurb: 'Koccintós kellék.', effect: {} },
    { id: 4, sort_order: 3, name: 'Rózsaszirmok', category: 'romantika', price: 550, icon: '🌹', required: true, blurb: 'Látványos bónusz.', effect: {} },
    { id: 5, sort_order: 4, name: 'Hangulatfény', category: 'hangulat', price: 780, icon: '🕯️', required: false, blurb: 'Nem kötelező, de stílusos.', effect: {} },
    { id: 6, sort_order: 5, name: 'Lepedőszett', category: 'szoba', price: 800, icon: '🧺', required: false, blurb: 'Jó ha van kéznél.', effect: {} },
  ];
}

function fallbackTiles() {
  return [
    { sort_order: 0, name: 'Start', short_name: 'Start', kind: 'start', amount: 0, price: 0, card_group: null, icon: '💋', color_key: 'gold', description: 'Indul a játék.', item_id: null, skip_turns: 0, move_steps: 0, effect: {} },
    { sort_order: 1, name: 'Flörtös fizetés', short_name: 'Fizu', kind: 'money', amount: 600, price: 0, card_group: null, icon: '💸', color_key: 'pink', description: 'Kapsz egy kis zsebpénzt.', item_id: null, skip_turns: 0, move_steps: 0, effect: {} },
    { sort_order: 2, name: 'Pikáns kártya', short_name: 'Kártya', kind: 'card', amount: 0, price: 0, card_group: 'chance', icon: '💌', color_key: 'pink', description: 'Húzz egy lapot.', item_id: null, skip_turns: 0, move_steps: 0, effect: {} },
    { sort_order: 3, name: 'Szatén bolt', short_name: 'Bolt', kind: 'shop', amount: 0, price: 450, card_group: null, icon: '🛏️', color_key: 'gold', description: 'Szatén párna vásárlás.', item_id: 1, skip_turns: 0, move_steps: 0, effect: {} },
    { sort_order: 4, name: 'Kínos lebukás', short_name: 'Bünti', kind: 'money', amount: -350, price: 0, card_group: null, icon: '🙈', color_key: 'danger', description: 'Váratlan kiadás.', item_id: null, skip_turns: 0, move_steps: 0, effect: {} },
    { sort_order: 5, name: 'Lazuló sarok', short_name: 'Pihi', kind: 'neutral', amount: 0, price: 0, card_group: null, icon: '😌', color_key: 'violet', description: 'Semmi extra.', item_id: null, skip_turns: 0, move_steps: 0, effect: {} },
    { sort_order: 6, name: 'Félreértés', short_name: 'Skip', kind: 'skip', amount: 1, price: 0, card_group: null, icon: '😵', color_key: 'danger', description: '1 kör kimaradás.', item_id: null, skip_turns: 1, move_steps: 0, effect: {} },
    { sort_order: 7, name: 'Parfüm pult', short_name: 'Bolt', kind: 'shop', amount: 0, price: 650, card_group: null, icon: '🧴', color_key: 'gold', description: 'Parfüm vásárlás.', item_id: 2, skip_turns: 0, move_steps: 0, effect: {} },
    { sort_order: 8, name: 'Rajongói borravaló', short_name: 'Bónusz', kind: 'money', amount: 800, price: 0, card_group: null, icon: '💰', color_key: 'gold', description: 'Extra pénz.', item_id: null, skip_turns: 0, move_steps: 0, effect: {} },
    { sort_order: 9, name: 'Gyors randistart', short_name: '+2', kind: 'move', amount: 2, price: 0, card_group: null, icon: '🏃', color_key: 'violet', description: 'Lépj előre kettőt.', item_id: null, skip_turns: 0, move_steps: 2, effect: {} },
    { sort_order: 10, name: 'Pezsgő sarok', short_name: 'Bolt', kind: 'shop', amount: 0, price: 900, card_group: null, icon: '🍾', color_key: 'gold', description: 'Pezsgő vásárlás.', item_id: 3, skip_turns: 0, move_steps: 0, effect: {} },
    { sort_order: 11, name: 'Pikáns kártya', short_name: 'Kártya', kind: 'card', amount: 0, price: 0, card_group: 'chance', icon: '💌', color_key: 'pink', description: 'Újabb lap.', item_id: null, skip_turns: 0, move_steps: 0, effect: {} },
    { sort_order: 12, name: 'Adó és dráma', short_name: 'Adó', kind: 'money', amount: -700, price: 0, card_group: null, icon: '🧾', color_key: 'danger', description: 'Fizesd ki.', item_id: null, skip_turns: 0, move_steps: 0, effect: {} },
    { sort_order: 13, name: 'Rózsás bolt', short_name: 'Bolt', kind: 'shop', amount: 0, price: 550, card_group: null, icon: '🌹', color_key: 'gold', description: 'Rózsaszirmok vásárlás.', item_id: 4, skip_turns: 0, move_steps: 0, effect: {} },
    { sort_order: 14, name: 'Vakmerő siker', short_name: 'Jutalom', kind: 'money', amount: 1200, price: 0, card_group: null, icon: '🔥', color_key: 'pink', description: 'Szép kör volt.', item_id: null, skip_turns: 0, move_steps: 0, effect: {} },
    { sort_order: 15, name: 'Hangulatfény bolt', short_name: 'Bolt', kind: 'shop', amount: 0, price: 780, card_group: null, icon: '🕯️', color_key: 'gold', description: 'Hangulatfény vásárlás.', item_id: 5, skip_turns: 0, move_steps: 0, effect: {} },
    { sort_order: 16, name: 'Vissza a valóságba', short_name: '-2', kind: 'move', amount: -2, price: 0, card_group: null, icon: '↩️', color_key: 'violet', description: 'Lépj vissza kettőt.', item_id: null, skip_turns: 0, move_steps: -2, effect: {} },
    { sort_order: 17, name: 'Pikáns kártya', short_name: 'Kártya', kind: 'card', amount: 0, price: 0, card_group: 'chance', icon: '💌', color_key: 'pink', description: 'Húzz még.', item_id: null, skip_turns: 0, move_steps: 0, effect: {} },
    { sort_order: 18, name: 'Lepedő bolt', short_name: 'Bolt', kind: 'shop', amount: 0, price: 800, card_group: null, icon: '🧺', color_key: 'gold', description: 'Lepedőszett vásárlás.', item_id: 6, skip_turns: 0, move_steps: 0, effect: {} },
    { sort_order: 19, name: 'Show végén kassza', short_name: 'Kassza', kind: 'money', amount: 1000, price: 0, card_group: null, icon: '🎉', color_key: 'pink', description: 'Újabb pénz.', item_id: null, skip_turns: 0, move_steps: 0, effect: {} },
  ];
}

function fallbackCards() {
  return [
    { card_group: 'chance', title: 'Pezsgős koccintás', body: 'Kapsz egy kis plusz pénzt.', amount: 700, skip_turns: 0, move_steps: 0, item_id: null, effect: {} },
    { card_group: 'chance', title: 'Kínos üzenet', body: 'Befizetsz egy váratlan büntit.', amount: -500, skip_turns: 0, move_steps: 0, item_id: null, effect: {} },
    { card_group: 'chance', title: 'Sikeres nyitás', body: 'Lépj előre 3 mezőt.', amount: 0, skip_turns: 0, move_steps: 3, item_id: null, effect: {} },
    { card_group: 'chance', title: 'Megfázott romantika', body: '1 kör kimaradás.', amount: 0, skip_turns: 1, move_steps: 0, item_id: null, effect: {} },
    { card_group: 'chance', title: 'Ajándék rózsa', body: 'Kaptál egy tárgyat.', amount: 0, skip_turns: 0, move_steps: 0, item_id: 4, effect: {} },
    { card_group: 'chance', title: 'Rajongói ajándék', body: 'Kapsz hangulatfényt.', amount: 0, skip_turns: 0, move_steps: 0, item_id: 5, effect: {} },
  ];
}

function readConfig(rows) {
  const merged = fallbackConfig();
  for (const row of rows) {
    if (!row?.key) continue;
    const raw = row.value;
    const normalized = typeof raw === 'object' && raw !== null && 'value' in raw ? raw.value : raw;
    merged[row.key] = normalized;
  }
  return merged;
}

function buildPlayableTiles() {
  const base = (state.tiles?.length ? state.tiles : fallbackTiles()).map((tile, index) => ({
    ...tile,
    sort_order: Number(tile.sort_order ?? index),
  })).sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));

  if (base.length >= MIN_BOARD_TILES) return base;

  const templates = expandedTemplateTiles();
  const out = [...base];
  for (let i = out.length; i < MIN_BOARD_TILES; i += 1) {
    const template = templates[i] || templates[i % templates.length] || fallbackTiles()[i % fallbackTiles().length];
    out.push({
      ...template,
      sort_order: i,
      _generated: true,
    });
  }
  return out;
}

function expandedTemplateTiles() {
  return [
    ...fallbackTiles(),
    { sort_order: 20, name: 'Kacér kassza', short_name: 'Kassza', kind: 'money', amount: 500, price: 0, card_group: null, icon: '💸', color_key: 'pink', description: 'Apró plusz pénz.', item_id: null, skip_turns: 0, move_steps: 0, effect: {} },
    { sort_order: 21, name: 'Pletykasarok', short_name: 'Pletyka', kind: 'skip', amount: 1, price: 0, card_group: null, icon: '🫢', color_key: 'danger', description: 'Pletyka miatt kimaradsz.', item_id: null, skip_turns: 1, move_steps: 0, effect: {} },
    { sort_order: 22, name: 'Randi ügynök', short_name: '+2', kind: 'move', amount: 2, price: 0, card_group: null, icon: '💃', color_key: 'violet', description: 'Lépj előre kettőt.', item_id: null, skip_turns: 0, move_steps: 2, effect: {} },
    { sort_order: 23, name: 'Pikáns kártya', short_name: 'Kártya', kind: 'card', amount: 0, price: 0, card_group: 'chance', icon: '💌', color_key: 'pink', description: 'Húzz lapot.', item_id: null, skip_turns: 0, move_steps: 0, effect: {} },
    { sort_order: 24, name: 'Árnyfény pult', short_name: 'Bolt', kind: 'shop', amount: 0, price: 780, card_group: null, icon: '🕯️', color_key: 'gold', description: 'Hangulatfény vásárlás.', item_id: 5, skip_turns: 0, move_steps: 0, effect: {} },
    { sort_order: 25, name: 'Kínos számla', short_name: 'Számla', kind: 'money', amount: -450, price: 0, card_group: null, icon: '🧾', color_key: 'danger', description: 'Fizesd ki.', item_id: null, skip_turns: 0, move_steps: 0, effect: {} },
    { sort_order: 26, name: 'Pikáns kártya', short_name: 'Kártya', kind: 'card', amount: 0, price: 0, card_group: 'chance', icon: '💌', color_key: 'pink', description: 'Még egy húzás.', item_id: null, skip_turns: 0, move_steps: 0, effect: {} },
    { sort_order: 27, name: 'Duett bónusz', short_name: 'Bónusz', kind: 'money', amount: 950, price: 0, card_group: null, icon: '🎶', color_key: 'green', description: 'Kapsz egy bónuszt.', item_id: null, skip_turns: 0, move_steps: 0, effect: {} },
    { sort_order: 28, name: 'Túl sok üzenet', short_name: 'Skip', kind: 'skip', amount: 1, price: 0, card_group: null, icon: '📵', color_key: 'danger', description: '1 kör kimaradás.', item_id: null, skip_turns: 1, move_steps: 0, effect: {} },
    { sort_order: 29, name: 'Visszafordító csók', short_name: '-2', kind: 'move', amount: -2, price: 0, card_group: null, icon: '↩️', color_key: 'violet', description: 'Lépj vissza kettőt.', item_id: null, skip_turns: 0, move_steps: -2, effect: {} },
    { sort_order: 30, name: 'Titkos boríték', short_name: 'Kártya', kind: 'card', amount: 0, price: 0, card_group: 'chance', icon: '💌', color_key: 'pink', description: 'Újabb kártya.', item_id: null, skip_turns: 0, move_steps: 0, effect: {} },
    { sort_order: 31, name: 'Éjféli kassza', short_name: 'Kassza', kind: 'money', amount: 1100, price: 0, card_group: null, icon: '🌙', color_key: 'gold', description: 'Szép kis plusz.', item_id: null, skip_turns: 0, move_steps: 0, effect: {} },
  ];
}

function getCurrencyLabel() {
  return String(state.config.currency_name || 'Ft');
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
    let roomCode = randomRoomCode();

    for (let i = 0; i < 5; i += 1) {
      const exists = await supabase.from('rooms').select('id').eq('code', roomCode).maybeSingle();
      if (!exists.data) break;
      roomCode = randomRoomCode();
    }

    const roomInsert = await supabase
      .from('rooms')
      .insert({ code: roomCode, status: 'lobby', turn_index: 0, turn_no: 1, last_roll: null })
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
        position: 0,
        money: Number(state.config.starting_money || 0),
        skip_turns: 0,
        inventory: [],
        is_host: true,
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
    await refreshRoom({ firstSync: true });
    setStatus('Szoba létrehozva');
  } catch (error) {
    console.error(error);
    alert(`Nem sikerült létrehozni a szobát: ${readableError(error)}`);
    setStatus('Szobalétrehozás sikertelen');
  } finally {
    state.isBusy = false;
    renderRoom();
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

    const playersRes = await supabase.from('room_players').select('*').eq('room_id', roomRes.data.id).order('seat_no');
    if (playersRes.error) throw playersRes.error;

    const sameName = (playersRes.data || []).some((player) => String(player.name || '').toLowerCase() === playerName.toLowerCase());
    if (sameName) throw new Error('Ez a név már foglalt ebben a szobában.');

    const insertRes = await supabase
      .from('room_players')
      .insert({
        room_id: roomRes.data.id,
        name: playerName,
        seat_no: (playersRes.data || []).length,
        position: 0,
        money: Number(state.config.starting_money || 0),
        skip_turns: 0,
        inventory: [],
        is_host: false,
      })
      .select('*')
      .single();

    if (insertRes.error) throw insertRes.error;

    await addLog(roomRes.data.id, `${playerName} csatlakozott a szobához.`);
    saveSession({ roomCode, playerId: insertRes.data.id, playerName });
    await refreshRoom({ firstSync: true });
    setStatus('Csatlakozva');
  } catch (error) {
    console.error(error);
    alert(`Nem sikerült csatlakozni: ${readableError(error)}`);
    setStatus('Csatlakozás sikertelen');
  } finally {
    state.isBusy = false;
    renderRoom();
  }
}

async function refreshRoom(options = {}) {
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

  const previousRoomId = state.room?.id || null;
  state.room = roomRes.data;

  const [playersRes, logsRes] = await Promise.all([
    supabase.from('room_players').select('*').eq('room_id', state.room.id).order('seat_no', { ascending: true }),
    supabase.from('room_logs').select('*').eq('room_id', state.room.id).order('id', { ascending: true }).limit(80),
  ]);

  if (playersRes.error) console.error(playersRes.error);
  if (logsRes.error) console.error(logsRes.error);

  state.players = playersRes.data || [];
  state.logs = logsRes.data || [];
  state.boardTiles = buildPlayableTiles();

  if (previousRoomId !== state.room.id) {
    state.visualPositions = {};
    state.highlightedTileIndex = null;
    state.lastSeenLogId = options.firstSync ? maxLogId(state.logs) : state.lastSeenLogId;
    state.processedEventIds = new Set();
    subscribeRoom();
  } else if (options.firstSync && state.lastSeenLogId == null) {
    state.lastSeenLogId = maxLogId(state.logs);
  }

  syncVisualPositions();
  renderRoom();
  processIncomingLogs(state.logs, { skipReplay: options.firstSync === true && previousRoomId !== state.room.id });
  ensureRefreshLoop();
}

function ensureRefreshLoop() {
  stopRefreshLoop();
  const ms = state.room?.status === 'playing' ? POLL_MS_PLAYING : POLL_MS_LOBBY;
  state.refreshTimer = setInterval(() => refreshRoom().catch(console.error), ms);
}

function stopRefreshLoop() {
  if (!state.refreshTimer) return;
  clearInterval(state.refreshTimer);
  state.refreshTimer = null;
}

function subscribeRoom() {
  if (!supabase || !state.room?.id) return;
  unsubscribeRoom();

  state.channel = supabase
    .channel(`room-sync-${state.room.id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${state.room.id}` }, debouncedRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'room_players', filter: `room_id=eq.${state.room.id}` }, debouncedRefresh)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'room_logs', filter: `room_id=eq.${state.room.id}` }, debouncedRefresh)
    .subscribe();
}

function unsubscribeRoom() {
  if (!state.channel || !supabase) return;
  try {
    supabase.removeChannel(state.channel);
  } catch (error) {
    console.error(error);
  }
  state.channel = null;
}

function debouncedRefresh() {
  clearTimeout(state.refreshDebounce);
  state.refreshDebounce = setTimeout(() => {
    refreshRoom().catch(console.error);
  }, 120);
}

function syncVisualPositions() {
  if (state.isAnimating) return;
  const next = {};
  for (const player of state.players) {
    next[player.id] = wrapPosition(Number(player.position || 0), state.boardTiles.length || 1);
  }
  state.visualPositions = next;
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
  const isGame = which === 'game';
  els.lobbyScreen.classList.toggle('hidden', isGame);
  els.gameScreen.classList.toggle('hidden', !isGame);
}

function renderRoom() {
  if (!state.room) {
    renderEmptyState();
    return;
  }

  const me = getMe();
  const activePlayer = getActivePlayer();
  const isHost = Boolean(me?.is_host);
  const currency = getCurrencyLabel();

  els.roomLobbyPanel.classList.remove('hidden');
  els.roomCodeTitle.textContent = state.room.code;
  els.gameRoomTitle.textContent = `Szoba: ${state.room.code}`;
  els.roomCodeInput.value = state.room.code;

  const playersHtml = state.players.map((player, idx) => playerCardHtml(player, activePlayer?.id === player.id, idx)).join('');
  els.lobbyPlayers.innerHTML = playersHtml || '<div class="meta-box">Még nincs játékos.</div>';
  els.gamePlayers.innerHTML = playersHtml || '<div class="meta-box">Még nincs játékos.</div>';

  els.lobbyMeta.innerHTML = `
    <div class="notice">Állapot: <strong class="mono">${escapeHtml(state.room.status)}</strong></div>
    <div class="notice top-gap">Játékosok: <strong class="mono">${state.players.length}</strong></div>
    <div class="notice top-gap">Kör: <strong class="mono">${Number(state.room.turn_no || 1)}</strong></div>
    <div class="notice top-gap">Te: <strong class="mono">${escapeHtml(me?.name || '-')}</strong></div>
    <div class="notice top-gap">Host: <strong class="mono">${isHost ? 'igen' : 'nem'}</strong></div>
    <div class="notice top-gap">Megjegyzés: ${escapeHtml(String(state.config.lobby_note || ''))}</div>
  `;

  els.startGameBtn.disabled = !(isHost && state.room.status === 'lobby' && state.players.length >= 2);
  const yourTurn = activePlayer?.id === me?.id;
  els.rollBtn.disabled = !(state.room.status === 'playing' && yourTurn && !state.isBusy);

  els.turnInfo.textContent = state.room.status === 'playing'
    ? `Aktív játékos: ${activePlayer?.name || '-'} | Kör: ${Number(state.room.turn_no || 1)}`
    : state.room.status === 'finished'
      ? 'A játék véget ért.'
      : 'A játék még nem indult el.';

  els.diceInfo.textContent = state.room.last_roll ? `Utolsó dobás: ${state.room.last_roll}` : '-';
  els.diceLabel.textContent = state.room.last_roll ? `Utolsó dobás: ${state.room.last_roll}` : 'Készen áll';

  const latest = [...state.logs].reverse().find((row) => row.entry)?.entry
    || `Győzelem: ${Number(state.config.required_items || 0)} kötelező tárgy vagy ${Number(state.config.win_money || 0)} ${currency}.`;
  setAction(latest);

  renderLogs();
  renderBoard();

  if (state.room.status === 'playing' || state.room.status === 'finished') {
    showScreen('game');
  } else {
    showScreen('lobby');
  }
}

function playerCardHtml(player, isActive, colorIndex) {
  const me = player.id === state.session?.playerId;
  const inventory = normalizeInventory(player.inventory);
  const requiredCount = inventory.filter((item) => item.required !== false).length;
  const currency = getCurrencyLabel();
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
        <span>Pénz: ${Number(player.money || 0)} ${escapeHtml(currency)}</span>
        <span>Mező: ${Number(player.position || 0)}</span>
      </div>
      <div class="player-meta">
        <span>Kimaradás: ${Number(player.skip_turns || 0)}</span>
        <span>Kötelező tárgy: ${requiredCount}</span>
      </div>
      <div class="player-items">
        ${inventory.length
          ? inventory.map((item) => `<span class="item-chip ${item.required === false ? 'optional' : ''}" title="${escapeHtml(item.name || '')}">${escapeHtml(item.icon || '🎁')} ${escapeHtml(shortName(item.name || '', 12))}</span>`).join('')
          : `<span class="tag-chip">Még nincs tárgy</span>`}
      </div>
    </div>
  `;
}

function renderLogs() {
  const rows = [...state.logs].slice(-25).reverse();
  els.logList.innerHTML = rows.map((row) => `
    <div class="log-item">
      <strong>${escapeHtml(row.entry || '')}</strong>
      <div class="log-time">${row.created_at ? new Date(row.created_at).toLocaleString('hu-HU') : '-'}</div>
    </div>
  `).join('') || '<div class="meta-box">Még nincs napló.</div>';
}

function renderBoard() {
  const tiles = state.boardTiles.length ? state.boardTiles : buildPlayableTiles();
  const tileCount = Math.max(tiles.length, 1);
  const boardSize = getBoardSize(tileCount);
  els.board.style.setProperty('--board-size', String(boardSize));
  const pathCells = buildPathCells(boardSize);
  const boardMap = new Map();

  tiles.forEach((tile, index) => {
    const coord = pathCells[index];
    if (coord) boardMap.set(`${coord.row}-${coord.col}`, { tile, index });
  });

  const pawnsByPos = new Map();
  state.players.forEach((player, idx) => {
    const pos = state.visualPositions[player.id] ?? wrapPosition(Number(player.position || 0), tileCount);
    if (!pawnsByPos.has(pos)) pawnsByPos.set(pos, []);
    pawnsByPos.get(pos).push({ player, idx });
  });

  const cells = [];
  for (let row = 1; row <= boardSize; row += 1) {
    for (let col = 1; col <= boardSize; col += 1) {
      const key = `${row}-${col}`;
      const info = boardMap.get(key);
      const isCenter = row > 1 && row < boardSize && col > 1 && col < boardSize;

      if (isCenter) {
        if (row === 2 && col === 2) {
          cells.push(`<div class="board-cell empty" style="grid-column: 2 / span ${boardSize - 2}; grid-row: 2 / span ${boardSize - 2};"></div>`);
        }
        continue;
      }

      if (!info) {
        cells.push('<div class="board-cell empty"></div>');
        continue;
      }

      const tile = info.tile;
      const pawns = pawnsByPos.get(info.index) || [];
      const kindClass = sanitizeCssClass(tile.color_key || tile.kind || 'neutral');
      const title = tile.name || tile.short_name || `Mező ${info.index}`;
      const isHighlighted = state.highlightedTileIndex === info.index;

      cells.push(`
        <div class="board-cell path tile-${kindClass} ${isHighlighted ? 'highlighted' : ''}" title="${escapeHtml(tile.name || '')}">
          <div class="tile-topline">
            <div class="tile-index">#${info.index}</div>
            <div class="tile-icon">${escapeHtml(tile.icon || defaultTileIcon(tile.kind))}</div>
          </div>
          <div class="tile-title">${escapeHtml(title)}</div>
          <div class="tile-desc">${escapeHtml(tile.description || tile.kind || '')}</div>
          <div class="pawn-list">
            ${pawns.map((entry) => `<div class="pawn pawn-${entry.idx % 6}" title="${escapeHtml(entry.player.name || '')}">${escapeHtml((entry.player.name || '?').slice(0, 1).toUpperCase())}</div>`).join('')}
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

  state.isBusy = true;
  renderRoom();

  try {
    const ordered = [...state.players].sort((a, b) => Number(a.seat_no || 0) - Number(b.seat_no || 0));
    for (const player of ordered) {
      const res = await supabase
        .from('room_players')
        .update({
          position: 0,
          money: Number(state.config.starting_money || 0),
          skip_turns: 0,
          inventory: [],
        })
        .eq('id', player.id);
      if (res.error) throw res.error;
    }

    const updateRes = await supabase
      .from('rooms')
      .update({ status: 'playing', turn_index: 0, turn_no: 1, last_roll: null })
      .eq('id', state.room.id);

    if (updateRes.error) throw updateRes.error;

    await addLog(state.room.id, 'A játék elindult.');
    await refreshRoom();
  } catch (error) {
    alert(readableError(error));
  } finally {
    state.isBusy = false;
    renderRoom();
  }
}

async function rollDice() {
  const me = getMe();
  const activePlayer = getActivePlayer();
  if (!me || !activePlayer || me.id !== activePlayer.id || state.room?.status !== 'playing' || state.isBusy) return;

  state.isBusy = true;
  renderRoom();

  try {
    const tiles = state.boardTiles;
    const tileCount = Math.max(tiles.length, 1);
    const startingPosition = wrapPosition(Number(me.position || 0), tileCount);

    if (Number(me.skip_turns || 0) > 0) {
      const skipLeft = Number(me.skip_turns || 0) - 1;
      const skipRes = await supabase.from('room_players').update({ skip_turns: skipLeft }).eq('id', me.id);
      if (skipRes.error) throw skipRes.error;
      await advanceTurn();

      const payload = {
        type: 'skip_notice',
        startAt: Date.now() + 250,
        actorId: me.id,
        actorName: me.name,
        title: 'Kör kimarad',
        body: `${me.name} most pihen egy kört.`,
        banner: `${me.name} kimarad ebből a körből.`,
        icon: '😴',
        colorKey: 'blue',
      };
      const logRow = await addLog(state.room.id, `${me.name} kimarad egy kört.`, payload);
      if (logRow) queueEventFromLog(logRow);
      await refreshRoom();
      return;
    }

    const roll = Math.floor(Math.random() * 6) + 1;
    const movePath = [];
    let rawTarget = startingPosition;
    for (let step = 0; step < roll; step += 1) {
      rawTarget = wrapPosition(rawTarget + 1, tileCount);
      movePath.push(rawTarget);
    }

    let money = Number(me.money || 0);
    let inventory = normalizeInventory(me.inventory);
    let skipTurns = Number(me.skip_turns || 0);
    const summaryParts = [];
    const bannerParts = [];

    if (startingPosition + roll >= tileCount) {
      const bonus = Number(state.config.start_bonus || 0);
      money += bonus;
      summaryParts.push(`Áthaladt a starton és kapott ${bonus} ${getCurrencyLabel()}.`);
      bannerParts.push(`Start bónusz: +${bonus} ${getCurrencyLabel()}`);
    }

    const tile = tiles[rawTarget];
    const resolution = resolveTile(tile, { money, inventory, skipTurns, position: rawTarget });
    money = resolution.money;
    inventory = resolution.inventory;
    skipTurns = resolution.skipTurns;
    let finalPosition = resolution.position;

    let followupPath = [];
    if (finalPosition !== rawTarget) {
      followupPath = buildLinearPath(rawTarget, finalPosition, tileCount, resolution.positionDelta || 0);
    }

    const playerUpdate = await supabase
      .from('room_players')
      .update({
        position: finalPosition,
        money,
        inventory,
        skip_turns: skipTurns,
      })
      .eq('id', me.id);

    if (playerUpdate.error) throw playerUpdate.error;

    const winner = checkWin({ money, inventory });
    const roomUpdate = await supabase
      .from('rooms')
      .update({ last_roll: roll, status: winner ? 'finished' : 'playing' })
      .eq('id', state.room.id);

    if (roomUpdate.error) throw roomUpdate.error;

    summaryParts.push(...resolution.summaryParts);
    bannerParts.push(...resolution.bannerParts);

    const entry = [`${me.name} dobott: ${roll}.`, ...summaryParts].join(' ');
    const payload = {
      type: 'turn_action',
      startAt: Date.now() + 250,
      actorId: me.id,
      actorName: me.name,
      roll,
      fromPosition: startingPosition,
      movePath,
      followupPath,
      landingPosition: rawTarget,
      finalPosition,
      tile: summarizeTileForOverlay(tile, rawTarget, resolution.tileBanner),
      card: resolution.cardOverlay,
      banner: bannerParts.join(' • ') || `${me.name} dobott: ${roll}`,
      summary: entry,
      winnerName: winner ? me.name : '',
    };

    const logRow = await addLog(state.room.id, entry, payload);
    if (winner) {
      await addLog(state.room.id, `${me.name} megnyerte a játékot!`);
    } else {
      await advanceTurn();
    }

    if (logRow) queueEventFromLog(logRow);
    await refreshRoom();
  } catch (error) {
    console.error(error);
    alert(readableError(error));
  } finally {
    state.isBusy = false;
    renderRoom();
  }
}

function resolveTile(tile, current) {
  const out = {
    position: current.position,
    money: Number(current.money || 0),
    inventory: normalizeInventory(current.inventory),
    skipTurns: Number(current.skipTurns || 0),
    summaryParts: [],
    bannerParts: [],
    tileBanner: '',
    cardOverlay: null,
    positionDelta: 0,
  };

  if (!tile) {
    out.summaryParts.push('Nem volt mezőhatás.');
    return out;
  }

  const extra = parseObject(tile.effect);
  const currency = getCurrencyLabel();
  out.summaryParts.push(`Rálépett: ${tile.name || 'ismeretlen mező'}.`);

  switch (tile.kind) {
    case 'start':
      out.tileBanner = 'Start mező';
      out.summaryParts.push('Semmi extra, csak újra a starton van.');
      break;
    case 'money': {
      const amount = Number(tile.amount || extra.amount || 0);
      out.money += amount;
      out.tileBanner = amount >= 0 ? `Pénz: +${amount} ${currency}` : `Pénz: -${Math.abs(amount)} ${currency}`;
      out.bannerParts.push(out.tileBanner);
      out.summaryParts.push(amount >= 0 ? `Kapott ${amount} ${currency}.` : `Fizetett ${Math.abs(amount)} ${currency}.`);
      break;
    }
    case 'skip': {
      const count = Number(tile.skip_turns || extra.skip_turns || tile.amount || 1);
      out.skipTurns += count;
      out.tileBanner = `${count} kör kimaradás`;
      out.bannerParts.push(out.tileBanner);
      out.summaryParts.push(`${count} kör kimaradás.`);
      break;
    }
    case 'move': {
      const steps = Number(tile.move_steps || extra.move_steps || tile.amount || 0);
      out.position = wrapPosition(out.position + steps, state.boardTiles.length);
      out.positionDelta = steps;
      out.tileBanner = `${steps >= 0 ? '+' : '-'}${Math.abs(steps)} mező`;
      out.bannerParts.push(out.tileBanner);
      out.summaryParts.push(`${steps >= 0 ? 'Előre' : 'Vissza'} ${Math.abs(steps)} mező.`);
      break;
    }
    case 'card': {
      const group = tile.card_group || extra.card_group || 'chance';
      const card = randomCard(group);
      out.tileBanner = 'Szerencsekártya';
      if (card) {
        applyCard(card, out);
      } else {
        out.summaryParts.push('Nem volt húzható kártya.');
      }
      break;
    }
    case 'shop': {
      const item = tile.item_id ? getItemById(tile.item_id) : null;
      const price = Number(tile.price || item?.price || extra.price || 0);
      const fallbackName = extra.item_name || tile.name || 'Tárgy';
      const alreadyOwn = item
        ? hasItem(out.inventory, item)
        : out.inventory.some((row) => String(row.name || '').toLowerCase() === String(fallbackName).toLowerCase());

      if (alreadyOwn) {
        out.tileBanner = 'Már megvan ez a tárgy';
        out.summaryParts.push('Már megvan neki ez a tárgy.');
      } else if (price > 0 && out.money >= price) {
        out.money -= price;
        out.inventory = maybeAddInventoryItem(out.inventory, item || { name: fallbackName, icon: tile.icon || '🎁', required: false });
        out.tileBanner = `Vásárlás: ${item?.name || fallbackName}`;
        out.bannerParts.push(`-${price} ${currency}`);
        out.summaryParts.push(`Megvette: ${(item?.name || fallbackName)} (${price} ${currency}).`);
      } else {
        out.tileBanner = 'Nincs elég pénz';
        out.summaryParts.push(`Nem tudta megvenni: ${(item?.name || fallbackName)}.`);
      }
      break;
    }
    default:
      out.tileBanner = tile.description || 'Semmi extra';
      out.summaryParts.push(tile.description || 'Semmi extra nem történt.');
      break;
  }

  if (extra.bonus_money) {
    out.money += Number(extra.bonus_money || 0);
    out.bannerParts.push(`+${Number(extra.bonus_money)} ${currency}`);
    out.summaryParts.push(`Extra bónusz: +${Number(extra.bonus_money)} ${currency}.`);
  }

  return out;
}

function applyCard(card, out) {
  const cardEffect = parseObject(card.effect);
  const currency = getCurrencyLabel();
  const amount = Number(card.amount || cardEffect.amount || 0);
  const skip = Number(card.skip_turns || cardEffect.skip_turns || 0);
  const move = Number(card.move_steps || cardEffect.move_steps || 0);

  out.money += amount;
  out.skipTurns += skip;
  if (move) {
    out.position = wrapPosition(out.position + move, state.boardTiles.length);
    out.positionDelta += move;
  }

  let giftedItem = null;
  if (card.item_id) {
    giftedItem = getItemById(card.item_id);
  } else if (cardEffect.item_name) {
    giftedItem = { name: cardEffect.item_name, icon: '🎁', required: false };
  }
  if (giftedItem) {
    out.inventory = maybeAddInventoryItem(out.inventory, giftedItem);
  }

  const parts = [];
  if (amount) parts.push(amount >= 0 ? `+${amount} ${currency}` : `-${Math.abs(amount)} ${currency}`);
  if (skip) parts.push(`${skip} kör kimaradás`);
  if (move) parts.push(`${move >= 0 ? '+' : '-'}${Math.abs(move)} mező`);
  if (giftedItem) parts.push(`Ajándék: ${giftedItem.name}`);

  out.cardOverlay = {
    title: card.title || 'Szerencsekártya',
    text: card.body || 'Húztál egy lapot.',
    banner: parts.join(' • ') || 'Kártya húzva',
    icon: '💌',
    colorKey: 'pink',
  };

  out.summaryParts.push(`Kártya: ${card.title}. ${card.body || ''}`.trim());
  if (giftedItem) out.summaryParts.push(`Kártyából megkapta: ${giftedItem.name}.`);
  if (amount) out.bannerParts.push(amount >= 0 ? `+${amount} ${currency}` : `-${Math.abs(amount)} ${currency}`);
  if (skip) out.bannerParts.push(`${skip} kör kimaradás`);
  if (move) out.bannerParts.push(`${move >= 0 ? '+' : '-'}${Math.abs(move)} mező`);
}

function summarizeTileForOverlay(tile, index, banner) {
  if (!tile) return null;
  return {
    index,
    title: tile.name || tile.short_name || `Mező ${index}`,
    text: tile.description || tile.kind || 'Mező',
    banner: banner || tile.description || 'Mezőhatás',
    icon: tile.icon || defaultTileIcon(tile.kind),
    colorKey: tile.color_key || tile.kind || 'neutral',
  };
}

async function advanceTurn() {
  const nextIndex = (Number(state.room.turn_index || 0) + 1) % Math.max(state.players.length, 1);
  const nextTurnNo = nextIndex === 0 ? Number(state.room.turn_no || 1) + 1 : Number(state.room.turn_no || 1);
  const update = await supabase.from('rooms').update({ turn_index: nextIndex, turn_no: nextTurnNo }).eq('id', state.room.id);
  if (update.error) throw update.error;
}

async function addLog(roomId, entry, payload = {}) {
  const res = await supabase.from('room_logs').insert({ room_id: roomId, entry, payload }).select('*').single();
  if (res.error) {
    console.error(res.error);
    return null;
  }
  return res.data;
}

function processIncomingLogs(rows, options = {}) {
  if (!rows.length) return;
  if (options.skipReplay) {
    state.lastSeenLogId = maxLogId(rows);
    return;
  }

  const fresh = rows.filter((row) => Number(row.id || 0) > Number(state.lastSeenLogId || 0));
  if (!fresh.length) return;
  state.lastSeenLogId = Number(fresh[fresh.length - 1].id || state.lastSeenLogId || 0);
  for (const row of fresh) queueEventFromLog(row);
}

function queueEventFromLog(row) {
  if (!row?.payload || typeof row.payload !== 'object') return;
  const type = row.payload.type;
  if (!type) return;
  if (state.processedEventIds.has(row.id)) return;
  state.processedEventIds.add(row.id);
  state.animationQueue.push(row);
  if (!state.isAnimating) runEventQueue().catch(console.error);
}

async function runEventQueue() {
  if (state.isAnimating) return;
  state.isAnimating = true;
  try {
    while (state.animationQueue.length) {
      const row = state.animationQueue.shift();
      await playEvent(row);
    }
  } finally {
    state.isAnimating = false;
    state.highlightedTileIndex = null;
    syncVisualPositions();
    hideOverlay();
    renderRoom();
  }
}

async function playEvent(row) {
  const payload = row.payload || {};
  const now = Date.now();
  const wait = Math.max(0, Number(payload.startAt || 0) - now);
  if (wait) await delay(wait);

  if (payload.type === 'skip_notice') {
    await showOverlay({
      banner: payload.banner || 'Kimaradás',
      title: payload.title || 'Kör kimarad',
      text: payload.body || '',
      icon: payload.icon || '😴',
      colorKey: payload.colorKey || 'blue',
      typeLabel: 'ESEMÉNY',
    }, 2600);
    return;
  }

  if (payload.type !== 'turn_action') return;

  if (payload.roll) {
    els.diceInfo.textContent = `Utolsó dobás: ${payload.roll}`;
    await animateDiceRollShared(payload.roll, payload.actorName || 'Játékos');
  }

  if (payload.actorId && Array.isArray(payload.movePath) && payload.movePath.length) {
    await animatePawnPath(payload.actorId, payload.movePath);
  }

  if (payload.tile) {
    state.highlightedTileIndex = Number(payload.landingPosition);
    renderBoard();
    await showOverlay({
      banner: payload.banner || payload.tile.banner || 'Mezőhatás',
      title: payload.tile.title,
      text: payload.tile.text,
      icon: payload.tile.icon || '✨',
      colorKey: payload.tile.colorKey || 'neutral',
      typeLabel: 'MEZŐ',
    }, 3500);
    state.highlightedTileIndex = null;
    renderBoard();
  }

  if (payload.actorId && Array.isArray(payload.followupPath) && payload.followupPath.length) {
    await animatePawnPath(payload.actorId, payload.followupPath);
  }

  if (payload.card) {
    await showOverlay({
      banner: payload.card.banner || 'Szerencsekártya',
      title: payload.card.title,
      text: payload.card.text,
      icon: payload.card.icon || '💌',
      colorKey: payload.card.colorKey || 'pink',
      typeLabel: 'SZERENCSEKÁRTYA',
    }, 3500);
  }

  if (payload.winnerName) {
    await showOverlay({
      banner: `${payload.winnerName} nyert`,
      title: 'Vége a játéknak',
      text: `${payload.winnerName} teljesítette a győzelmi feltételt.`,
      icon: '🏆',
      colorKey: 'gold',
      typeLabel: 'GYŐZELEM',
    }, 2800);
  }
}

async function animatePawnPath(playerId, path) {
  if (!playerId || !Array.isArray(path) || !path.length) return;
  for (const pos of path) {
    state.visualPositions[playerId] = wrapPosition(Number(pos || 0), state.boardTiles.length || 1);
    renderBoard();
    await delay(280);
  }
}

async function showOverlay(data, duration = 3500) {
  els.eventBanner.textContent = data.banner || 'Esemény';
  els.eventType.textContent = data.typeLabel || 'ESEMÉNY';
  els.eventTitle.textContent = data.title || 'Esemény';
  els.eventText.textContent = data.text || '';
  els.eventIcon.textContent = data.icon || '✨';
  els.eventCard.className = `event-card tile-${sanitizeCssClass(data.colorKey || 'neutral')}`;
  els.eventOverlay.classList.remove('hidden');
  els.eventOverlay.classList.add('showing');
  await delay(duration);
  hideOverlay();
}

function hideOverlay() {
  els.eventOverlay.classList.add('hidden');
  els.eventOverlay.classList.remove('showing');
}

async function animateDiceRollShared(finalValue, actorName) {
  els.diceFace.classList.add('rolling');
  for (let i = 0; i < 12; i += 1) {
    const value = i === 11 ? finalValue : (Math.floor(Math.random() * 6) + 1);
    renderDice(value);
    els.diceLabel.textContent = `${actorName} dob...`;
    await delay(70 + i * 7);
  }
  els.diceFace.classList.remove('rolling');
  renderDice(finalValue);
  els.diceLabel.textContent = `Dobás: ${finalValue}`;
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
  stopRefreshLoop();
  unsubscribeRoom();
  renderEmptyState();
}

function renderEmptyState() {
  state.room = null;
  state.players = [];
  state.logs = [];
  state.visualPositions = {};
  state.highlightedTileIndex = null;
  state.animationQueue = [];
  state.isAnimating = false;
  state.lastSeenLogId = null;
  els.roomLobbyPanel.classList.add('hidden');
  els.roomCodeTitle.textContent = '---';
  els.gameRoomTitle.textContent = 'Szoba: ---';
  els.lobbyPlayers.innerHTML = '';
  els.gamePlayers.innerHTML = '';
  els.lobbyMeta.innerHTML = '';
  els.logList.innerHTML = '';
  els.turnInfo.textContent = 'Kör információk...';
  els.diceInfo.textContent = '-';
  els.diceLabel.textContent = 'Készen áll';
  setAction('Hozz létre vagy lépj be egy szobába.');
  renderDice(1);
  renderBoard();
  hideOverlay();
  showScreen('lobby');
}

function setStatus(message) {
  els.connectionStatus.textContent = message;
}

function setAction(message) {
  els.actionInfo.textContent = message;
}

function showLoadError(message) {
  els.loadErrorBox.textContent = message;
  els.loadErrorBox.classList.remove('hidden');
}

function hideLoadError() {
  els.loadErrorBox.textContent = '';
  els.loadErrorBox.classList.add('hidden');
}

function getBoardSize(tileCount) {
  return Math.max(6, Math.ceil(tileCount / 4) + 1);
}

function buildPathCells(size) {
  const cells = [];
  for (let col = size; col >= 1; col -= 1) cells.push({ row: size, col });
  for (let row = size - 1; row >= 1; row -= 1) cells.push({ row, col: 1 });
  for (let col = 2; col <= size; col += 1) cells.push({ row: 1, col });
  for (let row = 2; row <= size - 1; row += 1) cells.push({ row, col: size });
  return cells;
}

function defaultTileIcon(kind) {
  switch (kind) {
    case 'start': return '💋';
    case 'money': return '💸';
    case 'card': return '💌';
    case 'shop': return '🛍️';
    case 'skip': return '😵';
    case 'move': return '↔️';
    default: return '✨';
  }
}

function shortName(value, max) {
  const text = String(value || '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function sanitizeCssClass(value) {
  return String(value || 'neutral').toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
}

function wrapPosition(position, tileCount) {
  const size = Math.max(Number(tileCount || 0), 1);
  return ((position % size) + size) % size;
}

function buildLinearPath(from, to, tileCount, direction) {
  const path = [];
  if (!direction) return path;
  const step = direction > 0 ? 1 : -1;
  let current = from;
  for (let i = 0; i < Math.abs(direction); i += 1) {
    current = wrapPosition(current + step, tileCount);
    path.push(current);
  }
  if (!path.length && from !== to) path.push(to);
  return path;
}

function getItemById(id) {
  return state.items.find((item) => Number(item.id) === Number(id)) || null;
}

function normalizeInventory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    if (typeof item === 'string') return { name: item, icon: '🎁', required: false };
    return {
      id: item.id ?? null,
      name: item.name ?? 'Tárgy',
      icon: item.icon ?? '🎁',
      category: item.category ?? '',
      required: item.required !== false,
    };
  });
}

function hasItem(inventory, item) {
  if (!item) return false;
  return normalizeInventory(inventory).some((entry) => {
    if (entry.id != null && item.id != null) return Number(entry.id) === Number(item.id);
    return String(entry.name || '').toLowerCase() === String(item.name || '').toLowerCase();
  });
}

function maybeAddInventoryItem(inventory, item) {
  const current = normalizeInventory(inventory);
  if (!item) return current;
  if (hasItem(current, item)) return current;
  current.push({
    id: item.id ?? null,
    name: item.name ?? 'Tárgy',
    icon: item.icon ?? '🎁',
    category: item.category ?? '',
    required: item.required !== false,
  });
  return current;
}

function randomCard(group) {
  const list = state.cards.filter((card) => String(card.card_group || 'chance') === String(group));
  if (!list.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}

function checkWin(result) {
  const needMoney = Number(state.config.win_money || 0);
  const needItems = Number(state.config.required_items || 0);
  const inventory = normalizeInventory(result.inventory);
  const requiredCount = inventory.filter((item) => item.required !== false).length;
  return Number(result.money || 0) >= needMoney || requiredCount >= needItems;
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

function maxLogId(rows) {
  return rows.reduce((max, row) => Math.max(max, Number(row.id || 0)), 0);
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

function readableError(error) {
  if (!error) return 'Ismeretlen hiba.';
  if (typeof error === 'string') return error;
  return error.message || error.details || JSON.stringify(error);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderDice(value) {
  state.diceValue = Math.max(1, Math.min(6, Number(value || 1)));
  const active = diceMap[state.diceValue] || [];
  els.diceFace.innerHTML = Array.from({ length: 9 }, (_, index) => `<span class="dice-pip ${active.includes(index) ? 'on' : ''}"></span>`).join('');
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const diceMap = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};
