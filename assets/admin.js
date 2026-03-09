import { SUPABASE_URL, SUPABASE_ANON_KEY, DEMO_MODE } from './config.js';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = (s) => document.querySelector(s);

const refs = {
  status: $('#adminStatus'),
  saveConfigBtn: $('#saveConfigBtn'),
  saveRepoBtn: $('#saveRepoBtn'),
  newItemBtn: $('#newItemBtn'),
  saveItemBtn: $('#saveItemBtn'),
  deleteItemBtn: $('#deleteItemBtn'),
  newTileBtn: $('#newTileBtn'),
  saveTileBtn: $('#saveTileBtn'),
  deleteTileBtn: $('#deleteTileBtn'),
  autoLayoutBtn: $('#autoLayoutBtn'),
  newCardBtn: $('#newCardBtn'),
  saveCardBtn: $('#saveCardBtn'),
  deleteCardBtn: $('#deleteCardBtn'),
  itemSearch: $('#itemSearch'),
  itemList: $('#itemList'),
  tileSearch: $('#tileSearch'),
  tileList: $('#tileList'),
  cardSearch: $('#cardSearch'),
  cardList: $('#cardList'),
  tileGridPreview: $('#tileGridPreview'),
  tileNext: $('#tileNext'),
};

const CONFIG_KEYS = [
  'game_title',
  'game_subtitle',
  'starting_money',
  'currency_name',
  'start_pass_bonus',
  'start_land_bonus',
  'win_money',
  'required_items_to_win',
  'board_cols',
  'board_rows',
  'event_overlay_ms',
  'pawn_step_ms',
  'dice_animation_ms',
  'poll_ms',
];

const STORAGE = {
  repoOwner: 'gp_rewrite_repo_owner',
  repoName: 'gp_rewrite_repo_name',
  repoBranch: 'gp_rewrite_repo_branch',
  repoToken: 'gp_rewrite_repo_token',
};

const state = {
  configRows: [],
  config: {},
  items: [],
  tiles: [],
  cards: [],
  selectedItemId: null,
  selectedTileId: null,
  selectedCardId: null,
  selectedGridX: 0,
  selectedGridY: 0,
};

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function text(value, fallback = '') {
  return value == null ? fallback : String(value);
}
function ensureHex(value, fallback = '#24427e') {
  const v = text(value).trim();
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback;
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
function bySortThenId(a, b) {
  return num(a.sort_order) - num(b.sort_order) || num(a.id) - num(b.id);
}
function setStatus(msg, bad = false) {
  refs.status.textContent = msg;
  refs.status.style.background = bad ? 'rgba(135,37,53,.35)' : '#1b2649';
}
function getConfigValue(key, fallback = '') {
  return state.config[key] === undefined ? fallback : state.config[key];
}
function uniqueIds(ids) {
  return [...new Set((ids || []).map((x) => num(x)).filter(Boolean))];
}
function itemLabel(item) {
  return `${text(item.icon || '🎁')} ${text(item.name || 'Névtelen')}`;
}
async function fileToDataUrl(file) {
  if (!file) return '';
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(text(reader.result));
    reader.onerror = () => reject(new Error('Nem sikerült beolvasni a képet.'));
    reader.readAsDataURL(file);
  });
}

function getCheckIds(containerId) {
  return Array.from(document.querySelectorAll(`#${containerId} input[type="checkbox"]:checked`))
    .map((el) => num(el.value))
    .filter(Boolean);
}
function fillCheckList(containerId, selectedIds = []) {
  const wrap = document.getElementById(containerId);
  const selected = new Set(uniqueIds(selectedIds));
  wrap.innerHTML = state.items.length
    ? state.items.map((item) => `
        <label>
          <input type="checkbox" value="${item.id}" ${selected.has(item.id) ? 'checked' : ''}>
          <span>${itemLabel(item)}</span>
        </label>
      `).join('')
    : '<div class="muted-text tiny">Még nincs tárgy.</div>';
}
function buildEffectFromEditor(prefix) {
  const giftAll = document.getElementById(`${prefix}GiftAll`).checked;
  const buyAll = document.getElementById(`${prefix}BuyAll`).checked;
  const effect = {
    gift_all_items: giftAll,
    gift_item_ids: giftAll ? [] : getCheckIds(`${prefix}GiftItems`),
    gift_count: Math.max(0, num(document.getElementById(`${prefix}GiftCount`).value, 0)),
    buy_all_items: buyAll,
    buy_item_ids: buyAll ? [] : getCheckIds(`${prefix}BuyItems`),
    buy_pick_limit: Math.max(1, num(document.getElementById(`${prefix}BuyPickLimit`).value, 1)),
  };
  return effect;
}
function applyEffectToEditor(prefix, effect) {
  const fx = parseEffect(effect);
  document.getElementById(`${prefix}GiftAll`).checked = Boolean(fx.gift_all_items);
  document.getElementById(`${prefix}GiftCount`).value = String(Math.max(0, num(fx.gift_count, 0)));
  document.getElementById(`${prefix}BuyAll`).checked = Boolean(fx.buy_all_items);
  document.getElementById(`${prefix}BuyPickLimit`).value = String(Math.max(1, num(fx.buy_pick_limit, 1)));
  fillCheckList(`${prefix}GiftItems`, fx.gift_item_ids || []);
  fillCheckList(`${prefix}BuyItems`, fx.buy_item_ids || []);
}

async function loadAll() {
  const [cfgRes, itemRes, tileRes, cardRes] = await Promise.all([
    supabase.from('game_config').select('*').order('key'),
    supabase.from('game_items').select('*').order('sort_order', { ascending: true }).order('id', { ascending: true }),
    supabase.from('game_tiles').select('*').order('sort_order', { ascending: true }).order('id', { ascending: true }),
    supabase.from('game_cards').select('*').order('sort_order', { ascending: true }).order('id', { ascending: true }),
  ]);
  const failed = [cfgRes, itemRes, tileRes, cardRes].find((r) => r.error);
  if (failed) throw failed.error;

  state.configRows = cfgRes.data || [];
  state.config = {};
  state.configRows.forEach((row) => {
    const parsed = parseEffect(row.value);
    state.config[row.key] = parsed.value;
  });
  state.items = (itemRes.data || []).sort(bySortThenId);
  state.tiles = (tileRes.data || []).sort(bySortThenId);
  state.cards = (cardRes.data || []).sort(bySortThenId);

  renderConfig();
  renderItemList();
  renderTileList();
  renderCardList();
  renderTileNextOptions();
  renderTileGrid();

  if (!state.selectedItemId && state.items[0]) state.selectedItemId = state.items[0].id;
  if (!state.selectedTileId && state.tiles[0]) state.selectedTileId = state.tiles[0].id;
  if (!state.selectedCardId && state.cards[0]) state.selectedCardId = state.cards[0].id;

  if (state.selectedItemId) loadItemIntoForm(state.selectedItemId);
  else resetItemForm();
  if (state.selectedTileId) loadTileIntoForm(state.selectedTileId);
  else resetTileForm();
  if (state.selectedCardId) loadCardIntoForm(state.selectedCardId);
  else resetCardForm();
}

function renderConfig() {
  CONFIG_KEYS.forEach((key) => {
    const el = document.getElementById(`cfg_${key}`);
    if (!el) return;
    const value = getConfigValue(key, '');
    el.value = value == null ? '' : String(value);
  });
}

function renderItemList() {
  const q = text(refs.itemSearch.value).trim().toLowerCase();
  const rows = state.items.filter((item) => !q || `${item.name} ${item.category} ${item.icon}`.toLowerCase().includes(q));
  refs.itemList.innerHTML = rows.map((item) => `
    <button type="button" class="admin-list-card ${item.id === state.selectedItemId ? 'active' : ''}" data-item-id="${item.id}">
      <div><strong>${itemLabel(item)}</strong></div>
      <div class="tiny muted-text">#${item.sort_order} • ${text(item.category || '-')} • ${item.price} Ft</div>
    </button>
  `).join('') || '<div class="muted-text tiny">Nincs találat.</div>';

  refs.itemList.querySelectorAll('[data-item-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.selectedItemId = num(btn.dataset.itemId);
      loadItemIntoForm(state.selectedItemId);
      renderItemList();
    });
  });
}

function renderTileList() {
  const q = text(refs.tileSearch.value).trim().toLowerCase();
  const rows = state.tiles.filter((tile) => !q || `${tile.name} ${tile.short_name} ${tile.kind} ${tile.icon}`.toLowerCase().includes(q));
  refs.tileList.innerHTML = rows.map((tile) => `
    <button type="button" class="admin-list-card ${tile.id === state.selectedTileId ? 'active' : ''}" data-tile-id="${tile.id}">
      <div><strong>${text(tile.icon || '⬢')} ${text(tile.name || 'Névtelen mező')}</strong></div>
      <div class="tiny muted-text">#${tile.sort_order} • ${tile.kind} • (${num(tile.board_x)}, ${num(tile.board_y)})</div>
    </button>
  `).join('') || '<div class="muted-text tiny">Nincs találat.</div>';

  refs.tileList.querySelectorAll('[data-tile-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.selectedTileId = num(btn.dataset.tileId);
      loadTileIntoForm(state.selectedTileId);
      renderTileList();
      renderTileGrid();
    });
  });
}

function renderCardList() {
  const q = text(refs.cardSearch.value).trim().toLowerCase();
  const rows = state.cards.filter((card) => !q || `${card.title} ${card.card_group} ${card.icon}`.toLowerCase().includes(q));
  refs.cardList.innerHTML = rows.map((card) => `
    <button type="button" class="admin-list-card ${card.id === state.selectedCardId ? 'active' : ''}" data-card-id="${card.id}">
      <div><strong>${text(card.icon || '💌')} ${text(card.title || 'Névtelen kártya')}</strong></div>
      <div class="tiny muted-text">#${card.sort_order} • ${text(card.card_group || 'chance')}</div>
    </button>
  `).join('') || '<div class="muted-text tiny">Nincs találat.</div>';

  refs.cardList.querySelectorAll('[data-card-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.selectedCardId = num(btn.dataset.cardId);
      loadCardIntoForm(state.selectedCardId);
      renderCardList();
    });
  });
}

function renderTileNextOptions() {
  const currentId = num(document.getElementById('tileId').value, 0) || state.selectedTileId;
  refs.tileNext.innerHTML = '<option value="">-- nincs / még nincs --</option>' + state.tiles
    .map((tile) => `<option value="${tile.id}">${tile.sort_order}. ${text(tile.icon || '⬢')} ${text(tile.name || 'Mező')}</option>`)
    .join('');
  const current = state.tiles.find((tile) => tile.id === currentId);
  refs.tileNext.value = current?.next_tile_id ? String(current.next_tile_id) : '';
}

function renderTileGrid() {
  const cols = Math.max(8, num(document.getElementById('cfg_board_cols').value || getConfigValue('board_cols', 12), 12));
  const rows = Math.max(8, num(document.getElementById('cfg_board_rows').value || getConfigValue('board_rows', 12), 12));
  refs.tileGridPreview.style.setProperty('--cols', cols);
  refs.tileGridPreview.style.setProperty('--rows', rows);

  const selectedId = num(document.getElementById('tileId').value, 0) || state.selectedTileId;
  const selectedX = num(document.getElementById('tileX').value, 0);
  const selectedY = num(document.getElementById('tileY').value, 0);

  const occupied = new Map();
  state.tiles.forEach((tile) => {
    if (tile.id === selectedId) return;
    occupied.set(`${num(tile.board_x)},${num(tile.board_y)}`, tile);
  });

  const cells = [];
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const key = `${x},${y}`;
      const occ = occupied.get(key);
      const selected = x === selectedX && y === selectedY;
      cells.push(`
        <button type="button" class="grid-cell ${occ ? 'occupied' : ''} ${selected ? 'selected' : ''}" data-grid-x="${x}" data-grid-y="${y}" title="${occ ? text(occ.name) : `(${x}, ${y})`}">
          ${occ ? `<span>${text(occ.short_name || occ.name || 'M')}</span>` : `<span>${x},${y}</span>`}
        </button>
      `);
    }
  }
  refs.tileGridPreview.innerHTML = cells.join('');
  refs.tileGridPreview.querySelectorAll('[data-grid-x]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.getElementById('tileX').value = btn.dataset.gridX;
      document.getElementById('tileY').value = btn.dataset.gridY;
      renderTileGrid();
    });
  });
}

function resetItemForm() {
  document.getElementById('itemId').value = '';
  document.getElementById('itemSort').value = String((state.items.at(-1)?.sort_order || 0) + 1);
  document.getElementById('itemName').value = '';
  document.getElementById('itemCategory').value = '';
  document.getElementById('itemPrice').value = '0';
  document.getElementById('itemIcon').value = '🎁';
  document.getElementById('itemRequired').value = 'false';
  document.getElementById('itemAccent').value = '#24427e';
  document.getElementById('itemTextColor').value = '#eef5ff';
  document.getElementById('itemBlurb').value = '';
  document.getElementById('itemImageUrl').value = '';
  document.getElementById('itemImageFile').value = '';
}
function loadItemIntoForm(id) {
  const item = state.items.find((row) => row.id === id);
  if (!item) return resetItemForm();
  document.getElementById('itemId').value = String(item.id);
  document.getElementById('itemSort').value = String(num(item.sort_order));
  document.getElementById('itemName').value = text(item.name);
  document.getElementById('itemCategory').value = text(item.category);
  document.getElementById('itemPrice').value = String(num(item.price));
  document.getElementById('itemIcon').value = text(item.icon || '🎁');
  document.getElementById('itemRequired').value = item.required ? 'true' : 'false';
  document.getElementById('itemAccent').value = ensureHex(item.accent_color, '#24427e');
  document.getElementById('itemTextColor').value = ensureHex(item.text_color, '#eef5ff');
  document.getElementById('itemBlurb').value = text(item.blurb);
  document.getElementById('itemImageUrl').value = text(item.image_url);
  document.getElementById('itemImageFile').value = '';
}

function defaultNextTileId(forSort) {
  const ordered = [...state.tiles].sort(bySortThenId);
  const next = ordered.find((tile) => num(tile.sort_order) > forSort);
  return next?.id || ordered.find((tile) => tile.kind === 'start')?.id || ordered[0]?.id || null;
}
function resetTileForm() {
  const nextSort = (state.tiles.at(-1)?.sort_order || 0) + 1;
  document.getElementById('tileId').value = '';
  document.getElementById('tileSort').value = String(nextSort);
  document.getElementById('tileName').value = '';
  document.getElementById('tileShortName').value = '';
  document.getElementById('tileKind').value = 'neutral';
  document.getElementById('tileIcon').value = '⬢';
  document.getElementById('tileCardGroup').value = 'chance';
  document.getElementById('tileAmount').value = '0';
  document.getElementById('tileSkip').value = '0';
  document.getElementById('tileMove').value = '0';
  document.getElementById('tileX').value = '0';
  document.getElementById('tileY').value = '0';
  document.getElementById('tileAccent').value = '#32476f';
  document.getElementById('tileTextColor').value = '#eef5ff';
  document.getElementById('tileImageUrl').value = '';
  document.getElementById('tileDescription').value = '';
  document.getElementById('tileImageFile').value = '';
  renderTileNextOptions();
  refs.tileNext.value = defaultNextTileId(nextSort) ? String(defaultNextTileId(nextSort)) : '';
  applyEffectToEditor('tile', {});
  renderTileGrid();
}
function loadTileIntoForm(id) {
  const tile = state.tiles.find((row) => row.id === id);
  if (!tile) return resetTileForm();
  document.getElementById('tileId').value = String(tile.id);
  document.getElementById('tileSort').value = String(num(tile.sort_order));
  document.getElementById('tileName').value = text(tile.name);
  document.getElementById('tileShortName').value = text(tile.short_name);
  document.getElementById('tileKind').value = text(tile.kind || 'neutral');
  document.getElementById('tileIcon').value = text(tile.icon || '⬢');
  document.getElementById('tileCardGroup').value = text(tile.card_group || 'chance');
  document.getElementById('tileAmount').value = String(num(tile.amount));
  document.getElementById('tileSkip').value = String(num(tile.skip_turns));
  document.getElementById('tileMove').value = String(num(tile.move_steps));
  document.getElementById('tileX').value = String(num(tile.board_x));
  document.getElementById('tileY').value = String(num(tile.board_y));
  document.getElementById('tileAccent').value = ensureHex(tile.accent_color, '#32476f');
  document.getElementById('tileTextColor').value = ensureHex(tile.text_color, '#eef5ff');
  document.getElementById('tileImageUrl').value = text(tile.image_url);
  document.getElementById('tileDescription').value = text(tile.description);
  document.getElementById('tileImageFile').value = '';
  renderTileNextOptions();
  refs.tileNext.value = tile.next_tile_id ? String(tile.next_tile_id) : '';
  applyEffectToEditor('tile', tile.effect);
  renderTileGrid();
}

function resetCardForm() {
  document.getElementById('cardId').value = '';
  document.getElementById('cardSort').value = String((state.cards.at(-1)?.sort_order || 0) + 1);
  document.getElementById('cardGroup').value = 'chance';
  document.getElementById('cardTitle').value = '';
  document.getElementById('cardIcon').value = '💌';
  document.getElementById('cardAmount').value = '0';
  document.getElementById('cardSkip').value = '0';
  document.getElementById('cardMove').value = '0';
  document.getElementById('cardAccent').value = '#6a2d55';
  document.getElementById('cardTextColor').value = '#fff0fa';
  document.getElementById('cardImageUrl').value = '';
  document.getElementById('cardBody').value = '';
  document.getElementById('cardImageFile').value = '';
  applyEffectToEditor('card', {});
}
function loadCardIntoForm(id) {
  const card = state.cards.find((row) => row.id === id);
  if (!card) return resetCardForm();
  document.getElementById('cardId').value = String(card.id);
  document.getElementById('cardSort').value = String(num(card.sort_order));
  document.getElementById('cardGroup').value = text(card.card_group || 'chance');
  document.getElementById('cardTitle').value = text(card.title);
  document.getElementById('cardIcon').value = text(card.icon || '💌');
  document.getElementById('cardAmount').value = String(num(card.amount));
  document.getElementById('cardSkip').value = String(num(card.skip_turns));
  document.getElementById('cardMove').value = String(num(card.move_steps));
  document.getElementById('cardAccent').value = ensureHex(card.accent_color, '#6a2d55');
  document.getElementById('cardTextColor').value = ensureHex(card.text_color, '#fff0fa');
  document.getElementById('cardImageUrl').value = text(card.image_url);
  document.getElementById('cardBody').value = text(card.body);
  document.getElementById('cardImageFile').value = '';
  applyEffectToEditor('card', card.effect);
}

async function saveConfig() {
  const payload = CONFIG_KEYS.map((key) => {
    const input = document.getElementById(`cfg_${key}`);
    const raw = input?.value ?? '';
    const value = input?.type === 'number' ? num(raw) : raw;
    return { key, value: { value } };
  });
  const res = await supabase.from('game_config').upsert(payload, { onConflict: 'key' }).select();
  if (res.error) throw res.error;
  setStatus('Config elmentve.');
  await loadAll();
}

function loadRepoFields() {
  $('#repoOwner').value = localStorage.getItem(STORAGE.repoOwner) || '';
  $('#repoName').value = localStorage.getItem(STORAGE.repoName) || '';
  $('#repoBranch').value = localStorage.getItem(STORAGE.repoBranch) || 'main';
  $('#repoToken').value = localStorage.getItem(STORAGE.repoToken) || '';
}
function saveRepoFields() {
  localStorage.setItem(STORAGE.repoOwner, $('#repoOwner').value.trim());
  localStorage.setItem(STORAGE.repoName, $('#repoName').value.trim());
  localStorage.setItem(STORAGE.repoBranch, $('#repoBranch').value.trim() || 'main');
  localStorage.setItem(STORAGE.repoToken, $('#repoToken').value.trim());
  setStatus('Repo adatok helyben elmentve.');
}

async function saveItem() {
  const id = num(document.getElementById('itemId').value, 0);
  const file = document.getElementById('itemImageFile').files?.[0];
  const uploaded = file ? await fileToDataUrl(file) : '';
  const payload = {
    sort_order: num(document.getElementById('itemSort').value, 0),
    name: text(document.getElementById('itemName').value).trim(),
    category: text(document.getElementById('itemCategory').value).trim(),
    price: num(document.getElementById('itemPrice').value, 0),
    icon: text(document.getElementById('itemIcon').value || '🎁').trim() || '🎁',
    required: document.getElementById('itemRequired').value === 'true',
    blurb: text(document.getElementById('itemBlurb').value).trim(),
    image_url: uploaded || text(document.getElementById('itemImageUrl').value).trim(),
    accent_color: ensureHex(document.getElementById('itemAccent').value, '#24427e'),
    text_color: ensureHex(document.getElementById('itemTextColor').value, '#eef5ff'),
    effect: {},
  };
  if (!payload.name) throw new Error('Adj nevet a tárgynak.');

  let saved;
  if (id) {
    const res = await supabase.from('game_items').update(payload).eq('id', id).select().single();
    if (res.error) throw res.error;
    saved = res.data;
  } else {
    const res = await supabase.from('game_items').insert(payload).select().single();
    if (res.error) throw res.error;
    saved = res.data;
  }
  state.selectedItemId = saved.id;
  setStatus('Tárgy elmentve.');
  await loadAll();
}

async function deleteItem() {
  const id = num(document.getElementById('itemId').value, 0);
  if (!id) return;
  const res = await supabase.from('game_items').delete().eq('id', id);
  if (res.error) throw res.error;
  state.selectedItemId = state.items.find((item) => item.id !== id)?.id || null;
  setStatus('Tárgy törölve.');
  await loadAll();
}

async function saveTile() {
  const id = num(document.getElementById('tileId').value, 0);
  const file = document.getElementById('tileImageFile').files?.[0];
  const uploaded = file ? await fileToDataUrl(file) : '';
  const effect = buildEffectFromEditor('tile');
  const payload = {
    sort_order: num(document.getElementById('tileSort').value, 0),
    name: text(document.getElementById('tileName').value).trim(),
    short_name: text(document.getElementById('tileShortName').value).trim(),
    kind: text(document.getElementById('tileKind').value || 'neutral').trim() || 'neutral',
    icon: text(document.getElementById('tileIcon').value || '⬢').trim() || '⬢',
    card_group: text(document.getElementById('tileCardGroup').value || 'chance').trim() || 'chance',
    amount: num(document.getElementById('tileAmount').value, 0),
    skip_turns: num(document.getElementById('tileSkip').value, 0),
    move_steps: num(document.getElementById('tileMove').value, 0),
    board_x: Math.max(0, num(document.getElementById('tileX').value, 0)),
    board_y: Math.max(0, num(document.getElementById('tileY').value, 0)),
    next_tile_id: num(refs.tileNext.value, 0) || null,
    accent_color: ensureHex(document.getElementById('tileAccent').value, '#32476f'),
    text_color: ensureHex(document.getElementById('tileTextColor').value, '#eef5ff'),
    image_url: uploaded || text(document.getElementById('tileImageUrl').value).trim(),
    description: text(document.getElementById('tileDescription').value).trim(),
    effect,
    item_id: null,
  };
  if (!payload.name) throw new Error('Adj nevet a mezőnek.');
  if (!payload.short_name) payload.short_name = payload.name.slice(0, 10).toUpperCase();

  let saved;
  if (id) {
    const res = await supabase.from('game_tiles').update(payload).eq('id', id).select().single();
    if (res.error) throw res.error;
    saved = res.data;
  } else {
    const res = await supabase.from('game_tiles').insert(payload).select().single();
    if (res.error) throw res.error;
    saved = res.data;
  }
  state.selectedTileId = saved.id;
  setStatus('Mező elmentve.');
  await loadAll();
}

async function deleteTile() {
  const id = num(document.getElementById('tileId').value, 0);
  if (!id) return;
  const res = await supabase.from('game_tiles').delete().eq('id', id);
  if (res.error) throw res.error;
  state.selectedTileId = state.tiles.find((tile) => tile.id !== id)?.id || null;
  setStatus('Mező törölve.');
  await loadAll();
}

async function saveCard() {
  const id = num(document.getElementById('cardId').value, 0);
  const file = document.getElementById('cardImageFile').files?.[0];
  const uploaded = file ? await fileToDataUrl(file) : '';
  const payload = {
    sort_order: num(document.getElementById('cardSort').value, 0),
    card_group: text(document.getElementById('cardGroup').value || 'chance').trim() || 'chance',
    title: text(document.getElementById('cardTitle').value).trim(),
    icon: text(document.getElementById('cardIcon').value || '💌').trim() || '💌',
    amount: num(document.getElementById('cardAmount').value, 0),
    skip_turns: num(document.getElementById('cardSkip').value, 0),
    move_steps: num(document.getElementById('cardMove').value, 0),
    accent_color: ensureHex(document.getElementById('cardAccent').value, '#6a2d55'),
    text_color: ensureHex(document.getElementById('cardTextColor').value, '#fff0fa'),
    image_url: uploaded || text(document.getElementById('cardImageUrl').value).trim(),
    body: text(document.getElementById('cardBody').value).trim(),
    effect: buildEffectFromEditor('card'),
    item_id: null,
  };
  if (!payload.title) throw new Error('Adj címet a kártyának.');

  let saved;
  if (id) {
    const res = await supabase.from('game_cards').update(payload).eq('id', id).select().single();
    if (res.error) throw res.error;
    saved = res.data;
  } else {
    const res = await supabase.from('game_cards').insert(payload).select().single();
    if (res.error) throw res.error;
    saved = res.data;
  }
  state.selectedCardId = saved.id;
  setStatus('Kártya elmentve.');
  await loadAll();
}

async function deleteCard() {
  const id = num(document.getElementById('cardId').value, 0);
  if (!id) return;
  const res = await supabase.from('game_cards').delete().eq('id', id);
  if (res.error) throw res.error;
  state.selectedCardId = state.cards.find((card) => card.id !== id)?.id || null;
  setStatus('Kártya törölve.');
  await loadAll();
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
  return unique.slice(0, count);
}

async function autoLayoutTiles() {
  const cols = Math.max(8, num(document.getElementById('cfg_board_cols').value || getConfigValue('board_cols', 12), 12));
  const rows = Math.max(8, num(document.getElementById('cfg_board_rows').value || getConfigValue('board_rows', 12), 12));
  const ordered = [...state.tiles].sort(bySortThenId);
  const start = ordered.find((tile) => tile.kind === 'start');
  const withoutStart = ordered.filter((tile) => tile.id !== start?.id);
  const arranged = start ? [start, ...withoutStart] : ordered;
  const coords = computeRingPositions(arranged.length, cols, rows);
  const updates = arranged.map((tile, index) => ({
    id: tile.id,
    board_x: coords[index]?.[0] ?? 0,
    board_y: coords[index]?.[1] ?? 0,
    next_tile_id: arranged[(index + 1) % arranged.length]?.id || null,
  }));

  for (const update of updates) {
    const res = await supabase.from('game_tiles').update({
      board_x: update.board_x,
      board_y: update.board_y,
      next_tile_id: update.next_tile_id,
    }).eq('id', update.id);
    if (res.error) throw res.error;
  }
  setStatus('Automata körpálya kész.');
  await loadAll();
}

function bindEvents() {
  refs.saveConfigBtn.addEventListener('click', () => saveConfig().catch(handleError));
  refs.saveRepoBtn.addEventListener('click', saveRepoFields);
  refs.newItemBtn.addEventListener('click', () => {
    state.selectedItemId = null;
    resetItemForm();
    renderItemList();
  });
  refs.saveItemBtn.addEventListener('click', () => saveItem().catch(handleError));
  refs.deleteItemBtn.addEventListener('click', () => deleteItem().catch(handleError));
  refs.newTileBtn.addEventListener('click', () => {
    state.selectedTileId = null;
    resetTileForm();
    renderTileList();
  });
  refs.saveTileBtn.addEventListener('click', () => saveTile().catch(handleError));
  refs.deleteTileBtn.addEventListener('click', () => deleteTile().catch(handleError));
  refs.autoLayoutBtn.addEventListener('click', () => autoLayoutTiles().catch(handleError));
  refs.newCardBtn.addEventListener('click', () => {
    state.selectedCardId = null;
    resetCardForm();
    renderCardList();
  });
  refs.saveCardBtn.addEventListener('click', () => saveCard().catch(handleError));
  refs.deleteCardBtn.addEventListener('click', () => deleteCard().catch(handleError));

  refs.itemSearch.addEventListener('input', renderItemList);
  refs.tileSearch.addEventListener('input', renderTileList);
  refs.cardSearch.addEventListener('input', renderCardList);
  ['tileX', 'tileY', 'cfg_board_cols', 'cfg_board_rows'].forEach((id) => {
    document.getElementById(id).addEventListener('input', renderTileGrid);
  });
}

function handleError(err) {
  setStatus(err?.message || 'Ismeretlen admin hiba', true);
  console.error(err);
}

async function init() {
  bindEvents();
  loadRepoFields();
  try {
    if (DEMO_MODE) setStatus('Demo config', true);
    else setStatus('Betöltés…');
    await loadAll();
    setStatus('Admin kész.');
  } catch (err) {
    handleError(err);
  }
}

init();
