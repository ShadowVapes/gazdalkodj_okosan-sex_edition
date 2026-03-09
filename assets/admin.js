import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = (s) => document.querySelector(s);

const refs = {
  adminStatus: $('#adminStatus'),
  saveConfigBtn: $('#saveConfigBtn'),
  cfgTitle: $('#cfgTitle'),
  cfgSubtitle: $('#cfgSubtitle'),
  cfgCurrency: $('#cfgCurrency'),
  cfgStartingMoney: $('#cfgStartingMoney'),
  cfgPassStart: $('#cfgPassStart'),
  cfgLandStart: $('#cfgLandStart'),
  cfgCols: $('#cfgCols'),
  cfgRows: $('#cfgRows'),
  cfgAnimMs: $('#cfgAnimMs'),

  itemsList: $('#itemsList'),
  itemId: $('#itemId'),
  itemName: $('#itemName'),
  itemIcon: $('#itemIcon'),
  itemPrice: $('#itemPrice'),
  itemSort: $('#itemSort'),
  itemColor: $('#itemColor'),
  itemActive: $('#itemActive'),
  itemDesc: $('#itemDesc'),
  newItemBtn: $('#newItemBtn'),
  saveItemBtn: $('#saveItemBtn'),
  deleteItemBtn: $('#deleteItemBtn'),

  tilesList: $('#tilesList'),
  tileId: $('#tileId'),
  tileName: $('#tileName'),
  tileShort: $('#tileShort'),
  tileIcon: $('#tileIcon'),
  tileKind: $('#tileKind'),
  tileSort: $('#tileSort'),
  tileNext: $('#tileNext'),
  tileAmount: $('#tileAmount'),
  tileSkip: $('#tileSkip'),
  tileMove: $('#tileMove'),
  tileGroup: $('#tileGroup'),
  tileBuyLimit: $('#tileBuyLimit'),
  tileGiftCount: $('#tileGiftCount'),
  tileBuyIds: $('#tileBuyIds'),
  tileGiftIds: $('#tileGiftIds'),
  tileX: $('#tileX'),
  tileY: $('#tileY'),
  tileColor: $('#tileColor'),
  tileDesc: $('#tileDesc'),
  newTileBtn: $('#newTileBtn'),
  saveTileBtn: $('#saveTileBtn'),
  deleteTileBtn: $('#deleteTileBtn'),
  autoPlaceBtn: $('#autoPlaceBtn'),
  autoLinkBtn: $('#autoLinkBtn'),
  boardEditor: $('#boardEditor'),

  cardsList: $('#cardsList'),
  cardId: $('#cardId'),
  cardTitle: $('#cardTitle'),
  cardIcon: $('#cardIcon'),
  cardSort: $('#cardSort'),
  cardGroup: $('#cardGroup'),
  cardAmount: $('#cardAmount'),
  cardSkip: $('#cardSkip'),
  cardMove: $('#cardMove'),
  cardBuyLimit: $('#cardBuyLimit'),
  cardGiftCount: $('#cardGiftCount'),
  cardBuyIds: $('#cardBuyIds'),
  cardGiftIds: $('#cardGiftIds'),
  cardColor: $('#cardColor'),
  cardBody: $('#cardBody'),
  newCardBtn: $('#newCardBtn'),
  saveCardBtn: $('#saveCardBtn'),
  deleteCardBtn: $('#deleteCardBtn'),
};

const state = {
  config: {},
  items: [],
  tiles: [],
  cards: [],
};

function num(v, fb = 0) { const n = Number(v); return Number.isFinite(n) ? n : fb; }
function txt(v, fb = '') { return v == null ? fb : String(v); }
function setStatus(msg, bad = false) {
  refs.adminStatus.textContent = msg;
  refs.adminStatus.style.background = bad ? 'rgba(214,91,116,0.22)' : 'rgba(70,98,160,0.28)';
}
function parseCfgValue(v) {
  try {
    const parsed = typeof v === 'string' ? JSON.parse(v) : v;
    if (parsed && typeof parsed === 'object' && 'value' in parsed) return parsed.value;
  } catch {}
  return v;
}
function packCfgValue(v) { return { value: v }; }
function toIdCsv(value) {
  if (Array.isArray(value)) return value.join(',');
  try { return JSON.parse(value).join(','); } catch { return ''; }
}
function csvToIds(value) {
  return String(value || '').split(',').map((v) => Number(v.trim())).filter((v) => Number.isFinite(v) && v > 0);
}

async function loadAll() {
  setStatus('Betöltés…');
  const [cfgRes, itemsRes, tilesRes, cardsRes] = await Promise.all([
    supabase.from('game_config').select('*').order('key'),
    supabase.from('game_items').select('*').order('sort_order').order('id'),
    supabase.from('game_tiles').select('*').order('sort_order').order('id'),
    supabase.from('game_cards').select('*').order('sort_order').order('id'),
  ]);
  const failed = [cfgRes, itemsRes, tilesRes, cardsRes].find((r) => r.error);
  if (failed) throw failed.error;

  state.config = {};
  (cfgRes.data || []).forEach((row) => { state.config[row.key] = parseCfgValue(row.value); });
  state.items = itemsRes.data || [];
  state.tiles = tilesRes.data || [];
  state.cards = cardsRes.data || [];
  fillConfig();
  renderItems();
  renderTiles();
  renderCards();
  renderBoardEditor();
  setStatus('Kapcsolódva');
}

function fillConfig() {
  refs.cfgTitle.value = txt(state.config.game_title, 'Gazdálkodj Pajkosan');
  refs.cfgSubtitle.value = txt(state.config.game_subtitle, 'Stabil alapverzió.');
  refs.cfgCurrency.value = txt(state.config.currency_name, 'Ft');
  refs.cfgStartingMoney.value = num(state.config.starting_money, 3000);
  refs.cfgPassStart.value = num(state.config.pass_start_bonus, 400);
  refs.cfgLandStart.value = num(state.config.land_start_bonus, 800);
  refs.cfgCols.value = num(state.config.board_cols, 10);
  refs.cfgRows.value = num(state.config.board_rows, 10);
  refs.cfgAnimMs.value = num(state.config.animation_ms_per_step, 430);
}

async function saveConfig() {
  const rows = [
    ['game_title', refs.cfgTitle.value],
    ['game_subtitle', refs.cfgSubtitle.value],
    ['currency_name', refs.cfgCurrency.value],
    ['starting_money', num(refs.cfgStartingMoney.value, 3000)],
    ['pass_start_bonus', num(refs.cfgPassStart.value, 400)],
    ['land_start_bonus', num(refs.cfgLandStart.value, 800)],
    ['board_cols', num(refs.cfgCols.value, 10)],
    ['board_rows', num(refs.cfgRows.value, 10)],
    ['animation_ms_per_step', num(refs.cfgAnimMs.value, 430)],
  ].map(([key, value]) => ({ key, value: packCfgValue(value) }));
  const res = await supabase.from('game_config').upsert(rows, { onConflict: 'key' });
  if (res.error) throw res.error;
  await loadAll();
}

function renderItems() {
  refs.itemsList.innerHTML = '';
  state.items.forEach((item) => {
    const row = document.createElement('div');
    row.className = `admin-row ${String(item.id) === refs.itemId.value ? 'active' : ''}`;
    row.innerHTML = `<div><strong>${item.icon} ${item.name}</strong><div class="muted">#${item.id} • ${item.price} Ft</div></div><div class="muted">${item.sort_order}</div>`;
    row.addEventListener('click', () => editItem(item.id));
    refs.itemsList.appendChild(row);
  });
}
function editItem(id) {
  const item = state.items.find((x) => x.id === id);
  if (!item) return;
  refs.itemId.value = item.id;
  refs.itemName.value = txt(item.name);
  refs.itemIcon.value = txt(item.icon);
  refs.itemPrice.value = num(item.price);
  refs.itemSort.value = num(item.sort_order);
  refs.itemColor.value = txt(item.accent_color);
  refs.itemActive.value = String(!!item.active);
  refs.itemDesc.value = txt(item.description);
  renderItems();
}
function clearItem() {
  refs.itemId.value = '';
  refs.itemName.value = '';
  refs.itemIcon.value = '🎁';
  refs.itemPrice.value = 500;
  refs.itemSort.value = state.items.length + 1;
  refs.itemColor.value = '#3d5afe';
  refs.itemActive.value = 'true';
  refs.itemDesc.value = '';
  renderItems();
}
async function saveItem() {
  const payload = {
    name: refs.itemName.value.trim() || 'Új tárgy',
    icon: refs.itemIcon.value.trim() || '🎁',
    price: num(refs.itemPrice.value),
    sort_order: num(refs.itemSort.value),
    accent_color: refs.itemColor.value.trim() || '#3d5afe',
    active: refs.itemActive.value === 'true',
    description: refs.itemDesc.value.trim(),
  };
  const id = num(refs.itemId.value, 0);
  const res = id
    ? await supabase.from('game_items').update(payload).eq('id', id)
    : await supabase.from('game_items').insert(payload);
  if (res.error) throw res.error;
  await loadAll();
}
async function deleteItem() {
  const id = num(refs.itemId.value, 0);
  if (!id) return;
  const res = await supabase.from('game_items').delete().eq('id', id);
  if (res.error) throw res.error;
  clearItem();
  await loadAll();
}

function fillTileSelect() {
  refs.tileNext.innerHTML = '<option value="">- nincs -</option>';
  state.tiles.forEach((tile) => {
    const op = document.createElement('option');
    op.value = tile.id;
    op.textContent = `${tile.sort_order}. ${tile.name}`;
    refs.tileNext.appendChild(op);
  });
}
function renderTiles() {
  fillTileSelect();
  refs.tilesList.innerHTML = '';
  state.tiles.forEach((tile) => {
    const row = document.createElement('div');
    row.className = `admin-row ${String(tile.id) === refs.tileId.value ? 'active' : ''}`;
    row.innerHTML = `<div><strong>${tile.icon} ${tile.name}</strong><div class="muted">#${tile.id} • ${tile.kind} • (${txt(tile.board_x,'-')}, ${txt(tile.board_y,'-')})</div></div><div class="muted">${tile.sort_order}</div>`;
    row.addEventListener('click', () => editTile(tile.id));
    refs.tilesList.appendChild(row);
  });
}
function editTile(id) {
  const tile = state.tiles.find((x) => x.id === id);
  if (!tile) return;
  refs.tileId.value = tile.id;
  refs.tileName.value = txt(tile.name);
  refs.tileShort.value = txt(tile.short_name);
  refs.tileIcon.value = txt(tile.icon);
  refs.tileKind.value = txt(tile.kind, 'neutral');
  refs.tileSort.value = num(tile.sort_order);
  refs.tileNext.value = tile.next_tile_id || '';
  refs.tileAmount.value = num(tile.amount);
  refs.tileSkip.value = num(tile.skip_turns);
  refs.tileMove.value = num(tile.move_steps);
  refs.tileGroup.value = txt(tile.card_group, 'chance');
  refs.tileBuyLimit.value = num(tile.buy_pick_limit, 1);
  refs.tileGiftCount.value = num(tile.gift_count, 1);
  refs.tileBuyIds.value = toIdCsv(tile.buy_item_ids);
  refs.tileGiftIds.value = toIdCsv(tile.gift_item_ids);
  refs.tileX.value = tile.board_x ?? '';
  refs.tileY.value = tile.board_y ?? '';
  refs.tileColor.value = txt(tile.accent_color);
  refs.tileDesc.value = txt(tile.description);
  renderTiles();
  renderBoardEditor();
}
function clearTile() {
  refs.tileId.value = '';
  refs.tileName.value = '';
  refs.tileShort.value = '';
  refs.tileIcon.value = '⬢';
  refs.tileKind.value = 'neutral';
  refs.tileSort.value = state.tiles.length + 1;
  refs.tileNext.value = '';
  refs.tileAmount.value = 0;
  refs.tileSkip.value = 0;
  refs.tileMove.value = 0;
  refs.tileGroup.value = 'chance';
  refs.tileBuyLimit.value = 1;
  refs.tileGiftCount.value = 1;
  refs.tileBuyIds.value = '';
  refs.tileGiftIds.value = '';
  refs.tileX.value = '';
  refs.tileY.value = '';
  refs.tileColor.value = '';
  refs.tileDesc.value = '';
  renderTiles();
  renderBoardEditor();
}
async function saveTile() {
  const payload = {
    name: refs.tileName.value.trim() || 'Új mező',
    short_name: refs.tileShort.value.trim() || refs.tileName.value.trim().slice(0, 8).toUpperCase(),
    icon: refs.tileIcon.value.trim() || '⬢',
    kind: refs.tileKind.value,
    sort_order: num(refs.tileSort.value),
    next_tile_id: refs.tileNext.value ? num(refs.tileNext.value) : null,
    amount: num(refs.tileAmount.value),
    skip_turns: num(refs.tileSkip.value),
    move_steps: num(refs.tileMove.value),
    card_group: refs.tileGroup.value.trim() || 'chance',
    buy_pick_limit: Math.max(1, num(refs.tileBuyLimit.value, 1)),
    gift_count: Math.max(1, num(refs.tileGiftCount.value, 1)),
    buy_item_ids: csvToIds(refs.tileBuyIds.value),
    gift_item_ids: csvToIds(refs.tileGiftIds.value),
    board_x: refs.tileX.value === '' ? null : num(refs.tileX.value),
    board_y: refs.tileY.value === '' ? null : num(refs.tileY.value),
    accent_color: refs.tileColor.value.trim(),
    description: refs.tileDesc.value.trim(),
  };
  const id = num(refs.tileId.value, 0);
  const res = id
    ? await supabase.from('game_tiles').update(payload).eq('id', id)
    : await supabase.from('game_tiles').insert(payload);
  if (res.error) throw res.error;
  await loadAll();
}
async function deleteTile() {
  const id = num(refs.tileId.value, 0);
  if (!id) return;
  const res = await supabase.from('game_tiles').delete().eq('id', id);
  if (res.error) throw res.error;
  clearTile();
  await loadAll();
}

function renderCards() {
  refs.cardsList.innerHTML = '';
  state.cards.forEach((card) => {
    const row = document.createElement('div');
    row.className = `admin-row ${String(card.id) === refs.cardId.value ? 'active' : ''}`;
    row.innerHTML = `<div><strong>${card.icon} ${card.title}</strong><div class="muted">#${card.id} • ${card.card_group}</div></div><div class="muted">${card.sort_order}</div>`;
    row.addEventListener('click', () => editCard(card.id));
    refs.cardsList.appendChild(row);
  });
}
function editCard(id) {
  const card = state.cards.find((x) => x.id === id);
  if (!card) return;
  refs.cardId.value = card.id;
  refs.cardTitle.value = txt(card.title);
  refs.cardIcon.value = txt(card.icon);
  refs.cardSort.value = num(card.sort_order);
  refs.cardGroup.value = txt(card.card_group, 'chance');
  refs.cardAmount.value = num(card.amount);
  refs.cardSkip.value = num(card.skip_turns);
  refs.cardMove.value = num(card.move_steps);
  refs.cardBuyLimit.value = num(card.buy_pick_limit, 1);
  refs.cardGiftCount.value = num(card.gift_count, 1);
  refs.cardBuyIds.value = toIdCsv(card.buy_item_ids);
  refs.cardGiftIds.value = toIdCsv(card.gift_item_ids);
  refs.cardColor.value = txt(card.accent_color);
  refs.cardBody.value = txt(card.body);
  renderCards();
}
function clearCard() {
  refs.cardId.value = '';
  refs.cardTitle.value = '';
  refs.cardIcon.value = '💌';
  refs.cardSort.value = state.cards.length + 1;
  refs.cardGroup.value = 'chance';
  refs.cardAmount.value = 0;
  refs.cardSkip.value = 0;
  refs.cardMove.value = 0;
  refs.cardBuyLimit.value = 1;
  refs.cardGiftCount.value = 1;
  refs.cardBuyIds.value = '';
  refs.cardGiftIds.value = '';
  refs.cardColor.value = '';
  refs.cardBody.value = '';
  renderCards();
}
async function saveCard() {
  const payload = {
    title: refs.cardTitle.value.trim() || 'Új kártya',
    icon: refs.cardIcon.value.trim() || '💌',
    sort_order: num(refs.cardSort.value),
    card_group: refs.cardGroup.value.trim() || 'chance',
    amount: num(refs.cardAmount.value),
    skip_turns: num(refs.cardSkip.value),
    move_steps: num(refs.cardMove.value),
    buy_pick_limit: Math.max(1, num(refs.cardBuyLimit.value, 1)),
    gift_count: Math.max(1, num(refs.cardGiftCount.value, 1)),
    buy_item_ids: csvToIds(refs.cardBuyIds.value),
    gift_item_ids: csvToIds(refs.cardGiftIds.value),
    accent_color: refs.cardColor.value.trim(),
    body: refs.cardBody.value.trim(),
  };
  const id = num(refs.cardId.value, 0);
  const res = id
    ? await supabase.from('game_cards').update(payload).eq('id', id)
    : await supabase.from('game_cards').insert(payload);
  if (res.error) throw res.error;
  await loadAll();
}
async function deleteCard() {
  const id = num(refs.cardId.value, 0);
  if (!id) return;
  const res = await supabase.from('game_cards').delete().eq('id', id);
  if (res.error) throw res.error;
  clearCard();
  await loadAll();
}

function renderBoardEditor() {
  const cols = Math.max(6, num(refs.cfgCols.value || state.config.board_cols, 10));
  const rows = Math.max(6, num(refs.cfgRows.value || state.config.board_rows, 10));
  refs.boardEditor.style.setProperty('--cols', cols);
  refs.boardEditor.style.setProperty('--rows', rows);
  refs.boardEditor.innerHTML = '';
  const selectedId = num(refs.tileId.value, 0);
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'board-cell';
      const tile = state.tiles.find((t) => num(t.board_x, -1) === x && num(t.board_y, -1) === y);
      if (tile) {
        cell.classList.add('used');
        cell.textContent = tile.sort_order;
        if (tile.id === selectedId) cell.classList.add('selected');
        cell.title = `${tile.sort_order}. ${tile.name}`;
      } else {
        cell.textContent = `${x},${y}`;
      }
      cell.addEventListener('click', () => {
        if (!selectedId) return;
        refs.tileX.value = x;
        refs.tileY.value = y;
        renderBoardEditor();
      });
      refs.boardEditor.appendChild(cell);
    }
  }
}

async function autoLink() {
  const ordered = [...state.tiles].sort((a, b) => num(a.sort_order) - num(b.sort_order));
  for (let i = 0; i < ordered.length; i += 1) {
    const next = ordered[(i + 1) % ordered.length];
    await supabase.from('game_tiles').update({ next_tile_id: next.id }).eq('id', ordered[i].id);
  }
  await loadAll();
}
async function autoPlace() {
  const ordered = [...state.tiles].sort((a, b) => num(a.sort_order) - num(b.sort_order));
  const cols = Math.max(6, num(refs.cfgCols.value || state.config.board_cols, 10));
  const rows = Math.max(6, num(refs.cfgRows.value || state.config.board_rows, 10));
  const coords = [];
  for (let x = 0; x < cols; x += 1) coords.push([x, 0]);
  for (let y = 1; y < rows; y += 1) coords.push([cols - 1, y]);
  for (let x = cols - 2; x >= 0; x -= 1) coords.push([x, rows - 1]);
  for (let y = rows - 2; y > 0; y -= 1) coords.push([0, y]);
  for (let i = 0; i < ordered.length; i += 1) {
    const [x, y] = coords[i % coords.length];
    await supabase.from('game_tiles').update({ board_x: x, board_y: y }).eq('id', ordered[i].id);
  }
  await loadAll();
}

async function guarded(fn) {
  try {
    setStatus('Mentés…');
    await fn();
    setStatus('Mentve');
  } catch (err) {
    console.error(err);
    setStatus('Hiba', true);
    alert(err.message || 'Mentési hiba');
  }
}

refs.saveConfigBtn.addEventListener('click', () => guarded(saveConfig));
refs.newItemBtn.addEventListener('click', clearItem);
refs.saveItemBtn.addEventListener('click', () => guarded(saveItem));
refs.deleteItemBtn.addEventListener('click', () => guarded(deleteItem));
refs.newTileBtn.addEventListener('click', clearTile);
refs.saveTileBtn.addEventListener('click', () => guarded(saveTile));
refs.deleteTileBtn.addEventListener('click', () => guarded(deleteTile));
refs.autoLinkBtn.addEventListener('click', () => guarded(autoLink));
refs.autoPlaceBtn.addEventListener('click', () => guarded(autoPlace));
refs.newCardBtn.addEventListener('click', clearCard);
refs.saveCardBtn.addEventListener('click', () => guarded(saveCard));
refs.deleteCardBtn.addEventListener('click', () => guarded(deleteCard));
refs.cfgCols.addEventListener('input', renderBoardEditor);
refs.cfgRows.addEventListener('input', renderBoardEditor);

(async function init() {
  try {
    await loadAll();
    clearItem();
    clearTile();
    clearCard();
  } catch (err) {
    console.error(err);
    setStatus('Betöltési hiba', true);
    alert('Nem sikerült betölteni az admin adatokat. Futtasd le a mellékelt SQL-t.');
  }
})();
