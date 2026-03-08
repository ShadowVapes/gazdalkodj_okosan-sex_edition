import { SUPABASE_URL, SUPABASE_ANON_KEY, DEMO_MODE } from './config.js';

const supabase = !DEMO_MODE && window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

const els = Object.fromEntries([...document.querySelectorAll('[id]')].map((el) => [el.id, el]));
const state = {
  config: fallbackConfig(),
  items: [],
  tiles: [],
  cards: [],
  filters: { item: '', tile: '', card: '' },
};

init();

async function init() {
  bindEvents();
  updatePreviews();
  if (!supabase) {
    setStatus('Nincs beállítva a Supabase.');
    return;
  }
  try {
    await loadAll();
  } catch (error) {
    console.error(error);
    setStatus(readableError(error));
  }
}

function bindEvents() {
  els.saveConfigBtn?.addEventListener('click', saveConfig);
  els.newItemBtn?.addEventListener('click', clearItemForm);
  els.saveItemBtn?.addEventListener('click', saveItem);
  els.deleteItemBtn?.addEventListener('click', deleteItem);
  els.newTileBtn?.addEventListener('click', clearTileForm);
  els.saveTileBtn?.addEventListener('click', saveTile);
  els.deleteTileBtn?.addEventListener('click', deleteTile);
  els.newCardBtn?.addEventListener('click', clearCardForm);
  els.saveCardBtn?.addEventListener('click', saveCard);
  els.deleteCardBtn?.addEventListener('click', deleteCard);

  [['itemImageFile', 'itemImageUrl'], ['tileImageFile', 'tileImageUrl'], ['cardImageFile', 'cardImageUrl']].forEach(([fileId, urlId]) => {
    els[fileId]?.addEventListener('change', async () => {
      const file = els[fileId].files?.[0];
      if (!file) return;
      els[urlId].value = await fileToDataUrl(file);
      updatePreviews();
    });
  });

  [
    'itemName', 'itemIcon', 'itemAccentColor', 'itemTextColor', 'itemImageUrl', 'itemBlurb',
    'tileName', 'tileShortName', 'tileIcon', 'tileAccentColor', 'tileTextColor', 'tileImageUrl', 'tileDescription', 'tileColorKey',
    'cardTitle', 'cardIcon', 'cardAccentColor', 'cardTextColor', 'cardImageUrl', 'cardBody',
  ].forEach((id) => els[id]?.addEventListener('input', updatePreviews));

  [['itemSearch', 'item'], ['tileSearch', 'tile'], ['cardSearch', 'card']].forEach(([id, key]) => {
    els[id]?.addEventListener('input', () => {
      state.filters[key] = els[id].value.trim().toLowerCase();
      if (key === 'item') renderItems();
      if (key === 'tile') renderTiles();
      if (key === 'card') renderCards();
    });
  });
}

async function loadAll() {
  const [configRes, itemsRes, tilesRes, cardsRes] = await Promise.all([
    supabase.from('game_config').select('key, value'),
    supabase.from('game_items').select('*').order('sort_order', { ascending: true }),
    supabase.from('game_tiles').select('*').order('sort_order', { ascending: true }),
    supabase.from('game_cards').select('*').order('id', { ascending: true }),
  ]);

  if (configRes.error) throw configRes.error;
  if (itemsRes.error) throw itemsRes.error;
  if (tilesRes.error) throw tilesRes.error;
  if (cardsRes.error) throw cardsRes.error;

  state.config = readConfig(configRes.data || []);
  state.items = itemsRes.data || [];
  state.tiles = tilesRes.data || [];
  state.cards = cardsRes.data || [];

  renderConfig();
  renderItemOptions();
  renderItems();
  renderTiles();
  renderCards();

  if (!els.itemId.value) clearItemForm();
  else fillItemForm(state.items.find((row) => Number(row.id) === Number(els.itemId.value)));
  if (!els.tileId.value) clearTileForm();
  else fillTileForm(state.tiles.find((row) => Number(row.id) === Number(els.tileId.value)));
  if (!els.cardId.value) clearCardForm();
  else fillCardForm(state.cards.find((row) => Number(row.id) === Number(els.cardId.value)));

  setStatus('Admin betöltve.');
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
    lobby_note: 'Az egész poén, társasjátékos hangulattal.',
    event_overlay_ms: 3500,
    card_overlay_ms: 3500,
  };
}

function readConfig(rows) {
  const merged = fallbackConfig();
  for (const row of rows) if (row?.key) merged[row.key] = valueFromConfig(row.value);
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
  els.cfgEventOverlayMs.value = config.event_overlay_ms ?? 3500;
  els.cfgCardOverlayMs.value = config.card_overlay_ms ?? 3500;
  els.cfgCenterText.value = config.center_text ?? '';
  els.cfgLobbyNote.value = config.lobby_note ?? '';
  const extra = { ...config };
  ['game_title', 'game_subtitle', 'currency_name', 'starting_money', 'start_bonus', 'win_money', 'required_items', 'event_overlay_ms', 'card_overlay_ms', 'center_text', 'lobby_note'].forEach((k) => delete extra[k]);
  els.cfgExtraJson.value = JSON.stringify(extra, null, 2);
}

function renderItemOptions() {
  const options = ['<option value="">-- nincs --</option>'].concat(
    state.items.map((item) => `<option value="${item.id}">${escapeHtml(item.icon || '🎁')} ${escapeHtml(item.name || '')}</option>`),
  );
  els.tileItemId.innerHTML = options.join('');
  els.cardItemId.innerHTML = options.join('');
}

function renderItems() {
  const activeId = Number(els.itemId.value || 0);
  const rows = state.items.filter((item) => matchesFilter(item, state.filters.item, ['name', 'category', 'icon', 'blurb']));
  els.itemCount.textContent = `${rows.length} db`;
  els.itemList.innerHTML = rows.map((item) => `
    <button type="button" class="admin-item admin-clickable ${activeId === Number(item.id) ? 'active' : ''}" data-id="${item.id}" data-kind="item">
      <div class="admin-item-head"><strong>${escapeHtml(item.icon || '🎁')} ${escapeHtml(item.name || '')}</strong><small>${escapeHtml(item.category || '')}</small></div>
      <div class="item-badges top-gap">
        <span class="tag-chip">ár: ${Number(item.price || 0)}</span>
        <span class="tag-chip">${item.required ? 'kötelező' : 'opcionális'}</span>
      </div>
      <div class="microcopy">${escapeHtml(item.blurb || 'Nincs rövid leírás.')}</div>
    </button>
  `).join('') || '<div class="empty-state-box">Nincs találat a tárgyaknál.</div>';
  els.itemSelectedLabel.textContent = activeId ? (itemNameFromId(activeId) || 'Kiválasztott tárgy') : 'Új tárgy';
  els.itemList.querySelectorAll('[data-kind="item"]').forEach((el) => el.addEventListener('click', () => fillItemForm(state.items.find((row) => Number(row.id) === Number(el.dataset.id)))));
}

function renderTiles() {
  const activeId = Number(els.tileId.value || 0);
  const rows = state.tiles.filter((tile) => matchesFilter(tile, state.filters.tile, ['name', 'short_name', 'kind', 'description', 'icon']));
  els.tileCount.textContent = `${rows.length} db`;
  els.tileList.innerHTML = rows.map((tile) => `
    <button type="button" class="admin-item admin-clickable ${activeId === Number(tile.id) ? 'active' : ''}" data-id="${tile.id}" data-kind="tile">
      <div class="admin-item-head"><strong>#${Number(tile.sort_order ?? 0)} ${escapeHtml(tile.icon || '✨')} ${escapeHtml(tile.name || '')}</strong><small>${escapeHtml(tile.kind || '')}</small></div>
      <div class="item-badges top-gap">
        <span class="tag-chip">rövid: ${escapeHtml(tile.short_name || '-')}</span>
        <span class="tag-chip">tárgy: ${escapeHtml(itemNameFromId(tile.item_id) || '-')}</span>
      </div>
      <div class="microcopy">${escapeHtml(tile.description || 'Nincs mezőleírás.')}</div>
    </button>
  `).join('') || '<div class="empty-state-box">Nincs találat a mezőknél.</div>';
  els.tileSelectedLabel.textContent = activeId ? (state.tiles.find((row) => Number(row.id) === activeId)?.name || 'Kiválasztott mező') : 'Új mező';
  els.tileList.querySelectorAll('[data-kind="tile"]').forEach((el) => el.addEventListener('click', () => fillTileForm(state.tiles.find((row) => Number(row.id) === Number(el.dataset.id)))));
}

function renderCards() {
  const activeId = Number(els.cardId.value || 0);
  const rows = state.cards.filter((card) => matchesFilter(card, state.filters.card, ['title', 'card_group', 'icon', 'body']));
  els.cardCount.textContent = `${rows.length} db`;
  els.cardList.innerHTML = rows.map((card) => `
    <button type="button" class="admin-item admin-clickable ${activeId === Number(card.id) ? 'active' : ''}" data-id="${card.id}" data-kind="card">
      <div class="admin-item-head"><strong>${escapeHtml(card.icon || '💌')} ${escapeHtml(card.title || '')}</strong><small>${escapeHtml(card.card_group || 'chance')}</small></div>
      <div class="item-badges top-gap">
        <span class="tag-chip">pénz: ${Number(card.amount || 0)}</span>
        <span class="tag-chip">tárgy: ${escapeHtml(itemNameFromId(card.item_id) || '-')}</span>
      </div>
      <div class="microcopy">${escapeHtml(card.body || 'Nincs leírás.')}</div>
    </button>
  `).join('') || '<div class="empty-state-box">Nincs találat a kártyáknál.</div>';
  els.cardSelectedLabel.textContent = activeId ? (state.cards.find((row) => Number(row.id) === activeId)?.title || 'Kiválasztott kártya') : 'Új kártya';
  els.cardList.querySelectorAll('[data-kind="card"]').forEach((el) => el.addEventListener('click', () => fillCardForm(state.cards.find((row) => Number(row.id) === Number(el.dataset.id)))));
}

function clearItemForm() {
  els.itemId.value = '';
  els.itemSort.value = state.items.length;
  els.itemName.value = '';
  els.itemCategory.value = '';
  els.itemPrice.value = 0;
  els.itemIcon.value = '🎁';
  els.itemRequired.checked = true;
  els.itemAccentColor.value = '#f7e7b1';
  els.itemTextColor.value = '#311814';
  els.itemBlurb.value = '';
  els.itemImageUrl.value = '';
  els.itemImageFile.value = '';
  els.itemEffect.value = '{}';
  renderItems();
  updatePreviews();
}

function fillItemForm(item) {
  if (!item) return;
  els.itemId.value = item.id;
  els.itemSort.value = item.sort_order ?? 0;
  els.itemName.value = item.name ?? '';
  els.itemCategory.value = item.category ?? '';
  els.itemPrice.value = item.price ?? 0;
  els.itemIcon.value = item.icon ?? '';
  els.itemRequired.checked = item.required !== false;
  els.itemAccentColor.value = normalizeColor(item.accent_color, '#f7e7b1');
  els.itemTextColor.value = normalizeColor(item.text_color, '#311814');
  els.itemBlurb.value = item.blurb ?? '';
  els.itemImageUrl.value = item.image_url ?? '';
  els.itemImageFile.value = '';
  els.itemEffect.value = prettyJson(item.effect);
  renderItems();
  updatePreviews();
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
  els.tileAccentColor.value = '#f7e7b1';
  els.tileTextColor.value = '#311814';
  els.tileDescription.value = '';
  els.tileImageUrl.value = '';
  els.tileImageFile.value = '';
  els.tileEffect.value = '{}';
  renderTiles();
  updatePreviews();
}

function fillTileForm(tile) {
  if (!tile) return;
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
  els.tileAccentColor.value = normalizeColor(tile.accent_color, '#f7e7b1');
  els.tileTextColor.value = normalizeColor(tile.text_color, '#311814');
  els.tileDescription.value = tile.description ?? '';
  els.tileImageUrl.value = tile.image_url ?? '';
  els.tileImageFile.value = '';
  els.tileEffect.value = prettyJson(tile.effect);
  renderTiles();
  updatePreviews();
}

function clearCardForm() {
  els.cardId.value = '';
  els.cardGroup.value = 'chance';
  els.cardTitle.value = '';
  els.cardAmount.value = 0;
  els.cardSkipTurns.value = 0;
  els.cardMoveSteps.value = 0;
  els.cardItemId.value = '';
  els.cardIcon.value = '💌';
  els.cardAccentColor.value = '#ffd8e8';
  els.cardTextColor.value = '#311814';
  els.cardBody.value = '';
  els.cardImageUrl.value = '';
  els.cardImageFile.value = '';
  els.cardEffect.value = '{}';
  renderCards();
  updatePreviews();
}

function fillCardForm(card) {
  if (!card) return;
  els.cardId.value = card.id;
  els.cardGroup.value = card.card_group ?? 'chance';
  els.cardTitle.value = card.title ?? '';
  els.cardAmount.value = card.amount ?? 0;
  els.cardSkipTurns.value = card.skip_turns ?? 0;
  els.cardMoveSteps.value = card.move_steps ?? 0;
  els.cardItemId.value = card.item_id ?? '';
  els.cardIcon.value = card.icon ?? '💌';
  els.cardAccentColor.value = normalizeColor(card.accent_color, '#ffd8e8');
  els.cardTextColor.value = normalizeColor(card.text_color, '#311814');
  els.cardBody.value = card.body ?? '';
  els.cardImageUrl.value = card.image_url ?? '';
  els.cardImageFile.value = '';
  els.cardEffect.value = prettyJson(card.effect);
  renderCards();
  updatePreviews();
}

function updatePreviews() {
  if (els.itemPreview) els.itemPreview.innerHTML = buildPreviewHtml(els.itemName.value || 'Tárgy', els.itemIcon.value || '🎁', els.itemBlurb.value || 'Leírás', els.itemAccentColor.value, els.itemTextColor.value, els.itemImageUrl.value);
  if (els.tilePreview) els.tilePreview.innerHTML = buildPreviewHtml(els.tileShortName.value || els.tileName.value || 'Mező', els.tileIcon.value || '✨', els.tileDescription.value || 'Mező leírás', els.tileAccentColor.value, els.tileTextColor.value, els.tileImageUrl.value);
  if (els.cardPreview) els.cardPreview.innerHTML = buildPreviewHtml(els.cardTitle.value || 'Kártya', els.cardIcon.value || '💌', els.cardBody.value || 'Kártya szöveg', els.cardAccentColor.value, els.cardTextColor.value, els.cardImageUrl.value);
}

function buildPreviewHtml(title, icon, text, bg, color, image) {
  const style = `background:${bg};color:${color};${image ? `background-image:url('${escapeAttr(image)}');background-size:cover;background-position:center;` : ''}`;
  return `<div class="preview-card" style="${style}"><div class="preview-overlay"><div class="preview-icon">${escapeHtml(icon)}</div><strong>${escapeHtml(title)}</strong><div>${escapeHtml(text)}</div></div></div>`;
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
    event_overlay_ms: Number(els.cfgEventOverlayMs.value || 3500),
    card_overlay_ms: Number(els.cfgCardOverlayMs.value || 3500),
    center_text: els.cfgCenterText.value.trim(),
    lobby_note: els.cfgLobbyNote.value.trim(),
    ...extra,
  };
  for (const [key, value] of Object.entries(payload)) {
    const res = await supabase.from('game_config').upsert({ key, value: { value } }, { onConflict: 'key' });
    if (res.error) {
      setStatus(readableError(res.error));
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
    image_url: els.itemImageUrl.value.trim(),
    accent_color: els.itemAccentColor.value,
    text_color: els.itemTextColor.value,
    effect,
  };
  if (!payload.name) return alert('Adj nevet a tárgynak.');
  const id = Number(els.itemId.value || 0);
  const res = await (id ? supabase.from('game_items').update(payload).eq('id', id) : supabase.from('game_items').insert(payload));
  if (res.error) return setStatus(readableError(res.error));
  setStatus('Tárgy elmentve.');
  await loadAll();
}

async function deleteItem() {
  const id = Number(els.itemId.value || 0);
  if (!id || !confirm('Biztos törlöd ezt a tárgyat?')) return;
  const res = await supabase.from('game_items').delete().eq('id', id);
  if (res.error) return setStatus(readableError(res.error));
  clearItemForm();
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
    image_url: els.tileImageUrl.value.trim(),
    accent_color: els.tileAccentColor.value,
    text_color: els.tileTextColor.value,
    effect,
  };
  if (!payload.name) return alert('Adj nevet a mezőnek.');
  const id = Number(els.tileId.value || 0);
  const res = await (id ? supabase.from('game_tiles').update(payload).eq('id', id) : supabase.from('game_tiles').insert(payload));
  if (res.error) return setStatus(readableError(res.error));
  setStatus('Mező elmentve.');
  await loadAll();
}

async function deleteTile() {
  const id = Number(els.tileId.value || 0);
  if (!id || !confirm('Biztos törlöd ezt a mezőt?')) return;
  const res = await supabase.from('game_tiles').delete().eq('id', id);
  if (res.error) return setStatus(readableError(res.error));
  clearTileForm();
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
    icon: els.cardIcon.value.trim(),
    image_url: els.cardImageUrl.value.trim(),
    accent_color: els.cardAccentColor.value,
    text_color: els.cardTextColor.value,
    effect,
  };
  if (!payload.title) return alert('Adj címet a kártyának.');
  const id = Number(els.cardId.value || 0);
  const res = await (id ? supabase.from('game_cards').update(payload).eq('id', id) : supabase.from('game_cards').insert(payload));
  if (res.error) return setStatus(readableError(res.error));
  setStatus('Kártya elmentve.');
  await loadAll();
}

async function deleteCard() {
  const id = Number(els.cardId.value || 0);
  if (!id || !confirm('Biztos törlöd ezt a kártyát?')) return;
  const res = await supabase.from('game_cards').delete().eq('id', id);
  if (res.error) return setStatus(readableError(res.error));
  clearCardForm();
  setStatus('Kártya törölve.');
  await loadAll();
}

function matchesFilter(row, query, keys) {
  if (!query) return true;
  const haystack = keys.map((key) => String(row?.[key] ?? '')).join(' ').toLowerCase();
  return haystack.includes(query);
}

function itemNameFromId(id) {
  return state.items.find((row) => Number(row.id) === Number(id))?.name || '';
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
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
function escapeAttr(value) {
  return escapeHtml(value).replaceAll('\n', ' ');
}
function readableError(error) {
  const message = typeof error === 'string' ? error : (error?.message || error?.details || JSON.stringify(error));
  if (/Could not find the '([^']+)' column of '([^']+)'/i.test(message || '')) {
    const [, column, table] = message.match(/Could not find the '([^']+)' column of '([^']+)'/i) || [];
    return `Hiányzó adatbázis oszlop: ${table}.${column}. Futtasd le a zipben lévő sql/migrate_v4.sql fájlt a Supabase SQL Editorban.`;
  }
  return message || 'Ismeretlen hiba.';
}
function normalizeColor(value, fallback) {
  const v = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback;
}
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
