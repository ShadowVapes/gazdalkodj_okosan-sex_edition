import { SUPABASE_URL, SUPABASE_ANON_KEY, DEMO_MODE } from './config.js';

const supabase = !DEMO_MODE && window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

const els = {
  saveConfigBtn: document.getElementById('saveConfigBtn'),
  cfgGameTitle: document.getElementById('cfgGameTitle'),
  cfgGameSubtitle: document.getElementById('cfgGameSubtitle'),
  cfgCurrencyName: document.getElementById('cfgCurrencyName'),
  cfgStartingMoney: document.getElementById('cfgStartingMoney'),
  cfgStartBonus: document.getElementById('cfgStartBonus'),
  cfgWinMoney: document.getElementById('cfgWinMoney'),
  cfgRequiredItems: document.getElementById('cfgRequiredItems'),
  cfgCenterText: document.getElementById('cfgCenterText'),
  cfgLobbyNote: document.getElementById('cfgLobbyNote'),
  cfgExtraJson: document.getElementById('cfgExtraJson'),

  itemList: document.getElementById('itemList'),
  newItemBtn: document.getElementById('newItemBtn'),
  itemId: document.getElementById('itemId'),
  itemSort: document.getElementById('itemSort'),
  itemName: document.getElementById('itemName'),
  itemCategory: document.getElementById('itemCategory'),
  itemPrice: document.getElementById('itemPrice'),
  itemIcon: document.getElementById('itemIcon'),
  itemRequired: document.getElementById('itemRequired'),
  itemBlurb: document.getElementById('itemBlurb'),
  itemEffect: document.getElementById('itemEffect'),
  saveItemBtn: document.getElementById('saveItemBtn'),
  deleteItemBtn: document.getElementById('deleteItemBtn'),

  tileList: document.getElementById('tileList'),
  newTileBtn: document.getElementById('newTileBtn'),
  tileId: document.getElementById('tileId'),
  tileSort: document.getElementById('tileSort'),
  tileName: document.getElementById('tileName'),
  tileShortName: document.getElementById('tileShortName'),
  tileIcon: document.getElementById('tileIcon'),
  tileKind: document.getElementById('tileKind'),
  tileColorKey: document.getElementById('tileColorKey'),
  tileAmount: document.getElementById('tileAmount'),
  tilePrice: document.getElementById('tilePrice'),
  tileCardGroup: document.getElementById('tileCardGroup'),
  tileItemId: document.getElementById('tileItemId'),
  tileSkipTurns: document.getElementById('tileSkipTurns'),
  tileMoveSteps: document.getElementById('tileMoveSteps'),
  tileDescription: document.getElementById('tileDescription'),
  tileEffect: document.getElementById('tileEffect'),
  saveTileBtn: document.getElementById('saveTileBtn'),
  deleteTileBtn: document.getElementById('deleteTileBtn'),

  cardList: document.getElementById('cardList'),
  newCardBtn: document.getElementById('newCardBtn'),
  cardId: document.getElementById('cardId'),
  cardGroup: document.getElementById('cardGroup'),
  cardTitle: document.getElementById('cardTitle'),
  cardAmount: document.getElementById('cardAmount'),
  cardSkipTurns: document.getElementById('cardSkipTurns'),
  cardMoveSteps: document.getElementById('cardMoveSteps'),
  cardItemId: document.getElementById('cardItemId'),
  cardBody: document.getElementById('cardBody'),
  cardEffect: document.getElementById('cardEffect'),
  saveCardBtn: document.getElementById('saveCardBtn'),
  deleteCardBtn: document.getElementById('deleteCardBtn'),

  adminStatus: document.getElementById('adminStatus'),
};

const state = {
  config: fallbackConfig(),
  items: [],
  tiles: [],
  cards: [],
};

init().catch((error) => {
  console.error(error);
  setStatus(`Hiba: ${error.message || error}`);
});

async function init() {
  bindEvents();
  if (!supabase) {
    setStatus('Állítsd be az assets/config.js fájlt.');
    disableAll(true);
    return;
  }
  await loadAll();
}

function bindEvents() {
  els.saveConfigBtn.addEventListener('click', saveConfig);

  els.newItemBtn.addEventListener('click', clearItemForm);
  els.saveItemBtn.addEventListener('click', saveItem);
  els.deleteItemBtn.addEventListener('click', deleteItem);

  els.newTileBtn.addEventListener('click', clearTileForm);
  els.saveTileBtn.addEventListener('click', saveTile);
  els.deleteTileBtn.addEventListener('click', deleteTile);

  els.newCardBtn.addEventListener('click', clearCardForm);
  els.saveCardBtn.addEventListener('click', saveCard);
  els.deleteCardBtn.addEventListener('click', deleteCard);
}

function disableAll(disabled) {
  document.querySelectorAll('button, input, select, textarea').forEach((el) => {
    if (el.id !== 'adminStatus') el.disabled = disabled;
  });
}

async function loadAll() {
  setStatus('Betöltés...');
  const [configRes, itemsRes, tileRes, cardRes] = await Promise.all([
    supabase.from('game_config').select('key, value'),
    supabase.from('game_items').select('*').order('sort_order', { ascending: true }),
    supabase.from('game_tiles').select('*').order('sort_order', { ascending: true }),
    supabase.from('game_cards').select('*').order('id', { ascending: true }),
  ]);

  if (configRes.error) throw configRes.error;
  if (itemsRes.error) throw itemsRes.error;
  if (tileRes.error) throw tileRes.error;
  if (cardRes.error) throw cardRes.error;

  state.config = readConfig(configRes.data || []);
  state.items = itemsRes.data || [];
  state.tiles = tileRes.data || [];
  state.cards = cardRes.data || [];

  renderConfig();
  renderItemOptions();
  renderItems();
  renderTiles();
  renderCards();
  clearItemForm();
  clearTileForm();
  clearCardForm();
  setStatus('Admin betöltve.');
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
    center_text: 'Szedd össze a szükséges tárgyakat vagy gyűjts pénzt.',
    lobby_note: 'Az egész csak poén, társasjátékos paródia hangulattal.',
  };
}

function readConfig(rows) {
  const merged = fallbackConfig();
  for (const row of rows) {
    if (!row?.key) continue;
    merged[row.key] = valueFromConfig(row.value);
  }
  return merged;
}

function renderConfig() {
  const config = { ...fallbackConfig(), ...state.config };
  els.cfgGameTitle.value = config.game_title ?? '';
  els.cfgGameSubtitle.value = config.game_subtitle ?? '';
  els.cfgCurrencyName.value = config.currency_name ?? 'Ft';
  els.cfgStartingMoney.value = config.starting_money ?? 3000;
  els.cfgStartBonus.value = config.start_bonus ?? 400;
  els.cfgWinMoney.value = config.win_money ?? 10000;
  els.cfgRequiredItems.value = config.required_items ?? 4;
  els.cfgCenterText.value = config.center_text ?? '';
  els.cfgLobbyNote.value = config.lobby_note ?? '';

  const extra = { ...config };
  delete extra.game_title;
  delete extra.game_subtitle;
  delete extra.currency_name;
  delete extra.starting_money;
  delete extra.start_bonus;
  delete extra.win_money;
  delete extra.required_items;
  delete extra.center_text;
  delete extra.lobby_note;
  els.cfgExtraJson.value = JSON.stringify(extra, null, 2);
}

function renderItemOptions() {
  const options = ['<option value="">-- nincs --</option>']
    .concat(state.items.map((item) => `<option value="${item.id}">${escapeHtml(item.icon || '🎁')} ${escapeHtml(item.name || '')}</option>`));
  els.tileItemId.innerHTML = options.join('');
  els.cardItemId.innerHTML = options.join('');
}

function renderItems() {
  els.itemList.innerHTML = state.items.map((item) => `
    <div class="admin-item ${Number(els.itemId.value) === Number(item.id) ? 'active' : ''}" data-id="${item.id}" data-kind="item">
      <div class="admin-item-head">
        <strong>${escapeHtml(item.icon || '🎁')} ${escapeHtml(item.name || '')}</strong>
        <small>${escapeHtml(item.category || '')}</small>
      </div>
      <div class="item-badges top-gap">
        <span class="tag-chip">ár: ${Number(item.price || 0)}</span>
        <span class="tag-chip">${item.required ? 'kötelező' : 'opcionális'}</span>
      </div>
    </div>
  `).join('');

  els.itemList.querySelectorAll('[data-kind="item"]').forEach((itemEl) => {
    itemEl.addEventListener('click', () => {
      const item = state.items.find((row) => Number(row.id) === Number(itemEl.dataset.id));
      if (item) fillItemForm(item);
    });
  });
}

function renderTiles() {
  els.tileList.innerHTML = state.tiles.map((tile) => `
    <div class="admin-item ${Number(els.tileId.value) === Number(tile.id) ? 'active' : ''}" data-id="${tile.id}" data-kind="tile">
      <div class="admin-item-head">
        <strong>#${Number(tile.sort_order ?? 0)} ${escapeHtml(tile.icon || '✨')} ${escapeHtml(tile.name || '')}</strong>
        <small>${escapeHtml(tile.kind || '')}</small>
      </div>
      <div class="item-badges top-gap">
        <span class="tag-chip">rövid: ${escapeHtml(tile.short_name || '-')}</span>
        <span class="tag-chip">tárgy: ${escapeHtml(itemNameFromId(tile.item_id) || '-')}</span>
      </div>
    </div>
  `).join('');

  els.tileList.querySelectorAll('[data-kind="tile"]').forEach((itemEl) => {
    itemEl.addEventListener('click', () => {
      const tile = state.tiles.find((row) => Number(row.id) === Number(itemEl.dataset.id));
      if (tile) fillTileForm(tile);
    });
  });
}

function renderCards() {
  els.cardList.innerHTML = state.cards.map((card) => `
    <div class="admin-item ${Number(els.cardId.value) === Number(card.id) ? 'active' : ''}" data-id="${card.id}" data-kind="card">
      <div class="admin-item-head">
        <strong>${escapeHtml(card.title || '')}</strong>
        <small>${escapeHtml(card.card_group || 'chance')}</small>
      </div>
      <div class="item-badges top-gap">
        <span class="tag-chip">pénz: ${Number(card.amount || 0)}</span>
        <span class="tag-chip">tárgy: ${escapeHtml(itemNameFromId(card.item_id) || '-')}</span>
      </div>
    </div>
  `).join('');

  els.cardList.querySelectorAll('[data-kind="card"]').forEach((itemEl) => {
    itemEl.addEventListener('click', () => {
      const card = state.cards.find((row) => Number(row.id) === Number(itemEl.dataset.id));
      if (card) fillCardForm(card);
    });
  });
}

function clearItemForm() {
  els.itemId.value = '';
  els.itemSort.value = state.items.length;
  els.itemName.value = '';
  els.itemCategory.value = '';
  els.itemPrice.value = 0;
  els.itemIcon.value = '🎁';
  els.itemRequired.checked = true;
  els.itemBlurb.value = '';
  els.itemEffect.value = '{}';
  renderItems();
}

function fillItemForm(item) {
  els.itemId.value = item.id;
  els.itemSort.value = item.sort_order ?? 0;
  els.itemName.value = item.name ?? '';
  els.itemCategory.value = item.category ?? '';
  els.itemPrice.value = item.price ?? 0;
  els.itemIcon.value = item.icon ?? '';
  els.itemRequired.checked = item.required !== false;
  els.itemBlurb.value = item.blurb ?? '';
  els.itemEffect.value = prettyJson(item.effect);
  renderItems();
}

function clearTileForm() {
  els.tileId.value = '';
  els.tileSort.value = state.tiles.length;
  els.tileName.value = '';
  els.tileShortName.value = '';
  els.tileIcon.value = '✨';
  els.tileKind.value = 'neutral';
  els.tileColorKey.value = '';
  els.tileAmount.value = 0;
  els.tilePrice.value = 0;
  els.tileCardGroup.value = 'chance';
  els.tileItemId.value = '';
  els.tileSkipTurns.value = 0;
  els.tileMoveSteps.value = 0;
  els.tileDescription.value = '';
  els.tileEffect.value = '{}';
  renderTiles();
}

function fillTileForm(tile) {
  els.tileId.value = tile.id;
  els.tileSort.value = tile.sort_order ?? 0;
  els.tileName.value = tile.name ?? '';
  els.tileShortName.value = tile.short_name ?? '';
  els.tileIcon.value = tile.icon ?? '';
  els.tileKind.value = tile.kind ?? 'neutral';
  els.tileColorKey.value = tile.color_key ?? '';
  els.tileAmount.value = tile.amount ?? 0;
  els.tilePrice.value = tile.price ?? 0;
  els.tileCardGroup.value = tile.card_group ?? 'chance';
  els.tileItemId.value = tile.item_id ?? '';
  els.tileSkipTurns.value = tile.skip_turns ?? 0;
  els.tileMoveSteps.value = tile.move_steps ?? 0;
  els.tileDescription.value = tile.description ?? '';
  els.tileEffect.value = prettyJson(tile.effect);
  renderTiles();
}

function clearCardForm() {
  els.cardId.value = '';
  els.cardGroup.value = 'chance';
  els.cardTitle.value = '';
  els.cardAmount.value = 0;
  els.cardSkipTurns.value = 0;
  els.cardMoveSteps.value = 0;
  els.cardItemId.value = '';
  els.cardBody.value = '';
  els.cardEffect.value = '{}';
  renderCards();
}

function fillCardForm(card) {
  els.cardId.value = card.id;
  els.cardGroup.value = card.card_group ?? 'chance';
  els.cardTitle.value = card.title ?? '';
  els.cardAmount.value = card.amount ?? 0;
  els.cardSkipTurns.value = card.skip_turns ?? 0;
  els.cardMoveSteps.value = card.move_steps ?? 0;
  els.cardItemId.value = card.item_id ?? '';
  els.cardBody.value = card.body ?? '';
  els.cardEffect.value = prettyJson(card.effect);
  renderCards();
}

async function saveConfig() {
  let extra = {};
  try {
    extra = parseJson(els.cfgExtraJson.value);
  } catch (error) {
    alert(error.message || error);
    return;
  }

  const payload = {
    game_title: els.cfgGameTitle.value.trim(),
    game_subtitle: els.cfgGameSubtitle.value.trim(),
    currency_name: els.cfgCurrencyName.value.trim() || 'Ft',
    starting_money: Number(els.cfgStartingMoney.value || 0),
    start_bonus: Number(els.cfgStartBonus.value || 0),
    win_money: Number(els.cfgWinMoney.value || 0),
    required_items: Number(els.cfgRequiredItems.value || 0),
    center_text: els.cfgCenterText.value.trim(),
    lobby_note: els.cfgLobbyNote.value.trim(),
    ...extra,
  };

  for (const [key, value] of Object.entries(payload)) {
    const res = await supabase.from('game_config').upsert({ key, value: { value } }, { onConflict: 'key' });
    if (res.error) {
      setStatus(res.error.message);
      return;
    }
  }

  setStatus('Globális beállítások elmentve.');
  await loadAll();
}

async function saveItem() {
  let effect = {};
  try {
    effect = parseJson(els.itemEffect.value);
  } catch (error) {
    alert(error.message || error);
    return;
  }

  const payload = {
    sort_order: Number(els.itemSort.value || 0),
    name: els.itemName.value.trim(),
    category: els.itemCategory.value.trim(),
    price: Number(els.itemPrice.value || 0),
    icon: els.itemIcon.value.trim(),
    required: els.itemRequired.checked,
    blurb: els.itemBlurb.value.trim(),
    effect,
  };

  if (!payload.name) {
    alert('Adj nevet a tárgynak.');
    return;
  }

  const id = Number(els.itemId.value || 0);
  const query = id
    ? supabase.from('game_items').update(payload).eq('id', id)
    : supabase.from('game_items').insert(payload);

  const res = await query;
  if (res.error) {
    setStatus(res.error.message);
    return;
  }

  setStatus('Tárgy elmentve.');
  await loadAll();
}

async function deleteItem() {
  const id = Number(els.itemId.value || 0);
  if (!id) return;
  if (!confirm('Biztos törlöd ezt a tárgyat?')) return;
  const res = await supabase.from('game_items').delete().eq('id', id);
  if (res.error) {
    setStatus(res.error.message);
    return;
  }
  setStatus('Tárgy törölve.');
  await loadAll();
}

async function saveTile() {
  let effect = {};
  try {
    effect = parseJson(els.tileEffect.value);
  } catch (error) {
    alert(error.message || error);
    return;
  }

  const payload = {
    sort_order: Number(els.tileSort.value || 0),
    name: els.tileName.value.trim(),
    short_name: els.tileShortName.value.trim(),
    icon: els.tileIcon.value.trim(),
    kind: els.tileKind.value,
    color_key: els.tileColorKey.value.trim(),
    amount: Number(els.tileAmount.value || 0),
    price: Number(els.tilePrice.value || 0),
    card_group: els.tileCardGroup.value.trim() || 'chance',
    item_id: nullableNumber(els.tileItemId.value),
    skip_turns: Number(els.tileSkipTurns.value || 0),
    move_steps: Number(els.tileMoveSteps.value || 0),
    description: els.tileDescription.value.trim(),
    effect,
  };

  if (!payload.name) {
    alert('Adj nevet a mezőnek.');
    return;
  }

  const id = Number(els.tileId.value || 0);
  const query = id
    ? supabase.from('game_tiles').update(payload).eq('id', id)
    : supabase.from('game_tiles').insert(payload);

  const res = await query;
  if (res.error) {
    setStatus(res.error.message);
    return;
  }

  setStatus('Mező elmentve.');
  await loadAll();
}

async function deleteTile() {
  const id = Number(els.tileId.value || 0);
  if (!id) return;
  if (!confirm('Biztos törlöd ezt a mezőt?')) return;
  const res = await supabase.from('game_tiles').delete().eq('id', id);
  if (res.error) {
    setStatus(res.error.message);
    return;
  }
  setStatus('Mező törölve.');
  await loadAll();
}

async function saveCard() {
  let effect = {};
  try {
    effect = parseJson(els.cardEffect.value);
  } catch (error) {
    alert(error.message || error);
    return;
  }

  const payload = {
    card_group: els.cardGroup.value.trim() || 'chance',
    title: els.cardTitle.value.trim(),
    amount: Number(els.cardAmount.value || 0),
    skip_turns: Number(els.cardSkipTurns.value || 0),
    move_steps: Number(els.cardMoveSteps.value || 0),
    item_id: nullableNumber(els.cardItemId.value),
    body: els.cardBody.value.trim(),
    effect,
  };

  if (!payload.title) {
    alert('Adj címet a kártyának.');
    return;
  }

  const id = Number(els.cardId.value || 0);
  const query = id
    ? supabase.from('game_cards').update(payload).eq('id', id)
    : supabase.from('game_cards').insert(payload);

  const res = await query;
  if (res.error) {
    setStatus(res.error.message);
    return;
  }

  setStatus('Kártya elmentve.');
  await loadAll();
}

async function deleteCard() {
  const id = Number(els.cardId.value || 0);
  if (!id) return;
  if (!confirm('Biztos törlöd ezt a kártyát?')) return;
  const res = await supabase.from('game_cards').delete().eq('id', id);
  if (res.error) {
    setStatus(res.error.message);
    return;
  }
  setStatus('Kártya törölve.');
  await loadAll();
}

function itemNameFromId(id) {
  const item = state.items.find((row) => Number(row.id) === Number(id));
  return item?.name || '';
}

function nullableNumber(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
}

function setStatus(message) {
  els.adminStatus.textContent = message;
}

function parseJson(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error('Hibás JSON.');
  }
}

function prettyJson(value) {
  try {
    return JSON.stringify(typeof value === 'string' ? JSON.parse(value) : (value || {}), null, 2);
  } catch {
    return '{}';
  }
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
