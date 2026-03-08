
import { SUPABASE_URL, SUPABASE_ANON_KEY, DEMO_MODE } from './config.js';

const supabase = !DEMO_MODE && window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

const MIN_BOARD_TILES = 34;
const POLL_MS_PLAYING = 500;
const POLL_MS_LOBBY = 1800;
const BOARD_COLS = 12;
const BOARD_ROWS = 7;

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
  board: document.getElementById('board'),
  logList: document.getElementById('logList'),
  eventOverlay: document.getElementById('eventOverlay'),
  eventBanner: document.getElementById('eventBanner'),
  eventCard: document.getElementById('eventCard'),
  eventIcon: document.getElementById('eventIcon'),
  eventType: document.getElementById('eventType'),
  eventTitle: document.getElementById('eventTitle'),
  eventText: document.getElementById('eventText'),
  deckArea: document.getElementById('deckArea'),
  drawCardBtn: document.getElementById('drawCardBtn'),
  decisionArea: document.getElementById('decisionArea'),
  decisionTitle: document.getElementById('decisionTitle'),
  decisionText: document.getElementById('decisionText'),
  buyItemBtn: document.getElementById('buyItemBtn'),
  skipItemBtn: document.getElementById('skipItemBtn'),
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
  lastSeenLogId: null,
  processedEventIds: new Set(),
  animationQueue: [],
  isAnimating: false,
  phaseBusy: false,
  currentOverlayTimeout: null,
  phaseTokenHandled: null,
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
    setStatus('Kapcsolódva');
    disableMainButtons(false);
  } catch (error) {
    console.error(error);
    setStatus('Betöltési hiba');
    showLoadError(`Nem sikerült beolvasni az alap adatokat. ${readableError(error)}`);
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
  els.leaveRoomBtn?.addEventListener('click', leaveRoom);
  els.leaveGameBtn?.addEventListener('click', leaveRoom);
  els.backToLobbyBtn?.addEventListener('click', () => showScreen('lobby'));
  els.diceFace?.addEventListener('click', rollDice);
  els.drawCardBtn?.addEventListener('click', drawPendingCard);
  els.buyItemBtn?.addEventListener('click', () => resolvePurchase(true));
  els.skipItemBtn?.addEventListener('click', () => resolvePurchase(false));
}

function disableMainButtons(disabled) {
  els.createRoomBtn.disabled = disabled;
  els.joinRoomBtn.disabled = disabled;
  els.startGameBtn.disabled = disabled;
  els.diceFace.classList.toggle('disabled', disabled);
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

function fallbackConfig() {
  return {
    game_title: 'Gazdálkodj Pajkosan',
    game_subtitle: 'Vicces, egyszerű társas paródia multiplayerben.',
    currency_name: 'Ft',
    starting_money: 3000,
    start_bonus: 400,
    win_money: 10000,
    required_items: 4,
    center_text: 'Szedd össze a szükséges tárgyakat vagy gyűjts pénzt.',
    lobby_note: 'Az egész poén, könnyed társasos hangulattal.',
    event_overlay_ms: 3500,
    card_overlay_ms: 3500,
  };
}

function applyThemeTexts() {
  els.titleMain.textContent = String(state.config.game_title || 'Gazdálkodj Pajkosan');
  els.subtitleMain.textContent = String(state.config.game_subtitle || 'Vicces társas paródia multiplayerben.');
}

function fallbackItems() {
  return [
    { id: 1, sort_order: 0, name: 'Szatén párna', category: 'szoba', price: 450, icon: '🛏️', required: true, blurb: 'A hangulat alapja.', image_url: '', accent_color: '#f7e7b1', text_color: '', effect: {} },
    { id: 2, sort_order: 1, name: 'Parfüm', category: 'stílus', price: 650, icon: '🧴', required: true, blurb: 'Ettől minden kacérabb.', image_url: '', accent_color: '#ffd8e8', text_color: '', effect: {} },
    { id: 3, sort_order: 2, name: 'Pezsgő', category: 'ital', price: 900, icon: '🍾', required: true, blurb: 'Koccintós kellék.', image_url: '', accent_color: '#f7e7b1', text_color: '', effect: {} },
    { id: 4, sort_order: 3, name: 'Rózsaszirmok', category: 'romantika', price: 550, icon: '🌹', required: true, blurb: 'Látványos bónusz.', image_url: '', accent_color: '#ffd8e8', text_color: '', effect: {} },
    { id: 5, sort_order: 4, name: 'Hangulatfény', category: 'hangulat', price: 780, icon: '🕯️', required: false, blurb: 'Nem kötelező, de stílusos.', image_url: '', accent_color: '#eadfff', text_color: '', effect: {} },
    { id: 6, sort_order: 5, name: 'Lepedőszett', category: 'szoba', price: 800, icon: '🧺', required: false, blurb: 'Jó ha van kéznél.', image_url: '', accent_color: '#e5f0ff', text_color: '', effect: {} },
  ];
}

function fallbackTiles() {
  return [
    { sort_order: 0, name: 'Start', short_name: 'Start', kind: 'start', amount: 0, price: 0, card_group: null, icon: '💋', color_key: 'gold', description: 'Indul a játék.', item_id: null, skip_turns: 0, move_steps: 0, image_url: '', accent_color: '', text_color: '', effect: {} },
    { sort_order: 1, name: 'Flörtös fizetés', short_name: 'Fizu', kind: 'money', amount: 600, price: 0, card_group: null, icon: '💸', color_key: 'pink', description: 'Kapsz egy kis zsebpénzt.', item_id: null, skip_turns: 0, move_steps: 0, image_url: '', accent_color: '', text_color: '', effect: {} },
    { sort_order: 2, name: 'Pikáns kártya', short_name: 'Kártya', kind: 'card', amount: 0, price: 0, card_group: 'chance', icon: '💌', color_key: 'pink', description: 'Húzz egy lapot.', item_id: null, skip_turns: 0, move_steps: 0, image_url: '', accent_color: '', text_color: '', effect: {} },
    { sort_order: 3, name: 'Szatén bolt', short_name: 'Bolt', kind: 'shop', amount: 0, price: 450, card_group: null, icon: '🛏️', color_key: 'gold', description: 'Szatén párna vásárlás.', item_id: 1, skip_turns: 0, move_steps: 0, image_url: '', accent_color: '', text_color: '', effect: {} },
    { sort_order: 4, name: 'Kínos lebukás', short_name: 'Bünti', kind: 'money', amount: -350, price: 0, card_group: null, icon: '🙈', color_key: 'danger', description: 'Váratlan kiadás.', item_id: null, skip_turns: 0, move_steps: 0, image_url: '', accent_color: '', text_color: '', effect: {} },
    { sort_order: 5, name: 'Lazuló sarok', short_name: 'Pihi', kind: 'neutral', amount: 0, price: 0, card_group: null, icon: '😌', color_key: 'violet', description: 'Semmi extra.', item_id: null, skip_turns: 0, move_steps: 0, image_url: '', accent_color: '', text_color: '', effect: {} },
    { sort_order: 6, name: 'Félreértés', short_name: 'Skip', kind: 'skip', amount: 1, price: 0, card_group: null, icon: '😵', color_key: 'danger', description: '1 kör kimaradás.', item_id: null, skip_turns: 1, move_steps: 0, image_url: '', accent_color: '', text_color: '', effect: {} },
    { sort_order: 7, name: 'Parfüm pult', short_name: 'Bolt', kind: 'shop', amount: 0, price: 650, card_group: null, icon: '🧴', color_key: 'gold', description: 'Parfüm vásárlás.', item_id: 2, skip_turns: 0, move_steps: 0, image_url: '', accent_color: '', text_color: '', effect: {} },
    { sort_order: 8, name: 'Rajongói borravaló', short_name: 'Bónusz', kind: 'money', amount: 800, price: 0, card_group: null, icon: '💰', color_key: 'green', description: 'Extra pénz.', item_id: null, skip_turns: 0, move_steps: 0, image_url: '', accent_color: '', text_color: '', effect: {} },
    { sort_order: 9, name: 'Gyors randistart', short_name: '+2', kind: 'move', amount: 2, price: 0, card_group: null, icon: '🏃', color_key: 'violet', description: 'Lépj előre kettőt.', item_id: null, skip_turns: 0, move_steps: 2, image_url: '', accent_color: '', text_color: '', effect: {} },
    { sort_order: 10, name: 'Pezsgő sarok', short_name: 'Bolt', kind: 'shop', amount: 0, price: 900, card_group: null, icon: '🍾', color_key: 'gold', description: 'Pezsgő vásárlás.', item_id: 3, skip_turns: 0, move_steps: 0, image_url: '', accent_color: '', text_color: '', effect: {} },
    { sort_order: 11, name: 'Pikáns kártya', short_name: 'Kártya', kind: 'card', amount: 0, price: 0, card_group: 'chance', icon: '💌', color_key: 'pink', description: 'Újabb lap.', item_id: null, skip_turns: 0, move_steps: 0, image_url: '', accent_color: '', text_color: '', effect: {} },
    { sort_order: 12, name: 'Adó és dráma', short_name: 'Adó', kind: 'money', amount: -700, price: 0, card_group: null, icon: '🧾', color_key: 'danger', description: 'Fizesd ki.', item_id: null, skip_turns: 0, move_steps: 0, image_url: '', accent_color: '', text_color: '', effect: {} },
    { sort_order: 13, name: 'Rózsás bolt', short_name: 'Bolt', kind: 'shop', amount: 0, price: 550, card_group: null, icon: '🌹', color_key: 'gold', description: 'Rózsaszirmok vásárlás.', item_id: 4, skip_turns: 0, move_steps: 0, image_url: '', accent_color: '', text_color: '', effect: {} },
    { sort_order: 14, name: 'Vakmerő siker', short_name: 'Jutalom', kind: 'money', amount: 1200, price: 0, card_group: null, icon: '🔥', color_key: 'pink', description: 'Szép kör volt.', item_id: null, skip_turns: 0, move_steps: 0, image_url: '', accent_color: '', text_color: '', effect: {} },
    { sort_order: 15, name: 'Vissza a valóságba', short_name: '-2', kind: 'move', amount: -2, price: 0, card_group: null, icon: '↩️', color_key: 'violet', description: 'Lépj vissza kettőt.', item_id: null, skip_turns: 0, move_steps: -2, image_url: '', accent_color: '', text_color: '', effect: {} },
    { sort_order: 16, name: 'Pikáns kártya', short_name: 'Kártya', kind: 'card', amount: 0, price: 0, card_group: 'chance', icon: '💌', color_key: 'pink', description: 'Húzz még.', item_id: null, skip_turns: 0, move_steps: 0, image_url: '', accent_color: '', text_color: '', effect: {} },
    { sort_order: 17, name: 'Lepedő bolt', short_name: 'Bolt', kind: 'shop', amount: 0, price: 800, card_group: null, icon: '🧺', color_key: 'gold', description: 'Lepedőszett vásárlás.', item_id: 6, skip_turns: 0, move_steps: 0, image_url: '', accent_color: '', text_color: '', effect: {} },
    { sort_order: 18, name: 'Show végén kassza', short_name: 'Kassza', kind: 'money', amount: 1000, price: 0, card_group: null, icon: '🎉', color_key: 'green', description: 'Újabb pénz.', item_id: null, skip_turns: 0, move_steps: 0, image_url: '', accent_color: '', text_color: '', effect: {} },
  ];
}

function fallbackCards() {
  return [
    { id: 1, card_group: 'chance', title: 'Pezsgős koccintás', body: 'Kapsz egy kis plusz pénzt.', amount: 700, skip_turns: 0, move_steps: 0, item_id: null, icon: '🍾', image_url: '', accent_color: '', text_color: '', effect: {} },
    { id: 2, card_group: 'chance', title: 'Kínos üzenet', body: 'Befizetsz egy váratlan büntit.', amount: -500, skip_turns: 0, move_steps: 0, item_id: null, icon: '📵', image_url: '', accent_color: '', text_color: '', effect: {} },
    { id: 3, card_group: 'chance', title: 'Sikeres nyitás', body: 'Lépj előre 3 mezőt.', amount: 0, skip_turns: 0, move_steps: 3, item_id: null, icon: '💃', image_url: '', accent_color: '', text_color: '', effect: {} },
    { id: 4, card_group: 'chance', title: 'Megfázott romantika', body: '1 kör kimaradás.', amount: 0, skip_turns: 1, move_steps: 0, item_id: null, icon: '🥶', image_url: '', accent_color: '', text_color: '', effect: {} },
    { id: 5, card_group: 'chance', title: 'Ajándék rózsa', body: 'Kaptál egy tárgyat.', amount: 0, skip_turns: 0, move_steps: 0, item_id: 4, icon: '🌹', image_url: '', accent_color: '', text_color: '', effect: {} },
  ];
}

function readConfig(rows) {
  const merged = fallbackConfig();
  for (const row of rows) {
    if (!row?.key) continue;
    merged[row.key] = valueFromConfig(row.value);
  }
  return merged;
}

function buildPlayableTiles() {
  const base = [...(state.tiles || [])].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
  if (base.length >= MIN_BOARD_TILES) return base;
  const templates = [...fallbackTiles(), ...expandedTemplateTiles()];
  const out = [...base];
  for (let i = out.length; i < MIN_BOARD_TILES; i += 1) {
    const tpl = templates[i % templates.length] || fallbackTiles()[i % fallbackTiles().length];
    out.push({ ...tpl, sort_order: i, _generated: true, id: tpl.id || `gen-${i}` });
  }
  return out;
}

function expandedTemplateTiles() {
  return [
    { sort_order: 19, name: 'Kacér kassza', short_name: 'Kassza', kind: 'money', amount: 500, price: 0, card_group: null, icon: '💸', color_key: 'pink', description: 'Apró plusz pénz.', item_id: null, skip_turns: 0, move_steps: 0, effect: {} },
    { sort_order: 20, name: 'Pletykasarok', short_name: 'Pletyka', kind: 'skip', amount: 1, price: 0, card_group: null, icon: '🫢', color_key: 'danger', description: 'Pletyka miatt kimaradsz.', item_id: null, skip_turns: 1, move_steps: 0, effect: {} },
    { sort_order: 21, name: 'Randi ügynök', short_name: '+2', kind: 'move', amount: 2, price: 0, card_group: null, icon: '💃', color_key: 'violet', description: 'Lépj előre kettőt.', item_id: null, skip_turns: 0, move_steps: 2, effect: {} },
    { sort_order: 22, name: 'Pikáns kártya', short_name: 'Kártya', kind: 'card', amount: 0, price: 0, card_group: 'chance', icon: '💌', color_key: 'pink', description: 'Húzz lapot.', item_id: null, skip_turns: 0, move_steps: 0, effect: {} },
    { sort_order: 23, name: 'Hangulatfény bolt', short_name: 'Bolt', kind: 'shop', amount: 0, price: 780, card_group: null, icon: '🕯️', color_key: 'gold', description: 'Hangulatfény vásárlás.', item_id: 5, skip_turns: 0, move_steps: 0, effect: {} },
    { sort_order: 24, name: 'Kínos számla', short_name: 'Számla', kind: 'money', amount: -450, price: 0, card_group: null, icon: '🧾', color_key: 'danger', description: 'Fizesd ki.', item_id: null, skip_turns: 0, move_steps: 0, effect: {} },
    { sort_order: 25, name: 'Pikáns kártya', short_name: 'Kártya', kind: 'card', amount: 0, price: 0, card_group: 'chance', icon: '💌', color_key: 'pink', description: 'Még egy húzás.', item_id: null, skip_turns: 0, move_steps: 0, effect: {} },
    { sort_order: 26, name: 'Duett bónusz', short_name: 'Bónusz', kind: 'money', amount: 950, price: 0, card_group: null, icon: '🎶', color_key: 'green', description: 'Kapsz egy bónuszt.', item_id: null, skip_turns: 0, move_steps: 0, effect: {} },
    { sort_order: 27, name: 'Túl sok üzenet', short_name: 'Skip', kind: 'skip', amount: 1, price: 0, card_group: null, icon: '📵', color_key: 'danger', description: '1 kör kimaradás.', item_id: null, skip_turns: 1, move_steps: 0, effect: {} },
    { sort_order: 28, name: 'Visszafordító csók', short_name: '-2', kind: 'move', amount: -2, price: 0, card_group: null, icon: '↩️', color_key: 'violet', description: 'Lépj vissza kettőt.', item_id: null, skip_turns: 0, move_steps: -2, effect: {} },
    { sort_order: 29, name: 'Titkos boríték', short_name: 'Kártya', kind: 'card', amount: 0, price: 0, card_group: 'chance', icon: '💌', color_key: 'pink', description: 'Újabb kártya.', item_id: null, skip_turns: 0, move_steps: 0, effect: {} },
    { sort_order: 30, name: 'Éjféli kassza', short_name: 'Kassza', kind: 'money', amount: 1100, price: 0, card_group: null, icon: '🌙', color_key: 'gold', description: 'Szép kis plusz.', item_id: null, skip_turns: 0, move_steps: 0, effect: {} },
    { sort_order: 31, name: 'Kártyalapok', short_name: 'Kártya', kind: 'card', amount: 0, price: 0, card_group: 'chance', icon: '💌', color_key: 'pink', description: 'Húzz lapot.', item_id: null, skip_turns: 0, move_steps: 0, effect: {} },
    { sort_order: 32, name: 'Bójli büfé', short_name: 'Bolt', kind: 'shop', amount: 0, price: 730, card_group: null, icon: '🍓', color_key: 'gold', description: 'Vicces kellék bolt.', item_id: null, skip_turns: 0, move_steps: 0, effect: { item_name: 'Vicces kellék', item_icon: '🍓' } },
    { sort_order: 33, name: 'Nagy finálé', short_name: 'Finálé', kind: 'money', amount: 1300, price: 0, card_group: null, icon: '🎊', color_key: 'green', description: 'Nagy záró pénz.', item_id: null, skip_turns: 0, move_steps: 0, effect: {} },
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
  renderRoom();
  try {
    let roomCode = randomRoomCode();
    for (let i = 0; i < 5; i += 1) {
      const exists = await supabase.from('rooms').select('id').eq('code', roomCode).maybeSingle();
      if (!exists.data) break;
      roomCode = randomRoomCode();
    }

    const roomInsert = await supabase
      .from('rooms')
      .insert({ code: roomCode, status: 'lobby', turn_index: 0, turn_no: 1, last_roll: null, phase: 'roll', pending_payload: {} })
      .select('*')
      .single();
    if (roomInsert.error) throw roomInsert.error;

    const playerInsert = await supabase
      .from('room_players')
      .insert({
        room_id: roomInsert.data.id,
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

    const hostUpdate = await supabase.from('rooms').update({ host_player_id: playerInsert.data.id }).eq('id', roomInsert.data.id);
    if (hostUpdate.error) throw hostUpdate.error;

    await addLog(roomInsert.data.id, `${playerName} létrehozta a szobát.`);
    saveSession({ roomCode, playerId: playerInsert.data.id, playerName });
    await refreshRoom({ firstSync: true });
    setStatus('Szoba létrehozva');
  } catch (error) {
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
  renderRoom();
  try {
    const roomRes = await supabase.from('rooms').select('*').eq('code', roomCode).maybeSingle();
    if (roomRes.error) throw roomRes.error;
    if (!roomRes.data) throw new Error('Nincs ilyen szoba.');

    const playersRes = await supabase.from('room_players').select('*').eq('room_id', roomRes.data.id).order('seat_no');
    if (playersRes.error) throw playersRes.error;
    if ((playersRes.data || []).some((p) => String(p.name || '').toLowerCase() === playerName.toLowerCase())) {
      throw new Error('Ez a név már foglalt ebben a szobában.');
    }

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
    setAction(readableError(roomRes.error));
    return;
  }
  if (!roomRes.data) {
    clearSession();
    renderEmptyState();
    return;
  }

  const prevRoomId = state.room?.id || null;
  const oldLastSeen = state.lastSeenLogId;
  state.room = roomRes.data;

  const [playersRes, logsRes] = await Promise.all([
    supabase.from('room_players').select('*').eq('room_id', state.room.id).order('seat_no', { ascending: true }),
    supabase.from('room_logs').select('*').eq('room_id', state.room.id).order('id', { ascending: true }).limit(120),
  ]);
  if (playersRes.error) console.error(playersRes.error);
  if (logsRes.error) console.error(logsRes.error);

  state.players = playersRes.data || [];
  state.logs = logsRes.data || [];
  state.boardTiles = buildPlayableTiles();

  if (prevRoomId !== state.room.id) {
    state.visualPositions = {};
    state.highlightedTileIndex = null;
    state.processedEventIds = new Set();
    state.phaseTokenHandled = null;
    state.lastSeenLogId = options.firstSync ? maxLogId(state.logs) : oldLastSeen;
    subscribeRoom();
  }

  syncVisualPositions(getFrozenVisuals(oldLastSeen, options.firstSync));
  renderRoom();
  processIncomingLogs(state.logs, { skipReplay: options.firstSync === true && prevRoomId !== state.room.id });
  maybeHandlePhase().catch(console.error);
  ensureRefreshLoop();
}

function ensureRefreshLoop() {
  stopRefreshLoop();
  state.refreshTimer = setInterval(() => refreshRoom().catch(console.error), state.room?.status === 'playing' ? POLL_MS_PLAYING : POLL_MS_LOBBY);
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
  try { supabase.removeChannel(state.channel); } catch (error) { console.error(error); }
  state.channel = null;
}

function debouncedRefresh() {
  clearTimeout(state.refreshDebounce);
  state.refreshDebounce = setTimeout(() => refreshRoom().catch(console.error), 45);
}

function getFrozenVisuals(oldLastSeen, firstSync) {
  if (firstSync) return new Map();
  const fresh = state.logs.filter((row) => Number(row.id || 0) > Number(oldLastSeen || 0));
  const out = new Map();
  for (const row of fresh) {
    const payload = parseObject(row.payload);
    if (payload.actorId && payload.type === 'turn_action' && payload.fromPosition != null) {
      out.set(payload.actorId, wrapPosition(Number(payload.fromPosition), state.boardTiles.length || 1));
    }
    if (payload.actorId && payload.type === 'card_draw' && payload.fromPosition != null) {
      out.set(payload.actorId, wrapPosition(Number(payload.fromPosition), state.boardTiles.length || 1));
    }
  }
  return out;
}

function syncVisualPositions(frozen = new Map()) {
  if (state.isAnimating) return;
  const next = {};
  for (const player of state.players) {
    if (frozen.has(player.id)) next[player.id] = frozen.get(player.id);
    else next[player.id] = wrapPosition(Number(player.position || 0), state.boardTiles.length || 1);
  }
  state.visualPositions = next;
}

function getMe() {
  return state.players.find((player) => player.id === state.session?.playerId) || null;
}

function getActivePlayer() {
  if (!state.room || !state.players.length) return null;
  return state.players[Number(state.room.turn_index || 0) % state.players.length] || null;
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
  const active = getActivePlayer();
  const yourTurn = active?.id === me?.id;
  const canRoll = state.room.status === 'playing' && state.room.phase === 'roll' && yourTurn && !state.isBusy && !state.isAnimating;
  const currency = getCurrencyLabel();

  els.roomLobbyPanel.classList.remove('hidden');
  els.roomCodeTitle.textContent = state.room.code;
  els.gameRoomTitle.textContent = `Szoba: ${state.room.code}`;
  els.roomCodeInput.value = state.room.code;

  const playersHtml = state.players.map((player, idx) => playerCardHtml(player, active?.id === player.id, idx)).join('');
  els.lobbyPlayers.innerHTML = playersHtml || '<div class="meta-box">Még nincs játékos.</div>';
  els.gamePlayers.innerHTML = playersHtml || '<div class="meta-box">Még nincs játékos.</div>';

  els.lobbyMeta.innerHTML = `
    <div class="notice">Állapot: <strong class="mono">${escapeHtml(state.room.status)}</strong></div>
    <div class="notice top-gap">Fázis: <strong class="mono">${escapeHtml(state.room.phase || 'roll')}</strong></div>
    <div class="notice top-gap">Játékosok: <strong class="mono">${state.players.length}</strong></div>
    <div class="notice top-gap">Kör: <strong class="mono">${Number(state.room.turn_no || 1)}</strong></div>
    <div class="notice top-gap">Megjegyzés: ${escapeHtml(String(state.config.lobby_note || ''))}</div>
  `;

  els.startGameBtn.disabled = !(me?.is_host && state.room.status === 'lobby' && state.players.length >= 2);
  els.diceFace.classList.toggle('clickable', canRoll);
  els.diceFace.classList.toggle('disabled', !canRoll);
  els.diceLabel.textContent = canRoll ? 'Kattints a kockára!' : phaseHint(active, me);
  els.diceInfo.textContent = state.room.last_roll ? `Utolsó dobás: ${state.room.last_roll}` : '-';
  els.turnInfo.textContent = state.room.status === 'playing'
    ? `Aktív játékos: ${active?.name || '-'} | Kör: ${Number(state.room.turn_no || 1)}`
    : state.room.status === 'finished'
      ? 'A játék véget ért.'
      : 'A játék még nem indult el.';

  renderDecisionPanels();
  renderLogs();
  renderBoard();
  setAction(getLatestActionText(currency));

  if (state.room.status === 'playing' || state.room.status === 'finished') showScreen('game');
  else showScreen('lobby');
}

function phaseHint(active, me) {
  if (state.room?.status !== 'playing') return 'Készen áll';
  if (!active) return 'Várakozás';
  if (state.room.phase === 'awaiting_card_draw') return active.id === me?.id ? 'Húzz egy kártyát a pakliból!' : `${active.name} kártyát húz...`;
  if (state.room.phase === 'awaiting_purchase') return active.id === me?.id ? 'Döntsd el, megveszed-e!' : `${active.name} vásárlásról dönt...`;
  if (state.room.phase !== 'roll') return 'Fut az animáció...';
  return active.id === me?.id ? 'Kattints a kockára!' : `${active.name} dobására várunk...`;
}

function getLatestActionText(currency) {
  const latest = [...state.logs].reverse().find((row) => row.entry)?.entry;
  return latest || `Győzelem: ${Number(state.config.required_items || 0)} kötelező tárgy vagy ${Number(state.config.win_money || 0)} ${currency}.`;
}

function playerCardHtml(player, isActive, colorIndex) {
  const me = player.id === state.session?.playerId;
  const inventory = normalizeInventory(player.inventory);
  const required = state.items.filter((item) => item.required !== false);
  const currency = getCurrencyLabel();
  const classes = ['player-card'];
  if (me) classes.push('me');
  if (isActive) classes.push('active-turn');

  return `
    <div class="${classes.join(' ')}">
      <div class="player-topline">
        <div class="player-name"><span class="pawn pawn-${colorIndex % 6} mini-pawn">${escapeHtml((player.name || '?').slice(0,1).toUpperCase())}</span> ${escapeHtml(player.name || 'Névtelen')}</div>
        <div class="player-sub">${player.is_host ? 'HOST' : 'JÁTÉKOS'}</div>
      </div>
      <div class="player-meta">
        <span>Pénz: ${Number(player.money || 0)} ${escapeHtml(currency)}</span>
        <span>Mező: ${Number(player.position || 0)}</span>
      </div>
      <div class="player-meta">
        <span>Kimaradás: ${Number(player.skip_turns || 0)}</span>
        <span>Kötelező kész: ${countRequiredOwned(inventory)}/${Math.max(Number(state.config.required_items || 0), required.length || 0)}</span>
      </div>
      <div class="item-progress-grid top-gap">
        ${required.map((item) => {
          const owned = hasItem(inventory, item);
          return `<span class="item-progress-chip ${owned ? 'owned' : 'missing'}">${escapeHtml(item.icon || '🎁')} ${escapeHtml(shortName(item.name || '', 11))}</span>`;
        }).join('') || '<span class="tag-chip">Nincs beállított kötelező tárgy.</span>'}
      </div>
      <div class="player-items top-gap">
        ${inventory.length ? inventory.map((item) => `<span class="item-chip ${item.required === false ? 'optional' : ''}">${escapeHtml(item.icon || '🎁')} ${escapeHtml(shortName(item.name || '', 12))}</span>`).join('') : '<span class="tag-chip">Még nincs tárgy</span>'}
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

function renderDecisionPanels() {
  const me = getMe();
  const active = getActivePlayer();
  const payload = parseObject(state.room?.pending_payload);
  const isActor = active?.id === me?.id && payload.actorId === me?.id;

  els.deckArea.classList.add('hidden');
  els.decisionArea.classList.add('hidden');

  if (state.room?.status !== 'playing') return;

  if (state.room.phase === 'awaiting_card_draw') {
    els.deckArea.classList.remove('hidden');
    els.drawCardBtn.disabled = !(isActor && !state.isBusy && !state.isAnimating);
    els.drawCardBtn.textContent = isActor ? 'Kattints a húzáshoz' : `${payload.actorName || active?.name || 'Valaki'} húz...`;
  }

  if (state.room.phase === 'awaiting_purchase') {
    els.decisionArea.classList.remove('hidden');
    els.decisionTitle.textContent = payload.itemName || 'Vásárlás';
    els.decisionText.textContent = payload.message || 'Döntsd el, megveszed-e.';
    const enabled = isActor && !state.isBusy && !state.isAnimating && !payload.locked;
    els.buyItemBtn.disabled = !enabled || !payload.canBuy;
    els.skipItemBtn.disabled = !enabled;
    if (!payload.canBuy) els.buyItemBtn.textContent = 'Nincs rá pénz';
    else els.buyItemBtn.textContent = `Megveszem (${Number(payload.price || 0)} ${getCurrencyLabel()})`;
  }
}

function renderBoard() {
  const tiles = state.boardTiles.length ? state.boardTiles : buildPlayableTiles();
  const pathCells = buildBoardPath(BOARD_COLS, BOARD_ROWS, tiles.length);
  els.board.style.setProperty('--board-cols', String(BOARD_COLS));
  els.board.style.setProperty('--board-rows', String(BOARD_ROWS));

  const boardMap = new Map();
  tiles.forEach((tile, index) => {
    const coord = pathCells[index];
    if (coord) boardMap.set(`${coord.row}-${coord.col}`, { tile, index });
  });

  const pawnsByPos = new Map();
  state.players.forEach((player, idx) => {
    const pos = state.visualPositions[player.id] ?? wrapPosition(Number(player.position || 0), tiles.length || 1);
    if (!pawnsByPos.has(pos)) pawnsByPos.set(pos, []);
    pawnsByPos.get(pos).push({ player, idx });
  });

  const cells = [];
  for (let row = 1; row <= BOARD_ROWS; row += 1) {
    for (let col = 1; col <= BOARD_COLS; col += 1) {
      const info = boardMap.get(`${row}-${col}`);
      if (!info) {
        cells.push('<div class="board-cell empty"></div>');
        continue;
      }
      const tile = info.tile;
      const pawns = pawnsByPos.get(info.index) || [];
      const image = escapeHtml(tile.image_url || '');
      const inline = tileStyleInline(tile);
      const title = tile.short_name || tile.name || `Mező ${info.index}`;
      const isHighlighted = state.highlightedTileIndex === info.index;
      cells.push(`
        <div class="board-cell path tile-${sanitizeCssClass(tile.color_key || tile.kind || 'neutral')} ${isHighlighted ? 'highlighted active-zoom' : ''}" style="${inline}" title="${escapeHtml(tile.name || '')}">
          ${image ? `<div class="tile-image" style="background-image:url('${image.replaceAll("'", '&#39;')}')"></div>` : ''}
          <div class="tile-topline">
            <div class="tile-index">#${info.index}</div>
            <div class="tile-icon">${escapeHtml(tile.icon || defaultTileIcon(tile.kind))}</div>
          </div>
          <div class="tile-title">${escapeHtml(title)}</div>
          <div class="tile-desc">${escapeHtml(tile.description || tile.kind || '')}</div>
          <div class="pawn-list">
            ${pawns.map((entry) => `<div class="pawn pawn-${entry.idx % 6}" title="${escapeHtml(entry.player.name || '')}">${escapeHtml((entry.player.name || '?').slice(0,1).toUpperCase())}</div>`).join('')}
          </div>
        </div>
      `);
    }
  }
  els.board.innerHTML = cells.join('');
}

function tileStyleInline(tile) {
  const parts = [];
  if (tile.accent_color) parts.push(`--custom-accent:${tile.accent_color}`);
  if (tile.text_color) parts.push(`--custom-text:${tile.text_color}`);
  return parts.join(';');
}

async function startGame() {
  const me = getMe();
  if (!me?.is_host || !state.room || state.room.status !== 'lobby' || state.isBusy) return;
  if (state.players.length < 2) {
    alert('Legalább 2 játékos kell a kezdéshez.');
    return;
  }
  state.isBusy = true;
  renderRoom();
  try {
    for (const player of state.players) {
      const reset = await supabase.from('room_players').update({ position: 0, money: Number(state.config.starting_money || 0), skip_turns: 0, inventory: [] }).eq('id', player.id);
      if (reset.error) throw reset.error;
    }
    const roomUpdate = await supabase.from('rooms').update({ status: 'playing', turn_index: 0, turn_no: 1, last_roll: null, phase: 'roll', pending_payload: {} }).eq('id', state.room.id);
    if (roomUpdate.error) throw roomUpdate.error;
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
  const active = getActivePlayer();
  if (!me || !active || me.id !== active.id || state.room?.status !== 'playing' || state.room?.phase !== 'roll' || state.isBusy || state.isAnimating) return;

  state.isBusy = true;
  renderRoom();
  try {
    if (Number(me.skip_turns || 0) > 0) {
      await initiateSkippedTurn(me);
      return;
    }

    const roll = Math.floor(Math.random() * 6) + 1;
    const tileCount = Math.max(state.boardTiles.length, 1);
    const fromPosition = wrapPosition(Number(me.position || 0), tileCount);
    let landingPosition = fromPosition;
    const movePath = [];
    for (let i = 0; i < roll; i += 1) {
      landingPosition = wrapPosition(landingPosition + 1, tileCount);
      movePath.push(landingPosition);
    }

    let money = Number(me.money || 0);
    let inventory = normalizeInventory(me.inventory);
    let skipTurns = Number(me.skip_turns || 0);
    const bannerParts = [];
    const summaryParts = [`${me.name} dobott: ${roll}.`];
    const bonusApplied = fromPosition + roll >= tileCount;
    if (bonusApplied) {
      const bonus = Number(state.config.start_bonus || 0);
      money += bonus;
      bannerParts.push(`Start bónusz: +${bonus} ${getCurrencyLabel()}`);
      summaryParts.push(`Áthaladt a starton és kapott ${bonus} ${getCurrencyLabel()}.`);
    }

    const tile = state.boardTiles[landingPosition];
    const resolution = resolveTile(tile, { money, inventory, skipTurns, position: landingPosition });
    money = resolution.money;
    inventory = resolution.inventory;
    skipTurns = resolution.skipTurns;

    const playerUpdate = await supabase.from('room_players').update({ position: resolution.position, money, inventory, skip_turns: skipTurns }).eq('id', me.id);
    if (playerUpdate.error) throw playerUpdate.error;

    const winner = checkWin({ money, inventory });
    const startAt = Date.now() + 900;
    const tileDuration = getTileOverlayMs();
    const autoEndAt = startAt + 1300 + (movePath.length * 260) + tileDuration + (resolution.followupPath.length * 260) + (resolution.tile ? 0 : 0);

    bannerParts.push(...resolution.bannerParts);
    summaryParts.push(...resolution.summaryParts);

    const logPayload = {
      type: 'turn_action',
      actorId: me.id,
      actorName: me.name,
      startAt,
      roll,
      fromPosition,
      movePath,
      landingPosition,
      finalPosition: resolution.position,
      followupPath: resolution.followupPath,
      banner: bannerParts.join(' • ') || `${me.name} dobott: ${roll}`,
      tile: summarizeTileForOverlay(tile, landingPosition, resolution.tileBanner),
      winnerName: winner ? me.name : '',
    };

    const phasePayload = {
      actorId: me.id,
      actorName: me.name,
      token: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      endAt: autoEndAt,
      startAt,
      landingPosition,
      finalPosition: resolution.position,
      winner,
      roll,
      summary: summaryParts.join(' '),
      tile,
      resolution,
    };

    let phase = 'resolving_auto';
    if (winner) {
      phase = 'resolving_auto';
      phasePayload.finalize = 'finish';
    } else if (resolution.pendingCard) {
      phase = 'awaiting_card_draw';
      phasePayload.cardGroup = resolution.pendingCard.cardGroup;
      phasePayload.tileTitle = tile?.name || 'Szerencsekártya';
      phasePayload.availableAt = autoEndAt;
      phasePayload.finalize = 'card_draw';
    } else if (resolution.pendingPurchase) {
      phase = 'awaiting_purchase';
      Object.assign(phasePayload, resolution.pendingPurchase, { availableAt: autoEndAt, finalize: 'purchase' });
    } else {
      phasePayload.finalize = 'advance';
    }

    const roomUpdate = await supabase.from('rooms').update({ last_roll: roll, status: winner ? 'finished' : 'playing', phase, pending_payload: phasePayload }).eq('id', state.room.id);
    if (roomUpdate.error) throw roomUpdate.error;

    const logRow = await addLog(state.room.id, summaryParts.join(' '), logPayload);
    if (winner) await addLog(state.room.id, `${me.name} megnyerte a játékot!`);
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

async function initiateSkippedTurn(me) {
  const newSkip = Math.max(0, Number(me.skip_turns || 0) - 1);
  const updatePlayer = await supabase.from('room_players').update({ skip_turns: newSkip }).eq('id', me.id);
  if (updatePlayer.error) throw updatePlayer.error;

  const startAt = Date.now() + 600;
  const payload = {
    type: 'skip_notice',
    actorId: me.id,
    actorName: me.name,
    title: 'Kör kimarad',
    body: `${me.name} most pihen egy kört.`,
    banner: `${me.name} kimarad ebből a körből.`,
    icon: '😴',
    colorKey: 'blue',
    startAt,
  };
  const phasePayload = {
    actorId: me.id,
    actorName: me.name,
    token: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    finalize: 'advance',
    startAt,
    endAt: startAt + getCardOverlayMs(),
  };

  const roomUpdate = await supabase.from('rooms').update({ phase: 'resolving_auto', pending_payload: phasePayload }).eq('id', state.room.id);
  if (roomUpdate.error) throw roomUpdate.error;
  const row = await addLog(state.room.id, `${me.name} kimarad ebből a körből.`, payload);
  if (row) queueEventFromLog(row);
  await refreshRoom();
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
    pendingCard: null,
    pendingPurchase: null,
    followupPath: [],
    tile,
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
      const from = out.position;
      out.position = wrapPosition(out.position + steps, state.boardTiles.length);
      out.followupPath = buildLinearPath(from, out.position, state.boardTiles.length, steps);
      out.tileBanner = `${steps >= 0 ? '+' : '-'}${Math.abs(steps)} mező`;
      out.bannerParts.push(out.tileBanner);
      out.summaryParts.push(`${steps >= 0 ? 'Előre' : 'Vissza'} ${Math.abs(steps)} mező.`);
      break;
    }
    case 'card': {
      const group = tile.card_group || extra.card_group || 'chance';
      out.tileBanner = 'Szerencsekártya vár';
      out.pendingCard = { cardGroup: group };
      out.summaryParts.push('Kártya húzás következik.');
      break;
    }
    case 'shop': {
      const item = tile.item_id ? getItemById(tile.item_id) : null;
      const price = Number(tile.price || item?.price || extra.price || 0);
      const itemName = item?.name || extra.item_name || tile.name || 'Tárgy';
      const itemIcon = item?.icon || extra.item_icon || tile.icon || '🎁';
      const alreadyOwn = item ? hasItem(out.inventory, item) : out.inventory.some((row) => String(row.name || '').toLowerCase() === String(itemName).toLowerCase());
      if (alreadyOwn) {
        out.tileBanner = 'Ez a tárgy már megvan';
        out.summaryParts.push('Már megvan neki ez a tárgy.');
      } else if (price > 0 && out.money >= price) {
        out.tileBanner = `Döntés: ${itemName}`;
        out.pendingPurchase = {
          itemId: item?.id ?? null,
          itemName,
          itemIcon,
          itemRequired: item?.required !== false,
          itemCategory: item?.category || '',
          itemImage: item?.image_url || '',
          price,
          canBuy: true,
          message: `${itemName} megvehető. A döntés a tied.`,
        };
        out.summaryParts.push(`Vásárlási döntés: ${itemName}.`);
      } else {
        out.tileBanner = 'Nincs elég pénz';
        out.summaryParts.push(`Nem tudja megvenni: ${itemName}.`);
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

async function drawPendingCard() {
  const me = getMe();
  const payload = parseObject(state.room?.pending_payload);
  if (!me || state.room?.phase !== 'awaiting_card_draw' || payload.actorId !== me.id || state.isBusy || state.isAnimating) return;
  const waitLeft = Number(payload.availableAt || 0) - Date.now();
  if (waitLeft > 50) return;

  state.isBusy = true;
  renderRoom();
  try {
    const card = randomCard(payload.cardGroup || 'chance');
    if (!card) throw new Error('Nincs húzható kártya ebben a pakliban.');
    let money = Number(me.money || 0);
    let inventory = normalizeInventory(me.inventory);
    let skipTurns = Number(me.skip_turns || 0);
    let position = wrapPosition(Number(me.position || 0), state.boardTiles.length || 1);
    const result = applyCard(card, { money, inventory, skipTurns, position });

    const updatePlayer = await supabase.from('room_players').update({
      money: result.money,
      inventory: result.inventory,
      skip_turns: result.skipTurns,
      position: result.position,
    }).eq('id', me.id);
    if (updatePlayer.error) throw updatePlayer.error;

    const winner = checkWin({ money: result.money, inventory: result.inventory });
    const startAt = Date.now() + 700;
    const logPayload = {
      type: 'card_draw',
      actorId: me.id,
      actorName: me.name,
      startAt,
      fromPosition: position,
      movePath: result.movePath,
      card: summarizeCardOverlay(card, result.banner, result.cardText),
      winnerName: winner ? me.name : '',
    };
    const phasePayload = {
      actorId: me.id,
      actorName: me.name,
      token: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      finalize: winner ? 'finish' : 'advance',
      startAt,
      endAt: startAt + (result.movePath.length * 260) + getCardOverlayMs(),
    };

    const roomUpdate = await supabase.from('rooms').update({ status: winner ? 'finished' : 'playing', phase: 'resolving_auto', pending_payload: phasePayload }).eq('id', state.room.id);
    if (roomUpdate.error) throw roomUpdate.error;

    const entry = `${me.name} húzott egy kártyát: ${card.title}. ${result.logText}`;
    const row = await addLog(state.room.id, entry, logPayload);
    if (winner) await addLog(state.room.id, `${me.name} megnyerte a játékot!`);
    if (row) queueEventFromLog(row);
    await refreshRoom();
  } catch (error) {
    alert(readableError(error));
  } finally {
    state.isBusy = false;
    renderRoom();
  }
}

function applyCard(card, current) {
  const effect = parseObject(card.effect);
  let money = Number(current.money || 0);
  let inventory = normalizeInventory(current.inventory);
  let skipTurns = Number(current.skipTurns || 0);
  let position = Number(current.position || 0);
  const currency = getCurrencyLabel();
  const amount = Number(card.amount || effect.amount || 0);
  const skip = Number(card.skip_turns || effect.skip_turns || 0);
  const move = Number(card.move_steps || effect.move_steps || 0);

  money += amount;
  skipTurns += skip;
  const fromPosition = position;
  if (move) position = wrapPosition(position + move, state.boardTiles.length);
  const movePath = move ? buildLinearPath(fromPosition, position, state.boardTiles.length, move) : [];

  let giftedItem = null;
  if (card.item_id) giftedItem = getItemById(card.item_id);
  else if (effect.item_name) giftedItem = { id: null, name: effect.item_name, icon: effect.item_icon || '🎁', required: false, category: '' };
  if (giftedItem) inventory = maybeAddInventoryItem(inventory, giftedItem);

  const parts = [];
  if (amount) parts.push(amount >= 0 ? `+${amount} ${currency}` : `-${Math.abs(amount)} ${currency}`);
  if (skip) parts.push(`${skip} kör kimaradás`);
  if (move) parts.push(`${move >= 0 ? '+' : '-'}${Math.abs(move)} mező`);
  if (giftedItem) parts.push(`Ajándék: ${giftedItem.name}`);

  return {
    money,
    inventory,
    skipTurns,
    position,
    movePath,
    banner: parts.join(' • ') || 'Kártya húzva',
    cardText: card.body || 'Húztál egy lapot.',
    logText: `${card.body || ''} ${parts.join(' • ')}`.trim(),
  };
}

function summarizeCardOverlay(card, banner, text) {
  return {
    title: card.title || 'Szerencsekártya',
    text,
    banner,
    icon: card.icon || '💌',
    colorKey: card.accent_color ? 'custom' : (card.color_key || 'pink'),
    imageUrl: card.image_url || '',
    accentColor: card.accent_color || '',
    textColor: card.text_color || '',
  };
}

async function resolvePurchase(buy) {
  const me = getMe();
  const payload = parseObject(state.room?.pending_payload);
  if (!me || state.room?.phase !== 'awaiting_purchase' || payload.actorId !== me.id || state.isBusy || state.isAnimating) return;
  const waitLeft = Number(payload.availableAt || 0) - Date.now();
  if (waitLeft > 50) return;

  state.isBusy = true;
  renderRoom();
  try {
    let money = Number(me.money || 0);
    let inventory = normalizeInventory(me.inventory);
    let banner = 'Nem vásárolt';
    let body = `${me.name} most kihagyta ezt a boltot.`;

    if (buy && payload.canBuy) {
      money -= Number(payload.price || 0);
      inventory = maybeAddInventoryItem(inventory, {
        id: payload.itemId ?? null,
        name: payload.itemName,
        icon: payload.itemIcon || '🎁',
        category: payload.itemCategory || '',
        required: payload.itemRequired !== false,
      });
      banner = `Vásárlás: ${payload.itemName} • -${Number(payload.price || 0)} ${getCurrencyLabel()}`;
      body = `${me.name} megvette: ${payload.itemName}.`;
    }

    const updatePlayer = await supabase.from('room_players').update({ money, inventory }).eq('id', me.id);
    if (updatePlayer.error) throw updatePlayer.error;

    const winner = checkWin({ money, inventory });
    const startAt = Date.now() + 650;
    const roomUpdate = await supabase.from('rooms').update({ status: winner ? 'finished' : 'playing', phase: 'resolving_auto', pending_payload: {
      actorId: me.id,
      actorName: me.name,
      token: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      finalize: winner ? 'finish' : 'advance',
      startAt,
      endAt: startAt + getCardOverlayMs(),
    } }).eq('id', state.room.id);
    if (roomUpdate.error) throw roomUpdate.error;

    const row = await addLog(state.room.id, body, {
      type: 'purchase_result',
      actorId: me.id,
      actorName: me.name,
      startAt,
      card: {
        title: buy ? 'Sikeres vásárlás' : 'Bolt kihagyva',
        text: buy ? `${me.name} megvette: ${payload.itemName}.` : `${me.name} kihagyta: ${payload.itemName}.`,
        banner,
        icon: buy ? (payload.itemIcon || '🛍️') : '🙅',
        colorKey: buy ? 'gold' : 'blue',
        imageUrl: payload.itemImage || '',
      },
      winnerName: winner ? me.name : '',
    });
    if (winner) await addLog(state.room.id, `${me.name} megnyerte a játékot!`);
    if (row) queueEventFromLog(row);
    await refreshRoom();
  } catch (error) {
    alert(readableError(error));
  } finally {
    state.isBusy = false;
    renderRoom();
  }
}

async function maybeHandlePhase() {
  if (!state.room || state.phaseBusy || state.isAnimating) return;
  const me = getMe();
  const payload = parseObject(state.room.pending_payload);
  if (!payload?.token) return;
  if (state.phaseTokenHandled === payload.token) return;

  if (state.room.phase === 'resolving_auto') {
    if (payload.actorId !== me?.id) return;
    const wait = Number(payload.endAt || 0) - Date.now();
    if (wait > 80) return;
    state.phaseBusy = true;
    try {
      if (payload.finalize === 'finish') {
        await supabase.from('rooms').update({ phase: 'roll', pending_payload: {} }).eq('id', state.room.id);
      } else {
        await advanceTurn();
      }
      state.phaseTokenHandled = payload.token;
      await refreshRoom();
    } finally {
      state.phaseBusy = false;
    }
  }
}

async function advanceTurn() {
  const nextIndex = (Number(state.room.turn_index || 0) + 1) % Math.max(state.players.length, 1);
  const nextTurnNo = nextIndex === 0 ? Number(state.room.turn_no || 1) + 1 : Number(state.room.turn_no || 1);
  const update = await supabase.from('rooms').update({ turn_index: nextIndex, turn_no: nextTurnNo, phase: 'roll', pending_payload: {} }).eq('id', state.room.id);
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
  state.lastSeenLogId = Number(fresh[fresh.length - 1].id || 0);
  for (const row of fresh) queueEventFromLog(row);
}

function queueEventFromLog(row) {
  const payload = parseObject(row?.payload);
  if (!payload.type || state.processedEventIds.has(row.id)) return;
  state.processedEventIds.add(row.id);
  if (payload.actorId && payload.fromPosition != null) {
    state.visualPositions[payload.actorId] = wrapPosition(Number(payload.fromPosition), state.boardTiles.length || 1);
  }
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
    hideOverlay();
    syncVisualPositions();
    renderRoom();
    maybeHandlePhase().catch(console.error);
  }
}

async function playEvent(row) {
  const payload = parseObject(row.payload);
  const wait = Math.max(0, Number(payload.startAt || 0) - Date.now());
  if (wait) await delay(wait);

  if (payload.type === 'skip_notice') {
    await showOverlay({
      banner: payload.banner || 'Kimaradás',
      title: payload.title || 'Kör kimarad',
      text: payload.body || '',
      icon: payload.icon || '😴',
      colorKey: payload.colorKey || 'blue',
      typeLabel: 'ESEMÉNY',
      imageUrl: payload.imageUrl || '',
    }, getCardOverlayMs());
    return;
  }

  if (payload.type === 'turn_action') {
    if (payload.actorId && payload.fromPosition != null) {
      state.visualPositions[payload.actorId] = wrapPosition(Number(payload.fromPosition), state.boardTiles.length || 1);
      renderBoard();
    }
    if (payload.roll) {
      await animateDiceRollShared(payload.roll, payload.actorName || 'Játékos');
      els.diceInfo.textContent = `Utolsó dobás: ${payload.roll}`;
    }
    if (payload.actorId && Array.isArray(payload.movePath) && payload.movePath.length) {
      await animatePawnPath(payload.actorId, payload.movePath);
    }
    if (payload.tile) {
      state.highlightedTileIndex = Number(payload.landingPosition || 0);
      renderBoard();
      await showOverlay({
        banner: payload.banner || payload.tile.banner || 'Mezőhatás',
        title: payload.tile.title,
        text: payload.tile.text,
        icon: payload.tile.icon || '✨',
        colorKey: payload.tile.colorKey || 'neutral',
        typeLabel: 'MEZŐ',
        imageUrl: payload.tile.imageUrl || '',
        accentColor: payload.tile.accentColor || '',
        textColor: payload.tile.textColor || '',
      }, getTileOverlayMs());
      state.highlightedTileIndex = null;
      renderBoard();
    }
    if (payload.actorId && Array.isArray(payload.followupPath) && payload.followupPath.length) {
      await animatePawnPath(payload.actorId, payload.followupPath);
    }
    if (payload.winnerName) {
      await showOverlay({
        banner: `${payload.winnerName} nyert`,
        title: 'Vége a játéknak',
        text: `${payload.winnerName} teljesítette a győzelmi feltételt.`,
        icon: '🏆',
        colorKey: 'gold',
        typeLabel: 'GYŐZELEM',
      }, 2600);
    }
    return;
  }

  if (payload.type === 'card_draw' || payload.type === 'purchase_result') {
    if (payload.actorId && payload.fromPosition != null) {
      state.visualPositions[payload.actorId] = wrapPosition(Number(payload.fromPosition), state.boardTiles.length || 1);
      renderBoard();
    }
    if (payload.actorId && Array.isArray(payload.movePath) && payload.movePath.length) {
      await animatePawnPath(payload.actorId, payload.movePath);
    }
    if (payload.card) {
      await showOverlay({
        banner: payload.card.banner || 'Szerencsekártya',
        title: payload.card.title,
        text: payload.card.text,
        icon: payload.card.icon || '💌',
        colorKey: payload.card.colorKey || 'pink',
        typeLabel: payload.type === 'card_draw' ? 'SZERENCSEKÁRTYA' : 'VÁSÁRLÁS',
        imageUrl: payload.card.imageUrl || '',
        accentColor: payload.card.accentColor || '',
        textColor: payload.card.textColor || '',
      }, getCardOverlayMs());
    }
    if (payload.winnerName) {
      await showOverlay({
        banner: `${payload.winnerName} nyert`,
        title: 'Vége a játéknak',
        text: `${payload.winnerName} teljesítette a győzelmi feltételt.`,
        icon: '🏆',
        colorKey: 'gold',
        typeLabel: 'GYŐZELEM',
      }, 2600);
    }
  }
}

async function animatePawnPath(playerId, path) {
  if (!playerId || !Array.isArray(path) || !path.length) return;
  for (const pos of path) {
    state.visualPositions[playerId] = wrapPosition(Number(pos || 0), state.boardTiles.length || 1);
    renderBoard();
    await delay(260);
  }
}

async function showOverlay(data, duration = 3500) {
  els.eventBanner.textContent = data.banner || 'Esemény';
  els.eventType.textContent = data.typeLabel || 'ESEMÉNY';
  els.eventTitle.textContent = data.title || 'Esemény';
  els.eventText.textContent = data.text || '';
  els.eventIcon.textContent = data.icon || '✨';
  els.eventCard.className = `event-card tile-${sanitizeCssClass(data.colorKey || 'neutral')}`;
  els.eventCard.style.setProperty('--event-accent', data.accentColor || '');
  els.eventCard.style.setProperty('--event-text', data.textColor || '');
  els.eventCard.style.setProperty('--event-image', data.imageUrl ? `url("${data.imageUrl}")` : 'none');
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
  els.diceLabel.textContent = `${actorName} dob...`;
  for (let i = 0; i < 14; i += 1) {
    const value = i === 13 ? finalValue : (Math.floor(Math.random() * 6) + 1);
    renderDice(value);
    await delay(66 + i * 8);
  }
  els.diceFace.classList.remove('rolling');
  renderDice(finalValue);
  els.diceLabel.textContent = `Dobás kész`;
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
  state.phaseTokenHandled = null;
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
  els.deckArea.classList.add('hidden');
  els.decisionArea.classList.add('hidden');
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

function buildBoardPath(cols, rows, count) {
  const coords = [];
  for (let offset = 0; offset <= 2; offset += 2) {
    const left = 1 + offset;
    const top = 1 + offset;
    const right = cols - offset;
    const bottom = rows - offset;
    if (right - left < 1 || bottom - top < 1) break;
    for (let col = right; col >= left; col -= 1) coords.push({ row: bottom, col });
    for (let row = bottom - 1; row >= top; row -= 1) coords.push({ row, col: left });
    for (let col = left + 1; col <= right; col += 1) coords.push({ row: top, col });
    for (let row = top + 1; row <= bottom - 1; row += 1) coords.push({ row, col: right });
    if (coords.length >= count) break;
  }
  return coords.slice(0, count);
}

function summarizeTileForOverlay(tile, index, banner) {
  if (!tile) return null;
  return {
    index,
    title: tile.name || tile.short_name || `Mező ${index}`,
    text: tile.description || tile.kind || 'Mező',
    banner: banner || tile.description || 'Mezőhatás',
    icon: tile.icon || defaultTileIcon(tile.kind),
    colorKey: tile.accent_color ? 'custom' : (tile.color_key || tile.kind || 'neutral'),
    imageUrl: tile.image_url || '',
    accentColor: tile.accent_color || '',
    textColor: tile.text_color || '',
  };
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

function getItemById(id) {
  return state.items.find((item) => Number(item.id) === Number(id)) || null;
}

function normalizeInventory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    if (typeof item === 'string') return { id: null, name: item, icon: '🎁', category: '', required: false };
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
  if (!item || hasItem(current, item)) return current;
  current.push({ id: item.id ?? null, name: item.name ?? 'Tárgy', icon: item.icon ?? '🎁', category: item.category ?? '', required: item.required !== false });
  return current;
}

function randomCard(group) {
  const list = state.cards.filter((card) => String(card.card_group || 'chance') === String(group));
  if (!list.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}

function countRequiredOwned(inventory) {
  return normalizeInventory(inventory).filter((item) => item.required !== false).length;
}

function checkWin(result) {
  const needMoney = Number(state.config.win_money || 0);
  const needed = Number(state.config.required_items || 0);
  const requiredOwned = countRequiredOwned(result.inventory);
  return Number(result.money || 0) >= needMoney || requiredOwned >= needed;
}

function parseObject(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
}

function maxLogId(rows) {
  return rows.reduce((max, row) => Math.max(max, Number(row.id || 0)), 0);
}

function loadSession() {
  try { return JSON.parse(localStorage.getItem('go_session') || 'null'); } catch { return null; }
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

function valueFromConfig(raw) {
  return typeof raw === 'object' && raw !== null && 'value' in raw ? raw.value : raw;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
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

function renderDice(value) {
  const n = Math.max(1, Math.min(6, Number(value || 1)));
  const active = diceMap[n] || [];
  els.diceFace.innerHTML = Array.from({ length: 9 }, (_, index) => `<span class="dice-pip ${active.includes(index) ? 'on' : ''}"></span>`).join('');
}

function getTileOverlayMs() {
  return Math.max(1200, Number(state.config.event_overlay_ms || 3500));
}

function getCardOverlayMs() {
  return Math.max(1200, Number(state.config.card_overlay_ms || state.config.event_overlay_ms || 3500));
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
